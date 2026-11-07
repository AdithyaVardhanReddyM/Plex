"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

const TRIM = { textBoxTrim: "trim-both", textBoxEdge: "cap alphabetic" } as React.CSSProperties;

/**
 * The trust score (0-100) as a ring with the number on its center. Computed in
 * code from facts on Plex, never by a model. Below 70 the arc turns steel.
 * `score` undefined draws an empty track with "New" (no record yet).
 */
export function TrustRing({
  score,
  size = 44,
  stroke,
  className,
}: {
  score?: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const sw = stroke ?? (size >= 56 ? 5 : 3.5);
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const v = score === undefined ? 0 : Math.max(0, Math.min(1, score / 100));
  const brand = score === undefined || score >= 70;
  return (
    <span
      className={cn("relative inline-flex flex-none items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={score === undefined ? "No trust score yet" : `Trust ${score} of 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`trust-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={brand ? "var(--color-green-300)" : "var(--color-steel-300)"} />
            <stop offset="100%" stopColor={brand ? "var(--color-green-500)" : "var(--color-steel-500)"} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-sunken)"
          strokeWidth={sw}
        />
        {score !== undefined ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#trust-${id})`}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v)}
            style={{ transition: "stroke-dashoffset 900ms var(--ease-out-soft)" }}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            "tabular tracking-[-0.02em]",
            size >= 56 ? "font-display font-extrabold" : "font-semibold",
            score === undefined ? "text-faint" : "text-ink",
          )}
          style={{ ...TRIM, fontSize: score === undefined ? Math.round(size * 0.24) : Math.round(size * (size >= 56 ? 0.32 : 0.3)) }}
        >
          {score ?? "New"}
        </span>
      </span>
    </span>
  );
}

/** How the score was built: each fact, its value and the points it adds. Rows with space, no rules. */
export function TrustBreakdown({ parts }: { parts: { label: string; value: string; points: number }[] }) {
  return (
    <ul className="space-y-0.5">
      {parts.map((p) => (
        <li
          key={p.label}
          className="grid grid-cols-[minmax(0,1fr)_auto_40px] items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] transition-colors hover:bg-sunken/70"
        >
          <span className="truncate text-ink-2">{p.label}</span>
          <span className="tabular text-[12.5px] text-muted">{p.value}</span>
          <span
            className={cn(
              "tabular text-right font-display text-[15px] font-bold tracking-[-0.02em]",
              p.points < 0 ? "text-disputed" : p.points === 0 ? "text-faint" : "text-green-700",
            )}
          >
            {p.points > 0 ? "+" : p.points < 0 ? "−" : ""}
            {Math.abs(p.points)}
          </span>
        </li>
      ))}
    </ul>
  );
}
