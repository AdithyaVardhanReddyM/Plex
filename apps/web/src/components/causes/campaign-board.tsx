"use client";

import { useQuery } from "convex/react";
import { Eye, Megaphone } from "lucide-react";
import { api, type Id } from "@/lib/convex";
import { Avatar, Badge, Card, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { cn, formatCents } from "@/lib/utils";
import { RaisedBar, SectionTitle } from "./parts";

const views = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const COLS = "grid-cols-[22px_30px_minmax(0,1fr)_68px_88px]";

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
        <div className="grid @[620px]:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0 p-5">
            <div className="flex items-center gap-3">
              <Avatar name={c.brand.name} color={c.brand.avatarColor} size={34} square />
              <div className="min-w-0">
                <div className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{c.name}</div>
                <div className="flex items-center gap-1.5 text-[12px] text-muted">
                  <Megaphone className="size-3.5 text-faint" strokeWidth={1.9} />
                  Campaign by {c.brand.name}
                </div>
              </div>
            </div>
            <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-ink-2">{c.brief}</p>
            {rule ? (
              <div className="mt-3.5 flex flex-wrap gap-1.5">
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
          <div className="flex flex-col justify-center border-t border-line bg-canvas/50 p-5 @[620px]:border-t-0 @[620px]:border-l">
            <div className="text-[12.5px] font-medium text-muted">Earned by creators</div>
            <Amount cents={c.totalEarnedCents} size="lg" className="mt-1.5" />
            <RaisedBar raisedCents={c.totalEarnedCents} goalCents={c.budgetCents} thin className="mt-3" />
            <div className="tabular mt-2 text-[12px] text-muted">
              of {formatCents(c.budgetCents)} budget · <span className="text-green-700">{formatCents(c.totalPaidCents)} paid out</span>
            </div>
          </div>
        </div>

        <div className="border-t border-line">
          <div className={cn("grid items-center gap-3 bg-canvas/60 px-5 py-2 text-[11.5px] font-medium text-faint", COLS)}>
            <span>#</span>
            <span />
            <span>Creator</span>
            <span className="text-right">Views</span>
            <span className="text-right">Earned</span>
          </div>
          {c.board.length ? (
            <div className="px-2 py-1.5">
              {c.board.map((e, i) => (
                <div key={e._id} className={cn("grid items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-sunken/70", COLS)}>
                  <span className={cn("tabular text-[12.5px] font-semibold", i === 0 ? "text-green-700" : "text-faint")}>{i + 1}</span>
                  <Avatar name={e.firstName} color={e.avatarColor} size={30} />
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
              ))}
            </div>
          ) : (
            <div className="px-5 py-6 text-center text-[13px] text-muted">No creators have posted yet.</div>
          )}
        </div>
      </Card>
    </section>
  );
}
