"use client";

import { useQuery } from "convex/react";
import { Eye } from "lucide-react";
import { api, type Id } from "@/lib/convex";
import { Avatar, Badge, Card, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { formatCents } from "@/lib/utils";
import { RaisedBar, SectionTitle } from "./parts";

const views = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** A brand's pay-per-result campaign for this cause, with its creator leaderboard. */
export function CampaignBoard({ causeId }: { causeId: Id<"causes"> }) {
  const c = useQuery(api.campaigns.forCause, { causeId });
  if (c === undefined) return <Skeleton className="h-64 w-full" />;
  if (c === null) return null;
  const rule = c.rule;
  return (
    <section>
      <SectionTitle title={`${c.brand.name} pays creators to tell this story`} aside="Pay per result" />
      <Card className="overflow-hidden">
        <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Avatar name={c.brand.name} color={c.brand.avatarColor} size={26} />
              <div className="text-[14px] font-semibold text-ink">“{c.name}”</div>
            </div>
            <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-2">{c.brief}</p>
            {rule ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="outline" className="tabular">
                  {formatCents(rule.perThousandViewsCents)} per 1,000 verified views
                </Badge>
                {rule.bonusAtViews && rule.bonusCents ? (
                  <Badge tone="outline" className="tabular">
                    +{formatCents(rule.bonusCents)} at {views.format(rule.bonusAtViews)} views
                  </Badge>
                ) : null}
                <Badge tone="outline" className="tabular">
                  Up to {formatCents(rule.capCents)} a creator
                </Badge>
              </div>
            ) : null}
          </div>
          <div className="sm:w-48 sm:text-right">
            <div className="text-[12.5px] text-muted">Earned by creators</div>
            <Amount cents={c.totalEarnedCents} size="lg" className="mt-1" />
            <RaisedBar raisedCents={c.totalEarnedCents} goalCents={c.budgetCents} thin className="mt-2" />
            <div className="tabular mt-1.5 text-[12px] text-faint">
              of {formatCents(c.budgetCents)} budget · {formatCents(c.totalPaidCents)} paid out
            </div>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="grid grid-cols-[20px_28px_minmax(0,1fr)_72px_84px] items-center gap-3 px-5 py-2 text-[11.5px] font-medium text-faint">
            <span>#</span>
            <span />
            <span>Creator</span>
            <span className="text-right">Views</span>
            <span className="text-right">Earned</span>
          </div>
          {c.board.map((e, i) => (
            <div
              key={e._id}
              className="grid grid-cols-[20px_28px_minmax(0,1fr)_72px_84px] items-center gap-3 border-t border-line px-5 py-2.5"
            >
              <span className="tabular text-[13px] font-medium text-faint">{i + 1}</span>
              <Avatar name={e.firstName} color={e.avatarColor} size={28} />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-ink">{e.firstName}</div>
                <div className="truncate text-[12px] text-muted">
                  {e.platform} · {formatCents(e.paidCents)} paid, {formatCents(e.earnedCents - e.paidCents)} pending
                </div>
              </div>
              <span className="tabular inline-flex items-center justify-end gap-1 text-[13px] text-ink-2">
                <Eye className="size-3.5 text-faint" strokeWidth={1.9} />
                {views.format(e.views)}
              </span>
              <span className="text-right">
                <Amount cents={e.earnedCents} size="sm" className="text-green-700" />
              </span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
