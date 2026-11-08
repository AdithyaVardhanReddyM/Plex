import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer, requireViewer } from "./lib/viewer";
import { formatCents } from "./lib/money";
import { runAnalyst, DEMO_QUESTIONS } from "./lib/ledgerAi";
import {
  ACTION_TOOLS,
  applyFilter,
  ROLE_BASE_FILTER,
  ROLE_TOOLS,
  vRole,
  vWidgetSpec,
  type ActionTool,
  type LedgerRole,
  type WidgetSpec,
} from "./lib/ledgerSpec";

/**
 * Plex Ledger: the dashboard where agents build and explain your money views.
 * Reads every surface's tables; writes only its own (asks, pinned widgets and
 * action requests). Real payouts and refunds belong to Tasks: the Ledger's
 * action tools record a confirmed request and hand it over.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ── Scope ────────────────────────────────────────────────────────────────────

async function scopedReceipts(ctx: QueryCtx, user: Doc<"users">, role: LedgerRole) {
  const all = await ctx.db
    .query("receipts")
    .withIndex("by_owner_time", (q) => q.eq("ownerId", user._id))
    .order("desc")
    .take(500);
  return { receipts: applyFilter(all, ROLE_BASE_FILTER[role], Date.now()), scopeLabel: user.name };
}

/** The receipts behind a role's Ledger, newest first. Widgets filter these live. */
export const receipts = query({
  args: { role: vRole },
  handler: async (ctx, { role }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const { receipts, scopeLabel } = await scopedReceipts(ctx, viewer.user, role);
    const actions = await ctx.db
      .query("ledgerActions")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer.user._id))
      .collect();
    const requested: Record<string, string> = {};
    for (const a of actions) if (a.receiptId) requested[a.receiptId] = ACTION_TOOLS[a.tool].label;
    return { receipts, scopeLabel, requested, tools: ROLE_TOOLS[role] };
  },
});

// ── Personal ─────────────────────────────────────────────────────────────────

export const personal = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const me = viewer.user._id;
    const now = Date.now();
    const [splits, receipts] = await Promise.all([
      ctx.db.query("splits").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect(),
      ctx.db
        .query("receipts")
        .withIndex("by_owner_time", (q) => q.eq("ownerId", me).gte("occurredAt", now - 30 * DAY))
        .collect(),
    ]);

    // Money that left the viewer: not refunds or invoices coming in, and not
    // payouts Plex made from a hold (counted when the task was funded).
    const out = receipts.filter((r) => r.payeeId !== me && r.kind !== "refund" && r.kind !== "invoice" && !(r.kind === "payout" && r.payerId !== me));

    const weekOut = out.filter((r) => r.occurredAt >= now - 7 * DAY && r.state !== "held");
    const prevWeekOut = out.filter((r) => r.occurredAt < now - 7 * DAY && r.occurredAt >= now - 14 * DAY && r.state !== "held");
    const held = receipts.filter((r) => r.state === "held" || r.state === "funded");
    const cameIn = receipts.filter((r) => (r.payeeId === me || r.kind === "refund") && r.state !== "pending");
    const saved = receipts.reduce((s, r) => s + (r.evidence?.savedCents ?? 0), 0);

    return {
      splits: await Promise.all(
        splits
          .sort((a, b) => b.occurredAt - a.occurredAt)
          .map(async (sp) => ({
            ...sp,
            participants: await Promise.all(
              sp.participants.map(async (p) => ({ ...p, color: p.userId ? (await ctx.db.get(p.userId))?.avatarColor : undefined })),
            ),
          })),
      ),
      viewerColor: viewer.user.avatarColor,
      kpis: {
        spentWeekCents: weekOut.reduce((s, r) => s + r.amountCents, 0),
        spentPrevWeekCents: prevWeekOut.reduce((s, r) => s + r.amountCents, 0),
        heldCents: held.reduce((s, r) => s + r.amountCents, 0),
        heldCount: held.length,
        cameInCents: cameIn.reduce((s, r) => s + r.amountCents, 0),
        savedCents: saved,
        owedCents: splits.reduce(
          (s, sp) => s + sp.participants.filter((p) => p.status !== "paid").reduce((x, p) => x + p.shareCents, 0),
          0,
        ),
      },
    };
  },
});

// ── Task poster ──────────────────────────────────────────────────────────────

export const poster = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const me = viewer.user._id;
    const tasks = await ctx.db.query("tasks").withIndex("by_poster", (q) => q.eq("posterId", me)).collect();

    const flow = { funded: 0, held: 0, released: 0, refunded: 0, disputed: 0 };
    const flowCount = { funded: 0, held: 0, released: 0, refunded: 0, disputed: 0 };
    const proofs: Array<{
      _id: Id<"proofs">;
      taskTitle: string;
      taskId: Id<"tasks">;
      location?: string;
      worker: { name: string; color?: string };
      status: Doc<"proofs">["status"];
      decision?: Doc<"proofs">["decision"];
      verdict?: Doc<"proofs">["verdict"];
      items: number;
      spec: string[];
      submittedAt: number;
      amountCents: number;
    }> = [];
    const workers = new Map<
      Id<"users">,
      { user: Doc<"users">; paidCents: number; tasks: number; pass: number; fail: number; lastAt: number; daily: number[] }
    >();
    const now = Date.now();

    for (const t of tasks) {
      const rs = await ctx.db.query("receipts").withIndex("by_task", (q) => q.eq("taskId", t._id)).collect();
      for (const r of rs) {
        if (r.ownerId !== me) continue;
        if (r.kind === "task_funding") {
          flow.funded += r.amountCents;
          flowCount.funded += 1;
          if (r.state === "held" || r.state === "funded") {
            flow.held += r.amountCents;
            flowCount.held += 1;
          }
          if (r.state === "disputed") {
            flow.disputed += r.amountCents;
            flowCount.disputed += 1;
          }
        }
        if (r.kind === "payout" && (r.state === "released" || r.state === "paid")) {
          flow.released += r.amountCents;
          flowCount.released += 1;
        }
        if (r.kind === "refund") {
          flow.refunded += r.amountCents;
          flowCount.refunded += 1;
        }
      }
      const ps = await ctx.db.query("proofs").withIndex("by_task", (q) => q.eq("taskId", t._id)).collect();
      for (const p of ps) {
        const worker = await ctx.db.get(p.workerId);
        if (!worker) continue;
        const payout = t.payout.kind === "fixed" ? t.payout.amountCents : t.payout.kind === "per_unit" ? t.payout.amountCents * t.payout.maxUnits : 0;
        proofs.push({
          _id: p._id,
          taskId: t._id,
          taskTitle: t.title,
          location: t.location?.label,
          worker: { name: worker.name, color: worker.avatarColor },
          status: p.status,
          decision: p.decision,
          verdict: p.verdict,
          items: p.items.length,
          spec: t.proofSpec.map((s) => s.label),
          submittedAt: Math.max(0, ...p.items.map((i) => i.capturedAt ?? 0)) || p._creationTime,
          amountCents: payout,
        });
        const w = workers.get(worker._id) ?? { user: worker, paidCents: 0, tasks: 0, pass: 0, fail: 0, lastAt: 0, daily: Array(21).fill(0) };
        w.tasks += 1;
        if (p.status === "pass") w.pass += 1;
        if (p.status === "fail" || p.status === "unsure") w.fail += 1;
        const paid = rs.filter((r) => r.kind === "payout" && r.payeeId === worker._id && r.ownerId === me);
        for (const r of paid) {
          w.paidCents += r.amountCents;
          w.lastAt = Math.max(w.lastAt, r.occurredAt);
          const idx = 20 - Math.floor((now - r.occurredAt) / DAY);
          if (idx >= 0 && idx < 21) w.daily[idx] += r.amountCents;
        }
        workers.set(worker._id, w);
      }
    }

    // Payouts not tied to a task in this list (seeded history) still count.
    const loose = await ctx.db
      .query("receipts")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", me))
      .filter((q) => q.and(q.eq(q.field("kind"), "payout"), q.eq(q.field("taskId"), undefined)))
      .collect();
    for (const r of loose) {
      flow.released += r.amountCents;
      flowCount.released += 1;
      if (r.payeeId) {
        const user = await ctx.db.get(r.payeeId);
        if (!user) continue;
        const w = workers.get(user._id) ?? { user, paidCents: 0, tasks: 0, pass: 0, fail: 0, lastAt: 0, daily: Array(21).fill(0) };
        w.paidCents += r.amountCents;
        w.tasks += 1;
        w.pass += 1;
        w.lastAt = Math.max(w.lastAt, r.occurredAt);
        workers.set(user._id, w);
      }
    }
    const looseRefunds = await ctx.db
      .query("receipts")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", me))
      .filter((q) => q.and(q.eq(q.field("kind"), "refund"), q.eq(q.field("taskId"), undefined)))
      .collect();
    for (const r of looseRefunds) {
      flow.refunded += r.amountCents;
      flowCount.refunded += 1;
    }

    // Funded is everything that entered the flow, so the stages add up to it
    // (older payouts and refunds predate their funding receipts).
    flow.funded = flow.held + flow.released + flow.refunded + flow.disputed;
    flowCount.funded = flowCount.held + flowCount.released + flowCount.refunded + flowCount.disputed;

    const decided = proofs.filter((p) => p.status !== "pending" && p.status !== "checking");
    return {
      flow,
      flowCount,
      proofs: proofs.sort((a, b) => b.submittedAt - a.submittedAt),
      passRate: decided.length ? decided.filter((p) => p.status === "pass").length / decided.length : null,
      proofCounts: {
        pass: decided.filter((p) => p.status === "pass").length,
        fail: decided.filter((p) => p.status === "fail").length,
        unsure: decided.filter((p) => p.status === "unsure").length,
      },
      workers: [...workers.values()]
        .map((w) => ({
          _id: w.user._id,
          name: w.user.name,
          color: w.user.avatarColor,
          area: w.user.area,
          rating: w.user.rating,
          skills: w.user.skills ?? [],
          tasksForYou: w.tasks,
          passRate: w.tasks ? w.pass / w.tasks : null,
          paidCents: w.paidCents,
          lastPaidAt: w.lastAt || null,
          daily: w.daily,
        }))
        .sort((a, b) => b.paidCents - a.paidCents),
      openTasks: tasks.filter((t) => ["open", "assigned", "submitted", "verifying"].includes(t.status)).length,
    };
  },
});

// ── Watchdog ─────────────────────────────────────────────────────────────────

export type WatchdogAlert = {
  id: string;
  severity: "notice" | "warning";
  title: string;
  detail: string;
  spec: WidgetSpec;
};

/**
 * Watches the payment stream (the receipts PayPal webhooks keep current) and
 * flags what a person would want to know: a refund spike, failed proofs in one
 * area, unusual spend, money held longer than it should be. Deterministic: the
 * alert is computed, not guessed. Each alert carries the widget that shows it.
 */
export const watchdog = query({
  args: { role: vRole },
  handler: async (ctx, { role }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const me = viewer.user._id;
    const now = Date.now();
    const alerts: WatchdogAlert[] = [];

    const recent = await ctx.db
      .query("receipts")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", me).gte("occurredAt", now - 28 * DAY))
      .collect();

    // Refund spike: this week vs the weekly average of the three before.
    const refunds = recent.filter((r) => r.kind === "refund");
    const thisWeek = refunds.filter((r) => r.occurredAt >= now - 7 * DAY);
    const before = refunds.filter((r) => r.occurredAt < now - 7 * DAY);
    const weeklyBefore = before.length / 3;
    if (thisWeek.length >= 2 && thisWeek.length > weeklyBefore * 1.5) {
      alerts.push({
        id: "refund-spike",
        severity: "warning",
        title: `Refunds are up: ${thisWeek.length} this week`,
        detail: `${formatCents(thisWeek.reduce((s, r) => s + r.amountCents, 0))} came back this week. Before that it was ${weeklyBefore < 1 ? "about one every few weeks" : `about ${weeklyBefore.toFixed(1)} a week`}. Each refund names the check that failed.`,
        spec: {
          kind: "chart",
          title: "Refunds and disputes by week",
          filter: { states: ["refunded", "disputed"], sinceDays: 28 },
          chart: { type: "column", groupBy: "week", measure: "sum", stackBy: "state" },
        },
      });
    }

    // Failed proofs clustered in one area over the last three days.
    const tasks = await ctx.db.query("tasks").withIndex("by_poster", (q) => q.eq("posterId", me)).collect();
    const fails: Array<{ area: string; task: Doc<"tasks"> }> = [];
    for (const t of tasks) {
      if (!t.location) continue;
      const ps = await ctx.db.query("proofs").withIndex("by_task", (q) => q.eq("taskId", t._id)).collect();
      for (const p of ps) {
        const at = Math.max(...p.items.map((i) => i.capturedAt ?? 0));
        if ((p.status === "fail" || p.status === "unsure") && at >= now - 3 * DAY) {
          const area = t.location.label.split(",").pop()!.trim();
          fails.push({ area, task: t });
        }
      }
    }
    const byArea = new Map<string, number>();
    for (const f of fails) byArea.set(f.area, (byArea.get(f.area) ?? 0) + 1);
    for (const [area, n] of byArea) {
      if (n < 2) continue;
      alerts.push({
        id: `fails-${area}`,
        severity: "warning",
        title: `${n} proofs failed in ${area} in 3 days`,
        detail: `Both were checked against the marked spot. Consider a wider radius there, or a worker who knows the area.`,
        spec: {
          kind: "grid",
          title: `Tasks in ${area}`,
          filter: { search: area, kinds: ["task_funding", "refund"] },
          columns: ["when", "why", "rule", "state", "amount"],
          sort: { column: "when", desc: true },
        },
      });
    }

    // Proof passed but money still held (waiting on the poster).
    const waiting = recent.filter(
      (r) => r.kind === "task_funding" && r.state === "held" && r.evidence?.verdict?.startsWith("Pass") && r.occurredAt < now - 12 * HOUR,
    );
    if (waiting.length && role === "poster") {
      const r = waiting[0]!;
      alerts.push({
        id: `waiting-${r._id}`,
        severity: "notice",
        title: `Proof passed, ${formatCents(r.amountCents)} still held`,
        detail: `“${r.why.slice(0, 60)}${r.why.length > 60 ? "…" : ""}” passed ${r.evidence?.verdict?.split(" · ")[1] ?? ""}. Release it from the grid when you're happy.`,
        spec: {
          kind: "grid",
          title: "Held with a passing proof",
          filter: { states: ["held"], kinds: ["task_funding"] },
          columns: ["when", "why", "rule", "state", "amount"],
          sort: { column: "when", desc: true },
        },
      });
    }

    // Unusual spend: far above the usual for its category.
    if (role === "personal") {
      const purchases = recent.filter((r) => r.kind === "purchase");
      for (const r of purchases.filter((p) => p.occurredAt >= now - 3 * DAY)) {
        const peers = purchases.filter((p) => p.category === r.category && p._id !== r._id).map((p) => p.amountCents).sort((a, b) => a - b);
        if (peers.length < 2) continue;
        const median = peers[Math.floor(peers.length / 2)]!;
        if (r.amountCents >= 5_000 && r.amountCents > median * 3) {
          alerts.push({
            id: `unusual-${r._id}`,
            severity: "notice",
            title: `${formatCents(r.amountCents)} at ${r.payeeLabel} is unusual`,
            detail: `${Math.round(r.amountCents / median)}× your usual ${r.category} purchase, by ${r.agentLabel ?? "you"}. It went through your approval rule, so it was allowed.`,
            spec: {
              kind: "grid",
              title: `${r.category} purchases, largest first`,
              filter: { kinds: ["purchase"], categories: r.category ? [r.category] : undefined, sinceDays: 28 },
              columns: ["when", "party", "why", "agent", "rule", "amount"],
              sort: { column: "amount", desc: true },
            },
          });
        }
      }
    }
    return alerts.slice(0, 3);
  },
});

// ── Plex Analyst: ask, answer, pin ───────────────────────────────────────────

export const demoQuestions = query({
  args: { role: vRole },
  handler: async (_ctx, { role }) => DEMO_QUESTIONS[role],
});

export const asks = query({
  args: { role: vRole },
  handler: async (ctx, { role }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const rows = await ctx.db
      .query("ledgerAsks")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer.user._id))
      .order("desc")
      .take(20);
    return rows.filter((r) => r.role === role).slice(0, 6);
  },
});

/** Ask the Ledger. The web and MCP both come in here. */
export const ask = mutation({
  args: {
    role: vRole,
    question: v.string(),
    via: v.optional(v.union(v.literal("web"), v.literal("mcp"))),
  },
  handler: async (ctx, { role, question, via }) => {
    const { user } = await requireViewer(ctx);
    const q = question.trim().slice(0, 240);
    if (!q) throw new Error("Ask a question first");
    const askId = await ctx.db.insert("ledgerAsks", {
      ownerId: user._id,
      role,
      question: q,
      via: via ?? "web",
      status: "thinking",
    });
    await ctx.scheduler.runAfter(0, internal.ledger.answer, { askId });
    return askId;
  },
});

export const askContext = internalQuery({
  args: { askId: v.id("ledgerAsks") },
  handler: async (ctx, { askId }) => {
    const ask = await ctx.db.get(askId);
    if (!ask) return null;
    const user = await ctx.db.get(ask.ownerId);
    if (!user) return null;
    const { receipts } = await scopedReceipts(ctx, user, ask.role);
    return { ask, viewerName: user.name, receipts };
  },
});

export const finishAsk = internalMutation({
  args: {
    askId: v.id("ledgerAsks"),
    answer: v.string(),
    widgets: v.array(vWidgetSpec),
    followUps: v.array(v.string()),
    engine: v.union(v.literal("gemini"), v.literal("heuristic")),
    engineNote: v.optional(v.string()),
  },
  handler: async (ctx, { askId, ...rest }) => {
    await ctx.db.patch(askId, { ...rest, status: "done" });
  },
});

export const failAsk = internalMutation({
  args: { askId: v.id("ledgerAsks"), message: v.string() },
  handler: async (ctx, { askId, message }) => {
    await ctx.db.patch(askId, { status: "error", answer: message });
  },
});

export const answer = internalAction({
  args: { askId: v.id("ledgerAsks") },
  handler: async (ctx, { askId }) => {
    const data = await ctx.runQuery(internal.ledger.askContext, { askId });
    if (!data) return;
    try {
      const result = await runAnalyst({
        question: data.ask.question,
        role: data.ask.role,
        receipts: data.receipts,
        now: Date.now(),
        viewerName: data.viewerName,
      });
      await ctx.runMutation(internal.ledger.finishAsk, {
        askId,
        answer: result.answer,
        widgets: result.widgets.slice(0, 2),
        followUps: result.followUps.slice(0, 3),
        engine: result.engine,
        engineNote: result.engineNote,
      });
    } catch (err) {
      await ctx.runMutation(internal.ledger.failAsk, { askId, message: `The Analyst couldn't answer: ${(err as Error).message}` });
    }
  },
});

export const pinned = query({
  args: { role: vRole },
  handler: async (ctx, { role }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const rows = await ctx.db
      .query("ledgerWidgets")
      .withIndex("by_owner_role", (q) => q.eq("ownerId", viewer.user._id).eq("role", role))
      .collect();
    return rows.sort((a, b) => a.order - b.order);
  },
});

export const pin = mutation({
  args: { role: vRole, spec: vWidgetSpec, askId: v.optional(v.id("ledgerAsks")) },
  handler: async (ctx, { role, spec, askId }) => {
    const { user } = await requireViewer(ctx);
    const existing = await ctx.db
      .query("ledgerWidgets")
      .withIndex("by_owner_role", (q) => q.eq("ownerId", user._id).eq("role", role))
      .collect();
    const same = existing.find((w) => JSON.stringify(w.spec) === JSON.stringify(spec));
    if (same) return same._id;
    const ask = askId ? await ctx.db.get(askId) : null;
    return ctx.db.insert("ledgerWidgets", {
      ownerId: user._id,
      role,
      spec,
      askId,
      question: ask?.question,
      order: existing.reduce((m, w) => Math.min(m, w.order), 0) - 1, // newest first
    });
  },
});

export const unpin = mutation({
  args: { id: v.id("ledgerWidgets") },
  handler: async (ctx, { id }) => {
    const { user } = await requireViewer(ctx);
    const w = await ctx.db.get(id);
    if (w && w.ownerId === user._id) await ctx.db.delete(id);
  },
});

// ── Action tools (stubs that hand over to Tasks) ─────────────────────────────

async function recordAction(
  ctx: MutationCtx,
  args: {
    role: LedgerRole;
    tool: ActionTool;
    targetLabel: string;
    amountCents?: number;
    receiptId?: Id<"receipts">;
    splitId?: Id<"splits">;
    note: string;
  },
) {
  const { user } = await requireViewer(ctx);
  if (!ROLE_TOOLS[args.role].includes(args.tool)) {
    throw new Error(`${ACTION_TOOLS[args.tool].label} isn't available in the ${args.role} view`);
  }
  return ctx.db.insert("ledgerActions", { ownerId: user._id, status: "handed_off", ...args });
}

async function heldTaskReceipt(ctx: QueryCtx, id: Id<"receipts">, userId: Id<"users">) {
  const r = await ctx.db.get(id);
  if (!r || r.ownerId !== userId) throw new Error("Receipt not found");
  if (r.kind !== "task_funding" || (r.state !== "held" && r.state !== "funded" && r.state !== "disputed")) {
    throw new Error("Only money Plex is holding for a task can be released or refunded");
  }
  return r;
}

/**
 * STUB: requests a payout release for a held task. The real release (PayPal
 * capture + Payouts, receipt advanced to "released") is owned by Tasks; this
 * records the confirmed request so Tasks can pick it up.
 */
export const stubReleasePayout = mutation({
  args: { role: vRole, receiptId: v.id("receipts") },
  handler: async (ctx, { role, receiptId }) => {
    const { user } = await requireViewer(ctx);
    const r = await heldTaskReceipt(ctx, receiptId, user._id);
    return recordAction(ctx, {
      role, tool: "release_payout", receiptId, amountCents: r.amountCents, targetLabel: r.why,
      note: "Handed to Tasks: the payout runs through PayPal Payouts there and the receipt updates here.",
    });
  },
});

/** STUB: requests a refund of a held task. The real refund is owned by Tasks. */
export const stubRefund = mutation({
  args: { role: vRole, receiptId: v.id("receipts") },
  handler: async (ctx, { role, receiptId }) => {
    const { user } = await requireViewer(ctx);
    const r = await heldTaskReceipt(ctx, receiptId, user._id);
    return recordAction(ctx, {
      role, tool: "refund", receiptId, amountCents: r.amountCents, targetLabel: r.why,
      note: "Handed to Tasks: the refund runs through PayPal there and the receipt updates here.",
    });
  },
});

/** STUB: requests a reminder for an unpaid share of a split (PayPal invoice reminder). */
export const stubSendReminder = mutation({
  args: { role: vRole, splitId: v.id("splits"), participant: v.string() },
  handler: async (ctx, { role, splitId, participant }) => {
    const { user } = await requireViewer(ctx);
    const split = await ctx.db.get(splitId);
    if (!split || split.ownerId !== user._id) throw new Error("Split not found");
    const p = split.participants.find((x) => x.name === participant);
    if (!p) throw new Error("Not in this split");
    if (p.status === "paid") throw new Error(`${participant.split(" ")[0]} already paid`);
    return recordAction(ctx, {
      role, tool: "send_reminder", splitId, amountCents: p.shareCents, targetLabel: `${participant} · ${split.title}`,
      note: "Queued: a PayPal invoice reminder goes out from the splits flow.",
    });
  },
});

export const actionLog = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    return ctx.db
      .query("ledgerActions")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer.user._id))
      .order("desc")
      .take(20);
  },
});
