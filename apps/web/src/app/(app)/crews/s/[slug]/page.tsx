import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { SharedCrew } from "./shared-crew";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Crew" };

export default function Page({ params }: PageProps<"/crews/s/[slug]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[620px] w-full" />}>
      {params.then(({ slug }) => (
        <SharedCrew slug={slug} />
      ))}
    </Suspense>
  );
}
