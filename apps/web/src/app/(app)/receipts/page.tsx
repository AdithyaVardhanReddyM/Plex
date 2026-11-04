import type { Metadata } from "next";
import { ReceiptsView } from "./receipts-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Receipts" };

export default function Page() {
  return <ReceiptsView />;
}
