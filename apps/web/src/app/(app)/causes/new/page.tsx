import type { Metadata } from "next";
import { BuilderView } from "@/components/causes/builder-view";

export const metadata: Metadata = { title: "Build a cause page" };

// Live Convex data, rendered in the browser only (see the layout).
export const instant = false;

export default function Page() {
  return <BuilderView />;
}
