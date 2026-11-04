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
import { categoryPalette, plexChartTheme, readTokens, registerAg, stateColor, type Tokens } from "./ag";
import { ReceiptsGrid } from "./receipts-grid";

registerAg();

/** Design tokens, read once on the client (AG Charts paints to canvas). */
export function useTokens(): Tokens {
  const [t] = useState(readTokens);
  return t;
}

const dollars = (cents: number) => cents / 100;
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
  return (
    <div className="px-5 pt-2 pb-5">
      {measure === "count" ? (
        <div className="tabular text-[40px] leading-none font-semibold tracking-[-0.035em] text-ink">{value}</div>
      ) : (
        <Amount cents={value} size="xl" />
      )}
      <div className="mt-2 text-[13px] text-muted">
        {rows.length} receipt{rows.length === 1 ? "" : "s"}
        {prev !== null ? ` · ${value >= prev ? "up" : "down"} from ${measure === "count" ? prev : formatCents(prev)} before` : ""}
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
        height: 240,
        series: [
          {
            type: "donut",
            angleKey: "value",
            legendItemKey: "label",
            fills,
            innerRadiusRatio: 0.72,
            sectorSpacing: 2,
            innerLabels: [
              { text: fmt(total), fontSize: 22, fontWeight: 600, color: t.ink },
              { text: "total", fontSize: 12, color: t.faint, spacing: 4 },
            ],
            tooltip: { renderer: ({ datum }) => ({ heading: datum.label, data: [{ label: "Amount", value: fmt(datum.value) }] }) },
          },
        ],
        legend: { position: "right", item: { marker: { shape: "circle", size: 8 }, label: { fontSize: 12.5 } } },
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

    const rowsShown = data.length;
    const o: AgCartesianChartOptions = {
      theme,
      data,
      height: horizontal ? Math.max(160, Math.min(rowsShown, 8) * 38 + 40) : 240,
      series,
      axes: {
        x: {
          type: "category",
          position: horizontal ? "left" : "bottom",
          line: { enabled: false },
          label: { color: horizontal ? t.ink2 : t.faint, fontSize: horizontal ? 12.5 : 11.5, autoRotate: false, avoidCollisions: true },
          paddingInner: horizontal ? 0.35 : 0.3,
        },
        y: {
          type: "number",
          position: horizontal ? "bottom" : "left",
          nice: true,
          label: { formatter: ({ value }: { value: number }) => fmt(value), fontSize: 11.5 },
          gridLine: { style: [{ stroke: t.line, lineDash: [3, 3] }] },
          line: { enabled: false },
        },
      },
      legend: { enabled: Boolean(c.stackBy && stackKeys.length > 1), position: "bottom", item: { marker: { shape: "circle", size: 8 } } },
      padding: { top: 12 },
    };
    return o;
  }, [rows, c, spec.filter.sinceDays, spec.title, now, t]);

  if (!rows.length) return <div className="px-5 py-10 text-center text-[13px] text-muted">Nothing to chart yet.</div>;
  return (
    <div className={cn("px-3 pb-3")}>
      <AgCharts options={options} />
    </div>
  );
}
