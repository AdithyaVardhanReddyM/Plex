import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { internalAction, internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActor } from "./lib/actor";
import { generateStructured } from "./lib/ai";
import { canTake, specialtyHits } from "./lib/hire";
import { formatCents } from "./lib/money";
import { splitTermsFor } from "./lib/split";
import { distanceM, formatDistance, fundingCents, lookupPlace } from "./lib/taskRules";

/**
 * Applications and the Match agent. Workers (or their agents) apply with an
 * ask and a message; Match ranks them with a score and a one-line reason.
 */

export const apply = mutation({
  args: {
    taskId: v.id("tasks"),
    askCents: v.number(),
    message: v.string(),
    as: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, askCents, message, as }) => {
    const { user } = await requireActor(ctx, as);
    const task = await ctx.db.get(taskId);
    if (!task) throw new ConvexError("Task not found");
    if (task.posterId === user._id) throw new ConvexError("You posted this task.");
    if (task.status !== "open") throw new ConvexError("This task isn't taking applications.");
    const allowed = canTake(task, user);
    if (!allowed.ok) throw new ConvexError(allowed.reason);
    if (!Number.isInteger(askCents) || askCents < 100) throw new ConvexError("Ask at least $1.");
    const existing = await ctx.db
      .query("applications")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    const mine = existing.find((a) => a.applicantId === user._id && a.status !== "withdrawn");
    if (mine) throw new ConvexError("You already applied.");
    const id = await ctx.db.insert("applications", {
      taskId,
      applicantId: user._id,
      viaAgent: false,
      askCents,
      message: message.trim().slice(0, 600),
      status: "pending",
    });
    await ctx.scheduler.runAfter(0, internal.applications.match, { applicationId: id });
    return id;
  },
});

export const withdraw = mutation({
  args: { applicationId: v.id("applications"), as: v.optional(v.string()) },
  handler: async (ctx, { applicationId, as }) => {
    const { user } = await requireActor(ctx, as);
    const app = await ctx.db.get(applicationId);
    if (!app || app.applicantId !== user._id) throw new ConvexError("Application not found");
    if (app.status !== "pending") throw new ConvexError("Only pending applications can be withdrawn.");
    await ctx.db.patch(applicationId, { status: "withdrawn" });
  },
});

/** Poster accepts or declines. Accepting assigns the task. */
export const decide = mutation({
  args: { applicationId: v.id("applications"), accept: v.boolean(), as: v.optional(v.string()) },
  handler: async (ctx, { applicationId, accept, as }) => {
    const { user } = await requireActor(ctx, as);
    await decideAs(ctx, user._id, applicationId, accept);
  },
});

/** The poster's agent decides through the API (`/api/v1/tasks/:id/accept`). */
export const decideFor = internalMutation({
  args: { applicationId: v.id("applications"), posterId: v.id("users"), accept: v.boolean() },
  handler: (ctx, { applicationId, posterId, accept }) => decideAs(ctx, posterId, applicationId, accept),
});

/**
 * Hands-free tasks: hire the best pending bid. Best is Match's score (code and
 * model facts: rating, proof record, ask vs budget), then the lower ask.
 */
export const autoAccept = internalMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task?.autoHire || task.status !== "open" || task.funding.state === "unfunded") return;
    const apps = await ctx.db
      .query("applications")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    const applicants = new Map((await Promise.all(apps.map((a) => ctx.db.get(a.applicantId)))).flatMap((u) => (u ? [[u._id, u] as const] : [])));
    // Best: Match's score, then the closer specialty fit, then the lower ask.
    const best = apps
      .filter((a) => a.status === "pending")
      .map((a) => ({ a, fit: fitFor(task, applicants.get(a.applicantId)) }))
      .sort((x, y) => (y.a.matchScore ?? 0) - (x.a.matchScore ?? 0) || y.fit - x.fit || x.a.askCents - y.a.askCents)[0]?.a;
    if (!best) return;
    await decideAs(ctx, task.posterId, best._id, true);
  },
});

async function decideAs(ctx: MutationCtx, posterId: Id<"users">, applicationId: Id<"applications">, accept: boolean) {
  const app = await ctx.db.get(applicationId);
  if (!app) throw new ConvexError("Application not found");
  const task = await ctx.db.get(app.taskId);
  if (!task || task.posterId !== posterId) throw new ConvexError("Only the poster can decide.");
  if (app.status !== "pending") throw new ConvexError("Already decided.");
  if (!accept) {
    await ctx.db.patch(applicationId, { status: "declined" });
    return;
  }
  if (task.status !== "open") throw new ConvexError("This task isn't open.");
  if (task.funding.state === "unfunded") throw new ConvexError("Fund the task before accepting someone.");
  const worker = await ctx.db.get(app.applicantId);
  if (!worker) throw new ConvexError("That applicant no longer exists.");
  await ctx.db.patch(applicationId, { status: "accepted" });
  // The fee terms are locked now, so a later rate change never touches agreed work.
  await ctx.db.patch(task._id, { status: "assigned", assigneeId: app.applicantId, split: splitTermsFor(worker, Date.now()) });
  // A Plex house agent starts on the work the moment it's hired.
  if (worker?.kind === "agent" && worker.agentProfile?.house)
    await ctx.scheduler.runAfter(1500, internal.houseAgents.work, { taskId: task._id, agentId: worker._id });
  if ((task.spots ?? 1) <= 1) {
    const others = await ctx.db
      .query("applications")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();
    for (const o of others)
      if (o._id !== applicationId && o.status === "pending") await ctx.db.patch(o._id, { status: "declined" });
  }
}

/** Re-runs Match for every pending applicant on a task. */
export const rerank = mutation({
  args: { taskId: v.id("tasks"), as: v.optional(v.string()) },
  handler: async (ctx, { taskId, as }) => {
    const { user } = await requireActor(ctx, as);
    const task = await ctx.db.get(taskId);
    if (!task || task.posterId !== user._id) throw new ConvexError("Only the poster can re-rank.");
    const apps = await ctx.db
      .query("applications")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    for (const a of apps)
      if (a.status === "pending") {
        await ctx.db.patch(a._id, { matchScore: undefined, matchReason: undefined });
        await ctx.scheduler.runAfter(0, internal.applications.match, { applicationId: a._id });
      }
  },
});

// ── Match agent ──────────────────────────────────────────────────────────────

export const matchContext = internalQuery({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    const app = await ctx.db.get(applicationId);
    if (!app) return null;
    const task = await ctx.db.get(app.taskId);
    const applicant = await ctx.db.get(app.applicantId);
    if (!task || !applicant) return null;
    return { app, task, applicant };
  },
});

export const saveMatch = internalMutation({
  args: { applicationId: v.id("applications"), score: v.number(), reason: v.string(), model: v.string() },
  handler: async (ctx, { applicationId, score, reason, model }) => {
    await ctx.db.patch(applicationId, {
      matchScore: Math.max(0, Math.min(100, Math.round(score))),
      matchReason: reason.slice(0, 160),
      matchModel: model,
    });
  },
});

const matchSchema = z.object({
  score: z.number().min(0).max(100).describe("How well this person fits, 0-100"),
  reason: z
    .string()
    .describe("One line of facts separated by ' · ', e.g. '0.3 km away · 4.9 rating · 98% proof pass rate · asks the posted price'"),
});

export const match = internalAction({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    const c = await ctx.runQuery(internal.applications.matchContext, { applicationId });
    if (!c) return;
    const facts = matchFacts(c.task, c.applicant, c.app);
    const result = await generateStructured({
      name: "match",
      schema: matchSchema,
      system:
        "You are Plex's Match agent. Rank one applicant for one task from the facts given. Weigh distance for local work, proof pass rate, rating, relevant skills (for AI agents, how many of their specialties the task needs), and the ask against the budget. Never invent facts. The reason is one short line of the most decisive facts.",
      prompt: JSON.stringify({
        task: { title: c.task.title, category: c.task.category, location: c.task.location?.label, budget: formatCents(fundingCents(c.task.payout)), windowEnd: new Date(c.task.windowEnd).toISOString() },
        applicant: { name: c.applicant.name, area: c.applicant.area, skills: c.applicant.skills, rating: c.applicant.rating, proofPassRate: c.applicant.proofPassRate, tasksCompleted: c.applicant.tasksCompleted, ask: formatCents(c.app.askCents), message: c.app.message },
        computed: facts.parts,
      }),
      fallback: () => ({ score: facts.score, reason: facts.parts.join(" · ") }),
    });
    await ctx.runMutation(internal.applications.saveMatch, {
      applicationId,
      score: result.object.score,
      reason: result.object.reason,
      model: result.model,
    });
  },
});

/** How many of an agent's specialties the task asks for (0 for people). */
const fitFor = (task: Doc<"tasks">, u: Doc<"users"> | undefined) =>
  u?.agentProfile ? specialtyHits(task, u.agentProfile.specialties).length : 0;

/** Deterministic Match: distance, rating, pass rate, ask vs budget, skills. */
export function matchFacts(task: Doc<"tasks">, u: Doc<"users">, app: Doc<"applications">) {
  const parts: string[] = [];
  let score = 50;
  if (u.agentProfile) {
    const fit = fitFor(task, u);
    parts.push(fit ? `fits ${fit} of its specialties` : "not its specialty");
    score += fit * 5 - (fit ? 0 : 10);
  }

  const home = u.area ? lookupPlace(u.area) : undefined;
  const remoteWorker = /remote/i.test(u.area ?? "");
  if (task.location?.lat !== undefined && task.location.lng !== undefined) {
    if (home && !remoteWorker) {
      const d = distanceM({ lat: task.location.lat, lng: task.location.lng! }, home);
      parts.push(`${formatDistance(d)} away`);
      score += d < 1000 ? 20 : d < 3000 ? 12 : d < 10_000 ? 2 : -12;
    } else {
      parts.push(remoteWorker ? "Remote-first, not local" : "Distance unknown");
      score -= remoteWorker ? 14 : 4;
    }
  } else if (task.category !== "local" && task.category !== "impact") {
    score += 6;
  }

  if (u.rating !== undefined) {
    parts.push(`${u.rating} rating`);
    score += (u.rating - 4.5) * 24;
  } else parts.push("New to Plex");
  if (u.proofPassRate !== undefined) {
    parts.push(`${Math.round(u.proofPassRate * 100)}% proof pass rate`);
    score += (u.proofPassRate - 0.9) * 80;
  }

  const budget = fundingCents(task.payout);
  const diff = app.askCents - budget;
  if (diff === 0) parts.push("asks the posted price");
  else if (diff > 0) {
    parts.push(`asks ${formatCents(diff)} above budget`);
    score -= Math.min(20, (diff / budget) * 60);
  } else {
    parts.push(`asks ${formatCents(-diff)} under budget`);
    score += 3;
  }

  const words = `${task.title} ${task.tags.join(" ")} ${task.category}`.toLowerCase();
  const skill = u.skills?.find((s) => words.includes(s.toLowerCase().split(" ")[0]!));
  if (skill) {
    parts.push(skill);
    score += 6;
  }
  if (/agent/i.test(app.message) || app.viaAgent) parts.push("applied by their agent");

  return { score: Math.max(5, Math.min(99, Math.round(score))), parts: parts.slice(0, 5) };
}
