import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getViewer } from "./lib/viewer";
import { fundingCents, windowLabel } from "./lib/taskRules";
import { matchTask } from "./lib/profile";

/**
 * Home's earning side: open tasks that fit what the person said they do,
 * and the money from work they took (held, then paid).
 */

/** Open tasks ranked against the viewer's answers. The money is already held for every one. */
export const forYou = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const me = viewer.user;
    const open = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(200);
    const mine = await ctx.db
      .query("applications")
      .withIndex("by_applicant", (q) => q.eq("applicantId", me._id))
      .take(200);
    const applied = new Set(mine.filter((a) => a.status !== "withdrawn").map((a) => a.taskId));

    return open
      .filter((t) => t.posterId !== me._id && t.funding.state === "authorized" && !applied.has(t._id))
      .map((t) => ({ t, m: matchTask(t, me) }))
      .filter((x): x is { t: Doc<"tasks">; m: NonNullable<typeof x.m> } => x.m !== null)
      .sort((a, b) => b.m.score - a.m.score || a.t.windowEnd - b.t.windowEnd)
      .slice(0, 8)
      .map(({ t, m }) => ({
        _id: t._id,
        title: t.title,
        category: t.category,
        cents: fundingCents(t.payout),
        place: t.location?.label,
        window: windowLabel(t.windowStart, t.windowEnd),
        windowEnd: t.windowEnd,
        reasons: m.reasons,
        distanceKm: m.distanceKm,
        invited: t.invitedId === me._id,
      }));
  },
});

const LIVE: Doc<"tasks">["status"][] = ["assigned", "submitted", "verifying", "approved", "rejected", "disputed"];

/** Work the viewer took: what's in progress, what's held for them, what's been paid. */
export const earnings = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const me = viewer.user;
    const taking = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", me._id))
      .order("desc")
      .take(200);

    let paidCents = 0;
    const paid: { _id: Doc<"tasks">["_id"]; title: string; cents: number; at: number; receiptId: Doc<"receipts">["_id"] }[] = [];
    for (const t of taking) {
      if (t.status !== "paid" || !t.payoutReceiptId) continue;
      const r = await ctx.db.get(t.payoutReceiptId);
      if (!r) continue;
      const line = r.split?.find((l) => l.role === "earner" && l.payeeId === me._id);
      const cents = line ? line.cents : r.amountCents;
      paidCents += cents;
      paid.push({ _id: t._id, title: t.title, cents, at: r.occurredAt, receiptId: r._id });
    }
    const active = taking.filter((t) => LIVE.includes(t.status));
    const apps = await ctx.db
      .query("applications")
      .withIndex("by_applicant", (q) => q.eq("applicantId", me._id))
      .take(100);
    const pending = [];
    for (const a of apps) {
      if (a.status !== "pending") continue;
      const t = await ctx.db.get(a.taskId);
      if (t && t.status === "open") pending.push({ _id: t._id, title: t.title, askCents: a.askCents, at: a._creationTime });
    }
    return {
      paidCents,
      heldCents: active.reduce((s, t) => s + fundingCents(t.payout), 0),
      done: paid.length,
      paid: paid.slice(0, 6),
      active: active.map((t) => ({
        _id: t._id,
        title: t.title,
        status: t.status,
        cents: fundingCents(t.payout),
        window: windowLabel(t.windowStart, t.windowEnd),
        windowEnd: t.windowEnd,
      })),
      applied: pending.slice(0, 6),
      hasPaypal: Boolean(me.paypalEmail),
    };
  },
});
