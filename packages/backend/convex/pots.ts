import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewer, requireViewer } from "./lib/viewer";
import { describeRule, evaluate } from "./lib/policy";
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

/** Dry-run the policy engine, e.g. to preview "would this need approval?" */
export const check = query({
  args: {
    potId: v.id("pots"),
    amountCents: v.number(),
    category: v.optional(v.string()),
    merchant: v.optional(v.string()),
    hour: v.number(),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const pot = await ctx.db.get(args.potId);
    if (!viewer || !pot) return null;
    return evaluate(pot.rules, {
      amountCents: args.amountCents,
      category: args.category,
      merchant: args.merchant,
      hour: args.hour,
      spentTodayCents: pot.spentTodayCents,
      balanceCents: pot.balanceCents,
      paused: Boolean(viewer.user.agentsPaused),
    });
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
