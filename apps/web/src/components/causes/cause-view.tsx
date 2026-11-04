"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useState } from "react";
import { ArrowUpRight, BadgeCheck, CalendarDays, Camera, HeartHandshake, Link2, Lock, Repeat } from "lucide-react";
import { api, type Id } from "@/lib/convex";
import { Avatar, Badge, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { Button } from "@/components/ui/button";
import { cn, formatCents, relativeTime } from "@/lib/utils";
import { DonatePanel, type CausePage } from "./donate-panel";
import { CampaignBoard } from "./campaign-board";
import { CauseCover, LocationMap, PlaceChip, RaisedBar, SectionTitle, SpotPips, Stat, Story, windowLabel } from "./parts";

export function CauseView({
  slug,
  variant,
  cancelled,
}: {
  slug: string;
  variant: "app" | "public";
  cancelled?: boolean;
}) {
  const data = useQuery(api.causes.bySlug, { slug });
  const [taskId, setTaskId] = useState<Id<"tasks"> | null>(null);

  if (data === undefined) return <CauseSkeleton />;
  if (data === null)
    return (
      <Card>
        <EmptyState
          icon={<HeartHandshake />}
          title="No cause here"
          body="This link doesn't match a live cause. It may have been renamed or closed."
        />
      </Card>
    );

  const fundShift = (id: Id<"tasks">) => {
    setTaskId(id);
    document.getElementById("donate")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="animate-rise">
      <title>{`${data.cause.name} · Plex`}</title>
      <Header data={data} variant={variant} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Raised data={data} />
        </div>

        <aside id="donate" className={cn("scroll-mt-20 lg:sticky lg:col-start-2", variant === "public" ? "lg:top-20" : "lg:top-6", " lg:row-span-2 lg:row-start-1 lg:self-start")}>
          <DonatePanel data={data} selectedTaskId={taskId} onSelectTask={setTaskId} cancelled={cancelled} />
          <OrgNote data={data} />
        </aside>

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
          <section>
            <SectionTitle title="The story" aside={`From ${data.org.name}`} />
            <Story text={data.cause.story} />
          </section>

          <Tasks data={data} onFund={fundShift} />
          <PeoplePaid data={data} />
          <Feed data={data} />

          <section>
            <SectionTitle title="Where the work happens" />
            <LocationMap label={data.cause.location.label} lat={data.cause.location.lat} lng={data.cause.location.lng} />
          </section>

          {data.campaign ? <CampaignBoard causeId={data.cause._id} /> : null}
        </div>
      </div>
    </div>
  );
}

function Header({ data, variant }: { data: CausePage; variant: "app" | "public" }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}/c/${data.cause.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.open(url, "_blank");
    }
  };
  return (
    <header>
      <CauseCover hue={data.cause.coverHue} className="h-36 rounded-lg ring-1 ring-black/5 sm:h-44">
        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
          <PlaceChip label={data.cause.location.label} />
          {variant === "app" ? (
            <Button variant="secondary" size="sm" onClick={share} className="bg-surface/90 backdrop-blur">
              <Link2 /> {copied ? "Link copied" : "Share page"}
            </Button>
          ) : null}
        </div>
      </CauseCover>
      <div className="mt-5 flex items-center gap-2.5">
        <Avatar name={data.org.name} color={data.org.avatarColor} size={26} />
        <span className="text-[13.5px] font-medium text-ink-2">{data.org.name}</span>
        {data.org.area ? <span className="text-[13px] text-faint">· {data.org.area}</span> : null}
      </div>
      <h1 className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] text-ink sm:text-[32px]">
        {data.cause.name}
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{data.cause.tagline}</p>
    </header>
  );
}

function Raised({ data }: { data: CausePage }) {
  const open = data.tasks.filter((t) => t.open);
  return (
    <Card className="p-5 sm:p-6">
      <div className="text-[13px] font-medium text-muted">Raised</div>
      <div className="mt-2 flex items-baseline gap-2">
        <Amount cents={data.cause.raisedCents} size="xl" />
        <span className="tabular text-[14px] text-muted">of {formatCents(data.cause.goalCents)}</span>
      </div>
      <RaisedBar raisedCents={data.cause.raisedCents} goalCents={data.cause.goalCents} className="mt-5" />
      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
        <Stat value={data.cause.workersPaidCount} label="people paid" />
        <Stat value={data.cause.donorsCount} label="donors" />
        <Stat value={open.reduce((s, t) => s + (t.spots - t.filled), 0)} label="open spots" />
      </div>
    </Card>
  );
}

function OrgNote({ data }: { data: CausePage }) {
  return (
    <div className="mt-4 px-1 text-[12.5px] leading-relaxed text-muted">
      <span className="font-medium text-ink-2">{data.org.name}</span> {data.org.bio ? `· ${data.org.bio}` : ""} Workers are
      paid through PayPal Payouts, only after their proof passes.
    </div>
  );
}

function Tasks({ data, onFund }: { data: CausePage; onFund: (id: Id<"tasks">) => void }) {
  if (!data.tasks.length) return null;
  return (
    <section>
      <SectionTitle title="Impact tasks" aside="Paid local work, checked by proof" />
      <div className="space-y-3">
        {/* Open shifts first (soonest first), then finished ones, newest first. */}
        {[...data.tasks]
          .sort((a, b) => (a.done === b.done ? (a.done ? b.windowStart - a.windowStart : a.windowStart - b.windowStart) : a.done ? 1 : -1))
          .map((t) => {
          const fullyFunded = t.fundedCents >= t.costCents;
          const fundable = t.open && !fullyFunded && ["open", "assigned"].includes(t.status);
          return (
            <Card key={t._id} className={cn("p-4 sm:p-5", t.done && "bg-canvas/60")}>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{t.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-3.5 text-faint" strokeWidth={1.9} />
                      {windowLabel(t.windowStart, t.windowEnd)}
                    </span>
                    {t.location ? <span>{t.location.label}</span> : null}
                  </div>
                </div>
                {t.done ? (
                  <Badge tone="green">
                    <BadgeCheck /> Done · proof passed
                  </Badge>
                ) : fullyFunded ? (
                  <Badge tone="steel">
                    <Lock /> Fully funded
                  </Badge>
                ) : (
                  <Badge tone="outline">Open</Badge>
                )}
              </div>
              <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">{t.description}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="grid grid-cols-2 gap-4 sm:max-w-md">
                  <div>
                    <div className="flex items-center gap-2">
                      <SpotPips spots={t.spots} filled={t.filled} />
                    </div>
                    <div className="mt-1.5 text-[12.5px] text-muted">
                      <span className="tabular font-medium text-ink-2">
                        {t.filled} of {t.spots}
                      </span>{" "}
                      {t.done ? "people paid" : "spots taken"} · {formatCents(t.perSpotCents)} each
                    </div>
                  </div>
                  {t.done ? (
                    <div className="self-end text-[12.5px] text-muted">
                      <span className="tabular font-medium text-ink-2">{formatCents(t.filled * t.perSpotCents)}</span> paid
                      through PayPal Payouts
                    </div>
                  ) : (
                    <div>
                      <RaisedBar raisedCents={t.fundedCents} goalCents={t.costCents} thin className="mt-0.5" />
                      <div className="mt-1.5 text-[12.5px] text-muted">
                        <span className="tabular font-medium text-ink-2">{formatCents(t.fundedCents)}</span> of{" "}
                        {formatCents(t.costCents)} funded
                      </div>
                    </div>
                  )}
                </div>
                {fundable ? (
                  <Button variant="brand" size="sm" onClick={() => onFund(t._id)}>
                    Fund a shift · {formatCents(t.perSpotCents)}
                  </Button>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-[12px] text-muted">
                <Camera className="size-3.5 text-faint" strokeWidth={1.9} />
                Proof: {t.proofLabels.join(", ").toLowerCase()} photos
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function PeoplePaid({ data }: { data: CausePage }) {
  if (!data.workers.length) return null;
  return (
    <section>
      <SectionTitle title="People paid" aside={`${data.cause.workersPaidCount} since the first shift`} />
      <Card className="divide-y divide-line">
        {data.workers.slice(0, 6).map((w) => (
          <div key={w.receiptId} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
            <Avatar name={w.firstName} color={w.avatarColor} size={32} />
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-ink">{w.firstName}</div>
              <div className="truncate text-[12.5px] text-muted">
                {w.taskTitle} · {relativeTime(w.at)}
              </div>
            </div>
            <div className="text-right">
              <Amount cents={w.amountCents} size="sm" className="text-green-700" />
              <div className="text-[11.5px] text-faint">PayPal Payouts</div>
            </div>
          </div>
        ))}
      </Card>
    </section>
  );
}

function Feed({ data }: { data: CausePage }) {
  if (!data.feed.length) return null;
  return (
    <section>
      <SectionTitle title="Recent donations" aside={`${data.cause.donorsCount} donors`} />
      <Card className="divide-y divide-line">
        {data.feed.slice(0, 8).map((d) => (
          <div key={d._id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
            <Avatar name={d.donorLabel === "Anonymous" ? "?" : d.donorLabel} color="var(--color-steel-400)" size={32} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium text-ink">{d.donorLabel}</span>
                {d.recurring ? (
                  <Badge tone="outline">
                    <Repeat /> Monthly
                  </Badge>
                ) : null}
                {d.source === "saved_for_good" ? <Badge tone="green">Saved for good</Badge> : null}
              </div>
              <div className="truncate text-[12.5px] text-muted">
                {d.message ? `“${d.message}”` : d.taskTitle ? `Funded ${d.taskTitle}` : "To the cause"} · {relativeTime(d.at)}
              </div>
            </div>
            <Amount cents={d.amountCents} size="sm" />
          </div>
        ))}
      </Card>
    </section>
  );
}

function CauseSkeleton() {
  return (
    <div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="mt-6 h-8 w-80 max-w-full" />
      <Skeleton className="mt-3 h-4 w-[28rem] max-w-full" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}

export function PublicFooterLinks() {
  return (
    <Link href="/causes" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
      All causes <ArrowUpRight className="size-3.5" strokeWidth={1.9} />
    </Link>
  );
}

