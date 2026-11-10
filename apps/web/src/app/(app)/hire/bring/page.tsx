import type { Metadata } from "next";
import { BringView } from "./bring-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Bring your agent" };

export default function Page() {
  return <BringView />;
}
