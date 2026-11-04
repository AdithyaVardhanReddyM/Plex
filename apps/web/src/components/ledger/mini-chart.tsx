"use client";

import { useMemo } from "react";
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
  type = "bar",
  height = 36,
  width,
}: {
  values: number[];
  labels?: string[];
  color?: string;
  type?: "bar" | "area";
  height?: number;
  width?: number;
}) {
  const t = useTokens();
  const options = useMemo<AgCartesianChartOptions>(() => {
    const fill = color ?? t.green[500];
    const data = values.map((v, i) => ({ i: labels?.[i] ?? String(i), v: v / 100 }));
    return {
      theme: plexChartTheme(t),
      data,
      height,
      width,
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
  }, [values, labels, color, type, height, width, t]);
  return <AgCharts options={options} style={{ height, width: width ?? "100%" }} />;
}
