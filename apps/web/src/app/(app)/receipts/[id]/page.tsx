import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { ReceiptDetail } from "./receipt-detail";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Receipt" };

// Next 16 + cacheComponents: dynamic params are request data, so they are
// read inside a Suspense boundary and the shell still prerenders.
export default function Page({ params }: PageProps<"/receipts/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[520px] w-full max-w-xl" />}>
      {params.then(({ id }) => (
        <ReceiptDetail id={id} />
      ))}
    </Suspense>
  );
}
