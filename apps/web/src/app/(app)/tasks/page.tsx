import type { Metadata } from "next";
import { TasksView } from "./tasks-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Tasks" };

export default function Page() {
  return <TasksView />;
}
