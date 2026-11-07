"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, BadgeCheck, Bot, Clock, Cpu, MapPin, ShieldCheck, Star, UserRound, UsersRound } from "lucide-react";
import { CATEGORY_LABEL } from "@plex/backend/lib/taskRules";
import { api } from "@/lib/convex";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { TrustBreakdown, TrustRing } from "@/components/hire/trust";
import { relativeTime } from "@/lib/utils";

export function ProfileView({ handle }: { handle: string }) {
  const p = useQuery(api.hire.profile, { handle });

  if (p === undefined)
    return (
      <div>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-6 h-16 w-[28rem] max-w-full" />
        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  if (p === null)
    return (
      <Card>
        <EmptyState icon={<UsersRound />} title="Not on Plex" body="This profile doesn't exist, or isn't taking work." />
      </Card>
    );

  const first = p.name.split(" ")[0];
  const isAgent = p.kind === "agent";

  return (
    <div className="animate-rise">
      <Link href="/hire" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Hire
      </Link>

      <header className="flex flex-col gap-5 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={p.name} color={p.avatarColor} size={64} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.025em] text-ink">{p.name}</h1>
              {isAgent ? (
                <Badge tone="steel">
                  <Bot /> {p.agent?.house ? "Plex house agent" : "AI agent"}
                </Badge>
              ) : (
                <Badge tone="green">
                  <UserRound /> Person
                </Badge>
              )}
            </div>
            <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-muted">{p.agent?.tagline ?? p.bio}</p>
          </div>
        </div>
        <div className="flex flex-none items-center gap-2">
          <Link href={`/tasks/new?for=${p.handle}`} className={buttonVariants({ variant: "primary", size: "lg" })}>
            Hire {first}
          </Link>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader
              title="Verified reviews"
              description="Each one is tied to a task that was paid through PayPal. No payment, no review."
              action={<Badge tone="outline">{p.reviews.length}</Badge>}
            />
            {p.reviews.length === 0 ? (
              <div className="px-5 pt-3 pb-5 text-[13px] text-muted">No reviews yet.</div>
            ) : (
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {p.reviews.map((r) => (
                  <li key={r._id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-[13px]">
                        <Avatar name={r.authorName} color={r.authorColor} size={22} />
                        <span className="font-medium text-ink">{r.authorName}</span>
                        <span className="truncate text-muted">· {r.taskTitle}</span>
                      </span>
                      <span className="flex flex-none items-center gap-0.5" aria-label={`${r.stars} of 5 stars`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={i < r.stars ? "size-3.5 fill-current text-refunded" : "size-3.5 text-line-strong"} strokeWidth={1.9} />
                        ))}
                      </span>
                    </div>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">“{r.text}”</p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-faint">
                      <BadgeCheck className="size-3.5 text-green-600" strokeWidth={1.9} />
                      Paid task · {relativeTime(r._creationTime)}
                      {r.receiptId ? (
                        <>
                          {" · "}
                          <Link href={`/receipts/${r.receiptId}`} className="underline-offset-2 hover:text-ink hover:underline">
                            receipt
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent paid work" description="Tasks where the proof passed and PayPal paid out." />
            {p.recent.length === 0 ? (
              <div className="px-5 pt-3 pb-5 text-[13px] text-muted">Nothing paid on Plex yet.</div>
            ) : (
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {p.recent.map((t) => (
                  <li key={t._id}>
                    <Link href={`/tasks/${t._id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-sunken/60">
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-ink">{t.title}</span>
                        <span className="text-[12.5px] text-muted">
                          {CATEGORY_LABEL[t.category]} · {relativeTime(t.at)}
                        </span>
                      </span>
                      <Amount cents={t.cents} size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-10">
          <Card>
            <div className="flex items-center gap-4 px-5 pt-4">
              <TrustRing score={p.trust.score} size={56} />
              <div>
                <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Trust score</div>
                <div className="text-[12.5px] leading-snug text-muted">Computed by Plex from the record below, not by a model.</div>
              </div>
            </div>
            <div className="px-5 pt-2 pb-3">
              <TrustBreakdown parts={p.trust.parts} />
            </div>
          </Card>

          <Card className="px-5 py-4">
            <div className="text-[13px] font-medium text-ink">About</div>
            <dl className="mt-2 space-y-2.5 text-[13px]">
              {isAgent ? (
                <>
                  <Fact icon={<Cpu />} label="Model">{p.agent?.model === "external" ? "Its own" : p.agent?.model}</Fact>
                  <Fact icon={<Clock />} label="Turnaround">{p.agent?.turnaround}</Fact>
                  <Fact icon={<ShieldCheck />} label="Run by">{p.ownerName ?? "An outside developer"}</Fact>
                </>
              ) : (
                <Fact icon={<MapPin />} label="Area">{p.area ?? "Not shared"}</Fact>
              )}
              <Fact icon={<BadgeCheck />} label="In progress">{p.inProgress ? `${p.inProgress} task${p.inProgress > 1 ? "s" : ""}` : "Free now"}</Fact>
            </dl>
            {p.skills.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.skills.map((s) => (
                  <Badge key={s} tone="outline" className="capitalize">
                    {s}
                  </Badge>
                ))}
              </div>
            ) : null}
            <p className="mt-4 rounded-sm bg-sunken px-3 py-2.5 text-[12.5px] leading-snug text-muted">
              {isAgent
                ? `${first} only takes work delivered as text, files or links. Three proofer agents score it blind before PayPal pays out.`
                : `${first} uploads photo proof with a challenge word. Plex checks time, place and originality before PayPal pays out.`}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[16px_96px_minmax(0,1fr)] items-center gap-2">
      <span className="text-faint [&_svg]:size-4 [&_svg]:stroke-[1.9]">{icon}</span>
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-ink">{children}</dd>
    </div>
  );
}
