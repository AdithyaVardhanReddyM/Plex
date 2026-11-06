import { v } from "convex/values";
import { PayPalClient, verifyWebhook, webhookHeadersFrom } from "@plex/paypal";
import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { advanceReceipt } from "./lib/receipts";

/**
 * PayPal webhooks for the whole app (route in `http.ts`: POST /paypal/webhook).
 *
 * 1. Verify the signature with PayPal (needs PAYPAL_WEBHOOK_ID).
 * 2. Store the event in `webhookEvents`, idempotent by PayPal's event id.
 * 3. Apply it: tasks and receipts move to what PayPal says.
 *
 * Unverified events are stored for inspection but never applied. Set
 * PAYPAL_WEBHOOK_SKIP_VERIFY=1 only for local replays with the simulator.
 * Registration steps: docs/paypal-webhooks.md.
 */

type Event = {
  id?: string;
  event_type?: string;
  resource?: Record<string, any>;
};

export const paypalWebhook = httpAction(async (ctx, req) => {
  const raw = await req.text();
  let event: Event;
  try {
    event = JSON.parse(raw) as Event;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (!event.id || !event.event_type) return new Response("Not a PayPal event", { status: 400 });

  let verified = false;
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const headers = webhookHeadersFrom((n) => req.headers.get(n));
  if (process.env.PAYPAL_WEBHOOK_SKIP_VERIFY === "1") verified = true;
  else if (webhookId && headers && PayPalClient.isConfigured()) {
    try {
      verified = await verifyWebhook(PayPalClient.fromEnv(), { webhookId, headers, event });
    } catch (err) {
      console.warn("[webhook] verification call failed", err);
    }
  }

  const resource = event.resource ?? {};
  const isNew: boolean = await ctx.runMutation(internal.webhooks.record, {
    eventId: event.id,
    eventType: event.event_type,
    resourceId: typeof resource.id === "string" ? resource.id : undefined,
    payload: event,
    verified,
  });
  if (!verified) return new Response("Stored, not verified", { status: 202 });
  if (!isNew) return new Response("Duplicate", { status: 200 });

  const type = event.event_type;
  if (type === "CHECKOUT.ORDER.APPROVED" && typeof resource.id === "string") {
    const taskId = await ctx.runMutation(internal.webhooks.taskForOrder, { orderId: resource.id });
    if (taskId)
      await ctx.scheduler.runAfter(0, internal.taskMoney.confirmFundingInternal, { taskId, orderId: resource.id });
  } else if (type.startsWith("PAYMENT.CAPTURE.")) {
    await ctx.runMutation(internal.webhooks.applyCapture, {
      eventType: type,
      captureId: String(resource.id ?? ""),
      orderId: resource.supplementary_data?.related_ids?.order_id,
      authorizationId: resource.supplementary_data?.related_ids?.authorization_id,
    });
  } else if (type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    const senderItemId = resource.payout_item?.sender_item_id;
    const receiptId = senderItemId ? await ctx.runMutation(internal.webhooks.normalizeReceiptId, { id: senderItemId }) : null;
    if (receiptId)
      await ctx.runMutation(internal.taskMoney.applyPayoutStatus, {
        receiptId,
        status: String(resource.transaction_status ?? type.split(".").pop()),
        itemId: resource.payout_item_id,
      });
  }
  // Plex for Mac: routines with a PayPal trigger for this event get a queued run, with what
  // happened (who paid, how much) so the run can act on it.
  const invoice = (resource.invoice as Record<string, any> | undefined) ?? (type.startsWith("INVOICING.") ? resource : undefined);
  const amount = invoice?.payments?.paid_amount ?? invoice?.amount ?? resource.amount;
  const invoiceId = typeof invoice?.id === "string" ? invoice.id : undefined;
  let trigger: Record<string, unknown> = {
    event: type,
    amount: amount?.value ? `${amount.value} ${amount.currency_code ?? amount.currency ?? ""}`.trim() : undefined,
    payerEmail: invoice?.primary_recipients?.[0]?.billing_info?.email_address,
    payerName: invoice?.primary_recipients?.[0]?.billing_info?.name?.full_name
      ?? [invoice?.primary_recipients?.[0]?.billing_info?.name?.given_name, invoice?.primary_recipients?.[0]?.billing_info?.name?.surname].filter(Boolean).join(" "),
    invoiceNumber: invoice?.detail?.invoice_number,
    note: invoice?.detail?.note,
  };
  if (type === "INVOICING.INVOICE.PAID" && invoiceId) {
    const paid = await ctx.runMutation(internal.agentMoney.invoicePaid, {
      invoiceId,
      reference: invoice?.detail?.reference,
      paidCents: amount?.value ? Math.round(Number(amount.value) * 100) : undefined,
    });
    if (paid) trigger = { ...trigger, plex: paid };
  }
  await ctx.runMutation(internal.routines.queueForPaypalEvent, {
    eventType: type,
    resourceId: typeof resource.id === "string" ? resource.id : invoiceId,
    summary: typeof trigger.amount === "string" ? trigger.amount : undefined,
    trigger,
  });
  await ctx.runMutation(internal.webhooks.markProcessed, { eventId: event.id });
  return new Response("OK", { status: 200 });
});

/** Returns true when the event is new. */
export const record = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    resourceId: v.optional(v.string()),
    payload: v.any(),
    verified: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (existing) {
      if (args.verified && !existing.verified) await ctx.db.patch(existing._id, { verified: true });
      return !existing.processedAt;
    }
    await ctx.db.insert("webhookEvents", args);
    return true;
  },
});

export const markProcessed = internalMutation({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const e = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique();
    if (e) await ctx.db.patch(e._id, { processedAt: Date.now() });
  },
});

export const taskForOrder = internalMutation({
  args: { orderId: v.string() },
  handler: async (ctx, { orderId }) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_orderId", (q) => q.eq("funding.orderId", orderId))
      .first();
    return task && task.funding.state === "unfunded" ? task._id : null;
  },
});

export const normalizeReceiptId = internalMutation({
  args: { id: v.string() },
  handler: async (ctx, { id }): Promise<Id<"receipts"> | null> => {
    const norm = ctx.db.normalizeId("receipts", id);
    return norm && (await ctx.db.get(norm)) ? norm : null;
  },
});

/** PAYMENT.CAPTURE.COMPLETED / DENIED / REFUNDED / REVERSED for task funding. */
export const applyCapture = internalMutation({
  args: {
    eventType: v.string(),
    captureId: v.string(),
    orderId: v.optional(v.string()),
    authorizationId: v.optional(v.string()),
  },
  handler: async (ctx, { eventType, captureId, orderId }) => {
    if (!orderId) return;
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_orderId", (q) => q.eq("funding.orderId", orderId))
      .first();
    if (!task) return;
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();
    const funding = receipts.find((r) => r.kind === "task_funding");
    const note = (label: string) =>
      funding && !funding.timeline.some((t) => t.label === label)
        ? ctx.db.patch(funding._id, { timeline: [...funding.timeline, { at: Date.now(), label, state: funding.state }] })
        : null;

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      if (task.funding.state === "authorized")
        await ctx.db.patch(task._id, { funding: { ...task.funding, state: "captured", captureId } });
      await note("PayPal confirmed the capture");
    } else if (eventType === "PAYMENT.CAPTURE.DENIED") {
      await note("PayPal denied the capture");
    } else if (eventType === "PAYMENT.CAPTURE.REFUNDED" || eventType === "PAYMENT.CAPTURE.REVERSED") {
      if (task.funding.state !== "refunded") {
        await ctx.db.patch(task._id, { status: "refunded", funding: { ...task.funding, state: "refunded" } });
        if (funding && funding.state !== "refunded")
          await advanceReceipt(ctx, funding._id, "refunded", eventType.endsWith("REVERSED") ? "Reversed by PayPal" : "PayPal confirmed the refund");
      }
    }
  },
});
