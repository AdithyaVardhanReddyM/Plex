"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Camera,
  Clock,
  HeartHandshake,
  Link2,
  Lock,
  MapPin,
  Repeat,
  Users,
} from "lucide-react";
import { api, type Id } from "@/lib/convex";
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton, Stat } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { Button } from "@/components/ui/button";
import { cn, formatCents, relativeTime } from "@/lib/utils";
import { DonatePanel, type CausePage } from "./donate-panel";
import { CampaignBoard } from "./campaign-board";
import {
  CauseCover,
  DateTile,
  LocationMap,
  PlaceChip,
  RaisedBar,
  SectionTitle,
  SpotPips,
  Story,
  shortWindow,
  windowLabel,
} from "./parts";

type CauseTask = CausePage["tasks"][number];

const isFundable = (t: CauseTask) => t.open && t.fundedCents < t.costCents && ["open", "assigned"].includes(t.status);

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
  const [onceAsk, setOnceAsk] = useState(0);

  if (data === undefined) return <CauseSkeleton />;
  if (data === null)
    return (
      <Card>
        <EmptyState
          icon={<HeartHandshake />}
          title="No cause here"
          body="This link doesn't match a live cause. It may have been renamed or closed."
          action={
            <Link href="/causes" className="text-[13px] font-medium text-green-700 hover:text-green-800">
              See all causes
            </Link>
          }
        />
      </Card>
    );

  const fundShift = (id: Id<"tasks">) => {
    setTaskId(id);
    document.getElementById("donate")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const giveOnce = () => {
    setTaskId(null);
    setOnceAsk((n) => n + 1);
    document.getElementById("donate")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="animate-rise">
      <title>{`${data.cause.name} · Plex`}</title>
      <Header data={data} variant={variant} />

      <div className="mt-8 grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Raised data={data} />
        </div>

        <aside id="donate" className="scroll-mt-20 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <DonatePanel data={data} selectedTaskId={taskId} onSelectTask={setTaskId} onceRequest={onceAsk} cancelled={cancelled} />
          <OrgNote data={data} />
        </aside>

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
          <Buys data={data} selectedTaskId={taskId} onFund={fundShift} onGiveOnce={giveOnce} />

          <section>
            <SectionTitle title="The story" aside={`From ${data.org.name}`} />
            <Story text={data.cause.story} />
          </section>

          <Tasks data={data} onFund={fundShift} />

          {data.workers.length || data.feed.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <PeoplePaid data={data} />
              <Feed data={data} />
            </div>
          ) : null}

          <section>
            <SectionTitle title="Where the work happens" description="Proof photos are checked against this place and the shift's hours." />
            <LocationMap label={data.cause.location.label} lat={data.cause.location.lat} lng={data.cause.location.lng} />
          </section>

          {data.campaign ? <CampaignBoard causeId={data.cause._id} /> : null}
        </div>
      </div>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

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
      <CauseCover hue={data.cause.coverHue} className="h-40 rounded-lg border border-line/70 sm:h-48">
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {variant === "app" ? (
            <>
              <Link
                href={`/c/${data.cause.slug}`}
                target="_blank"
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface/90 px-3 text-[13px] font-medium text-ink-2 shadow-card ring-1 ring-inset ring-line/70 backdrop-blur transition-colors hover:text-ink"
              >
                Public page <ArrowUpRight className="size-3.5" strokeWidth={1.9} />
              </Link>
              <Button variant="secondary" size="sm" onClick={share} className="bg-surface/90 backdrop-blur">
                <Link2 /> {copied ? "Link copied" : "Share"}
              </Button>
            </>
          ) : null}
        </div>
        <PlaceChip label={data.cause.location.label} className="absolute right-4 bottom-4" />
      </CauseCover>

      <div className="relative px-1 sm:px-6">
        <div className="-mt-8 inline-flex rounded-[16px] bg-panel p-1 shadow-raised">
          <Avatar name={data.org.name} color={data.org.avatarColor} size={56} square />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span className="font-medium text-ink-2">{data.org.name}</span>
          {data.org.area ? (
            <>
              <span className="text-faint">·</span>
              <span className="inline-flex items-center gap-1 text-muted">
                <MapPin className="size-3.5 text-faint" strokeWidth={1.9} />
                {data.org.area}
              </span>
            </>
          ) : null}
        </div>
        <h1 className="mt-1.5 max-w-3xl font-display text-[30px] leading-[1.12] font-bold tracking-[-0.03em] text-ink sm:text-[34px]">
          {data.cause.name}
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-pretty text-muted">{data.cause.tagline}</p>
      </div>
    </header>
  );
}

// ── Raised ───────────────────────────────────────────────────────────────────

function Raised({ data }: { data: CausePage }) {
  const open = data.tasks.filter((t) => t.open);
  const pct = data.cause.goalCents ? Math.min(100, Math.round((data.cause.raisedCents / data.cause.goalCents) * 100)) : 0;
  const fig = (n: number) => <span className="tabular font-display text-[22px] leading-none font-bold tracking-[-0.025em] text-ink">{n}</span>;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <div className="text-[13px] font-medium text-muted">Raised so far</div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5">
            <Amount cents={data.cause.raisedCents} size="xl" />
            <span className="tabular text-[14px] text-muted">of {formatCents(data.cause.goalCents)} goal</span>
          </div>
        </div>
        <Badge tone="green" className="tabular mb-1">
          {pct}% funded
        </Badge>
      </div>
      <RaisedBar raisedCents={data.cause.raisedCents} goalCents={data.cause.goalCents} className="mt-5" />
      <div className="mt-5 grid grid-cols-3 divide-x divide-line border-t border-line pt-4">
        <Stat label="People paid" icon={<BadgeCheck />} value={fig(data.cause.workersPaidCount)} className="pr-4" />
        <Stat label="Donors" icon={<HeartHandshake />} value={fig(data.cause.donorsCount)} className="px-4" />
        <Stat
          label="Open spots"
          icon={<Users />}
          value={fig(open.reduce((s, t) => s + (t.spots - t.filled), 0))}
          className="pl-4"
        />
      </div>
    </Card>
  );
}

// ── What your money buys ─────────────────────────────────────────────────────

function Buys({
  data,
  selectedTaskId,
  onFund,
  onGiveOnce,
}: {
  data: CausePage;
  selectedTaskId: Id<"tasks"> | null;
  onFund: (id: Id<"tasks">) => void;
  onGiveOnce: () => void;
}) {
  const fundable = data.tasks.filter(isFundable).sort((a, b) => a.windowStart - b.windowStart).slice(0, 5);
  const selected = selectedTaskId;
  const tiles = fundable.length + 1;

  return (
    <section>
      <SectionTitle
        title="What your money buys"
        description={
          data.unit ? (
            <>
              <span className="tabular font-medium text-ink-2">{formatCents(data.unit.cents)}</span> {data.unit.label}.
            </>
          ) : undefined
        }
        aside={fundable.length ? "Pick one to fund it" : "Every open shift is funded"}
      />
      <div className={cn("grid gap-3 sm:grid-cols-2", tiles >= 3 && "xl:grid-cols-3")}>
          {fundable.map((t) => {
            const on = t._id === selected;
            const left = t.spots - t.filled;
            return (
              <button
                key={t._id}
                type="button"
                onClick={() => onFund(t._id)}
                aria-pressed={on}
                className={cn(
                  "group flex min-w-0 flex-col rounded-[12px] border bg-surface p-4 text-left shadow-card transition-[border-color,box-shadow,background-color] duration-150",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200",
                  on ? "border-green-400/70 bg-green-50/40 shadow-raised" : "border-line hover:border-line-strong hover:shadow-hover",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <Amount cents={t.perSpotCents} size="lg" />
                  <span
                    className={cn(
                      "flex size-6 flex-none items-center justify-center rounded-full ring-1 ring-inset transition-colors",
                      on ? "bg-green-300 text-ink ring-green-400/40" : "bg-surface text-faint ring-line group-hover:text-ink-2",
                    )}
                  >
                    <ArrowRight className="size-3.5" strokeWidth={2} />
                  </span>
                </div>
                <div className="mt-1 text-[12.5px] text-muted">pays one person for</div>
                <div className="mt-0.5 line-clamp-2 text-[13.5px] font-medium leading-snug text-ink">{t.title}</div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-3.5 text-[12px] text-muted">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Clock className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
                    <span className="truncate">{shortWindow(t.windowStart, t.windowEnd)}</span>
                  </span>
                  <span className="tabular flex-none">
                    {left} {left === 1 ? "spot" : "spots"} left
                  </span>
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onGiveOnce}
            className="group flex min-w-0 flex-col rounded-[12px] border border-dashed border-line-strong bg-canvas/40 p-4 text-left transition-[border-color,background-color] duration-150 hover:border-ink/30 hover:bg-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-display text-[22px] leading-[1.25] font-bold tracking-[-0.025em] text-ink">Any amount</span>
              <span className="flex size-6 flex-none items-center justify-center rounded-full bg-surface text-faint ring-1 ring-inset ring-line transition-colors group-hover:text-ink-2">
                <ArrowRight className="size-3.5" strokeWidth={2} />
              </span>
            </div>
            <div className="mt-1 text-[12.5px] text-muted">goes to</div>
            <div className="mt-0.5 text-[13.5px] font-medium leading-snug text-ink">the next shift that needs it</div>
            <div className="mt-auto flex items-center gap-1.5 pt-3.5 text-[12px] text-muted">
              <HeartHandshake className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
              Assigned by {data.org.name}
            </div>
          </button>
      </div>
    </section>
  );
}

function OrgNote({ data }: { data: CausePage }) {
  return (
    <div className="mt-4 flex gap-3 rounded-[12px] border border-line bg-canvas/60 px-4 py-3.5">
      <Avatar name={data.org.name} color={data.org.avatarColor} size={28} square className="mt-0.5" />
      <p className="min-w-0 text-[12.5px] leading-relaxed text-muted">
        <span className="font-medium text-ink-2">{data.org.name}</span>
        {data.org.bio ? ` · ${data.org.bio}` : null} Workers are paid through PayPal Payouts, only after their proof passes.
      </p>
    </div>
  );
}

// ── Shifts ───────────────────────────────────────────────────────────────────

function Tasks({ data, onFund }: { data: CausePage; onFund: (id: Id<"tasks">) => void }) {
  if (!data.tasks.length) return null;
  const done = data.tasks.filter((t) => t.done).length;
  // Open shifts first (soonest first), then finished ones, newest first.
  const sorted = [...data.tasks].sort((a, b) =>
    a.done === b.done ? (a.done ? b.windowStart - a.windowStart : a.windowStart - b.windowStart) : a.done ? 1 : -1,
  );
  return (
    <section>
      <SectionTitle
        title="Shifts"
        description="Paid local work. Each one is checked by photo proof before anyone is paid."
        aside={<span className="tabular">{done} done · {data.tasks.length - done} open</span>}
      />
      <Card className="divide-y divide-line overflow-hidden">
        {sorted.map((t) => (
          <TaskRow key={t._id} task={t} onFund={onFund} />
        ))}
      </Card>
    </section>
  );
}

function TaskRow({ task: t, onFund }: { task: CauseTask; onFund: (id: Id<"tasks">) => void }) {
  const fullyFunded = t.fundedCents >= t.costCents;
  const fundable = isFundable(t);
  return (
    <div className={cn("grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 p-4 sm:p-5", t.done && "bg-canvas/40")}>
      <DateTile ms={t.windowStart} muted={t.done} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
          <div className="min-w-0">
            <div className={cn("text-[14.5px] font-semibold leading-snug tracking-[-0.01em]", t.done ? "text-ink-2" : "text-ink")}>
              {t.title}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
              <span>{windowLabel(t.windowStart, t.windowEnd)}</span>
              {t.location ? (
                <>
                  <span className="text-faint">·</span>
                  <span>{t.location.label}</span>
                </>
              ) : null}
            </div>
          </div>
          {t.done ? (
            <Badge tone="green">
              <BadgeCheck /> Proof passed
            </Badge>
          ) : fullyFunded ? (
            <Badge tone="steel">
              <Lock /> Fully funded
            </Badge>
          ) : (
            <Badge tone="outline">Open</Badge>
          )}
        </div>

        {t.description ? <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">{t.description}</p> : null}

        <div className="mt-4 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <SpotPips spots={t.spots} filled={t.filled} />
            <div className="tabular mt-1.5 truncate text-[12px] text-muted">
              <span className="font-medium text-ink-2">
                {t.filled} of {t.spots}
              </span>{" "}
              {t.done ? "people paid" : "spots taken"} · {formatCents(t.perSpotCents)} each
            </div>
          </div>
          {t.done ? (
            <div className="tabular min-w-0 text-[12px] text-muted">
              <span className="font-medium text-green-700">{formatCents(t.filled * t.perSpotCents)}</span> paid through PayPal
              Payouts
            </div>
          ) : (
            <div className="min-w-0">
              <RaisedBar raisedCents={t.fundedCents} goalCents={t.costCents} thin />
              <div className="tabular mt-1.5 truncate text-[12px] text-muted">
                <span className="font-medium text-ink-2">{formatCents(t.fundedCents)}</span> of {formatCents(t.costCents)} funded
              </div>
            </div>
          )}
          {fundable ? (
            <Button variant="brand" size="sm" onClick={() => onFund(t._id)} className="justify-self-start sm:justify-self-end">
              Fund a shift · {formatCents(t.perSpotCents)}
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
        </div>

        {t.proofLabels.length ? (
          <div className="mt-3.5 flex items-center gap-1.5 text-[12px] text-faint">
            <Camera className="size-3.5" strokeWidth={1.9} />
            Proof: {t.proofLabels.join(", ").toLowerCase()} photos
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── People paid and donations ───────────────────────────────────────────────

function PeoplePaid({ data }: { data: CausePage }) {
  return (
    <Card className="min-w-0">
      <CardHeader title="People paid" description={`${data.cause.workersPaidCount} since the first shift, after proof passed`} />
      <div className="px-2 pt-2 pb-2">
        {data.workers.length ? (
          data.workers.slice(0, 6).map((w) => (
            <div key={w.receiptId} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-3 py-2.5">
              <Avatar name={w.firstName} color={w.avatarColor} size={34} />
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-medium text-ink">{w.firstName}</div>
                <div className="truncate text-[12px] text-muted">
                  {w.taskTitle} · {relativeTime(w.at)}
                </div>
              </div>
              <Amount cents={w.amountCents} size="sm" sign="in" className="text-green-800" />
            </div>
          ))
        ) : (
          <EmptyState icon={<BadgeCheck />} title="No one paid yet" body="Workers show up here when their first shift's proof passes." className="py-8" />
        )}
      </div>
    </Card>
  );
}

function Feed({ data }: { data: CausePage }) {
  return (
    <Card className="min-w-0">
      <CardHeader title="Recent donations" description={`${data.cause.donorsCount} donors so far`} />
      <div className="px-2 pt-2 pb-2">
        {data.feed.length ? (
          data.feed.slice(0, 6).map((d) => (
            <div key={d._id} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-3 py-2.5">
              <Avatar name={d.donorLabel === "Anonymous" ? "?" : d.donorLabel} color="var(--color-steel-400)" size={34} />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-medium text-ink">{d.donorLabel}</span>
                  {d.recurring ? (
                    <Badge tone="outline" className="flex-none">
                      <Repeat /> Monthly
                    </Badge>
                  ) : null}
                  {d.source === "saved_for_good" ? (
                    <Badge tone="green" className="flex-none">
                      Saved for good
                    </Badge>
                  ) : null}
                </div>
                <div className="truncate text-[12px] text-muted">
                  {d.message ? `“${d.message}”` : d.taskTitle ? `Funded ${d.taskTitle}` : "To the cause"} · {relativeTime(d.at)}
                </div>
              </div>
              <Amount cents={d.amountCents} size="sm" />
            </div>
          ))
        ) : (
          <EmptyState icon={<HeartHandshake />} title="No donations yet" body="Be the first. Your gift funds a specific shift." className="py-8" />
        )}
      </div>
    </Card>
  );
}

// ── Loading ──────────────────────────────────────────────────────────────────

function CauseSkeleton() {
  return (
    <div>
      <Skeleton className="h-40 w-full rounded-lg sm:h-48" />
      <div className="px-1 sm:px-6">
        <Skeleton className="-mt-8 size-16 rounded-[16px]" />
        <Skeleton className="mt-4 h-4 w-40" />
        <Skeleton className="mt-3 h-9 w-96 max-w-full" />
        <Skeleton className="mt-3 h-4 w-[30rem] max-w-full" />
      </div>
      <div className="mt-8 grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="space-y-6">
          <Skeleton className="h-[212px] w-full rounded-lg" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-36 rounded-[12px]" />
            <Skeleton className="h-36 rounded-[12px]" />
            <Skeleton className="h-36 rounded-[12px]" />
          </div>
        </div>
        <Skeleton className="h-[560px] w-full rounded-lg" />
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
