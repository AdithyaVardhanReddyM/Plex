"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, BadgeCheck, HeartHandshake, Lock } from "lucide-react";
import { api } from "@/lib/convex";
import { Avatar, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { StatePill } from "@/components/receipt/receipt";
import { formatCents, relativeTime } from "@/lib/utils";
import { CauseCover, PlaceChip, RaisedBar } from "./parts";

export function DirectoryView() {
  const causes = useQuery(api.causes.list);
  const giving = useQuery(api.causes.myGiving);

  return (
    <div className="animate-rise">
      <PageHeader
        title="Causes"
        description="Donations here buy specific, paid units of local work. A neighbor does the job, proof comes back, and only then is anyone paid."
      />

      {giving && giving.rows.length ? <YourGiving giving={giving} /> : null}

      {causes === undefined ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : causes.length === 0 ? (
        <Card>
          <EmptyState icon={<HeartHandshake />} title="No causes yet" body="Run pnpm seed to create the demo world." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {causes.map((c) => (
            <Link
              key={c._id}
              href={`/causes/${c.slug}`}
              className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
            >
              <Card className="flex h-full flex-col overflow-hidden transition-shadow group-hover:shadow-raised">
                <CauseCover hue={c.coverHue} className="h-32">
                  <PlaceChip label={c.locationLabel} className="absolute bottom-3 left-3" />
                </CauseCover>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center gap-2 text-[13px] text-muted">
                    <Avatar name={c.org.name} color={c.org.avatarColor} size={20} />
                    {c.org.name}
                  </div>
                  <div className="mt-2 text-[17px] font-semibold leading-snug tracking-[-0.015em] text-ink">{c.name}</div>
                  <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-muted">{c.tagline}</p>

                  <div className="mt-auto flex items-baseline justify-between gap-3 pt-4">
                    <Amount cents={c.raisedCents} size="lg" />
                    <span className="tabular text-[13px] text-muted">of {formatCents(c.goalCents)}</span>
                  </div>
                  <RaisedBar raisedCents={c.raisedCents} goalCents={c.goalCents} className="mt-2" thin />

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
                    <span>
                      <span className="tabular font-medium text-ink-2">{c.workersPaidCount}</span> people paid
                    </span>
                    <span>
                      <span className="tabular font-medium text-ink-2">{c.donorsCount}</span> donors
                    </span>
                    <span>
                      <span className="tabular font-medium text-ink-2">{c.openSpots}</span> open spots
                    </span>
                  </div>
                  {c.unit ? (
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5 text-[13px] text-ink-2">
                      <span>
                        <span className="tabular font-semibold text-ink">{formatCents(c.unit.cents)}</span> {c.unit.label}
                      </span>
                      <ArrowRight className="size-4 flex-none text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" strokeWidth={1.9} />
                    </div>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type Giving = NonNullable<FunctionReturnType<typeof api.causes.myGiving>>;

function YourGiving({ giving }: { giving: Giving }) {
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <div className="text-[13px] font-medium text-muted">You&apos;ve given</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <Amount cents={giving.totalCents} size="lg" />
            <span className="text-[13px] text-muted">
              to {giving.causes} {giving.causes === 1 ? "cause" : "causes"}
            </span>
          </div>
        </div>
        {giving.heldCents ? (
          <div className="flex items-center gap-2 rounded-md bg-steel-50 px-3 py-2 text-[13px] text-steel-700 ring-1 ring-inset ring-steel-100">
            <Lock className="size-4" strokeWidth={1.9} />
            <span>
              <span className="tabular font-semibold">{formatCents(giving.heldCents)}</span> held until proof passes
            </span>
          </div>
        ) : null}
      </div>
      <div className="divide-y divide-line border-t border-line">
        {giving.rows.slice(0, 4).map((r) => (
          <Link
            key={r._id}
            href={`/c/${r.causeSlug}/reel/${r._id}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-canvas"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate text-[14px] font-medium text-ink">
                {r.taskDone ? <BadgeCheck className="size-4 flex-none text-green-600" strokeWidth={1.9} /> : null}
                <span className="truncate">{r.taskTitle ?? r.causeName}</span>
              </div>
              <div className="truncate text-[12.5px] text-muted">
                {r.taskDone ? "Proof passed · see the Proof Reel" : r.taskTitle ? r.causeName : "Given to the cause"} ·{" "}
                {relativeTime(r.at)}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Amount cents={r.amountCents} size="sm" />
              {r.state ? <StatePill state={r.state} /> : null}
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}
