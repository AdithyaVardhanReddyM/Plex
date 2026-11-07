"use client";

import { useEffect } from "react";
import { ConvexProvider, ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/convex";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
export const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Convex everywhere. When Clerk keys are present the Convex client carries the
 * Clerk session; without them there is no one to sign in, so the app only
 * shows data when the backend's guest mode (PLEX_GUEST_MODE) is on.
 */
// Module scope: one client per browser tab, created outside render (Next 16
// rejects Math.random(), which the client uses, during prerender).
const client = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;

export function Providers({ children }: { children: React.ReactNode }) {
  if (!client) return <MissingConvex />;
  if (CLERK_ENABLED) {
    return (
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        <EnsureViewer />
        {children}
      </ConvexProviderWithClerk>
    );
  }
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}

/** Creates or links the signed-in user's Plex row (`users.ensureViewer`) on any page. */
function EnsureViewer() {
  const { isAuthenticated } = useConvexAuth();
  const ensureViewer = useMutation(api.users.ensureViewer);
  useEffect(() => {
    if (isAuthenticated) void ensureViewer();
  }, [isAuthenticated, ensureViewer]);
  return null;
}

function MissingConvex() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <div className="text-[15px] font-semibold">Convex isn&apos;t configured</div>
      <p className="mt-2 text-sm text-muted">
        Run <code className="font-mono">pnpm dev</code> from the repo root. It starts Convex and writes{" "}
        <code className="font-mono">NEXT_PUBLIC_CONVEX_URL</code> to <code className="font-mono">apps/web/.env.local</code>.
      </p>
    </div>
  );
}
