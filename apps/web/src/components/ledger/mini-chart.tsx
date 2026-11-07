"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AgCharts } from "ag-charts-react";
import type { AgCartesianChartOptions } from "ag-charts-community";
import { formatCents } from "@/lib/utils";
import { plexChartTheme, registerAg } from "./ag";
import { useTokens } from "./widget";

registerAg();

/**
 * A sparkline: an AG Charts bar or area series with the axes hidden. Used in
 * pot cards and inside AG Grid cells (top workers), so grid and chart share one
 * theme. Values are cents.
 */
export function MiniChart({
  values,
  labels,
  color,
  accent,
  type = "bar",
  height = 36,
  width,
}: {
  values: number[];
  labels?: string[];
  color?: string;
  /** Bars only: the last bar (today) in this color, the rest in `color`. */
  accent?: string;
  type?: "bar" | "area";
  height?: number;
  width?: number;
}) {
  const t = useTokens();
  // Without a fixed width, measure the box: AG Charts otherwise starts at its
  // 300px default and can overrun a narrow card.
  const box = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number>();
  useLayoutEffect(() => {
    if (width || !box.current) return;
    const el = box.current;
    const update = () => setMeasured(Math.floor(el.getBoundingClientRect().width) || undefined);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  const chartWidth = width ?? measured;
  const options = useMemo<AgCartesianChartOptions>(() => {
    const fill = color ?? t.green[500];
    const data = values.map((v, i) => ({ i: labels?.[i] ?? String(i), v: v / 100 }));
    return {
      theme: plexChartTheme(t),
      data,
      height,
      width: chartWidth,
      padding: { top: 2, right: 0, bottom: 0, left: 0 },
      animation: { enabled: false },
      series: [
        type === "bar"
          ? {
              type: "bar",
              xKey: "i",
              yKey: "v",
              fill,
              cornerRadius: 2,
              ...(accent ? { itemStyler: ({ datum }: { datum: { i: string } }) => (datum.i === data[data.length - 1]?.i ? { fill: accent } : {}) } : {}),
              tooltip: { renderer: ({ datum }) => ({ heading: datum.i, data: [{ label: "Spent", value: formatCents(Math.round(datum.v * 100)) }] }) },
            }
          : {
              type: "area",
              xKey: "i",
              yKey: "v",
              fill,
              stroke: fill,
              fillOpacity: 0.16,
              strokeWidth: 1.5,
              marker: { enabled: false },
              tooltip: { enabled: false },
            },
      ],
      axes: {
        x: { type: "category", position: "bottom", label: { enabled: false }, line: { enabled: false }, gridLine: { enabled: false }, paddingInner: 0.28, paddingOuter: 0 },
        y: { type: "number", position: "left", label: { enabled: false }, line: { enabled: false }, gridLine: { enabled: false }, min: 0 },
      },
      legend: { enabled: false },
    };
  }, [values, labels, color, accent, type, height, chartWidth, t]);
  return (
    <div ref={box} style={{ height, width: width ?? "100%" }}>
      {chartWidth ? <AgCharts options={options} style={{ height, width: chartWidth }} /> : null}
    </div>
  );
}
