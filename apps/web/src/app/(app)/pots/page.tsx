import type { Metadata } from "next";
import { PotsView } from "./pots-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Pots & limits" };

export default function Page() {
  return <PotsView />;
}
