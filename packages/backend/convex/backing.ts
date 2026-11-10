import { ConvexError, v } from "convex/values";
import { PayPalClient, PayPalError, approvalUrl, authorizeOrder, captureAuthorization, createOrder, getOrder, refundCapture, voidAuthorization } from "@plex/paypal";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getActor, requireActor } from "./lib/actor";
import { isDigitalTask } from "./lib/hire";
import { formatCents } from "./lib/money";
import { advanceReceipt, writeReceipt } from "./lib/receipts";
import { fundingCents } from "./lib/taskRules";

/**
 * Back a task: an organization opens a task for work in the world ("Serve 60
 * hot meals at the shelter on Saturday") to donors. Each donor's gift is a
 * PayPal hold (Orders v2 AUTHORIZE, from their saved wallet or a checkout),
 * never a charge. When the holds reach the goal the task opens for a worker.
 * When its photo proof passes, Plex captures every hold together and pays the
 * worker; if it doesn't, every hold is voided and nobody is charged. Each
 * donor's receipt then carries the proof photos of what their money bought.
 */

const MIN_GIFT = 100;
const MAX_GIFT = 500_00;

function paypalMessage(err: unknown): string {
  if (err instanceof PayPalError) return `PayPal ${err.name_ ?? err.status}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

async function rowsFor(ctx: { db: QueryCtx["db"] }, taskId: Id<"tasks">) {
  return ctx.db
    .query("backings")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
}

const counted = (b: Doc<"backings">) => b.state === "held" || b.state === "captured" || b.state === "pending";

// ── Reading ──────────────────────────────────────────────────────────────────

/** Proof photos of a task's latest passing proof, for donors to see what their money bought. */
async function proofPhotos(ctx: QueryCtx, task: Doc<"tasks">) {
  const proof = await ctx.db
    .query("proofs")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .order("desc")
    .first();
  if (!proof) return { photos: [], verdict: null, at: null };
  const photos: { label: string; url: string }[] = [];
  for (const it of proof.items) {
    const spec = task.proofSpec[it.specIndex];
    if (!it.storageId || !spec || (spec.type !== "photo" && spec.type !== "file")) continue;
    const url = await ctx.storage.getUrl(it.storageId);
    if (url) photos.push({ label: spec.label, url });
  }
  return {
    photos,
    verdict: proof.verdict ? { result: proof.verdict.result, confidence: proof.verdict.confidence, summary: proof.verdict.summary } : null,
    at: proof._creationTime,
  };
}

async function card(ctx: QueryCtx, task: Doc<"tasks">) {
  const rows = await rowsFor(ctx, task._id);
  const live = rows.filter((b) => b.state === "held" || b.state === "captured");
  const poster = await ctx.db.get(task.posterId);
  const worker = task.assigneeId ? await ctx.db.get(task.assigneeId) : null;
  const goal = task.backing?.goalCents ?? fundingCents(task.payout);
  const raised = live.reduce((s, b) => s + b.amountCents, 0);
  return {
    _id: task._id,
    title: task.title,
    description: task.description,
    story: task.backing?.story,
    place: task.location?.label,
    windowStart: task.windowStart,
    windowEnd: task.windowEnd,
    status: task.status,
    goalCents: goal,
    raisedCents: raised,
    backers: new Set(live.map((b) => b.donorId)).size,
    org: poster ? { name: poster.name, handle: poster.handle, color: poster.avatarColor } : null,
    worker: worker ? { name: worker.name } : null,
    proofSpec: task.proofSpec.map((s) => ({ label: s.label, description: s.description, type: s.type })),
    ...(task.status === "paid" || task.status === "approved" ? await proofPhotos(ctx, task) : { photos: [], verdict: null, at: null }),
  };
}

/** Tasks open to backing, then ones in progress or done. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const tasks = (await ctx.db.query("tasks").order("desc").take(400)).filter((t) => t.backing && t.status !== "cancelled" && t.status !== "refunded");
    const cards = await Promise.all(tasks.map((t) => card(ctx, t)));
    const rank = (s: string) => (s === "draft" ? 0 : s === "paid" ? 2 : 1);
    return cards.sort((a, b) => rank(a.status) - rank(b.status));
  },
});

/** The donor's gifts and what became of them: held, charged with photos, or voided. */
export const mine = query({
  args: { as: v.optional(v.string()) },
  handler: async (ctx, { as }) => {
    const actor = await getActor(ctx, as);
    if (!actor) return [];
    const rows = await ctx.db
      .query("backings")
      .withIndex("by_donor", (q) => q.eq("donorId", actor.user._id))
      .order("desc")
      .take(30);
    const out = [];
    for (const b of rows.filter((r) => r.state !== "pending" && r.state !== "declined")) {
      const task = await ctx.db.get(b.taskId);
      if (!task) continue;
      out.push({ _id: b._id, amountCents: b.amountCents, state: b.state, receiptId: b.receiptId, at: b._creationTime, task: await card(ctx, task) });
    }
    return out;
  },
});

/** An organization's drafts it could open for backing (work in the world, not yet funded). */
export const myDrafts = query({
  args: { as: v.optional(v.string()) },
  handler: async (ctx, { as }) => {
    const actor = await getActor(ctx, as);
    if (!actor) return [];
    const tasks = await ctx.db.query("tasks").order("desc").take(400);
    return tasks
      .filter((t) => t.posterId === actor.user._id && t.status === "draft" && t.funding.state === "unfunded" && !t.backing && !isDigitalTask(t))
      .map((t) => ({ _id: t._id, title: t.title, goalCents: fundingCents(t.payout) }));
  },
});

// ── Opening a task to backers ────────────────────────────────────────────────

export const open = mutation({
  args: { taskId: v.id("tasks"), story: v.optional(v.string()), as: v.optional(v.string()) },
  handler: async (ctx, { taskId, story, as }) => {
    const { user } = await requireActor(ctx, as);
    const task = await ctx.db.get(taskId);
    if (!task || task.posterId !== user._id) throw new ConvexError("Only the task's poster can open it for backing.");
    if (task.status !== "draft" || task.funding.state !== "unfunded") throw new ConvexError("Only an unfunded draft can be opened for backing.");
    if (isDigitalTask(task)) throw new ConvexError("Backing is for work in the world, proven with photos.");
    await ctx.db.patch(taskId, {
      backing: { goalCents: fundingCents(task.payout), story: story?.trim().slice(0, 400) || undefined, openedAt: Date.now() },
      workerType: "human",
    });
  },
});

// ── Giving ───────────────────────────────────────────────────────────────────

export const begin = internalMutation({
  args: { taskId: v.id("tasks"), amountCents: v.number(), message: v.optional(v.string()), as: v.optional(v.string()), donorId: v.optional(v.id("users")) },
  handler: async (ctx, { taskId, amountCents, message, as, donorId }) => {
    const user = donorId ? (await ctx.db.get(donorId))! : (await requireActor(ctx, as)).user;
    if (donorId && user.agentsPaused) throw new ConvexError(`${user.name} has paused their agents.`);
    const task = await ctx.db.get(taskId);
    if (!task?.backing) throw new ConvexError("This task isn't open for backing.");
    if (task.status !== "draft") throw new ConvexError("This task is fully backed already.");
    if (task.posterId === user._id) throw new ConvexError("You posted this task; others back it.");
    const rows = await rowsFor(ctx, taskId);
    // Stale checkouts nobody finished don't hold a place for long.
    const live = rows.filter((b) => counted(b) && !(b.state === "pending" && Date.now() - b._creationTime > 15 * 60_000));
    const remaining = task.backing.goalCents - live.reduce((s, b) => s + b.amountCents, 0);
    if (remaining < MIN_GIFT) throw new ConvexError("This task is fully backed already.");
    const cents = Math.min(Math.round(amountCents), remaining);
    if (!(cents >= MIN_GIFT && cents <= MAX_GIFT)) throw new ConvexError("Give $1 to $500.");
    const backingId = await ctx.db.insert("backings", {
      taskId,
      donorId: user._id,
      donorName: user.name,
      amountCents: cents,
      message: message?.trim().slice(0, 200) || undefined,
      state: "pending",
    });
    return { backingId, cents, donorId: user._id, title: task.title, currency: task.currency, clamped: cents < amountCents };
  },
});

export const attach = internalMutation({
  args: { backingId: v.id("backings"), orderId: v.string(), via: v.union(v.literal("checkout"), v.literal("autopay")) },
  handler: async (ctx, { backingId, orderId, via }) => {
    await ctx.db.patch(backingId, { orderId, via });
  },
});

export const forget = internalMutation({
  args: { backingId: v.id("backings") },
  handler: async (ctx, { backingId }) => {
    const b = await ctx.db.get(backingId);
    if (b?.state === "pending") await ctx.db.patch(backingId, { state: "declined" });
  },
});

/** A hold is in place: the donor's receipt, and the task opens once the goal is met. */
export const markHeld = internalMutation({
  args: { backingId: v.id("backings"), authorizationId: v.string(), payerEmail: v.optional(v.string()) },
  handler: async (ctx, { backingId, authorizationId, payerEmail }) => {
    const b = await ctx.db.get(backingId);
    if (!b || b.state !== "pending") return;
    const task = await ctx.db.get(b.taskId);
    if (!task?.backing) return;
    const org = await ctx.db.get(task.posterId);
    const receiptId = await writeReceipt(ctx, {
      kind: "task_funding",
      amountCents: b.amountCents,
      currency: task.currency,
      ownerId: b.donorId,
      payerId: b.donorId,
      payerLabel: b.donorName,
      payeeLabel: org ? `${org.name} (held by Plex)` : "Plex (held)",
      why: `Backed “${task.title}”${b.message ? `: “${b.message}”` : ""}`,
      rule: { source: "proof", text: "Held, not charged: you pay only if the work's photo proof passes" },
      category: "Giving",
      taskId: task._id,
      state: "held",
      paypal: { orderId: b.orderId, authorizationId },
      timelineLabel: `Held from ${payerEmail ?? "your PayPal"}${b.via === "autopay" ? " by auto-pay, no popup" : ""}; charged only if the proof passes`,
    });
    await ctx.db.patch(backingId, { state: "held", authorizationId, receiptId });
    const held = (await rowsFor(ctx, task._id)).filter((x) => x.state === "held").reduce((s, x) => s + x.amountCents, 0);
    // Fully backed: the task opens for a worker, its money already held by its backers.
    if (held >= task.backing.goalCents && task.status === "draft")
      await ctx.db.patch(task._id, { status: "open", funding: { state: "authorized", via: "backers" } });
  },
});

/** Give toward a task: held from the saved PayPal wallet (auto-pay), or approved at PayPal. */
export const back = action({
  args: { taskId: v.id("tasks"), amountCents: v.number(), message: v.optional(v.string()), origin: v.string(), as: v.optional(v.string()) },
  handler: (ctx, { as, ...a }) => give(ctx, a, { as }),
});

/** The same, for an agent with its owner's API key: always inside the owner's auto-pay limits, or an approval link. */
export const backFor = internalAction({
  args: { taskId: v.id("tasks"), amountCents: v.number(), message: v.optional(v.string()), origin: v.string(), donorId: v.id("users") },
  handler: (ctx, { donorId, ...a }) => give(ctx, a, { donorId }),
});

async function give(
  ctx: import("./_generated/server").ActionCtx,
  { taskId, amountCents, message, origin }: { taskId: Id<"tasks">; amountCents: number; message?: string; origin: string },
  who: { as?: string; donorId?: Id<"users"> },
): Promise<{ held: true; cents: number } | { approveUrl: string; cents: number }> {
  {
    if (!/^https?:\/\/[^/]+$/.test(origin)) throw new ConvexError("Bad origin");
    if (!PayPalClient.isConfigured()) throw new ConvexError("PayPal isn't configured on this deployment.");
    const b = await ctx.runMutation(internal.backing.begin, { taskId, amountCents, message, ...who });
    const pp = PayPalClient.fromEnv();
    const description = `Backing on Plex: ${b.title}`.slice(0, 120);

    // Auto-pay, inside the donor's own limits: held right here, no popup.
    const r = await ctx.runMutation(internal.autopay.reserve, { userId: b.donorId, amountCents: b.cents });
    if (!("skip" in r)) {
      try {
        let order = await createOrder(pp, { amountCents: b.cents, currency: b.currency, intent: "AUTHORIZE", description, referenceId: b.backingId, vaultId: r.vaultId, idempotencyKey: `back-${b.backingId}` });
        await ctx.runMutation(internal.backing.attach, { backingId: b.backingId, orderId: order.id, via: "autopay" });
        if (!order.purchase_units[0]?.payments?.authorizations?.length) order = await authorizeOrder(pp, order.id, `back-auth-${order.id}`);
        const auth = order.purchase_units[0]?.payments?.authorizations?.[0];
        if (!auth || auth.status === "DENIED") throw new Error("PayPal didn't authorize the saved wallet");
        await ctx.runMutation(internal.backing.markHeld, { backingId: b.backingId, authorizationId: auth.id, payerEmail: order.payer?.email_address });
        return { held: true, cents: b.cents };
      } catch (err) {
        await ctx.runMutation(internal.autopay.unreserve, { userId: b.donorId, amountCents: b.cents });
        console.warn("[backing] auto-pay failed, falling back to checkout:", paypalMessage(err));
      }
    }
    try {
      const order = await createOrder(pp, {
        amountCents: b.cents,
        currency: b.currency,
        intent: "AUTHORIZE",
        description,
        referenceId: b.backingId,
        returnUrl: `${origin}/give?backing=${b.backingId}&paypal=return`,
        cancelUrl: `${origin}/give?backing=${b.backingId}&paypal=cancel`,
        idempotencyKey: `back-checkout-${b.backingId}`,
      });
      const url = approvalUrl(order);
      if (!url) throw new Error("PayPal didn't return an approval link");
      await ctx.runMutation(internal.backing.attach, { backingId: b.backingId, orderId: order.id, via: "checkout" });
      return { approveUrl: url, cents: b.cents };
    } catch (err) {
      await ctx.runMutation(internal.backing.forget, { backingId: b.backingId });
      throw new ConvexError(paypalMessage(err));
    }
  }
}

export const backingFor = internalQuery({
  args: { backingId: v.id("backings") },
  handler: (ctx, { backingId }) => ctx.db.get(backingId),
});

/** Back from PayPal checkout: authorize the approved order into a hold. */
export const confirm = action({
  args: { backingId: v.id("backings"), as: v.optional(v.string()) },
  handler: async (ctx, { backingId, as }): Promise<{ state: "held" | "not_approved" | "already" }> => {
    const userId: Id<"users"> = await ctx.runQuery(internal.autopay.actorId, { as });
    const b = await ctx.runQuery(internal.backing.backingFor, { backingId });
    if (!b || b.donorId !== userId) throw new ConvexError("Gift not found.");
    if (b.state !== "pending") return { state: "already" };
    if (!b.orderId) return { state: "not_approved" };
    const pp = PayPalClient.fromEnv();
    try {
      let order = await getOrder(pp, b.orderId);
      if (order.status === "APPROVED") order = await authorizeOrder(pp, b.orderId, `back-auth-${b.orderId}`);
      const auth = order.purchase_units[0]?.payments?.authorizations?.[0];
      if (!auth) return { state: "not_approved" };
      await ctx.runMutation(internal.backing.markHeld, { backingId, authorizationId: auth.id, payerEmail: order.payer?.email_address });
      return { state: "held" };
    } catch (err) {
      throw new ConvexError(paypalMessage(err));
    }
  },
});

// ── Settling: all holds together ─────────────────────────────────────────────

export const heldFor = internalQuery({
  args: { taskId: v.id("tasks"), includeCaptured: v.optional(v.boolean()) },
  handler: async (ctx, { taskId, includeCaptured }) =>
    (await rowsFor(ctx, taskId)).filter((b) => b.state === "held" || (includeCaptured && b.state === "captured")),
});

export const settled = internalMutation({
  args: { backingId: v.id("backings"), state: v.union(v.literal("captured"), v.literal("voided")), captureId: v.optional(v.string()), label: v.string() },
  handler: async (ctx, { backingId, state, captureId, label }) => {
    const b = await ctx.db.get(backingId);
    if (!b || (b.state !== "held" && !(b.state === "captured" && state === "voided"))) return;
    await ctx.db.patch(backingId, { state, captureId });
    if (b.receiptId)
      await advanceReceipt(ctx, b.receiptId, state === "captured" ? "released" : "refunded", label, captureId ? { paypal: { captureId } } : {});
  },
});

/** The proof passed: capture every donor's hold. Returns the total captured. */
export const captureAll = internalAction({
  args: { taskId: v.id("tasks"), workerName: v.string() },
  handler: async (ctx, { taskId, workerName }): Promise<number> => {
    const rows: Doc<"backings">[] = await ctx.runQuery(internal.backing.heldFor, { taskId });
    const pp = PayPalClient.fromEnv();
    let total = 0;
    for (const b of rows) {
      const cap = await captureAuthorization(pp, b.authorizationId!, { amountCents: b.amountCents, idempotencyKey: `back-capture-${b._id}` });
      await ctx.runMutation(internal.backing.settled, {
        backingId: b._id,
        state: "captured",
        captureId: cap.id,
        label: `The photo proof passed: charged ${formatCents(b.amountCents)}, paid to ${workerName} for the work`,
      });
      total += b.amountCents;
    }
    return total;
  },
});

/** The task was cancelled or its proof failed: void every hold (and refund any charge already made). Nobody pays. */
export const voidAll = internalAction({
  args: { taskId: v.id("tasks"), reason: v.string() },
  handler: async (ctx, { taskId, reason }) => {
    const rows: Doc<"backings">[] = await ctx.runQuery(internal.backing.heldFor, { taskId, includeCaptured: true });
    const pp = PayPalClient.fromEnv();
    for (const b of rows) {
      try {
        if (b.state === "captured" && b.captureId) await refundCapture(pp, b.captureId, { note: reason, idempotencyKey: `back-refund-${b._id}` });
        else await voidAuthorization(pp, b.authorizationId!);
      } catch (err) {
        console.warn("[backing] void/refund failed", paypalMessage(err));
      }
      await ctx.runMutation(internal.backing.settled, {
        backingId: b._id,
        state: "voided",
        label: b.state === "captured" ? `${reason}: refunded to your PayPal` : `${reason}: your hold was voided, you were never charged`,
      });
    }
  },
});
