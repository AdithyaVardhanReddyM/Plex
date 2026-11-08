"use client";

import { Lock } from "lucide-react";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { cn, formatCents } from "@/lib/utils";

/**
 * The Ledger's shared building blocks, so every widget reads as one system:
 * one borderless card recipe, one stat board, display figures and chips.
 * Receipts uses these too.
 */

// ── Display figures ──────────────────────────────────────────────────────────

/**
 * A big amount in the display face: the currency sign small and raised, the
 * digits huge.
 */
export function DisplayMoney({
  cents,
  sign,
  className,
}: {
  cents: number;
  sign?: "in" | "out";
  className?: string;
}) {
  const f = formatCents(Math.abs(cents));
  return (
    <span className={cn("tabular inline-flex items-start font-display leading-none font-extrabold tracking-[-0.045em]", className)}>
      {sign ? (
        <span className={cn("mr-0.5", sign === "in" ? "text-green-700" : "text-faint")}>
          {sign === "in" ? "+" : "−"}
        </span>
      ) : null}
      <span className="mt-[0.16em] mr-[0.08em] text-[0.46em] font-bold text-faint">$</span>
      {f.replace("$", "")}
    </span>
  );
}

/** A plain count set in the display face, sized to sit beside `DisplayMoney`. */
export function Figure({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("tabular font-display text-[34px] leading-none font-extrabold tracking-[-0.045em] text-ink", className)}>
      {children}
    </span>
  );
}

// ── Widget frame ─────────────────────────────────────────────────────────────

/**
 * Every Ledger widget card: a borderless card, the title in the display face,
 * then the body. No rule between them: `flush` bodies (grids, lists that carry
 * their own row padding) run edge to edge, the rest get a 20px inset.
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
      <div className={cn("flex min-w-0 flex-1 flex-col", flush ? "mt-3 px-2 pb-2" : "px-6 pt-4 pb-6", bodyClassName)}>
        {children}
      </div>
    </Card>
  );
}

// ── Stat board ───────────────────────────────────────────────────────────────

export type StripStat = {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  /** Steel is money that's held: it gets its own card, toned steel. Green is money that moved. */
  tone?: "steel" | "green";
};

/**
 * A role's headline numbers: big display figures spaced on one borderless
 * card, and the held amount (the stat toned steel) on a plain card beside it,
 * its label and figure in steel. No rules between figures.
 */
export function StatStrip({ stats, className }: { stats: StripStat[]; className?: string }) {
  const held = stats.find((s) => s.tone === "steel");
  const rest = stats.filter((s) => s !== held);
  return (
    <div className={cn("grid gap-4", held && "md:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_300px]", className)}>
      <Card className={cn("grid grid-cols-1 gap-x-8 gap-y-7 p-6 sm:grid-cols-2 sm:p-7", rest.length >= 4 ? "lg:grid-cols-4" : rest.length === 3 && "lg:grid-cols-3")}>
        {rest.map((s) => (
          <div key={s.label} className="min-w-0">
            <div className={cn("truncate text-[13px] font-medium", s.tone === "green" ? "text-green-700" : "text-muted")}>{s.label}</div>
            <div className="mt-3 flex min-h-9 items-end">{s.value}</div>
            {s.foot ? <div className="mt-2 line-clamp-2 text-[12.5px] leading-snug text-muted">{s.foot}</div> : null}
          </div>
        ))}
      </Card>
      {held ? (
        <Card className="flex min-h-[156px] flex-col justify-between gap-6 p-6 sm:p-7">
          <div className="flex items-center gap-2 text-[13px] font-medium text-steel-700">
            <Lock className="size-[18px]" strokeWidth={1.9} />
            {held.label}
          </div>
          <div>
            <div className="flex items-end">{held.value}</div>
            {held.foot ? <div className="mt-2 text-[12.5px] font-medium text-steel-700">{held.foot}</div> : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function StatStripSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="grid grid-cols-1 gap-x-8 gap-y-7 p-6 sm:grid-cols-2 sm:p-7 lg:grid-cols-3">
        {["w-20", "w-24", "w-16"].map((a, i) => (
          <div key={i}>
            <Skeleton className={cn("h-3 rounded-full", a)} />
            <Skeleton className="mt-4 h-9 w-32" />
            <Skeleton className="mt-3 h-3 w-28 rounded-full" />
          </div>
        ))}
      </Card>
      <Skeleton className="h-[156px] w-full rounded-xl" />
    </div>
  );
}

/** The skeleton for a role's dashboard: the stat board, then two widget cards. */
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

// ── Legend ───────────────────────────────────────────────────────────────────

/** A chart legend without dots: each series is a short bar in its color. */
export function Legend({ items, className }: { items: { label: string; color: string }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span className="h-[3px] w-3.5 rounded-full" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

// ── Chip ─────────────────────────────────────────────────────────────────────

/**
 * A capsule button: suggested questions, follow-ups, earlier asks.
 */
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
        "inline-flex h-8 max-w-full flex-none items-center gap-1.5 truncate rounded-full px-3.5 text-[12.5px] font-medium transition-[background-color,box-shadow,color] focus-visible:outline-none [&_svg]:size-3.5 [&_svg]:flex-none [&_svg]:stroke-[1.9]",
        "bg-sunken/80 text-ink-2 hover:bg-sunken hover:text-ink focus-visible:ring-[3px] focus-visible:ring-green-200 [&_svg]:text-faint",
        className,
      )}
    >
      {children}
    </button>
  );
}
