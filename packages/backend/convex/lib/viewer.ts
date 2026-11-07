import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ConvexError } from "convex/values";

/** Handle of the seeded main user. Guests act as this user when guest mode is on. */
export const DEMO_HANDLE = "adi";

/**
 * Guest mode: signed-out callers explore the seeded demo world as Adi, so
 * judges can try Plex without an account. Off unless the Convex deployment
 * sets PLEX_GUEST_MODE=true (`convex env set PLEX_GUEST_MODE true`).
 */
export function guestModeOn() {
  return process.env.PLEX_GUEST_MODE === "true";
}

/**
 * Who is acting: the signed-in Clerk user's `users` row (created on first
 * sign-in by `users.ensureViewer`). Signed-out callers get null, or the demo
 * user Adi when guest mode is on. A signed-in user whose row doesn't exist
 * yet also gets null, never Adi.
 */
export async function getViewer(
  ctx: QueryCtx | MutationCtx,
): Promise<{ user: Doc<"users">; isGuest: boolean } | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    return user ? { user, isGuest: false } : null;
  }
  if (!guestModeOn()) return null;
  const demo = await ctx.db
    .query("users")
    .withIndex("by_handle", (q) => q.eq("handle", DEMO_HANDLE))
    .unique();
  return demo ? { user: demo, isGuest: true } : null;
}

export async function requireViewer(ctx: QueryCtx | MutationCtx) {
  const viewer = await getViewer(ctx);
  if (!viewer) throw new ConvexError("Sign in to continue.");
  return viewer;
}

export async function userByHandle(ctx: QueryCtx | MutationCtx, handle: string) {
  return ctx.db
    .query("users")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .unique();
}
