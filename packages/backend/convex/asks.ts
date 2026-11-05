import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { askKind, askSource } from "./schema";
import { agentUser } from "./lib/agentAuth";
import { formatCents } from "./lib/money";
import { describeRule, type PolicyRule } from "./lib/policy";
import { getViewer, requireViewer } from "./lib/viewer";
import { logActivity } from "./agent";

/**
 * The hand-off inbox. When the agent needs a person (a money approval, a
 * question, a takeover on screen, a login), it creates an ask and waits.
 * Answering in the notch, the main window or by voice resolves it; the brain
 * polls `asks:get`. A money ask mirrors its `approvals` row, so the web's
 * approval cards and the Mac stay in step.
 */

/** How long an approved payment waits for the agent before Convex settles it itself. */
export const SETTLE_AFTER_MS = 15_000;

/** "Always" sets a standing approval a little above this amount, rounded up to $5. */
export function autoApproveCap(amountCents: number) {
  const target = Math.max(Math.round(amountCents * 1.25), amountCents);
  return Math.ceil(target / 500) * 500;
}

/** Adds (or raises) an `auto_approve` rule for a merchant on a pot. Returns the rule added. */
export async function addStandingApproval(
  ctx: MutationCtx,
  potId: Id<"pots">,
  merchant: string,
  amountCents: number,
): Promise<PolicyRule | null> {
  const pot = await ctx.db.get(potId);
  if (!pot) return null;
  const key = merchant.trim().toLowerCase();
  const existing = pot.rules.find((r) => r.kind === "auto_approve" && r.merchant.trim().toLowerCase() === key);
  const upToCents = Math.max(autoApproveCap(amountCents), existing?.kind === "auto_approve" ? existing.upToCents : 0);
  const rule: PolicyRule = { kind: "auto_approve", merchant: merchant.trim(), upToCents };
  const rules = [...pot.rules.filter((r) => r !== existing), rule];
  const sentence = `Pay ${rule.merchant} up to ${formatCents(upToCents)} without asking.`;
  const rulesText = pot.rulesText.includes(sentence) ? pot.rulesText : `${pot.rulesText.trim()} ${sentence}`.trim();
  await ctx.db.patch(potId, { rules, rulesText: rulesText.slice(0, 1_000) });
  return rule;
}

/** A run waiting on this ask carries on. */
async function resumeRun(ctx: MutationCtx, ask: Doc<"asks">, label: string) {
  if (!ask.source.runId) return;
  const run = await ctx.db.get(ask.source.runId);
  if (!run || run.askId !== ask._id) return;
  await ctx.db.patch(run._id, {
    status: run.status === "waiting" ? "running" : run.status,
    askId: undefined,
    steps: [...run.steps, { at: Date.now(), kind: "ask", label }],
  });
}

function answerLabel(ask: Doc<"asks">, answer: { approved?: boolean; text?: string }) {
  if (ask.kind === "approval") return answer.approved ? "You approved it" : "You declined it";
  if (ask.kind === "question") return answer.text ? `You answered: ${answer.text}` : "You answered";
  return answer.approved === false ? "You cancelled it" : "You did it";
}

export async function resolveAsk(
  ctx: MutationCtx,
  ask: Doc<"asks">,
  answer: { approved?: boolean; always?: boolean; text?: string; by: "notch" | "window" | "voice" },
  opts: { mirrorApproval: boolean } = { mirrorApproval: true },
) {
  const now = Date.now();
  await ctx.db.patch(ask._id, { status: "answered", answer, answeredAt: now });

  let ruleNote: string | undefined;
  if (ask.kind === "approval" && ask.approvalId) {
    const approval = await ctx.db.get(ask.approvalId);
    if (approval && opts.mirrorApproval && approval.status === "pending")
      await ctx.db.patch(approval._id, { status: answer.approved ? "approved" : "declined", decidedAt: now });
    // If no agent is waiting on this approval, Convex completes the payment itself.
    if (approval && answer.approved && !approval.receiptId)
      await ctx.scheduler.runAfter(SETTLE_AFTER_MS, internal.agentMoney.settleApproval, { askId: ask._id });
    if (approval && answer.approved && answer.always) {
      const merchant = ask.payee ?? approval.merchant;
      if (merchant) {
        const rule = await addStandingApproval(ctx, approval.potId, merchant, ask.amountCents ?? approval.amountCents);
        if (rule) ruleNote = `New rule: ${describeRule(rule)}`;
      }
    }
  }

  const label = answerLabel(ask, answer);
  await resumeRun(ctx, ask, label);
  await logActivity(ctx, {
    ownerId: ask.ownerId,
    kind: "handoff",
    title: `${label}: ${ask.title}`,
    detail:
      [ask.amountCents !== undefined && ask.payee ? `${formatCents(ask.amountCents)} to ${ask.payee}` : undefined, ruleNote]
        .filter(Boolean)
        .join(" · ") || undefined,
    runId: ask.source.runId,
  });
}

// ── Main window ──────────────────────────────────────────────────────────────

export const pending = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    return ctx.db
      .query("asks")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", viewer.user._id).eq("status", "pending"))
      .order("desc")
      .collect();
  },
});

export const answer = mutation({
  args: {
    askId: v.id("asks"),
    approved: v.optional(v.boolean()),
    always: v.optional(v.boolean()),
    text: v.optional(v.string()),
    by: v.union(v.literal("notch"), v.literal("window"), v.literal("voice")),
  },
  handler: async (ctx, { askId, approved, always, text, by }) => {
    const { user } = await requireViewer(ctx);
    const ask = await ctx.db.get(askId);
    if (!ask || ask.ownerId !== user._id) throw new ConvexError("Ask not found");
    if (ask.status !== "pending") return null; // answered elsewhere first
    if (ask.kind === "approval" && approved === undefined) throw new ConvexError("An approval needs approved: true or false");
    await resolveAsk(ctx, ask, {
      approved: approved ?? (ask.kind === "question" ? undefined : true),
      always: approved === false ? undefined : always,
      text: text?.trim().slice(0, 2_000) || undefined,
      by,
    });
    return null;
  },
});

// ── Brain ────────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    secret: v.string(),
    kind: askKind,
    title: v.string(),
    detail: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
    amountCents: v.optional(v.number()),
    payee: v.optional(v.string()),
    ruleText: v.optional(v.string()),
    potName: v.optional(v.string()),
    approvalId: v.optional(v.id("approvals")),
    source: askSource,
  },
  handler: async (ctx, { secret, ...fields }) => {
    const user = await agentUser(ctx, secret);
    return createAsk(ctx, user._id, fields);
  },
});

export type AskFields = Omit<Doc<"asks">, "_id" | "_creationTime" | "ownerId" | "status" | "createdAt" | "answer" | "answeredAt">;

/** Inserts a pending ask, marks a routine run as waiting on it, and logs it on Today. */
export async function createAsk(ctx: MutationCtx, ownerId: Id<"users">, fields: AskFields) {
  const now = Date.now();
  const askId = await ctx.db.insert("asks", {
    ...fields,
    title: fields.title.slice(0, 300),
    ownerId,
    status: "pending",
    createdAt: now,
  });
  if (fields.source.runId) {
    const run = await ctx.db.get(fields.source.runId);
    if (run && run.ownerId === ownerId)
      await ctx.db.patch(run._id, {
        status: "waiting",
        askId,
        steps: [...run.steps, { at: now, kind: "ask", label: `Waiting on you: ${fields.title}`, detail: fields.detail }],
      });
  }
  await logActivity(ctx, {
    ownerId,
    kind: "handoff",
    title: `Plex needs you: ${fields.title}`,
    detail: fields.detail,
    runId: fields.source.runId,
  });
  return askId;
}

export const get = query({
  args: { secret: v.string(), askId: v.id("asks") },
  handler: async (ctx, { secret, askId }) => {
    const user = await agentUser(ctx, secret);
    const ask = await ctx.db.get(askId);
    return ask && ask.ownerId === user._id ? ask : null;
  },
});

export const cancel = mutation({
  args: { secret: v.string(), askId: v.id("asks") },
  handler: async (ctx, { secret, askId }) => {
    const user = await agentUser(ctx, secret);
    const ask = await ctx.db.get(askId);
    if (!ask || ask.ownerId !== user._id) throw new ConvexError("Ask not found");
    if (ask.status !== "pending") return null;
    const now = Date.now();
    await ctx.db.patch(askId, { status: "cancelled", answeredAt: now });
    if (ask.approvalId) {
      const approval = await ctx.db.get(ask.approvalId);
      if (approval?.status === "pending") await ctx.db.patch(approval._id, { status: "declined", decidedAt: now });
    }
    await resumeRun(ctx, ask, "Plex withdrew the question");
    return null;
  },
});
