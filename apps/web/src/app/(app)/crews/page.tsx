import type { Metadata } from "next";
import { CrewsView } from "./crews-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Crews" };

export default function Page() {
  return <CrewsView />;
}
