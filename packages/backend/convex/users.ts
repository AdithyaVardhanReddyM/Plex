import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewer } from "./lib/viewer";

/** The current viewer: a signed-in user, or the guest acting as Adi. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    return { ...viewer.user, isGuest: viewer.isGuest };
  },
});

/** Called once after Clerk sign-in to create or link the user's row. */
export const ensureViewer = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (existing) return existing._id;
    const base = (identity.nickname ?? identity.givenName ?? identity.email?.split("@")[0] ?? "user")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    return ctx.db.insert("users", {
      clerkId: identity.subject,
      handle: `${base}-${identity.subject.slice(-4).toLowerCase()}`,
      name: identity.name ?? identity.givenName ?? "New member",
      kind: "person",
      avatarUrl: identity.pictureUrl,
    });
  },
});

export const byHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) =>
    ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", handle))
      .unique(),
});

/** People who take tasks, for applicant lists and leaderboards. */
export const workers = query({
  args: {},
  handler: async (ctx) => {
    const people = await ctx.db
      .query("users")
      .withIndex("by_kind", (q) => q.eq("kind", "person"))
      .collect();
    return people
      .filter((p) => (p.tasksCompleted ?? 0) > 0)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  },
});

export const setPaused = mutation({
  args: { paused: v.boolean() },
  handler: async (ctx, { paused }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new Error("No viewer");
    await ctx.db.patch(viewer.user._id, { agentsPaused: paused });
  },
});
