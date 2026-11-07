/**
 * Clerk → Convex auth. Clerk has a JWT template named "convex" (audience
 * "convex"). The issuer is the Clerk app's public Frontend API domain (it's
 * also inside the publishable key), so it lives here and nobody has to set an
 * env var to run Plex. CLERK_JWT_ISSUER_DOMAIN in the Convex env overrides it.
 * Without a Clerk session everyone is a guest exploring the demo world.
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN || "https://ideal-aphid-5927.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
