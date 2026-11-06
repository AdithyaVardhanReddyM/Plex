import { ConvexError, v } from "convex/values";
import {
  PayPalClient,
  PayPalError,
  createInvoice,
  createPayout,
  getPayoutBatch,
  sendInvoice,
} from "@plex/paypal";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { askSource } from "./schema";
import { MAC_AGENT_LABEL, agentUser, requireAgent } from "./lib/agentAuth";
import { formatCents } from "./lib/money";
import { describeRule, evaluate } from "./lib/policy";
import { parsePolicy } from "./lib/policyAi";
import { advanceReceipt, writeReceipt } from "./lib/receipts";
import { localHour } from "./lib/schedule";
import { requireViewer } from "./lib/viewer";
import { isMacReceipt, logActivity } from "./agent";
import { createAsk } from "./asks";

/**
 * Money for Plex for Mac. The brain never calls PayPal: it calls these, and
 * Convex runs the policy engine, writes the Receipt, then calls PayPal.
 *
 *  pay        evaluate() → (approval ask) → receipt `pending` → Payouts batch
 *             from the Plex sandbox account → `released` → `paid` when the
 *             item succeeds. The pot is debited when the receipt is written
 *             and credited back if PayPal fails.
 *  request    one PayPal invoice per person, a `splits` row, one invoice receipt each.
 *  cancel…    PayPal Subscriptions cancel (real ids only), a receipt either way.
 *
 * Without PayPal credentials the same flows run with `SIM-` ids, and the
 * receipt timeline says so.
 */

type Outcome = "allow" | "needs_approval" | "deny";
type PayResult = {
  ok: boolean;
  outcome: Outcome;
  ruleText: string;
  receiptId?: Id<"receipts">;
  paypalId?: string;
  askId?: Id<"asks">;
  error?: string;
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

const isPlaceholderId = (id: string | undefined) => !id || /^(SEED|SIM)-/.test(id);

async function potByName(ctx: QueryCtx, ownerId: Id<"users">, name: string) {
  const pots = await ctx.db.query("pots").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
  const key = name.trim().toLowerCase();
  return pots.find((p) => p.name.toLowerCase() === key) ?? null;
}

function decide(user: Doc<"users">, pot: Doc<"pots">, amountCents: number, payee: string, category?: string) {
  return evaluate(pot.rules, {
    amountCents,
    category,
    merchant: payee,
    hour: localHour(Date.now()),
    spentTodayCents: pot.spentTodayCents,
    spentMonthCents: pot.spentMonthCents,
    balanceCents: pot.balanceCents,
    paused: Boolean(user.agentsPaused),
  });
}

/** Debits (or with a negative amount, credits back) a pot. */
async function movePot(ctx: MutationCtx, potId: Id<"pots"> | undefined, cents: number) {
  if (!potId) return;
  const pot = await ctx.db.get(potId);
  if (!pot) return;
  await ctx.db.patch(potId, {
    balanceCents: pot.balanceCents - cents,
    spentTodayCents: Math.max(0, pot.spentTodayCents + cents),
    spentMonthCents: Math.max(0, pot.spentMonthCents + cents),
  });
}

async function runStep(ctx: MutationCtx, runId: Id<"routineRuns"> | undefined, label: string, receiptId?: Id<"receipts">) {
  if (!runId) return;
  const run = await ctx.db.get(runId);
  if (!run) return;
  await ctx.db.patch(runId, {
    steps: [...run.steps, { at: Date.now(), kind: "money", label }],
    receiptIds: receiptId && !run.receiptIds.includes(receiptId) ? [...run.receiptIds, receiptId] : run.receiptIds,
  });
}

// ── check ────────────────────────────────────────────────────────────────────

export const check = query({
  args: {
    secret: v.string(),
    potName: v.string(),
    amountCents: v.number(),
    payee: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { secret, potName, amountCents, payee, category }) => {
    const user = await agentUser(ctx, secret);
    const pot = await potByName(ctx, user._id, potName);
    if (!pot) return { outcome: "deny" as Outcome, ruleText: `No pot called “${potName}”`, potId: null };
    const d = decide(user, pot, amountCents, payee, category);
    return { outcome: d.outcome as Outcome, ruleText: d.ruleText, potId: pot._id };
  },
});

// ── pay ──────────────────────────────────────────────────────────────────────

const payArgs = {
  kind: v.union(v.literal("bill"), v.literal("send"), v.literal("purchase")),
  potName: v.string(),
  amountCents: v.number(),
  payee: v.string(),
  payeeEmail: v.optional(v.string()),
  why: v.string(),
  category: v.optional(v.string()),
  billId: v.optional(v.id("bills")),
  approvalAskId: v.optional(v.id("asks")),
  /** Who is asking, for the approval card ("Weekly money check-in", "Voice"). Defaults to a task. */
  source: v.optional(askSource),
  /** The merchant's order, booking or citation number this pays ("CC-4821"). */
  reference: v.optional(v.string()),
};

type PayPlan =
  | { stage: "result"; result: PayResult }
  | {
      stage: "send";
      receiptId: Id<"receipts">;
      receiver: string;
      amountCents: number;
      payee: string;
      why: string;
      ruleText: string;
      reference?: string;
      billId?: Id<"bills">;
      runId?: Id<"routineRuns">;
    };

const stop = (outcome: Outcome, ruleText: string, extra: Partial<PayResult> = {}): PayPlan => ({
  stage: "result",
  result: { ok: false, outcome, ruleText, ...extra },
});

export const beginPay = internalMutation({
  args: payArgs,
  handler: async (ctx, args): Promise<PayPlan> => {
    const { user } = await requireViewer(ctx);
    const { amountCents, payee, why } = args;
    const runId = args.source?.runId;
    if (!Number.isInteger(amountCents) || amountCents <= 0) return stop("deny", "Amounts must be positive whole cents");
    if (!payee.trim()) return stop("deny", "Who should be paid?");

    const pot = await potByName(ctx, user._id, args.potName);
    if (!pot) return stop("deny", `No pot called “${args.potName}”`);

    let bill: Doc<"bills"> | null = null;
    if (args.billId) {
      bill = await ctx.db.get(args.billId);
      if (!bill || bill.ownerId !== user._id) return stop("deny", "Bill not found");
      if (bill.status === "paid") return stop("deny", "That bill is already paid", { receiptId: bill.receiptId });
    }

    let ruleText: string;
    let rule: Doc<"receipts">["rule"];
    let approval: Doc<"approvals"> | null = null;

    if (args.approvalAskId) {
      // Second call, after the person answered the approval card.
      const ask = await ctx.db.get(args.approvalAskId);
      if (!ask || ask.ownerId !== user._id || ask.kind !== "approval") return stop("deny", "Approval not found");
      const askedText = ask.ruleText ?? "Needs your approval";
      if (ask.status === "pending") return stop("needs_approval", askedText, { askId: ask._id });
      if (ask.status !== "answered" || !ask.answer?.approved)
        return stop("deny", ask.status === "answered" ? "You declined it" : "The approval was withdrawn");
      if (ask.amountCents !== undefined && amountCents > ask.amountCents)
        return stop("deny", `You approved ${formatCents(ask.amountCents)}, not ${formatCents(amountCents)}`);
      approval = ask.approvalId ? await ctx.db.get(ask.approvalId) : null;
      if (approval?.receiptId) {
        // Already paid on an earlier call: never pay twice.
        const r = await ctx.db.get(approval.receiptId);
        return {
          stage: "result",
          result: { ok: true, outcome: "allow", ruleText: askedText, receiptId: approval.receiptId, paypalId: r?.paypal?.payoutBatchId },
        };
      }
      // An approval lifts limits, never the pause switch or the balance.
      if (user.agentsPaused) return stop("deny", "All agent spending is paused");
      if (amountCents > pot.balanceCents) return stop("deny", `${pot.name} pot balance is ${formatCents(pot.balanceCents)}`);
      ruleText = askedText;
      rule = { source: "approval", text: `You approved it: “${askedText}”` };
    } else {
      const decision = decide(user, pot, amountCents, payee, args.category);
      if (decision.outcome === "deny") {
        await logActivity(ctx, {
          ownerId: user._id,
          kind: "money",
          title: `Didn't pay ${payee} ${formatCents(amountCents)}`,
          detail: `${pot.name}: ${decision.ruleText}`,
          runId,
        });
        return stop("deny", decision.ruleText);
      }
      if (decision.outcome === "needs_approval") {
        const approvalId = await ctx.db.insert("approvals", {
          ownerId: user._id,
          potId: pot._id,
          agentLabel: MAC_AGENT_LABEL,
          description: why,
          merchant: payee,
          amountCents,
          ruleText: decision.ruleText,
          status: "pending",
        });
        const askId = await createAsk(ctx, user._id, {
          kind: "approval",
          title: `Pay ${payee} ${formatCents(amountCents)}?`,
          detail: why,
          amountCents,
          payee,
          ruleText: decision.ruleText,
          potName: pot.name,
          approvalId,
          source: args.source ?? { kind: "task", label: "Plex" },
        });
        return stop("needs_approval", decision.ruleText, { askId });
      }
      ruleText = decision.ruleText;
      rule = { source: "policy", text: `${pot.name}: ${decision.ruleText}` };
    }

    const receiptId = await writeReceipt(ctx, {
      kind: args.kind === "purchase" ? "purchase" : "payout",
      amountCents,
      currency: "USD",
      ownerId: user._id,
      payerId: user._id,
      payerLabel: user.name,
      payeeLabel: payee.trim(),
      agentLabel: MAC_AGENT_LABEL,
      why,
      rule,
      state: "pending",
      potId: pot._id,
      category: pot.name,
      reference: args.reference?.trim() || undefined,
      timelineLabel:
        rule.source === "approval" ? "You approved it, Plex is paying" : `Allowed by the ${pot.name} pot: ${ruleText}`,
    });
    await movePot(ctx, pot._id, amountCents);
    if (bill) await ctx.db.patch(bill._id, { status: "scheduled", receiptId });
    if (approval) await ctx.db.patch(approval._id, { receiptId, status: "approved", decidedAt: approval.decidedAt ?? Date.now() });
    await runStep(ctx, runId, `Paying ${payee} ${formatCents(amountCents)}`, receiptId);

    const receiver =
      args.payeeEmail?.trim() ||
      process.env.PAYPAL_DEMO_PAYEE_EMAIL ||
      `${payee.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}.plex@personal.example.com`;
    return {
      stage: "send", receiptId, receiver, amountCents, payee: payee.trim(), why, ruleText,
      reference: args.reference?.trim() || undefined, billId: bill?._id, runId,
    };
  },
});

type SendPlan = Extract<PayPlan, { stage: "send" }>;

/** After the receipt is written: the PayPal Payout (or a simulated one), then record what PayPal said. */
async function executePlan(ctx: ActionCtx, plan: SendPlan): Promise<PayResult> {
  const base = { receiptId: plan.receiptId, billId: plan.billId, runId: plan.runId };

  if (!PayPalClient.isConfigured()) {
    const batchId = `SIM-BATCH-${plan.receiptId}`;
    await ctx.runMutation(internal.agentMoney.recordPayout, { ...base, batchId, simulated: true });
    return { ok: true, outcome: "allow", ruleText: plan.ruleText, receiptId: plan.receiptId, paypalId: batchId };
  }

  try {
    const pp = PayPalClient.fromEnv();
    const batch = await createPayout(pp, {
      senderBatchId: `plex-mac-${plan.receiptId}`,
      subject: "A payment from Plex",
      message: plan.why,
      items: [
        {
          receiver: plan.receiver,
          amountCents: plan.amountCents,
          note: plan.reference ? `Ref ${plan.reference} · ${plan.why}` : `${plan.payee}: ${plan.why}`,
          senderItemId: plan.receiptId,
        },
      ],
    });
    const batchId = batch.batch_header.payout_batch_id;
    await ctx.runMutation(internal.agentMoney.recordPayout, {
      ...base,
      batchId,
      itemId: batch.items?.[0]?.payout_item_id,
      batchStatus: batch.batch_header.batch_status,
      simulated: false,
    });
    // Webhooks can't reach a local deployment, so also ask PayPal directly.
    for (const ms of [6_000, 30_000, 120_000])
      await ctx.scheduler.runAfter(ms, internal.agentMoney.refreshPayout, { receiptId: plan.receiptId, batchId });
    return { ok: true, outcome: "allow", ruleText: plan.ruleText, receiptId: plan.receiptId, paypalId: batchId };
  } catch (err) {
    const error = `Payout failed: ${paypalMessage(err)}`;
    await ctx.runMutation(internal.agentMoney.payFailed, { ...base, message: error });
    return { ok: false, outcome: "allow", ruleText: plan.ruleText, receiptId: plan.receiptId, error };
  }
}

export const pay = action({
  args: { secret: v.string(), ...payArgs },
  handler: async (ctx, { secret, ...args }): Promise<PayResult> => {
    requireAgent(secret);
    const plan: PayPlan = await ctx.runMutation(internal.agentMoney.beginPay, args);
    if (plan.stage === "result") return plan.result;
    return executePlan(ctx, plan);
  },
});

/**
 * Safety net for approvals nobody is waiting on (a seeded card, or the brain
 * restarted): `asks.resolveAsk` schedules this a little after an approval is
 * granted. If the agent already paid (its retry of `pay` with
 * `approvalAskId`), the approval has a receipt and this does nothing, so a
 * payment never happens twice.
 */
export const settleApproval = internalAction({
  args: { askId: v.id("asks") },
  handler: async (ctx, { askId }) => {
    const args = await ctx.runQuery(internal.agentMoney.settleArgs, { askId });
    if (!args) return;
    const plan: PayPlan = await ctx.runMutation(internal.agentMoney.beginPay, args);
    if (plan.stage === "send") await executePlan(ctx, plan);
  },
});

export const settleArgs = internalQuery({
  args: { askId: v.id("asks") },
  handler: async (ctx, { askId }) => {
    const ask = await ctx.db.get(askId);
    if (!ask || ask.kind !== "approval" || ask.status !== "answered" || !ask.answer?.approved || !ask.approvalId) return null;
    const approval = await ctx.db.get(ask.approvalId);
    if (!approval || approval.receiptId) return null;
    const pot = await ctx.db.get(approval.potId);
    const payee = ask.payee ?? approval.merchant;
    if (!pot || !payee) return null;
    const amountCents = ask.amountCents ?? approval.amountCents;
    const bill = (
      await ctx.db
        .query("bills")
        .withIndex("by_owner_due", (q) => q.eq("ownerId", ask.ownerId))
        .collect()
    ).find((b) => b.status !== "paid" && b.amountCents === amountCents && b.payee.toLowerCase() === payee.toLowerCase());
    return {
      kind: bill ? ("bill" as const) : ("send" as const),
      potName: pot.name,
      amountCents,
      payee,
      payeeEmail: bill?.payeeEmail,
      why: approval.description,
      billId: bill?._id,
      approvalAskId: askId,
      source: ask.source,
    };
  },
});

export const recordPayout = internalMutation({
  args: {
    receiptId: v.id("receipts"),
    batchId: v.string(),
    itemId: v.optional(v.string()),
    batchStatus: v.optional(v.string()),
    simulated: v.boolean(),
    billId: v.optional(v.id("bills")),
    runId: v.optional(v.id("routineRuns")),
  },
  handler: async (ctx, { receiptId, batchId, itemId, batchStatus, simulated, billId, runId }) => {
    const r = await ctx.db.get(receiptId);
    if (!r) return;
    await advanceReceipt(
      ctx,
      receiptId,
      simulated ? "paid" : "released",
      simulated
        ? `Simulated: PayPal isn't configured on this deployment (${batchId})`
        : `Sent by PayPal Payouts (${(batchStatus ?? "pending").toLowerCase()})`,
      { paypal: { payoutBatchId: batchId, payoutItemId: itemId } },
    );
    const now = Date.now();
    if (billId) await ctx.db.patch(billId, { status: "paid", paidAt: now, receiptId });
    await runStep(ctx, runId, `Paid ${r.payeeLabel} ${formatCents(r.amountCents)}${simulated ? " (simulated)" : ""}`, receiptId);
    await logActivity(ctx, {
      ownerId: r.ownerId,
      kind: "money",
      title: `Paid ${r.payeeLabel} ${formatCents(r.amountCents)}`,
      detail: r.why,
      receiptId,
      runId,
    });
  },
});

async function undoPayment(ctx: MutationCtx, receiptId: Id<"receipts">, message: string) {
  const r = await ctx.db.get(receiptId);
  if (!r || r.state === "declined") return null;
  await advanceReceipt(ctx, receiptId, "declined", message);
  await movePot(ctx, r.potId, -r.amountCents);
  const bills = await ctx.db
    .query("bills")
    .withIndex("by_owner_due", (q) => q.eq("ownerId", r.ownerId))
    .collect();
  for (const b of bills.filter((b) => b.receiptId === receiptId))
    await ctx.db.patch(b._id, { status: "upcoming", receiptId: undefined, paidAt: undefined });
  await logActivity(ctx, {
    ownerId: r.ownerId,
    kind: "money",
    title: `Payment to ${r.payeeLabel} didn't go through`,
    detail: `${message}. ${formatCents(r.amountCents)} is back in the pot.`,
    receiptId,
  });
  return r;
}

export const payFailed = internalMutation({
  args: {
    receiptId: v.id("receipts"),
    message: v.string(),
    billId: v.optional(v.id("bills")),
    runId: v.optional(v.id("routineRuns")),
  },
  handler: async (ctx, { receiptId, message, runId }) => {
    await undoPayment(ctx, receiptId, message);
    if (runId) {
      const run = await ctx.db.get(runId);
      if (run) await ctx.db.patch(runId, { steps: [...run.steps, { at: Date.now(), kind: "error", label: message }] });
    }
  },
});

export const applyPayoutStatus = internalMutation({
  args: { receiptId: v.id("receipts"), status: v.string(), itemId: v.optional(v.string()) },
  handler: async (ctx, { receiptId, status, itemId }) => {
    const r = await ctx.db.get(receiptId);
    if (!r || r.state === "paid" || r.state === "declined") return;
    const s = status.toUpperCase();
    const patch = itemId ? { paypal: { payoutItemId: itemId } } : {};
    if (s === "SUCCESS" || s === "SUCCEEDED") {
      await advanceReceipt(ctx, receiptId, "paid", `Landed in ${r.payeeLabel}'s PayPal`, patch);
    } else if (s === "UNCLAIMED") {
      const label = `Waiting for ${r.payeeLabel} to claim it (no PayPal account on this email yet)`;
      if (!r.timeline.some((t) => t.label === label))
        await ctx.db.patch(receiptId, { timeline: [...r.timeline, { at: Date.now(), label, state: r.state }] });
    } else if (["FAILED", "RETURNED", "BLOCKED", "DENIED", "REFUNDED", "REVERSED"].includes(s)) {
      await undoPayment(ctx, receiptId, `PayPal: payout ${s.toLowerCase()}`);
    }
  },
});

export const refreshPayout = internalAction({
  args: { receiptId: v.id("receipts"), batchId: v.string() },
  handler: async (ctx, { receiptId, batchId }) => {
    if (!PayPalClient.isConfigured() || isPlaceholderId(batchId)) return;
    try {
      const batch = await getPayoutBatch(PayPalClient.fromEnv(), batchId);
      const item = batch.items?.[0];
      if (item)
        await ctx.runMutation(internal.agentMoney.applyPayoutStatus, {
          receiptId,
          status: item.transaction_status,
          itemId: item.payout_item_id,
        });
    } catch (err) {
      console.warn("[agentMoney] payout refresh failed", paypalMessage(err));
    }
  },
});

// ── request (invoices, one per person) ───────────────────────────────────────

const person = v.object({ name: v.string(), email: v.string() });
const lineItem = v.object({ name: v.string(), amountCents: v.number() });

type RequestPlan = {
  splitId: Id<"splits">;
  people: { index: number; name: string; email: string; item: { name: string; amountCents: number }; receiptId: Id<"receipts"> }[];
};

export const beginRequest = internalMutation({
  args: { from: v.array(person), items: v.array(lineItem), why: v.string(), potName: v.optional(v.string()) },
  handler: async (ctx, { from, items, why, potName }): Promise<RequestPlan> => {
    const { user } = await requireViewer(ctx);
    // Where the money lands when they pay (a split of a bill goes back to Bills, a client's invoice to Work).
    const pot = potName ? await potByName(ctx, user._id, potName) : null;
    if (potName && !pot) throw new ConvexError(`No pot called “${potName}”`);
    if (from.length === 0) throw new ConvexError("Who should pay?");
    if (items.length !== from.length && items.length !== 1)
      throw new ConvexError("Give one item per person (or one item everyone owes)");
    const lines = from.map((_, i) => items[items.length === 1 ? 0 : i]!);
    for (const l of lines)
      if (!Number.isInteger(l.amountCents) || l.amountCents <= 0) throw new ConvexError("Amounts must be positive whole cents");

    const now = Date.now();
    const people: RequestPlan["people"] = [];
    for (let i = 0; i < from.length; i++) {
      const receiptId = await writeReceipt(ctx, {
        kind: "invoice",
        amountCents: lines[i]!.amountCents,
        currency: "USD",
        ownerId: user._id,
        payeeId: user._id,
        payerLabel: from[i]!.name,
        payeeLabel: user.name,
        agentLabel: MAC_AGENT_LABEL,
        why,
        rule: { source: "system", text: "You asked Plex to request it; nothing leaves your account" },
        state: "pending",
        occurredAt: now,
        potId: pot?._id,
        category: pot?.name,
        timelineLabel: `Invoice drafted for ${from[i]!.name}`,
      });
      people.push({ index: i, name: from[i]!.name, email: from[i]!.email, item: lines[i]!, receiptId });
    }
    const splitId = await ctx.db.insert("splits", {
      ownerId: user._id,
      title: why.slice(0, 120),
      totalCents: lines.reduce((s, l) => s + l.amountCents, 0),
      participants: people.map((p) => ({ name: p.name, shareCents: p.item.amountCents, status: "sent" as const })),
      occurredAt: now,
    });
    return { splitId, people };
  },
});

export const recordInvoice = internalMutation({
  args: {
    splitId: v.id("splits"),
    index: v.number(),
    receiptId: v.id("receipts"),
    invoiceId: v.optional(v.string()),
    email: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { splitId, index, receiptId, invoiceId, email, error }) => {
    if (error || !invoiceId) {
      await advanceReceipt(ctx, receiptId, "declined", error ?? "Invoice failed");
      return;
    }
    const split = await ctx.db.get(splitId);
    if (split)
      await ctx.db.patch(splitId, {
        participants: split.participants.map((p, i) => (i === index ? { ...p, invoiceId } : p)),
      });
    const simulated = isPlaceholderId(invoiceId);
    await advanceReceipt(
      ctx,
      receiptId,
      "pending",
      simulated
        ? `Simulated: PayPal isn't configured on this deployment (${invoiceId})`
        : `PayPal emailed the invoice to ${email}`,
      { paypal: { invoiceId } },
    );
  },
});

export const finishRequest = internalMutation({
  args: { names: v.array(v.string()), totalCents: v.number(), why: v.string(), receiptId: v.optional(v.id("receipts")) },
  handler: async (ctx, { names, totalCents, why, receiptId }) => {
    const { user } = await requireViewer(ctx);
    const who = names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    await logActivity(ctx, {
      ownerId: user._id,
      kind: "money",
      title: `Requested ${formatCents(totalCents)} from ${who}`,
      detail: why,
      receiptId,
    });
  },
});

export const request = action({
  args: {
    secret: v.string(),
    from: v.array(person),
    items: v.array(lineItem),
    why: v.string(),
    note: v.optional(v.string()),
    potName: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { secret, from, items, why, note, potName },
  ): Promise<{ ok: boolean; splitId?: Id<"splits">; invoiceIds: string[]; receiptIds: Id<"receipts">[]; errors?: string[] }> => {
    requireAgent(secret);
    const plan: RequestPlan = await ctx.runMutation(internal.agentMoney.beginRequest, { from, items, why, potName });
    const configured = PayPalClient.isConfigured();
    const pp = configured ? PayPalClient.fromEnv() : null;
    const invoiceIds: string[] = [];
    const errors: string[] = [];
    const sent: RequestPlan["people"] = [];

    for (const p of plan.people) {
      let invoiceId: string | undefined;
      let error: string | undefined;
      if (!pp) invoiceId = `SIM-INV-${p.receiptId}`;
      else {
        try {
          const inv = await createInvoice(pp, {
            recipientEmail: p.email,
            recipientName: p.name,
            items: [p.item],
            note: note ?? why,
            reference: `plex-${p.receiptId}`,
          });
          await sendInvoice(pp, inv.id);
          invoiceId = inv.id;
        } catch (err) {
          error = `Invoice to ${p.name} failed: ${paypalMessage(err)}`;
        }
      }
      await ctx.runMutation(internal.agentMoney.recordInvoice, {
        splitId: plan.splitId,
        index: p.index,
        receiptId: p.receiptId,
        invoiceId,
        email: p.email,
        error,
      });
      if (invoiceId) {
        invoiceIds.push(invoiceId);
        sent.push(p);
      }
      if (error) errors.push(error);
    }

    if (sent.length > 0)
      await ctx.runMutation(internal.agentMoney.finishRequest, {
        names: sent.map((p) => p.name),
        totalCents: sent.reduce((s, p) => s + p.item.amountCents, 0),
        why,
        receiptId: sent[0]!.receiptId,
      });
    return {
      ok: sent.length > 0,
      splitId: plan.splitId,
      invoiceIds,
      receiptIds: plan.people.map((p) => p.receiptId),
      ...(errors.length ? { errors } : {}),
    };
  },
});

/**
 * INVOICING.INVOICE.PAID for an invoice Plex sent (its reference is `plex-<receiptId>`): the
 * receipt becomes paid, the money lands in the pot the request named, the split marks that
 * person as paid, and the Today feed says so. Returns what a routine triggered by this event
 * needs to know (who paid, how much, into which pot), or null for an invoice Plex didn't send.
 */
export const invoicePaid = internalMutation({
  args: { invoiceId: v.string(), reference: v.optional(v.string()), paidCents: v.optional(v.number()) },
  handler: async (ctx, { invoiceId, reference, paidCents }) => {
    const fromRef = reference?.startsWith("plex-") ? ctx.db.normalizeId("receipts", reference.slice(5)) : null;
    let r = fromRef ? await ctx.db.get(fromRef) : null;
    if (!r || r.kind !== "invoice") {
      const pending = await ctx.db.query("receipts").withIndex("by_state", (q) => q.eq("state", "pending")).collect();
      r = pending.find((x) => x.kind === "invoice" && x.paypal?.invoiceId === invoiceId) ?? null;
    }
    if (!r || r.kind !== "invoice") return null;
    const amountCents = paidCents ?? r.amountCents;
    const pot = r.potId ? await ctx.db.get(r.potId) : null;
    const first = r.state !== "paid";
    if (first) {
      await advanceReceipt(ctx, r._id, "paid", `${r.payerLabel} paid the PayPal invoice`);
      if (pot) await ctx.db.patch(pot._id, { balanceCents: pot.balanceCents + amountCents });
      const splits = await ctx.db.query("splits").withIndex("by_owner", (q) => q.eq("ownerId", r!.ownerId)).collect();
      for (const sp of splits)
        if (sp.participants.some((p) => p.invoiceId === invoiceId))
          await ctx.db.patch(sp._id, {
            participants: sp.participants.map((p) => (p.invoiceId === invoiceId ? { ...p, status: "paid" as const } : p)),
          });
      await logActivity(ctx, {
        ownerId: r.ownerId,
        kind: "money",
        title: `${r.payerLabel} paid ${formatCents(amountCents)}`,
        detail: pot ? `Into ${pot.name} · ${r.why}` : r.why,
        receiptId: r._id,
      });
    }
    return {
      first,
      payer: r.payerLabel,
      amountCents,
      amount: formatCents(amountCents),
      potName: pot?.name ?? null,
      why: r.why,
      receiptId: r._id,
      invoiceId,
    };
  },
});

// ── pots ─────────────────────────────────────────────────────────────────────

export const insertPot = internalMutation({
  args: { name: v.string(), icon: v.string(), color: v.string(), monthlyBudgetCents: v.number(), rulesText: v.string(), rules: v.array(v.any()) },
  handler: async (ctx, args) => {
    const { user } = await requireViewer(ctx);
    const existing = await potByName(ctx, user._id, args.name);
    if (existing) return { ok: false as const, error: `There's already a ${existing.name} pot.`, potId: existing._id };
    const potId = await ctx.db.insert("pots", {
      ownerId: user._id,
      name: args.name,
      icon: args.icon,
      color: args.color,
      balanceCents: 0,
      spentTodayCents: 0,
      spentMonthCents: 0,
      monthlyBudgetCents: args.monthlyBudgetCents,
      rulesText: args.rulesText,
      rules: args.rules as Doc<"pots">["rules"],
    });
    await logActivity(ctx, {
      ownerId: user._id,
      kind: "money",
      title: `New pot: ${args.name}`,
      detail: args.rulesText || undefined,
    });
    return { ok: true as const, potId };
  },
});

/**
 * A new pot the user asked for ("put 30% in a Tax pot"). Its rules are the user's words, parsed
 * once (the model or the heuristic) and then enforced by evaluate() like every other pot's.
 * It starts empty; money gets in by moving it from another pot or by an invoice paid into it.
 */
export const createPot = action({
  args: {
    secret: v.string(),
    name: v.string(),
    rulesText: v.optional(v.string()),
    monthlyBudgetCents: v.optional(v.number()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, { secret, name, rulesText, monthlyBudgetCents, icon }): Promise<{ ok: boolean; error?: string; potId?: Id<"pots">; rules?: string[] }> => {
    requireAgent(secret);
    const clean = name.trim().replace(/\s+pot$/i, "").slice(0, 40);
    if (!clean) return { ok: false, error: "What should the pot be called?" };
    const text = (rulesText ?? "").trim().slice(0, 1_000);
    const parsed = text ? await parsePolicy(text) : { rules: [] };
    const res = await ctx.runMutation(internal.agentMoney.insertPot, {
      name: clean[0]!.toUpperCase() + clean.slice(1),
      icon: icon?.trim() || "piggy-bank",
      color: "steel",
      monthlyBudgetCents: Math.max(0, Math.round(monthlyBudgetCents ?? 0)),
      rulesText: text,
      rules: parsed.rules,
    });
    return { ...res, rules: parsed.rules.map(describeRule) };
  },
});

// ── cancelSubscription ───────────────────────────────────────────────────────

export const subscriptionForCancel = internalMutation({
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, { subscriptionId }) => {
    const { user } = await requireViewer(ctx);
    const sub = await ctx.db.get(subscriptionId);
    if (!sub || sub.ownerId !== user._id) throw new ConvexError("Subscription not found");
    return sub;
  },
});

export const recordCancel = internalMutation({
  args: { subscriptionId: v.id("subscriptions"), why: v.string(), viaPaypal: v.boolean() },
  handler: async (ctx, { subscriptionId, why, viaPaypal }) => {
    const { user } = await requireViewer(ctx);
    const sub = await ctx.db.get(subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    await ctx.db.patch(subscriptionId, { status: "cancelled" });
    const per = sub.cadence === "yearly" ? "a year" : "a month";
    const receiptId = await writeReceipt(ctx, {
      kind: "subscription",
      amountCents: sub.amountCents,
      currency: "USD",
      ownerId: user._id,
      payerId: user._id,
      payerLabel: user.name,
      payeeLabel: sub.merchant,
      agentLabel: MAC_AGENT_LABEL,
      why,
      rule: {
        source: "system",
        text: viaPaypal ? "Cancelled with PayPal at your request" : "Cancelled at your request",
      },
      evidence: { savedCents: sub.amountCents },
      state: "declined",
      category: sub.category,
      paypal: viaPaypal ? { subscriptionId: sub.paypalSubscriptionId } : undefined,
      timelineLabel: viaPaypal
        ? `PayPal cancelled the subscription: no more ${formatCents(sub.amountCents)} charges`
        : `Marked cancelled in Plex (no PayPal subscription on file): no more ${formatCents(sub.amountCents)} charges`,
    });
    await logActivity(ctx, {
      ownerId: user._id,
      kind: "money",
      title: `Cancelled ${sub.merchant}`,
      detail: `${sub.plan}, ${formatCents(sub.amountCents)} ${per}. ${why}`,
      receiptId,
    });
    return receiptId;
  },
});

export const cancelSubscription = action({
  args: { secret: v.string(), subscriptionId: v.id("subscriptions"), why: v.string() },
  handler: async (ctx, { secret, subscriptionId, why }): Promise<{ ok: boolean; receiptId?: Id<"receipts">; error?: string }> => {
    requireAgent(secret);
    const sub: Doc<"subscriptions"> = await ctx.runMutation(internal.agentMoney.subscriptionForCancel, { subscriptionId });
    if (sub.status === "cancelled") return { ok: true };
    const real = !isPlaceholderId(sub.paypalSubscriptionId) && PayPalClient.isConfigured();
    if (real) {
      try {
        await PayPalClient.fromEnv().request<void>("POST", `/v1/billing/subscriptions/${sub.paypalSubscriptionId}/cancel`, {
          body: { reason: why.slice(0, 127) || "Cancelled by the subscriber" },
        });
      } catch (err) {
        return { ok: false, error: `PayPal couldn't cancel it: ${paypalMessage(err)}` };
      }
    }
    const receiptId: Id<"receipts"> = await ctx.runMutation(internal.agentMoney.recordCancel, {
      subscriptionId,
      why,
      viaPaypal: real,
    });
    return { ok: true, receiptId };
  },
});

// ── move ─────────────────────────────────────────────────────────────────────

/**
 * Moves money between two of the user's own pots ("move half of what's left in
 * Food to Savings"). Pots are envelopes inside the user's own PayPal balance, so
 * nothing leaves it and PayPal isn't called: this is bookkeeping, logged in the
 * activity feed, never a payment (payments go through `pay` and get a Receipt).
 */
export const move = mutation({
  args: { secret: v.string(), fromPot: v.string(), toPot: v.string(), amountCents: v.number(), why: v.string() },
  handler: async (ctx, { secret, fromPot, toPot, amountCents, why }) => {
    const user = await agentUser(ctx, secret);
    const amount = Math.round(amountCents);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false as const, error: "The amount must be more than $0." };
    const from = await potByName(ctx, user._id, fromPot);
    const to = await potByName(ctx, user._id, toPot);
    if (!from) return { ok: false as const, error: `No pot called “${fromPot}”.` };
    if (!to) return { ok: false as const, error: `No pot called “${toPot}”.` };
    if (from._id === to._id) return { ok: false as const, error: "That's the same pot." };
    if (user.agentsPaused) return { ok: false as const, error: "Agent spending is paused." };
    if (from.balanceCents < amount) {
      return { ok: false as const, error: `${from.name} only has ${formatCents(from.balanceCents)}.` };
    }
    await ctx.db.patch(from._id, { balanceCents: from.balanceCents - amount });
    await ctx.db.patch(to._id, { balanceCents: to.balanceCents + amount });
    await logActivity(ctx, {
      ownerId: user._id,
      kind: "money",
      title: `Moved ${formatCents(amount)} from ${from.name} to ${to.name}`,
      detail: why,
    });
    return {
      ok: true as const,
      from: { name: from.name, balanceCents: from.balanceCents - amount },
      to: { name: to.name, balanceCents: to.balanceCents + amount },
    };
  },
});

// ── recent ───────────────────────────────────────────────────────────────────

/** Compact receipts for the worker: "what did I spend on food this week?" */
export const recent = query({
  args: { secret: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { secret, days }) => {
    const user = await agentUser(ctx, secret);
    const since = Date.now() - Math.min(Math.max(1, days ?? 30), 365) * 86_400_000;
    const rows = await ctx.db
      .query("receipts")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", user._id).gte("occurredAt", since))
      .order("desc")
      .take(300)
      // The web's task and cause money stays on the web (as on the Mac's Insights page).
      .then((all) => all.filter(isMacReceipt).slice(0, 200));
    const incoming = (r: Doc<"receipts">) => r.payeeId === user._id && r.payerId !== user._id;
    const moved = (r: Doc<"receipts">) => r.state !== "declined" && r.state !== "pending";
    return {
      since,
      receipts: rows.map((r) => ({
        _id: r._id,
        at: r.occurredAt,
        date: new Date(r.occurredAt).toISOString().slice(0, 10),
        kind: r.kind,
        direction: incoming(r) ? ("in" as const) : ("out" as const),
        amountCents: r.amountCents,
        payer: r.payerLabel,
        payee: r.payeeLabel,
        category: r.category,
        why: r.why,
        rule: r.rule.text,
        state: r.state,
        agent: r.agentLabel,
      })),
      totals: {
        outCents: rows.filter((r) => !incoming(r) && moved(r)).reduce((s, r) => s + r.amountCents, 0),
        inCents: rows.filter((r) => incoming(r) && moved(r)).reduce((s, r) => s + r.amountCents, 0),
      },
    };
  },
});
