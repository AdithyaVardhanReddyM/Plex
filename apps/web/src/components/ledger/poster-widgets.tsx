"use client";

import { useMemo } from "react";
import { AgCharts } from "ag-charts-react";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import type { AgCartesianChartOptions } from "ag-charts-community";
import type { ColDef } from "ag-grid-community";
import type { FunctionReturnType } from "convex/server";
import { Camera, Check, ChevronRight, Lock, MapPin, Star, TriangleAlert, X } from "lucide-react";
import { api } from "@/lib/convex";
import { Avatar, Badge, Card, EmptyState, Meter } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { cn, formatCents, relativeTime } from "@/lib/utils";
import { GRID_WRAP, plexChartTheme, plexGridTheme, registerAg, stateColor } from "./ag";
import { DisplayMoney, Legend, WidgetFrame } from "./kit";
import { MiniChart } from "./mini-chart";
import { useTokens } from "./widget";
import { useWidth } from "./use-width";

registerAg();

type Poster = NonNullable<FunctionReturnType<typeof api.ledger.poster>>;

// ── Money flow ───────────────────────────────────────────────────────────────

const STAGES = [
  { key: "held", label: "Held" },
  { key: "released", label: "Released" },
  { key: "refunded", label: "Refunded" },
  { key: "disputed", label: "Disputed" },
] as const;

/** Funded → held → released / refunded / disputed, across every task you posted. */
export function MoneyFlow({ flow, count }: { flow: Poster["flow"]; count: Poster["flowCount"] }) {
  const t = useTokens();
  const options = useMemo<AgCartesianChartOptions>(() => {
    const data = STAGES.map((s) => ({ stage: s.label, value: flow[s.key] / 100, n: count[s.key], color: stateColor(t, s.label) }));
    return {
      theme: plexChartTheme(t),
      data,
      height: 188,
      series: [
        {
          type: "bar",
          direction: "horizontal",
          xKey: "stage",
          yKey: "value",
          cornerRadius: 4,
          itemStyler: ({ datum }) => ({ fill: datum.color }),
          label: {
            enabled: true,
            placement: "outside-end",
            color: t.ink2,
            fontSize: 12,
            fontWeight: 500,
            formatter: ({ value }) => formatCents(Math.round(Number(value) * 100)),
          },
          tooltip: {
            renderer: ({ datum }) => ({
              heading: datum.stage,
              data: [
                { label: "Amount", value: formatCents(Math.round(datum.value * 100)) },
                { label: "Receipts", value: String(datum.n) },
              ],
            }),
          },
        },
      ],
      axes: {
        x: { type: "category", position: "left", line: { enabled: false }, label: { color: t.muted, fontSize: 12.5 }, paddingInner: 0.46 },
        y: { type: "number", position: "bottom", label: { enabled: false }, gridLine: { enabled: false }, line: { enabled: false }, nice: false },
      },
      legend: { enabled: false },
      padding: { right: 56 },
    };
  }, [flow, count, t]);

  const settled = flow.released + flow.refunded;
  return (
    <WidgetFrame title="Money flow" description="Every task you funded, by where the money is now">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <FlowFigure label="Funded" cents={flow.funded} />
        <ChevronRight className="mb-2 size-4 text-faint" strokeWidth={1.9} />
        <FlowFigure label="Held" cents={flow.held} icon={<Lock className="size-3.5" strokeWidth={2} />} className="text-steel-700" />
        <ChevronRight className="mb-2 size-4 text-faint" strokeWidth={1.9} />
        <FlowFigure
          label={`Settled, ${Math.round((flow.released / Math.max(settled, 1)) * 100)}% to workers`}
          cents={settled}
          className="text-green-700"
        />
      </div>
      <div className="mt-5">
        <AgCharts options={options} />
      </div>
    </WidgetFrame>
  );
}

function FlowFigure({ label, cents, icon, className }: { label: string; cents: number; icon?: React.ReactNode; className?: string }) {
  return (
    <div className="min-w-0">
      <div className={cn("flex items-center gap-1.5 text-[12.5px] font-medium text-muted", className)}>
        {icon}
        {label}
      </div>
      <DisplayMoney cents={cents} className="mt-1.5 text-[26px] text-ink" />
    </div>
  );
}

// ── Proof wall ───────────────────────────────────────────────────────────────

const VERDICT = {
  pass: { label: "Pass", tone: "green" as const, icon: <Check /> },
  fail: { label: "Fail", tone: "red" as const, icon: <X /> },
  unsure: { label: "Unsure", tone: "amber" as const, icon: <TriangleAlert /> },
  pending: { label: "Pending", tone: "neutral" as const, icon: null },
  checking: { label: "Checking", tone: "steel" as const, icon: null },
};

/** Submitted proof with the proof engine's verdict and the checks behind it. */
export function ProofWall({ proofs }: { proofs: Poster["proofs"] }) {
  if (!proofs.length) {
    return (
      <Card>
        <EmptyState icon={<Camera />} title="No proof yet" body="When a worker submits proof, the proof engine checks it and the verdict lands here." />
      </Card>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {proofs.slice(0, 6).map((p) => {
        const v = VERDICT[p.status];
        const checks = p.verdict?.checks ?? [];
        const failed = checks.filter((c) => !c.passed);
        const passed = checks.length - failed.length;
        return (
          <Card key={p._id} className="flex flex-col p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={p.worker.name} color={p.worker.color} size={34} />
                <div className="min-w-0 leading-[1.3]">
                  <div className="truncate text-[13.5px] font-medium text-ink">{p.worker.name}</div>
                  <div className="text-[12px] text-faint">{relativeTime(p.submittedAt)}</div>
                </div>
              </div>
              <Badge tone={v.tone}>
                {v.icon}
                {v.label}
                {p.verdict ? ` · ${Math.round(p.verdict.confidence * 100)}%` : ""}
              </Badge>
            </div>
            <div className="mt-4 line-clamp-2 font-display text-[15.5px] leading-snug font-bold tracking-[-0.015em] text-ink">{p.taskTitle}</div>

            {/* What was asked for, and whether it held up */}
            <ul className="mt-3 space-y-1.5">
              {p.spec.slice(0, 3).map((label, i) => {
                const bad = failed.some((f) => f.check === label);
                return (
                  <li key={label + i} className="flex min-w-0 items-center gap-2 text-[12.5px]">
                    {bad ? (
                      <X className="size-4 flex-none text-disputed" strokeWidth={2} />
                    ) : (
                      <Camera className="size-4 flex-none text-faint" strokeWidth={1.9} />
                    )}
                    <span className={cn("truncate", bad ? "text-disputed" : "text-ink-2")}>{label}</span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 mb-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted">
              {failed.length ? (
                <span className="text-disputed">
                  {failed[0]!.check}: {failed[0]!.detail}
                </span>
              ) : (
                p.verdict?.summary
              )}
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-[12px] text-faint">
              <span className="flex min-w-0 items-center gap-1">
                <MapPin size={13} strokeWidth={1.9} className="flex-none" />
                <span className="truncate">{p.location ?? "Remote"}</span>
              </span>
              <span className="tabular flex-none">
                {passed} of {checks.length} checks
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Top workers (AG Grid with chart and meter cells) ─────────────────────────

type Worker = Poster["workers"][number];
type WP = CustomCellRendererProps<Worker>;

function WorkerCell({ data }: WP) {
  if (!data) return null;
  return (
    <div className="flex h-full min-w-0 items-center gap-3">
      <Avatar name={data.name} color={data.color} size={34} />
      <div className="min-w-0 leading-[1.3]">
        <div className="truncate text-[13.5px] font-medium text-ink">{data.name}</div>
        <div className="truncate text-[12px] text-muted">{data.area ?? data.skills[0]}</div>
      </div>
    </div>
  );
}

function PassRateCell({ data }: WP) {
  if (!data || data.passRate === null) return <span className="text-faint">—</span>;
  const pct = Math.round(data.passRate * 100);
  return (
    <div className="flex h-full items-center gap-2.5">
      <Meter value={pct / 100} tone={pct >= 90 ? "brand" : pct >= 70 ? "steel" : "amber"} className="w-16" label="Proof pass rate" />
      <span className="tabular text-[13px] text-ink-2">{pct}%</span>
    </div>
  );
}

function RatingCell({ data }: WP) {
  if (!data?.rating) return <span className="text-faint">—</span>;
  return (
    <span className="tabular inline-flex h-full items-center gap-1 text-[13px] text-ink-2">
      <Star size={13} strokeWidth={1.9} className="fill-steel-200 text-steel-500" />
      {data.rating.toFixed(2).replace(/0$/, "")}
    </span>
  );
}

/** Running total, so a few payouts read as a rising line rather than lone bars. */
const cumulative = (xs: number[]) => xs.reduce<number[]>((acc, x) => [...acc, (acc[acc.length - 1] ?? 0) + x], []);

function TrendCell({ data }: WP) {
  if (!data) return null;
  return (
    <div className="flex h-full items-center">
      <MiniChart values={cumulative(data.daily)} type="area" height={28} width={100} />
    </div>
  );
}

function PaidCell({ data }: WP) {
  if (!data) return null;
  return (
    <div className="flex h-full flex-col items-end justify-center leading-[1.3]">
      <Amount cents={data.paidCents} size="sm" />
      <span className="text-[11.5px] text-faint">{data.lastPaidAt ? relativeTime(data.lastPaidAt) : "not yet"}</span>
    </div>
  );
}

export function TopWorkers({ workers }: { workers: Worker[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const columnDefs = useMemo<ColDef<Worker>[]>(
    () => [
      { colId: "worker", headerName: "Worker", field: "name", cellRenderer: WorkerCell, flex: 1.4, minWidth: 180 },
      { colId: "rating", headerName: "Rating", field: "rating", cellRenderer: RatingCell, width: 88, hide: (width ?? 0) < 760 },
      { colId: "pass", headerName: "Proof pass rate", field: "passRate", cellRenderer: PassRateCell, width: 140, hide: (width ?? 0) < 440 },
      { colId: "tasks", headerName: "Tasks", field: "tasksForYou", width: 76, type: "rightAligned", cellClass: "tabular", hide: (width ?? 0) < 640 },
      { colId: "trend", headerName: "Paid to date", cellRenderer: TrendCell, width: 124, sortable: false, hide: (width ?? 0) < 560 },
      { colId: "paid", headerName: "Paid", field: "paidCents", cellRenderer: PaidCell, width: 104, type: "rightAligned", sort: "desc" },
    ],
    [width],
  );
  return (
    <WidgetFrame flush title="Top workers" description="Who you've paid, and how their proof holds up">
      <div ref={ref} className={GRID_WRAP} style={{ height: 40 + Math.max(workers.length, 1) * 60 + 2 }}>
        {width !== null ? <AgGridReact<Worker>
          theme={plexGridTheme}
          rowData={workers}
          columnDefs={columnDefs}
          defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true }}
          getRowId={(p) => p.data._id}
          suppressCellFocus
          animateRows
        /> : null}
      </div>
    </WidgetFrame>
  );
}

// ── Proof verdicts ───────────────────────────────────────────────────────────

/** Pass, fail and unsure verdicts as an AG Charts donut, pass rate in the middle. */
export function ProofVerdicts({ counts, passRate }: { counts: Poster["proofCounts"]; passRate: number | null }) {
  const t = useTokens();
  const options = useMemo(() => {
    const data = [
      { label: "Pass", value: counts.pass, color: t.green[500] },
      { label: "Unsure", value: counts.unsure, color: t.refunded },
      { label: "Fail", value: counts.fail, color: t.disputed },
    ].filter((d) => d.value > 0);
    return {
      theme: plexChartTheme(t),
      data,
      height: 220,
      series: [
        {
          type: "donut" as const,
          angleKey: "value",
          legendItemKey: "label",
          fills: data.map((d) => d.color),
          innerRadiusRatio: 0.76,
          sectorSpacing: 2,
          innerLabels: [
            { text: passRate === null ? "—" : `${Math.round(passRate * 100)}%`, fontSize: 24, fontWeight: 700 as const, color: t.ink },
            { text: "pass rate", fontSize: 11.5, color: t.faint, spacing: 4 },
          ],
        },
      ],
      legend: { enabled: false },
    };
  }, [counts, passRate, t]);
  const legend = [
    { label: "Pass", value: counts.pass, color: t.green[500] },
    { label: "Unsure", value: counts.unsure, color: t.refunded },
    { label: "Fail", value: counts.fail, color: t.disputed },
  ].filter((d) => d.value > 0);
  const total = counts.pass + counts.fail + counts.unsure;
  return (
    <WidgetFrame title="Proof verdicts" description={`${total} proofs checked by the proof engine`}>
      <AgCharts options={options} />
      <Legend items={legend.map((d) => ({ label: `${d.label} ${d.value}`, color: d.color }))} className="mt-4 justify-center" />
    </WidgetFrame>
  );
}
