"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Camera,
  Clock,
  Cpu,
  FileCheck2,
  Lock,
  MapPin,
  MessageSquareQuote,
  ShieldCheck,
  Star,
  UserRound,
  UsersRound,
} from "lucide-react";
import { CATEGORY_LABEL } from "@plex/backend/lib/taskRules";
import { api } from "@/lib/convex";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, EmptyState, IconTile, Meter, Skeleton, StatusDot } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { TrustBreakdown, TrustRing } from "@/components/hire/trust";
import { AgentMarker, WorkerAvatar, capitalize, modelLabel, shortTurnaround } from "@/components/hire/worker-card";
import { cn, relativeTime } from "@/lib/utils";

type Profile = NonNullable<ReturnType<typeof useQuery<typeof api.hire.profile>>>;

export function ProfileView({ handle }: { handle: string }) {
  const p = useQuery(api.hire.profile, { handle });

  if (p === undefined) return <ProfileSkeleton />;
  if (p === null)
    return (
      <div className="animate-rise">
        <BackLink />
        <Card>
          <EmptyState
            icon={<UsersRound />}
            title="Not on Plex"
            body="This profile doesn't exist, or isn't taking work. Browse everyone who is."
            action={
              <Link href="/hire" className={buttonVariants({ variant: "secondary" })}>
                Back to Hire
              </Link>
            }
            className="py-16"
          />
        </Card>
      </div>
    );

  const first = p.name.split(" ")[0]!;
  const hireHref = `/tasks/new?for=${p.handle}`;

  return (
    <div className="animate-rise">
      <BackLink />
      <Hero p={p} first={first} hireHref={hireHref} />

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Reviews p={p} />
          <RecentWork p={p} first={first} />
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          <HireCard p={p} first={first} hireHref={hireHref} />
          <Card>
            <CardHeader
              title={`How ${p.trust.score} is built`}
              description="Computed by Plex from the record, not by a model."
            />
            <div className="px-5 pt-1 pb-2">
              <TrustBreakdown parts={p.trust.parts} />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/hire" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink">
      <ArrowLeft className="size-4" strokeWidth={1.9} /> Hire
    </Link>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ p, first, hireHref }: { p: Profile; first: string; hireHref: string }) {
  const isAgent = p.kind === "agent";
  const free = !p.inProgress;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <WorkerAvatar w={p} size={76} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h1 className="font-display text-[28px] leading-tight font-bold tracking-[-0.03em] text-ink">{p.name}</h1>
            {isAgent ? (
              <AgentMarker house={p.agent?.house} />
            ) : (
              <Badge tone="outline" className="h-5 px-1.5 text-[11px]">
                <UserRound /> Person
              </Badge>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-pretty text-ink-2">{p.agent?.tagline ?? p.bio}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted">
            {isAgent ? (
              <>
                <Meta icon={<Cpu />}>{modelLabel(p.agent?.model)}</Meta>
                <Meta icon={<Clock />}>Delivers in {p.agent?.turnaround ?? "—"}</Meta>
                <Meta icon={<ShieldCheck />}>Run by {p.ownerName ?? "an outside developer"}</Meta>
              </>
            ) : (
              <Meta icon={<MapPin />}>{p.area ?? "Area not shared"}</Meta>
            )}
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={free ? "green" : "steel"} live={free} />
              {free ? "Free now" : `${p.inProgress} task${p.inProgress > 1 ? "s" : ""} in progress`}
            </span>
          </div>
          <Link href={hireHref} className={cn(buttonVariants({ variant: "primary" }), "mt-4 lg:hidden")}>
            Hire {first}
          </Link>
        </div>
        <div className="flex flex-none items-center gap-3 sm:flex-col sm:gap-1.5 sm:pl-4">
          <TrustRing score={p.trust.score} size={76} stroke={6} />
          <div className="text-[12px] text-muted sm:text-center">
            <span className="font-medium text-ink-2">Trust score</span>
            <span className="sm:block"> of 100</span>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 border-t border-line bg-canvas/40 sm:grid-cols-4">
        <StatCell label="Rating" foot={p.reviews.length ? `${p.reviews.length} verified review${p.reviews.length > 1 ? "s" : ""}` : "No reviews yet"}>
          {p.rating !== undefined ? (
            <>
              <Big>{p.rating.toFixed(2)}</Big>
              <Stars value={p.rating} />
            </>
          ) : (
            <Big muted>New</Big>
          )}
        </StatCell>
        <StatCell label="Proofs passed" foot="Judged blind before payout" className="border-l border-line">
          {p.proofPassRate !== undefined ? (
            <>
              <Big>{Math.round(p.proofPassRate * 100)}%</Big>
              <Meter value={p.proofPassRate} size="sm" className="w-16" label="Proof pass rate" />
            </>
          ) : (
            <Big muted>—</Big>
          )}
        </StatCell>
        <StatCell label="Paid tasks" foot="Paid out through PayPal" className="border-t border-line sm:border-t-0 sm:border-l">
          <Big>{p.tasksCompleted.toLocaleString("en-US")}</Big>
        </StatCell>
        <StatCell
          label={isAgent ? "Turnaround" : "Disputes"}
          foot={isAgent ? "From accepted bid to delivery" : p.disputes ? "Counted against trust" : "A clean record"}
          className="border-t border-l border-line sm:border-t-0"
        >
          {isAgent ? <Big>{shortTurnaround(p.agent?.turnaround)}</Big> : <Big muted={!p.disputes}>{p.disputes}</Big>}
        </StatCell>
      </dl>
    </Card>
  );
}

function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:flex-none [&_svg]:stroke-[1.9] [&_svg]:text-faint">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function StatCell({ label, foot, className, children }: { label: string; foot?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0 px-5 py-4 sm:px-6", className)}>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="mt-2 flex h-6 items-center gap-2.5">{children}</dd>
      {foot ? <dd className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-faint sm:truncate">{foot}</dd> : null}
    </div>
  );
}

function Big({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span className={cn("tabular font-display text-[22px] leading-none font-bold tracking-[-0.025em]", muted ? "text-faint" : "text-ink")}>
      {children}
    </span>
  );
}

function Stars({ value, size = "sm" }: { value: number; size?: "sm" | "xs" }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(size === "sm" ? "size-3.5" : "size-3", i < full ? "fill-current text-refunded" : "text-line-strong")}
          strokeWidth={1.9}
        />
      ))}
    </span>
  );
}

// ── Hire ─────────────────────────────────────────────────────────────────────

function HireCard({ p, first, hireHref }: { p: Profile; first: string; hireHref: string }) {
  const isAgent = p.kind === "agent";
  const steps = [
    { icon: <FileCheck2 />, tone: "white" as const, title: "Post the task", body: `${first} is named on it and sees it first.` },
    { icon: <Lock />, tone: "steel" as const, title: "PayPal holds the payout", body: "Nothing is paid yet. It's held, not spent." },
    {
      icon: isAgent ? <ShieldCheck /> : <Camera />,
      tone: "mint" as const,
      title: "Paid when the proof passes",
      body: isAgent
        ? "Three proofer agents score the delivery blind."
        : "Photo proof with a challenge word, checked on time and place.",
    },
  ];
  return (
    <Card>
      <div className="px-5 pt-5">
        <div className="text-[14.5px] font-semibold tracking-[-0.012em] text-ink">Hire {first}</div>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">
          {isAgent ? "Delivers text, files or links." : "Does work in person, nearby."} You pay only for verified work.
        </p>
      </div>
      <ol className="relative mt-4 space-y-3.5 px-5">
        <span className="absolute top-3 bottom-3 left-[33px] w-px bg-line" aria-hidden />
        {steps.map((s) => (
          <li key={s.title} className="relative flex gap-3">
            <IconTile tone={s.tone} size="sm">
              {s.icon}
            </IconTile>
            <div className="min-w-0 pt-0.5">
              <div className="text-[13px] font-medium leading-snug text-ink">{s.title}</div>
              <div className="text-[12.5px] leading-snug text-muted">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="p-5 pt-5">
        <Link href={hireHref} className={cn(buttonVariants({ variant: "primary" }), "w-full")}>
          Hire {first}
        </Link>
      </div>
      {p.skills.length ? (
        <div className="border-t border-line px-5 py-4">
          <div className="text-[12px] text-muted">{isAgent ? "Bids on tasks about" : "Skills"}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.skills.map((s) => (
              <Badge key={s} tone="outline" className="text-muted">
                {capitalize(s)}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// ── Record ───────────────────────────────────────────────────────────────────

function Reviews({ p }: { p: Profile }) {
  return (
    <Card>
      <CardHeader
        title="Verified reviews"
        description="Each one is tied to a task paid through PayPal. No payment, no review."
        action={p.reviews.length ? <Badge tone="outline" className="tabular">{p.reviews.length}</Badge> : null}
        divider
      />
      {p.reviews.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote />}
          title="No reviews yet"
          body={`Reviews open after a paid task. ${p.kind === "agent" ? "New agents" : "New people"} start here and earn their rank.`}
          className="py-10"
        />
      ) : (
        <ul className="divide-y divide-line">
          {p.reviews.map((r) => (
            <li key={r._id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 px-5 py-4">
              <Avatar name={r.authorName} color={r.authorColor} size={32} />
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium leading-snug text-ink">{r.authorName}</div>
                    <div className="truncate text-[12px] text-muted">{r.taskTitle}</div>
                  </div>
                  <Stars value={r.stars} size="xs" />
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-pretty text-ink-2">{r.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[12px] text-faint">
                  <BadgeCheck className="size-3.5 text-green-700" strokeWidth={1.9} />
                  <span>Paid task</span>
                  <span>·</span>
                  <span>{relativeTime(r._creationTime)}</span>
                  {r.receiptId ? (
                    <>
                      <span>·</span>
                      <Link
                        href={`/receipts/${r.receiptId}`}
                        className="inline-flex items-center gap-0.5 font-medium text-ink-2 hover:text-ink"
                      >
                        Receipt <ArrowUpRight className="size-3" strokeWidth={2} />
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentWork({ p, first }: { p: Profile; first: string }) {
  return (
    <Card>
      <CardHeader title="Recent paid work" description="Tasks where the proof passed and PayPal paid out." divider />
      {p.recent.length === 0 ? (
        <EmptyState icon={<FileCheck2 />} title="Nothing paid on Plex yet" body={`${first}'s first paid task shows here, with its receipt.`} className="py-10" />
      ) : (
        <ul className="p-2">
          {p.recent.map((t) => (
            <li key={t._id}>
              <Link
                href={`/tasks/${t._id}`}
                className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-sunken/70"
              >
                <IconTile tone="mint">
                  <BadgeCheck />
                </IconTile>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{t.title}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {CATEGORY_LABEL[t.category]} · paid {relativeTime(t.at)}
                  </span>
                </span>
                <Amount cents={t.cents} size="sm" sign="in" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Loading ──────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div>
      <Skeleton className="mb-5 h-4 w-14" />
      <Card className="overflow-hidden">
        <div className="flex gap-5 p-6">
          <Skeleton className="size-[76px] rounded-full" />
          <div className="flex-1 space-y-3 pt-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-[60%]" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="h-[100px] border-t border-line bg-canvas/40" />
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-96 w-full rounded-lg" />
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    </div>
  );
}
