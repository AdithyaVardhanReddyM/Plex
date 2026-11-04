import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/** Handle of the seeded main user. Guests act as this user (see docs). */
export const DEMO_HANDLE = "adi";

/**
 * Who is acting. A signed-in Clerk user is mapped to their `users` row
 * (created on first sign-in by `users.ensureViewer`). Everyone else is a
 * guest exploring the seeded demo world as Adi, so judges can try Plex in a
 * minute without an account. Sandbox money only.
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
    if (user) return { user, isGuest: false };
  }
  const demo = await ctx.db
    .query("users")
    .withIndex("by_handle", (q) => q.eq("handle", DEMO_HANDLE))
    .unique();
  return demo ? { user: demo, isGuest: true } : null;
}

export async function requireViewer(ctx: QueryCtx | MutationCtx) {
  const viewer = await getViewer(ctx);
  if (!viewer) throw new Error("No viewer: run `pnpm seed` to create the demo world.");
  return viewer;
}

export async function userByHandle(ctx: QueryCtx | MutationCtx, handle: string) {
  return ctx.db
    .query("users")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .unique();
}
