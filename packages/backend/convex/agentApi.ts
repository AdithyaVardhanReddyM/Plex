import { ConvexError, v } from "convex/values";
import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { sha256Hex } from "./apiKeys";
import { canTake, defaultCriteria, isDigitalTask } from "./lib/hire";
import { challengeCode, formatCents } from "./lib/money";
import { fundingCents, PLACE_TZ } from "./lib/taskRules";
import { proofSpecItem, verificationMode } from "./schema";

/**
 * The Plex agent API, for Claude (through apps/mcp) and any other agent.
 * Authenticated with `X-API-Key: plx_live_…` (stored only as a hash).
 *
 * Poster keys post and fund tasks for their owner: PayPal holds the money
 * from the owner's saved wallet inside their auto-pay limits (or the owner
 * approves at PayPal) until proof passes. Worker keys bid on and deliver
 * digital work.
 *
 *   GET  /api/v1/me
 *   GET  /api/v1/tasks?who=agent|human
 *   POST /api/v1/tasks                 { brief, payoutCents?, workerType? }
 *   GET  /api/v1/tasks/:id
 *   POST /api/v1/tasks/:id/fund        → PayPal approval link for the owner
 *   POST /api/v1/tasks/:id/accept      { applicationId? }  (best match if omitted)
 *   POST /api/v1/tasks/:id/approve     → capture + PayPal Payouts
 *   POST /api/v1/tasks/:id/apply       { askCents, message }        (worker keys)
 *   POST /api/v1/tasks/:id/deliver     { items: [{ index, text?, url? }], note? }
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** The demo world is in the Bay Area: the hour sent with funding is its local time. */
const localHour = () => Number(new Date().toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: PLACE_TZ }));

function errorText(err: unknown) {
  if (err instanceof ConvexError) return typeof err.data === "string" ? err.data : "Request failed";
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/^[\s\S]*?(Uncaught )?(Convex)?Error: /, "").split("\n")[0]!;
}

export const handle = httpAction(async (ctx, req) => {
  const key = req.headers.get("x-api-key") ?? "";
  if (!key.startsWith("plx_live_")) return json(401, { error: "Send your Plex key in the X-API-Key header." });
  const auth = await ctx.runQuery(internal.apiKeys.authenticate, { keyHash: await sha256Hex(key) });
  if (!auth) return json(401, { error: "Unknown or revoked key." });
  await ctx.runMutation(internal.apiKeys.touch, { agentId: auth.agent._id });

  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/v1\/?/, "").split("/").filter(Boolean);
  const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
  const taskId = parts[1] as Id<"tasks"> | undefined;

  try {
    // GET /me
    if (req.method === "GET" && parts[0] === "me")
      return json(200, {
        agent: auth.agent.name,
        role: auth.worker ? "worker" : "poster",
        owner: auth.owner.name,
        worker: auth.worker ? { handle: auth.worker.handle, profile: `${siteUrl()}/hire/${auth.worker.handle}` } : null,
        paused: Boolean(auth.owner.agentsPaused),
      });

    if (parts[0] !== "tasks") return json(404, { error: "No such endpoint. See /developers." });

    // GET /tasks
    if (req.method === "GET" && !taskId) {
      const who = url.searchParams.get("who");
      const rows = await ctx.runQuery(internal.agentApi.openTasks, { who: who === "agent" || who === "human" ? who : undefined });
      return json(200, { tasks: rows });
    }

    // POST /tasks
    if (req.method === "POST" && !taskId) {
      if (auth.worker) return json(403, { error: "Worker keys can't post tasks. Use a poster key." });
      const brief = String(body.brief ?? "").trim();
      if (brief.length < 8) return json(400, { error: "Send a brief: what needs doing, in a sentence or two." });
      const written = await ctx.runAction(api.tasks.write, { brief });
      const d = written.draft;
      const payoutCents = typeof body.payoutCents === "number" ? Math.round(body.payoutCents) : d.payoutCents;
      const wt = body.workerType;
      const workerType = wt === "human" || wt === "agent" || wt === "either" ? wt : d.workerType;
      const start = Date.now() + Math.max(0, d.startsInHours) * 3_600_000;
      const created = await ctx.runMutation(internal.agentApi.createFromAgent, {
        agentId: auth.agent._id,
        brief,
        title: d.title,
        description: d.description,
        category: d.category,
        location: d.locationLabel ? { label: d.locationLabel, lat: d.lat ?? undefined, lng: d.lng ?? undefined, radiusM: d.radiusM ?? undefined } : undefined,
        windowStart: start,
        windowEnd: start + Math.max(1, d.durationHours) * 3_600_000,
        payoutCents,
        proofSpec: d.proofSpec,
        verificationMode: d.verificationMode,
        tags: d.tags,
        workerType,
        writerModel: written.model,
        autoHire: body.autoHire === true,
      });
      return json(201, { ...created, writtenBy: written.model, next: "POST /api/v1/tasks/:id/fund to hold the payout through PayPal" });
    }

    if (!taskId) return json(404, { error: "No such endpoint." });

    // GET /tasks/:id
    if (req.method === "GET" && parts.length === 2) {
      const view = await ctx.runQuery(internal.agentApi.taskView, { taskId });
      return view ? json(200, view) : json(404, { error: "Task not found." });
    }

    const verb = parts[2];
    if (req.method !== "POST") return json(405, { error: "Use POST." });

    if (verb === "fund") {
      if (auth.worker) return json(403, { error: "Worker keys can't fund tasks." });
      const origin = typeof body.origin === "string" && /^https?:\/\/[^/]+$/.test(body.origin) ? body.origin : siteUrl();
      const r = await ctx.runAction(internal.taskMoney.startFundingFor, { taskId, origin, hour: localHour(), posterId: auth.owner._id });
      if (r.autoPaid)
        return json(200, {
          state: "authorized",
          autoPaid: true,
          orderId: r.orderId,
          note: `${r.note}. Agents are bidding now if it's open to agents.`,
        });
      return json(200, {
        state: "needs_approval",
        autoPaid: false,
        approveUrl: r.approveUrl,
        orderId: r.orderId,
        note: `${r.note ? `${r.note}. ` : ""}${auth.owner.name} approves this once in PayPal; the money is held, not paid, until the proof passes. Turn on auto-pay at /developers to skip this.`,
      });
    }
    if (verb === "accept") {
      if (auth.worker) return json(403, { error: "Only the poster can accept." });
      const applicationId = await ctx.runQuery(internal.agentApi.bestApplication, {
        taskId,
        applicationId: typeof body.applicationId === "string" ? (body.applicationId as Id<"applications">) : undefined,
      });
      if (!applicationId) return json(409, { error: "No pending applications yet." });
      await ctx.runMutation(internal.applications.decideFor, { applicationId, posterId: auth.owner._id, accept: true });
      return json(200, { accepted: applicationId });
    }
    if (verb === "approve") {
      if (auth.worker) return json(403, { error: "Only the poster can approve." });
      await ctx.runAction(internal.taskMoney.releaseFor, { taskId, posterId: auth.owner._id });
      return json(200, { released: true, view: await ctx.runQuery(internal.agentApi.taskView, { taskId }) });
    }
    if (verb === "apply") {
      if (!auth.worker) return json(403, { error: "Use a worker key to apply." });
      const askCents = Math.round(Number(body.askCents));
      const id = await ctx.runMutation(internal.agentApi.applyAsAgent, {
        taskId,
        workerId: auth.worker._id,
        askCents,
        message: String(body.message ?? ""),
      });
      return json(201, { applicationId: id });
    }
    if (verb === "deliver") {
      if (!auth.worker) return json(403, { error: "Use a worker key to deliver." });
      const task = await ctx.runQuery(internal.tasks.internalGet, { id: taskId });
      if (!task) return json(404, { error: "Task not found." });
      const given = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
      const items = [];
      for (const it of given) {
        const index = Number(it.index);
        const spec = task.proofSpec[index];
        if (!spec) continue;
        if (spec.type === "text") items.push({ specIndex: index, text: String(it.text ?? ""), capturedAt: Date.now() });
        else if (spec.type === "link") items.push({ specIndex: index, url: String(it.url ?? ""), capturedAt: Date.now() });
        else if (spec.type === "file" && typeof it.text === "string") {
          const storageId = await ctx.storage.store(new Blob([it.text.slice(0, 200_000)], { type: "text/markdown" }));
          items.push({ specIndex: index, storageId, capturedAt: Date.now() });
        }
      }
      const proofId = await ctx.runMutation(internal.proofs.submitAsAgent, {
        taskId,
        workerId: auth.worker._id,
        items,
        note: typeof body.note === "string" ? body.note : undefined,
      });
      return json(201, { proofId, next: "Proofer agents are scoring it. GET /api/v1/tasks/:id for the verdict." });
    }
    return json(404, { error: "No such endpoint." });
  } catch (err) {
    return json(400, { error: errorText(err) });
  }
});

// ── Internal reads and writes for the API ───────────────────────────────────

export const openTasks = internalQuery({
  args: { who: v.optional(v.union(v.literal("human"), v.literal("agent"))) },
  handler: async (ctx, { who }) => {
    const open = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(50);
    return open
      .filter((t) => !who || (t.workerType ?? "human") === "either" || (t.workerType ?? "human") === who)
      .map((t) => ({
        id: t._id,
        title: t.title,
        category: t.category,
        workerType: t.workerType ?? "human",
        digital: isDigitalTask(t),
        pays: formatCents(fundingCents(t.payout)),
        payCents: fundingCents(t.payout),
        where: t.location?.label ?? "Remote",
        deliver: t.proofSpec.map((s, index) => ({ index, label: s.label, type: s.type, mustShow: s.description })),
        endsAt: new Date(t.windowEnd).toISOString(),
        url: `${siteUrl()}/tasks/${t._id}`,
      }));
  },
});

export const taskView = internalQuery({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const t = await ctx.db.get(taskId);
    if (!t) return null;
    const apps = await ctx.db
      .query("applications")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    const proof = await ctx.db
      .query("proofs")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .order("desc")
      .first();
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    const assignee = t.assigneeId ? await ctx.db.get(t.assigneeId) : null;
    return {
      id: t._id,
      title: t.title,
      status: t.status,
      workerType: t.workerType ?? "human",
      held: formatCents(fundingCents(t.payout)),
      funding: t.funding.state,
      assignee: assignee ? { name: assignee.name, kind: assignee.kind } : null,
      applications: await Promise.all(
        apps
          .filter((a) => a.status !== "withdrawn")
          .sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1))
          .map(async (a) => {
            const who = await ctx.db.get(a.applicantId);
            return {
              id: a._id,
              name: who?.name,
              kind: who?.kind,
              ask: formatCents(a.askCents),
              status: a.status,
              matchScore: a.matchScore,
              matchReason: a.matchReason,
              bids: a.bids?.map((b) => ({ round: b.round, ask: formatCents(b.cents), note: b.note })),
            };
          }),
      ),
      proof: proof
        ? {
            status: proof.status,
            verdict: proof.verdict ? { result: proof.verdict.result, confidence: proof.verdict.confidence, summary: proof.verdict.summary } : null,
            scorecards: proof.scorecards?.map((c) => ({ proofer: c.proofer, verdict: c.verdict, note: c.note })),
          }
        : null,
      receipts: receipts.map((r) => ({
        kind: r.kind,
        state: r.state,
        amount: formatCents(r.amountCents),
        rule: r.rule.text,
        paypal: r.paypal,
        // Who got what from a released payment (the fee comes out of the price, never on top).
        split: r.split?.map((l) => ({ to: l.label, role: l.role, amount: formatCents(l.cents), via: l.via })),
      })),
      url: `${siteUrl()}/tasks/${t._id}`,
    };
  },
});

export const bestApplication = internalQuery({
  args: { taskId: v.id("tasks"), applicationId: v.optional(v.id("applications")) },
  handler: async (ctx, { taskId, applicationId }) => {
    if (applicationId) return applicationId;
    const apps = await ctx.db
      .query("applications")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    const best = apps.filter((a) => a.status === "pending").sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1))[0];
    return best?._id ?? null;
  },
});

const locationV = v.optional(
  v.object({ label: v.string(), lat: v.optional(v.number()), lng: v.optional(v.number()), radiusM: v.optional(v.number()) }),
);

/** A task posted by an agent: same checks as the web, plus the owner's kill switch. */
export const createFromAgent = internalMutation({
  args: {
    agentId: v.id("agents"),
    brief: v.string(),
    title: v.string(),
    description: v.string(),
    category: v.union(v.literal("local"), v.literal("remote"), v.literal("data"), v.literal("creator"), v.literal("agent"), v.literal("impact")),
    location: locationV,
    windowStart: v.number(),
    windowEnd: v.number(),
    payoutCents: v.number(),
    proofSpec: v.array(proofSpecItem),
    verificationMode,
    tags: v.array(v.string()),
    workerType: v.union(v.literal("human"), v.literal("agent"), v.literal("either")),
    writerModel: v.string(),
    autoHire: v.optional(v.boolean()),
  },
  handler: async (ctx, { agentId, autoHire, ...d }) => {
    const agent = await ctx.db.get(agentId);
    const owner = agent ? await ctx.db.get(agent.ownerId) : null;
    if (!agent || !owner) throw new ConvexError("This key's owner is gone.");
    if (owner.agentsPaused) throw new ConvexError(`${owner.name} has paused their agents.`);
    if (!Number.isInteger(d.payoutCents) || d.payoutCents < 100) throw new ConvexError("Payout must be at least $1.");
    if (d.payoutCents > 100_000) throw new ConvexError("Sandbox tasks are capped at $1,000.");
    const workerType = d.workerType !== "human" && !isDigitalTask(d) ? "human" : d.workerType;

    const taskId = await ctx.db.insert("tasks", {
      posterId: owner._id,
      postedVia: "mcp",
      agentLabel: agent.name,
      title: d.title,
      brief: d.brief,
      description: d.description,
      category: d.category,
      location: d.location,
      windowStart: d.windowStart,
      windowEnd: d.windowEnd,
      payout: { kind: "fixed", amountCents: d.payoutCents },
      currency: "USD",
      proofSpec: d.proofSpec,
      verificationMode: d.verificationMode,
      challengeCode: challengeCode(Math.random()),
      status: "draft",
      funding: { state: "unfunded" },
      tags: d.tags.slice(0, 4),
      writerModel: d.writerModel,
      workerType,
      criteria: isDigitalTask(d) ? defaultCriteria(d.proofSpec) : undefined,
      autoHire: autoHire && workerType !== "human" ? true : undefined,
      ...(autoHire && workerType !== "human" ? { verificationMode: "auto" as const } : {}),
    });
    return {
      id: taskId,
      title: d.title,
      workerType,
      payout: formatCents(d.payoutCents),
      deliver: d.proofSpec.map((s, index) => ({ index, label: s.label, type: s.type })),
      url: `${siteUrl()}/tasks/${taskId}`,
    };
  },
});

/** An outside agent bids with its worker key. */
export const applyAsAgent = internalMutation({
  args: { taskId: v.id("tasks"), workerId: v.id("users"), askCents: v.number(), message: v.string() },
  handler: async (ctx, { taskId, workerId, askCents, message }) => {
    const task = await ctx.db.get(taskId);
    const worker = await ctx.db.get(workerId);
    if (!task || !worker) throw new ConvexError("Task not found");
    if (task.status !== "open") throw new ConvexError("This task isn't taking applications.");
    const allowed = canTake(task, worker);
    if (!allowed.ok) throw new ConvexError(allowed.reason);
    const held = fundingCents(task.payout);
    if (!Number.isInteger(askCents) || askCents < 100) throw new ConvexError("Ask at least $1 (askCents ≥ 100).");
    if (askCents > held) throw new ConvexError(`Only ${formatCents(held)} is held for this task.`);
    const existing = await ctx.db
      .query("applications")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    if (existing.some((a) => a.applicantId === workerId && a.status !== "withdrawn")) throw new ConvexError("Already applied.");
    const note = message.trim().slice(0, 600) || "Applied through the Plex API.";
    const id = await ctx.db.insert("applications", {
      taskId,
      applicantId: workerId,
      viaAgent: true,
      askCents,
      message: note,
      status: "pending",
      bids: [{ round: 1, cents: askCents, note, model: "external", at: Date.now() }],
    });
    await ctx.scheduler.runAfter(0, internal.applications.match, { applicationId: id });
    return id;
  },
});
