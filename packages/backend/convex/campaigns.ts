import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Campaigns: a brand pays creators per verified result (views), and the money
 * goes with the cause's story. Earnings are computed from the rule in code,
 * never by a model.
 */

type PerResult = Extract<Doc<"campaigns">["rule"], { kind: "per_result" }>;

/** What a creator has earned under a per-result rule for `views`. */
export function earnedFor(rule: Doc<"campaigns">["rule"], views: number): number {
  if (rule.kind !== "per_result") return 0;
  const r: PerResult = rule;
  const base = Math.floor(views / 1000) * r.perThousandViewsCents;
  const bonus = r.bonusAtViews && r.bonusCents && views >= r.bonusAtViews ? r.bonusCents : 0;
  return Math.min(base + bonus, r.capCents);
}

/** A cause's live campaign, with its creator leaderboard. Public. */
export const forCause = query({
  args: { causeId: v.id("causes") },
  handler: async (ctx, { causeId }) => {
    const campaign = (await ctx.db.query("campaigns").collect()).find(
      (c) => c.causeId === causeId && c.status === "live",
    );
    if (!campaign) return null;
    const brand = await ctx.db.get(campaign.brandId);
    const entries = await ctx.db
      .query("campaignEntries")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
    const board = await Promise.all(
      entries.map(async (e) => {
        const creator = await ctx.db.get(e.creatorId);
        const earned = earnedFor(campaign.rule, e.views);
        return {
          _id: e._id,
          firstName: (creator?.name ?? "Creator").split(/\s+/)[0]!,
          avatarColor: creator?.avatarColor,
          platform: e.platform,
          postUrl: e.postUrl,
          views: e.views,
          earnedCents: earned,
          paidCents: Math.min(e.paidCents, earned),
        };
      }),
    );
    board.sort((a, b) => b.views - a.views);
    const rule = campaign.rule.kind === "per_result" ? campaign.rule : null;
    return {
      _id: campaign._id,
      name: campaign.name,
      brief: campaign.brief,
      brand: { name: brand?.name ?? "", avatarColor: brand?.avatarColor },
      rule,
      budgetCents: campaign.budgetCents,
      spentCents: campaign.spentCents,
      totalViews: board.reduce((s, b) => s + b.views, 0),
      totalEarnedCents: board.reduce((s, b) => s + b.earnedCents, 0),
      board,
    };
  },
});
