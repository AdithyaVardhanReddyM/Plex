"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Search } from "lucide-react";
import type { ColumnKey } from "@plex/backend/lib/ledgerSpec";
import type { Receipt } from "@/components/receipt/receipt";
import { Card, CardHeader, Input, Segmented } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ReceiptsGrid, type ReceiptsGridHandle } from "./receipts-grid";

const FILTERS = [
  { key: "all", label: "All", states: null },
  { key: "held", label: "Held", states: ["held", "funded", "pending"] },
  { key: "moved", label: "Moved", states: ["paid", "released"] },
  { key: "refunded", label: "Refunded", states: ["refunded"] },
  { key: "disputed", label: "Disputed", states: ["disputed"] },
] as const;

/** Every receipt in this view: search, state chips, CSV export, click for the full Receipt. */
export function ReceiptsCard({
  title = "Receipts",
  description,
  receipts,
  columns,
  requested,
  selectedId,
  onOpen,
  fileName,
}: {
  title?: string;
  description?: string;
  receipts: Receipt[] | undefined;
  columns?: ColumnKey[];
  requested: Record<string, string>;
  selectedId: string | null;
  onOpen: (r: Receipt) => void;
  fileName: string;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const grid = useRef<ReceiptsGridHandle>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) c[f.key] = f.states ? (receipts ?? []).filter((r) => (f.states as readonly string[]).includes(r.state)).length : (receipts?.length ?? 0);
    return c;
  }, [receipts]);

  const match = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter);
    if (!f?.states) return undefined;
    const states = f.states as readonly string[];
    return (r: Receipt) => states.includes(r.state);
  }, [filter]);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={title}
        description={description ?? "Every payment with its why, its rule and its evidence. Click a row for the full receipt."}
        action={
          <Button variant="secondary" size="sm" onClick={() => grid.current?.exportCsv(fileName)} aria-label="Export CSV">
            <Download />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        }
      />
      <div className="mt-4 flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          size="sm"
          items={FILTERS.filter((f) => f.key === "all" || counts[f.key]! > 0).map((f) => ({ value: f.key, label: f.label, count: counts[f.key] }))}
          value={filter}
          onChange={setFilter}
        />
        <label className="relative block sm:w-64">
          <span className="sr-only">Search receipts</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" strokeWidth={1.9} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search why, who, rule" className="h-8 pl-8 text-[13px] shadow-none" />
        </label>
      </div>
      <div className="border-t border-line">
        <ReceiptsGrid
          ref={grid}
          rows={receipts}
          columns={columns}
          quickFilter={q}
          match={match}
          requested={requested}
          selectedId={selectedId}
          onOpen={onOpen}
          height={560}
        />
      </div>
    </Card>
  );
}
