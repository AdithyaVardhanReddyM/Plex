import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { agentUser } from "./lib/agentAuth";
import { formatCents } from "./lib/money";
import { logActivity } from "./agent";
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

/**
 * The brain changed a subscription outside PayPal (a plan switched on the merchant's site) and
 * records what it changed to, so Money and Insights show the new price. Logged in the feed.
 */
export const recordChange = mutation({
  args: {
    secret: v.string(),
    merchant: v.string(),
    plan: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    status: v.optional(v.union(v.literal("active"), v.literal("cancelled"), v.literal("paused"))),
    why: v.string(),
  },
  handler: async (ctx, { secret, merchant, plan, amountCents, status, why }) => {
    const user = await agentUser(ctx, secret);
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    const key = merchant.trim().toLowerCase();
    const sub = subs.find((s) => s.merchant.toLowerCase() === key) ?? subs.find((s) => s.merchant.toLowerCase().includes(key));
    if (!sub) return { ok: false as const, error: `No subscription called “${merchant}”.` };
    if (amountCents !== undefined && (!Number.isInteger(amountCents) || amountCents < 0))
      return { ok: false as const, error: "Amounts are whole cents." };
    const before = sub.amountCents;
    await ctx.db.patch(sub._id, {
      ...(plan ? { plan: plan.trim() } : {}),
      ...(amountCents !== undefined ? { amountCents, previousAmountCents: before } : {}),
      ...(status ? { status } : {}),
    });
    const saved = amountCents !== undefined ? before - amountCents : 0;
    await logActivity(ctx, {
      ownerId: user._id,
      kind: "money",
      title: `${sub.merchant}: ${plan ?? status ?? "updated"}${amountCents !== undefined ? `, ${formatCents(amountCents)}/${sub.cadence === "yearly" ? "yr" : "mo"}` : ""}`,
      detail: why,
    });
    return { ok: true as const, merchant: sub.merchant, savedCents: Math.max(0, saved), cadence: sub.cadence };
  },
});
