"use client";

import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * The Ledger's shared building blocks, so every widget reads as one system:
 * one card recipe (header, padding), one stat strip, one chip.
 */

// ── Widget frame ─────────────────────────────────────────────────────────────

/**
 * Every Ledger widget card: CardHeader on top, then a body. `flush` bodies
 * (grids, lists that carry their own row padding) run edge to edge under a
 * hairline; everything else gets the standard 20px inset.
 */
export function WidgetFrame({
  title,
  description,
  action,
  flush,
  className,
  bodyClassName,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col overflow-hidden", className)}>
      <CardHeader title={title} description={description} action={action} />
      <div className={cn("flex min-w-0 flex-1 flex-col", flush ? "mt-4 border-t border-line" : "px-5 pt-4 pb-5", bodyClassName)}>
        {children}
      </div>
    </Card>
  );
}

// ── Stat strip ───────────────────────────────────────────────────────────────

export type StripStat = {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  /** A small mark before the label: steel for held money, green for money that moved. */
  tone?: "steel" | "green";
};

/** Four figures in one card, ruled apart: two by two on phones, one row from lg. */
export function StatStrip({ stats, className }: { stats: StripStat[]; className?: string }) {
  return (
    <Card className={cn("grid grid-cols-2 overflow-hidden lg:grid-cols-4", className)}>
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            "min-w-0 px-5 py-4",
            i % 2 === 1 && "border-l border-line",
            i >= 2 && "border-t border-line lg:border-t-0",
            i === 2 && "lg:border-l",
          )}
        >
          <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
            {s.tone ? (
              <span className={cn("size-1.5 flex-none rounded-full", s.tone === "steel" ? "bg-steel-500" : "bg-green-500")} aria-hidden />
            ) : null}
            <span className="truncate">{s.label}</span>
          </div>
          <div className="mt-2 flex min-h-7 items-end">{s.value}</div>
          {s.foot ? <div className="mt-1 truncate text-[12.5px] text-muted">{s.foot}</div> : null}
        </div>
      ))}
    </Card>
  );
}

/** A plain count set in the display face, the same weight as `<Amount size="lg">`. */
export function Figure({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("tabular font-display text-[22px] leading-none font-bold tracking-[-0.025em] text-ink", className)}>
      {children}
    </span>
  );
}

export function StatStripSkeleton() {
  return (
    <Card className="grid grid-cols-2 overflow-hidden lg:grid-cols-4">
      {[
        ["w-20", "w-28"],
        ["w-16", "w-24"],
        ["w-24", "w-32"],
        ["w-[72px]", "w-20"],
      ].map(([a, b], i) => (
        <div
          key={i}
          className={cn("px-5 py-4", i % 2 === 1 && "border-l border-line", i >= 2 && "border-t border-line lg:border-t-0", i === 2 && "lg:border-l")}
        >
          <Skeleton className={cn("h-3 rounded-full", a)} />
          <Skeleton className="mt-3.5 h-6 w-24" />
          <Skeleton className={cn("mt-2.5 h-3 rounded-full", b)} />
        </div>
      ))}
    </Card>
  );
}

/** The skeleton for a role's dashboard: a strip, then two widget cards. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <StatStripSkeleton />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Skeleton className="h-[320px] w-full rounded-lg" />
        <Skeleton className="h-[320px] w-full rounded-lg" />
      </div>
    </div>
  );
}

// ── Chip ─────────────────────────────────────────────────────────────────────

/** A quiet outline capsule: suggested questions, follow-ups, earlier asks. */
export function Chip({
  children,
  onClick,
  className,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-7 max-w-full flex-none items-center gap-1.5 truncate rounded-full border border-line bg-surface px-3 text-[12.5px] font-medium text-ink-2 transition-[border-color,background-color,color] hover:border-line-strong hover:bg-canvas hover:text-ink focus-visible:ring-[3px] focus-visible:ring-green-200 focus-visible:outline-none [&_svg]:size-3.5 [&_svg]:flex-none [&_svg]:stroke-[1.9] [&_svg]:text-faint",
        className,
      )}
    >
      {children}
    </button>
  );
}
