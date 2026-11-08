"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@/lib/convex";

type Gate = { kind: "wait" } | { kind: "go"; to: string } | { kind: "open" };

/**
 * Sends people who haven't set up yet to onboarding, and someone who only
 * takes tasks through the short posting setup before they post one. Guests
 * (the demo) and the seeded world have both sides already.
 */
export function useGate(): Gate {
  const viewer = useQuery(api.users.viewer);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const path = usePathname() ?? "";
  const search = useSearchParams()?.toString();
  // Signed in but the user row isn't there yet (first sign-in): wait, so Home doesn't flash before onboarding.
  if (viewer === undefined || isLoading || (viewer === null && isAuthenticated)) return { kind: "wait" };
  if (!viewer || viewer.isGuest || viewer.kind !== "person") return { kind: "open" };
  if (!viewer.onboarded) return { kind: "go", to: "/onboarding" };
  if ((path === "/tasks/new" || path.startsWith("/tasks/new/")) && !viewer.roles.poster) {
    const here = `${path}${search ? `?${search}` : ""}`;
    return { kind: "go", to: `/onboarding?add=poster&next=${encodeURIComponent(here)}` };
  }
  return { kind: "open" };
}

export function OnboardingGate({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const gate = useGate();
  const router = useRouter();
  const to = gate.kind === "go" ? gate.to : null;
  useEffect(() => {
    if (to) router.replace(to);
  }, [to, router]);
  return gate.kind === "open" ? <>{children}</> : <>{fallback}</>;
}
