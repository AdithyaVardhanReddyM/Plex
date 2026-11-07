"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, BadgeCheck, ChevronRight, HeartHandshake, Lock, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/convex";
import { Avatar, Card, EmptyState, IconTile, PageHeader, SectionHeading, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { StatePill } from "@/components/receipt/receipt";
import { HeldArt } from "@/components/art/empty-art";
import { cn, formatCents, relativeTime } from "@/lib/utils";
import { CauseCover, PlaceChip, RaisedBar } from "./parts";

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
        <Skeleton className="mb-8 h-[296px] w-full rounded-lg" />
      ) : giving && giving.rows.length ? (
        <YourGiving giving={giving} />
      ) : giving ? (
        <Card className="mb-8">
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
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200"
    >
      <Card className="flex h-full flex-col overflow-hidden transition-[box-shadow,border-color] duration-200 group-hover:border-line-strong group-hover:shadow-hover">
        <CauseCover hue={c.coverHue} className="h-[132px] border-b border-line/70">
          <PlaceChip label={c.locationLabel} className="absolute bottom-3 left-3" />
        </CauseCover>

        <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
          <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted">
            <Avatar name={c.org.name} color={c.org.avatarColor} size={20} square />
            <span className="truncate font-medium text-ink-2">{c.org.name}</span>
          </div>
          <div className="mt-2.5 text-[16px] font-semibold leading-snug tracking-[-0.015em] text-ink">{c.name}</div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{c.tagline}</p>

          <div className="mt-auto pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-1.5">
                <Amount cents={c.raisedCents} size="lg" />
                <span className="tabular text-[12.5px] text-muted">of {formatCents(c.goalCents)}</span>
              </div>
              <span className="tabular text-[12.5px] font-medium text-ink-2">{pct}%</span>
            </div>
            <RaisedBar raisedCents={c.raisedCents} goalCents={c.goalCents} className="mt-2.5" thin />
            <div className="mt-3.5 grid grid-cols-3 gap-3 text-[12px]">
              <Fig value={c.workersPaidCount} label="people paid" />
              <Fig value={c.donorsCount} label="donors" />
              <Fig value={c.openSpots} label="open spots" />
            </div>
          </div>
        </div>

        {c.unit ? (
          <div className="flex items-center gap-3 border-t border-line bg-canvas/60 px-5 py-3 transition-colors group-hover:bg-green-50/60">
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
              <span className="tabular font-semibold text-ink">{formatCents(c.unit.cents)}</span> {c.unit.label}
            </span>
            <span className="flex size-6 flex-none items-center justify-center rounded-full bg-surface text-muted ring-1 ring-inset ring-line transition-[background-color,color,box-shadow] group-hover:bg-green-300 group-hover:text-ink group-hover:ring-green-400/40">
              <ArrowRight className="size-3.5" strokeWidth={2} />
            </span>
          </div>
        ) : null}
      </Card>
    </Link>
  );
}

function Fig({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0">
      <div className="tabular text-[13.5px] font-semibold text-ink">{value}</div>
      <div className="truncate text-muted">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 border-l border-line pl-3">
      <div className="tabular font-display text-[20px] leading-none font-bold tracking-[-0.02em] text-ink">{value}</div>
      <div className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-muted sm:truncate">{label}</div>
    </div>
  );
}

function CauseCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-[132px] w-full rounded-none" />
      <div className="px-5 pt-4 pb-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-5 w-56" />
        <Skeleton className="mt-2 h-3.5 w-full" />
        <Skeleton className="mt-1.5 h-3.5 w-3/4" />
        <Skeleton className="mt-6 h-6 w-28" />
        <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      </div>
      <div className="border-t border-line px-5 py-3.5">
        <Skeleton className="h-4 w-2/3" />
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
    <Card className="@container mb-8 overflow-hidden">
      <div className="grid @[680px]:grid-cols-[minmax(0,1fr)_280px]">
        {/* Given and released */}
        <div className="flex flex-col p-5 @[680px]:p-6">
          <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
            <HeartHandshake className="size-4 text-faint" strokeWidth={1.9} />
            You&apos;ve given
          </div>
          <div className="mt-3">
            <Amount cents={giving.totalCents} size="xl" />
          </div>

          <div className="mt-5">
            <div className="flex h-2 w-full gap-[3px] overflow-hidden rounded-full bg-sunken" aria-hidden>
              {releasedCents ? (
                <div className="h-full rounded-full" style={{ width: `${releasedPct}%`, backgroundImage: "var(--meter-brand)" }} />
              ) : null}
              {giving.heldCents ? (
                <div className="h-full flex-1 rounded-full" style={{ backgroundImage: "var(--meter-steel)" }} />
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px]">
              <span className="inline-flex items-center gap-2 text-muted">
                <span className="size-2 rounded-full bg-green-400" />
                Reached the work
                <span className="tabular font-semibold text-ink">{formatCents(releasedCents)}</span>
              </span>
              <span className="inline-flex items-center gap-2 text-muted">
                <span className="size-2 rounded-full bg-steel-400" />
                Held until proof
                <span className="tabular font-semibold text-ink">{formatCents(giving.heldCents)}</span>
              </span>
            </div>
          </div>

          <div className="mt-auto grid grid-cols-3 gap-4 pt-6">
            <MiniStat label={gifts === 1 ? "Gift" : "Gifts"} value={gifts} />
            <MiniStat label={giving.causes === 1 ? "Cause" : "Causes"} value={giving.causes} />
            <MiniStat label="Proof Reels ready" value={reels} />
          </div>
        </div>

        {/* Held: the steel, foil-edged side */}
        <div className="relative flex flex-col justify-between gap-5 border-t border-line bg-gradient-to-b from-steel-50 to-surface p-5 @[680px]:border-t-0 @[680px]:border-l @[680px]:p-6">
          <div
            className="absolute inset-x-0 top-0 h-1 @[680px]:inset-y-0 @[680px]:right-auto @[680px]:h-auto @[680px]:w-1"
            style={{ background: "var(--metal)" }}
            aria-hidden
          />
          <div>
            <div className="flex items-center gap-2 text-[13px] font-medium text-steel-700">
              <Lock className="size-4" strokeWidth={1.9} />
              Held until proof passes
            </div>
            <Amount cents={giving.heldCents} size="lg" className="mt-3 text-[30px] text-steel-900" />
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-steel-600">
              PayPal holds it. The workers are paid when their photos pass, and it comes back to you if they don&apos;t.
            </p>
          </div>
          <div className="tabular text-[12.5px] font-medium text-steel-700">
            {heldRows.length ? `${heldRows.length} ${heldRows.length === 1 ? "shift" : "shifts"} waiting on proof` : "Nothing waiting on proof"}
          </div>
        </div>
      </div>

      {/* The gifts */}
      <div className="border-t border-line">
        <div className="flex items-center justify-between px-5 pt-3.5 pb-1.5">
          <div className="text-[13px] font-semibold text-ink">Your gifts</div>
          <div className="text-[12px] text-faint">Open one for its Proof Reel</div>
        </div>
        <ul className="px-2 pb-2">
          {giving.rows.slice(0, 5).map((r) => {
            const held = r.state === "held";
            return (
              <li key={r._id}>
                <Link
                  href={`/c/${r.causeSlug}/reel/${r._id}`}
                  className="group grid grid-cols-[34px_minmax(0,1fr)_auto_16px] items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-sunken/70"
                >
                  <IconTile tone={held ? "steel" : "mint"} size="md" className="size-[34px]">
                    {held ? <Lock /> : r.taskDone ? <BadgeCheck /> : <HeartHandshake />}
                  </IconTile>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-ink">{r.taskTitle ?? r.causeName}</div>
                    <div className="truncate text-[12px] text-muted">
                      {r.taskDone ? "Proof passed · Proof Reel ready" : r.taskTitle ? r.causeName : "Given to the cause"} ·{" "}
                      {relativeTime(r.at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.state ? <StatePill state={r.state} className="hidden sm:inline-flex" /> : null}
                    <Amount cents={r.amountCents} size="sm" className="w-16 justify-end" />
                  </div>
                  <ChevronRight className={cn("size-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2")} strokeWidth={1.9} />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
