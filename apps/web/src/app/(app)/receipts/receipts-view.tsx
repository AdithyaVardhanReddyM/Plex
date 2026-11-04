"use client";

import { useQuery } from "convex/react";
import { ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { ReceiptCard, ReceiptRow, receiptKindLabel, type Receipt } from "@/components/receipt/receipt";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "held", label: "Held" },
  { key: "agents", label: "By agents" },
  { key: "tasks", label: "Tasks" },
  { key: "giving", label: "Giving" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function matches(r: Receipt, f: FilterKey) {
  if (f === "all") return true;
  if (f === "held") return r.state === "held";
  if (f === "agents") return Boolean(r.agentLabel);
  if (f === "tasks") return r.kind === "task_funding" || r.kind === "payout" || Boolean(r.taskId);
  return r.kind === "donation";
}

function dayLabel(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function ReceiptsView() {
  const receipts = useQuery(api.receipts.list, { limit: 200 });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<Id<"receipts"> | null>(null);

  const visible = useMemo(() => receipts?.filter((r) => matches(r, filter)) ?? [], [receipts, filter]);
  const groups = useMemo(() => {
    const out: Array<{ day: string; items: Receipt[] }> = [];
    for (const r of visible) {
      const day = dayLabel(r.occurredAt);
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(r);
      else out.push({ day, items: [r] });
    }
    return out;
  }, [visible]);
  const active = visible.find((r) => r._id === selected) ?? visible[0];

  return (
    <div className="animate-rise">
      <PageHeader
        title="Receipts"
        description="Every dollar your agents moved: who it went to, why, which rule allowed it, and the proof."
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors",
              filter === f.key ? "bg-ink text-white" : "bg-surface text-muted ring-1 ring-line hover:text-ink",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="p-2">
          {receipts === undefined ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <EmptyState icon={<ReceiptText />} title="No receipts here yet" body="Try another filter." />
          ) : (
            groups.map((g) => (
              <section key={g.day} className="mb-1">
                <div className="px-3 pt-3 pb-1 text-[12px] font-medium text-faint">{g.day}</div>
                {g.items.map((r) => (
                  <button
                    key={r._id}
                    type="button"
                    onClick={() => setSelected(r._id)}
                    className={cn(
                      "block w-full rounded-md text-left",
                      active?._id === r._id && "bg-sunken/80 ring-1 ring-inset ring-line",
                    )}
                    aria-label={`${receiptKindLabel(r.kind)}: ${r.payeeLabel}`}
                  >
                    <ReceiptRow receipt={r} />
                  </button>
                ))}
              </section>
            ))
          )}
        </Card>
        <div className="lg:sticky lg:top-10">
          {active ? <ReceiptCard key={active._id} receipt={active} className="animate-rise" /> : null}
        </div>
      </div>
    </div>
  );
}
