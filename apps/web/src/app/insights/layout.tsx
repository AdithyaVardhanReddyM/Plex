import { Suspense } from "react";
import { ClientOnly } from "@/components/client-only";
import { Skeleton } from "@/components/ui/primitives";

// Insights is Plex for Mac's page of charts, shown inside the Mac app's window (a web view),
// so it has no web navigation. Live Convex data with relative times: browser-only, like (app).
export const instant = false;

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[1120px] px-6 pt-7 pb-12">
      <Suspense fallback={<InsightsSkeleton />}>
        <ClientOnly fallback={<InsightsSkeleton />}>{children}</ClientOnly>
      </Suspense>
    </main>
  );
}

function InsightsSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-56" />
      <Skeleton className="mt-3 h-8 w-72" />
      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="mt-4 h-72 w-full" />
    </div>
  );
}
