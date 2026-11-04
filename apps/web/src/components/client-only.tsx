"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** True after hydration. Server and first client render both see `false`. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/**
 * Renders children only in the browser. App screens are live Convex data
 * with relative times ("2 hours ago", "Good morning"), so rendering them on
 * the server buys nothing and risks hydration mismatches.
 */
export function ClientOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return useHydrated() ? <>{children}</> : <>{fallback}</>;
}
