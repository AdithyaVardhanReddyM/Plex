import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { ReelView } from "@/components/causes/reel-view";

export const metadata: Metadata = {
  title: "Proof Reel",
  description: "What one donation paid for, built only from receipts and the worker's own photos.",
};

// Live Convex data, rendered in the browser only (see the layout).
export const instant = false;

export default function Page({ params }: PageProps<"/c/[slug]/reel/[donationId]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[560px] w-full max-w-xl" />}>
      {params.then(({ donationId }) => (
        <ReelView donationId={donationId} />
      ))}
    </Suspense>
  );
}
