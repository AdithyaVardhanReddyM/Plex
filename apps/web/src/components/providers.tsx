"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
export const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Convex everywhere. When Clerk keys are present the Convex client carries the
 * Clerk session; without them everyone is a guest exploring the demo world.
 */
// Module scope: one client per browser tab, created outside render (Next 16
// rejects Math.random(), which the client uses, during prerender).
const client = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;

export function Providers({ children }: { children: React.ReactNode }) {
  if (!client) return <MissingConvex />;
  if (CLERK_ENABLED) {
    return (
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    );
  }
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
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
