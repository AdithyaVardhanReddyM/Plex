"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/convex";
import { PotIcon } from "@/components/pots/pot-meta";
import { cn, formatCents } from "@/lib/utils";
import { MiniChart } from "./mini-chart";
import { DisplayMoney, FACE, FaceRing } from "./kit";
import { fade } from "./ag";
import { useTokens } from "./widget";

type Pot = NonNullable<FunctionReturnType<typeof api.ledger.personal>>["pots"][number];

/** Each pot as a tinted face, like Home's: what's left big, 14 days of spend, today against the daily limit. */
export function PotGauges({ pots }: { pots: Pot[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {pots.map((p) => (
        <PotGauge key={p._id} pot={p} />
      ))}
    </div>
  );
}

const isSteel = (p: Pot) => p.color === "blue" || p.color === "steel";

function PotGauge({ pot }: { pot: Pot }) {
  const t = useTokens();
  const month = pot.spentMonthCents / Math.max(pot.monthlyBudgetCents, 1);
  const today = pot.dailyLimitCents ? pot.spentTodayCents / pot.dailyLimitCents : null;
  const steel = isSteel(pot);
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-xl p-5 shadow-card",
        steel ? FACE.steel : pot.color === "teal" ? FACE.teal : FACE.green,
      )}
    >
      <FaceRing />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <PotIcon pot={pot} size={24} />
          <span className="truncate text-[13.5px] font-semibold text-ink">{pot.name}</span>
        </div>
        <span className={cn("tabular text-[12px] font-semibold", month >= 0.8 ? "text-refunded" : "text-ink-2")}>
          {Math.round(month * 100)}%
        </span>
      </div>

      <div className="relative mt-5">
        <DisplayMoney cents={pot.balanceCents} className="text-[32px] text-ink" />
        <div className="tabular mt-1.5 truncate text-[12px] font-medium text-ink-2/70">
          left · {formatCents(pot.spentMonthCents)} of {formatCents(pot.monthlyBudgetCents)} spent
        </div>
      </div>

      <div className="relative mt-5 min-w-0">
        <MiniChart
          values={pot.daily.map((d) => d.cents)}
          labels={pot.daily.map((d) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}
          color={fade(t.ink, 0.16)}
          accent={t.ink}
          height={34}
        />
        <div className="mt-1.5 flex justify-between text-[11px] text-ink-2/55">
          <span>14 days ago</span>
          <span>Today</span>
        </div>
      </div>

      <div className="relative mt-4">
        {today !== null ? (
          <>
            <div className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="font-medium text-ink-2/80">Today</span>
              <span className="tabular font-semibold text-ink">
                {formatCents(pot.spentTodayCents)} <span className="font-normal text-ink-2/60">of {formatCents(pot.dailyLimitCents!)}</span>
              </span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/60"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(today, 1) * 100)}
              aria-label={`${pot.name}: today against the daily limit`}
            >
              <div
                className={cn("h-full rounded-full transition-[width] duration-700", today >= 0.8 ? "bg-refunded" : "bg-ink")}
                style={{ width: `${Math.min(100, today * 100)}%` }}
              />
            </div>
          </>
        ) : (
          <div className="truncate text-[12px] text-ink-2/70" title={pot.rulesText}>
            {pot.ruleLines[0]}
          </div>
        )}
      </div>
    </div>
  );
}
