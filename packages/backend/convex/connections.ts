import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getActor, requireActor } from "./lib/actor";
import { GITHUB_MCP_URL, safeMcpUrl } from "./lib/connect";
import { seal, secretsConfigured } from "./lib/secrets";

/**
 * Connections: account access a poster lends to one task, so the hired agent
 * can act there (merge a pull request on GitHub, use any MCP server). The token
 * is encrypted, used only by the agent's tool calls and Plex's proof check,
 * never returned to a browser, and wiped when the task is paid or refunded.
 */

const OPEN = ["draft", "open", "assigned", "rejected"];

/** What the task page shows: never the token. */
export const list = query({
  args: { taskId: v.id("tasks"), as: v.optional(v.string()) },
  handler: async (ctx, { taskId, as }) => {
    const actor = await getActor(ctx, as);
    const task = await ctx.db.get(taskId);
    if (!actor || !task || (actor.user._id !== task.posterId && actor.user._id !== task.assigneeId)) return null;
    const rows = await ctx.db
      .query("taskConnections")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    return {
      canEdit: actor.user._id === task.posterId && OPEN.includes(task.status),
      ready: secretsConfigured(),
      rows: rows.map((r) => ({
        _id: r._id,
        kind: r.kind,
        label: r.label,
        url: r.url,
        allow: r.allow ?? [],
        hasToken: Boolean(r.tokenEnc),
        wiped: Boolean(r.wipedAt),
        at: r._creationTime,
      })),
    };
  },
});

export const posterOf = internalQuery({
  args: { taskId: v.id("tasks"), as: v.optional(v.string()) },
  handler: async (ctx, { taskId, as }) => {
    const { user } = await requireActor(ctx, as);
    const task = await ctx.db.get(taskId);
    if (!task || task.posterId !== user._id) throw new ConvexError("Only the poster can connect accounts to this task.");
    if (!OPEN.includes(task.status)) throw new ConvexError("This task is finished; connections are closed.");
    return user._id;
  },
});

export const insert = internalMutation({
  args: {
    taskId: v.id("tasks"),
    kind: v.union(v.literal("github"), v.literal("mcp")),
    label: v.string(),
    url: v.string(),
    urlEnc: v.optional(v.string()),
    tokenEnc: v.optional(v.string()),
    allow: v.array(v.string()),
    addedBy: v.id("users"),
  },
  handler: async (ctx, row) => {
    const task = await ctx.db.get(row.taskId);
    if (!task) return;
    const existing = await ctx.db
      .query("taskConnections")
      .withIndex("by_task", (q) => q.eq("taskId", row.taskId))
      .collect();
    if (existing.filter((r) => !r.wipedAt).length >= 3) throw new ConvexError("Up to 3 connections per task.");
    await ctx.db.insert("taskConnections", row);
    await syncSummary(ctx, row.taskId);
    // Agents that can use connected tools may fit now.
    if (task.status === "open") await ctx.scheduler.runAfter(500, internal.houseAgents.runBidding, { taskId: row.taskId });
  },
});

async function syncSummary(ctx: MutationCtx, taskId: Id<"tasks">) {
  const rows = await ctx.db
    .query("taskConnections")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  const live = rows.filter((r) => !r.wipedAt);
  await ctx.db.patch(taskId, { connections: live.length ? live.map((r) => ({ kind: r.kind, label: r.label })) : undefined });
}

/** Connect GitHub (a token) or any MCP server (URL, optional token, optional tool list). */
export const add = action({
  args: {
    taskId: v.id("tasks"),
    kind: v.union(v.literal("github"), v.literal("mcp")),
    url: v.optional(v.string()),
    token: v.optional(v.string()),
    allow: v.optional(v.array(v.string())),
    as: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, kind, url, token, allow, as }) => {
    const addedBy: Id<"users"> = await ctx.runQuery(internal.connections.posterOf, { taskId, as });
    if (!secretsConfigured()) throw new ConvexError("This deployment has no CONNECTIONS_KEY, so it can't store tokens safely.");
    const t = token?.trim();
    let endpoint = GITHUB_MCP_URL;
    let sealedUrl: string | undefined;
    let label = "GitHub";
    if (kind === "github") {
      if (!t || !/^(ghp_|github_pat_|gho_)[A-Za-z0-9_]{20,}$/.test(t)) throw new ConvexError("Paste a GitHub token (fine-grained github_pat_… or classic ghp_…).");
      // Check it works before storing it, and say whose it is.
      const res = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${t}`, "User-Agent": "Plex" } });
      if (!res.ok) throw new ConvexError("GitHub didn't accept that token.");
      const me = (await res.json()) as { login?: string };
      label = `GitHub (${me.login ?? "token"})`;
    } else {
      const safe = safeMcpUrl(url ?? "");
      if (!safe.ok) throw new ConvexError(safe.reason);
      // Shown as its origin only; the full URL (which may hold a key) is sealed.
      endpoint = `${new URL(safe.url).origin}/…`;
      sealedUrl = await seal(safe.url);
      label = safe.host;
    }
    const names = (allow ?? []).map((s) => s.trim()).filter((s) => /^[\w.-]{1,64}$/.test(s)).slice(0, 40);
    await ctx.runMutation(internal.connections.insert, {
      taskId,
      kind,
      label,
      url: endpoint,
      urlEnc: sealedUrl,
      tokenEnc: t ? await seal(t) : undefined,
      allow: names,
      addedBy,
    });
  },
});

export const remove = mutation({
  args: { connectionId: v.id("taskConnections"), as: v.optional(v.string()) },
  handler: async (ctx, { connectionId, as }) => {
    const { user } = await requireActor(ctx, as);
    const row = await ctx.db.get(connectionId);
    if (!row) return;
    const task = await ctx.db.get(row.taskId);
    if (!task || task.posterId !== user._id) throw new ConvexError("Only the poster can remove it.");
    await ctx.db.delete(connectionId);
    await syncSummary(ctx, row.taskId);
  },
});

/** For the hired agent's tool calls and the proof check only. */
export const forTask = internalQuery({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) =>
    (
      await ctx.db
        .query("taskConnections")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .collect()
    ).filter((r) => !r.wipedAt),
});

/** The task is over: tokens are deleted, the record of what was connected stays. */
export const wipe = internalMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const rows = await ctx.db
      .query("taskConnections")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    for (const r of rows) if (!r.wipedAt) await ctx.db.patch(r._id, { tokenEnc: undefined, urlEnc: undefined, wipedAt: Date.now() });
    if (rows.length) await syncSummary(ctx, taskId);
  },
});

export type RegistryServer = { name: string; title: string; description: string; url: string; website?: string; official: boolean };

/**
 * Search the official MCP Registry (registry.modelcontextprotocol.io) for
 * servers an agent can reach over the internet (remote ones only, public https).
 */
export const search = action({
  args: { q: v.string() },
  handler: async (_ctx, { q }): Promise<RegistryServer[]> => {
    const term = q.trim().slice(0, 60);
    if (term.length < 2) return [];
    const res = await fetch(`https://registry.modelcontextprotocol.io/v0/servers?search=${encodeURIComponent(term)}&limit=50`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new ConvexError(`The MCP Registry answered ${res.status}.`);
    type Entry = {
      server?: { name: string; title?: string; description?: string; websiteUrl?: string; remotes?: { type: string; url: string }[] };
      _meta?: Record<string, { isLatest?: boolean }>;
    };
    const body = (await res.json()) as { servers?: Entry[] };
    const out: RegistryServer[] = [];
    for (const e of body.servers ?? []) {
      const s = e.server;
      if (!s || out.some((o) => o.name === s.name)) continue;
      // Remote servers only, and only URLs a poster could connect (no {placeholders} to fill in).
      const remote = (s.remotes ?? []).find((r) => r.type === "streamable-http" && !/[{}]/.test(r.url) && safeMcpUrl(r.url).ok);
      if (!remote) continue;
      // Official: run on the service's own domain (mcp.notion.com, mcp.linear.app), not a third party's.
      const domain = new URL(remote.url).hostname.split(".").slice(-2).join(".");
      out.push({
        name: s.name,
        title: s.title ?? s.name.split("/").pop() ?? s.name,
        description: (s.description ?? "").slice(0, 200),
        url: remote.url,
        website: s.websiteUrl,
        official: domain.startsWith(`${term.toLowerCase().split(/\s+/)[0]}.`),
      });
      if (out.length >= 8) break;
    }
    return out.sort((a, b) => Number(b.official) - Number(a.official));
  },
});
