import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { CrewView } from "./crew-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Crew" };

// Dynamic params are request data under cacheComponents: read them inside Suspense.
export default function Page({ params }: PageProps<"/crews/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[620px] w-full" />}>
      {params.then(({ id }) => (
        <CrewView id={id} />
      ))}
    </Suspense>
  );
}
