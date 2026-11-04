import type { Metadata } from "next";
import { ReceiptsView } from "./receipts-view";

export const metadata: Metadata = { title: "Receipts" };

export default function Page() {
  return <ReceiptsView />;
}
