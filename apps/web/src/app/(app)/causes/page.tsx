import type { Metadata } from "next";
import { HeartHandshake } from "lucide-react";
import { PageHeader, Card, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Causes" };

// Placeholder: this surface is being built in its own session.
export default function Page() {
  return (
    <>
      <PageHeader title="Causes" description="Donations that buy paid local work, with proof sent back to every donor." />
      <Card>
        <EmptyState icon={<HeartHandshake />} title="Coming together" body="This surface is being built right now." />
      </Card>
    </>
  );
}
