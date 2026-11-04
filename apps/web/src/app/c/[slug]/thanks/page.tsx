import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { ThanksView } from "@/components/causes/thanks-view";

export const metadata: Metadata = { title: "Thank you" };

// Live Convex data, rendered in the browser only (see the layout).
export const instant = false;

export default function Page({ params, searchParams }: PageProps<"/c/[slug]/thanks">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 w-full max-w-xl" />}>
      {Promise.all([params, searchParams]).then(([{ slug }, sp]) => (
        <ThanksView
          slug={slug}
          checkoutId={typeof sp.checkout === "string" ? sp.checkout : null}
          token={typeof sp.token === "string" ? sp.token : null}
        />
      ))}
    </Suspense>
  );
}
