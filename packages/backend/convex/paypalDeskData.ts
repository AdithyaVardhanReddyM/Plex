import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireActor } from "./lib/actor";
import { fundingCents } from "./lib/taskRules";

/**
 * The data side of the PayPal desk (paypalDesk.ts runs in Node for the PayPal
 * Agent Toolkit, so its queries and mutations live here).
 */

export const context = internalQuery({
  args: { taskId: v.id("tasks"), as: v.optional(v.string()), trusted: v.boolean() },
  handler: async (ctx, { taskId, as, trusted }) => {
    const task = await ctx.db.get(taskId);
    if (!task) throw new ConvexError("Task not found");
    if (!trusted) {
      const { user } = await requireActor(ctx, as);
      if (user._id !== task.posterId && user._id !== task.assigneeId)
        throw new ConvexError("Only the poster or the worker can ask the PayPal desk about this task.");
      if (task.paypalCheck && Date.now() - task.paypalCheck.at < 15_000) return null; // just asked
    }
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    const funding = receipts.find((r) => r.kind === "task_funding");
    const payout = receipts.find((r) => r.kind === "payout");
    const proof = await ctx.db
      .query("proofs")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .order("desc")
      .first();
    const worker = task.assigneeId ? await ctx.db.get(task.assigneeId) : null;
    return {
      title: task.title,
      status: task.status,
      funding: task.funding,
      heldCents: funding?.amountCents ?? fundingCents(task.payout),
      fundingState: funding?.state,
      paidCents: payout?.amountCents,
      payoutState: payout?.state,
      payoutBatchId: payout?.paypal?.payoutBatchId,
      split: payout?.split?.map((l) => ({ label: l.label, cents: l.cents, via: l.via })),
      worker: worker?.name,
      verdict: proof?.verdict
        ? {
            result: proof.verdict.result,
            confidence: proof.verdict.confidence,
            passed: proof.verdict.checks.filter((c) => c.passed).length,
            total: proof.verdict.checks.length,
            model: proof.verdict.model,
          }
        : null,
    };
  },
});

export const save = internalMutation({
  args: {
    taskId: v.id("tasks"),
    check: v.object({
      at: v.number(),
      model: v.string(),
      match: v.boolean(),
      summary: v.string(),
      facts: v.array(v.object({ label: v.string(), value: v.string(), ok: v.optional(v.boolean()) })),
      tools: v.array(v.string()),
      dispute: v.optional(
        v.object({
          id: v.string(),
          status: v.string(),
          reason: v.string(),
          amount: v.string(),
          action: v.union(v.literal("contest"), v.literal("accept")),
          why: v.string(),
        }),
      ),
    }),
  },
  handler: async (ctx, { taskId, check }) => {
    await ctx.db.patch(taskId, { paypalCheck: check });
  },
});
