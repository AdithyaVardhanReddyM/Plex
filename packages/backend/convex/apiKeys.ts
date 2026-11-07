import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireViewer } from "./lib/viewer";

/**
 * Scoped API keys for outside agents (Claude through the Plex MCP server,
 * or any HTTP client). A key is stored only as a SHA-256 hash; the full key
 * is shown once. Each key is one of:
 *  - poster: posts and pays for tasks from one pot, inside that pot's rules
 *  - worker: an AI agent that bids on and delivers digital work
 */

const PREFIX = "plx_live_";

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return PREFIX + [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

/** The viewer's agents and keys. Never returns a hash. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireViewer(ctx);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    return Promise.all(
      agents
        .filter((a) => a.keyPrefix)
        .map(async (a) => {
          const pot = a.potId ? await ctx.db.get(a.potId) : null;
          const worker = a.workerId ? await ctx.db.get(a.workerId) : null;
          return {
            _id: a._id,
            _creationTime: a._creationTime,
            name: a.name,
            keyPrefix: a.keyPrefix!,
            role: worker ? ("worker" as const) : ("poster" as const),
            potName: pot?.name,
            workerHandle: worker?.handle,
            revoked: Boolean(a.revoked),
            lastUsedAt: a.lastUsedAt,
          };
        }),
    );
  },
});

/** Creates a key. Returns the full key once; only its hash is kept. */
export const create = action({
  args: {
    name: v.string(),
    role: v.union(v.literal("poster"), v.literal("worker")),
    potId: v.optional(v.id("pots")),
    specialties: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<{ key: string; agentId: Id<"agents"> }> => {
    const key = randomKey();
    const agentId: Id<"agents"> = await ctx.runMutation(internal.apiKeys.insertKey, {
      ...args,
      keyPrefix: key.slice(0, PREFIX.length + 4),
      keyHash: await sha256Hex(key),
    });
    return { key, agentId };
  },
});

export const insertKey = internalMutation({
  args: {
    name: v.string(),
    role: v.union(v.literal("poster"), v.literal("worker")),
    potId: v.optional(v.id("pots")),
    specialties: v.optional(v.array(v.string())),
    keyPrefix: v.string(),
    keyHash: v.string(),
  },
  handler: async (ctx, { name, role, potId, specialties, keyPrefix, keyHash }) => {
    const { user } = await requireViewer(ctx);
    const label = name.trim().slice(0, 40);
    if (!label) throw new ConvexError("Name the agent that will use this key.");
    if (role === "poster") {
      const pot = potId ? await ctx.db.get(potId) : null;
      if (!pot || pot.ownerId !== user._id) throw new ConvexError("Pick one of your pots for this key to spend from.");
      return ctx.db.insert("agents", { ownerId: user._id, name: label, kind: "mcp", potId, keyPrefix, keyHash });
    }
    // A worker key gets its own profile in the Hire directory.
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "agent";
    const handle = `${slug}-${keyPrefix.slice(-4).toLowerCase()}`;
    const workerId = await ctx.db.insert("users", {
      handle,
      name: label,
      kind: "agent",
      avatarColor: "#3B5B7A",
      bio: `An AI agent run by ${user.name}, working on Plex through the API.`,
      skills: specialties?.slice(0, 6),
      paypalEmail: user.paypalEmail ?? process.env.PAYPAL_DEMO_PAYEE_EMAIL,
      tasksCompleted: 0,
      agentProfile: {
        house: false,
        ownerId: user._id,
        model: "external",
        tagline: `Built by ${user.name}.`,
        specialties: specialties?.slice(0, 6) ?? [],
        floorCents: 100,
        turnaround: "varies",
      },
    });
    return ctx.db.insert("agents", { ownerId: user._id, name: label, kind: "mcp", keyPrefix, keyHash, workerId });
  },
});

export const revoke = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const { user } = await requireViewer(ctx);
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.ownerId !== user._id) throw new ConvexError("Key not found");
    await ctx.db.patch(agentId, { revoked: true });
  },
});

/** Used by the HTTP API: who does this key act for? */
export const authenticate = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (!agent || agent.revoked) return null;
    const owner = await ctx.db.get(agent.ownerId);
    if (!owner) return null;
    const pot = agent.potId ? await ctx.db.get(agent.potId) : null;
    const worker = agent.workerId ? await ctx.db.get(agent.workerId) : null;
    return { agent, owner, pot, worker };
  },
});

export const touch = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    await ctx.db.patch(agentId, { lastUsedAt: Date.now() });
  },
});
