import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { PageHeader, Card, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Ledger" };

// Placeholder: this surface is being built in its own session.
export default function Page() {
  return (
    <>
      <PageHeader title="Ledger" description="Where your money went and what it did, built live by your agents." />
      <Card>
        <EmptyState icon={<LayoutDashboard />} title="Coming together" body="This surface is being built right now." />
      </Card>
    </>
  );
}
