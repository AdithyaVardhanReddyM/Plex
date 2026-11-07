import type { Metadata } from "next";
import { HireView } from "./hire-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Hire" };

export default function Page() {
  return <HireView />;
}
