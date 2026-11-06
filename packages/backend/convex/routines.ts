import { ConvexError, v, type Infer } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { routineSpec, runStatus, runStepKind } from "./schema";
import { agentUser } from "./lib/agentAuth";
import { nextRunAt, safeTimezone } from "./lib/schedule";
import { requireViewer, getViewer } from "./lib/viewer";
import { logActivity } from "./agent";

/**
 * Routines: standing instructions compiled once (by the brain) into a `spec`,
 * then run by the brain's scheduler. Convex keeps the routine, its next run
 * time and every run's step log. Money steps still go through agentMoney:pay
 * and the policy engine.
 */

const routineFields = {
  name: v.string(),
  prompt: v.string(),
  icon: v.string(),
  spec: routineSpec,
  runWhere: v.union(v.literal("mac"), v.literal("cloud")),
  missed: v.union(v.literal("run_on_wake"), v.literal("skip")),
  timezone: v.string(),
};

type RoutineInput = {
  name: string;
  prompt: string;
  icon: string;
  spec: Infer<typeof routineSpec>;
  runWhere: "mac" | "cloud";
  missed: "run_on_wake" | "skip";
  timezone: string;
  routineId?: Id<"routines">;
};

async function saveRoutine(ctx: MutationCtx, ownerId: Id<"users">, input: RoutineInput) {
  const { routineId, ...fields } = input;
  const name = fields.name.trim().slice(0, 120) || "Untitled routine";
  const timezone = safeTimezone(fields.timezone);
  const now = Date.now();
  const doc = { ...fields, name, timezone, nextRunAt: nextRunAt(fields.spec.trigger, timezone, now) };
  if (routineId) {
    const existing = await ctx.db.get(routineId);
    if (!existing || existing.ownerId !== ownerId) throw new ConvexError("Routine not found");
    await ctx.db.patch(routineId, { ...doc, nextRunAt: existing.enabled ? doc.nextRunAt : undefined });
    return routineId;
  }
  const id = await ctx.db.insert("routines", { ...doc, ownerId, enabled: true, createdAt: now });
  await logActivity(ctx, {
    ownerId,
    kind: "routine",
    title: `New routine: ${name}`,
    detail: fields.spec.summary,
    routineId: id,
  });
  return id;
}

async function ownRoutine(ctx: QueryCtx, ownerId: Id<"users">, routineId: Id<"routines">) {
  const routine = await ctx.db.get(routineId);
  if (!routine || routine.ownerId !== ownerId) throw new ConvexError("Routine not found");
  return routine;
}

async function ownRun(ctx: QueryCtx, ownerId: Id<"users">, runId: Id<"routineRuns">) {
  const run = await ctx.db.get(runId);
  if (!run || run.ownerId !== ownerId) throw new ConvexError("Run not found");
  return run;
}

async function recentRuns(ctx: QueryCtx, routineId: Id<"routines">, n: number) {
  return ctx.db
    .query("routineRuns")
    .withIndex("by_routine", (q) => q.eq("routineId", routineId))
    .order("desc")
    .take(n);
}

/** After a scheduled run (or skip), move the clock to the next slot. A Run now leaves it alone. */
function advancedNextRun(routine: Doc<"routines">, now: number) {
  if (!routine.enabled || routine.nextRunAt === undefined || routine.nextRunAt > now) return routine.nextRunAt;
  return nextRunAt(routine.spec.trigger, routine.timezone, now);
}

// ── Main window ──────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const routines = await ctx.db
      .query("routines")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer.user._id))
      .collect();
    const out = await Promise.all(
      routines.map(async (r) => {
        const [last] = await recentRuns(ctx, r._id, 1);
        return {
          ...r,
          lastRun: last ? { status: last.status, summary: last.summary, startedAt: last.startedAt } : undefined,
        };
      }),
    );
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const get = query({
  args: { routineId: v.id("routines") },
  handler: async (ctx, { routineId }) => {
    const viewer = await getViewer(ctx);
    const routine = await ctx.db.get(routineId);
    if (!viewer || !routine || routine.ownerId !== viewer.user._id) return null;
    return { routine, runs: await recentRuns(ctx, routineId, 20) };
  },
});

/** Saves a reviewed routine. Pass `routineId` to replace an existing one's definition. */
export const save = mutation({
  args: { ...routineFields, routineId: v.optional(v.id("routines")) },
  handler: async (ctx, args) => {
    const { user } = await requireViewer(ctx);
    return saveRoutine(ctx, user._id, args);
  },
});

export const setEnabled = mutation({
  args: { routineId: v.id("routines"), enabled: v.boolean() },
  handler: async (ctx, { routineId, enabled }) => {
    const { user } = await requireViewer(ctx);
    const routine = await ownRoutine(ctx, user._id, routineId);
    await ctx.db.patch(routineId, {
      enabled,
      nextRunAt: enabled ? nextRunAt(routine.spec.trigger, routine.timezone, Date.now()) : undefined,
    });
    return null;
  },
});

export const remove = mutation({
  args: { routineId: v.id("routines") },
  handler: async (ctx, { routineId }) => {
    const { user } = await requireViewer(ctx);
    await ownRoutine(ctx, user._id, routineId);
    const runs = await ctx.db
      .query("routineRuns")
      .withIndex("by_routine", (q) => q.eq("routineId", routineId))
      .collect();
    for (const run of runs) await ctx.db.delete(run._id);
    await ctx.db.delete(routineId);
    return null;
  },
});

/** A `queued` run; the brain's scheduler starts it within a few seconds. */
export const runNow = mutation({
  args: { routineId: v.id("routines") },
  handler: async (ctx, { routineId }) => {
    const { user } = await requireViewer(ctx);
    await ownRoutine(ctx, user._id, routineId);
    const now = Date.now();
    return ctx.db.insert("routineRuns", {
      routineId,
      ownerId: user._id,
      status: "queued",
      reason: "Run now",
      startedAt: now,
      steps: [{ at: now, kind: "info", label: "You asked for a run now" }],
      receiptIds: [],
    });
  },
});

// ── Brain ────────────────────────────────────────────────────────────────────

/** Routines whose time has come, and runs queued by Run now or a PayPal event. */
export const due = query({
  args: { secret: v.string(), now: v.number() },
  handler: async (ctx, { secret, now }) => {
    const user = await agentUser(ctx, secret);
    const dueRoutines = await ctx.db
      .query("routines")
      .withIndex("by_next", (q) => q.eq("enabled", true).lte("nextRunAt", now))
      .collect();
    const queuedRuns = await ctx.db
      .query("routineRuns")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
    const mine = queuedRuns.filter((r) => r.ownerId === user._id);
    const names = new Map<Id<"routines">, string>();
    for (const run of mine) {
      if (!names.has(run.routineId)) names.set(run.routineId, (await ctx.db.get(run.routineId))?.name ?? "Routine");
    }
    return {
      due: dueRoutines.filter((r) => r.ownerId === user._id && r.nextRunAt !== undefined),
      queued: mine.map((r) => ({ ...r, routineName: names.get(r.routineId)! })),
    };
  },
});

export const startRun = mutation({
  args: { secret: v.string(), routineId: v.id("routines"), reason: v.string(), runId: v.optional(v.id("routineRuns")) },
  handler: async (ctx, { secret, routineId, reason, runId }) => {
    const user = await agentUser(ctx, secret);
    const routine = await ownRoutine(ctx, user._id, routineId);
    const now = Date.now();
    let id: Id<"routineRuns">;
    if (runId) {
      const run = await ownRun(ctx, user._id, runId);
      if (run.routineId !== routineId) throw new ConvexError("That run belongs to another routine");
      if (run.status !== "queued") return runId; // already picked up
      await ctx.db.patch(runId, {
        status: "running",
        reason,
        startedAt: now,
        steps: [...run.steps, { at: now, kind: "info", label: `Started: ${reason}` }],
      });
      id = runId;
    } else {
      id = await ctx.db.insert("routineRuns", {
        routineId,
        ownerId: user._id,
        status: "running",
        reason,
        startedAt: now,
        steps: [{ at: now, kind: "info", label: `Started: ${reason}` }],
        receiptIds: [],
      });
    }
    await ctx.db.patch(routineId, {
      nextRunAt: advancedNextRun(routine, now),
      lastRunAt: now,
      lastStatus: "running",
    });
    return id;
  },
});

export const skipRun = mutation({
  args: { secret: v.string(), routineId: v.id("routines"), reason: v.string() },
  handler: async (ctx, { secret, routineId, reason }) => {
    const user = await agentUser(ctx, secret);
    const routine = await ownRoutine(ctx, user._id, routineId);
    const now = Date.now();
    const id = await ctx.db.insert("routineRuns", {
      routineId,
      ownerId: user._id,
      status: "skipped",
      reason,
      startedAt: now,
      endedAt: now,
      steps: [{ at: now, kind: "info", label: reason }],
      summary: reason,
      receiptIds: [],
    });
    await ctx.db.patch(routineId, {
      nextRunAt: advancedNextRun(routine, now),
      lastRunAt: now,
      lastStatus: "skipped",
      lastSummary: reason,
    });
    await logActivity(ctx, {
      ownerId: user._id,
      kind: "routine",
      title: `Skipped “${routine.name}”`,
      detail: reason,
      runId: id,
      routineId,
    });
    return id;
  },
});

export const logStep = mutation({
  args: {
    secret: v.string(),
    runId: v.id("routineRuns"),
    kind: runStepKind,
    label: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, { secret, runId, kind, label, detail }) => {
    const user = await agentUser(ctx, secret);
    const run = await ownRun(ctx, user._id, runId);
    await ctx.db.patch(runId, {
      steps: [...run.steps, { at: Date.now(), kind, label: label.slice(0, 500), detail: detail?.slice(0, 4_000) }],
    });
    return null;
  },
});

const FINISHED_TITLE: Record<string, (name: string) => string> = {
  done: (n) => `Ran “${n}”`,
  failed: (n) => `“${n}” didn't finish`,
  cancelled: (n) => `Stopped “${n}”`,
  skipped: (n) => `Skipped “${n}”`,
};

export const finishRun = mutation({
  args: { secret: v.string(), runId: v.id("routineRuns"), status: runStatus, summary: v.string() },
  handler: async (ctx, { secret, runId, status, summary }) => {
    const user = await agentUser(ctx, secret);
    const run = await ownRun(ctx, user._id, runId);
    const routine = await ctx.db.get(run.routineId);
    const now = Date.now();
    const final = status === "queued" || status === "running" || status === "waiting" ? "done" : status;
    await ctx.db.patch(runId, {
      status: final,
      summary,
      endedAt: now,
      askId: undefined,
      steps: [
        ...run.steps,
        { at: now, kind: final === "failed" ? "error" : "done", label: final === "done" ? "Done" : final, detail: summary },
      ],
    });
    if (routine) {
      await ctx.db.patch(routine._id, { lastRunAt: run.startedAt, lastStatus: final, lastSummary: summary });
      await logActivity(ctx, {
        ownerId: user._id,
        kind: "routine",
        title: (FINISHED_TITLE[final] ?? FINISHED_TITLE.done)(routine.name),
        detail: summary,
        runId,
        routineId: routine._id,
        receiptId: run.receiptIds[0],
      });
    }
    return null;
  },
});

export const context = query({
  args: { secret: v.string(), routineId: v.id("routines") },
  handler: async (ctx, { secret, routineId }) => {
    const user = await agentUser(ctx, secret);
    const routine = await ownRoutine(ctx, user._id, routineId);
    return { routine, recentRuns: await recentRuns(ctx, routineId, 5) };
  },
});

/** Voice: "do this every Friday". Same as `save`, for the brain. */
export const saveFromBrain = mutation({
  args: { secret: v.string(), ...routineFields, routineId: v.optional(v.id("routines")) },
  handler: async (ctx, { secret, ...args }) => {
    const user = await agentUser(ctx, secret);
    return saveRoutine(ctx, user._id, args);
  },
});

// ── PayPal-triggered runs (called from webhooks.ts) ──────────────────────────

/** Queues a run for every enabled routine whose trigger is this PayPal event. */
export const queueForPaypalEvent = internalMutation({
  args: { eventType: v.string(), resourceId: v.optional(v.string()), summary: v.optional(v.string()), trigger: v.optional(v.any()) },
  handler: async (ctx, { eventType, resourceId, summary, trigger }) => {
    const routines = await ctx.db.query("routines").collect();
    const matching = routines.filter(
      (r) => r.enabled && r.spec.trigger.kind === "paypal" && r.spec.trigger.event.toUpperCase() === eventType.toUpperCase(),
    );
    const now = Date.now();
    for (const r of matching) {
      const label = r.spec.trigger.kind === "paypal" ? r.spec.trigger.label : eventType;
      await ctx.db.insert("routineRuns", {
        routineId: r._id,
        ownerId: r.ownerId,
        status: "queued",
        reason: `PayPal: ${label}`,
        startedAt: now,
        steps: [
          {
            at: now,
            kind: "info",
            label: `PayPal sent ${eventType}`,
            detail: [resourceId && `Resource ${resourceId}`, summary].filter(Boolean).join(" · ") || undefined,
          },
        ],
        receiptIds: [],
        trigger,
      });
    }
    return matching.length;
  },
});
