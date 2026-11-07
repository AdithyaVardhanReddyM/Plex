"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, BadgeCheck, Check, ChevronRight, Clock, HeartHandshake, Lock, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/convex";
import { Avatar, Card, CardHeader, EmptyState, PageHeader, SectionHeading, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { StatePill } from "@/components/receipt/receipt";
import { HeldArt } from "@/components/art/empty-art";
import { cn, formatCents, relativeTime } from "@/lib/utils";
import { CauseCover, DarkMoney, GLASS, PlaceChip, RaisedBar } from "./parts";

type CauseCard = FunctionReturnType<typeof api.causes.list>[number];
type Giving = NonNullable<FunctionReturnType<typeof api.causes.myGiving>>;

export function DirectoryView() {
  const causes = useQuery(api.causes.list);
  const giving = useQuery(api.causes.myGiving);

  return (
    <div className="animate-rise">
      <PageHeader
        icon={<HeartHandshake />}
        title="Causes"
        description="Donations here buy specific, paid units of local work. A neighbor does the job, proof comes back, and only then is anyone paid."
        actions={
          <Link href="/causes/new" className={buttonVariants({ variant: "secondary" })}>
            <Plus /> Build a cause page
          </Link>
        }
      />

      {giving === undefined ? (
        <div className="mb-10 grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-[300px] w-full rounded-xl" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </div>
      ) : giving && giving.rows.length ? (
        <YourGiving giving={giving} />
      ) : giving ? (
        <Card className="mb-10">
          <EmptyState
            art={<HeldArt />}
            title="You haven't given yet"
            body="Pick a cause below. Your gift is held by PayPal until the shift's proof passes, and you get the photos."
            className="py-9"
          />
        </Card>
      ) : null}

      <SectionHeading
        title="Live causes"
        description="Each one pays local people for a specific job, after the proof passes."
        action={
          causes?.length ? (
            <span className="tabular text-[12.5px] text-muted">
              {causes.length} {causes.length === 1 ? "cause" : "causes"}
            </span>
          ) : null
        }
      />

      {causes === undefined ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CauseCardSkeleton key={i} />
          ))}
        </div>
      ) : causes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HeartHandshake />}
            title="No live causes yet"
            body="Build a cause page from what your organization already says about its work, or run pnpm seed for the demo world."
            action={
              <Link href="/causes/new" className={buttonVariants({ variant: "primary" })}>
                <Plus /> Build a cause page
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {causes.map((c) => (
            <CauseCardView key={c._id} cause={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── A cause card ─────────────────────────────────────────────────────────────

function CauseCardView({ cause: c }: { cause: CauseCard }) {
  const pct = c.goalCents ? Math.min(100, Math.round((c.raisedCents / c.goalCents) * 100)) : 0;
  return (
    <Link
      href={`/causes/${c.slug}`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200"
    >
      <Card className="flex h-full flex-col overflow-hidden rounded-xl transition-[box-shadow,transform] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-hover">
        <CauseCover hue={c.coverHue} className="h-[150px]">
          <PlaceChip label={c.locationLabel} className="absolute bottom-3 left-3" />
          <span className="tabular absolute top-3 right-3 rounded-full bg-ink px-2.5 py-1 text-[12px] font-semibold text-white shadow-[0_6px_16px_-8px_rgb(12_21_18/0.5)]">
            {pct}%
          </span>
        </CauseCover>

        <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
          <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted">
            <Avatar name={c.org.name} color={c.org.avatarColor} size={20} square />
            <span className="truncate font-medium text-ink-2">{c.org.name}</span>
          </div>
          <div className="mt-2.5 font-display text-[18px] leading-snug font-bold tracking-[-0.02em] text-ink">{c.name}</div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{c.tagline}</p>

          <div className="mt-auto pt-6">
            <div className="flex items-end justify-between gap-3">
              <span className="tabular font-display text-[34px] leading-none font-extrabold tracking-[-0.045em] text-ink">
                {formatCents(c.raisedCents)}
              </span>
              <span className="tabular pb-0.5 text-[12.5px] text-muted">of {formatCents(c.goalCents)}</span>
            </div>
            <RaisedBar raisedCents={c.raisedCents} goalCents={c.goalCents} className="mt-3" thin />
            <div className="mt-5 grid grid-cols-3 gap-x-6">
              <Fig value={c.workersPaidCount} label="people paid" />
              <Fig value={c.donorsCount} label="donors" />
              <Fig value={c.openSpots} label="open spots" />
            </div>
          </div>

          {c.unit ? (
            <div className="mt-5 flex items-center gap-3 rounded-[12px] bg-canvas/80 px-3.5 py-3 transition-colors group-hover:bg-green-50">
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                <span className="tabular font-semibold text-ink">{formatCents(c.unit.cents)}</span> {c.unit.label}
              </span>
              <ArrowRight
                className="size-[18px] flex-none text-muted transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-ink"
                strokeWidth={1.9}
              />
            </div>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

function Fig({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0">
      <div className="tabular font-display text-[20px] leading-none font-bold tracking-[-0.03em] text-ink">{value}</div>
      <div className="mt-1.5 truncate text-[12px] text-muted">{label}</div>
    </div>
  );
}

function CauseCardSkeleton() {
  return (
    <Card className="overflow-hidden rounded-xl">
      <Skeleton className="h-[150px] w-full rounded-none" />
      <div className="px-5 pt-4 pb-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-5 w-56" />
        <Skeleton className="mt-2 h-3.5 w-full" />
        <Skeleton className="mt-1.5 h-3.5 w-3/4" />
        <Skeleton className="mt-7 h-8 w-32" />
        <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
        <div className="mt-5 grid grid-cols-3 gap-6">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
        <Skeleton className="mt-5 h-11 w-full rounded-[12px]" />
      </div>
    </Card>
  );
}

// ── You've given ────────────────────────────────────────────────────────────

function YourGiving({ giving }: { giving: Giving }) {
  const heldRows = giving.rows.filter((r) => r.state === "held");
  const releasedCents = Math.max(0, giving.totalCents - giving.heldCents);
  const releasedPct = giving.totalCents ? (releasedCents / giving.totalCents) * 100 : 0;
  const gifts = giving.rows.length;
  const reels = giving.rows.filter((r) => r.taskDone).length;

  return (
    <div className="mb-10 space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Spotlight: what you've given, lit */}
        <div className="@container spotlight flex min-h-[300px] flex-col rounded-xl p-6 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-white/60">
              <HeartHandshake className="size-4 text-green-300" strokeWidth={1.9} />
              You&apos;ve given
            </div>
            <span className={cn(GLASS, "text-[11.5px] text-white/60")}>All time</span>
          </div>
          <DarkMoney cents={giving.totalCents} className="mt-4 text-[56px] leading-none @[480px]:text-[68px]" />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={cn(GLASS, "tabular")}>
              {gifts} {gifts === 1 ? "gift" : "gifts"}
            </span>
            <span className={cn(GLASS, "tabular")}>
              {giving.causes} {giving.causes === 1 ? "cause" : "causes"}
            </span>
            <span className="tabular flex items-center gap-1 rounded-full bg-green-300/15 px-2.5 py-1 text-[12px] font-medium text-green-200 shadow-[inset_0_0_0_1px_rgb(110_243_214/0.25)]">
              <Check className="size-3" strokeWidth={2.6} />
              {reels} Proof {reels === 1 ? "Reel" : "Reels"} ready
            </span>
          </div>

          <div className="mt-auto pt-8">
            <div className="flex h-2.5 w-full gap-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
              {releasedCents ? (
                <div
                  className="h-full rounded-full shadow-[0_0_18px_rgb(62_224_216/0.55)]"
                  style={{ width: `${releasedPct}%`, backgroundImage: "var(--meter-brand)" }}
                />
              ) : null}
              {giving.heldCents ? (
                <div className="h-full flex-1 rounded-full" style={{ backgroundImage: "var(--meter-steel)" }} />
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-8">
              <div>
                <div className="text-[12px] font-medium text-green-300">Reached the work</div>
                <div className="tabular mt-1 font-display text-[22px] leading-none font-bold tracking-[-0.03em] text-white">
                  {formatCents(releasedCents)}
                </div>
              </div>
              <div>
                <div className="text-[12px] font-medium text-steel-200">Held until proof</div>
                <div className="tabular mt-1 font-display text-[22px] leading-none font-bold tracking-[-0.03em] text-white">
                  {formatCents(giving.heldCents)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Held: a brushed-metal card */}
        <div className="metal-card flex min-h-[220px] flex-col justify-between rounded-xl p-6 sm:p-7">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-steel-800">
            <Lock className="size-4" strokeWidth={2} />
            Held until proof passes
          </div>
          <div>
            <span className="tabular font-display text-[48px] leading-none font-extrabold tracking-[-0.045em] text-steel-900">
              {formatCents(giving.heldCents)}
            </span>
            <div className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-steel-800">
              <Clock className="size-3.5" strokeWidth={2} />
              {heldRows.length
                ? `${heldRows.length} ${heldRows.length === 1 ? "shift" : "shifts"} waiting on proof`
                : "Nothing waiting on proof"}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-steel-800/75">
              PayPal holds it. The workers are paid when their photos pass, and it comes back to you if they don&apos;t.
            </p>
          </div>
        </div>
      </div>

      {/* The gifts */}
      <Card>
        <CardHeader title="Your gifts" description="Open one for its Proof Reel: the photos, the checks and who was paid." />
        <ul className="px-2 pt-2 pb-2">
          {giving.rows.slice(0, 5).map((r) => {
            const held = r.state === "held";
            const Icon = held ? Lock : r.taskDone ? BadgeCheck : HeartHandshake;
            return (
              <li key={r._id}>
                <Link
                  href={`/c/${r.causeSlug}/reel/${r._id}`}
                  className="group grid grid-cols-[20px_minmax(0,1fr)_auto_16px] items-center gap-4 rounded-[12px] px-4 py-3 transition-colors hover:bg-sunken/70"
                >
                  <Icon className={cn("size-5", held ? "text-steel-600" : "text-green-700")} strokeWidth={1.9} />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-ink">{r.taskTitle ?? r.causeName}</div>
                    <div className="mt-0.5 truncate text-[12px] text-muted">
                      {r.taskDone ? "Proof passed · Proof Reel ready" : r.taskTitle ? r.causeName : "Given to the cause"} ·{" "}
                      {relativeTime(r.at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {r.state ? <StatePill state={r.state} className="hidden sm:inline-flex" /> : null}
                    <Amount cents={r.amountCents} size="md" className="w-16 justify-end" />
                  </div>
                  <ChevronRight
                    className="size-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2"
                    strokeWidth={1.9}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
