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
} from "lucide-react";
import { api, type Id } from "@/lib/convex";
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { Button } from "@/components/ui/button";
import { cn, formatCents, relativeTime } from "@/lib/utils";
import { DonatePanel, type CausePage } from "./donate-panel";
import { CampaignBoard } from "./campaign-board";
import {
  CauseCover,
  DarkMoney,
  DateTile,
  FACE,
  GLASS,
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
      <CauseCover hue={data.cause.coverHue} className="h-44 rounded-xl shadow-card sm:h-56">
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {variant === "app" ? (
            <>
              <Link
                href={`/c/${data.cause.slug}`}
                target="_blank"
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/80 px-3 text-[13px] font-medium text-ink-2 shadow-[0_6px_16px_-8px_rgb(12_21_18/0.3)] backdrop-blur transition-colors hover:bg-white hover:text-ink"
              >
                Public page <ArrowUpRight className="size-3.5" strokeWidth={1.9} />
              </Link>
              <Button variant="secondary" size="sm" onClick={share} className="bg-white/80 backdrop-blur">
                <Link2 /> {copied ? "Link copied" : "Share"}
              </Button>
            </>
          ) : null}
        </div>
        <PlaceChip label={data.cause.location.label} className="absolute right-4 bottom-4" />
      </CauseCover>

      <div className="relative px-1 sm:px-6">
        <div className="-mt-9 inline-flex rounded-[20px] bg-panel p-1 shadow-raised">
          <Avatar name={data.org.name} color={data.org.avatarColor} size={60} square />
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
        <h1 className="mt-1.5 max-w-3xl font-display text-[32px] leading-[1.08] font-extrabold tracking-[-0.035em] text-ink sm:text-[40px]">
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
  const spots = open.reduce((s, t) => s + (t.spots - t.filled), 0);
  const figs: Array<[number, string]> = [
    [data.cause.workersPaidCount, "people paid"],
    [data.cause.donorsCount, "donors"],
    [spots, "open spots"],
  ];
  return (
    <div className="@container spotlight rounded-xl p-6 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] font-medium text-white/60">
          <HeartHandshake className="size-4 text-green-300" strokeWidth={1.9} />
          Raised so far
        </div>
        <span className="tabular flex items-center gap-1 rounded-full bg-green-300/15 px-2.5 py-1 text-[12px] font-medium text-green-200 shadow-[inset_0_0_0_1px_rgb(110_243_214/0.25)]">
          {pct}% funded
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
        <DarkMoney cents={data.cause.raisedCents} className="text-[52px] leading-none @[520px]:text-[64px]" />
        <span className="tabular pb-1.5 text-[14px] text-white/55">of {formatCents(data.cause.goalCents)} goal</span>
      </div>
      <RaisedBar raisedCents={data.cause.raisedCents} goalCents={data.cause.goalCents} onDark className="mt-6" />
      <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-4">
        {figs.map(([n, label]) => (
          <div key={label}>
            <div className="tabular font-display text-[28px] leading-none font-bold tracking-[-0.035em] text-white">{n}</div>
            <div className="mt-1.5 text-[12.5px] text-white/55">{label}</div>
          </div>
        ))}
        <span className={cn(GLASS, "ml-auto hidden @[520px]:inline-flex")}>Paid only after proof passes</span>
      </div>
    </div>
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
      <div className={cn("grid gap-4 sm:grid-cols-2", tiles >= 3 && "xl:grid-cols-3")}>
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
                  "group relative flex min-h-[176px] min-w-0 flex-col overflow-hidden rounded-xl p-5 text-left transition-[box-shadow,transform,opacity] duration-200",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200",
                  on ? FACE.aqua : FACE.mint,
                  on ? "-translate-y-1 shadow-hover" : "shadow-card hover:-translate-y-0.5 hover:shadow-hover",
                )}
              >
                <span className="pointer-events-none absolute -right-8 -bottom-10 size-32 rounded-full border-[16px] border-white/40" aria-hidden />
                <div className="relative flex items-start justify-between gap-3">
                  <span className="tabular font-display text-[34px] leading-none font-extrabold tracking-[-0.045em] text-ink">
                    {formatCents(t.perSpotCents)}
                  </span>
                  {on ? (
                    <span className="rounded-full bg-ink px-2.5 py-1 text-[11.5px] font-semibold text-white">Selected</span>
                  ) : (
                    <ArrowRight
                      className="size-[18px] flex-none text-ink-2/60 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-ink"
                      strokeWidth={1.9}
                    />
                  )}
                </div>
                <div className="relative mt-2 text-[12.5px] text-ink-2/75">pays one person for</div>
                <div className="relative mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug text-ink">{t.title}</div>
                <div className="relative mt-auto flex items-center justify-between gap-2 pt-4 text-[12px] font-medium text-ink-2/80">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Clock className="size-3.5 flex-none" strokeWidth={1.9} />
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
            className={cn(
              "group relative flex min-h-[176px] min-w-0 flex-col overflow-hidden rounded-xl p-5 text-left shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200",
              FACE.steel,
            )}
          >
            <span className="pointer-events-none absolute -right-8 -bottom-10 size-32 rounded-full border-[16px] border-white/45" aria-hidden />
            <div className="relative flex items-start justify-between gap-3">
              <span className="font-display text-[28px] leading-[1.1] font-extrabold tracking-[-0.04em] text-steel-900">Any amount</span>
              <ArrowRight
                className="size-[18px] flex-none text-steel-700/70 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-steel-900"
                strokeWidth={1.9}
              />
            </div>
            <div className="relative mt-2 text-[12.5px] text-steel-800/75">goes to</div>
            <div className="relative mt-0.5 text-[14px] font-semibold leading-snug text-steel-900">the next shift that needs it</div>
            <div className="relative mt-auto flex items-center gap-1.5 pt-4 text-[12px] font-medium text-steel-800/80">
              <HeartHandshake className="size-3.5 flex-none" strokeWidth={1.9} />
              Assigned by {data.org.name}
            </div>
          </button>
      </div>
    </section>
  );
}

function OrgNote({ data }: { data: CausePage }) {
  return (
    <div className="mt-4 flex gap-3 rounded-[14px] bg-sunken/60 px-4 py-3.5">
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
      <Card className="space-y-1 p-2">
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
    <div className={cn("grid grid-cols-[48px_minmax(0,1fr)] gap-x-4 rounded-[14px] p-4 transition-colors hover:bg-sunken/50", t.done && "opacity-80")}>
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
