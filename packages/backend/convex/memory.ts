import { ConvexError, v } from "convex/values";
import { action, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { memoryKind, memorySource } from "./schema";
import { agentUser, requireAgent } from "./lib/agentAuth";
import { getViewer, requireViewer } from "./lib/viewer";
import { logActivity } from "./agent";

/**
 * What Plex knows about the user. Every memory is plain text with a kind,
 * where it came from and how often it was used; the user can edit, pin or
 * forget any of them. The brain computes embeddings (768 dims,
 * gemini-embedding-001); an empty `embedding` means "re-embed me" (edited in
 * the window, or seeded).
 */

export const EMBEDDING_DIMS = 768;

type Memory = Doc<"memories">;
const withoutEmbedding = ({ embedding, ...m }: Memory) => ({ ...m, needsEmbedding: embedding.length === 0 });

function checkEmbedding(embedding: number[]) {
  if (embedding.length !== 0 && embedding.length !== EMBEDDING_DIMS)
    throw new ConvexError(`Embeddings must have ${EMBEDDING_DIMS} numbers (got ${embedding.length})`);
}

// ── Main window ──────────────────────────────────────────────────────────────

export const list = query({
  args: { kind: v.optional(memoryKind), q: v.optional(v.string()) },
  handler: async (ctx, { kind, q }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const needle = q?.trim().toLowerCase();
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_owner", (x) => x.eq("ownerId", viewer.user._id))
      .order("desc")
      .collect();
    return rows
      .filter((m) => !m.archived)
      .filter((m) => !kind || m.kind === kind)
      .filter((m) => !needle || m.text.toLowerCase().includes(needle) || m.about?.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .map(withoutEmbedding);
  },
});

async function ownMemory(ctx: QueryCtx, ownerId: Id<"users">, id: Id<"memories">) {
  const m = await ctx.db.get(id);
  if (!m || m.ownerId !== ownerId) throw new ConvexError("Memory not found");
  return m;
}

/** A text change clears the embedding; the brain re-embeds it on its next loop. */
export const update = mutation({
  args: {
    memoryId: v.id("memories"),
    text: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
    kind: v.optional(memoryKind),
  },
  handler: async (ctx, { memoryId, text, pinned, kind }) => {
    const { user } = await requireViewer(ctx);
    const m = await ownMemory(ctx, user._id, memoryId);
    const newText = text?.trim();
    const textChanged = newText !== undefined && newText.length > 0 && newText !== m.text;
    await ctx.db.patch(memoryId, {
      ...(textChanged ? { text: newText.slice(0, 1_000), embedding: [], source: "settings" as const, confidence: 1 } : {}),
      ...(pinned !== undefined ? { pinned } : {}),
      ...(kind ? { kind } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const forget = mutation({
  args: { memoryId: v.id("memories") },
  handler: async (ctx, { memoryId }) => {
    const { user } = await requireViewer(ctx);
    const m = await ownMemory(ctx, user._id, memoryId);
    await ctx.db.patch(memoryId, { archived: true, pinned: false, updatedAt: Date.now() });
    await logActivity(ctx, { ownerId: user._id, kind: "memory", title: "Forgot a memory", detail: m.text });
    return null;
  },
});

// ── Brain ────────────────────────────────────────────────────────────────────

export const insert = mutation({
  args: {
    secret: v.string(),
    kind: memoryKind,
    text: v.string(),
    about: v.optional(v.string()),
    source: memorySource,
    confidence: v.number(),
    embedding: v.array(v.float64()),
    pinned: v.optional(v.boolean()),
  },
  handler: async (ctx, { secret, pinned, embedding, ...fields }) => {
    const user = await agentUser(ctx, secret);
    checkEmbedding(embedding);
    const now = Date.now();
    const text = fields.text.trim().slice(0, 1_000);
    if (!text) throw new ConvexError("A memory needs text");
    const id = await ctx.db.insert("memories", {
      ...fields,
      text,
      confidence: Math.min(1, Math.max(0, fields.confidence)),
      ownerId: user._id,
      embedding,
      pinned: pinned ?? false,
      uses: 0,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, { ownerId: user._id, kind: "memory", title: "Remembered", detail: text });
    return id;
  },
});

export const patch = mutation({
  args: {
    secret: v.string(),
    memoryId: v.id("memories"),
    text: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    confidence: v.optional(v.number()),
    touch: v.optional(v.boolean()),
  },
  handler: async (ctx, { secret, memoryId, text, embedding, confidence, touch }) => {
    const user = await agentUser(ctx, secret);
    const m = await ownMemory(ctx, user._id, memoryId);
    if (embedding) checkEmbedding(embedding);
    const now = Date.now();
    const newText = text?.trim();
    const textChanged = newText !== undefined && newText.length > 0 && newText !== m.text;
    await ctx.db.patch(memoryId, {
      ...(textChanged ? { text: newText.slice(0, 1_000) } : {}),
      // New words without a new vector: clear it so the brain re-embeds.
      ...(embedding ? { embedding } : textChanged ? { embedding: [] } : {}),
      ...(confidence !== undefined ? { confidence: Math.min(1, Math.max(0, confidence)) } : {}),
      ...(touch ? { uses: m.uses + 1, lastUsedAt: now } : {}),
      ...(textChanged || confidence !== undefined ? { updatedAt: now } : {}),
    });
    return null;
  },
});

/** Vector search over the user's memories; archived ones are dropped. */
export const search = action({
  args: { secret: v.string(), embedding: v.array(v.float64()), limit: v.optional(v.number()) },
  handler: async (
    ctx,
    { secret, embedding, limit },
  ): Promise<
    { _id: Id<"memories">; kind: Memory["kind"]; text: string; about?: string; source: Memory["source"]; pinned: boolean; score: number }[]
  > => {
    requireAgent(secret);
    if (embedding.length !== EMBEDDING_DIMS)
      throw new ConvexError(`Search needs a ${EMBEDDING_DIMS}-number embedding (got ${embedding.length})`);
    const ownerId: Id<"users"> = await ctx.runQuery(internal.memory.ownerForAgent, {});
    const n = Math.min(Math.max(1, Math.floor(limit ?? 8)), 50);
    const hits = await ctx.vectorSearch("memories", "by_embedding", {
      vector: embedding,
      limit: Math.min(256, n * 2 + 4),
      filter: (q) => q.eq("ownerId", ownerId),
    });
    const docs: (Memory | null)[] = await ctx.runQuery(internal.memory.loadMany, { ids: hits.map((h) => h._id) });
    const out = [];
    for (let i = 0; i < hits.length && out.length < n; i++) {
      const m = docs[i];
      if (!m || m.archived) continue;
      out.push({ _id: m._id, kind: m.kind, text: m.text, about: m.about, source: m.source, pinned: m.pinned, score: hits[i]._score });
    }
    return out;
  },
});

export const ownerForAgent = internalQuery({
  args: {},
  handler: async (ctx) => (await requireViewer(ctx)).user._id,
});

export const loadMany = internalQuery({
  args: { ids: v.array(v.id("memories")) },
  handler: async (ctx, { ids }) => Promise.all(ids.map((id) => ctx.db.get(id))),
});

/**
 * What goes into the talker's and worker's instructions: every pinned memory
 * plus the 12 most used others. `needsEmbedding` lists memories with an empty
 * embedding for the brain to embed and `memory:patch` back.
 */
export const core = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    const user = await agentUser(ctx, secret);
    const all = (
      await ctx.db
        .query("memories")
        .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
        .order("desc")
        .collect()
    ).filter((m) => !m.archived);
    const pinned = all.filter((m) => m.pinned);
    const used = all
      .filter((m) => !m.pinned)
      .sort((a, b) => b.uses - a.uses || (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || b.updatedAt - a.updatedAt)
      .slice(0, 12);
    return {
      memories: [...pinned, ...used].map(withoutEmbedding),
      needsEmbedding: all
        .filter((m) => m.embedding.length === 0)
        .map((m) => ({ _id: m._id, kind: m.kind, text: m.text, about: m.about })),
    };
  },
});
