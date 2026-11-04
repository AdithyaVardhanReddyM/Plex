import { forwardRef } from "react";
import { cn, initials } from "@/lib/utils";

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-line bg-surface shadow-card", className)}
      {...props}
    />
  );
}

export function CardHeader({
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
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4", className)}>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</div>
        {description ? <div className="mt-0.5 text-[13px] leading-snug text-muted">{description}</div> : null}
      </div>
      {action ? <div className="flex flex-none items-center gap-2">{action}</div> : null}
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────

const badgeTones = {
  neutral: "bg-sunken text-ink-2",
  green: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200/70",
  steel: "bg-steel-50 text-steel-700 ring-1 ring-inset ring-steel-200/70",
  amber: "bg-refunded-bg text-refunded ring-1 ring-inset ring-refunded/15",
  red: "bg-disputed-bg text-disputed ring-1 ring-inset ring-disputed/15",
  outline: "text-ink-2 ring-1 ring-inset ring-line",
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
        "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[12px] font-medium leading-none whitespace-nowrap [&_svg]:size-3",
        badgeTones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({
  name,
  color,
  src,
  size = 32,
  className,
}: {
  name: string;
  color?: string;
  src?: string;
  size?: number;
  className?: string;
}) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.38)),
    background: src ? undefined : color ?? "var(--color-steel-500)",
  };
  return (
    <span
      className={cn(
        "relative inline-flex flex-none items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none",
        className,
      )}
      style={style}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
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
  "w-full rounded-sm border border-line bg-surface px-3 text-sm text-ink shadow-card placeholder:text-faint transition-[border-color,box-shadow] focus:border-green-400 focus:outline-none focus:ring-3 focus:ring-green-100 disabled:opacity-60";

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

// ── Misc ─────────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-sm", className)} />;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line bg-surface px-1 font-mono text-[11px] text-muted shadow-card">
      {children}
    </kbd>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-sunken text-muted [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {body ? <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Page header used at the top of every app screen. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-[13px] font-medium text-green-700">{eyebrow}</div> : null}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-none items-center gap-2">{actions}</div> : null}
    </div>
  );
}
