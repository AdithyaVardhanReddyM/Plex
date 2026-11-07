"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import type { ColDef, GridApi, GridReadyEvent, IRowNode, RowClickedEvent } from "ag-grid-community";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  CornerDownRight,
  FileText,
  HandCoins,
  HeartHandshake,
  Repeat,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  User,
} from "lucide-react";
import { direction, kindLabel, partyOf, stateLabel, type ColumnKey } from "@plex/backend/lib/ledgerSpec";
import { StatePill, type Receipt } from "@/components/receipt/receipt";
import { Amount } from "@/components/ui/money";
import { cn, formatCents, relativeTime, shortDate } from "@/lib/utils";
import { GRID_WRAP, plexGridTheme, registerAg } from "./ag";
import { useWidth } from "./use-width";

registerAg();

/** A pinned summary row at the foot of the grid. */
type TotalRow = { __total: true; count: number; inCents: number; outCents: number };
type Row = Receipt | TotalRow;
const isTotal = (r: Row | undefined): r is TotalRow => Boolean(r && "__total" in r);

interface GridContext {
  narrow: boolean;
  requested: Record<string, string>;
}

const ICON = { size: 16, strokeWidth: 1.9 } as const;

const KIND_ICON: Record<Receipt["kind"], React.ReactNode> = {
  task_funding: <HandCoins {...ICON} />,
  payout: <ArrowUpRight {...ICON} />,
  refund: <RotateCcw {...ICON} />,
  donation: <HeartHandshake {...ICON} />,
  purchase: <ShoppingBag {...ICON} />,
  invoice: <FileText {...ICON} />,
  subscription: <Repeat {...ICON} />,
};

// ── Cell renderers ───────────────────────────────────────────────────────────

type CellProps = CustomCellRendererProps<Row, unknown, GridContext>;

function WhenCell({ data }: CellProps) {
  if (!data || isTotal(data)) return null;
  return (
    <div className="flex h-full flex-col justify-center leading-[1.3]">
      <span className="text-[13px] text-ink-2">{relativeTime(data.occurredAt)}</span>
      <span className="tabular text-[12px] text-faint">{shortDate(data.occurredAt)}</span>
    </div>
  );
}

function PartyCell({ data, context }: CellProps) {
  if (!data) return null;
  if (isTotal(data)) {
    return (
      <div className="flex h-full items-center text-[13px] font-semibold text-ink">
        {data.count} receipt{data.count === 1 ? "" : "s"}
      </div>
    );
  }
  const dir = direction(data);
  return (
    <div className="flex h-full min-w-0 items-center gap-3">
      <span
        className={cn(
          "flex size-8 flex-none items-center justify-center rounded-[10px] ring-1 ring-inset",
          dir === "in"
            ? "bg-green-50 text-green-700 ring-green-100"
            : dir === "via"
              ? "bg-sunken text-muted ring-line/70"
              : "bg-surface text-ink-2 shadow-card ring-line",
        )}
      >
        {dir === "in" ? <ArrowDownLeft {...ICON} /> : dir === "via" ? <CornerDownRight {...ICON} /> : KIND_ICON[data.kind]}
      </span>
      <div className="flex min-w-0 flex-col leading-[1.3]">
        <span className="truncate text-[13.5px] font-medium text-ink">{partyOf(data)}</span>
        <span className="truncate text-[12px] text-muted">
          {context.narrow ? `${relativeTime(data.occurredAt)} · ${stateLabel(data.state)}` : kindLabel(data.kind)}
          {data.category && !context.narrow ? ` · ${data.category}` : ""}
        </span>
      </div>
    </div>
  );
}

function WhyCell({ data }: CellProps) {
  if (!data || isTotal(data)) return null;
  return (
    <div className="flex h-full items-center">
      <span className="truncate text-[13px] text-ink-2">“{data.why}”</span>
    </div>
  );
}

function RuleCell({ data }: CellProps) {
  if (!data || isTotal(data)) return null;
  return (
    <div className="flex h-full min-w-0 items-center gap-2 text-muted">
      <ShieldCheck size={14} strokeWidth={1.9} className="flex-none text-green-600" />
      <span className="truncate text-[12.5px]">{data.rule.text}</span>
    </div>
  );
}

function AgentCell({ data }: CellProps) {
  if (!data || isTotal(data)) return null;
  const agent = data.agentLabel;
  return (
    <div className="flex h-full items-center">
      <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-[12.5px]", agent ? "font-medium text-ink-2" : "text-muted")}>
        {agent ? <Bot size={14} strokeWidth={1.9} className="flex-none text-steel-500" /> : <User size={14} strokeWidth={1.9} className="flex-none text-faint" />}
        <span className="truncate">{agent ?? "You"}</span>
      </span>
    </div>
  );
}

function StateCell({ data, context }: CellProps) {
  if (!data || isTotal(data)) return null;
  const requested = context.requested[data._id];
  return (
    <div className="flex h-full flex-col items-start justify-center gap-1">
      <StatePill state={data.state} />
      {requested ? <span className="text-[11.5px] leading-none text-muted">{requested} requested</span> : null}
    </div>
  );
}

function AmountCell({ data }: CellProps) {
  if (!data) return null;
  if (isTotal(data)) {
    const net = data.inCents - data.outCents;
    return (
      <div className="flex h-full flex-col items-end justify-center leading-[1.3]">
        <Amount cents={Math.abs(net)} sign={net >= 0 ? "in" : "out"} size="sm" />
        <span className="text-[11.5px] font-normal text-faint">net</span>
      </div>
    );
  }
  const dir = direction(data);
  return (
    <div className="flex h-full items-center justify-end">
      <Amount
        cents={data.amountCents}
        currency={data.currency}
        sign={dir === "via" ? undefined : dir}
        size="sm"
        className={dir === "via" ? "text-muted" : undefined}
      />
    </div>
  );
}

// ── Columns ──────────────────────────────────────────────────────────────────

const COLUMNS: Record<ColumnKey, ColDef<Row>> = {
  when: {
    colId: "when",
    headerName: "When",
    valueGetter: (p) => (isTotal(p.data) ? null : p.data?.occurredAt),
    cellRenderer: WhenCell,
    width: 118,
    minWidth: 104,
    sort: "desc",
  },
  party: {
    colId: "party",
    headerName: "Paid to / from",
    valueGetter: (p) => (p.data && !isTotal(p.data) ? partyOf(p.data) : ""),
    cellRenderer: PartyCell,
    flex: 1.3,
    minWidth: 200,
  },
  why: {
    colId: "why",
    headerName: "Why",
    valueGetter: (p) => (p.data && !isTotal(p.data) ? p.data.why : ""),
    cellRenderer: WhyCell,
    tooltip: (p) => (p.data && !isTotal(p.data) ? `“${p.data.why}”` : undefined),
    flex: 1.6,
    minWidth: 200,
    sortable: false,
  },
  rule: {
    colId: "rule",
    headerName: "Rule",
    valueGetter: (p) => (p.data && !isTotal(p.data) ? p.data.rule.text : ""),
    cellRenderer: RuleCell,
    tooltip: (p) => (p.data && !isTotal(p.data) ? p.data.rule.text : undefined),
    flex: 1.2,
    minWidth: 180,
    sortable: false,
  },
  agent: {
    colId: "agent",
    headerName: "Agent",
    valueGetter: (p) => (p.data && !isTotal(p.data) ? (p.data.agentLabel ?? "You") : ""),
    cellRenderer: AgentCell,
    width: 148,
    minWidth: 120,
  },
  category: {
    colId: "category",
    headerName: "Pot",
    valueGetter: (p) => (p.data && !isTotal(p.data) ? (p.data.category ?? "—") : ""),
    width: 104,
    cellClass: "text-[13px] text-ink-2",
  },
  kind: {
    colId: "kind",
    headerName: "Type",
    valueGetter: (p) => (p.data && !isTotal(p.data) ? kindLabel(p.data.kind) : ""),
    width: 124,
  },
  state: {
    colId: "state",
    headerName: "State",
    valueGetter: (p) => (p.data && !isTotal(p.data) ? p.data.state : ""),
    cellRenderer: StateCell,
    enableCellChangeFlash: true,
    width: 126,
    minWidth: 112,
  },
  amount: {
    colId: "amount",
    headerName: "Amount",
    valueGetter: (p) => (p.data && !isTotal(p.data) ? p.data.amountCents : null),
    cellRenderer: AmountCell,
    enableCellChangeFlash: true,
    type: "rightAligned",
    width: 116,
    minWidth: 100,
    comparator: (a: number | null, b: number | null) => (a ?? 0) - (b ?? 0),
  },
};

/** Columns go in this order when the card is too narrow for all of them; party and amount always stay. */
const DROP_ORDER: ColumnKey[] = ["rule", "kind", "category", "agent", "when", "state", "why"];

function fitColumns(keys: ColumnKey[], width: number): ColumnKey[] {
  let shown = [...keys];
  const colWidth = (c: ColDef<Row>) => (c.flex ? (c.minWidth ?? 160) : (c.width ?? c.minWidth ?? 120));
  const need = (ks: ColumnKey[]) => ks.reduce((s, k) => s + colWidth(COLUMNS[k]), 0);
  for (const k of DROP_ORDER) {
    if (need(shown) <= width) break;
    if (shown.length > 2) shown = shown.filter((x) => x !== k);
  }
  return shown;
}

export const DEFAULT_COLUMNS: ColumnKey[] = ["when", "party", "why", "rule", "agent", "state", "amount"];

// Grid options live outside render: AG Grid reprocesses any prop whose
// identity changes, and a fresh object each render re-runs the row model,
// whose onModelUpdated renders us again. That loop pinned the main thread
// and stalled every client navigation away from the Ledger.
const DEFAULT_COL_DEF: ColDef<Row> = { sortable: true, resizable: true, suppressMovable: false, suppressHeaderMenuButton: true };
const ROW_SELECTION = { mode: "singleRow", checkboxes: false, enableClickSelection: false } as const;
const getRowId = (p: { data: Row }) => (isTotal(p.data) ? "__total" : p.data._id);
const sameTotal = (a: TotalRow | null, b: TotalRow) =>
  Boolean(a && a.count === b.count && a.inCents === b.inCents && a.outCents === b.outCents);

// ── Grid ─────────────────────────────────────────────────────────────────────

export interface ReceiptsGridHandle {
  exportCsv: (fileName?: string) => void;
}

export interface ReceiptsGridProps {
  rows: Receipt[] | undefined;
  columns?: ColumnKey[];
  sort?: { column: ColumnKey; desc: boolean };
  quickFilter?: string;
  /** External filter, e.g. the state chips above the grid. */
  match?: (r: Receipt) => boolean;
  requested?: Record<string, string>;
  selectedId?: string | null;
  onOpen?: (r: Receipt) => void;
  /** Fixed height; omit to size to the rows (up to `maxRows`). */
  height?: number;
  maxRows?: number;
  showTotal?: boolean;
  className?: string;
}

export const ReceiptsGrid = forwardRef<ReceiptsGridHandle, ReceiptsGridProps>(function ReceiptsGrid(
  { rows, columns = DEFAULT_COLUMNS, sort, quickFilter, match, requested = {}, selectedId, onOpen, height, maxRows = 8, showTotal = true, className },
  ref,
) {
  const apiRef = useRef<GridApi<Row> | null>(null);
  // Columns are picked by the card's width (measured before first paint);
  // narrow cards get a two-column layout instead of a sideways scroll.
  const [wrapRef, measured] = useWidth<HTMLDivElement>();
  const width = measured ?? 0;
  const narrow = width < 560;
  const [total, setTotal] = useState<TotalRow | null>(null);
  const matchRef = useRef(match);

  const columnDefs = useMemo<ColDef<Row>[]>(() => {
    const keys = narrow ? (["party", "amount"] as ColumnKey[]) : fitColumns(columns, width);
    return keys.map((k) => {
      const def = { ...COLUMNS[k] };
      if (sort) def.sort = sort.column === k ? (sort.desc ? "desc" : "asc") : null;
      if (narrow && k === "party") def.minWidth = 160;
      return def;
    });
  }, [columns, narrow, width, sort]);

  const context = useMemo<GridContext>(() => ({ narrow, requested }), [narrow, requested]);

  const recomputeTotal = useCallback(() => {
    const api = apiRef.current;
    if (!api || !showTotal) return;
    const t: TotalRow = { __total: true, count: 0, inCents: 0, outCents: 0 };
    api.forEachNodeAfterFilter((n: IRowNode<Row>) => {
      if (!n.data || isTotal(n.data)) return;
      t.count += 1;
      const d = direction(n.data);
      if (d === "in") t.inCents += n.data.amountCents;
      if (d === "out") t.outCents += n.data.amountCents;
    });
    setTotal((prev) => (sameTotal(prev, t) ? prev : t));
  }, [showTotal]);

  const pinnedBottomRowData = useMemo(() => (showTotal && total && total.count > 0 ? [total] : undefined), [showTotal, total]);
  const isExternalFilterPresent = useCallback(() => Boolean(matchRef.current), []);
  const doesExternalFilterPass = useCallback(
    (node: IRowNode<Row>) => !node.data || isTotal(node.data) || (matchRef.current?.(node.data) ?? true),
    [],
  );
  const onRowClicked = useCallback(
    (e: RowClickedEvent<Row>) => {
      if (e.data && !isTotal(e.data) && !e.node.rowPinned) onOpen?.(e.data);
    },
    [onOpen],
  );
  const getRowClass = useCallback(
    (p: { node: IRowNode<Row> }) => (p.node.rowPinned ? undefined : onOpen ? "cursor-pointer" : undefined),
    [onOpen],
  );
  const onGridReady = useCallback((e: GridReadyEvent<Row>) => {
    apiRef.current = e.api;
  }, []);

  useImperativeHandle(ref, () => ({
    exportCsv: (fileName = "plex-ledger.csv") =>
      apiRef.current?.exportDataAsCsv({
        fileName,
        columnKeys: ["when", "party", "why", "rule", "agent", "state", "amount"].filter((c) => apiRef.current?.getColumn(c)),
        processCellCallback: (p) => {
          if (p.column.getColId() === "when" && typeof p.value === "number") return new Date(p.value).toISOString();
          if (p.column.getColId() === "amount" && typeof p.value === "number") return (p.value / 100).toFixed(2);
          return p.value ?? "";
        },
        shouldRowBeSkipped: (p) => isTotal(p.node.data),
      }),
  }));

  // Re-run the external filter whenever its inputs change.
  useEffect(() => {
    matchRef.current = match;
    apiRef.current?.onFilterChanged();
  }, [match]);

  // Keep the open receipt highlighted.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.forEachNode((n) => n.setSelected(Boolean(selectedId && n.data && !isTotal(n.data) && n.data._id === selectedId)));
  }, [selectedId, rows]);

  const visible = rows?.length ?? 0;
  const autoHeight = 38 + Math.max(Math.min(visible, maxRows), 2) * 54 + (showTotal ? 54 : 0) + 2;

  return (
    <div ref={wrapRef} className={cn("ledger-grid w-full", GRID_WRAP, className)} style={{ height: height ?? autoHeight }}>
      {measured === null ? null : <AgGridReact<Row>
        theme={plexGridTheme}
        rowData={rows}
        loading={rows === undefined}
        loadingRows
        columnDefs={columnDefs}
        defaultColDef={DEFAULT_COL_DEF}
        getRowId={getRowId}
        context={context}
        quickFilterText={quickFilter}
        isExternalFilterPresent={isExternalFilterPresent}
        doesExternalFilterPass={doesExternalFilterPass}
        pinnedBottomRowData={pinnedBottomRowData}
        rowSelection={ROW_SELECTION}
        onRowClicked={onRowClicked}
        getRowClass={getRowClass}
        onGridReady={onGridReady}
        onModelUpdated={recomputeTotal}
        animateRows
        suppressCellFocus={false}
        tooltipShowDelay={400}
        overlayNoRowsTemplate='<span class="text-[13px] text-muted">No receipts match. Try another filter or search.</span>'
      />}
    </div>
  );
});

/** Small helper for headers: “12 receipts · $340”. */
export function summarize(rows: Receipt[]) {
  const out = rows.filter((r) => direction(r) === "out").reduce((s, r) => s + r.amountCents, 0);
  return `${rows.length} receipt${rows.length === 1 ? "" : "s"} · ${formatCents(out)} out`;
}
