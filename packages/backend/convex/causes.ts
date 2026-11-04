import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer } from "./lib/viewer";

/**
 * Plex Causes: donations that buy specific, paid units of local work.
 * Impact Tasks live in the `tasks` table (category "impact", `by_cause`),
 * built by the Tasks surface; this file only reads them.
 */

/** What one task costs to fund in full, in cents. */
export function taskCostCents(task: Doc<"tasks">): { perSpot: number; spots: number; total: number } {
  const spots = task.spots ?? 1;
  const perSpot =
    task.payout.kind === "fixed"
      ? task.payout.amountCents
      : task.payout.kind === "per_unit"
        ? task.payout.amountCents * task.payout.maxUnits
        : task.payout.capCents;
  return { perSpot, spots, total: perSpot * spots };
}

const OPEN_TASK: Array<Doc<"tasks">["status"]> = ["open", "assigned", "submitted", "verifying"];
const DONE_TASK: Array<Doc<"tasks">["status"]> = ["approved", "paid"];

const firstName = (label: string) => label.split(/\s+/)[0] ?? label;

/** Donor wall labels never carry more than a first name and an initial. */
export function donorWallLabel(label: string) {
  const parts = label.trim().split(/\s+/);
  if (parts.length < 2 || /^anonymous$/i.test(label)) return label.trim() || "Anonymous";
  const last = parts[parts.length - 1]!;
  return `${parts[0]} ${last.endsWith(".") ? last : last[0]!.toUpperCase() + "."}`;
}

async function impactTasks(ctx: QueryCtx, causeId: Id<"causes">) {
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_cause", (q) => q.eq("causeId", causeId))
    .collect();
  return tasks.filter((t) => t.status !== "draft" && t.status !== "cancelled");
}

async function taskSummary(ctx: QueryCtx, task: Doc<"tasks">) {
  const cost = taskCostCents(task);
  const donations = await ctx.db
    .query("donations")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  const fundedCents = donations.reduce((s, d) => s + d.amountCents, 0);
  const apps = await ctx.db
    .query("applications")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  const accepted = apps.filter((a) => a.status === "accepted").length;
  const filled = DONE_TASK.includes(task.status)
    ? cost.spots
    : Math.min(cost.spots, Math.max(accepted, task.assigneeId ? 1 : 0));
  return {
    _id: task._id,
    title: task.title,
    description: task.description,
    brief: task.brief,
    location: task.location ?? null,
    windowStart: task.windowStart,
    windowEnd: task.windowEnd,
    status: task.status,
    open: OPEN_TASK.includes(task.status),
    done: DONE_TASK.includes(task.status),
    perSpotCents: cost.perSpot,
    spots: cost.spots,
    filled,
    costCents: cost.total,
    fundedCents: Math.min(fundedCents, cost.total),
    donorsCount: donations.length,
    proofLabels: task.proofSpec.map((p) => p.label),
    tags: task.tags,
  };
}

/** Released payouts for a cause's tasks: who was paid, first names only. */
async function workersPaid(ctx: QueryCtx, tasks: Doc<"tasks">[]) {
  const out: Array<{
    receiptId: Id<"receipts">;
    firstName: string;
    avatarColor?: string;
    amountCents: number;
    at: number;
    taskTitle: string;
  }> = [];
  for (const task of tasks) {
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();
    for (const r of receipts) {
      if (r.kind !== "payout" || (r.state !== "released" && r.state !== "paid")) continue;
      const payee = r.payeeId ? await ctx.db.get(r.payeeId) : null;
      out.push({
        receiptId: r._id,
        firstName: firstName(payee?.name ?? r.payeeLabel),
        avatarColor: payee?.avatarColor,
        amountCents: r.amountCents,
        at: r.occurredAt,
        taskTitle: task.title,
      });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

function unitFor(cause: Doc<"causes">, tasks: Doc<"tasks">[]) {
  if (cause.unitCents && cause.unitLabel) return { cents: cause.unitCents, label: cause.unitLabel };
  const open = tasks.find((t) => t.payout.kind === "fixed");
  if (!open) return null;
  return { cents: taskCostCents(open).perSpot, label: `pays one person for one "${open.title}" shift` };
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** The causes directory. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const causes = await ctx.db
      .query("causes")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .collect();
    return Promise.all(
      causes.map(async (c) => {
        const org = await ctx.db.get(c.orgId);
        const tasks = await impactTasks(ctx, c._id);
        const open = tasks.filter((t) => OPEN_TASK.includes(t.status));
        return {
          _id: c._id,
          slug: c.slug,
          name: c.name,
          tagline: c.tagline,
          coverHue: c.coverHue,
          locationLabel: c.location.label,
          goalCents: c.goalCents,
          raisedCents: c.raisedCents,
          donorsCount: c.donorsCount,
          workersPaidCount: c.workersPaidCount,
          tags: c.tags,
          org: { name: org?.name ?? "", avatarColor: org?.avatarColor },
          openTasks: open.length,
          openSpots: open.reduce((s, t) => s + (t.spots ?? 1), 0),
          unit: unitFor(c, tasks),
        };
      }),
    );
  },
});

/** Everything a cause page shows. Public: no viewer needed. */
export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const cause = await ctx.db
      .query("causes")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!cause) return null;
    const org = await ctx.db.get(cause.orgId);
    const tasks = await impactTasks(ctx, cause._id);
    const summaries = await Promise.all(tasks.map((t) => taskSummary(ctx, t)));
    summaries.sort((a, b) => Number(b.open) - Number(a.open) || a.windowStart - b.windowStart);

    const donations = await ctx.db
      .query("donations")
      .withIndex("by_cause", (q) => q.eq("causeId", cause._id))
      .order("desc")
      .take(24);
    const taskTitle = new Map(tasks.map((t) => [t._id, t.title]));
    const feed = donations.map((d) => ({
      _id: d._id,
      donorLabel: donorWallLabel(d.donorLabel),
      amountCents: d.amountCents,
      at: d._creationTime,
      taskTitle: d.taskId ? (taskTitle.get(d.taskId) ?? null) : null,
      recurring: d.recurring,
      source: d.source,
      message: d.message ?? null,
    }));

    const workers = await workersPaid(ctx, tasks);
    const campaigns = (await ctx.db.query("campaigns").collect()).filter(
      (c) => c.causeId === cause._id && c.status === "live",
    );
    const brand = campaigns[0] ? await ctx.db.get(campaigns[0].brandId) : null;

    return {
      cause: {
        _id: cause._id,
        slug: cause.slug,
        name: cause.name,
        tagline: cause.tagline,
        story: cause.story,
        location: cause.location,
        coverHue: cause.coverHue,
        goalCents: cause.goalCents,
        raisedCents: cause.raisedCents,
        donorsCount: cause.donorsCount,
        workersPaidCount: cause.workersPaidCount,
        tags: cause.tags,
        status: cause.status,
      },
      org: {
        name: org?.name ?? "",
        avatarColor: org?.avatarColor,
        bio: org?.bio,
        area: org?.area,
      },
      unit: unitFor(cause, tasks),
      tasks: summaries,
      feed,
      workers,
      campaign: campaigns[0] ? { _id: campaigns[0]._id, name: campaigns[0].name, brandName: brand?.name ?? "" } : null,
    };
  },
});

/** Live causes, for the "split across causes" picker. */
export const splitOptions = query({
  args: {},
  handler: async (ctx) => {
    const causes = await ctx.db
      .query("causes")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .collect();
    return Promise.all(
      causes.map(async (c) => ({
        _id: c._id,
        slug: c.slug,
        name: c.name,
        coverHue: c.coverHue,
        orgName: (await ctx.db.get(c.orgId))?.name ?? "",
      })),
    );
  },
});

/** The viewer's own giving, for the directory. */
export const myGiving = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const donations = await ctx.db
      .query("donations")
      .withIndex("by_donor", (q) => q.eq("donorId", viewer.user._id))
      .order("desc")
      .take(50);
    const rows = await Promise.all(
      donations.map(async (d) => {
        const cause = await ctx.db.get(d.causeId);
        const task = d.taskId ? await ctx.db.get(d.taskId) : null;
        const receipt = d.receiptId ? await ctx.db.get(d.receiptId) : null;
        return {
          _id: d._id,
          amountCents: d.amountCents,
          at: d._creationTime,
          causeName: cause?.name ?? "",
          causeSlug: cause?.slug ?? "",
          taskTitle: task?.title ?? null,
          taskDone: task ? DONE_TASK.includes(task.status) : false,
          state: receipt?.state ?? null,
          receiptId: d.receiptId ?? null,
        };
      }),
    );
    return {
      totalCents: rows.reduce((s, r) => s + r.amountCents, 0),
      heldCents: rows.filter((r) => r.state === "held").reduce((s, r) => s + r.amountCents, 0),
      causes: new Set(rows.map((r) => r.causeSlug)).size,
      rows,
    };
  },
});
