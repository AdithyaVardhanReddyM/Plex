import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { agentUser } from "./lib/agentAuth";
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

/**
 * The brain saw when the user last opened an app (the Mac's Spotlight last-used date) and
 * records it on the subscription for that app, so "unused for 74 days" is a measured fact.
 */
export const noteUsage = mutation({
  args: { secret: v.string(), usage: v.array(v.object({ app: v.string(), lastUsedAt: v.number() })) },
  handler: async (ctx, { secret, usage }) => {
    const user = await agentUser(ctx, secret);
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    let updated = 0;
    for (const u of usage) {
      const app = norm(u.app);
      const sub = subs.find((s) => app && (norm(s.merchant).includes(app) || app.includes(norm(s.merchant))));
      if (sub && u.lastUsedAt > 0 && sub.lastUsedAt !== u.lastUsedAt) {
        await ctx.db.patch(sub._id, { lastUsedAt: u.lastUsedAt });
        updated++;
      }
    }
    return { updated };
  },
});
