"use client";

import {
  ModuleRegistry as GridModules,
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  ColumnAutoSizeModule,
  CellStyleModule,
  CsvExportModule,
  ExternalFilterModule,
  HighlightChangesModule,
  NumberFilterModule,
  PinnedRowModule,
  QuickFilterModule,
  RenderApiModule,
  RowApiModule,
  RowSelectionModule,
  RowStyleModule,
  TextFilterModule,
  TooltipModule,
  ValidationModule,
  iconSetQuartzLight,
  themeQuartz,
} from "ag-grid-community";
import { ModuleRegistry as ChartModules, AllCommunityModule as AllChartsCommunity } from "ag-charts-community";
import type { AgChartTheme } from "ag-charts-community";

/**
 * AG Grid + AG Charts setup for the Ledger: the modules we use (registered
 * once, so the bundle only carries what the Ledger needs) and the Plex themes.
 * Community editions only, so there is no watermark; an Enterprise license
 * (row grouping, master/detail, integrated charts) slots in via AgGridProvider.
 */

let registered = false;
export function registerAg() {
  if (registered) return;
  registered = true;
  GridModules.registerModules([
    ClientSideRowModelModule,
    ClientSideRowModelApiModule,
    QuickFilterModule,
    ExternalFilterModule,
    TextFilterModule,
    NumberFilterModule,
    RowSelectionModule,
    PinnedRowModule,
    HighlightChangesModule,
    TooltipModule,
    CellStyleModule,
    RowStyleModule,
    CsvExportModule,
    ColumnAutoSizeModule,
    RowApiModule,
    RenderApiModule,
    ...(process.env.NODE_ENV !== "production" ? [ValidationModule] : []),
  ]);
  ChartModules.registerModules(AllChartsCommunity);
}

/**
 * The Plex grid theme. Built with the Theming API from the app's CSS tokens
 * (globals.css), so the grid follows the design system: canvas header, ink
 * text, hairline rows, a green focus ring and a green-50 selection. The grid
 * sits inside a Card, so it draws no wrapper border of its own.
 */
export const plexGridTheme = themeQuartz.withPart(iconSetQuartzLight).withParams({
  fontFamily: "var(--font-sans)",
  fontSize: 13.5,
  dataFontSize: 13.5,
  foregroundColor: "var(--color-ink)",
  textColor: "var(--color-ink-2)",
  subtleTextColor: "var(--color-muted)",
  backgroundColor: "var(--color-surface)",
  chromeBackgroundColor: "var(--color-canvas)",
  accentColor: "var(--color-green-500)",
  borderColor: "var(--color-line)",
  borderRadius: 8,
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  headerBackgroundColor: "var(--color-surface)",
  headerTextColor: "var(--color-faint)",
  headerFontSize: 12,
  headerFontWeight: 500,
  headerHeight: 40,
  headerRowBorder: { color: "var(--color-line)" },
  headerColumnBorder: false,
  headerColumnResizeHandleColor: "var(--color-line)",
  headerCellHoverBackgroundColor: "var(--color-canvas)",
  rowHeight: 56,
  rowBorder: { color: "var(--color-line)" },
  columnBorder: false,
  oddRowBackgroundColor: "var(--color-surface)",
  rowHoverColor: "var(--color-canvas)",
  selectedRowBackgroundColor: "var(--color-green-50)",
  cellHorizontalPadding: 14,
  spacing: 8,
  iconColor: "var(--color-faint)",
  iconSize: 14,
  focusShadow: { radius: 3, spread: 0, color: "var(--color-green-100)" },
  inputFocusBorder: { color: "var(--color-green-400)" },
  checkboxCheckedBackgroundColor: "var(--color-green-500)",
  checkboxCheckedBorderColor: "var(--color-green-500)",
  menuBackgroundColor: "var(--color-surface)",
  menuBorder: { color: "var(--color-line)" },
  menuShadow: "var(--shadow-float)",
  popupShadow: "var(--shadow-float)",
  tooltipBackgroundColor: "var(--color-ink)",
  tooltipTextColor: "var(--color-surface)",
  tooltipBorder: false,
  pinnedRowBackgroundColor: "var(--color-canvas)",
  pinnedRowBorder: { color: "var(--color-line-strong)" },
  pinnedRowFontWeight: 600,
  rangeSelectionBorderColor: "var(--color-green-400)",
  valueChangeValueHighlightBackgroundColor: "var(--color-green-100)",
  scrollbarThumbColor: "var(--color-line-strong)",
});

/** The same grid, tighter: for small widgets inside cards. */
export const plexGridThemeCompact = plexGridTheme.withParams({ rowHeight: 44, headerHeight: 36 });

// ── Charts ──────────────────────────────────────────────────────────────────

/**
 * Tailwind v4 only emits the theme variables something uses. The charts read
 * these by name, so name them here as utilities; Tailwind sees the strings and
 * keeps every token the charts need. The probe below resolves them either way.
 */
const CHART_TOKEN_CLASSES: Record<string, string> = {
  "green-50": "bg-green-50", "green-100": "bg-green-100", "green-200": "bg-green-200", "green-300": "bg-green-300",
  "green-400": "bg-green-400", "green-500": "bg-green-500", "green-600": "bg-green-600", "green-700": "bg-green-700",
  "green-800": "bg-green-800", "steel-100": "bg-steel-100", "steel-200": "bg-steel-200", "steel-300": "bg-steel-300",
  "steel-400": "bg-steel-400", "steel-500": "bg-steel-500", "steel-600": "bg-steel-600", "steel-700": "bg-steel-700",
  ink: "bg-ink", "ink-2": "bg-ink-2", muted: "bg-muted", faint: "bg-faint", line: "bg-line", "line-strong": "bg-line-strong",
  surface: "bg-surface", canvas: "bg-canvas", sunken: "bg-sunken", refunded: "bg-refunded", disputed: "bg-disputed",
};

/** Reads the design tokens at runtime: AG Charts draws to canvas, so it needs real colors. */
export function readTokens() {
  const css = getComputedStyle(document.documentElement);
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const t = (name: string) => {
    const v = css.getPropertyValue(`--color-${name}`).trim();
    if (v) return v;
    probe.className = CHART_TOKEN_CLASSES[name] ?? "";
    return getComputedStyle(probe).backgroundColor;
  };
  const tokens = {
    ink: t("ink"),
    ink2: t("ink-2"),
    muted: t("muted"),
    faint: t("faint"),
    line: t("line"),
    lineStrong: t("line-strong"),
    surface: t("surface"),
    canvas: t("canvas"),
    sunken: t("sunken"),
    green: { 50: t("green-50"), 100: t("green-100"), 200: t("green-200"), 300: t("green-300"), 400: t("green-400"), 500: t("green-500"), 600: t("green-600"), 700: t("green-700"), 800: t("green-800") },
    steel: { 100: t("steel-100"), 200: t("steel-200"), 300: t("steel-300"), 400: t("steel-400"), 500: t("steel-500"), 600: t("steel-600"), 700: t("steel-700") },
    refunded: t("refunded"),
    disputed: t("disputed"),
    font: css.getPropertyValue("--font-sans").trim() || "system-ui, sans-serif",
  };
  probe.remove();
  return tokens;
}
export type Tokens = ReturnType<typeof readTokens>;

/** Category colors: green for spend that moved, steel for what's held, then quieter steps. */
export function categoryPalette(t: Tokens) {
  return [t.green[500], t.steel[500], t.green[300], t.steel[300], t.green[700], t.steel[700], t.green[200], t.steel[200]];
}

/** Money states keep one color everywhere: the grid's pills and the charts agree. */
export function stateColor(t: Tokens, state: string) {
  const map: Record<string, string> = {
    Held: t.steel[500], Funded: t.steel[400], Released: t.green[500], Paid: t.green[500],
    Refunded: t.refunded, Disputed: t.disputed, Pending: t.lineStrong, Declined: t.faint,
  };
  return map[state] ?? t.steel[300];
}

export function plexChartTheme(t: Tokens): AgChartTheme {
  const fills = categoryPalette(t);
  return {
    baseTheme: "ag-default",
    palette: { fills, strokes: fills },
    params: {
      fontFamily: t.font,
      fontSize: 12,
      foregroundColor: t.ink,
      textColor: t.ink2,
      subtleTextColor: t.muted,
      backgroundColor: t.surface,
      chartBackgroundColor: "transparent",
      axisLabelColor: t.faint,
      axisLineColor: t.line,
      gridLineColor: t.line,
      legendLabelColor: t.muted,
      tooltipBackgroundColor: t.ink,
      tooltipTextColor: t.surface,
      tooltipSubtleTextColor: t.lineStrong,
      tooltipBorder: false,
      tooltipBorderRadius: 8,
      chartPadding: 4,
    },
    overrides: {
      bar: { series: { cornerRadius: 4, strokeWidth: 0 } },
      donut: { series: { strokeWidth: 2, strokes: [t.surface] } },
      line: { series: { strokeWidth: 2, marker: { size: 0 } } },
      area: { series: { strokeWidth: 2, fillOpacity: 0.18, marker: { enabled: false } } },
    },
  };
}
