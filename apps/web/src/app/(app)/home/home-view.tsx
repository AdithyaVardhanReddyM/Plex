"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  Clock,
  ListChecks,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/convex";
import type { Doc } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { DayBars } from "@/components/ui/viz";
import { ReceiptRow, type Receipt } from "@/components/receipt/receipt";
import { PotIcon, type Pot } from "@/components/pots/pot-meta";
import { MoneyFlow } from "@/components/art/money-flow";
import { cn, formatCents, relativeTime } from "@/lib/utils";

const DAY = 24 * 3_600_000;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function HomeView() {
  const viewer = useQuery(api.users.viewer);
  const receipts = useQuery(api.receipts.list, { limit: 80 });
  const pots = useQuery(api.pots.list);
  const approvals = useQuery(api.pots.pendingApprovals);
  const tasks = useQuery(api.pots.myOpenTasks);

  const [now] = useState(() => Date.now());
  const week = useMemo(() => receipts?.filter((r) => r.occurredAt >= now - 7 * DAY) ?? [], [receipts, now]);
  const movedByAgents = week.filter((r) => r.agentLabel).reduce((s, r) => s + r.amountCents, 0);
  const held = receipts?.filter((r) => r.state === "held" || r.state === "funded") ?? [];
  const heldCents = held.reduce((s, r) => s + r.amountCents, 0);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        title={viewer ? `${greeting()}, ${viewer.name.split(" ")[0]}` : <Skeleton className="h-9 w-72" />}
        description="Your agents spent inside your limits this week. Everything they moved has a receipt."
        actions={
          <Link href="/ledger" className={buttonVariants({ variant: "secondary" })}>
            Ask the Ledger <ArrowUpRight />
          </Link>
        }
      />

      <WeekCard week={week} movedCents={movedByAgents} heldCents={heldCents} heldCount={held.length} now={now} loading={!receipts} />

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <MoneyFlow receipts={week} approvalsWaiting={approvals?.length ?? 0} loading={!receipts} className="h-full" />
        <ApprovalsCard approvals={approvals} pots={pots} />
      </div>

      <PotStrip pots={pots} />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader
            title="Recent receipts"
            description="Who it went to, why, and which rule allowed it."
            action={
              <Link href="/receipts" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                View all <ArrowRight />
              </Link>
            }
          />
          <div className="px-2 pt-2 pb-2">
            {receipts
              ? receipts.slice(0, 10).map((r) => <ReceiptRow key={r._id} receipt={r} href={`/receipts/${r._id}`} />)
              : Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3">
                    <Skeleton className="size-[34px] rounded-[10px]" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
          </div>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <TasksCard tasks={tasks} />
          <RulesCard pots={pots} />
        </div>
      </div>
    </div>
  );
}

// ── This week ────────────────────────────────────────────────────────────────

/** A big amount for dark grounds: the sign small and dim, the digits in the display face. */
function BigMoney({ cents, className }: { cents: number; className?: string }) {
  const f = formatCents(cents);
  return (
    <span className={cn("tabular inline-flex items-start font-display font-extrabold tracking-[-0.045em]", className)}>
      <span className="mt-[0.18em] mr-1 text-[0.42em] font-bold text-white/45">$</span>
      {f.replace("$", "")}
    </span>
  );
}

function WeekCard({
  week,
  movedCents,
  heldCents,
  heldCount,
  now,
  loading,
}: {
  week: Receipt[];
  movedCents: number;
  heldCents: number;
  heldCount: number;
  now: number;
  loading: boolean;
}) {
  const days = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const from = start.getTime() - (6 - i) * DAY;
      const cents = week
        .filter((r) => r.agentLabel && r.occurredAt >= from && r.occurredAt < from + DAY)
        .reduce((s, r) => s + r.amountCents, 0);
      return { cents, label: new Date(from).toLocaleDateString("en-US", { weekday: "short" }) };
    });
  }, [week, now]);
  const peak = days.reduce((m, d, i) => (d.cents > days[m]!.cents ? i : m), 0);
  const agents = new Set(week.map((r) => r.agentLabel).filter(Boolean)).size;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* Spotlight: the week, lit */}
      <div className="@container spotlight flex min-h-[340px] flex-col rounded-xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-white/60">
            <Bot className="size-4 text-green-300" strokeWidth={1.9} />
            Moved by your agents
          </div>
          <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[11.5px] font-medium text-white/60 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
            Last 7 days
          </span>
        </div>
        <div className="mt-4">
          {loading ? (
            <div className="h-14 w-56 rounded-lg bg-white/10" />
          ) : (
            <BigMoney cents={movedCents} className="text-[56px] leading-none text-white @[480px]:text-[68px]" />
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] font-medium">
          <span className="tabular rounded-full bg-white/[0.08] px-2.5 py-1 text-white/75 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
            {week.length} receipts
          </span>
          <span className="tabular rounded-full bg-white/[0.08] px-2.5 py-1 text-white/75 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
            {agents} agent{agents === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-green-300/15 px-2.5 py-1 text-green-200 shadow-[inset_0_0_0_1px_rgb(110_243_214/0.25)]">
            <Check className="size-3" strokeWidth={2.6} />0 outside your rules
          </span>
        </div>
        <DayBars
          values={days.map((d) => d.cents)}
          labels={days.map((d) => d.label)}
          highlight={peak}
          height={104}
          onDark
          className="mt-auto pt-8"
        />
      </div>

      {/* Held: a brushed-metal card, like one in a wallet */}
      <div className="metal-card flex min-h-[220px] flex-col justify-between rounded-xl p-6 sm:p-7">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-steel-800">
            <Lock className="size-4" strokeWidth={2} />
            Held by PayPal
          </div>
          {/* the card's chip */}
          <span className="h-7 w-9 rounded-[7px] bg-[linear-gradient(135deg,#f6f9fc,#b8c8dc_45%,#eef3f8)] shadow-[inset_0_0_0_1px_rgb(24_38_59/0.18)]">
            <span className="mx-auto mt-[9px] block h-px w-5 bg-steel-700/30" />
            <span className="mx-auto mt-[5px] block h-px w-5 bg-steel-700/30" />
          </span>
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <span className="tabular font-display text-[48px] leading-none font-extrabold tracking-[-0.045em] text-steel-900">
              {formatCents(heldCents)}
            </span>
          )}
          <div className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-steel-800">
            <Clock className="size-3.5" strokeWidth={2} />
            {heldCount} waiting on proof
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-steel-800/75">
            Paid out the moment the work is verified. Back to you if it isn&apos;t.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Approvals ────────────────────────────────────────────────────────────────

function ApprovalsCard({
  approvals,
  pots,
}: {
  approvals: Doc<"approvals">[] | undefined;
  pots: Doc<"pots">[] | undefined;
}) {
  const decide = useMutation(api.pots.decideApproval);
  const first = approvals?.[0];
  const pot = first ? pots?.find((p) => p._id === first.potId) : undefined;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Needs your OK"
        description="Anything over a limit waits for you."
        action={approvals?.length ? <Badge tone="steel">{approvals.length} waiting</Badge> : null}
      />
      <div className="flex flex-1 flex-col p-4 pt-3.5">
        {approvals === undefined ? (
          <Skeleton className="h-48 w-full rounded-[12px]" />
        ) : first ? (
          <div className="flex flex-1 flex-col overflow-hidden rounded-[16px] bg-canvas/70 ring-1 ring-inset ring-line">
            <div className="flex items-center gap-2 px-4 pt-3.5 text-[12px] font-medium text-muted">
              <Bot className="size-3.5" strokeWidth={2} />
              <span className="truncate">{first.agentLabel} wants to buy</span>
              <span className="ml-auto flex-none text-faint">{relativeTime(first._creationTime)}</span>
            </div>
            <div className="flex flex-1 flex-col px-4 pt-2 pb-4">
              <div className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-ink">{first.description}</div>
              <div className="mt-0.5 text-[12.5px] text-muted">
                {first.merchant} · {pot?.name ?? "a"} pot
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <Amount cents={first.amountCents} size="lg" className="text-[28px]" />
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-[10px] bg-steel-50 px-3 py-2 text-[12.5px] leading-snug text-steel-700 ring-1 ring-inset ring-steel-100">
                <ShieldCheck className="mt-px size-3.5 flex-none" strokeWidth={2} />
                <span>
                  Paused by your rule: <span className="font-medium">{first.ruleText}</span>
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => decide({ id: first._id, approve: false })}>
                  Decline
                </Button>
                <Button variant="brand" onClick={() => decide({ id: first._id, approve: true })}>
                  Approve {formatCents(first.amountCents)}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<ShieldCheck />}
            title="Nothing waiting"
            body="Your agents are inside every limit."
            className="flex-1 justify-center rounded-[14px] border border-dashed border-line py-8"
          />
        )}
      </div>
    </Card>
  );
}

// ── Pots ─────────────────────────────────────────────────────────────────────

const POT_FACE: Record<string, string> = {
  green: "bg-[linear-gradient(150deg,var(--color-green-50),var(--color-green-100)_70%,var(--color-green-200))]",
  teal: "bg-[linear-gradient(150deg,var(--color-green-50),var(--color-green-100)_70%,var(--color-green-300))]",
  blue: "bg-[linear-gradient(150deg,var(--color-steel-50),var(--color-steel-100)_70%,var(--color-steel-200))]",
  steel: "bg-[linear-gradient(150deg,var(--color-steel-50),var(--color-steel-100)_70%,var(--color-steel-200))]",
};

function PotStrip({ pots }: { pots: Pot[] | undefined }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {(pots ?? Array.from({ length: 4 }).map(() => null)).map((p, i) =>
        p ? (
          <Link
            key={p._id}
            href="/pots"
            className={cn(
              "group relative flex min-h-[156px] flex-col overflow-hidden rounded-xl p-5 shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-hover",
              POT_FACE[p.color] ?? POT_FACE.green,
            )}
          >
            <span className="pointer-events-none absolute -right-8 -bottom-10 size-36 rounded-full border-[18px] border-white/40" aria-hidden />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <PotIcon pot={p} size={28} className="bg-white/70 ring-white" />
                <span className="truncate text-[13.5px] font-semibold text-ink">{p.name}</span>
              </div>
              <span className="tabular hidden text-[12px] font-semibold text-ink-2 sm:inline">
                {p.monthlyBudgetCents ? Math.round((p.spentMonthCents / p.monthlyBudgetCents) * 100) : 0}%
              </span>
            </div>
            <div className="relative mt-auto pt-6">
              <span className="tabular font-display text-[28px] leading-none font-extrabold tracking-[-0.04em] text-ink">
                {formatCents(p.spentMonthCents)}
              </span>
              <div className="tabular mt-1.5 text-[12px] font-medium text-ink-2/70">
                of {formatCents(p.monthlyBudgetCents)} · {formatCents(Math.max(0, p.monthlyBudgetCents - p.spentMonthCents))} left
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/60">
                <div
                  className="h-full rounded-full bg-ink transition-[width] duration-700"
                  style={{ width: `${p.monthlyBudgetCents ? Math.min(100, (p.spentMonthCents / p.monthlyBudgetCents) * 100) : 0}%` }}
                />
              </div>
            </div>
          </Link>
        ) : (
          <Skeleton key={i} className="h-[156px] w-full rounded-xl" />
        ),
      )}
    </div>
  );
}

function RulesCard({ pots }: { pots: Pot[] | undefined }) {
  return (
    <Card>
      <CardHeader
        title="Your rules"
        description="Your words, enforced in code."
        action={
          <Link href="/pots" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Edit <ArrowRight />
          </Link>
        }
      />
      <div className="space-y-2 p-4 pt-3.5">
        {pots
          ? pots.slice(0, 3).map((p) => (
              <div key={p._id} className="rounded-[12px] border border-line bg-canvas/50 px-3.5 py-3">
                <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
                  <PotIcon pot={p} size={20} />
                  {p.name}
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-pretty text-ink">“{p.rulesText}”</p>
              </div>
            ))
          : <Skeleton className="h-32 w-full" />}
      </div>
    </Card>
  );
}

// ── Tasks you posted ─────────────────────────────────────────────────────────

type OpenTask = NonNullable<ReturnType<typeof useQuery<typeof api.pots.myOpenTasks>>>[number];

const TASK_STATUS: Record<string, { label: string; tone: "outline" | "steel" | "green" }> = {
  open: { label: "Open", tone: "outline" },
  assigned: { label: "Assigned", tone: "steel" },
  submitted: { label: "Proof in", tone: "green" },
  verifying: { label: "Checking", tone: "steel" },
  approved: { label: "Approved", tone: "green" },
};

function payoutCents(p: OpenTask["payout"]) {
  if (p.kind === "fixed") return p.amountCents;
  if (p.kind === "per_unit") return p.amountCents * p.maxUnits;
  return p.capCents;
}

function TasksCard({ tasks }: { tasks: OpenTask[] | undefined }) {
  const [now] = useState(() => Date.now());
  return (
    <Card>
      <CardHeader
        title="Tasks you posted"
        description="Paid only when the proof passes."
        action={
          <Link href="/tasks" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            All <ArrowRight />
          </Link>
        }
      />
      <div className="px-2 pt-2 pb-2">
        {tasks === undefined ? (
          <Skeleton className="m-3 h-20" />
        ) : !tasks.length ? (
          <EmptyState icon={<ListChecks />} title="Nothing in flight" body="Post a task and pay only for verified work." className="py-8" />
        ) : (
          <ul>
            {tasks.slice(0, 4).map((t) => {
              const status = TASK_STATUS[t.status] ?? TASK_STATUS.open!;
              const funded = t.fundingState === "authorized" || t.fundingState === "captured";
              return (
                <li key={t._id}>
                  <Link
                    href={`/tasks/${t._id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-sunken/70"
                  >
                    <div className="min-w-0">
                      <div className="line-clamp-2 text-[13.5px] font-medium leading-snug text-ink">{t.title}</div>
                      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
                        {funded ? <Lock className="size-3 text-steel-500" strokeWidth={2.2} /> : null}
                        <span className="truncate">
                          {funded ? "Funds held" : "Unfunded"} ·{" "}
                          {t.windowEnd > now ? `due ${relativeTime(t.windowEnd)}` : `ended ${relativeTime(t.windowEnd)}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="tabular text-[13.5px] font-semibold text-ink">{formatCents(payoutCents(t.payout))}</span>
                      <Badge tone={status.tone} className={cn(status.tone === "outline" && "text-muted")}>
                        {status.label}
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
  );
}
