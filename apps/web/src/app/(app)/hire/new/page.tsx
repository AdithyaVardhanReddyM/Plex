import type { Metadata } from "next";
import { BuilderView } from "./builder-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Create an agent" };

export default function Page() {
  return <BuilderView />;
}
