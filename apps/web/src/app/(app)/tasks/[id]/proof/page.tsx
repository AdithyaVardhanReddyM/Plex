import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { ProofUpload } from "./proof-upload";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Upload proof" };

export default function Page({ params }: PageProps<"/tasks/[id]/proof">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[520px] w-full max-w-xl" />}>
      {params.then(({ id }) => (
        <ProofUpload id={id} />
      ))}
    </Suspense>
  );
}
