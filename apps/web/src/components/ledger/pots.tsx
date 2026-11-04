"use client";

import { Coffee, HeartHandshake, MapPin, PiggyBank, ShoppingBag } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/convex";
import { Card } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { cn, formatCents } from "@/lib/utils";
import { MiniChart } from "./mini-chart";
import { useTokens } from "./widget";

type Pot = NonNullable<FunctionReturnType<typeof api.ledger.personal>>["pots"][number];

const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  coffee: Coffee,
  "shopping-bag": ShoppingBag,
  "map-pin": MapPin,
  "heart-handshake": HeartHandshake,
};

/** Spend against the month's budget as a ring; today's spend against the daily limit as a bar. */
export function PotGauges({ pots }: { pots: Pot[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {pots.map((p) => (
        <PotGauge key={p._id} pot={p} />
      ))}
    </div>
  );
}

function Ring({ ratio, color, size = 64 }: { ratio: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.min(Math.max(ratio, 0), 1);
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-sunken)" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${c * shown} ${c}`}
          style={{ transition: "stroke-dasharray 600ms var(--ease-out-soft)" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold text-ink"
        style={{ textBoxTrim: "trim-both", textBoxEdge: "cap alphabetic" } as React.CSSProperties}
      >
        {Math.round(ratio * 100)}%
      </span>
    </div>
  );
}

function PotGauge({ pot }: { pot: Pot }) {
  const t = useTokens();
  const Icon = ICONS[pot.icon] ?? PiggyBank;
  const month = pot.spentMonthCents / Math.max(pot.monthlyBudgetCents, 1);
  const warn = month >= 0.8;
  const accent = warn ? t.refunded : pot.color === "blue" || pot.color === "steel" ? t.steel[500] : t.green[500];
  const today = pot.dailyLimitCents ? pot.spentTodayCents / pot.dailyLimitCents : null;
  const fortnight = pot.daily.reduce((s, d) => s + d.cents, 0);
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
            <Icon size={16} strokeWidth={1.9} />
            {pot.name}
          </div>
          <div className="mt-2">
            <Amount cents={pot.balanceCents} size="lg" />
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            left · {formatCents(pot.spentMonthCents)} of {formatCents(pot.monthlyBudgetCents)} this month
          </div>
        </div>
        <Ring ratio={month} color={accent} />
      </div>

      <div className="mt-4">
        <MiniChart
          values={pot.daily.map((d) => d.cents)}
          labels={pot.daily.map((d) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}
          color={pot.color === "blue" || pot.color === "steel" ? t.steel[300] : t.green[300]}
          height={34}
        />
        <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-faint">
          <span>14 days</span>
          <span className="tabular">{formatCents(fortnight)}</span>
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {today !== null ? (
          <>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted">Today</span>
              <span className="tabular font-medium text-ink-2">
                {formatCents(pot.spentTodayCents)} <span className="font-normal text-faint">of {formatCents(pot.dailyLimitCents!)}</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div
                className={cn("h-full rounded-full", today >= 0.8 ? "bg-refunded" : "bg-green-500")}
                style={{ width: `${Math.min(today, 1) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <div className="truncate text-[12.5px] text-muted" title={pot.rulesText}>
            {pot.ruleLines[0]}
          </div>
        )}
      </div>
    </Card>
  );
}
