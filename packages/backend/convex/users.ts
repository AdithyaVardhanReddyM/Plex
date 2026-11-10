import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewer, requireViewer } from "./lib/viewer";
import { homeModeOf, isOnboarded, isRealPhoto, rolesOf } from "./lib/profile";
import { validate } from "./lib/answers";

/** The current viewer: the signed-in user, or Adi for a guest in guest mode. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const roles = rolesOf(viewer.user, viewer.isGuest);
    // The resume's storage id stays server-side.
    const { resumeFileId: _resume, ...user } = viewer.user;
    return {
      ...user,
      isGuest: viewer.isGuest,
      roles,
      onboarded: isOnboarded(roles),
      mode: homeModeOf(viewer.user, roles),
    };
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
      // Clerk's default image (no photo uploaded) would hide the face onboarding offers.
      avatarUrl: isRealPhoto(identity.pictureUrl) ? identity.pictureUrl : undefined,
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

/** Home's switch, for people who both post and earn. */
export const setHomeMode = mutation({
  args: { mode: v.union(v.literal("post"), v.literal("earn")) },
  handler: async (ctx, { mode }) => {
    const { user, isGuest } = await requireViewer(ctx);
    if (isGuest) return;
    const roles = rolesOf(user);
    if (mode === "post" ? !roles.poster : !roles.doer) throw new ConvexError("Set that side up first.");
    await ctx.db.patch(user._id, { homeMode: mode });
  },
});

/** Settings: the profile people see, and where payouts go. Same checks as onboarding. */
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    paypalEmail: v.optional(v.union(v.null(), v.string())),
    postDefaults: v.optional(
      v.object({
        workerType: v.union(v.literal("human"), v.literal("agent"), v.literal("either")),
        approval: v.union(v.literal("one_tap"), v.literal("auto")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { user, isGuest } = await requireViewer(ctx);
    if (isGuest) throw new ConvexError("Guests explore a shared demo account. Sign in to edit your own profile.");
    const { intent: _intent, ...fields } = validate(args);
    await ctx.db.patch(user._id, fields);
  },
});
