"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@/lib/convex";

/**
 * Sends people who haven't set up yet to onboarding, and someone who only
 * takes tasks through the short posting setup before they post one. Guests
 * (the demo) and the seeded world have both sides already.
 */
export function useGateTarget(): string | null {
  const viewer = useQuery(api.users.viewer);
  const path = usePathname() ?? "";
  const search = useSearchParams()?.toString();
  if (!viewer || viewer.isGuest || viewer.kind !== "person") return null;
  if (!viewer.onboarded) return "/onboarding";
  if ((path === "/tasks/new" || path.startsWith("/tasks/new/")) && !viewer.roles.poster) {
    const here = `${path}${search ? `?${search}` : ""}`;
    return `/onboarding?add=poster&next=${encodeURIComponent(here)}`;
  }
  return null;
}

export function OnboardingGate({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const target = useGateTarget();
  const router = useRouter();
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  return target ? <>{fallback}</> : <>{children}</>;
}
