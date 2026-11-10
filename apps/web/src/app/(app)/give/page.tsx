import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { GiveView } from "./give-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Give" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-[520px] w-full" />}>
      <GiveView />
    </Suspense>
  );
}
