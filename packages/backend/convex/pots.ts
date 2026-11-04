import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { policyRule } from "./schema";
import { getViewer, requireViewer } from "./lib/viewer";
import { decidingRuleIndex, describeRule, evaluate } from "./lib/policy";
import { parsePolicy } from "./lib/policyAi";
import { writeReceipt } from "./lib/receipts";

/**
 * Approve or decline an agent's purchase that needed a human. Approving
 * writes the purchase Receipt with the approval as its rule. (The PayPal
 * charge for agent purchases runs through the Mac/store flow; here the
 * money engine is represented by the Receipt.)
 */
export const decideApproval = mutation({
  args: { id: v.id("approvals"), approve: v.boolean() },
  handler: async (ctx, { id, approve }) => {
    const { user } = await requireViewer(ctx);
    const approval = await ctx.db.get(id);
    if (!approval || approval.ownerId !== user._id) throw new Error("Approval not found");
    if (approval.status !== "pending") return approval.receiptId ?? null;
    const pot = await ctx.db.get(approval.potId);
    if (!pot) throw new Error("Pot not found");

    if (!approve) {
      await ctx.db.patch(id, { status: "declined" });
      return null;
    }
    if (approval.amountCents > pot.balanceCents) throw new Error(`${pot.name} pot doesn't have enough left`);

    const receiptId = await writeReceipt(ctx, {
      kind: "purchase",
      amountCents: approval.amountCents,
      currency: "USD",
      ownerId: user._id,
      payerId: user._id,
      payerLabel: user.name,
      payeeLabel: approval.merchant ?? "Merchant",
      agentLabel: approval.agentLabel,
      why: approval.description,
      category: pot.name,
      potId: pot._id,
      rule: { source: "approval", text: `You approved it: “${approval.ruleText}”` },
      state: "paid",
    });
    await ctx.db.patch(pot._id, {
      balanceCents: pot.balanceCents - approval.amountCents,
      spentTodayCents: pot.spentTodayCents + approval.amountCents,
      spentMonthCents: pot.spentMonthCents + approval.amountCents,
    });
    await ctx.db.patch(id, { status: "approved", receiptId });
    return receiptId;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const pots = await ctx.db
      .query("pots")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer.user._id))
      .collect();
    return pots.map((p) => ({ ...p, ruleLines: p.rules.map(describeRule) }));
  },
});

/**
 * Dry-run the policy engine, e.g. to preview "would this need approval?"
 * Pass `rules` to try a draft before saving it; otherwise the pot's saved
 * rules are used. `ruleIndex` points at the rule that decided (-1 when the
 * pause switch or the pot balance decided).
 */
export const check = query({
  args: {
    potId: v.id("pots"),
    amountCents: v.number(),
    category: v.optional(v.string()),
    merchant: v.optional(v.string()),
    hour: v.number(),
    rules: v.optional(v.array(policyRule)),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const pot = await ctx.db.get(args.potId);
    if (!viewer || !pot || pot.ownerId !== viewer.user._id) return null;
    const rules = args.rules ?? pot.rules;
    const decision = evaluate(rules, {
      amountCents: args.amountCents,
      category: args.category,
      merchant: args.merchant,
      hour: args.hour,
      spentTodayCents: pot.spentTodayCents,
      spentMonthCents: pot.spentMonthCents,
      balanceCents: pot.balanceCents,
      paused: Boolean(viewer.user.agentsPaused),
    });
    return { ...decision, ruleIndex: decidingRuleIndex(rules, decision) };
  },
});

/**
 * Plain English in, proposed rules out. The model (or the deterministic
 * fallback) only proposes: nothing is saved until the user confirms with
 * `saveRules`, and `evaluate()` alone ever decides.
 */
export const proposeRules = action({
  args: { text: v.string() },
  handler: async (_ctx, { text }) => {
    const trimmed = text.trim().slice(0, 1_000);
    if (!trimmed) return { rules: [], lines: [], unparsed: [], source: "heuristic" as const };
    const parsed = await parsePolicy(trimmed);
    return { ...parsed, lines: parsed.rules.map(describeRule) };
  },
});

/** Save the rules the user confirmed, with their own words beside them. */
export const saveRules = mutation({
  args: { potId: v.id("pots"), rulesText: v.string(), rules: v.array(policyRule) },
  handler: async (ctx, { potId, rulesText, rules }) => {
    const { user } = await requireViewer(ctx);
    const pot = await ctx.db.get(potId);
    if (!pot || pot.ownerId !== user._id) throw new Error("Pot not found");
    for (const r of rules) {
      if ("amountCents" in r && (!Number.isInteger(r.amountCents) || r.amountCents <= 0))
        throw new Error("Amounts must be positive whole cents");
      if (r.kind === "quiet_hours" && [r.startHour, r.endHour].some((h) => !Number.isInteger(h) || h < 0 || h > 23))
        throw new Error("Hours must be 0 to 23");
    }
    await ctx.db.patch(potId, { rulesText: rulesText.trim().slice(0, 1_000), rules });
    return null;
  },
});

/** Decided approvals, newest first, with the pot each came from. */
export const approvalHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const owner = viewer.user._id;
    const [approved, declined] = await Promise.all(
      (["approved", "declined"] as const).map((status) =>
        ctx.db
          .query("approvals")
          .withIndex("by_owner_status", (q) => q.eq("ownerId", owner).eq("status", status))
          .order("desc")
          .take(limit ?? 20),
      ),
    );
    const rows = [...approved!, ...declined!].sort((a, b) => b._creationTime - a._creationTime).slice(0, limit ?? 20);
    const pots = new Map((await ctx.db.query("pots").withIndex("by_owner", (q) => q.eq("ownerId", owner)).collect()).map((p) => [p._id, p.name]));
    return rows.map((r) => ({ ...r, potName: pots.get(r.potId) ?? "Pot" }));
  },
});

/** Tasks the viewer posted that are still in flight, for Home. */
export const myOpenTasks = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_poster", (q) => q.eq("posterId", viewer.user._id))
      .collect();
    const live = new Set(["open", "assigned", "submitted", "verifying", "approved"]);
    return tasks
      .filter((t) => live.has(t.status))
      .sort((a, b) => a.windowEnd - b.windowEnd)
      .map((t) => ({
        _id: t._id,
        title: t.title,
        status: t.status,
        payout: t.payout,
        locationLabel: t.location?.label,
        windowEnd: t.windowEnd,
        postedVia: t.postedVia,
        agentLabel: t.agentLabel,
        fundingState: t.funding.state,
      }));
  },
});

export const pendingApprovals = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    return ctx.db
      .query("approvals")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", viewer.user._id).eq("status", "pending"))
      .collect();
  },
});
