"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/convex";
import { Card, Meter } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { Ring } from "@/components/ui/viz";
import { PotIcon } from "@/components/pots/pot-meta";
import { cn, formatCents } from "@/lib/utils";
import { MiniChart } from "./mini-chart";
import { useTokens } from "./widget";

type Pot = NonNullable<FunctionReturnType<typeof api.ledger.personal>>["pots"][number];

/** Spend against the month's budget as a ring; today's spend against the daily limit as a bar. */
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
    <Card className="flex min-w-0 flex-col p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <PotIcon pot={pot} size={26} />
          <span className="truncate text-[13.5px] font-medium text-ink">{pot.name}</span>
        </div>
        <Ring value={month} size={38} stroke={3.5} tone={steel ? "steel" : "brand"}>
          <span
            className={cn("tabular text-[10.5px] font-semibold", month >= 0.8 ? "text-refunded" : "text-ink-2")}
            style={{ textBoxTrim: "trim-both", textBoxEdge: "cap alphabetic" } as React.CSSProperties}
          >
            {Math.round(month * 100)}
          </span>
        </Ring>
      </div>

      <div className="mt-3">
        <Amount cents={pot.balanceCents} size="lg" />
        <div className="tabular mt-0.5 truncate text-[12px] text-muted">
          left · {formatCents(pot.spentMonthCents)} of {formatCents(pot.monthlyBudgetCents)} spent
        </div>
      </div>

      <div className="mt-4 min-w-0">
        <MiniChart
          values={pot.daily.map((d) => d.cents)}
          labels={pot.daily.map((d) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}
          color={steel ? t.steel[200] : t.green[200]}
          accent={steel ? t.steel[500] : t.green[500]}
          height={32}
        />
        <div className="mt-1.5 flex justify-between text-[11px] text-faint">
          <span>14 days ago</span>
          <span>Today</span>
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {today !== null ? (
          <>
            <div className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="text-muted">Today</span>
              <span className="tabular font-medium text-ink-2">
                {formatCents(pot.spentTodayCents)} <span className="font-normal text-faint">of {formatCents(pot.dailyLimitCents!)}</span>
              </span>
            </div>
            <Meter
              value={today}
              size="sm"
              tone={today >= 0.8 ? "amber" : steel ? "steel" : "brand"}
              className="mt-2"
              label={`${pot.name}: today against the daily limit`}
            />
          </>
        ) : (
          <div className="truncate text-[12px] text-muted" title={pot.rulesText}>
            {pot.ruleLines[0]}
          </div>
        )}
      </div>
    </Card>
  );
}
