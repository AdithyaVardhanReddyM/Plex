import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { internalAction, internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActor } from "./lib/actor";
import { aiConfigured, generateStructured, HEURISTIC, type AiImage } from "./lib/ai";
import { advanceReceipt } from "./lib/receipts";
import { distanceM, formatDistance } from "./lib/taskRules";

/**
 * The proof engine (plan §5). The worker uploads evidence; each check
 * resolves on its own row so the poster can watch it happen:
 *  - content: Gemini vision checks each spec item (heuristic: present or not)
 *  - time: capture time inside the task window
 *  - place: photo GPS or browser location within the task's radius
 *  - challenge code: the task's word visible in one photo
 *  - originality: the exact photo was never submitted before (sha256)
 * Anything unsure goes to a human. Heuristic verdicts never auto-release.
 */

type CheckStatus = "pending" | "pass" | "fail" | "unsure";
type Progress = { check: string; status: CheckStatus; detail?: string };

const AUTO_RELEASE_CONFIDENCE = 0.9;
const MIN = 60_000;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireActor(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

const itemV = v.object({
  specIndex: v.number(),
  storageId: v.optional(v.id("_storage")),
  url: v.optional(v.string()),
  text: v.optional(v.string()),
  capturedAt: v.optional(v.number()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
});

export const submit = mutation({
  args: {
    taskId: v.id("tasks"),
    items: v.array(itemV),
    note: v.optional(v.string()),
    challengeConfirmed: v.optional(v.boolean()),
    as: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, items, note, challengeConfirmed, as }) => {
    const { user } = await requireActor(ctx, as);
    const task = await ctx.db.get(taskId);
    if (!task) throw new ConvexError("Task not found");
    if (task.assigneeId !== user._id) throw new ConvexError("Only the assigned worker can submit proof.");
    if (!["assigned", "rejected"].includes(task.status)) throw new ConvexError("This task isn't waiting for proof.");

    const stored = [];
    for (let i = 0; i < task.proofSpec.length; i++) {
      const spec = task.proofSpec[i]!;
      const it = items.find((x) => x.specIndex === i);
      const needsFile = spec.type === "photo" || spec.type === "video" || spec.type === "file";
      if (needsFile && !it?.storageId) throw new ConvexError(`Add the “${spec.label}” ${spec.type}.`);
      if (spec.type === "text" && !it?.text?.trim()) throw new ConvexError(`Fill in “${spec.label}”.`);
      if (spec.type === "link" && !/^https?:\/\/\S+$/.test(it?.url ?? "")) throw new ConvexError(`Add a link for “${spec.label}”.`);
      if (!it) continue;
      let phash: string | undefined;
      if (it.storageId) {
        const meta = await ctx.db.system.get(it.storageId);
        if (!meta) throw new ConvexError("An upload didn't finish. Try again.");
        if (spec.type === "photo" && meta.contentType && !meta.contentType.startsWith("image/"))
          throw new ConvexError(`“${spec.label}” must be a photo.`);
        phash = meta.sha256;
      }
      stored.push({ ...it, text: it.text?.trim().slice(0, 2000), phash });
    }

    const proofId = await ctx.db.insert("proofs", {
      taskId,
      workerId: user._id,
      items: stored,
      note: note?.trim().slice(0, 1000) || undefined,
      status: "checking",
      challengeConfirmed,
      progress: planChecks(task).map((check) => ({ check, status: "pending" as const })),
    });
    await ctx.db.patch(taskId, { status: "verifying" });
    await ctx.scheduler.runAfter(0, internal.proofs.check, { proofId });
    return proofId;
  },
});

/** The list of checks, in the order they resolve on screen. */
function planChecks(task: Doc<"tasks">): string[] {
  const names = task.proofSpec.map((s) => s.label);
  const hasPhotos = task.proofSpec.some((s) => s.type === "photo" || s.type === "video");
  names.push("Taken in the window");
  if (task.location?.lat !== undefined) names.push("At the location");
  if (hasPhotos) names.push("Challenge code", "Original photos");
  return names;
}

// ── The engine ───────────────────────────────────────────────────────────────

export const checkContext = internalQuery({
  args: { proofId: v.id("proofs") },
  handler: async (ctx, { proofId }) => {
    const proof = await ctx.db.get(proofId);
    if (!proof) return null;
    const task = await ctx.db.get(proof.taskId);
    if (!task) return null;
    const seen = new Set<string>();
    for (const p of await ctx.db.query("proofs").collect()) {
      if (p._id === proofId || (p.taskId === proof.taskId && p.workerId === proof.workerId)) continue;
      for (const it of p.items) if (it.phash) seen.add(it.phash);
    }
    const mediaTypes: Record<string, string> = {};
    for (const it of proof.items)
      if (it.storageId) mediaTypes[it.storageId] = (await ctx.db.system.get(it.storageId))?.contentType ?? "image/jpeg";
    const reused = proof.items.filter((it) => it.phash && seen.has(it.phash)).map((it) => it.specIndex);
    return { proof, task, reused, mediaTypes };
  },
});

export const setProgress = internalMutation({
  args: {
    proofId: v.id("proofs"),
    check: v.string(),
    status: v.union(v.literal("pending"), v.literal("pass"), v.literal("fail"), v.literal("unsure")),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, { proofId, check, status, detail }) => {
    const p = await ctx.db.get(proofId);
    if (!p) return;
    await ctx.db.patch(proofId, {
      progress: (p.progress ?? []).map((row) => (row.check === check ? { check, status, detail } : row)),
    });
  },
});

export const finalize = internalMutation({
  args: {
    proofId: v.id("proofs"),
    result: v.union(v.literal("pass"), v.literal("fail"), v.literal("unsure")),
    confidence: v.number(),
    summary: v.string(),
    checks: v.array(v.object({ check: v.string(), passed: v.boolean(), detail: v.string() })),
    model: v.string(),
  },
  handler: async (ctx, { proofId, ...verdict }) => {
    const proof = await ctx.db.get(proofId);
    if (!proof) return;
    const task = await ctx.db.get(proof.taskId);
    await ctx.db.patch(proofId, { status: verdict.result, verdict });
    if (!task) return;
    await ctx.db.patch(task._id, { status: "submitted" });
    const auto =
      task.verificationMode === "auto" &&
      verdict.result === "pass" &&
      verdict.model !== HEURISTIC &&
      verdict.confidence >= AUTO_RELEASE_CONFIDENCE;
    if (auto) await ctx.scheduler.runAfter(0, internal.taskMoney.autoRelease, { taskId: task._id });
  },
});

const visionSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int().describe("The spec item number given with the photo"),
      verdict: z.enum(["pass", "fail", "unsure"]),
      detail: z.string().describe("One short factual sentence about what the photo shows"),
    }),
  ),
  challengeCode: z.object({
    verdict: z.enum(["pass", "fail", "unsure"]).describe("pass only if the exact code is clearly visible in a photo"),
    detail: z.string(),
  }),
  confidence: z.number().min(0).max(1).describe("Overall confidence that the work was done as specified"),
  summary: z.string().describe("Two sentences at most, plain and factual"),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const check = internalAction({
  args: { proofId: v.id("proofs") },
  handler: async (ctx, { proofId }) => {
    const c = await ctx.runQuery(internal.proofs.checkContext, { proofId });
    if (!c) return;
    const { proof, task, reused, mediaTypes } = c;
    const results: Progress[] = [];
    const put = async (check: string, status: CheckStatus, detail: string) => {
      results.push({ check, status, detail });
      await ctx.runMutation(internal.proofs.setProgress, { proofId, check, status, detail });
      await sleep(550);
    };

    // 1. Content, with Gemini vision when configured.
    const images: AiImage[] = [];
    if (aiConfigured()) {
      for (const it of proof.items) {
        if (!it.storageId) continue;
        const spec = task.proofSpec[it.specIndex]!;
        if (spec.type !== "photo") continue;
        const blob = await ctx.storage.get(it.storageId);
        if (!blob) continue;
        images.push({
          data: await blob.arrayBuffer(),
          mediaType: mediaTypes[it.storageId] ?? "image/jpeg",
          label: `Spec item ${it.specIndex}: ${spec.label}. Must show: ${spec.description}`,
        });
      }
    }
    await sleep(400);
    const vision = await generateStructured({
      name: "proof-engine",
      schema: visionSchema,
      system: [
        "You are Plex's proof engine. A worker was paid to do a task and submitted photos as proof.",
        "Check each photo strictly against its spec item. Say only what you can see. If a photo is blurry, unrelated or ambiguous, say unsure or fail.",
        `The challenge code is "${task.challengeCode}". It must be visibly written or shown in at least one photo (on paper or a screen). Mark pass only if you can read it.`,
      ].join("\n"),
      prompt: `Task: ${task.title}\n${task.description}\nWorker's note: ${proof.note ?? "(none)"}\nPhotos follow, each labeled with its spec item number.`,
      images,
      fallback: () => heuristicVision(task, proof),
    });
    const v = vision.object;
    const model = images.length || vision.model === HEURISTIC ? vision.model : HEURISTIC;

    for (let i = 0; i < task.proofSpec.length; i++) {
      const spec = task.proofSpec[i]!;
      const it = proof.items.find((x) => x.specIndex === i);
      if (spec.type === "text") {
        await put(spec.label, it?.text ? "pass" : "fail", it?.text ? `“${clip(it.text, 70)}”` : "Left empty");
      } else if (spec.type === "link") {
        await put(spec.label, it?.url ? "pass" : "fail", it?.url ? `Link given: ${clip(it.url, 48)}` : "No link");
      } else {
        const r = v.items.find((x) => x.index === i);
        await put(spec.label, r?.verdict ?? "unsure", r?.detail ?? "Not checked");
      }
    }

    // 2. Time window.
    const times = proof.items.map((it) => it.capturedAt).filter((t): t is number => typeof t === "number");
    if (!times.length) await put("Taken in the window", "unsure", "No capture time on the uploads");
    else {
      const slack = 15 * MIN;
      const outside = times.filter((t) => t < task.windowStart - slack || t > task.windowEnd + slack);
      const now = Date.now();
      const ago = (t: number) => Math.max(0, Math.round((now - t) / MIN));
      const oldest = ago(Math.min(...times)), newest = ago(Math.max(...times));
      await put(
        "Taken in the window",
        outside.length ? "fail" : "pass",
        outside.length
          ? `${outside.length} of ${times.length} taken outside the window`
          : `Taken ${oldest === newest ? `${oldest}` : `${newest}–${oldest}`} min before upload, inside the window`,
      );
    }

    // 3. Place.
    if (task.location?.lat !== undefined && task.location.lng !== undefined) {
      const target = { lat: task.location.lat, lng: task.location.lng };
      const located = proof.items.filter((it) => it.lat !== undefined && it.lng !== undefined);
      if (!located.length) await put("At the location", "unsure", "No location shared at upload");
      else {
        const far = Math.max(...located.map((it) => distanceM(target, { lat: it.lat!, lng: it.lng! })));
        const radius = (task.location.radiusM ?? 300) + 100;
        await put(
          "At the location",
          far <= radius ? "pass" : "fail",
          far <= radius
            ? `Within ${formatDistance(Math.max(far, 10))} of ${task.location.label.split(",")[0]}`
            : `${formatDistance(far)} from ${task.location.label.split(",")[0]}`,
        );
      }
    }

    // 4. Challenge code and 5. originality (photos only).
    if (task.proofSpec.some((s) => s.type === "photo" || s.type === "video")) {
      await put("Challenge code", v.challengeCode.verdict, v.challengeCode.detail);
      await put(
        "Original photos",
        reused.length ? "fail" : "pass",
        reused.length
          ? `${reused.length} photo${reused.length > 1 ? "s" : ""} already used in an earlier submission`
          : "None of these photos was submitted before",
      );
    }

    // Verdict.
    const fails = results.filter((r) => r.status === "fail").length;
    const unsure = results.filter((r) => r.status === "unsure").length;
    const result = fails ? "fail" : unsure ? "unsure" : "pass";
    const passed = results.length - fails - unsure;
    const confidence =
      model === HEURISTIC
        ? result === "pass" ? 0.72 : result === "fail" ? 0.8 : 0.5
        : Math.max(0, Math.min(1, result === "pass" ? v.confidence : result === "fail" ? Math.max(v.confidence, 0.7) : Math.min(v.confidence, 0.6)));
    const summary =
      model === HEURISTIC
        ? `${passed} of ${results.length} checks passed${unsure ? `, ${unsure} need a human` : ""}${fails ? `, ${fails} failed` : ""}. Photos weren't read by AI (no Gemini key), so a person decides.`
        : v.summary;

    await ctx.runMutation(internal.proofs.finalize, {
      proofId,
      result,
      confidence,
      summary,
      checks: results.map((r) => ({
        check: r.check,
        passed: r.status === "pass",
        detail: r.status === "unsure" ? `Unsure · ${r.detail ?? ""}` : (r.detail ?? ""),
      })),
      model,
    });
  },
});

/** Without vision: a photo is present, the code is whatever the worker confirmed. */
function heuristicVision(task: Doc<"tasks">, proof: Doc<"proofs">): z.infer<typeof visionSchema> {
  return {
    items: task.proofSpec.map((spec, index) => {
      const it = proof.items.find((x) => x.specIndex === index);
      const present = Boolean(it?.storageId);
      return {
        index,
        verdict: present ? ("pass" as const) : ("fail" as const),
        detail: present ? `${spec.type === "photo" ? "Photo" : "File"} received · contents not read (heuristic)` : "Missing",
      };
    }),
    challengeCode: proof.challengeConfirmed
      ? { verdict: "pass", detail: `Worker confirmed “${task.challengeCode}” is in a photo · not read (heuristic)` }
      : { verdict: "unsure", detail: `Can't read “${task.challengeCode}” without vision; check the photos` },
    confidence: 0.7,
    summary: "",
  };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
// ── Decisions: reject, contest, mediate ─────────────────────────────────────

async function fundingReceiptId(ctx: MutationCtx, task: Doc<"tasks">): Promise<Id<"receipts"> | undefined> {
  if (task.fundingReceiptId) return task.fundingReceiptId;
  const rows = await ctx.db
    .query("receipts")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  return rows.find((r) => r.kind === "task_funding")?._id;
}

export const reject = mutation({
  args: { proofId: v.id("proofs"), reason: v.string(), as: v.optional(v.string()) },
  handler: async (ctx, { proofId, reason, as }) => {
    const { user } = await requireActor(ctx, as);
    const proof = await ctx.db.get(proofId);
    if (!proof) throw new ConvexError("Proof not found");
    const task = await ctx.db.get(proof.taskId);
    if (!task || task.posterId !== user._id) throw new ConvexError("Only the poster can reject proof.");
    if (task.status !== "submitted") throw new ConvexError("There's no proof waiting for a decision.");
    const why = reason.trim() || "Didn't match the proof spec";
    await ctx.db.patch(proofId, { decision: "rejected", rejectReason: why.slice(0, 400) });
    await ctx.db.patch(task._id, { status: "rejected" });
    const rid = await fundingReceiptId(ctx, task);
    if (rid) {
      const r = await ctx.db.get(rid);
      if (r)
        await ctx.db.patch(rid, {
          timeline: [...r.timeline, { at: Date.now(), label: `Proof rejected: ${clip(why, 60)}. Still held while the worker can contest`, state: r.state }],
        });
    }
  },
});

export const contest = mutation({
  args: { proofId: v.id("proofs"), note: v.string(), as: v.optional(v.string()) },
  handler: async (ctx, { proofId, note, as }) => {
    const { user } = await requireActor(ctx, as);
    const proof = await ctx.db.get(proofId);
    if (!proof || proof.workerId !== user._id) throw new ConvexError("Only the worker can contest.");
    const task = await ctx.db.get(proof.taskId);
    if (!task || task.status !== "rejected") throw new ConvexError("Only a rejected proof can be contested.");
    if (!note.trim()) throw new ConvexError("Say why the proof should pass.");
    await ctx.db.patch(proofId, { decision: "contested", contestNote: note.trim().slice(0, 800) });
    await ctx.db.patch(task._id, { status: "disputed" });
    const rid = await fundingReceiptId(ctx, task);
    if (rid) await advanceReceipt(ctx, rid, "disputed", `${user.name.split(" ")[0]} contested the rejection`);
    await ctx.scheduler.runAfter(0, internal.proofs.mediate, { proofId });
  },
});

export const saveMediation = internalMutation({
  args: {
    proofId: v.id("proofs"),
    summary: v.string(),
    recommendation: v.union(v.literal("release"), v.literal("partial"), v.literal("refund")),
    model: v.string(),
  },
  handler: async (ctx, { proofId, ...m }) => {
    await ctx.db.patch(proofId, { mediation: m });
  },
});

const mediationSchema = z.object({
  summary: z.string().describe("3 sentences max: what the spec asked, what the proof shows, where the two sides disagree"),
  recommendation: z.enum(["release", "partial", "refund"]),
});

/** The Mediator agent: both sides, against the original spec. */
export const mediate = internalAction({
  args: { proofId: v.id("proofs") },
  handler: async (ctx, { proofId }) => {
    const c = await ctx.runQuery(internal.proofs.checkContext, { proofId });
    if (!c) return;
    const { proof, task } = c;
    const checks = proof.verdict?.checks ?? [];
    const result = await generateStructured({
      name: "mediator",
      schema: mediationSchema,
      system:
        "You are Plex's Mediator. Summarize a disputed task fairly for the poster, citing the original proof spec, the proof engine's checks, the poster's rejection and the worker's reply. Recommend release, partial or refund. Never decide; the poster does.",
      prompt: JSON.stringify({
        spec: task.proofSpec.map((s) => `${s.label}: ${s.description}`),
        checks,
        verdict: proof.verdict?.summary,
        posterRejected: proof.rejectReason,
        workerContested: proof.contestNote,
      }),
      fallback: () => {
        const hard = checks.filter((k) => !k.passed && /window|location|original/i.test(k.check));
        const soft = checks.filter((k) => !k.passed && !hard.includes(k));
        return {
          summary: [
            `The spec asked for ${task.proofSpec.map((s) => s.label.toLowerCase()).join(", ")}.`,
            `The proof engine passed ${checks.filter((k) => k.passed).length} of ${checks.length} checks${hard.length ? `; it failed ${hard.map((k) => k.check.toLowerCase()).join(" and ")}` : ""}.`,
            `The poster said “${clip(proof.rejectReason ?? "", 90)}”; the worker replied “${clip(proof.contestNote ?? "", 90)}”.`,
          ].join(" "),
          recommendation: hard.length ? ("refund" as const) : soft.length ? ("partial" as const) : ("release" as const),
        };
      },
    });
    await ctx.runMutation(internal.proofs.saveMediation, {
      proofId,
      summary: result.object.summary,
      recommendation: result.object.recommendation,
      model: result.model,
    });
  },
});
