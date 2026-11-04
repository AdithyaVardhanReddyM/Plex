import { v } from "convex/values";
import { query } from "./_generated/server";
import { getViewer } from "./lib/viewer";

/** The viewer's receipts, newest first. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    return ctx.db
      .query("receipts")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", viewer.user._id))
      .order("desc")
      .take(limit ?? 50);
  },
});

export const get = query({
  args: { id: v.id("receipts") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const forTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) =>
    ctx.db
      .query("receipts")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect(),
});

export const forCause = query({
  args: { causeId: v.id("causes"), limit: v.optional(v.number()) },
  handler: async (ctx, { causeId, limit }) =>
    ctx.db
      .query("receipts")
      .withIndex("by_cause", (q) => q.eq("causeId", causeId))
      .order("desc")
      .take(limit ?? 50),
});
