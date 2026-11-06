import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { activityKind } from "./schema";
import { agentUser } from "./lib/agentAuth";
import { describeRule } from "./lib/policy";
import { getViewer } from "./lib/viewer";

/**
 * Plex for Mac: Today, the activity feed, and the brain's snapshot and log.
 * Main-window functions run as the viewer (guest = Adi); brain functions take
 * `secret` (see lib/agentAuth.ts).
 */

const DAY = 86_400_000;

type ActivityInput = Omit<Doc<"agentActivity">, "_id" | "_creationTime" | "at"> & { at?: number };

/** Every surface writes the Today feed through here. */
export async function logActivity(ctx: MutationCtx, input: ActivityInput) {
  return ctx.db.insert("agentActivity", { ...input, at: input.at ?? Date.now() });
}

const isOpenBill = (b: Doc<"bills">) => b.status !== "paid";

/** Pots that belong to the web's Tasks and Causes; Plex for Mac doesn't show or spend from them. */
const WEB_ONLY_POTS = new Set(["errands", "giving"]);
export const isMacPot = (p: Doc<"pots">) => !WEB_ONLY_POTS.has(p.name.toLowerCase());

/** A stored "upcoming" bill whose date passed reads as overdue. */
export function withBillStatus(b: Doc<"bills">, now: number): Doc<"bills"> {
  return b.status === "upcoming" && b.dueAt < now ? { ...b, status: "overdue" } : b;
}

async function upcomingBills(ctx: QueryCtx, ownerId: Id<"users">, now: number, days: number) {
  const bills = await ctx.db
    .query("bills")
    .withIndex("by_owner_due", (q) => q.eq("ownerId", ownerId).lte("dueAt", now + days * DAY))
    .collect();
  return bills.filter(isOpenBill).map((b) => withBillStatus(b, now));
}

async function pendingAsks(ctx: QueryCtx, ownerId: Id<"users">) {
  return ctx.db
    .query("asks")
    .withIndex("by_owner_status", (q) => q.eq("ownerId", ownerId).eq("status", "pending"))
    .order("desc")
    .collect();
}

function monthStart(now: number) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

// ── Main window ──────────────────────────────────────────────────────────────

export const today = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const { user } = viewer;
    const now = Date.now();

    const [needsYou, bills, routines, recent, pots, monthReceipts] = await Promise.all([
      pendingAsks(ctx, user._id),
      upcomingBills(ctx, user._id, now, 14),
      ctx.db.query("routines").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect(),
      ctx.db
        .query("agentActivity")
        .withIndex("by_owner_time", (q) => q.eq("ownerId", user._id))
        .order("desc")
        .take(20),
      ctx.db.query("pots").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect(),
      ctx.db
        .query("receipts")
        .withIndex("by_owner_time", (q) => q.eq("ownerId", user._id).gte("occurredAt", monthStart(now)))
        .collect(),
    ]);

    const nextRoutines = routines
      .filter((r) => r.enabled && r.nextRunAt !== undefined)
      .sort((a, b) => a.nextRunAt! - b.nextRunAt!)
      .slice(0, 5)
      .map((r) => ({ _id: r._id, name: r.name, icon: r.icon, nextRunAt: r.nextRunAt!, summary: r.spec.summary }));

    return {
      user: { name: user.name, paused: Boolean(user.agentsPaused) },
      needsYou,
      upcoming: { bills, routines: nextRoutines },
      recent,
      pots: pots.filter(isMacPot).map((p) => ({
        _id: p._id,
        name: p.name,
        icon: p.icon,
        color: p.color,
        balanceCents: p.balanceCents,
        spentMonthCents: p.spentMonthCents,
        monthlyBudgetCents: p.monthlyBudgetCents,
        rulesText: p.rulesText,
        ruleLines: p.rules.map(describeRule),
      })),
      totals: {
        spentMonthCents: pots.filter(isMacPot).reduce((s, p) => s + p.spentMonthCents, 0),
        savedMonthCents: monthReceipts.reduce((s, r) => s + (r.evidence?.savedCents ?? 0), 0),
        billsDueCents: bills.reduce((s, b) => s + b.amountCents, 0),
      },
    };
  },
});

export const activity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    return ctx.db
      .query("agentActivity")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", viewer.user._id))
      .order("desc")
      .take(Math.min(Math.max(1, limit ?? 50), 500));
  },
});

// ── Brain ────────────────────────────────────────────────────────────────────

export const log = mutation({
  args: {
    secret: v.string(),
    kind: activityKind,
    title: v.string(),
    detail: v.optional(v.string()),
    receiptId: v.optional(v.id("receipts")),
    runId: v.optional(v.id("routineRuns")),
    routineId: v.optional(v.id("routines")),
  },
  handler: async (ctx, { secret, ...rest }) => {
    const user = await agentUser(ctx, secret);
    await logActivity(ctx, { ...rest, ownerId: user._id });
    return null;
  },
});

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Compact facts for the talker's instruction. Dates are ms plus an ISO day. */
export const snapshot = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    const user = await agentUser(ctx, secret);
    const now = Date.now();
    const [pots, bills, subs, asks] = await Promise.all([
      ctx.db.query("pots").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect(),
      upcomingBills(ctx, user._id, now, 14),
      ctx.db.query("subscriptions").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect(),
      pendingAsks(ctx, user._id),
    ]);
    return {
      name: user.name,
      firstName: user.name.split(" ")[0],
      paused: Boolean(user.agentsPaused),
      now,
      today: isoDay(now),
      pots: pots.filter(isMacPot).map((p) => ({
        name: p.name,
        balanceCents: p.balanceCents,
        spentTodayCents: p.spentTodayCents,
        spentMonthCents: p.spentMonthCents,
        monthlyBudgetCents: p.monthlyBudgetCents,
        rulesText: p.rulesText,
        rules: p.rules.map(describeRule),
      })),
      billsDue: bills.map((b) => ({
        _id: b._id,
        payee: b.payee,
        category: b.category,
        amountCents: b.amountCents,
        usualCents: b.usualCents,
        dueAt: b.dueAt,
        due: isoDay(b.dueAt),
        status: b.status,
        autopay: b.autopay,
        payeeEmail: b.payeeEmail,
      })),
      subscriptions: subs
        .filter((s) => s.status !== "cancelled")
        .sort((a, b) => a.nextChargeAt - b.nextChargeAt)
        .map((s) => ({
          _id: s._id,
          merchant: s.merchant,
          plan: s.plan,
          amountCents: s.amountCents,
          previousAmountCents: s.previousAmountCents,
          cadence: s.cadence,
          nextCharge: isoDay(s.nextChargeAt),
          status: s.status,
          lastUsedDaysAgo: s.lastUsedAt === undefined ? null : Math.floor((now - s.lastUsedAt) / DAY),
        })),
      pendingAsks: asks.map((a) => ({
        _id: a._id,
        kind: a.kind,
        title: a.title,
        amountCents: a.amountCents,
        payee: a.payee,
        source: a.source.label,
      })),
    };
  },
});
