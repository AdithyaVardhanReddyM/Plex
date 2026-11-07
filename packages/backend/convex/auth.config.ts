/**
 * Clerk → Convex auth. Clerk has a JWT template named "convex" (audience
 * "convex"). The issuer is the Clerk app's public Frontend API domain (it's
 * also inside the publishable key), so it lives here and nobody has to set an
 * env var to run Plex. (The Convex CLI rejects a `process.env` read here when
 * the variable is unset, even with a fallback, so the domain is a constant.)
 * Without a Clerk session everyone is a guest exploring the demo world.
 */
const CLERK_ISSUER = "https://lenient-civet-2954.clerk.accounts.dev";

export default {
  providers: [{ domain: CLERK_ISSUER, applicationID: "convex" }],
};
