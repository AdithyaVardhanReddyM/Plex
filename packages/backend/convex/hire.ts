import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActor } from "./lib/actor";
import { trustScore } from "./lib/hire";
import { ensureDemoAgents } from "./lib/hireSeed";
import { fundingCents } from "./lib/taskRules";
import { userByHandle } from "./lib/viewer";

/** Adds any missing demo agent (e.g. Pixel) without reseeding: `convex run hire:ensureAgents`. */
export const ensureAgents = internalMutation({
  args: {},
  handler: async (ctx) => Object.keys(await ensureDemoAgents(ctx)),
});

/**
 * Plex Hire: browse the people and AI agents who take work, see their
 * record, hire one directly, and review them after a paid task.
 * The trust score is computed in code from facts on Plex (`lib/hire.ts`).
 */

async function record(ctx: QueryCtx, u: Doc<"users">) {
  const reviews = await ctx.db
    .query("reviews")
    .withIndex("by_subject", (q) => q.eq("subjectId", u._id))
    .collect();
  const assigned = await ctx.db
    .query("tasks")
    .withIndex("by_assignee", (q) => q.eq("assigneeId", u._id))
    .collect();
  const disputes = assigned.filter((t) => t.status === "disputed" || (t.status === "refunded" && t.funding.captureId)).length;
  const trust = trustScore({
    rating: u.rating,
    proofPassRate: u.proofPassRate,
    tasksCompleted: u.tasksCompleted,
    disputes,
    reviews: reviews.length,
  });
  return { reviews, assigned, disputes, trust };
}

function card(u: Doc<"users">) {
  return {
    _id: u._id,
    handle: u.handle,
    name: u.name,
    kind: u.kind as "person" | "agent",
    avatarColor: u.avatarColor,
    area: u.area,
    bio: u.bio,
    skills: u.agentProfile?.specialties ?? u.skills ?? [],
    rating: u.rating,
    proofPassRate: u.proofPassRate,
    tasksCompleted: u.tasksCompleted ?? 0,
    agent: u.agentProfile
      ? {
          house: u.agentProfile.house,
          custom: Boolean(u.agentProfile.custom),
          model: u.agentProfile.model,
          tagline: u.agentProfile.tagline,
          turnaround: u.agentProfile.turnaround,
        }
      : null,
  };
}

/** Everyone who takes work: people with a track record, and agents. */
export const directory = query({
  args: { kind: v.optional(v.union(v.literal("person"), v.literal("agent"))), q: v.optional(v.string()) },
  handler: async (ctx, { kind, q }) => {
    const people = kind === "agent" ? [] : await ctx.db.query("users").withIndex("by_kind", (x) => x.eq("kind", "person")).collect();
    const agents = kind === "person" ? [] : await ctx.db.query("users").withIndex("by_kind", (x) => x.eq("kind", "agent")).collect();
    const workers = [...people.filter((p) => (p.skills?.length ?? 0) > 0), ...agents];
    const needle = q?.trim().toLowerCase();
    const rows = await Promise.all(
      workers
        .filter((u) => {
          if (!needle) return true;
          const hay = [u.name, u.area, u.bio, ...(u.skills ?? []), ...(u.agentProfile?.specialties ?? []), u.agentProfile?.tagline]
            .join(" ")
            .toLowerCase();
          return hay.includes(needle);
        })
        .map(async (u) => {
          const r = await record(ctx, u);
          return { ...card(u), trust: r.trust.score, reviewCount: r.reviews.length };
        }),
    );
    return rows.sort((a, b) => b.trust - a.trust);
  },
});

/** A profile page: the record, the trust breakdown, reviews and recent paid work. */
export const profile = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const u = await userByHandle(ctx, handle);
    if (!u || (u.kind !== "person" && u.kind !== "agent")) return null;
    const r = await record(ctx, u);
    const reviews = await Promise.all(
      r.reviews
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, 12)
        .map(async (rv) => {
          const author = await ctx.db.get(rv.authorId);
          const task = await ctx.db.get(rv.taskId);
          return { ...rv, authorName: author?.name ?? "Someone", authorColor: author?.avatarColor, taskTitle: task?.title ?? "" };
        }),
    );
    const recent = r.assigned
      .filter((t) => t.status === "paid")
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 8)
      .map((t) => ({ _id: t._id, title: t.title, category: t.category, cents: fundingCents(t.payout), at: t._creationTime }));
    const owner = u.agentProfile?.ownerId ? await ctx.db.get(u.agentProfile.ownerId) : null;
    return {
      ...card(u),
      trust: r.trust,
      disputes: r.disputes,
      reviews,
      recent,
      ownerName: owner?.name ?? (u.agentProfile?.house ? "Plex" : undefined),
      inProgress: r.assigned.filter((t) => ["assigned", "submitted", "verifying"].includes(t.status)).length,
    };
  },
});

/** The poster reviews whoever was paid. One review per task, only after payment. */
export const leaveReview = mutation({
  args: { taskId: v.id("tasks"), stars: v.number(), text: v.string(), as: v.optional(v.string()) },
  handler: async (ctx, { taskId, stars, text, as }) => {
    const { user } = await requireActor(ctx, as);
    const task = await ctx.db.get(taskId);
    if (!task || task.posterId !== user._id) throw new ConvexError("Only the poster can review this task.");
    if (task.status !== "paid" || !task.assigneeId) throw new ConvexError("Reviews open once the worker is paid.");
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new ConvexError("Pick 1 to 5 stars.");
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .first();
    if (existing) throw new ConvexError("You already reviewed this task.");
    const id = await ctx.db.insert("reviews", {
      taskId,
      authorId: user._id,
      subjectId: task.assigneeId,
      stars,
      text: text.trim().slice(0, 600),
      receiptId: task.payoutReceiptId,
    });
    // Keep the shown rating honest: earlier paid tasks count at the old rating,
    // plus every verified review.
    const worker = await ctx.db.get(task.assigneeId);
    if (worker) {
      const all = await ctx.db
        .query("reviews")
        .withIndex("by_subject", (q) => q.eq("subjectId", worker._id))
        .collect();
      const prior = worker.rating !== undefined ? Math.max(0, (worker.tasksCompleted ?? 0) - all.length) : 0;
      const sum = (worker.rating ?? 0) * prior + all.reduce((s, x) => s + x.stars, 0);
      await ctx.db.patch(worker._id, { rating: Math.round((sum / (prior + all.length)) * 100) / 100 });
    }
    return id as Id<"reviews">;
  },
});
