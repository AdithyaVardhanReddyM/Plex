"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import {
  ArrowUpRight,
  CalendarDays,
  Coffee,
  Briefcase,
  Landmark,
  ListChecks,
  PiggyBank,
  ReceiptText,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { api, type Doc } from "@/lib/convex";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { WidgetBody } from "@/components/ledger/widget";
import { cn, formatCents } from "@/lib/utils";

export type InsightWidget = Doc<"insights">["widgets"][number];
type Of<K extends InsightWidget["kind"]> = Extract<InsightWidget, { kind: K }>;
type Tone = "good" | "warn" | "neutral" | undefined;

const DAY = 86_400_000;

const toneText = (tone: Tone) =>
  tone === "good" ? "text-green-700" : tone === "warn" ? "text-refunded" : "text-muted";

function Shell({
  title,
  note,
  className,
  children,
  flush,
}: {
  title: string;
  note?: string;
  className?: string;
  children: React.ReactNode;
  /** The body runs edge to edge (a grid) instead of inside the card's inset. */
  flush?: boolean;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col overflow-hidden", className)}>
      <CardHeader title={title} description={note} />
      <div className={cn("min-w-0 flex-1", flush ? "mt-3 border-t border-line" : "px-5 pt-3 pb-4")}>{children}</div>
    </Card>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="-mx-2 flex flex-col">{children}</div>;
}

function Loading() {
  return (
    <div className="flex flex-col gap-3 py-1">
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

// ── Figure ───────────────────────────────────────────────────────────────────

export function FigureWidget({ widget, className }: { widget: Of<"figure">; className?: string }) {
  return (
    <Card className={cn("flex min-w-0 flex-col justify-between px-5 pt-4 pb-5", className)}>
      <div className="text-[13px] font-medium text-muted">{widget.title}</div>
      <div className="mt-3">
        {widget.valueCents !== undefined ? (
          <Amount cents={widget.valueCents} size="xl" className={widget.tone === "good" ? "text-green-700" : undefined} />
        ) : (
          <div className="tabular text-[40px] leading-none font-semibold tracking-[-0.035em] text-ink">{widget.value ?? "—"}</div>
        )}
        {widget.caption ? <div className={cn("mt-2.5 text-[13px] leading-snug", toneText(widget.tone))}>{widget.caption}</div> : null}
      </div>
    </Card>
  );
}

// ── Receipts (the Ledger's widget specs over live receipts) ─────────────────

/** Plex for Mac's money only: the web's task and cause money (Errands, Giving) stays on the web. */
const WEB_ONLY = new Set(["errands", "giving"]);
const isMacReceipt = (r: Doc<"receipts">) =>
  r.kind !== "task_funding" && r.kind !== "donation" && !WEB_ONLY.has((r.category ?? "").toLowerCase());

/** A cancellation or a declined payment is on the record, but it isn't money spent. */
const isSpend = (r: Doc<"receipts">) => r.state !== "declined" && r.kind !== "subscription";

function useMacReceipts(sumsOnly: boolean) {
  const data = useQuery(api.ledger.receipts, { role: "personal" });
  return useMemo(
    () => (data ? { receipts: data.receipts.filter((r) => isMacReceipt(r) && (!sumsOnly || isSpend(r))) } : undefined),
    [data, sumsOnly],
  );
}

export function ReceiptsWidget({ widget, now, className }: { widget: Of<"receipts">; now: number; className?: string }) {
  const { spec } = widget;
  // Charts and totals add up money that moved; a grid lists every receipt, cancellations included.
  const data = useMacReceipts(spec.kind !== "grid");
  if (spec.kind === "stat") {
    return (
      <Card className={cn("flex min-w-0 flex-col px-0 pt-0", className)}>
        <div className="px-5 pt-4 text-[13px] font-medium text-muted">{spec.title}</div>
        {data ? <WidgetBody spec={spec} receipts={data.receipts} now={now} /> : <div className="px-5 py-4"><Loading /></div>}
      </Card>
    );
  }
  return (
    <Shell title={spec.title} note={widget.note ?? spec.subtitle} className={className} flush={spec.kind === "grid"}>
      {data ? (
        <div className={spec.kind === "chart" ? "-mx-5 -mb-4" : undefined}>
          <WidgetBody spec={spec} receipts={data.receipts} now={now} />
        </div>
      ) : (
        <div className="px-5 py-4">
          <Loading />
        </div>
      )}
    </Shell>
  );
}

// ── Pots ─────────────────────────────────────────────────────────────────────

const POT_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  coffee: Coffee,
  "shopping-bag": ShoppingBag,
  briefcase: Briefcase,
  "piggy-bank": PiggyBank,
  receipt: ReceiptText,
  landmark: Landmark,
};

export function PotsWidget({ widget, className }: { widget: Of<"pots">; className?: string }) {
  const today = useQuery(api.agent.today);
  const wanted = widget.pots?.map((p) => p.toLowerCase());
  const pots = today?.pots.filter((p) => !wanted?.length || wanted.includes(p.name.toLowerCase()));
  return (
    <Shell title={widget.title} note={widget.note} className={className}>
      {!pots ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-4">
          {pots.map((p) => {
            const Icon = POT_ICONS[p.icon] ?? Wallet;
            const budget = p.monthlyBudgetCents;
            const ratio = budget > 0 ? p.spentMonthCents / budget : 0;
            return (
              <div key={p._id} className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 flex-none items-center justify-center rounded-md bg-sunken text-ink-2">
                    <Icon size={16} strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[14px] font-medium text-ink">{p.name}</span>
                      <span className="text-[14px] font-semibold tabular text-ink">
                        {formatCents(p.balanceCents)} <span className="font-normal text-muted">left</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                      <div
                        className={cn("h-full rounded-full", ratio > 0.9 ? "bg-refunded" : "bg-green-400")}
                        style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between gap-3 text-[12px] text-muted">
                      <span className="truncate">{p.ruleLines[0] ?? p.rulesText}</span>
                      {budget > 0 ? (
                        <span className="flex-none tabular">
                          {formatCents(p.spentMonthCents)} of {formatCents(budget)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

// ── Bills ────────────────────────────────────────────────────────────────────

const dueLabel = (dueAt: number, now: number) => {
  const days = Math.round((dueAt - now) / DAY);
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} late`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
};

export function BillsWidget({ widget, now, className }: { widget: Of<"bills">; now: number; className?: string }) {
  const bills = useQuery(api.bills.list);
  const horizon = now + (widget.days ?? 14) * DAY;
  const shown = bills?.filter((b) => b.status !== "paid" && b.dueAt <= horizon);
  return (
    <Shell title={widget.title} note={widget.note} className={className}>
      {!shown ? (
        <Loading />
      ) : shown.length === 0 ? (
        <div className="py-2 text-[13px] text-muted">Nothing due.</div>
      ) : (
        <Rows>
          {shown.map((b) => {
            const times = b.usualCents ? b.amountCents / b.usualCents : 1;
            return (
              <div key={b._id} className="flex items-center gap-3 rounded-md px-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-ink">{b.payee}</div>
                  <div className={cn("text-[12px]", b.status === "overdue" ? "text-disputed" : "text-muted")}>
                    {dueLabel(b.dueAt, now)}
                    {b.autopay ? " · Autopay" : ""}
                  </div>
                </div>
                {times >= 1.5 ? <Badge tone="amber">{times.toFixed(1)}× usual</Badge> : null}
                {b.status === "scheduled" ? <Badge tone="steel">Paying</Badge> : null}
                <Amount cents={b.amountCents} />
              </div>
            );
          })}
        </Rows>
      )}
    </Shell>
  );
}

// ── Subscriptions ────────────────────────────────────────────────────────────

export function SubscriptionsWidget({ widget, now, className }: { widget: Of<"subscriptions">; now: number; className?: string }) {
  const subs = useQuery(api.subscriptions.list);
  const flagged = new Set((widget.flag ?? []).map((m) => m.toLowerCase()));
  return (
    <Shell title={widget.title} note={widget.note} className={className}>
      {!subs ? (
        <Loading />
      ) : (
        <Rows>
          {subs.map((s) => {
            const unusedDays = s.lastUsedAt === undefined ? null : Math.floor((now - s.lastUsedAt) / DAY);
            const rose = s.previousAmountCents !== undefined && s.previousAmountCents < s.amountCents;
            const cancelled = s.status === "cancelled";
            return (
              <div
                key={s._id}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-2",
                  flagged.has(s.merchant.toLowerCase()) && !cancelled ? "bg-steel-50" : null,
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate text-[14px] font-medium", cancelled ? "text-faint line-through" : "text-ink")}>
                    {s.merchant}
                  </div>
                  <div className="truncate text-[12px] text-muted">
                    {cancelled
                      ? "Cancelled"
                      : unusedDays !== null && unusedDays >= 30
                        ? <span className="text-refunded">Not opened in {unusedDays} days</span>
                        : s.plan}
                  </div>
                </div>
                {rose && !cancelled ? <Badge tone="amber">Was {formatCents(s.previousAmountCents!)}</Badge> : null}
                <span className={cn("text-[14px] tabular", cancelled ? "text-faint" : "text-ink")}>
                  {formatCents(s.amountCents)}
                  <span className="text-muted">/{s.cadence === "yearly" ? "yr" : "mo"}</span>
                </span>
              </div>
            );
          })}
        </Rows>
      )}
    </Shell>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

const ITEM_ICONS = { bill: ReceiptText, event: CalendarDays, payment: ArrowUpRight, plan: ListChecks } as const;

export function TimelineWidget({ widget, now, className }: { widget: Of<"timeline">; now: number; className?: string }) {
  const days = new Map<string, Of<"timeline">["items"]>();
  for (const it of widget.items) {
    const key = new Date(it.at).toDateString();
    days.set(key, [...(days.get(key) ?? []), it]);
  }
  const today = new Date(now).toDateString();
  return (
    <Shell title={widget.title} note={widget.note} className={className}>
      {widget.items.length === 0 ? (
        <div className="py-2 text-[13px] text-muted">Nothing planned.</div>
      ) : (
        <div className="flex flex-col">
          {[...days.entries()].map(([key, items], i) => {
            const d = new Date(items[0]!.at);
            return (
              <div key={key} className={cn("grid grid-cols-[64px_minmax(0,1fr)] gap-4 py-3", i ? "border-t border-line" : "pt-1")}>
                <div>
                  <div className={cn("text-[12px] font-medium", key === today ? "text-green-700" : "text-muted")}>
                    {key === today ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" })}
                  </div>
                  <div className="text-[20px] leading-tight font-semibold tracking-[-0.02em] tabular text-ink">{d.getDate()}</div>
                </div>
                <div className="flex min-w-0 flex-col gap-2.5">
                  {items.map((it, j) => {
                    const Icon = ITEM_ICONS[it.kind];
                    return (
                      <div key={j} className="flex min-w-0 items-start gap-3">
                        <span
                          className={cn(
                            "mt-0.5 flex size-7 flex-none items-center justify-center rounded-md",
                            it.tone === "warn" ? "bg-refunded-bg text-refunded" : it.kind === "event" ? "bg-steel-50 text-steel-600" : "bg-sunken text-ink-2",
                          )}
                        >
                          <Icon size={16} strokeWidth={1.9} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-medium text-ink">{it.label}</div>
                          {it.detail ? (
                            <div className={cn("text-[12px] leading-snug", toneText(it.tone))}>{it.detail}</div>
                          ) : null}
                        </div>
                        {it.amountCents !== undefined ? <Amount cents={it.amountCents} className="mt-0.5" /> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
