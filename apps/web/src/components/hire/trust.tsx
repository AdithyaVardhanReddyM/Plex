"use client";

import { Ring } from "@/components/ui/viz";
import { cn } from "@/lib/utils";

const TRIM = { textBoxTrim: "trim-both", textBoxEdge: "cap alphabetic" } as React.CSSProperties;

/**
 * The trust score (0-100) as a ring with the number on its center. Computed in
 * code from facts on Plex, never by a model. Below 70 the arc turns steel.
 */
export function TrustRing({
  score,
  size = 44,
  stroke,
  className,
}: {
  score: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-none", className)} role="img" aria-label={`Trust ${score} of 100`}>
      <Ring value={score / 100} size={size} stroke={stroke ?? (size >= 56 ? 5 : 3.5)} tone={score >= 70 ? "brand" : "steel"}>
        <span
          className="font-semibold tracking-[-0.02em] text-ink"
          style={{ ...TRIM, fontSize: Math.round(size * (size >= 56 ? 0.32 : 0.3)) }}
        >
          {score}
        </span>
      </Ring>
    </span>
  );
}

/** How the score was built: each fact, its value and the points it adds. */
export function TrustBreakdown({ parts }: { parts: { label: string; value: string; points: number }[] }) {
  return (
    <ul className="divide-y divide-line">
      {parts.map((p) => (
        <li key={p.label} className="grid grid-cols-[minmax(0,1fr)_auto_44px] items-center gap-3 py-2.5 text-[13px]">
          <span className="truncate text-ink-2">{p.label}</span>
          <span className="tabular text-[12.5px] text-muted">{p.value}</span>
          <span
            className={cn(
              "tabular text-right text-[12.5px] font-semibold",
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
