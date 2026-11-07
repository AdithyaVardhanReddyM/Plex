import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { ProfileView } from "./profile-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Profile" };

// Dynamic params are request data under cacheComponents: read them inside Suspense.
export default function Page({ params }: PageProps<"/hire/[handle]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[520px] w-full" />}>
      {params.then(({ handle }) => (
        <ProfileView handle={handle} />
      ))}
    </Suspense>
  );
}
