import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { PayPalClient, PayPalError, getInvoice, getOrder, getPayoutBatch, listTransactions, toCents } from "@plex/paypal";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { generateStructured, HEURISTIC } from "./lib/ai";
import { isSeedId } from "./lib/taskRules";

/**
 * Reconcile with PayPal: an agent re-reads each recent receipt's money straight
 * from PayPal by its ids (the order with its holds, captures and refunds; the
 * payout batch; the invoice) and code compares amounts and states with what
 * Plex recorded. Gemini only writes the summary. If the app has the Transaction
 * Search permission, PayPal's own transaction list is checked too.
 */

type Row = {
  receiptId: Id<"receipts">;
  label: string;
  plexCents: number;
  plexState: string;
  paypalCents?: number;
  paypalState?: string;
  source: string; // what was read at PayPal
  ok: boolean;
  note: string;
};

export const recent = internalQuery({
  args: { userId: v.id("users"), limit: v.number() },
  handler: async (ctx, { userId, limit }) => {
    const rows = await ctx.db
      .query("receipts")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(limit * 3);
    return rows.filter((r) => r.paypal && Object.values(r.paypal).some((id) => typeof id === "string" && !isSeedId(id))).slice(0, limit);
  },
});

function message(err: unknown) {
  if (err instanceof PayPalError) return `PayPal ${err.status}${err.name_ ? ` ${err.name_}` : ""}`;
  return err instanceof Error ? err.message : String(err);
}

type OrderRead = Awaited<ReturnType<typeof getOrder>> & {
  purchase_units: Array<{ payments?: { refunds?: Array<{ id: string; status: string; amount: { value: string } }> } }>;
};

/** One receipt, checked against PayPal's own record of the same money. */
async function check(pp: PayPalClient, r: Doc<"receipts">, orders: Map<string, OrderRead>): Promise<Row> {
  const p = r.paypal ?? {};
  const base = { receiptId: r._id, label: `${r.payerLabel} → ${r.payeeLabel}`, plexCents: r.amountCents, plexState: r.state };
  try {
    if (p.invoiceId) {
      const inv = (await getInvoice(pp, p.invoiceId)) as { status?: string; amount?: { value?: string }; payments?: { paid_amount?: { value?: string } } };
      const paid = inv.payments?.paid_amount?.value ? toCents(inv.payments.paid_amount.value) : undefined;
      const status = (inv.status ?? "?").toUpperCase();
      const ok = r.state === "paid" ? status === "PAID" || status === "MARKED_AS_PAID" : true;
      return { ...base, paypalCents: paid ?? (inv.amount?.value ? toCents(inv.amount.value) : undefined), paypalState: status.toLowerCase(), source: `invoice ${p.invoiceId}`, ok, note: ok ? "Invoice status matches" : `Plex says paid, PayPal says ${status.toLowerCase()}` };
    }
    if (p.orderId && !isSeedId(p.orderId)) {
      let order = orders.get(p.orderId);
      if (!order) {
        order = (await getOrder(pp, p.orderId)) as OrderRead;
        orders.set(p.orderId, order);
      }
      const pay = order.purchase_units[0]?.payments ?? {};
      const auth = pay.authorizations?.find((a) => !p.authorizationId || a.id === p.authorizationId) ?? pay.authorizations?.[0];
      const cap = pay.captures?.find((c) => !p.captureId || c.id === p.captureId) ?? pay.captures?.[0];
      const refund = (pay as OrderRead["purchase_units"][number]["payments"])?.refunds?.[0];
      // What PayPal says happened to this money, in Plex's words.
      const paypalState = refund ? "refunded" : cap?.status === "COMPLETED" ? "captured" : auth?.status === "VOIDED" ? "voided" : auth ? "held" : order.status.toLowerCase();
      const paypalCents = cap ? toCents(cap.amount.value) : auth ? toCents(auth.amount.value) : undefined;
      const expect: Record<string, string[]> = {
        held: ["held"],
        pending: ["held", "created", "approved", "payer_action_required"],
        funded: ["captured"],
        released: ["captured"],
        paid: ["captured"],
        refunded: ["voided", "refunded"],
        declined: ["voided", "refunded", "created"],
        disputed: ["captured", "refunded"],
      };
      const stateOk = (expect[r.state] ?? []).includes(paypalState);
      // A partial capture (the accepted bid) is fine: it can't exceed the receipt.
      const amountOk = paypalCents === undefined || paypalCents <= r.amountCents + 1 || r.kind === "payout";
      const ok = stateOk && amountOk;
      return {
        ...base,
        paypalCents,
        paypalState,
        source: `order ${p.orderId}`,
        ok,
        note: ok
          ? paypalCents !== undefined && paypalCents < r.amountCents && paypalState === "captured"
            ? `Captured ${(paypalCents / 100).toFixed(2)} of the ${(r.amountCents / 100).toFixed(2)} held; the rest was never charged`
            : "Matches PayPal"
          : !stateOk
            ? `Plex says ${r.state}, PayPal says ${paypalState}`
            : `Amount differs: Plex ${(r.amountCents / 100).toFixed(2)}, PayPal ${((paypalCents ?? 0) / 100).toFixed(2)}`,
      };
    }
    if (p.payoutBatchId && !isSeedId(p.payoutBatchId)) {
      const batch = await getPayoutBatch(pp, p.payoutBatchId);
      const item = batch.items?.find((i) => !p.payoutItemId || i.payout_item_id === p.payoutItemId) ?? batch.items?.[0];
      const status = (item?.transaction_status ?? batch.batch_header.batch_status).toUpperCase();
      const sent = item ? toCents(item.payout_item.amount.value) : undefined;
      const sentByPlex = r.split?.find((l) => l.via === "payout")?.cents ?? r.amountCents;
      const ok = (sent === undefined || sent === sentByPlex) && !["FAILED", "RETURNED", "BLOCKED", "DENIED"].includes(status);
      return { ...base, paypalCents: sent, paypalState: status.toLowerCase(), source: `payout ${p.payoutBatchId}`, ok, note: ok ? `Payout ${status.toLowerCase()}` : `Payout ${status.toLowerCase()}${sent !== sentByPlex ? `; PayPal sent ${((sent ?? 0) / 100).toFixed(2)}` : ""}` };
    }
    return { ...base, source: "none", ok: true, note: "Nothing at PayPal to check" };
  } catch (err) {
    // A checkout nobody finished: PayPal deletes unapproved orders after a few hours.
    if (err instanceof PayPalError && err.status === 404 && r.state === "pending")
      return { ...base, paypalState: "expired", source: p.orderId ?? "?", ok: true, note: "Checkout never finished; PayPal let the order expire, nothing was charged" };
    return { ...base, source: p.orderId ?? p.payoutBatchId ?? p.invoiceId ?? "?", ok: false, note: `Couldn't read it at PayPal (${message(err)})` };
  }
}

const summarySchema = z.object({ summary: z.string().describe("Two or three plain sentences for the account owner") });

export const run = action({
  args: { as: v.optional(v.string()) },
  handler: async (ctx, { as }) => {
    if (!PayPalClient.isConfigured()) throw new ConvexError("PayPal isn't configured on this deployment.");
    const userId: Id<"users"> = await ctx.runQuery(internal.autopay.actorId, { as });
    const receipts: Doc<"receipts">[] = await ctx.runQuery(internal.reconcile.recent, { userId, limit: 25 });
    const pp = PayPalClient.fromEnv();
    const orders = new Map<string, OrderRead>();
    const rows: Row[] = [];
    for (const r of receipts) rows.push(await check(pp, r, orders));

    // PayPal's own transaction list, when the app has the Transaction Search permission.
    let ledger: { available: boolean; count?: number; matched?: number; note: string };
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 86_400_000);
      const iso = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;
      const t = await listTransactions(pp, { startDate: iso(start), endDate: iso(end), pageSize: 200 });
      const ids = new Set(
        (t.transaction_details as Array<{ transaction_info?: { transaction_id?: string; paypal_reference_id?: string } }>).flatMap((x) => [x.transaction_info?.transaction_id, x.transaction_info?.paypal_reference_id]).filter(Boolean) as string[],
      );
      const ours = receipts.flatMap((r) => [r.paypal?.captureId, r.paypal?.refundId, r.paypal?.authorizationId]).filter((x): x is string => Boolean(x && !isSeedId(x)));
      const matched = ours.filter((id) => ids.has(id)).length;
      ledger = { available: true, count: t.transaction_details.length, matched, note: `PayPal's transaction list (30 days, up to 3 hours behind) has ${t.transaction_details.length} entries; ${matched} of Plex's ${ours.length} ids are in it.` };
    } catch (err) {
      ledger = {
        available: false,
        note: err instanceof PayPalError && err.status === 403 ? "Transaction Search isn't enabled for this PayPal app, so each record was read directly by its id instead." : `PayPal's transaction list didn't answer (${message(err)}).`,
      };
    }

    const problems = rows.filter((r) => !r.ok);
    const r = await generateStructured({
      name: "reconcile-summary",
      schema: summarySchema,
      system: "You summarize a reconciliation between an app's payment receipts and PayPal's records. Plain, specific, no reassurance you can't back up. The numbers given are facts computed by code; don't change them.",
      prompt: JSON.stringify({
        checked: rows.length,
        matched: rows.length - problems.length,
        problems: problems.map((p) => `${p.label}: ${p.note}`),
        partialCaptures: rows.filter((x) => x.note.startsWith("Captured")).length,
        transactionList: ledger.note,
      }),
      fallback: () => ({
        summary: problems.length
          ? `${problems.length} of ${rows.length} receipts don't match PayPal: ${problems.map((p) => p.note).join("; ")}.`
          : `All ${rows.length} receipts match what PayPal recorded.`,
      }),
    });
    return {
      checkedAt: Date.now(),
      checked: rows.length,
      matched: rows.length - problems.length,
      rows,
      ledger,
      summary: r.object.summary,
      model: r.model === HEURISTIC ? "heuristic" : r.model,
    };
  },
});
