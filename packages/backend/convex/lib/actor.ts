import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { getViewer, userByHandle } from "./viewer";

/**
 * Who is acting on a two-sided surface like Tasks.
 *
 * Signed-in users always act as themselves. Guests (guest mode only) explore the demo world
 * as Adi (the poster) by default, and may switch to one of the seeded demo
 * workers (`as: "rosa"`) to try the other side: apply, upload proof, get
 * paid, or to the demo NGO (`as: "lakeside-commons"`) to approve its impact
 * shifts. Only demo people and orgs can be borrowed, never real accounts.
 */
export async function getActor(
  ctx: QueryCtx | MutationCtx,
  as?: string,
): Promise<{ user: Doc<"users">; isGuest: boolean } | null> {
  const viewer = await getViewer(ctx);
  if (!viewer) return null;
  if (!as || !viewer.isGuest || as === viewer.user.handle) return viewer;
  const persona = await userByHandle(ctx, as);
  // Brands don't take tasks, and agents act on their own (houseAgents, the API).
  if (!persona || !persona.isDemo || persona.kind === "brand" || persona.kind === "agent") return viewer;
  return { user: persona, isGuest: true };
}

export async function requireActor(ctx: QueryCtx | MutationCtx, as?: string) {
  const actor = await getActor(ctx, as);
  if (!actor) throw new ConvexError("Sign in to continue.");
  return actor;
}
