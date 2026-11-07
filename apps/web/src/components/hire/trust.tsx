"use client";

import { cn } from "@/lib/utils";

/** The trust score (0-100) as a ring. Computed in code from facts on Plex. */
export function TrustRing({ score, size = 44, className }: { score: number; size?: number; className?: string }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <span className={cn("relative inline-flex flex-none items-center justify-center", className)} style={{ width: size, height: size }} aria-label={`Trust ${score} of 100`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="3.5" className="stroke-sunken" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          className={cn("transition-[stroke-dashoffset] duration-700", score >= 85 ? "stroke-green-500" : score >= 70 ? "stroke-green-300" : "stroke-steel-300")}
        />
      </svg>
      <span className="tabular text-[13px] font-semibold text-ink">{score}</span>
    </span>
  );
}

export function TrustBreakdown({ parts }: { parts: { label: string; value: string; points: number }[] }) {
  return (
    <ul className="divide-y divide-line">
      {parts.map((p) => (
        <li key={p.label} className="grid grid-cols-[minmax(0,1fr)_auto_52px] items-center gap-3 py-2.5 text-[13px]">
          <span className="font-medium text-ink">{p.label}</span>
          <span className="tabular text-muted">{p.value}</span>
          <span className={cn("tabular text-right font-medium", p.points < 0 ? "text-disputed" : p.points === 0 ? "text-faint" : "text-green-700")}>
            {p.points > 0 ? "+" : ""}
            {p.points}
          </span>
        </li>
      ))}
    </ul>
  );
}
