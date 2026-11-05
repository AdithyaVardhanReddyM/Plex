import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireViewer } from "./viewer";

/**
 * The Plex brain (apps/agent) calls public Convex functions with a shared
 * secret, checked against PLEX_AGENT_SECRET in the Convex env. Set it with
 * `pnpm --filter @plex/backend exec convex env set PLEX_AGENT_SECRET …`.
 */
export function requireAgent(secret: string): void {
  const expected = process.env.PLEX_AGENT_SECRET;
  if (!expected) throw new ConvexError("PLEX_AGENT_SECRET isn't set on this deployment");
  if (!sameString(secret, expected)) throw new ConvexError("Wrong agent secret");
}

/**
 * Checks the secret, then returns the user the brain acts for. The brain runs
 * in guest mode, so this is the same user `getViewer` gives a guest: Adi.
 */
export async function agentUser(ctx: QueryCtx | MutationCtx, secret: string) {
  requireAgent(secret);
  const { user } = await requireViewer(ctx);
  return user;
}

/** Compares without bailing at the first differing character. */
function sameString(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** The label receipts and approvals carry for money the Mac agent moved. */
export const MAC_AGENT_LABEL = "Plex for Mac";
