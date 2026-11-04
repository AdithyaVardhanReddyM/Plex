"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Search } from "lucide-react";
import type { ColumnKey } from "@plex/backend/lib/ledgerSpec";
import type { Receipt } from "@/components/receipt/receipt";
import { Card, CardHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
            <span className="hidden sm:inline">CSV</span>
          </Button>
        }
      />
      <div className="mt-3 flex flex-col gap-2 px-5 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Filter by state" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              disabled={f.key !== "all" && counts[f.key] === 0}
              className={cn(
                "flex h-7 flex-none items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors disabled:opacity-40",
                filter === f.key ? "bg-ink text-white" : "text-ink-2 hover:bg-sunken",
              )}
            >
              {f.label}
              <span className={cn("tabular text-[11.5px]", filter === f.key ? "text-white/70" : "text-faint")}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <label className="relative block sm:w-60">
          <span className="sr-only">Search receipts</span>
          <Search size={14} strokeWidth={1.9} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search why, who, rule"
            className="h-8 w-full rounded-sm border border-line bg-surface pr-3 pl-8 text-[13px] text-ink placeholder:text-faint focus:border-green-400 focus:ring-3 focus:ring-green-100 focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-3 border-t border-line">
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
