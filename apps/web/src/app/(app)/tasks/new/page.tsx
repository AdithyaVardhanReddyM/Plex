import type { Metadata } from "next";
import { NewTaskView } from "./new-task-view";

export const metadata: Metadata = { title: "Post a task" };

export default function Page() {
  return <NewTaskView />;
}
