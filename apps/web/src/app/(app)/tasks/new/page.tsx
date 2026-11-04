import type { Metadata } from "next";
import { NewTaskView } from "./new-task-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Post a task" };

export default function Page() {
  return <NewTaskView />;
}
