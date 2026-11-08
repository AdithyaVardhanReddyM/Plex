"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useState } from "react";
import { ArrowRight, Clock, HandCoins, Lock, MapPin, Search, Send } from "lucide-react";
import { MI_PER_KM } from "@plex/backend/lib/profile";
import { api } from "@/lib/convex";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { cn, formatCents, relativeTime } from "@/lib/utils";

type Viewer = NonNullable<ReturnType<typeof useQuery<typeof api.users.viewer>>>;

const STATUS: Record<string, { label: string; tone: "outline" | "steel" | "green" | "amber" }> = {
  assigned: { label: "To do", tone: "steel" },
  submitted: { label: "Proof sent", tone: "steel" },
  verifying: { label: "Checking", tone: "steel" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Needs a redo", tone: "amber" },
  disputed: { label: "In review", tone: "amber" },
};

/** Home for someone taking tasks: what's paid, what's held for them, and what fits next. */
export function EarnHome({ viewer }: { viewer?: Viewer }) {
  const forYou = useQuery(api.home.forYou);
  const money = useQuery(api.home.earnings);
  const [now] = useState(() => Date.now());
  const unit = viewer?.place?.unit ?? "mi";
  const needsPaypal = viewer && !viewer.isGuest && !viewer.paypalEmail;

  return (
    <div className="flex flex-col gap-4">
      {needsPaypal ? (
        <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[16px] font-semibold text-ink">Add where we pay you</div>
            <p className="mt-1 text-[13.5px] text-muted">Your PayPal email, so payouts can reach you. You need it before you apply.</p>
          </div>
          <Link href="/settings#getting-paid" className={buttonVariants()}>
            Add PayPal email <ArrowRight />
          </Link>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col justify-between gap-6 p-6 sm:p-7 md:col-span-2">
          <div className="flex items-center gap-2 text-[13px] font-medium text-green-800">
            <HandCoins className="size-[18px]" strokeWidth={1.9} /> Paid to you
          </div>
          <div>
            {money === undefined ? <Skeleton className="h-14 w-48" /> : <Amount cents={money?.paidCents ?? 0} size="xl" className="text-[56px]" />}
            <div className="tabular mt-3 text-[13px] text-muted">
              {money ? `${money.done} ${money.done === 1 ? "task" : "tasks"} paid · straight to your PayPal, no Plex fee` : " "}
            </div>
          </div>
        </Card>
        <Card className="flex flex-col justify-between gap-6 p-6 sm:p-7">
          <div className="flex items-center gap-2 text-[13px] font-medium text-steel-700">
            <Lock className="size-[18px]" strokeWidth={1.9} /> Held for your work
          </div>
          <div>
            {money === undefined ? <Skeleton className="h-11 w-28" /> : <Amount cents={money?.heldCents ?? 0} size="xl" className="text-[48px] text-steel-900" />}
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">Already at PayPal. Yours when the proof passes.</p>
          </div>
        </Card>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader
            title="Tasks for you"
            description="Matched to the work you picked. The money is held for every one."
            action={
              <Link href="/tasks" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                All tasks <ArrowRight />
              </Link>
            }
          />
          <div className="px-2 pt-2 pb-2">
            {forYou === undefined ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="m-3 h-14" />)
            ) : forYou.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title="Nothing fits right now"
                body="New tasks show up here the moment they're funded. Widen what you take, or browse every open task."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link href="/tasks" className={buttonVariants({ size: "sm" })}>
                      Browse tasks
                    </Link>
                    <Link href="/onboarding?add=doer&next=%2Fhome" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      Edit preferences
                    </Link>
                  </div>
                }
                className="py-10"
              />
            ) : (
              <ul>
                {forYou.map((t) => (
                  <li key={t._id}>
                    <Link href={`/tasks/${t._id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-[12px] px-3 py-3 transition-colors hover:bg-sunken/70">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-medium text-ink">{t.title}</div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
                          {t.place ? (
                            <span className="flex min-w-0 items-center gap-1">
                              <MapPin className="size-3.5 flex-none" strokeWidth={1.9} />
                              <span className="truncate">
                                {t.distanceKm !== undefined
                                  ? `${unit === "mi" ? (t.distanceKm * MI_PER_KM).toFixed(1) : t.distanceKm.toFixed(1)} ${unit} away`
                                  : t.place}
                              </span>
                            </span>
                          ) : (
                            <span>Online</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="size-3.5" strokeWidth={1.9} /> {t.window}
                          </span>
                          {t.invited ? <span className="font-medium text-green-700">Invited you</span> : t.reasons[0] ? <span className="text-ink-2">{t.reasons[0]}</span> : null}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="tabular text-[15px] font-semibold text-ink">{formatCents(t.cents)}</div>
                        <div className="text-[11.5px] font-medium text-steel-700">Held</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Your work" description="Tasks you're doing. Send proof to get paid." />
            <div className="px-2 pt-2 pb-2">
              {money === undefined ? (
                <Skeleton className="m-3 h-16" />
              ) : !money?.active.length ? (
                <p className="px-3 py-4 text-[13px] text-muted">Nothing in progress. When a poster picks you, the task shows up here.</p>
              ) : (
                <ul>
                  {money.active.map((t) => {
                    const st = STATUS[t.status] ?? STATUS.assigned!;
                    return (
                      <li key={t._id}>
                        <Link href={`/tasks/${t._id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-sunken/70">
                          <div className="min-w-0">
                            <div className="line-clamp-2 text-[13.5px] font-medium leading-snug text-ink">{t.title}</div>
                            <div className="mt-1 text-[12px] text-muted">{t.windowEnd > now ? `Due ${relativeTime(t.windowEnd)}` : `Ended ${relativeTime(t.windowEnd)}`}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="tabular text-[13.5px] font-semibold text-ink">{formatCents(t.cents)}</span>
                            <Badge tone={st.tone} className={cn(st.tone === "outline" && "text-muted")}>
                              {st.label}
                            </Badge>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
          {money?.applied.length ? (
            <Card>
              <CardHeader title="Applied" description="Waiting on the poster." />
              <ul className="px-2 pt-2 pb-2">
                {money.applied.map((a) => (
                  <li key={a._id}>
                    <Link href={`/tasks/${a._id}`} className="flex items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-sunken/70">
                      <span className="flex min-w-0 items-center gap-2 text-[13.5px] text-ink">
                        <Send className="size-4 flex-none text-faint" strokeWidth={1.9} />
                        <span className="truncate">{a.title}</span>
                      </span>
                      <span className="tabular text-[13px] text-muted">asked {formatCents(a.askCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {money?.paid.length ? (
            <Card>
              <CardHeader title="Recently paid" />
              <ul className="px-2 pt-2 pb-2">
                {money.paid.map((p) => (
                  <li key={p._id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="truncate text-[13.5px] text-ink">{p.title}</span>
                    <Amount cents={p.cents} sign="in" size="sm" />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
