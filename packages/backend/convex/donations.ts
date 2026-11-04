import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  PayPalClient,
  PayPalError,
  approvalUrl,
  captureOrder,
  createOrder,
  getOrder,
  toCents,
  type Order,
} from "@plex/paypal";
import { advanceReceipt, writeReceipt } from "./lib/receipts";
import { formatCents } from "./lib/money";
import { getViewer } from "./lib/viewer";
import { reelCaption, templateCaption, type ReelFacts } from "./lib/causesAi";
import { donorWallLabel, taskCostCents } from "./causes";

/**
 * Donations. One PayPal order (intent CAPTURE) per checkout, which may be
 * split across several causes. On capture each slice gets a `donations` row
 * and a `donation` receipt: `held` when it funds a task (released when that
 * task's proof passes, see `releaseForTask`), `paid` otherwise.
 */

const MIN_CENTS = 100;
const MAX_CENTS = 1_000_000;

const allocation = v.object({
  causeId: v.id("causes"),
  taskId: v.optional(v.id("tasks")),
  amountCents: v.number(),
});

// ── Checkout ─────────────────────────────────────────────────────────────────

export const createCheckout = internalMutation({
  args: {
    returnSlug: v.string(),
    allocations: v.array(allocation),
    donorLabel: v.optional(v.string()),
    anonymous: v.optional(v.boolean()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new ConvexError("Run `pnpm seed` first: there is no demo donor yet.");
    if (!args.allocations.length) throw new ConvexError("Choose a cause to give to.");
    if (args.allocations.length > 6) throw new ConvexError("Split across at most 6 causes.");

    const names: string[] = [];
    const seen = new Set<string>();
    for (const a of args.allocations) {
      if (!Number.isInteger(a.amountCents) || a.amountCents < MIN_CENTS)
        throw new ConvexError(`Each gift must be at least ${formatCents(MIN_CENTS)}.`);
      const key = `${a.causeId}:${a.taskId ?? ""}`;
      if (seen.has(key)) throw new ConvexError("Each cause appears once in a split.");
      seen.add(key);
      const cause = await ctx.db.get(a.causeId);
      if (!cause || cause.status !== "live") throw new ConvexError("That cause isn't taking donations.");
      if (a.taskId) {
        const task = await ctx.db.get(a.taskId);
        if (!task || task.causeId !== a.causeId) throw new ConvexError("That task isn't part of this cause.");
        if (!["open", "assigned"].includes(task.status))
          throw new ConvexError("That shift is already under way, so it can't take new funding.");
        const funded = (await ctx.db
          .query("donations")
          .withIndex("by_task", (q) => q.eq("taskId", task._id))
          .collect()).reduce((s, d) => s + d.amountCents, 0);
        const remaining = taskCostCents(task).total - funded;
        if (remaining <= 0) throw new ConvexError("That shift is already fully funded. Pick another one.");
        if (a.amountCents > remaining)
          throw new ConvexError(`That shift needs ${formatCents(remaining)} more, so give up to that.`);
        names.push(task.title);
      } else {
        names.push(cause.name);
      }
    }
    const totalCents = args.allocations.reduce((s, a) => s + a.amountCents, 0);
    if (totalCents > MAX_CENTS) throw new ConvexError(`Gifts over ${formatCents(MAX_CENTS)} go through the NGO directly.`);

    const label = args.anonymous
      ? "Anonymous"
      : donorWallLabel(args.donorLabel?.trim().slice(0, 40) || viewer.user.name);
    const message = args.message?.trim().slice(0, 280) || undefined;

    const checkoutId = await ctx.db.insert("donationCheckouts", {
      donorId: viewer.user._id,
      donorLabel: label,
      message,
      returnSlug: args.returnSlug,
      allocations: args.allocations,
      totalCents,
      currency: "USD",
      status: "created",
    });
    const description =
      names.length === 1 ? `Plex Causes: ${names[0]}` : `Plex Causes: split across ${names.length} causes`;
    return { checkoutId, totalCents, description };
  },
});

export const attachOrder = internalMutation({
  args: { checkoutId: v.id("donationCheckouts"), orderId: v.string() },
  handler: async (ctx, { checkoutId, orderId }) => {
    await ctx.db.patch(checkoutId, { paypalOrderId: orderId, status: "approving" });
  },
});

export const failCheckout = internalMutation({
  args: { checkoutId: v.id("donationCheckouts"), error: v.string() },
  handler: async (ctx, { checkoutId, error }) => {
    const c = await ctx.db.get(checkoutId);
    if (c && c.status !== "completed") await ctx.db.patch(checkoutId, { status: "failed", error });
  },
});

export const getCheckout = internalQuery({
  args: { checkoutId: v.id("donationCheckouts") },
  handler: (ctx, { checkoutId }) => ctx.db.get(checkoutId),
});

function paypalMessage(err: unknown) {
  if (err instanceof PayPalError) {
    return `PayPal said no (${err.name_ ?? err.status}). ${err.debugId ? `Debug ID ${err.debugId}.` : ""}`.trim();
  }
  return err instanceof Error ? err.message : String(err);
}

/** Creates the sandbox PayPal order and returns where to send the donor. */
export const start = action({
  args: {
    returnSlug: v.string(),
    origin: v.string(),
    allocations: v.array(allocation),
    donorLabel: v.optional(v.string()),
    anonymous: v.optional(v.boolean()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { origin, ...args }): Promise<{ checkoutId: Id<"donationCheckouts">; approvalUrl: string }> => {
    if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin)) throw new ConvexError("Bad return address.");
    if (!PayPalClient.isConfigured()) {
      throw new ConvexError(
        "PayPal sandbox isn't configured on this deployment. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in Convex.",
      );
    }
    const { checkoutId, totalCents, description } = await ctx.runMutation(internal.donations.createCheckout, args);
    try {
      const pp = PayPalClient.fromEnv();
      const slug = encodeURIComponent(args.returnSlug);
      const order = await createOrder(pp, {
        intent: "CAPTURE",
        amountCents: totalCents,
        description,
        referenceId: checkoutId,
        brandName: "Plex Causes",
        returnUrl: `${origin}/c/${slug}/thanks?checkout=${checkoutId}`,
        cancelUrl: `${origin}/c/${slug}?cancelled=1`,
        idempotencyKey: `plex-donate-${checkoutId}`,
      });
      const url = approvalUrl(order);
      if (!url) throw new Error("PayPal returned no approval link.");
      await ctx.runMutation(internal.donations.attachOrder, { checkoutId, orderId: order.id });
      return { checkoutId, approvalUrl: url };
    } catch (err) {
      const msg = paypalMessage(err);
      await ctx.runMutation(internal.donations.failCheckout, { checkoutId, error: msg });
      throw new ConvexError(msg);
    }
  },
});

function completedCapture(order: Order) {
  const capture = order.purchase_units[0]?.payments?.captures?.find((c) => c.status === "COMPLETED");
  return capture ? { id: capture.id, cents: toCents(capture.amount.value) } : null;
}

/** After PayPal sends the donor back: capture the order and write the receipts. */
export const complete = action({
  args: { checkoutId: v.id("donationCheckouts"), token: v.optional(v.string()) },
  handler: async (ctx, { checkoutId, token }): Promise<{ donationIds: Id<"donations">[] }> => {
    const checkout = await ctx.runQuery(internal.donations.getCheckout, { checkoutId });
    if (!checkout) throw new ConvexError("We couldn't find that donation.");
    if (checkout.status === "completed") {
      return { donationIds: await ctx.runQuery(internal.donations.idsForCheckout, { checkoutId }) };
    }
    if (!checkout.paypalOrderId) throw new ConvexError("This donation never reached PayPal.");
    if (token && token !== checkout.paypalOrderId) throw new ConvexError("That PayPal order doesn't match this donation.");

    const pp = PayPalClient.fromEnv();
    let order: Order;
    try {
      order = await captureOrder(pp, checkout.paypalOrderId, `plex-capture-${checkoutId}`);
    } catch (err) {
      // A retry after a capture that already went through: read the order instead.
      if (err instanceof PayPalError && err.status === 422) {
        order = await getOrder(pp, checkout.paypalOrderId);
        if (order.status !== "COMPLETED") {
          const msg =
            order.status === "PAYER_ACTION_REQUIRED" || order.status === "CREATED"
              ? "PayPal hasn't approved this payment yet."
              : paypalMessage(err);
          throw new ConvexError(msg);
        }
      } else {
        throw new ConvexError(paypalMessage(err));
      }
    }
    const capture = completedCapture(order);
    if (!capture) throw new ConvexError(`PayPal didn't complete the payment (order ${order.status}).`);
    if (capture.cents !== checkout.totalCents) {
      await ctx.runMutation(internal.donations.failCheckout, { checkoutId, error: "Captured amount differs" });
      throw new ConvexError("PayPal captured a different amount than you chose. Nothing was recorded.");
    }
    const given = order.payer?.name?.given_name;
    const donationIds = await ctx.runMutation(internal.donations.recordCapture, {
      checkoutId,
      captureId: capture.id,
      payerName: given ? `${given} ${order.payer?.name?.surname ?? ""}`.trim() : undefined,
    });
    return { donationIds };
  },
});

export const idsForCheckout = internalQuery({
  args: { checkoutId: v.id("donationCheckouts") },
  handler: async (ctx, { checkoutId }) =>
    (await ctx.db
      .query("donations")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", checkoutId))
      .collect()).map((d) => d._id),
});

/** Writes donations, receipts and cause totals once per checkout. */
export const recordCapture = internalMutation({
  args: { checkoutId: v.id("donationCheckouts"), captureId: v.string(), payerName: v.optional(v.string()) },
  handler: async (ctx, { checkoutId, captureId, payerName }) => {
    const checkout = await ctx.db.get(checkoutId);
    if (!checkout) throw new Error("Checkout not found");
    if (checkout.status === "completed") {
      return (await ctx.db
        .query("donations")
        .withIndex("by_checkout", (q) => q.eq("checkoutId", checkoutId))
        .collect()).map((d) => d._id);
    }
    const donor = checkout.donorId ? await ctx.db.get(checkout.donorId) : null;
    if (!donor) throw new Error("Donor not found");
    const split = checkout.allocations.length > 1;
    const ids: Id<"donations">[] = [];

    for (const a of checkout.allocations) {
      const cause = await ctx.db.get(a.causeId);
      if (!cause) continue;
      const org = await ctx.db.get(cause.orgId);
      const task = a.taskId ? await ctx.db.get(a.taskId) : null;
      const what = task ? `Fund "${task.title}"` : `Give to ${cause.name}`;
      const ruleText = task
        ? `You chose this shift. Plex holds the money until its proof passes.`
        : split
          ? `You split ${formatCents(checkout.totalCents)}: ${formatCents(a.amountCents)} to ${cause.name}`
          : `You gave to ${cause.name}`;

      const receiptId = await writeReceipt(ctx, {
        kind: "donation",
        amountCents: a.amountCents,
        currency: checkout.currency,
        payerId: donor._id,
        payerLabel: donor.name,
        payeeId: cause.orgId,
        payeeLabel: org?.name ?? cause.name,
        why: checkout.message ?? what,
        rule: { source: "donor", text: ruleText },
        state: "funded",
        timelineLabel: `Captured through PayPal${payerName ? ` from ${payerName}` : ""}`,
        paypal: { orderId: checkout.paypalOrderId, captureId },
        ownerId: donor._id,
        causeId: cause._id,
        taskId: task?._id,
        category: "Giving",
      });
      await advanceReceipt(
        ctx,
        receiptId,
        task ? "held" : "paid",
        task ? "Held by Plex until the shift's proof passes" : `Paid to ${org?.name ?? cause.name}`,
      );

      const donationId = await ctx.db.insert("donations", {
        causeId: cause._id,
        donorId: donor._id,
        donorLabel: checkout.donorLabel,
        amountCents: a.amountCents,
        taskId: task?._id,
        recurring: false,
        source: "direct",
        paypalOrderId: checkout.paypalOrderId,
        paypalCaptureId: captureId,
        receiptId,
        checkoutId,
        message: checkout.message,
      });
      ids.push(donationId);
      await ctx.db.patch(cause._id, {
        raisedCents: cause.raisedCents + a.amountCents,
        donorsCount: cause.donorsCount + 1,
      });
    }
    await ctx.db.patch(checkoutId, { status: "completed", paypalCaptureId: captureId, payerName });
    return ids;
  },
});

/**
 * Called by the Tasks surface when an impact task's proof passes and its
 * workers are paid: moves every held donation receipt for that task to
 * `released`, with the proof as evidence.
 */
export const releaseForTask = internalMutation({
  args: { taskId: v.id("tasks"), proofId: v.optional(v.id("proofs")), verdict: v.optional(v.string()) },
  handler: async (ctx, { taskId, proofId, verdict }) => {
    const donations = await ctx.db
      .query("donations")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    let released = 0;
    for (const d of donations) {
      if (!d.receiptId) continue;
      const r = await ctx.db.get(d.receiptId);
      if (!r || r.state !== "held") continue;
      await advanceReceipt(ctx, r._id, "released", "Released: the shift's proof passed", {
        evidence: { proofId, verdict },
      });
      released++;
    }
    return released;
  },
});

// ── Reading ──────────────────────────────────────────────────────────────────

/** The donations from one checkout, for the thanks page. */
export const forCheckout = query({
  args: { checkoutId: v.id("donationCheckouts") },
  handler: async (ctx, { checkoutId }) => {
    const checkout = await ctx.db.get(checkoutId);
    if (!checkout) return null;
    const donations = await ctx.db
      .query("donations")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", checkoutId))
      .collect();
    const rows = await Promise.all(
      donations.map(async (d) => {
        const cause = await ctx.db.get(d.causeId);
        const task = d.taskId ? await ctx.db.get(d.taskId) : null;
        return {
          donation: d,
          receipt: d.receiptId ? await ctx.db.get(d.receiptId) : null,
          causeName: cause?.name ?? "",
          causeSlug: cause?.slug ?? "",
          taskTitle: task?.title ?? null,
          taskWindowStart: task?.windowStart ?? null,
        };
      }),
    );
    return {
      status: checkout.status,
      error: checkout.error ?? null,
      totalCents: checkout.totalCents,
      donorLabel: checkout.donorLabel,
      rows,
    };
  },
});

async function reelData(
  ctx: Parameters<typeof getViewer>[0],
  donation: Doc<"donations">,
) {
  const cause = await ctx.db.get(donation.causeId);
  if (!cause) return null;
  const org = await ctx.db.get(cause.orgId);
  const task = donation.taskId ? await ctx.db.get(donation.taskId) : null;
  const receipt = donation.receiptId ? await ctx.db.get(donation.receiptId) : null;

  let proof: Doc<"proofs"> | null = null;
  const media: Array<{ label: string; description: string; url: string | null; capturedAt?: number; lat?: number; lng?: number }> = [];
  const workers: Array<{ firstName: string; avatarColor?: string; amountCents: number; at: number; receiptId: Id<"receipts"> }> = [];
  if (task) {
    const proofs = await ctx.db
      .query("proofs")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();
    proof =
      proofs.filter((p) => p.status === "pass" || p.decision === "approved").sort((a, b) => b._creationTime - a._creationTime)[0] ??
      null;
    if (proof) {
      for (const item of proof.items) {
        const spec = task.proofSpec[item.specIndex];
        if (spec && spec.type !== "photo" && spec.type !== "video") continue;
        const url = item.storageId ? await ctx.storage.getUrl(item.storageId) : (item.url ?? null);
        media.push({
          label: spec?.label ?? `Item ${item.specIndex + 1}`,
          description: spec?.description ?? "",
          url,
          capturedAt: item.capturedAt,
          lat: item.lat,
          lng: item.lng,
        });
      }
    }
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();
    for (const r of receipts) {
      if (r.kind !== "payout" || (r.state !== "released" && r.state !== "paid")) continue;
      const payee = r.payeeId ? await ctx.db.get(r.payeeId) : null;
      workers.push({
        firstName: (payee?.name ?? r.payeeLabel).split(/\s+/)[0]!,
        avatarColor: payee?.avatarColor,
        amountCents: r.amountCents,
        at: r.occurredAt,
        receiptId: r._id,
      });
    }
  }
  const facts: ReelFacts = {
    causeName: cause.name,
    orgName: org?.name ?? "",
    taskTitle: task?.title,
    locationLabel: task?.location?.label ?? cause.location.label,
    donationCents: donation.amountCents,
    workers: workers.map((w) => ({ firstName: w.firstName, amountCents: w.amountCents })),
    proofSummary: proof?.verdict?.summary,
  };
  return { cause, org, task, receipt, proof, media, workers, facts };
}

/** The Proof Reel for one donation: built only from receipts and real proof media. */
export const reel = query({
  args: { donationId: v.id("donations") },
  handler: async (ctx, { donationId }) => {
    const donation = await ctx.db.get(donationId);
    if (!donation) return null;
    const data = await reelData(ctx, donation);
    if (!data) return null;
    const { cause, org, task, receipt, proof, media, workers, facts } = data;
    const cost = task ? taskCostCents(task) : null;
    const status: "held" | "verified" | "given" = !task ? "given" : proof && workers.length ? "verified" : "held";
    const cached = donation.reelCaption && donation.reelCaptionBy && status === "verified";
    return {
      status,
      donation: {
        _id: donation._id,
        amountCents: donation.amountCents,
        donorLabel: donorWallLabel(donation.donorLabel),
        at: donation._creationTime,
        message: donation.message ?? null,
      },
      cause: { name: cause.name, slug: cause.slug, coverHue: cause.coverHue, location: cause.location },
      org: { name: org?.name ?? "", avatarColor: org?.avatarColor },
      task: task
        ? {
            title: task.title,
            description: task.description,
            location: task.location ?? null,
            windowStart: task.windowStart,
            windowEnd: task.windowEnd,
            spots: cost?.spots ?? 1,
            perSpotCents: cost?.perSpot ?? 0,
            status: task.status,
          }
        : null,
      proof: proof
        ? {
            verdict: proof.verdict
              ? {
                  result: proof.verdict.result,
                  confidence: proof.verdict.confidence,
                  summary: proof.verdict.summary,
                  checks: proof.verdict.checks,
                  model: proof.verdict.model,
                }
              : null,
            at: proof._creationTime,
          }
        : null,
      media,
      workers,
      receipt,
      caption: cached
        ? { text: donation.reelCaption!, by: donation.reelCaptionBy! }
        : { text: templateCaption(facts), by: "template" },
    };
  },
});

export const setCaption = internalMutation({
  args: { donationId: v.id("donations"), text: v.string(), by: v.string() },
  handler: async (ctx, { donationId, text, by }) => {
    await ctx.db.patch(donationId, { reelCaption: text, reelCaptionBy: by });
  },
});

export const reelFacts = internalQuery({
  args: { donationId: v.id("donations") },
  handler: async (ctx, { donationId }) => {
    const donation = await ctx.db.get(donationId);
    if (!donation || donation.reelCaptionBy) return null;
    const data = await reelData(ctx, donation);
    if (!data || !data.proof || !data.workers.length) return null;
    return data.facts;
  },
});

/**
 * Writes the Proof Reel caption with Gemini once the proof is in. Without a
 * key it keeps the template the query already shows.
 */
export const writeCaption = action({
  args: { donationId: v.id("donations") },
  handler: async (ctx, { donationId }): Promise<string | null> => {
    const facts = await ctx.runQuery(internal.donations.reelFacts, { donationId });
    if (!facts) return null;
    const { text, by } = await reelCaption(facts);
    if (by === "template") return null;
    await ctx.runMutation(internal.donations.setCaption, { donationId, text, by });
    return by;
  },
});
