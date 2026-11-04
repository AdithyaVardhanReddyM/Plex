import type { Metadata } from "next";
import { DirectoryView } from "@/components/causes/directory-view";

export const metadata: Metadata = { title: "Causes" };

// Live Convex data, rendered in the browser only (see the layout).
export const instant = false;

export default function Page() {
  return <DirectoryView />;
}
