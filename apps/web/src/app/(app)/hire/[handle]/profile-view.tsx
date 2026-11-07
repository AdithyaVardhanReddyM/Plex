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
  Split,
  Star,
  UserRound,
  UsersRound,
} from "lucide-react";
import { CATEGORY_LABEL } from "@plex/backend/lib/taskRules";
import { PLEX_BPS, pct } from "@plex/backend/lib/split";
import { api } from "@/lib/convex";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
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
            <div className="px-2 pt-3 pb-2">
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

const GLASS =
  "inline-flex h-[24px] items-center gap-1 rounded-full bg-white/[0.08] px-2.5 text-[12px] font-medium whitespace-nowrap text-white/75 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] [&_svg]:size-3.5 [&_svg]:stroke-[2]";

/** The profile, lit: the face, the name in display type, the trust ring and the record as big figures. */
function Hero({ p, first, hireHref }: { p: Profile; first: string; hireHref: string }) {
  const isAgent = p.kind === "agent";
  const free = !p.inProgress;

  return (
    <section className="@container spotlight rounded-xl p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <WorkerAvatar w={p} size={104} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {isAgent ? (
              <AgentMarker house={p.agent?.house} onDark />
            ) : (
              <span className={GLASS}>
                <UserRound /> Person
              </span>
            )}
            {free ? (
              <span className="inline-flex h-[24px] items-center rounded-full bg-green-300/15 px-2.5 text-[12px] font-medium text-green-200 shadow-[inset_0_0_0_1px_rgb(110_243_214/0.25)]">
                Free now
              </span>
            ) : (
              <span className={cn(GLASS, "tabular")}>
                {p.inProgress} task{p.inProgress > 1 ? "s" : ""} in progress
              </span>
            )}
          </div>
          <h1 className="mt-3 font-display text-[40px] leading-[1.02] font-extrabold tracking-[-0.045em] text-balance text-white @[640px]:text-[52px]">
            {p.name}
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-pretty text-white/70">{p.agent?.tagline ?? p.bio}</p>
          <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-white/55">
            {isAgent ? (
              <>
                <Meta icon={<Cpu />}>{modelLabel(p.agent?.model)}</Meta>
                <Meta icon={<Clock />}>Delivers in {p.agent?.turnaround ?? "—"}</Meta>
                {p.agent?.custom ? (
                  <Meta icon={<Split />}>
                    Built by {p.ownerName ?? "a Plex member"} · they earn {pct(10_000 - PLEX_BPS.custom)}, Plex keeps {pct(PLEX_BPS.custom)} to run it
                  </Meta>
                ) : (
                  <Meta icon={<ShieldCheck />}>Run by {p.ownerName ?? "an outside developer"}</Meta>
                )}
              </>
            ) : (
              <Meta icon={<MapPin />}>{p.area ?? "Area not shared"}</Meta>
            )}
          </div>
          <Link href={hireHref} className={cn(buttonVariants({ variant: "secondary" }), "mt-5 lg:hidden")}>
            Hire {first}
          </Link>
        </div>
        <div className="flex flex-none items-center gap-4 sm:flex-col sm:gap-2.5 sm:pl-2">
          <TrustRing score={p.trust.score} size={112} stroke={7} onDark />
          <div className="text-[12.5px] sm:text-center">
            <div className="font-medium text-white/80">Trust score</div>
            <div className="text-white/45">of 100, from the record</div>
          </div>
        </div>
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-4">
        <Figure label="Rating" foot={p.reviews.length ? `${p.reviews.length} verified review${p.reviews.length > 1 ? "s" : ""}` : "No reviews yet"}>
          {p.rating !== undefined ? (
            <>
              <Big>{p.rating.toFixed(2)}</Big>
              <Stars value={p.rating} onDark />
            </>
          ) : (
            <Big muted>New</Big>
          )}
        </Figure>
        <Figure label="Proofs passed" foot="Judged blind before payout">
          {p.proofPassRate !== undefined ? (
            <>
              <Big>
                {Math.round(p.proofPassRate * 100)}
                <span className="text-[0.55em] text-white/55">%</span>
              </Big>
              <span className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10" role="meter" aria-label="Proof pass rate" aria-valuenow={Math.round(p.proofPassRate * 100)}>
                <span className="block h-full rounded-full" style={{ width: `${p.proofPassRate * 100}%`, backgroundImage: "var(--meter-brand)" }} />
              </span>
            </>
          ) : (
            <Big muted>—</Big>
          )}
        </Figure>
        <Figure label="Paid tasks" foot="Paid out through PayPal">
          <Big>{p.tasksCompleted.toLocaleString("en-US")}</Big>
        </Figure>
        <Figure
          label={isAgent ? "Turnaround" : "Disputes"}
          foot={isAgent ? "From accepted bid to delivery" : p.disputes ? "Counted against trust" : "A clean record"}
        >
          {isAgent ? <Big>{shortTurnaround(p.agent?.turnaround)}</Big> : <Big muted={!p.disputes}>{p.disputes}</Big>}
        </Figure>
      </dl>
    </section>
  );
}

function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 [&_svg]:size-4 [&_svg]:flex-none [&_svg]:stroke-[1.9] [&_svg]:text-green-300/80">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function Figure({ label, foot, children }: { label: string; foot?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium text-white/50">{label}</dt>
      <dd className="mt-2 flex h-9 items-center gap-3">{children}</dd>
      {foot ? <dd className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-white/40 sm:truncate">{foot}</dd> : null}
    </div>
  );
}

function Big({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        "tabular font-display text-[34px] leading-none font-extrabold tracking-[-0.04em]",
        muted ? "text-white/35" : "text-white",
      )}
    >
      {children}
    </span>
  );
}

function Stars({ value, size = "sm", onDark }: { value: number; size?: "sm" | "xs"; onDark?: boolean }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            size === "sm" ? "size-3.5" : "size-3",
            i < full ? "fill-current text-refunded" : onDark ? "text-white/20" : "text-line-strong",
          )}
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
    { icon: <FileCheck2 />, tone: "text-ink-2", title: "Post the task", body: `${first} is named on it and sees it first.` },
    { icon: <Lock />, tone: "text-steel-600", title: "PayPal holds the payout", body: "Nothing is paid yet. It's held, not spent." },
    {
      icon: isAgent ? <ShieldCheck /> : <Camera />,
      tone: "text-green-700",
      title: "Paid when the proof passes",
      body: isAgent
        ? "Three proofer agents score the delivery blind."
        : "Photo proof with a challenge word, checked on time and place.",
    },
  ];
  return (
    <Card className="p-5">
      <div className="font-display text-[18px] font-bold tracking-[-0.025em] text-ink">Hire {first}</div>
      <p className="mt-1 text-[13px] leading-snug text-muted">
        {isAgent ? "Delivers text, files or links." : "Does work in person, nearby."} You pay only for verified work.
      </p>
      <ol className="mt-5 space-y-4">
        {steps.map((s) => (
          <li key={s.title} className="flex gap-3">
            <span className={cn("mt-px flex-none [&_svg]:size-[18px] [&_svg]:stroke-[1.9]", s.tone)}>{s.icon}</span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium leading-snug text-ink">{s.title}</div>
              <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <Link href={hireHref} className={cn(buttonVariants({ variant: "primary", size: "lg" }), "mt-6 w-full")}>
        Hire {first}
      </Link>
      {p.skills.length ? (
        <div className="mt-6">
          <div className="text-[12px] text-faint">{isAgent ? "Bids on tasks about" : "Skills"}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.skills.map((s) => (
              <Badge key={s} tone="neutral" className="text-ink-2">
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
        action={p.reviews.length ? <Badge tone="neutral" className="tabular">{p.reviews.length}</Badge> : null}
      />
      {p.reviews.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote />}
          title="No reviews yet"
          body={`Reviews open after a paid task. ${p.kind === "agent" ? "New agents" : "New people"} start here and earn their rank.`}
          className="py-10"
        />
      ) : (
        <ul className="space-y-1 px-2 pt-3 pb-2">
          {p.reviews.map((r) => (
            <li key={r._id} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3.5 rounded-[12px] px-3 py-3.5 transition-colors hover:bg-sunken/70">
              <Avatar name={r.authorName} color={r.authorColor} size={40} />
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium leading-snug text-ink">{r.authorName}</div>
                    <div className="truncate text-[12px] text-muted">{r.taskTitle}</div>
                  </div>
                  <Stars value={r.stars} size="xs" />
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-pretty text-ink-2">“{r.text}”</p>
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
      <CardHeader title="Recent paid work" description="Tasks where the proof passed and PayPal paid out." />
      {p.recent.length === 0 ? (
        <EmptyState icon={<FileCheck2 />} title="Nothing paid on Plex yet" body={`${first}'s first paid task shows here, with its receipt.`} className="py-10" />
      ) : (
        <ul className="px-2 pt-3 pb-2">
          {p.recent.map((t) => (
            <li key={t._id}>
              <Link
                href={`/tasks/${t._id}`}
                className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-[12px] px-3 py-3 transition-colors hover:bg-sunken/70"
              >
                <BadgeCheck className="size-5 text-green-700" strokeWidth={1.8} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{t.title}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {CATEGORY_LABEL[t.category]} · paid {relativeTime(t.at)}
                  </span>
                </span>
                <Amount cents={t.cents} size="sm" sign="in" className="text-[14px]" />
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
      <div className="spotlight rounded-xl p-6 sm:p-8">
        <div className="flex gap-6">
          <div className="size-[104px] flex-none rounded-full bg-white/10" />
          <div className="flex-1 space-y-3 pt-1">
            <div className="h-6 w-28 rounded-full bg-white/10" />
            <div className="h-10 w-64 rounded-lg bg-white/10" />
            <div className="h-4 w-[60%] rounded bg-white/10" />
          </div>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2.5">
              <div className="h-3 w-16 rounded bg-white/10" />
              <div className="h-8 w-20 rounded-lg bg-white/10" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-96 w-full rounded-lg" />
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    </div>
  );
}
