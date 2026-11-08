"use client";

import { forwardRef, useId } from "react";
import { motion } from "motion/react";
import { cn, initials } from "@/lib/utils";

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg bg-surface shadow-card", className)}
      {...props}
    />
  );
}

/**
 * A card's title row. `icon` sits in a small tile beside the title; `divider`
 * rules the header off from a dense body (tables, lists).
 */
export function CardHeader({
  title,
  description,
  action,
  icon,
  divider,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  divider?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-6 pt-5",
        divider && "pb-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <IconTile size="sm" className="mt-px">{icon}</IconTile> : null}
        <div className="min-w-0">
          <div className="font-display text-[16px] leading-6 font-bold tracking-[-0.02em] text-ink">{title}</div>
          {description ? <div className="mt-0.5 text-[13px] leading-snug text-faint">{description}</div> : null}
        </div>
      </div>
      {action ? <div className="flex min-h-6 flex-none items-center gap-2">{action}</div> : null}
    </div>
  );
}

// ── Icon tile ────────────────────────────────────────────────────────────────

const iconTones = {
  neutral: "text-ink-2",
  mint: "text-green-700",
  steel: "text-steel-600",
  ink: "text-ink",
  white: "text-ink-2",
  amber: "text-refunded",
  red: "text-disputed",
} as const;

export type TileTone = keyof typeof iconTones;

/**
 * A Lucide icon in its tone. Icons stand on their own: no tile, circle or chip
 * behind them. The size keeps the old tile's footprint so layouts stay put.
 */
export function IconTile({
  tone = "neutral",
  size = "md",
  className,
  children,
}: {
  tone?: TileTone;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
}) {
  const sizes = {
    xs: "size-6 [&_svg]:size-4",
    sm: "size-7 [&_svg]:size-[18px]",
    md: "size-9 [&_svg]:size-5",
    lg: "size-11 [&_svg]:size-6",
  };
  return (
    <span
      className={cn(
        "flex flex-none items-center justify-center [&_svg]:stroke-[1.8]",
        iconTones[tone],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────

const badgeTones = {
  neutral: "bg-sunken text-ink-2",
  green: "bg-green-50 text-green-800 ring-1 ring-inset ring-green-200/80",
  steel: "bg-steel-50 text-steel-700 ring-1 ring-inset ring-steel-200/70",
  amber: "bg-refunded-bg text-refunded ring-1 ring-inset ring-refunded/15",
  red: "bg-disputed-bg text-disputed ring-1 ring-inset ring-disputed/15",
  outline: "bg-surface text-ink-2 ring-1 ring-inset ring-line",
  ink: "bg-ink text-white",
} as const;

export type BadgeTone = keyof typeof badgeTones;

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11.5px] font-medium leading-none whitespace-nowrap [&_svg]:size-3 [&_svg]:stroke-[2.2]",
        badgeTones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Retired: status is said in words and color, never with a dot. Renders nothing. */
export function StatusDot(props: {
  tone?: "green" | "steel" | "amber" | "red" | "faint";
  live?: boolean;
  className?: string;
}) {
  void props;
  return null;
}

// ── Avatar ───────────────────────────────────────────────────────────────────

const DICEBEAR_GROUNDS = "c6fce5,cdeee9,e1e9f3,c9e6ff,fff1c9";

/** A person's face: DiceBear's "Dylan" style (CC BY 4.0), the same face every time for the same name. */
export function faceUrl(seed: string) {
  return `https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(seed || "Plex")}&backgroundColor=${DICEBEAR_GROUNDS}`;
}

export function Avatar({
  name,
  color,
  src,
  size = 32,
  square,
  className,
}: {
  name: string;
  color?: string;
  src?: string;
  size?: number;
  /** Agents, brands and organizations get a rounded square; people stay round. */
  square?: boolean;
  className?: string;
}) {
  // People get their own photo (or the face they picked), else a DiceBear face; agents, brands and organizations keep their initials on their color.
  const image = square ? src : (src ?? faceUrl(name));
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.38)),
    background: image ? undefined : color ?? "var(--color-steel-500)",
    borderRadius: square ? Math.round(size * 0.3) : 9999,
  };
  return (
    <span
      className={cn(
        "relative inline-flex flex-none items-center justify-center overflow-hidden font-semibold text-white select-none",
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_rgb(12_21_18/0.08),inset_0_1px_0_rgb(255_255_255/0.18)]",
        className,
      )}
      style={style}
      aria-hidden
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span style={{ textBoxTrim: "trim-both", textBoxEdge: "cap alphabetic" } as React.CSSProperties}>
          {initials(name)}
        </span>
      )}
    </span>
  );
}

// ── Form fields ──────────────────────────────────────────────────────────────

const fieldBase =
  "w-full rounded-[10px] border border-line bg-surface px-3 text-sm text-ink shadow-card placeholder:text-faint transition-[border-color,box-shadow] hover:border-line-strong focus:border-green-500 focus:outline-none focus:ring-[3px] focus:ring-green-100 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, "h-9", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
  },
);

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-ink-2", className)} {...props} />;
}

// ── Segmented control ────────────────────────────────────────────────────────

export type SegmentItem<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
};

/**
 * Tabs and filters: one capsule track, the selected item on a white pill that
 * slides between items.
 */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  size = "md",
  className,
}: {
  items: SegmentItem<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-sunken p-[3px] ring-1 ring-inset ring-line/60 [scrollbar-width:none]",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative flex flex-none items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors [&_svg]:size-3.5 [&_svg]:stroke-[1.9]",
              size === "sm" ? "h-7 px-3 text-[12.5px]" : "h-8 px-3.5 text-[13px]",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_2px_rgb(12_21_18/0.08),0_0_0_1px_rgb(12_21_18/0.05)]"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            ) : null}
            <span className="relative flex items-center gap-1.5">
              {item.icon}
              {item.label}
              {item.count !== undefined ? (
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 text-[11px] leading-[18px]",
                    active ? "bg-sunken text-ink-2" : "bg-line/70 text-muted",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Meter ────────────────────────────────────────────────────────────────────

/** A progress bar. Brand (mint→aqua) is money that moved; steel is money that's held. */
export function Meter({
  value,
  tone = "brand",
  size = "md",
  className,
  label,
}: {
  /** 0 to 1 */
  value: number;
  tone?: "brand" | "steel" | "amber" | "red" | "ink";
  size?: "sm" | "md";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fills = {
    brand: { backgroundImage: "var(--meter-brand)" },
    steel: { backgroundImage: "var(--meter-steel)" },
    amber: { background: "var(--color-refunded)" },
    red: { background: "var(--color-disputed)" },
    ink: { background: "var(--color-ink)" },
  };
  return (
    <div
      className={cn("overflow-hidden rounded-full bg-sunken", size === "sm" ? "h-1" : "h-1.5", className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, ...fills[tone] }}
      />
    </div>
  );
}

// ── Stat ─────────────────────────────────────────────────────────────────────

/** A labelled figure for stat strips: label, value, and an optional foot line. */
export function Stat({
  label,
  value,
  foot,
  icon,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  foot?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-start gap-1.5 text-[12.5px] leading-snug font-medium text-muted [&_svg]:mt-px [&_svg]:size-3.5 [&_svg]:flex-none [&_svg]:stroke-[1.9] [&_svg]:text-faint">
        {icon}
        <span className="line-clamp-2 sm:truncate">{label}</span>
      </div>
      <div className="mt-1.5">{value}</div>
      {foot ? <div className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-muted sm:truncate">{foot}</div> : null}
    </div>
  );
}

// ── Misc ─────────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-sm", className)} />;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-line bg-surface px-1 font-sans text-[11px] font-medium text-muted shadow-[0_1px_0_var(--color-line)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** A small heading over a group of cards or rows. */
export function SectionHeading({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.012em] text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-none items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  art,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  /** A larger illustration in place of the icon (see components/art). */
  art?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {art ? (
        <div className="mb-4">{art}</div>
      ) : icon ? (
        <div className="mb-3 text-green-700 [&_svg]:size-7 [&_svg]:stroke-[1.6]">{icon}</div>
      ) : null}
      <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</div>
      {body ? <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Page header used at the top of every app screen. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** A Lucide icon for the surface, shown on a tile beside the title. */
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {icon ? (
          <IconTile tone="ink" size="lg" className="mt-2 hidden sm:flex [&_svg]:size-8 [&_svg]:stroke-[1.6]">
            {icon}
          </IconTile>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-surface/70 px-2.5 py-1 text-[12px] font-medium text-green-800 shadow-card backdrop-blur">{eyebrow}</div>
          ) : null}
          <h1 className="font-display text-[32px] leading-[1.05] font-extrabold tracking-[-0.04em] text-ink sm:text-[42px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ── Switch ───────────────────────────────────────────────────────────────────

export function Switch({
  checked,
  onChange,
  label,
  tone = "brand",
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  tone?: "brand" | "ink";
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-[34px] flex-none items-center rounded-full p-0.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200",
        checked ? (tone === "brand" ? "bg-green-500" : "bg-ink") : "bg-line-strong",
        className,
      )}
    >
      <span
        className={cn(
          "size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(12_21_18/0.25)] transition-transform duration-200 ease-[var(--ease-out-soft)]",
          checked ? "translate-x-[14px]" : "translate-x-0",
        )}
      />
    </button>
  );
}
