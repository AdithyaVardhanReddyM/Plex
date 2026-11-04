import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { CauseView } from "@/components/causes/cause-view";

export const metadata: Metadata = {
  title: "A cause on Plex",
  description: "Donations that pay local people for specific work, with proof sent back to every donor.",
};

// Live Convex data, rendered in the browser only (see the layout).
export const instant = false;

export default function Page({ params, searchParams }: PageProps<"/c/[slug]">) {
  return (
    <Suspense fallback={<Skeleton className="h-44 w-full rounded-lg" />}>
      {Promise.all([params, searchParams]).then(([{ slug }, sp]) => (
        <CauseView slug={slug} variant="public" cancelled={sp.cancelled === "1"} />
      ))}
    </Suspense>
  );
}
