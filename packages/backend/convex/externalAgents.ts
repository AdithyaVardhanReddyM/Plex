import { ConvexError, v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { safeAgentUrl } from "./lib/connect";
import { isImageSpec } from "./lib/hire";
import { seal, secretsConfigured, unseal } from "./lib/secrets";

/**
 * "Bring your agent": a developer lists an agent that runs on their own server.
 * Plex bids for it inside its price floor, and when it's hired POSTs it the task
 * (signed with HMAC-SHA256, so the server knows it's Plex). Its answer is checked
 * by code and three blind proofers like any agent's, and PayPal pays the
 * developer only when it passes (80%, Plex keeps 20%).
 *
 * The endpoint gets the task's words and deliverables only: never the poster's
 * identity, email or connected accounts. Its reply is data, never instructions.
 */

const TASK_TIMEOUT = 120_000;
const PING_TIMEOUT = 20_000;
const MAX_REPLY_BYTES = 12_000_000;
const RESERVED = new Set(["new", "bring", "plex", "admin", "scout", "quill", "tally", "pixel", "lingo", "patch", "reel"]);

type Deliver = { index: number; label: string; description: string; type: string };
type Reply = { items?: { index?: number; text?: string; url?: string; file?: { base64?: string; mediaType?: string } }[]; note?: string };

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `sha256=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))}`;
}

/** One signed POST to an agent's endpoint, with a deadline, no redirects and a size cap. */
async function call(url: string, secret: string, payload: unknown, timeoutMs: number): Promise<{ reply: Reply; ms: number }> {
  const safe = safeAgentUrl(url);
  if (!safe.ok) throw new Error(safe.reason);
  const body = JSON.stringify(payload);
  const at = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(safe.url, {
      method: "POST",
      redirect: "error", // a redirect could point anywhere, including inside Plex's network
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "user-agent": "Plex-Agent-Caller/1.0",
        "x-plex-timestamp": String(at),
        "x-plex-signature": await sign(secret, `${at}.${body}`),
      },
      body,
    });
    const bytes = await res.arrayBuffer();
    if (!res.ok) throw new Error(`answered ${res.status}`);
    if (bytes.byteLength > MAX_REPLY_BYTES) throw new Error("answered with more than 12 MB");
    let reply: Reply;
    try {
      reply = JSON.parse(new TextDecoder().decode(bytes)) as Reply;
    } catch {
      throw new Error("didn't answer with JSON");
    }
    if (!reply || !Array.isArray(reply.items)) throw new Error("answered without an items list");
    return { reply, ms: Date.now() - at };
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`didn't answer within ${Math.round(timeoutMs / 1000)}s`);
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timer);
  }
}

// ── Listing an agent ─────────────────────────────────────────────────────────

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "agent";

export const insert = internalMutation({
  args: {
    ownerId: v.id("users"),
    name: v.string(),
    tagline: v.string(),
    skills: v.array(v.string()),
    floorCents: v.number(),
    turnaround: v.string(),
    images: v.boolean(),
    payoutEmail: v.string(),
    host: v.string(),
    urlEnc: v.string(),
    secretEnc: v.string(),
    latencyMs: v.number(),
  },
  handler: async (ctx, a): Promise<{ handle: string; agentId: Id<"users"> }> => {
    const owner = await ctx.db.get(a.ownerId);
    if (!owner) throw new ConvexError("Sign in first.");
    const mine = (await ctx.db.query("users").withIndex("by_kind", (q) => q.eq("kind", "agent")).collect()).filter((u) => u.agentProfile?.ownerId === a.ownerId && u.agentProfile.endpoint);
    if (mine.length >= 10) throw new ConvexError("You can list up to 10 agents of your own.");
    let handle = slug(a.name);
    for (let n = 2; RESERVED.has(handle) || (await ctx.db.query("users").withIndex("by_handle", (q) => q.eq("handle", handle)).unique()); n++) handle = `${slug(a.name)}-${n}`;
    const agentId = await ctx.db.insert("users", {
      handle,
      name: a.name,
      kind: "agent",
      avatarColor: ["#3B5B7A", "#7A3B5B", "#5B7A3B", "#7A5B3B", "#3B7A6B"][handle.length % 5],
      bio: `Runs on ${a.host}. Listed by ${owner.name} with Bring your agent.`,
      area: "Online",
      skills: a.skills,
      tasksCompleted: 0,
      paypalEmail: a.payoutEmail,
      agentProfile: {
        house: true, // Plex bids for it and sends it the work
        custom: true, // its developer earns 80%, Plex keeps 20%
        ownerId: a.ownerId,
        model: "external",
        tagline: a.tagline,
        specialties: a.skills,
        floorCents: a.floorCents,
        turnaround: a.turnaround,
        tools: a.images ? ["image"] : [],
        endpoint: { host: a.host, urlEnc: a.urlEnc, secretEnc: a.secretEnc, verifiedAt: Date.now(), latencyMs: a.latencyMs },
      },
    });
    return { handle, agentId };
  },
});

/**
 * Lists an outside agent. Plex sends its endpoint a signed test task first and
 * lists it only if it answers correctly. The signing secret is returned once.
 */
export const register = action({
  args: {
    name: v.string(),
    tagline: v.string(),
    skills: v.array(v.string()),
    floorCents: v.number(),
    turnaround: v.string(),
    images: v.boolean(),
    url: v.string(),
    payoutEmail: v.string(),
    as: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<{ handle: string; secret: string; latencyMs: number; sample: string }> => {
    if (!secretsConfigured()) throw new ConvexError("This deployment has no CONNECTIONS_KEY, so it can't store an endpoint safely.");
    const ownerId: Id<"users"> = await ctx.runQuery(internal.autopay.actorId, { as: a.as });
    const name = a.name.replace(/[^\p{L}\p{N} .-]/gu, "").trim().slice(0, 24);
    if (name.length < 2) throw new ConvexError("Give your agent a name.");
    const tagline = a.tagline.trim().slice(0, 140);
    if (tagline.length < 8) throw new ConvexError("Say in a line what it delivers.");
    const skills = [...new Set(a.skills.map((s) => s.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim()).filter((s) => s.length > 1))].slice(0, 8);
    if (!skills.length) throw new ConvexError("Add a few skills, the words tasks it should bid on contain.");
    const floor = Math.round(a.floorCents);
    if (!(floor >= 100 && floor <= 500_00)) throw new ConvexError("The lowest price must be $1 to $500.");
    const email = a.payoutEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("Add the PayPal email its earnings go to.");
    const safe = safeAgentUrl(a.url);
    if (!safe.ok) throw new ConvexError(`Endpoint: ${safe.reason}`);

    const secret = `plex_whsec_${hex(crypto.getRandomValues(new Uint8Array(24)).buffer)}`;
    let test: { reply: Reply; ms: number };
    try {
      test = await call(
        safe.url,
        secret,
        {
          type: "ping",
          task: {
            id: "plex-handshake",
            title: "Plex handshake",
            instructions: "Plex is checking that this endpoint works. Reply to the one deliverable below in a sentence.",
            deliver: [{ index: 0, label: "Reply", description: "One sentence saying what you do", type: "text" }],
            payoutCents: 0,
          },
        },
        PING_TIMEOUT,
      );
    } catch (err) {
      throw new ConvexError(`Plex called your endpoint and it ${err instanceof Error ? err.message : "failed"}. Nothing was listed.`);
    }
    const sample = test.reply.items?.find((i) => (i.index ?? 0) === 0)?.text?.trim();
    if (!sample) throw new ConvexError("Your endpoint answered, but items[0].text was empty. Nothing was listed.");

    const made = await ctx.runMutation(internal.externalAgents.insert, {
      ownerId,
      name,
      tagline,
      skills,
      floorCents: floor,
      turnaround: a.turnaround.trim().slice(0, 40) || "about 2 minutes",
      images: a.images,
      payoutEmail: email,
      host: safe.host,
      urlEnc: await seal(safe.url),
      secretEnc: await seal(secret),
      latencyMs: test.ms,
    });
    return { handle: made.handle, secret, latencyMs: test.ms, sample: sample.slice(0, 300) };
  },
});

// ── Doing the work ───────────────────────────────────────────────────────────

export const noteFailure = internalMutation({
  args: { agentId: v.id("users"), ok: v.boolean(), latencyMs: v.optional(v.number()) },
  handler: async (ctx, { agentId, ok, latencyMs }) => {
    const a = await ctx.db.get(agentId);
    const p = a?.agentProfile;
    if (!a || !p?.endpoint) return;
    await ctx.db.patch(agentId, {
      agentProfile: { ...p, endpoint: { ...p.endpoint, failures: ok ? 0 : (p.endpoint.failures ?? 0) + 1, ...(latencyMs ? { latencyMs } : {}) } },
    });
  },
});

export const endpointOf = internalQuery({
  args: { agentId: v.id("users") },
  handler: async (ctx, { agentId }) => (await ctx.db.get(agentId))?.agentProfile?.endpoint ?? null,
});

/** Hired: POST the task to the agent's endpoint, store what it delivers, and submit it as proof. */
export const deliver = internalAction({
  args: { taskId: v.id("tasks"), agentId: v.id("users"), tries: v.optional(v.number()) },
  handler: async (ctx, { taskId, agentId, tries = 0 }) => {
    const c = await ctx.runQuery(internal.houseAgents.workContext, { taskId, agentId });
    const ep = await ctx.runQuery(internal.externalAgents.endpointOf, { agentId });
    if (!c || !ep) return;
    const { task, agent, rejectReason } = c;
    const deliver: Deliver[] = task.proofSpec.map((s, index) => ({ index, label: s.label, description: s.description, type: isImageSpec(s) ? "image" : s.type }));
    try {
      const { reply, ms } = await call(
        await unseal(ep.urlEnc),
        await unseal(ep.secretEnc),
        {
          type: "task",
          task: { id: task._id, title: task.title, instructions: task.description, deliver, payoutCents: task.payout.kind === "fixed" ? task.payout.amountCents : undefined, deadline: task.windowEnd },
          attempt: tries + 1,
          feedback: rejectReason ?? undefined,
        },
        TASK_TIMEOUT,
      );
      const items = await toItems(ctx, deliver, reply);
      await ctx.runMutation(internal.externalAgents.noteFailure, { agentId, ok: true, latencyMs: ms });
      await ctx.runMutation(internal.proofs.submitAsAgent, {
        taskId,
        workerId: agentId,
        items,
        note: `${agent.name} delivered ${items.length} of ${deliver.length} item${deliver.length > 1 ? "s" : ""} from its own endpoint (${ep.host}) in ${(ms / 1000).toFixed(1)}s.${reply.note ? ` Its note: ${String(reply.note).slice(0, 200)}` : ""}`,
      });
    } catch (err) {
      const why = err instanceof Error ? err.message : "failed";
      console.warn(`[external-agent] ${agent.name} (${ep.host}) ${why}`);
      await ctx.runMutation(internal.externalAgents.noteFailure, { agentId, ok: false });
      if (tries < 2) {
        await ctx.scheduler.runAfter(60_000 * (tries + 1), internal.externalAgents.deliver, { taskId, agentId, tries: tries + 1 });
        return;
      }
      // Three misses: an empty delivery, so the checks fail it and the poster's money goes back.
      await ctx.runMutation(internal.proofs.submitAsAgent, { taskId, workerId: agentId, items: [], note: `${agent.name}'s endpoint (${ep.host}) ${why}, three times.` });
    }
  },
});

/** The endpoint's answer, as proof items: text, links that are really links, and files Plex stores itself. */
async function toItems(ctx: ActionCtx, deliver: Deliver[], reply: Reply) {
  const out: { specIndex: number; text?: string; url?: string; storageId?: Id<"_storage">; capturedAt: number }[] = [];
  for (const d of deliver) {
    const it = reply.items?.find((x) => x.index === d.index) ?? (reply.items?.length === deliver.length ? reply.items[d.index] : undefined);
    if (!it) continue;
    const text = typeof it.text === "string" ? it.text.slice(0, 20_000) : undefined;
    const url = typeof it.url === "string" && /^https?:\/\/[^\s]+$/.test(it.url) ? it.url.slice(0, 2000) : undefined;
    if (d.type === "text") {
      if (text) out.push({ specIndex: d.index, text, capturedAt: Date.now() });
    } else if (d.type === "link") {
      if (url) out.push({ specIndex: d.index, url, text, capturedAt: Date.now() });
    } else {
      // Files: base64 from the agent (an image, a PDF, a CSV...), or its text as a Markdown file.
      const mt = it.file?.mediaType ?? "";
      if (it.file?.base64 && /^(image\/(png|jpeg|webp)|application\/pdf|text\/(plain|csv|markdown)|video\/mp4)$/.test(mt)) {
        const bin = atob(it.file.base64);
        if (bin.length > 10_000_000) continue;
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        out.push({ specIndex: d.index, storageId: await ctx.storage.store(new Blob([bytes], { type: mt })), capturedAt: Date.now() });
      } else if (text && d.type !== "image") {
        out.push({ specIndex: d.index, storageId: await ctx.storage.store(new Blob([text], { type: "text/markdown" })), capturedAt: Date.now() });
      }
    }
  }
  return out;
}
