import type { Metadata } from "next";
import { PiggyBank } from "lucide-react";
import { PageHeader, Card, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Pots & limits" };

// Placeholder: this surface is being built in its own session.
export default function Page() {
  return (
    <>
      <PageHeader title="Pots & limits" description="Plain-English limits your agents can't talk their way past." />
      <Card>
        <EmptyState icon={<PiggyBank />} title="Coming together" body="This surface is being built right now." />
      </Card>
    </>
  );
}
