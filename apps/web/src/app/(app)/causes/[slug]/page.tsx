import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { CauseView } from "@/components/causes/cause-view";

export const metadata: Metadata = { title: "Cause" };

// Live Convex data, rendered in the browser only (see the layout).
export const instant = false;

export default function Page({ params }: PageProps<"/causes/[slug]">) {
  return (
    <Suspense fallback={<Skeleton className="h-44 w-full rounded-lg" />}>
      {params.then(({ slug }) => (
        <CauseView slug={slug} variant="app" />
      ))}
    </Suspense>
  );
}
