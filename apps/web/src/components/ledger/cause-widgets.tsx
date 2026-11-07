"use client";

import { useMemo } from "react";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { FunctionReturnType } from "convex/server";
import { CalendarDays, Check, Repeat } from "lucide-react";
import { api } from "@/lib/convex";
import { Avatar, Badge, Meter } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { cn, formatCents, relativeTime } from "@/lib/utils";
import { GRID_WRAP, plexGridTheme, plexGridThemeCompact, registerAg } from "./ag";
import { WidgetFrame } from "./kit";
import { useWidth } from "./use-width";

registerAg();

type Cause = NonNullable<FunctionReturnType<typeof api.ledger.cause>>;
type Gift = Cause["feed"][number];
type Leader = Cause["leaderboard"][number] & { rank: number; share: number };

const SOURCE: Record<Gift["source"], { label: string; tone: "neutral" | "green" | "steel" }> = {
  direct: { label: "Direct", tone: "neutral" },
  saved_for_good: { label: "Saved by an agent", tone: "green" },
  campaign: { label: "Campaign match", tone: "steel" },
};

// ── Donation feed ────────────────────────────────────────────────────────────

const DONOR_COLORS = ["var(--color-steel-500)", "var(--color-green-600)", "var(--color-steel-700)", "var(--color-green-800)", "var(--color-steel-400)"];
const donorColor = (name: string) => DONOR_COLORS[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % DONOR_COLORS.length];

function DonorCell({ data }: CustomCellRendererProps<Gift>) {
  if (!data) return null;
  return (
    <div className="flex h-full min-w-0 items-center gap-2.5">
      <Avatar name={data.donor === "Anonymous" ? "?" : data.donor} color={data.donor === "Anonymous" ? "var(--color-faint)" : donorColor(data.donor)} size={26} />
      <div className="min-w-0 leading-[1.3]">
        <div className="truncate text-[13.5px] font-medium text-ink">
          {data.donor}
          {data.isYou ? <span className="ml-1.5 text-[12px] font-normal text-green-700">you</span> : null}
        </div>
        <div className="text-[12px] text-faint">{relativeTime(data.at)}</div>
      </div>
    </div>
  );
}

function SourceCell({ data }: CustomCellRendererProps<Gift>) {
  if (!data) return null;
  const s = SOURCE[data.source];
  return (
    <div className="flex h-full items-center gap-1.5">
      <Badge tone={s.tone}>{s.label}</Badge>
      {data.recurring ? (
        <Badge tone="outline">
          <Repeat />
          Monthly
        </Badge>
      ) : null}
    </div>
  );
}

function GiftAmountCell({ data }: CustomCellRendererProps<Gift>) {
  if (!data) return null;
  return (
    <div className="flex h-full flex-col items-end justify-center leading-[1.3]">
      <Amount cents={data.amountCents} size="sm" sign="in" />
      <span className="text-[11.5px] text-faint">{data.forTask ? "to a shift" : "general"}</span>
    </div>
  );
}

export function DonationFeed({ feed }: { feed: Gift[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const columnDefs = useMemo<ColDef<Gift>[]>(
    () => [
      { colId: "donor", headerName: "Donor", field: "donor", cellRenderer: DonorCell, flex: 1.2, minWidth: 170 },
      { colId: "source", headerName: "How", field: "source", cellRenderer: SourceCell, flex: 1.3, minWidth: 190, sortable: false, hide: (width ?? 0) < 480 },
      { colId: "amount", headerName: "Amount", field: "amountCents", cellRenderer: GiftAmountCell, width: 112, type: "rightAligned", enableCellChangeFlash: true },
    ],
    [width],
  );
  return (
    <WidgetFrame flush title="Donation feed" description="Live from PayPal, newest first">
      <div ref={ref} className={cn(GRID_WRAP, "relative min-h-[416px] flex-1")}>
        {width !== null ? <div className="absolute inset-0"><AgGridReact<Gift>
          theme={plexGridTheme}
          rowData={feed}
          columnDefs={columnDefs}
          defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true }}
          getRowId={(p) => p.data._id}
          suppressCellFocus
          animateRows
        /></div> : null}
      </div>
    </WidgetFrame>
  );
}

// ── Donor leaderboard ────────────────────────────────────────────────────────

function RankCell({ data }: CustomCellRendererProps<Leader>) {
  if (!data) return null;
  return (
    <span
      className={cn(
        "tabular inline-flex h-full items-center font-display font-extrabold tracking-[-0.03em]",
        data.rank === 1 ? "text-[20px] text-green-700" : data.rank <= 3 ? "text-[16px] text-ink" : "text-[14px] text-faint",
      )}
    >
      {data.rank}
    </span>
  );
}

function LeaderCell({ data }: CustomCellRendererProps<Leader>) {
  if (!data) return null;
  return (
    <div className="flex h-full min-w-0 flex-col justify-center gap-1.5">
      <div className="flex items-center gap-1.5 truncate text-[13.5px] font-medium text-ink">
        <span className="truncate">{data.donor}</span>
        {data.isYou ? <span className="text-[12px] font-normal text-green-700">you</span> : null}
        {data.recurring ? <Repeat size={13} strokeWidth={1.9} className="flex-none text-steel-500" aria-label="Monthly" /> : null}
      </div>
      <div className="h-1 max-w-48 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full" style={{ width: `${Math.max(data.share * 100, 4)}%`, backgroundImage: "var(--meter-brand)" }} />
      </div>
    </div>
  );
}

export function DonorLeaderboard({ leaders }: { leaders: Cause["leaderboard"] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const rows = useMemo<Leader[]>(() => {
    const top = leaders[0]?.cents ?? 1;
    return leaders.map((l, i) => ({ ...l, rank: i + 1, share: l.cents / top }));
  }, [leaders]);
  const columnDefs = useMemo<ColDef<Leader>[]>(
    () => [
      { colId: "rank", headerName: "#", field: "rank", cellRenderer: RankCell, width: 56, sortable: false },
      { colId: "donor", headerName: "Donor", cellRenderer: LeaderCell, flex: 1, minWidth: 140, sortable: false },
      { colId: "gifts", headerName: "Gifts", field: "gifts", width: 70, type: "rightAligned", cellClass: "tabular", hide: (width ?? 0) < 360 },
      {
        colId: "cents",
        headerName: "Given",
        field: "cents",
        width: 98,
        type: "rightAligned",
        cellRenderer: ({ data }: CustomCellRendererProps<Leader>) => (data ? <Amount cents={data.cents} size="sm" /> : null),
      },
    ],
    [width],
  );
  return (
    <WidgetFrame flush title="Donor leaderboard" description="Named donors, by total given">
      <div ref={ref} className={GRID_WRAP} style={{ height: 36 + Math.min(rows.length, 7) * 54 + 2 }}>
        {width !== null ? <AgGridReact<Leader>
          theme={plexGridThemeCompact}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={{ resizable: false, suppressHeaderMenuButton: true }}
          getRowId={(p) => p.data.donor}
          suppressCellFocus
          animateRows
        /> : null}
      </div>
    </WidgetFrame>
  );
}

// ── Tasks funded and completed ───────────────────────────────────────────────

export function CauseTasks({ tasks }: { tasks: Cause["tasks"] }) {
  return (
    <WidgetFrame flush title="Shifts funded and done" description="Each shift is paid local work, released on proof">
      <ul className="space-y-1">
        {tasks.map((t) => {
          const done = t.status === "paid" || t.status === "approved";
          const ratio = t.fundedCents / Math.max(t.neededCents, 1);
          return (
            <li key={t._id} className="rounded-[12px] px-4 py-3.5 transition-colors hover:bg-sunken/70">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium text-ink">{t.title}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                    <CalendarDays className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
                    <span className="tabular truncate">
                      {relativeTime(t.when)} · {t.spots} spot{t.spots === 1 ? "" : "s"} · {formatCents(t.neededCents)}
                    </span>
                  </div>
                </div>
                {done ? (
                  <Badge tone="green">
                    <Check />
                    {t.workersPaid} paid
                  </Badge>
                ) : (
                  <Badge tone="steel">Open</Badge>
                )}
              </div>
              {done ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex -space-x-1.5">
                    {t.workers.map((w, i) => (
                      <span key={i} className="rounded-full ring-2 ring-surface">
                        <Avatar name={w.name} color={w.color} size={24} />
                      </span>
                    ))}
                  </div>
                  <span className="tabular text-[12px] text-muted">{formatCents(t.paidCents)} to local workers</span>
                </div>
              ) : (
                <div className="mt-2.5">
                  <Meter value={ratio} tone="steel" size="sm" label={`${t.title}: pledged so far`} />
                  <div className="tabular mt-1.5 text-[12px] text-muted">
                    {formatCents(t.fundedCents)} pledged of {formatCents(t.neededCents)}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </WidgetFrame>
  );
}
