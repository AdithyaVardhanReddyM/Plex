import { ConvexError, v } from "convex/values";
import {
  PayPalClient,
  PayPalError,
  approvalUrl,
  authorizeOrder,
  captureAuthorization,
  createOrder,
  createPayout,
  getOrder,
  getPayoutBatch,
  refundCapture,
  voidAuthorization,
} from "@plex/paypal";
import { action, internalAction, internalMutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActor } from "./lib/actor";
import { formatCents } from "./lib/money";
import { evaluate } from "./lib/policy";
import { advanceReceipt, writeReceipt } from "./lib/receipts";
import { fundingCents, isSeedId } from "./lib/taskRules";
import { isDigitalTask } from "./lib/hire";
import { errandsPot } from "./tasks";

/**
 * The PayPal money engine for Plex Tasks. Order of operations, always:
 * write or advance the Receipt, call PayPal, record what PayPal said.
 *
 *  fund     Orders v2 with intent AUTHORIZE → buyer approves → authorize.
 *           Task goes `open`; the task_funding receipt is `held`.
 *  release  capture the authorization (only the payout amount) → Payouts
 *           batch to the worker's PayPal email → payout receipt `released`,
 *           then `paid` when PayPal says the item succeeded.
 *  refund   void the authorization (never charged), or refund the capture.
 *
 * Seeded demo rows carry `SEED-…` placeholder ids. They never reach the API;
 * their receipts say so. Payouts still run live for them.
 */

const fail = (msg: string): never => {
  throw new ConvexError(msg);
};

function paypalMessage(err: unknown): string {
  if (err instanceof PayPalError) {
    const details = Array.isArray(err.details)
      ? (err.details as Array<{ issue?: string; description?: string }>)
          .map((d) => d.description ?? d.issue)
          .filter(Boolean)
          .join("; ")
      : "";
    return `PayPal ${err.name_ ?? err.status}${details ? `: ${details}` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}

function paypal(): PayPalClient {
  if (!PayPalClient.isConfigured()) fail("PayPal isn't configured on this deployment (PAYPAL_CLIENT_ID / SECRET).");
  return PayPalClient.fromEnv();
}

/** The amount the worker is paid: the accepted ask, never more than what's held. */
async function payoutCentsFor(ctx: MutationCtx, task: Doc<"tasks">) {
  const held = fundingCents(task.payout);
  if (!task.assigneeId) return held;
  const apps = await ctx.db
    .query("applications")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  const accepted = apps.find((a) => a.applicantId === task.assigneeId && a.status === "accepted");
  return accepted ? Math.min(accepted.askCents, held) : held;
}

async function fundingReceipt(ctx: MutationCtx, task: Doc<"tasks">) {
  if (task.fundingReceiptId) return ctx.db.get(task.fundingReceiptId);
  const rows = await ctx.db
    .query("receipts")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  return rows.find((r) => r.kind === "task_funding") ?? null;
}

// ── Funding ──────────────────────────────────────────────────────────────────

/** Checks the poster's pot with the policy engine and writes the pending receipt. */
export const beginFunding = internalMutation({
  args: { taskId: v.id("tasks"), as: v.optional(v.string()), hour: v.number(), posterId: v.optional(v.id("users")) },
  handler: async (ctx, { taskId, as, hour, posterId }) => {
    // posterId: an API key's owner, already authenticated by the HTTP layer.
    const user = posterId ? (await ctx.db.get(posterId))! : (await requireActor(ctx, as)).user;
    const task = await ctx.db.get(taskId);
    if (!task || task.posterId !== user._id) fail("Only the poster can fund this task.");
    const t = task!;
    if (t.funding.state !== "unfunded") fail("This task is already funded.");
    if (t.status !== "draft") fail("Only drafts can be funded.");

    const amountCents = fundingCents(t.payout);
    const pot = await errandsPot(ctx, t);
    let rule: Doc<"receipts">["rule"] = { source: "poster", text: "Posted directly, no pot limits" };
    let policyNote = "No pot rules apply";
    let needsApproval = false;
    if (pot) {
      const decision = evaluate(pot.rules, {
        amountCents,
        category: "Errands",
        hour,
        spentTodayCents: pot.spentTodayCents,
        balanceCents: pot.balanceCents,
        paused: Boolean(user.agentsPaused),
      });
      if (decision.outcome === "deny") fail(`Blocked by your ${pot.name} pot: ${decision.ruleText}.`);
      if (decision.outcome === "needs_approval") {
        needsApproval = true;
        rule = {
          source: "approval",
          text: `${pot.name} pot: over “${decision.ruleText}”, so you approved it yourself at PayPal checkout`,
        };
        policyNote = `Needed your approval: ${decision.ruleText}`;
      } else {
        rule = { source: "policy", text: `${pot.name} pot: ${decision.ruleText.toLowerCase()}, paid only when proof passes` };
        policyNote = `Within your ${pot.name} rule: ${decision.ruleText}`;
      }
    }

    let receiptId = t.fundingReceiptId;
    if (!receiptId) {
      receiptId = await writeReceipt(ctx, {
        kind: "task_funding",
        amountCents,
        currency: t.currency,
        ownerId: t.posterId,
        payerId: t.posterId,
        payerLabel: user.name,
        payeeLabel: "Plex (held)",
        agentLabel: t.agentLabel,
        why: t.brief || t.title,
        rule,
        category: pot?.name ?? "Errands",
        potId: pot?._id,
        taskId: t._id,
        state: "pending",
        timelineLabel: "Checked against your rules, sent to PayPal",
      });
    }
    await ctx.db.patch(t._id, { fundingReceiptId: receiptId, policyNote, potId: pot?._id });
    return { amountCents, title: t.title, currency: t.currency, posterId: t.posterId, needsApproval };
  },
});

export const attachOrder = internalMutation({
  args: { taskId: v.id("tasks"), orderId: v.string() },
  handler: async (ctx, { taskId, orderId }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return;
    await ctx.db.patch(taskId, { funding: { ...task.funding, orderId } });
    if (task.fundingReceiptId) {
      const r = await ctx.db.get(task.fundingReceiptId);
      if (r) await ctx.db.patch(r._id, { paypal: { ...r.paypal, orderId } });
    }
  },
});

/**
 * Step 1: policy check, receipt, PayPal order (AUTHORIZE). With auto-pay on and
 * inside every limit, the hold is placed from the saved wallet right here (no
 * popup). Otherwise returns the approval URL.
 */
export const startFunding = action({
  args: { taskId: v.id("tasks"), origin: v.string(), hour: v.number(), as: v.optional(v.string()) },
  handler: (ctx, { taskId, origin, hour, as }) => openFundingOrder(ctx, { taskId, origin, hour, as }),
});

/** The same, for a task an agent posted with its API key. */
export const startFundingFor = internalAction({
  args: { taskId: v.id("tasks"), origin: v.string(), hour: v.number(), posterId: v.id("users") },
  handler: (ctx, { taskId, origin, hour, posterId }) => openFundingOrder(ctx, { taskId, origin, hour, posterId }),
});

export type FundingStart =
  | { autoPaid: true; orderId: string; note: string }
  | { autoPaid: false; approveUrl: string; orderId: string; note?: string };

async function openFundingOrder(
  ctx: ActionCtx,
  { taskId, origin, hour, as, posterId }: { taskId: Id<"tasks">; origin: string; hour: number; as?: string; posterId?: Id<"users"> },
): Promise<FundingStart> {
  if (!/^https?:\/\/[^/]+$/.test(origin)) fail("Bad return origin");
  const begun = await ctx.runMutation(internal.taskMoney.beginFunding, {
    taskId,
    as,
    hour,
    posterId,
  });
  const { amountCents, title, currency } = begun;
  const pp = paypal();

  // Auto-pay: code decides (pot rules said yes without asking, within the
  // person's own auto-pay limits), then PayPal holds it from the saved wallet.
  let note: string | undefined;
  if (begun.needsApproval) note = "Over a pot rule, so this one needs your approval at PayPal";
  else {
    const r = await ctx.runMutation(internal.autopay.reserve, { userId: begun.posterId, amountCents });
    if ("skip" in r) note = r.skip === "Auto-pay is off" ? undefined : r.skip;
    else {
      try {
        let order = await createOrder(pp, {
          amountCents,
          currency,
          intent: "AUTHORIZE",
          description: `Plex task: ${title}`,
          referenceId: taskId,
          vaultId: r.vaultId,
          idempotencyKey: `autopay-${taskId}`,
        });
        await ctx.runMutation(internal.taskMoney.attachOrder, { taskId, orderId: order.id });
        if (!order.purchase_units[0]?.payments?.authorizations?.length)
          order = await authorizeOrder(pp, order.id, `authorize-${order.id}`);
        const auth = order.purchase_units[0]?.payments?.authorizations?.[0];
        if (!auth || auth.status === "DENIED") throw new Error("PayPal didn't authorize the saved wallet");
        await ctx.runMutation(internal.taskMoney.markAuthorized, {
          taskId,
          orderId: order.id,
          authorizationId: auth.id,
          payerEmail: order.payer?.email_address,
          via: "autopay",
          limitText: r.limitText,
        });
        return { autoPaid: true, orderId: order.id, note: `Held by auto-pay (${r.limitText}); charged only when proof passes` };
      } catch (err) {
        await ctx.runMutation(internal.autopay.unreserve, { userId: begun.posterId, amountCents });
        note = `Auto-pay didn't go through (${paypalMessage(err)}), so approve this one at PayPal`;
      }
    }
  }

  try {
    const order = await createOrder(pp, {
      amountCents,
      currency,
      intent: "AUTHORIZE",
      description: `Plex task: ${title}`,
      referenceId: taskId,
      returnUrl: `${origin}/tasks/${taskId}?paypal=return`,
      cancelUrl: `${origin}/tasks/${taskId}?paypal=cancel`,
      idempotencyKey: `fund-${taskId}-${Date.now()}`,
    });
    const approveUrl = approvalUrl(order);
    if (!approveUrl) fail("PayPal didn't return an approval link.");
    await ctx.runMutation(internal.taskMoney.attachOrder, { taskId, orderId: order.id });
    return { autoPaid: false, approveUrl: approveUrl!, orderId: order.id, note };
  } catch (err) {
    if (err instanceof ConvexError) throw err;
    throw new ConvexError(paypalMessage(err));
  }
}

export const markAuthorized = internalMutation({
  args: {
    taskId: v.id("tasks"),
    orderId: v.string(),
    authorizationId: v.string(),
    payerEmail: v.optional(v.string()),
    via: v.optional(v.literal("autopay")),
    limitText: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, orderId, authorizationId, payerEmail, via, limitText }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.funding.state !== "unfunded") return false;
    await ctx.db.patch(taskId, {
      status: "open",
      funding: { state: "authorized", orderId, authorizationId, via: via ?? "checkout" },
    });
    if (!isSeedId(orderId)) await ctx.scheduler.runAfter(3_000, internal.paypalDesk.checkInternal, { taskId });
    const receipt = await fundingReceipt(ctx, task);
    if (receipt) {
      if (via === "autopay" && limitText)
        await ctx.db.patch(receipt._id, { rule: { ...receipt.rule, text: `${receipt.rule.text} · ${limitText}` } });
      await advanceReceipt(
        ctx,
        receipt._id,
        "held",
        via === "autopay"
          ? `Held by auto-pay from your saved PayPal${payerEmail ? ` (${payerEmail})` : ""}, no popup; you're only charged when proof passes`
          : `Authorized${payerEmail ? ` from ${payerEmail}` : ""}; you're only charged when proof passes`,
        { paypal: { orderId, authorizationId } },
      );
    }
    // Open to agents: the house agents start bidding (an invited one bids alone).
    if ((task.workerType ?? "human") !== "human" && isDigitalTask(task)) {
      const invited = task.invitedId ? await ctx.db.get(task.invitedId) : null;
      if (!invited || invited.kind === "agent")
        await ctx.scheduler.runAfter(2000, internal.houseAgents.runBidding, { taskId, only: invited?._id });
    }
    return true;
  },
});

/** Step 2, on return from PayPal (or from the CHECKOUT.ORDER.APPROVED webhook). */
export const confirmFunding = action({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }): Promise<{ state: "authorized" | "not_approved" | "already" }> => {
    const task = await ctx.runQuery(internal.tasks.internalGet, { id: taskId });
    if (!task) fail("Task not found");
    if (task!.funding.state !== "unfunded") return { state: "already" };
    const orderId = task!.funding.orderId;
    if (!orderId) fail("This task has no PayPal order yet.");
    return authorizeAndRecord(ctx, taskId, orderId!);
  },
});

export const confirmFundingInternal = internalAction({
  args: { taskId: v.id("tasks"), orderId: v.string() },
  handler: async (ctx, { taskId, orderId }) => {
    await authorizeAndRecord(ctx, taskId, orderId);
  },
});

async function authorizeAndRecord(
  ctx: ActionCtx,
  taskId: Id<"tasks">,
  orderId: string,
): Promise<{ state: "authorized" | "not_approved" | "already" }> {
  const pp = paypal();
  try {
    let order = await getOrder(pp, orderId);
    if (order.status === "APPROVED") order = await authorizeOrder(pp, orderId, `authorize-${orderId}`);
    const auth = order.purchase_units[0]?.payments?.authorizations?.[0];
    if (!auth) return { state: "not_approved" };
    const ok: boolean = await ctx.runMutation(internal.taskMoney.markAuthorized, {
      taskId,
      orderId,
      authorizationId: auth.id,
      payerEmail: order.payer?.email_address,
    });
    return { state: ok ? "authorized" : "already" };
  } catch (err) {
    throw new ConvexError(paypalMessage(err));
  }
}

// ── Release: capture + payout ────────────────────────────────────────────────

export const beginRelease = internalMutation({
  args: { taskId: v.id("tasks"), as: v.optional(v.string()), auto: v.optional(v.boolean()), posterId: v.optional(v.id("users")) },
  handler: async (ctx, { taskId, as, auto, posterId }) => {
    const task = await ctx.db.get(taskId);
    if (!task) fail("Task not found");
    const t = task!;
    if (posterId) {
      if (t.posterId !== posterId) fail("Only the poster can release payment.");
    } else if (!auto) {
      const { user } = await requireActor(ctx, as);
      if (t.posterId !== user._id) fail("Only the poster can release payment.");
    }
    if (!["submitted", "rejected", "disputed", "approved"].includes(t.status)) fail("There's no proof to pay for yet.");
    if (t.payoutReceiptId) {
      const existing = await ctx.db.get(t.payoutReceiptId);
      if (existing && existing.state !== "pending" && existing.state !== "declined") fail("Already paid out.");
    }
    if (!t.assigneeId) fail("Nobody is assigned to this task.");
    const worker = await ctx.db.get(t.assigneeId!);
    if (!worker?.paypalEmail) fail("The worker hasn't connected a PayPal account.");
    const poster = await ctx.db.get(t.posterId);

    const proof = await ctx.db
      .query("proofs")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .order("desc")
      .first();
    if (!proof) fail("There's no proof to pay for yet.");
    await ctx.db.patch(proof!._id, { decision: "approved" });
    await ctx.db.patch(taskId, { status: "approved" });

    const amountCents = await payoutCentsFor(ctx, t);
    const verdict = proof!.verdict;
    const checks = verdict?.checks ?? [];
    const verdictLine = verdict
      ? `${verdict.result === "pass" ? "Pass" : verdict.result === "fail" ? "Fail" : "Unsure"} · ${Math.round(
          verdict.confidence * 100,
        )}% · ${checks.filter((c) => c.passed).length} of ${checks.length} checks${verdict.model === "heuristic" ? " · heuristic" : ""}`
      : "No verdict";
    // People by first name; an org (Lakeside Commons) keeps its whole name.
    const posterShort = !poster ? "The poster" : poster.kind === "person" ? poster.name.split(" ")[0] : poster.name;
    const ruleText = auto
      ? `Proof passed at ${Math.round((verdict?.confidence ?? 0) * 100)}% · auto-release was on`
      : t.status === "disputed"
        ? `${poster?.name ?? "The poster"} released it after the worker contested`
        : verdict?.result === "pass"
          ? `Proof passed · ${posterShort} approved with one tap`
          : `${posterShort} approved it after reviewing the proof`;

    let payoutReceiptId = t.payoutReceiptId;
    if (!payoutReceiptId) {
      payoutReceiptId = await writeReceipt(ctx, {
        kind: "payout",
        amountCents,
        currency: t.currency,
        ownerId: t.posterId,
        payerId: t.posterId,
        payerLabel: poster?.name ?? "Plex",
        payeeId: worker!._id,
        payeeLabel: worker!.name,
        why: t.brief || t.title,
        rule: { source: "proof", text: ruleText },
        evidence: { proofId: proof!._id, verdict: verdictLine, checks },
        category: t.causeId ? "Giving" : "Errands",
        potId: t.potId,
        taskId,
        // Impact tasks: the Proof Reel finds payouts by cause.
        causeId: t.causeId,
        state: "pending",
        timelineLabel: "Approved; capturing the held funds",
      });
      await ctx.db.patch(taskId, { payoutReceiptId });
    }
    return {
      payoutReceiptId,
      amountCents,
      currency: t.currency,
      authorizationId: t.funding.state === "authorized" ? t.funding.authorizationId : undefined,
      receiver: worker!.paypalEmail!,
      workerName: worker!.name,
      title: t.title,
    };
  },
});

export const recordCapture = internalMutation({
  args: { taskId: v.id("tasks"), captureId: v.optional(v.string()), amountCents: v.number(), seeded: v.boolean() },
  handler: async (ctx, { taskId, captureId, amountCents, seeded }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return;
    if (task.funding.state === "authorized")
      await ctx.db.patch(taskId, { funding: { ...task.funding, state: "captured", captureId } });
    const receipt = await fundingReceipt(ctx, task);
    if (receipt) {
      const held = receipt.amountCents;
      await advanceReceipt(
        ctx,
        receipt._id,
        "funded",
        seeded
          ? "Seeded demo funding: no live authorization to capture"
          : amountCents < held
            ? `Captured ${formatCents(amountCents)}; the other ${formatCents(held - amountCents)} was never charged`
            : `Captured ${formatCents(amountCents)} from your PayPal`,
        captureId ? { paypal: { captureId } } : {},
      );
    }
    // The pot pays when money is actually captured.
    const pot = task.potId ? await ctx.db.get(task.potId) : null;
    if (pot && !seeded)
      await ctx.db.patch(pot._id, {
        balanceCents: pot.balanceCents - amountCents,
        spentTodayCents: pot.spentTodayCents + amountCents,
        spentMonthCents: pot.spentMonthCents + amountCents,
      });
  },
});

export const recordPayout = internalMutation({
  args: {
    taskId: v.id("tasks"),
    payoutReceiptId: v.id("receipts"),
    batchId: v.string(),
    itemId: v.optional(v.string()),
    batchStatus: v.string(),
  },
  handler: async (ctx, { taskId, payoutReceiptId, batchId, itemId, batchStatus }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return;
    const worker = task.assigneeId ? await ctx.db.get(task.assigneeId) : null;
    await advanceReceipt(
      ctx,
      payoutReceiptId,
      "released",
      `Sent to ${worker?.name.split(" ")[0] ?? "the worker"} by PayPal Payouts (${batchStatus.toLowerCase()})`,
      { paypal: { payoutBatchId: batchId, payoutItemId: itemId } },
    );
    await ctx.db.patch(taskId, { status: "paid", funding: { ...task.funding, state: "released" } });
    // The PayPal desk reads PayPal's records once the payout has settled.
    await ctx.scheduler.runAfter(20_000, internal.paypalDesk.checkInternal, { taskId });
    const receipt = await fundingReceipt(ctx, task);
    if (receipt && receipt.state !== "released")
      await advanceReceipt(ctx, receipt._id, "released", `Released to ${worker?.name ?? "the worker"}`);
    if (worker) await ctx.db.patch(worker._id, { tasksCompleted: (worker.tasksCompleted ?? 0) + 1 });
    // Impact task: the donations that funded this shift are released on the
    // same proof, so every donor's receipt shows the work was done.
    if (task.causeId) {
      const payout = await ctx.db.get(payoutReceiptId);
      await ctx.scheduler.runAfter(0, internal.donations.releaseForTask, {
        taskId,
        proofId: payout?.evidence?.proofId,
        verdict: payout?.evidence?.verdict,
      });
    }
  },
});

export const releaseFailed = internalMutation({
  args: { taskId: v.id("tasks"), payoutReceiptId: v.id("receipts"), message: v.string() },
  handler: async (ctx, { taskId, payoutReceiptId, message }) => {
    const r = await ctx.db.get(payoutReceiptId);
    if (r) await ctx.db.patch(r._id, { timeline: [...r.timeline, { at: Date.now(), label: message, state: r.state }] });
    const task = await ctx.db.get(taskId);
    if (task && task.status === "approved") await ctx.db.patch(taskId, { status: "submitted" });
  },
});

type ReleasePlan = {
  payoutReceiptId: Id<"receipts">;
  amountCents: number;
  currency: string;
  authorizationId?: string;
  receiver: string;
  workerName: string;
  title: string;
};

async function runRelease(ctx: ActionCtx, taskId: Id<"tasks">, as: string | undefined, auto: boolean, posterId?: Id<"users">) {
  const r: ReleasePlan = await ctx.runMutation(internal.taskMoney.beginRelease, { taskId, as, auto, posterId });
  const pp = paypal();

  // 1. Capture what we owe (partial capture releases the rest of the hold).
  try {
    if (r.authorizationId && !isSeedId(r.authorizationId)) {
      const cap = await captureAuthorization(pp, r.authorizationId, {
        amountCents: r.amountCents,
        currency: r.currency,
        idempotencyKey: `capture-${taskId}`,
      });
      await ctx.runMutation(internal.taskMoney.recordCapture, {
        taskId,
        captureId: cap.id,
        amountCents: r.amountCents,
        seeded: false,
      });
    } else if (r.authorizationId) {
      await ctx.runMutation(internal.taskMoney.recordCapture, { taskId, amountCents: r.amountCents, seeded: true });
    }
  } catch (err) {
    const message = `Capture failed: ${paypalMessage(err)}`;
    await ctx.runMutation(internal.taskMoney.releaseFailed, { taskId, payoutReceiptId: r.payoutReceiptId, message });
    throw new ConvexError(message);
  }

  // 2. Pay the worker with Payouts. sender_item_id is the payout receipt.
  try {
    const batch = await createPayout(pp, {
      senderBatchId: `plex-${r.payoutReceiptId}`,
      subject: `You were paid for “${r.title}” on Plex`,
      message: "Your proof passed. The receipt is on the task page.",
      items: [
        {
          receiver: r.receiver,
          amountCents: r.amountCents,
          currency: r.currency,
          note: `Plex task: ${r.title}`,
          senderItemId: r.payoutReceiptId,
        },
      ],
    });
    await ctx.runMutation(internal.taskMoney.recordPayout, {
      taskId,
      payoutReceiptId: r.payoutReceiptId,
      batchId: batch.batch_header.payout_batch_id,
      itemId: batch.items?.[0]?.payout_item_id,
      batchStatus: batch.batch_header.batch_status,
    });
    // Webhooks can't reach a local deployment, so also ask PayPal directly.
    for (const ms of [8_000, 45_000, 180_000])
      await ctx.scheduler.runAfter(ms, internal.taskMoney.refreshPayout, {
        receiptId: r.payoutReceiptId,
        batchId: batch.batch_header.payout_batch_id,
      });
  } catch (err) {
    const message = `Payout failed: ${paypalMessage(err)}`;
    await ctx.runMutation(internal.taskMoney.releaseFailed, { taskId, payoutReceiptId: r.payoutReceiptId, message });
    throw new ConvexError(message);
  }
}

/** The poster approves (one tap, manual review, or after a contest). */
export const release = action({
  args: { taskId: v.id("tasks"), as: v.optional(v.string()) },
  handler: async (ctx, { taskId, as }) => {
    await runRelease(ctx, taskId, as, false);
  },
});

/** Auto mode: the proof engine passed it with high confidence. */
export const autoRelease = internalAction({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    await runRelease(ctx, taskId, undefined, true);
  },
});

/** The poster's agent approves through the API. */
export const releaseFor = internalAction({
  args: { taskId: v.id("tasks"), posterId: v.id("users") },
  handler: async (ctx, { taskId, posterId }) => {
    await runRelease(ctx, taskId, undefined, false, posterId);
  },
});

// ── Payout status (polling and webhooks share this) ─────────────────────────

export const applyPayoutStatus = internalMutation({
  args: { receiptId: v.id("receipts"), status: v.string(), itemId: v.optional(v.string()) },
  handler: async (ctx, { receiptId, status, itemId }) => {
    const r = await ctx.db.get(receiptId);
    if (!r || r.kind !== "payout") return;
    const s = status.toUpperCase();
    const worker = r.payeeLabel.split(" ")[0];
    const already = (label: string) => r.timeline.some((t) => t.label === label);
    const patch = itemId ? { paypal: { payoutItemId: itemId } } : {};
    if (s === "SUCCESS" || s === "SUCCEEDED") {
      if (r.state !== "paid") await advanceReceipt(ctx, receiptId, "paid", `Landed in ${worker}'s PayPal`, patch);
    } else if (s === "UNCLAIMED") {
      const label = `Waiting for ${worker} to claim it (no PayPal account on this email yet)`;
      if (!already(label))
        await ctx.db.patch(receiptId, {
          timeline: [...r.timeline, { at: Date.now(), label, state: r.state }],
          paypal: itemId ? { ...r.paypal, payoutItemId: itemId } : r.paypal,
        });
    } else if (["FAILED", "RETURNED", "BLOCKED", "DENIED", "REFUNDED", "REVERSED"].includes(s)) {
      if (r.state !== "declined") await advanceReceipt(ctx, receiptId, "declined", `PayPal: payout ${s.toLowerCase()}`, patch);
    }
  },
});

export const refreshPayout = internalAction({
  args: { receiptId: v.id("receipts"), batchId: v.string() },
  handler: async (ctx, { receiptId, batchId }) => {
    if (!PayPalClient.isConfigured()) return;
    try {
      const batch = await getPayoutBatch(PayPalClient.fromEnv(), batchId);
      const item = batch.items?.[0];
      if (item)
        await ctx.runMutation(internal.taskMoney.applyPayoutStatus, {
          receiptId,
          status: item.transaction_status,
          itemId: item.payout_item_id,
        });
    } catch (err) {
      console.warn("[payouts] refresh failed", paypalMessage(err));
    }
  },
});

// ── Refund / void ────────────────────────────────────────────────────────────

export const beginRefund = internalMutation({
  args: { taskId: v.id("tasks"), as: v.optional(v.string()) },
  handler: async (ctx, { taskId, as }) => {
    const { user } = await requireActor(ctx, as);
    const task = await ctx.db.get(taskId);
    if (!task || task.posterId !== user._id) fail("Only the poster can refund this task.");
    const t = task!;
    if (t.status === "paid" || t.funding.state === "released") fail("This task was already paid out.");
    if (t.funding.state === "refunded") fail("Already refunded.");
    if (t.funding.state === "unfunded") fail("Nothing was charged.");
    return { funding: t.funding, amountCents: fundingCents(t.payout), currency: t.currency };
  },
});

export const recordRefund = internalMutation({
  args: {
    taskId: v.id("tasks"),
    mode: v.union(v.literal("void"), v.literal("refund"), v.literal("seeded")),
    refundId: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, mode, refundId }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return;
    const proof = await ctx.db
      .query("proofs")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .order("desc")
      .first();
    const reason =
      task.status === "disputed"
        ? "Refunded after a contested proof"
        : task.status === "rejected"
          ? `Proof rejected${proof?.rejectReason ? `: ${proof.rejectReason}` : ""}`
          : "Cancelled by the poster";
    await ctx.db.patch(taskId, { status: "refunded", funding: { ...task.funding, state: "refunded" } });
    if (mode !== "seeded") await ctx.scheduler.runAfter(5_000, internal.paypalDesk.checkInternal, { taskId });
    const receipt = await fundingReceipt(ctx, task);
    const label =
      mode === "void"
        ? "Authorization voided; you were never charged"
        : mode === "refund"
          ? "Refunded to your PayPal"
          : "Seeded demo funding released (no live PayPal call)";
    if (receipt) await advanceReceipt(ctx, receipt._id, "refunded", label, refundId ? { paypal: { refundId } } : {});
    if (mode === "refund") {
      const poster = await ctx.db.get(task.posterId);
      await writeReceipt(ctx, {
        kind: "refund",
        amountCents: fundingCents(task.payout),
        currency: task.currency,
        ownerId: task.posterId,
        payerLabel: "Plex",
        payeeId: task.posterId,
        payeeLabel: poster?.name ?? "Poster",
        why: task.brief || task.title,
        rule: { source: "system", text: reason },
        evidence: proof?.verdict
          ? { proofId: proof._id, verdict: `${proof.verdict.result} · ${Math.round(proof.verdict.confidence * 100)}%`, checks: proof.verdict.checks }
          : undefined,
        category: "Errands",
        potId: task.potId,
        taskId,
        state: "refunded",
        paypal: { captureId: task.funding.captureId, refundId },
      });
    }
  },
});

/** Cancel a funded task or refund after a rejected proof. */
export const refund = action({
  args: { taskId: v.id("tasks"), as: v.optional(v.string()) },
  handler: async (ctx, { taskId, as }) => {
    const { funding, amountCents, currency } = await ctx.runMutation(internal.taskMoney.beginRefund, { taskId, as });
    const pp = paypal();
    try {
      if (funding.state === "authorized" && funding.authorizationId && !isSeedId(funding.authorizationId)) {
        await voidAuthorization(pp, funding.authorizationId);
        await ctx.runMutation(internal.taskMoney.recordRefund, { taskId, mode: "void" });
      } else if (funding.state === "captured" && funding.captureId && !isSeedId(funding.captureId)) {
        const res = await refundCapture(pp, funding.captureId, {
          amountCents,
          currency,
          note: "Plex task refunded",
          idempotencyKey: `refund-${taskId}`,
        });
        await ctx.runMutation(internal.taskMoney.recordRefund, { taskId, mode: "refund", refundId: res.id });
      } else {
        await ctx.runMutation(internal.taskMoney.recordRefund, { taskId, mode: "seeded" });
      }
    } catch (err) {
      throw new ConvexError(paypalMessage(err));
    }
  },
});
