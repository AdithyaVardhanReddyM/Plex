"use client";

import { useMemo, useState } from "react";
import { AgCharts } from "ag-charts-react";
import type { AgCartesianChartOptions, AgChartOptions, AgPolarChartOptions } from "ag-charts-community";
import {
  aggregate,
  applyFilter,
  fillDays,
  sumCents,
  type WidgetSpec,
} from "@plex/backend/lib/ledgerSpec";
import type { Receipt } from "@/components/receipt/receipt";
import { Amount } from "@/components/ui/money";
import { cn, formatCents } from "@/lib/utils";
import { ChartColumn } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { categoryPalette, plexChartTheme, readTokens, registerAg, stateColor, valueAxis, type Tokens } from "./ag";
import { Figure } from "./kit";
import { ReceiptsGrid } from "./receipts-grid";

registerAg();

/** Design tokens, read once on the client (AG Charts paints to canvas). */
export function useTokens(): Tokens {
  const [t] = useState(readTokens);
  return t;
}

const dollars = (cents: number) => cents / 100;
/** Daily columns read as day numbers ("26", "27", …); the tooltip carries the full date. */
const dayTick = (label: string) => label.split(" ")[1] ?? label;
const money = (v: number) => formatCents(Math.round(v * 100));

/**
 * Renders any widget spec over live receipts. This is the whole contract
 * between the Analyst and the screen: the agent picks a spec, this draws it.
 */
export function WidgetBody({
  spec,
  receipts,
  now,
  onOpen,
  requested,
  selectedId,
}: {
  spec: WidgetSpec;
  receipts: Receipt[];
  now: number;
  onOpen?: (r: Receipt) => void;
  requested?: Record<string, string>;
  selectedId?: string | null;
}) {
  const rows = useMemo(() => applyFilter(receipts, spec.filter, now), [receipts, spec.filter, now]);
  if (spec.kind === "stat") return <StatWidget spec={spec} rows={rows} receipts={receipts} now={now} />;
  if (spec.kind === "chart" && spec.chart) return <SpecChart spec={spec} rows={rows} now={now} />;
  return (
    <ReceiptsGrid
      rows={rows}
      columns={spec.columns}
      sort={spec.sort}
      onOpen={onOpen}
      requested={requested}
      selectedId={selectedId}
      maxRows={6}
    />
  );
}

function StatWidget({ spec, rows, receipts, now }: { spec: WidgetSpec; rows: Receipt[]; receipts: Receipt[]; now: number }) {
  const measure = spec.stat?.measure ?? "sum";
  const value = measure === "count" ? rows.length : measure === "avg" ? Math.round(sumCents(rows) / Math.max(rows.length, 1)) : sumCents(rows);
  let prev: number | null = null;
  if (spec.stat?.compareToPrevious && spec.filter.sinceDays) {
    const d = spec.filter.sinceDays;
    const before = applyFilter(receipts, { ...spec.filter, sinceDays: 2 * d }, now).filter((r) => r.occurredAt < now - d * 86_400_000);
    prev = measure === "count" ? before.length : sumCents(before);
  }
  const up = prev !== null && value >= prev;
  return (
    <div>
      {measure === "count" ? <Figure className="text-[40px] tracking-[-0.04em]">{value}</Figure> : <Amount cents={value} size="xl" />}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
        <span className="tabular">
          {rows.length} receipt{rows.length === 1 ? "" : "s"}
        </span>
        {prev !== null ? (
          <>
            <span className="text-line-strong">·</span>
            <span className={cn("tabular font-medium", up ? "text-ink-2" : "text-green-700")}>
              {up ? "Up" : "Down"} from {measure === "count" ? prev : formatCents(prev)}
            </span>
            <span>the period before</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function SpecChart({ spec, rows, now }: { spec: WidgetSpec; rows: Receipt[]; now: number }) {
  const t = useTokens();
  const c = spec.chart!;
  const options = useMemo<AgChartOptions>(() => {
    const { buckets: raw, stackKeys } = aggregate(rows, c.groupBy, c.measure, c.stackBy);
    const buckets = c.groupBy === "day" && spec.filter.sinceDays ? fillDays(raw, Math.min(spec.filter.sinceDays, 31), now) : raw;
    const isMoney = c.measure === "sum";
    const fmt = (v: number) => (isMoney ? money(v) : String(v));
    const scale = (v: number) => (isMoney ? dollars(v) : v);
    const theme = plexChartTheme(t);

    if (c.type === "donut") {
      const data = buckets.map((b) => ({ label: b.label, value: scale(b.value) }));
      const total = data.reduce((s, d) => s + d.value, 0);
      const fills = c.groupBy === "state" ? buckets.map((b) => stateColor(t, b.label)) : categoryPalette(t);
      const o: AgPolarChartOptions = {
        theme,
        data,
        height: 220,
        series: [
          {
            type: "donut",
            angleKey: "value",
            legendItemKey: "label",
            fills,
            innerRadiusRatio: 0.72,
            sectorSpacing: 2,
            innerLabels: [
              { text: fmt(total), fontSize: 20, fontWeight: 700, color: t.ink },
              { text: "total", fontSize: 11.5, color: t.faint, spacing: 4 },
            ],
            tooltip: { renderer: ({ datum }) => ({ heading: datum.label, data: [{ label: "Amount", value: fmt(datum.value) }] }) },
          },
        ],
        legend: { enabled: false },
      };
      return o;
    }

    const horizontal = c.type === "bar";
    const data = buckets.map((b) => {
      const d: Record<string, string | number> = { label: b.label, value: scale(b.value) };
      for (const k of stackKeys) d[k] = scale(b.stacks[k] ?? 0);
      return d;
    });
    const seriesType = c.type === "line" ? "line" : c.type === "area" ? "area" : "bar";
    const palette = categoryPalette(t);
    const colorFor = (k: string, i: number) => (c.stackBy === "state" ? stateColor(t, k) : palette[i % palette.length]!);
    const series = (c.stackBy && stackKeys.length ? stackKeys : ["value"]).map((k, i) => ({
      type: seriesType,
      xKey: "label",
      yKey: k,
      yName: k === "value" ? spec.title : k,
      stacked: Boolean(c.stackBy),
      ...(seriesType === "bar"
        ? { direction: horizontal ? "horizontal" : "vertical", fill: c.stackBy ? colorFor(k, i) : t.green[500] }
        : { stroke: colorFor(k, i), fill: colorFor(k, i) }),
      tooltip: {
        renderer: ({ datum }: { datum: Record<string, number | string> }) => ({
          heading: String(datum.label),
          data: [{ label: k === "value" ? (isMoney ? "Amount" : "Count") : k, value: fmt(Number(datum[k])) }],
        }),
      },
    })) as AgCartesianChartOptions["series"];

    const legendOn = Boolean(c.stackBy && stackKeys.length > 1);
    const o: AgCartesianChartOptions = {
      theme,
      data,
      series,
      axes: {
        x: {
          type: "category",
          position: horizontal ? "left" : "bottom",
          line: { enabled: false },
          tick: { enabled: false },
          label: {
            color: horizontal ? t.ink2 : t.faint,
            fontSize: horizontal ? 12.5 : 11.5,
            autoRotate: false,
            avoidCollisions: true,
            ...(c.groupBy === "day"
              ? { formatter: ({ value }: { value: unknown }) => dayTick(String(value)) }
              : {}),
          },
          paddingInner: horizontal ? 0.5 : data.length <= 2 ? 0.74 : data.length <= 4 ? 0.6 : 0.36,
          paddingOuter: !horizontal && data.length <= 4 ? 0.3 : undefined,
        },
        y: {
          type: "number",
          position: horizontal ? "bottom" : "left",
          nice: true,
          ...valueAxis(t),
          label: { color: t.faint, fontSize: 11.5, formatter: ({ value }: { value: number }) => fmt(value) },
        },
      },
      legend: {
        enabled: legendOn,
        position: "bottom",
        spacing: 16,
        item: { marker: { shape: "circle", size: 7 }, label: { color: t.muted, fontSize: 12 }, padding: 14 },
      },
      padding: { top: 8, right: 4, bottom: 0, left: 0 },
    };
    return o;
  }, [rows, c, spec.filter.sinceDays, spec.title, now, t]);

  if (!rows.length) {
    return (
      <EmptyState
        icon={<ChartColumn />}
        title="Nothing to chart yet"
        body="No receipts match this view. They show up here as soon as money moves."
        className="py-8"
      />
    );
  }
  if (c.type === "donut") return <DonutWithBreakdown options={options} rows={rows} spec={spec} />;
  // Charts fill whatever height the card gets beside its neighbour; horizontal
  // bars start from a height that fits their rows (and the legend, when stacked).
  const bars = c.type === "bar" ? aggregate(rows, c.groupBy, c.measure).buckets.length : 0;
  // (AG Charts drops the legend when a chart is short, so stacked bars get room for it.)
  const minHeight = c.type === "bar" ? Math.max(c.stackBy ? 260 : 160, Math.min(bars, 8) * 44 + 60 + (c.stackBy ? 48 : 0)) : 248;
  return (
    <div className="relative flex-1" style={{ minHeight }}>
      <AgCharts options={options} className="absolute inset-0" />
    </div>
  );
}

/** A donut beside its breakdown: each slice's label, amount and share, in the slice's color. */
function DonutWithBreakdown({ options, rows, spec }: { options: AgChartOptions; rows: Receipt[]; spec: WidgetSpec }) {
  const t = useTokens();
  const c = spec.chart!;
  const { buckets } = aggregate(rows, c.groupBy, c.measure);
  const total = buckets.reduce((s, b) => s + b.value, 0) || 1;
  const fills = c.groupBy === "state" ? buckets.map((b) => stateColor(t, b.label)) : categoryPalette(t);
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <AgCharts options={options} />
      <ul className="divide-y divide-line">
        {buckets.slice(0, 6).map((b, i) => (
          <li key={String(b.key)} className="grid grid-cols-[8px_minmax(0,1fr)_auto_40px] items-center gap-3 py-2.5">
            <span className="size-2 rounded-full" style={{ background: fills[i % fills.length] }} />
            <span className="truncate text-[13.5px] text-ink-2">
              {b.label}
              <span className="ml-1.5 text-[12px] text-faint">{b.count}</span>
            </span>
            {c.measure === "sum" ? <Amount cents={b.value} size="sm" /> : <span className="tabular text-[13px] font-semibold">{b.value}</span>}
            <span className="tabular text-right text-[12.5px] text-muted">{Math.round((b.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
