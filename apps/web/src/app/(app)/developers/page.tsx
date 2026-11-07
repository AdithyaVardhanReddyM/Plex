import type { Metadata } from "next";
import { DevelopersView } from "./developers-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Agents & API" };

export default function Page() {
  return <DevelopersView />;
}
