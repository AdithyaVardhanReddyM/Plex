"use client";

import { useQuery } from "convex/react";
import { Eye, Megaphone } from "lucide-react";
import { api, type Id } from "@/lib/convex";
import { Avatar, Card, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { cn, formatCents } from "@/lib/utils";
import { FACE, SectionTitle } from "./parts";

const views = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const COLS = "grid-cols-[22px_32px_minmax(0,1fr)_68px_88px]";

/** A brand's pay-per-result campaign for this cause, with its creator leaderboard. */
export function CampaignBoard({ causeId }: { causeId: Id<"causes"> }) {
  const c = useQuery(api.campaigns.forCause, { causeId });
  if (c === undefined) return <Skeleton className="h-72 w-full rounded-lg" />;
  if (c === null) return null;
  const rule = c.rule;
  return (
    <section>
      <SectionTitle
        title={`${c.brand.name} pays creators to tell this story`}
        description="Creators earn per verified view. The brand's budget is held until the views are counted."
        aside="Pay per result"
      />
      <Card className="@container overflow-hidden">
        <div className="grid gap-4 p-4 @[620px]:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 p-2">
            <div className="flex items-center gap-3">
              <Avatar name={c.brand.name} color={c.brand.avatarColor} size={36} square />
              <div className="min-w-0">
                <div className="truncate font-display text-[16px] font-bold tracking-[-0.02em] text-ink">{c.name}</div>
                <div className="flex items-center gap-1.5 text-[12px] text-muted">
                  <Megaphone className="size-3.5" strokeWidth={1.9} />
                  Campaign by {c.brand.name}
                </div>
              </div>
            </div>
            <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-ink-2">{c.brief}</p>
            {rule ? (
              <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4">
                <Term value={formatCents(rule.perThousandViewsCents)} label="per 1,000 verified views" />
                {rule.bonusAtViews && rule.bonusCents ? (
                  <Term value={`+${formatCents(rule.bonusCents)}`} label={`at ${views.format(rule.bonusAtViews)} views`} />
                ) : null}
                <Term value={formatCents(rule.capCents)} label="most a creator earns" />
              </div>
            ) : null}
          </div>
          <div className={cn("relative flex flex-col justify-end overflow-hidden rounded-xl p-5", FACE.mint)}>
            <span className="pointer-events-none absolute -top-10 -right-8 size-32 rounded-full border-[16px] border-white/40" aria-hidden />
            <div className="relative text-[12.5px] font-medium text-ink-2">Earned by creators</div>
            <span className="tabular relative mt-1.5 font-display text-[34px] leading-none font-extrabold tracking-[-0.045em] text-ink">
              {formatCents(c.totalEarnedCents)}
            </span>
            <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/60">
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-700"
                style={{ width: `${c.budgetCents ? Math.min(100, (c.totalEarnedCents / c.budgetCents) * 100) : 0}%` }}
              />
            </div>
            <div className="tabular relative mt-2 text-[12px] text-ink-2/75">
              of {formatCents(c.budgetCents)} budget · <span className="font-medium text-green-800">{formatCents(c.totalPaidCents)} paid out</span>
            </div>
          </div>
        </div>

        <div className="px-2 pb-2">
          <div className="px-5 pt-1 pb-1 text-[12.5px] font-medium text-muted">Creators, by verified views</div>
          {c.board.length ? (
            c.board.map((e, i) => (
              <div key={e._id} className={cn("grid items-center gap-3 rounded-[12px] px-3 py-3 transition-colors hover:bg-sunken/70", COLS)}>
                <span className={cn("tabular font-display text-[15px] font-bold", i === 0 ? "text-green-700" : "text-faint")}>{i + 1}</span>
                <Avatar name={e.firstName} color={e.avatarColor} size={32} />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium text-ink">{e.firstName}</div>
                  <div className="tabular truncate text-[12px] text-muted">
                    {e.platform} · {formatCents(e.paidCents)} paid, {formatCents(e.earnedCents - e.paidCents)} pending
                  </div>
                </div>
                <span className="tabular inline-flex items-center justify-end gap-1 text-[13px] text-ink-2">
                  <Eye className="size-3.5 text-faint" strokeWidth={1.9} />
                  {views.format(e.views)}
                </span>
                <span className="text-right">
                  <Amount cents={e.earnedCents} size="sm" className="text-green-800" />
                </span>
              </div>
            ))
          ) : (
            <div className="px-5 py-6 text-center text-[13px] text-muted">No creators have posted yet.</div>
          )}
        </div>
      </Card>
    </section>
  );
}

function Term({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="tabular font-display text-[20px] leading-none font-bold tracking-[-0.03em] text-ink">{value}</div>
      <div className="mt-1.5 text-[12px] text-muted">{label}</div>
    </div>
  );
}
