"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Small, quiet charts drawn in SVG with the brand scales. For anything with
 * axes and tooltips, the Ledger uses AG Charts; these are for cards and tiles.
 */

/** A progress ring: one track, one arc, round caps. */
export function Ring({
  value,
  size = 44,
  stroke = 4,
  tone = "brand",
  children,
  className,
}: {
  /** 0 to 1 */
  value: number;
  size?: number;
  stroke?: number;
  tone?: "brand" | "steel";
  children?: React.ReactNode;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className={cn("relative inline-flex flex-none items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            {tone === "brand" ? (
              <>
                <stop offset="0%" stopColor="var(--color-green-300)" />
                <stop offset="100%" stopColor="var(--color-green-500)" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="var(--color-steel-300)" />
                <stop offset="100%" stopColor="var(--color-steel-500)" />
              </>
            )}
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-sunken)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#ring-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 900ms var(--ease-out-soft)" }}
        />
      </svg>
      {children ? <span className="absolute inset-0 flex items-center justify-center">{children}</span> : null}
    </span>
  );
}

/** Daily columns. The last (today) is lit in the brand gradient; the rest are pale. */
export function DayBars({
  values,
  labels,
  height = 64,
  highlight,
  onDark,
  className,
}: {
  values: number[];
  labels?: string[];
  height?: number;
  /** Index to light up; defaults to the last. */
  highlight?: number;
  /** On a spotlight (night) card. */
  onDark?: boolean;
  className?: string;
}) {
  const max = Math.max(1, ...values);
  const lit = highlight ?? values.length - 1;
  return (
    <div className={cn("flex items-end gap-1.5", className)}>
      {values.map((v, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full items-end" style={{ height }}>
            <div
              className={cn(
                "w-full rounded-[6px] transition-[height] duration-700 ease-out",
                i === lit ? (onDark ? "shadow-[0_0_24px_rgb(62_224_216/0.55)]" : "") : onDark ? "bg-white/[0.09]" : "bg-green-200/70",
              )}
              style={{
                height: `${Math.max(v > 0 ? 8 : 3, (v / max) * 100)}%`,
                backgroundImage: i === lit ? "linear-gradient(180deg, var(--color-green-300), var(--color-green-500))" : undefined,
                opacity: v > 0 || i === lit ? 1 : 0.6,
              }}
            />
          </div>
          {labels ? (
            <span
              className={cn(
                "text-[10.5px] leading-none",
                i === lit ? (onDark ? "font-medium text-white" : "font-medium text-ink-2") : onDark ? "text-white/35" : "text-faint",
              )}
            >
              {labels[i]}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** A smooth sparkline with a soft fill under it. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  tone = "brand",
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: "brand" | "steel";
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  if (values.length < 2) return <svg width={width} height={height} className={className} aria-hidden />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - 3 - ((v - min) / span) * (height - 6),
  ]);
  const d = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1]!;
    const cx = (px! + x!) / 2;
    return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, "");
  const color = tone === "brand" ? "var(--color-green-500)" : "var(--color-steel-500)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#spark-${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
      <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={2.75} fill={color} stroke="white" strokeWidth={1.5} />
    </svg>
  );
}
