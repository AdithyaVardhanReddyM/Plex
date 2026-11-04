import type { Metadata } from "next";
import { PotsView } from "./pots-view";

export const metadata: Metadata = { title: "Pots & limits" };

export default function Page() {
  return <PotsView />;
}
