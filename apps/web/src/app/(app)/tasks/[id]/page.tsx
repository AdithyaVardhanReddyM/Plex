import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { TaskDetail } from "./task-detail";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Task" };

// Dynamic params are request data under cacheComponents: read them inside Suspense.
export default function Page({ params }: PageProps<"/tasks/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[520px] w-full" />}>
      {params.then(({ id }) => (
        <TaskDetail id={id} />
      ))}
    </Suspense>
  );
}
