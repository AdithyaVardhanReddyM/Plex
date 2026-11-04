import type { Metadata } from "next";
import { LedgerView } from "./ledger-view";

export const metadata: Metadata = { title: "Ledger" };

// Live Convex data and the ?view= role tab render in the browser only (see the
// (app) layout), so instant-navigation validation doesn't apply here.
export const instant = false;

export default function Page() {
  return <LedgerView />;
}
