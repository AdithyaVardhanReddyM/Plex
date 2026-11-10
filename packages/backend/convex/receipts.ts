import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getViewer } from "./lib/viewer";

type Viewer = Awaited<ReturnType<typeof getViewer>>;

/**
 * Labels are stored when a receipt is written. On the viewer's own side, show the
 * name they have now, so whoever is signed in sees their own name.
 */
function withLiveNames(viewer: Viewer, r: Doc<"receipts">): Doc<"receipts"> {
  if (!viewer) return r;
  const me = viewer.user;
  return {
    ...r,
    payerLabel: r.payerId === me._id ? me.name : r.payerLabel,
    payeeLabel: r.payeeId === me._id ? me.name : r.payeeLabel,
  };
}

/** The viewer's receipts, newest first. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const rows = await ctx.db
      .query("receipts")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", viewer.user._id))
      .order("desc")
      .take(limit ?? 50);
    return rows.map((r) => withLiveNames(viewer, r));
  },
});

export const get = query({
  args: { id: v.id("receipts") },
  handler: async (ctx, { id }) => {
    const r = await ctx.db.get(id);
    return r && withLiveNames(await getViewer(ctx), r);
  },
});

export const forTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const viewer = await getViewer(ctx);
    const rows = await ctx.db
      .query("receipts")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    return rows.map((r) => withLiveNames(viewer, r));
  },
});
