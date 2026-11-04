import { v } from "convex/values";
import { z } from "zod";
import { action, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { proofSpecItem, verificationMode } from "./schema";
import { getActor, requireActor } from "./lib/actor";
import { generateStructured } from "./lib/ai";
import { challengeCode } from "./lib/money";
import { evaluate } from "./lib/policy";
import { fundingCents, lookupPlace } from "./lib/taskRules";

/**
 * Plex Tasks: post work, fund it through PayPal, pay on proof.
 * Money movements live in `taskMoney.ts`, applications and Match in
 * `applications.ts`, the proof engine in `proofs.ts`.
 */

const categoryV = v.union(
  v.literal("local"),
  v.literal("remote"),
  v.literal("data"),
  v.literal("creator"),
  v.literal("agent"),
  v.literal("impact"),
);

const ACTIVE: Doc<"tasks">["status"][] = ["assigned", "submitted", "verifying", "approved", "rejected", "disputed"];
const DONE: Doc<"tasks">["status"][] = ["paid", "refunded", "cancelled"];

async function personCard(ctx: QueryCtx, id: Id<"users"> | undefined) {
  if (!id) return null;
  const u = await ctx.db.get(id);
  if (!u) return null;
  return {
    _id: u._id,
    handle: u.handle,
    name: u.name,
    kind: u.kind,
    avatarColor: u.avatarColor,
    avatarUrl: u.avatarUrl,
    area: u.area,
    bio: u.bio,
    skills: u.skills,
    rating: u.rating,
    proofPassRate: u.proofPassRate,
    tasksCompleted: u.tasksCompleted,
    hasPaypal: Boolean(u.paypalEmail),
  };
}

export type PersonCard = NonNullable<Awaited<ReturnType<typeof personCard>>>;

async function withPeople(ctx: QueryCtx, tasks: Doc<"tasks">[]) {
  return Promise.all(
    tasks.map(async (t) => {
      const apps = await ctx.db
        .query("applications")
        .withIndex("by_task", (q) => q.eq("taskId", t._id))
        .collect();
      return {
        ...t,
        poster: await personCard(ctx, t.posterId),
        assignee: await personCard(ctx, t.assigneeId),
        applicantCount: apps.filter((a) => a.status !== "withdrawn").length,
        fundingCents: fundingCents(t.payout),
      };
    }),
  );
}

export type BoardTask = Awaited<ReturnType<typeof withPeople>>[number];

// ── Queries ──────────────────────────────────────────────────────────────────

/** The public board. Drafts never show. */
export const board = query({
  args: {
    category: v.optional(categoryV),
    status: v.optional(v.union(v.literal("open"), v.literal("active"), v.literal("done"))),
  },
  handler: async (ctx, { category, status = "open" }) => {
    const statuses = status === "open" ? (["open"] as const) : status === "active" ? ACTIVE : DONE;
    const rows: Doc<"tasks">[] = [];
    for (const s of statuses) {
      rows.push(
        ...(await ctx.db
          .query("tasks")
          .withIndex("by_status", (q) => q.eq("status", s))
          .order("desc")
          .take(100)),
      );
    }
    const filtered = rows
      .filter((t) => !category || t.category === category)
      .sort((a, b) => (status === "open" ? a.windowEnd - b.windowEnd : b._creationTime - a._creationTime));
    return withPeople(ctx, filtered);
  },
});

/** "My tasks": what the actor posted, and what they're taking or applied to. */
export const mine = query({
  args: { as: v.optional(v.string()) },
  handler: async (ctx, { as }) => {
    const actor = await getActor(ctx, as);
    if (!actor) return { posted: [], taking: [], applied: [] };
    const me = actor.user._id;
    const posted = await ctx.db
      .query("tasks")
      .withIndex("by_poster", (q) => q.eq("posterId", me))
      .order("desc")
      .collect();
    const taking = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", me))
      .order("desc")
      .collect();
    const apps = await ctx.db
      .query("applications")
      .withIndex("by_applicant", (q) => q.eq("applicantId", me))
      .collect();
    const appliedTasks: Doc<"tasks">[] = [];
    for (const a of apps) {
      if (a.status !== "pending") continue;
      const t = await ctx.db.get(a.taskId);
      if (t && t.assigneeId !== me) appliedTasks.push(t);
    }
    return {
      posted: await withPeople(ctx, posted),
      taking: await withPeople(ctx, taking),
      applied: await withPeople(ctx, appliedTasks),
    };
  },
});

/** Everything the task page needs, shaped for whoever is looking. */
export const get = query({
  args: { id: v.id("tasks"), as: v.optional(v.string()) },
  handler: async (ctx, { id, as }) => {
    const task = await ctx.db.get(id);
    if (!task) return null;
    const actor = await getActor(ctx, as);
    const me = actor?.user._id;

    const apps = await ctx.db
      .query("applications")
      .withIndex("by_task", (q) => q.eq("taskId", id))
      .collect();
    const applications = await Promise.all(
      apps
        .filter((a) => a.status !== "withdrawn")
        .map(async (a) => ({ ...a, applicant: await personCard(ctx, a.applicantId) })),
    );
    applications.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));

    const proofs = await ctx.db
      .query("proofs")
      .withIndex("by_task", (q) => q.eq("taskId", id))
      .order("desc")
      .collect();
    const latest = proofs[0];
    const proof = latest
      ? {
          ...latest,
          items: await Promise.all(
            latest.items.map(async (it) => ({
              ...it,
              imageUrl: it.storageId ? await ctx.storage.getUrl(it.storageId) : null,
            })),
          ),
        }
      : null;

    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_task", (q) => q.eq("taskId", id))
      .collect();
    receipts.sort((a, b) => a.occurredAt - b.occurredAt);

    const role: "poster" | "assignee" | "applicant" | "visitor" = !me
      ? "visitor"
      : task.posterId === me
        ? "poster"
        : task.assigneeId === me
          ? "assignee"
          : applications.some((a) => a.applicantId === me)
            ? "applicant"
            : "visitor";

    // The poster sees what the policy engine will say before funding.
    let policy: null | { potName: string; outcome: "allow" | "needs_approval" | "deny"; ruleText: string } = null;
    if (role === "poster" && task.funding.state === "unfunded") {
      const pot = await errandsPot(ctx, task);
      if (pot && actor) {
        const d = evaluate(pot.rules, {
          amountCents: fundingCents(task.payout),
          category: "Errands",
          hour: 12, // the server's hour is UTC; quiet hours are rechecked at funding with the client's hour
          spentTodayCents: pot.spentTodayCents,
          balanceCents: pot.balanceCents,
          paused: Boolean(actor.user.agentsPaused),
        });
        policy = { potName: pot.name, outcome: d.outcome, ruleText: d.ruleText };
      }
    }

    return {
      task: { ...task, fundingCents: fundingCents(task.payout) },
      poster: await personCard(ctx, task.posterId),
      assignee: await personCard(ctx, task.assigneeId),
      applications,
      myApplication: applications.find((a) => a.applicantId === me) ?? null,
      proof,
      proofCount: proofs.length,
      receipts,
      role,
      me: actor ? await personCard(ctx, actor.user._id) : null,
      policy,
    };
  },
});

/**
 * Demo people a guest can act as: Adi and the NGO post, the workers take
 * tasks. Adi first, then the NGO, then the workers.
 */
export const personas = query({
  args: {},
  handler: async (ctx) => {
    const people = await ctx.db
      .query("users")
      .withIndex("by_kind", (q) => q.eq("kind", "person"))
      .collect();
    const orgs = await ctx.db
      .query("users")
      .withIndex("by_kind", (q) => q.eq("kind", "org"))
      .collect();
    const adi = people.filter((p) => p.isDemo && p.handle === "adi");
    const workers = people.filter((p) => p.isDemo && p.handle !== "adi" && (p.tasksCompleted ?? 0) > 0);
    return Promise.all(
      [...adi, ...orgs.filter((o) => o.isDemo), ...workers].map((p) => personCard(ctx, p._id)),
    ).then((cards) => cards.filter(Boolean) as PersonCard[]);
  },
});

export async function errandsPot(ctx: QueryCtx, task: Doc<"tasks">) {
  if (task.potId) return ctx.db.get(task.potId);
  const pots = await ctx.db
    .query("pots")
    .withIndex("by_owner", (q) => q.eq("ownerId", task.posterId))
    .collect();
  return pots.find((p) => p.name === "Errands") ?? null;
}

export const internalGet = internalQuery({
  args: { id: v.id("tasks") },
  handler: (ctx, { id }) => ctx.db.get(id),
});

// ── Task Writer ──────────────────────────────────────────────────────────────

const writerSchema = z.object({
  title: z.string().describe("Short, specific task title, sentence case, under 70 characters"),
  description: z
    .string()
    .describe("2-3 plain sentences: where, what exactly to do, what to capture. No hype."),
  category: z.enum(["local", "remote", "data", "creator", "agent", "impact"]),
  locationLabel: z.string().nullable().describe("A place a worker can find, or null for remote work"),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  radiusM: z.number().nullable().describe("How close proof must be taken, in meters"),
  startsInHours: z.number().describe("Hours from now when the window opens, 0 for now"),
  durationHours: z.number().describe("Length of the window in hours"),
  payoutCents: z.number().int().describe("A fair fixed payout in US cents for the effort"),
  proofSpec: z
    .array(
      z.object({
        label: z.string().describe("1-3 words, e.g. Storefront"),
        description: z.string().describe("What the photo or item must show"),
        type: z.enum(["photo", "video", "file", "text", "link"]),
      }),
    )
    .min(1)
    .max(5),
  verificationMode: z.enum(["auto", "one_tap", "manual"]),
  tags: z.array(z.string()).max(3),
});

export type TaskDraft = z.infer<typeof writerSchema>;

/**
 * The Task Writer agent: a loose request in, a clear task card out.
 * Gemini when configured; otherwise a labeled heuristic.
 */
export const write = action({
  args: { brief: v.string() },
  handler: async (_ctx, { brief }) => {
    const trimmed = brief.trim().slice(0, 1200);
    if (trimmed.length < 8) throw new Error("Say a little more about what you need done.");
    const now = new Date();
    const result = await generateStructured({
      name: "task-writer",
      schema: writerSchema,
      system: [
        "You are Plex's Task Writer. You turn a poster's loose request into a clear, fair task card for a human worker.",
        "Be concrete and brief. Never invent facts the poster did not give; leave the location null if the work is remote.",
        "The proof spec lists exactly what evidence proves the work: usually 1-3 photos with what each must show.",
        "Every task also asks the worker to show a challenge code in one photo; do not add it to the spec yourself.",
        "Pick 'one_tap' verification unless the poster asks for automatic or manual review.",
        "Pay fairly: about $15-25 for a short local errand, more for long or skilled work. Respect any budget the poster names.",
        "If you know the place, give its coordinates in San Francisco Bay Area terms; otherwise null.",
      ].join("\n"),
      prompt: `Current time: ${now.toISOString()}.\nPoster's request: "${trimmed}"`,
      fallback: () => heuristicDraft(trimmed),
    });
    return { draft: result.object, model: result.model };
  },
});

/** Deterministic Task Writer, used when there is no Gemini key. */
export function heuristicDraft(brief: string): TaskDraft {
  const text = brief.toLowerCase();
  const money = brief.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  const place = lookupPlace(brief);

  const category: TaskDraft["category"] =
    /clean ?up|volunteer|shoreline|park|community/.test(text)
      ? "impact"
      : /label|rate|rating|transcri|annotat|survey/.test(text)
        ? "data"
        : /video|reel|tiktok|short|post about/.test(text)
          ? "creator"
          : /test|review|remote|online|app|website|call/.test(text) && !place
            ? "remote"
            : "local";

  const spec: TaskDraft["proofSpec"] = [];
  const add = (label: string, description: string, type: TaskDraft["proofSpec"][number]["type"] = "photo") =>
    spec.length < 4 && !spec.some((s) => s.label === label) && spec.push({ label, description, type });
  if (/caf[eé]|shop|store|restaurant|bar|bakery|taqueria|place/.test(text))
    add("Storefront", "The front of the place, with its sign readable");
  if (/menu/.test(text)) add("Menu", "The full menu with prices, legible");
  if (/quiet|corner|seat|table|outlet|work from/.test(text))
    add("Seating area", "The quietest corner, showing outlets if there are any");
  if (/line|queue|wait/.test(text)) add("The line", "The line from its end, showing how long it is");
  if (/pick ?up|grab|collect/.test(text)) add("Pickup", "The item or ticket at the counter");
  if (/drop|deliver/.test(text)) add("Drop-off", "The item at its destination");
  if (/before|after|clean/.test(text)) {
    add("Before", "The spot before you start");
    add("After", "The same spot, same angle, when you're done");
  }
  if (/price|cost/.test(text) && !spec.some((s) => s.label === "Menu"))
    add("Prices", "The price tags or board, legible");
  if (category === "data") add("Completed work", "A link to the finished sheet or file", "link");
  if (category === "remote") add("Recording", "A screen recording of the full flow", "video");
  if (spec.length === 0) add("Photo of the result", "A clear photo showing the task done");
  if (category !== "data") add("Notes", "Anything the poster should know, in a sentence or two", "text");

  let startsInHours = 0;
  let durationHours = 4;
  if (/tomorrow/.test(text)) {
    startsInHours = 24 - new Date().getHours() + 9;
    durationHours = 9;
  } else if (/this week|by friday|weekend|saturday|sunday/.test(text)) durationHours = 72;
  const by = text.match(/(?:before|by)\s+(\d{1,2})(?::\d{2})?\s*(am|pm)?/);
  if (by) {
    let h = Number(by[1]);
    if (by[2] === "pm" || (!by[2] && h < 8)) h += 12;
    const diff = h - new Date().getHours();
    if (diff > 0) durationHours = diff;
  }

  const base = category === "local" ? 1800 : category === "impact" ? 4500 : category === "data" ? 3000 : 2500;
  const payoutCents = money ? Math.round(Number(money[1]) * 100) : base;

  const first = brief.split(/[.!?\n]/)[0]!.trim();
  const title = sentenceTitle(first);

  return {
    title,
    description: [
      place ? `Go to ${place.label}.` : category === "local" ? "Go to the place described." : "",
      sentence(stripLead(brief)),
      `Capture: ${spec
        .filter((s) => s.type !== "text")
        .map((s) => s.label.toLowerCase())
        .join(", ")}.`,
    ]
      .filter(Boolean)
      .join(" "),
    category,
    locationLabel: place?.label ?? null,
    lat: place?.lat ?? null,
    lng: place?.lng ?? null,
    radiusM: place?.radiusM ?? (place ? 300 : null),
    startsInHours,
    durationHours,
    payoutCents,
    proofSpec: spec,
    verificationMode: /automatic|auto[- ]?approve|just pay/.test(text) ? "auto" : /manual|i'll check/.test(text) ? "manual" : "one_tap",
    tags: [
      category === "local" ? "Errand" : category === "impact" ? "Impact" : category === "data" ? "Data" : "Remote",
      spec.some((s) => s.type === "photo") ? "Photos" : "Online",
      durationHours <= 8 ? "Today" : "This week",
    ],
  };
}

function sentence(s: string) {
  const t = s.trim().replace(/\s+/g, " ");
  const c = t[0]!.toUpperCase() + t.slice(1);
  return /[.!?]$/.test(c) ? c : c + ".";
}

function stripLead(s: string) {
  const t = s
    .replace(/^(please\s+)?(can you|could you|i need|i want|find|get|hire)?\s*(someone|somebody|a person)\s+(to\s+)?/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return t || s.trim();
}

function sentenceTitle(s: string) {
  let t = stripLead(s);
  t = t[0]!.toUpperCase() + t.slice(1);
  return t.length > 70 ? t.slice(0, 67).replace(/\s+\S*$/, "") + "…" : t;
}

// ── Drafts ───────────────────────────────────────────────────────────────────

/** Saves the poster's edited task card as a draft, ready to fund. */
export const createDraft = mutation({
  args: {
    brief: v.string(),
    title: v.string(),
    description: v.string(),
    category: categoryV,
    location: v.optional(
      v.object({
        label: v.string(),
        lat: v.optional(v.number()),
        lng: v.optional(v.number()),
        radiusM: v.optional(v.number()),
      }),
    ),
    windowStart: v.number(),
    windowEnd: v.number(),
    payoutCents: v.number(),
    proofSpec: v.array(proofSpecItem),
    verificationMode,
    tags: v.array(v.string()),
    writerModel: v.optional(v.string()),
    as: v.optional(v.string()),
  },
  handler: async (ctx, { as, ...args }) => {
    const { user } = await requireActor(ctx, as);
    if (!args.title.trim()) throw new Error("Give the task a title.");
    if (!Number.isInteger(args.payoutCents) || args.payoutCents < 100)
      throw new Error("Payout must be at least $1.");
    if (args.payoutCents > 100_000) throw new Error("Sandbox tasks are capped at $1,000.");
    if (args.windowEnd <= args.windowStart) throw new Error("The window must end after it starts.");
    if (args.proofSpec.length === 0) throw new Error("Add at least one proof item.");
    const pots = await ctx.db
      .query("pots")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    return ctx.db.insert("tasks", {
      posterId: user._id,
      postedVia: "web",
      title: args.title.trim(),
      brief: args.brief.trim(),
      description: args.description.trim(),
      category: args.category,
      location: args.location,
      windowStart: args.windowStart,
      windowEnd: args.windowEnd,
      payout: { kind: "fixed", amountCents: args.payoutCents },
      currency: "USD",
      proofSpec: args.proofSpec,
      verificationMode: args.verificationMode,
      challengeCode: challengeCode(Math.random()),
      status: "draft",
      funding: { state: "unfunded" },
      tags: args.tags.slice(0, 4),
      potId: pots.find((p) => p.name === "Errands")?._id,
      writerModel: args.writerModel,
    });
  },
});

/** Cancels a task nobody has been paid for. Funded tasks refund via taskMoney. */
export const cancelDraft = mutation({
  args: { id: v.id("tasks"), as: v.optional(v.string()) },
  handler: async (ctx, { id, as }) => {
    const { user } = await requireActor(ctx, as);
    const task = await ctx.db.get(id);
    if (!task || task.posterId !== user._id) throw new Error("Task not found");
    if (task.funding.state !== "unfunded") throw new Error("This task is funded; refund it instead.");
    await ctx.db.patch(id, { status: "cancelled" });
  },
});
