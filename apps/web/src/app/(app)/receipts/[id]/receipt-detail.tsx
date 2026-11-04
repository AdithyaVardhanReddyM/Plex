"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ReceiptCard } from "@/components/receipt/receipt";

export function ReceiptDetail({ id }: { id: string }) {
  const receipt = useQuery(api.receipts.get, { id: id as Id<"receipts"> });
  return (
    <div className="mx-auto max-w-xl animate-rise">
      <Link href="/receipts" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Receipts
      </Link>
      {receipt === undefined ? (
        <Skeleton className="h-[520px] w-full" />
      ) : receipt === null ? (
        <Card>
          <EmptyState icon={<ReceiptText />} title="Receipt not found" />
        </Card>
      ) : (
        <ReceiptCard receipt={receipt} />
      )}
    </div>
  );
}
