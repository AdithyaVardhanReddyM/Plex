import { ConvexError, v } from "convex/values";
import { action, httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { GITHUB_MCP_URL } from "./lib/connect";
import { seal, secretsConfigured } from "./lib/secrets";

/**
 * "Connect GitHub": the poster approves Plex on github.com instead of pasting a
 * token. A one-time state ties the callback to this poster and this task; the
 * token is sealed into the task's connections like a pasted one, used only by
 * the hired agent (inside the repo lock) and the proof check, and wiped when
 * the task ends. Needs GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET.
 */

const STATE_TTL = 10 * 60_000;

const callbackUrl = () => `${process.env.CONVEX_SITE_URL ?? "http://127.0.0.1:3211"}/oauth/github/callback`;
export const githubOAuthReady = () => Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET);

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const saveState = internalMutation({
  args: { state: v.string(), taskId: v.optional(v.id("tasks")), crewId: v.optional(v.id("crews")), userId: v.id("users"), origin: v.string() },
  handler: async (ctx, row) => {
    await ctx.db.insert("oauthStates", { ...row, createdAt: Date.now() });
  },
});

/** Used once: returns the round trip it belongs to, then forgets it. */
export const takeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", state))
      .unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    return Date.now() - row.createdAt < STATE_TTL ? row : null;
  },
});

/** Step 1: the URL that sends the poster to GitHub to approve Plex, for one task or a whole crew. */
export const start = action({
  args: { taskId: v.optional(v.id("tasks")), crewId: v.optional(v.id("crews")), origin: v.string(), as: v.optional(v.string()) },
  handler: async (ctx, { taskId, crewId, origin, as }): Promise<{ url: string }> => {
    if (!/^https?:\/\/[^/]+$/.test(origin)) throw new ConvexError("Bad origin");
    if (!githubOAuthReady()) throw new ConvexError("Connect GitHub isn't set up on this deployment (GITHUB_OAUTH_CLIENT_ID / SECRET). Paste a token instead.");
    if (!secretsConfigured()) throw new ConvexError("This deployment has no CONNECTIONS_KEY, so it can't store tokens safely.");
    if (!taskId === !crewId) throw new ConvexError("Connect GitHub to a task or a crew.");
    const userId: Id<"users"> = taskId
      ? await ctx.runQuery(internal.connections.posterOf, { taskId, as })
      : await ctx.runQuery(internal.crews.ownerOfCrew, { crewId: crewId!, as });
    const state = randomState();
    await ctx.runMutation(internal.githubOAuth.saveState, { state, taskId, crewId, userId, origin });
    const q = new URLSearchParams({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID!,
      redirect_uri: callbackUrl(),
      scope: "repo",
      state,
      allow_signup: "false",
    });
    return { url: `https://github.com/login/oauth/authorize?${q}` };
  },
});

/** Step 2: GitHub sends the poster back here with a code; Plex swaps it for a token and seals it. */
export const callback = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const row = state ? await ctx.runMutation(internal.githubOAuth.takeState, { state }) : null;
  if (!row || (!row.taskId && !row.crewId)) return new Response("This GitHub sign-in link expired. Go back to Plex and press Connect GitHub again.", { status: 400 });
  const taskId = row.taskId;
  const crewId = row.crewId;
  const back = (result: string) => Response.redirect(`${row.origin}/${crewId ? `crews/${crewId}` : `tasks/${taskId}`}?github=${result}`, 302);
  if (!code) return back("cancelled");
  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl(),
      }),
    });
    const body = (await res.json()) as { access_token?: string; error?: string };
    if (!body.access_token) return back("error");
    const me = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${body.access_token}`, "User-Agent": "Plex" } });
    const login = me.ok ? ((await me.json()) as { login?: string }).login : undefined;
    if (crewId) {
      await ctx.runMutation(internal.crews.saveConnection, { crewId, label: `GitHub (${login ?? "connected"})`, tokenEnc: await seal(body.access_token), addedBy: row.userId });
      return back("connected");
    }
    await ctx.runMutation(internal.connections.insert, {
      taskId: taskId!,
      kind: "github",
      label: `GitHub (${login ?? "connected"})`,
      url: GITHUB_MCP_URL,
      tokenEnc: await seal(body.access_token),
      allow: [],
      addedBy: row.userId,
    });
    return back("connected");
  } catch (err) {
    console.warn("[github-oauth] callback failed:", err instanceof Error ? err.message : err);
    return back("error");
  }
});
