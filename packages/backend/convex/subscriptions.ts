import { query } from "./_generated/server";
import { getViewer } from "./lib/viewer";

/** The viewer's subscriptions: active ones by next charge, then paused and cancelled. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer.user._id))
      .collect();
    const rank = { active: 0, paused: 1, cancelled: 2 } as const;
    return subs.sort((a, b) => rank[a.status] - rank[b.status] || a.nextChargeAt - b.nextChargeAt);
  },
});
