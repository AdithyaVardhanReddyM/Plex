import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ClientOnly } from "@/components/client-only";
import { Skeleton } from "@/components/ui/primitives";

// App screens are live Convex data with relative times ("2 hours ago"), so
// they render in the browser only; the shell and skeleton prerender. That
// makes instant-navigation validation meaningless here, so opt out.
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<PageSkeleton />}>
        <ClientOnly fallback={<PageSkeleton />}>{children}</ClientOnly>
      </Suspense>
    </AppShell>
  );
}

function PageSkeleton() {
  return (
    <div>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
