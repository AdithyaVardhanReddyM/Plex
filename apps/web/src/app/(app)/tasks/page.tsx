import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { PageHeader, Card, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Tasks" };

// Placeholder: this surface is being built in its own session.
export default function Page() {
  return (
    <>
      <PageHeader title="Tasks" description="Post work, fund it through PayPal, and pay people when the proof passes." />
      <Card>
        <EmptyState icon={<ListChecks />} title="Coming together" body="This surface is being built right now." />
      </Card>
    </>
  );
}
