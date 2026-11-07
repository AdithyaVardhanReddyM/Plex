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
import { Badge, Card, CardHeader, EmptyState, IconTile, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { DayBars, Ring } from "@/components/ui/viz";
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <WeekCard week={week} movedCents={movedByAgents} heldCents={heldCents} heldCount={held.length} now={now} loading={!receipts} />
        <ApprovalsCard approvals={approvals} pots={pots} />
      </div>

      <MoneyFlow receipts={week} approvalsWaiting={approvals?.length ?? 0} loading={!receipts} className="mt-4" />

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
      return { cents, label: new Date(from).toLocaleDateString("en-US", { weekday: "narrow" }) };
    });
  }, [week, now]);
  const outside = 0;

  return (
    <Card className="@container overflow-hidden">
      <div className="grid @[640px]:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex flex-col p-5 @[640px]:p-6">
          <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
            <Bot className="size-4 text-faint" strokeWidth={1.9} />
            Moved by your agents, last 7 days
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
            {loading ? <Skeleton className="h-11 w-48" /> : <Amount cents={movedCents} size="xl" />}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="outline" className="tabular">
              {week.length} receipts
            </Badge>
            <Badge tone="green">
              <Check />
              {outside} outside your rules
            </Badge>
          </div>
          <DayBars values={days.map((d) => d.cents)} labels={days.map((d) => d.label)} height={96} className="mt-auto pt-6" />
        </div>

        {/* Held: the steel, foil-edged side of the card */}
        <div className="relative flex flex-col justify-between gap-6 border-t border-line bg-gradient-to-b from-steel-50 to-surface p-5 @[640px]:border-t-0 @[640px]:border-l @[640px]:p-6">
          <div className="absolute inset-x-0 top-0 h-1 @[640px]:inset-y-0 @[640px]:right-auto @[640px]:h-auto @[640px]:w-1" style={{ background: "var(--metal)" }} aria-hidden />
          <div>
            <div className="flex items-center gap-2 text-[13px] font-medium text-steel-700">
              <Lock className="size-4" strokeWidth={1.9} />
              Held until proof passes
            </div>
            <div className="mt-3">
              {loading ? <Skeleton className="h-8 w-24" /> : <Amount cents={heldCents} size="lg" className="text-[30px] text-steel-900" />}
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-steel-600">
              PayPal holds it. It pays out only when the work is verified, and goes back to you if it isn&apos;t.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-[12px] bg-surface/80 px-3 py-2.5 ring-1 ring-inset ring-steel-100">
            <IconTile tone="steel" size="sm">
              <Clock />
            </IconTile>
            <div className="min-w-0 text-[12.5px] leading-snug">
              <div className="font-medium text-ink">{heldCount} waiting on proof</div>
              <div className="text-muted">Released the moment it passes</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
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
    <Card className="flex flex-col">
      <CardHeader
        title="Needs your OK"
        description="Anything over a limit waits for you."
        action={approvals?.length ? <Badge tone="steel">{approvals.length} waiting</Badge> : null}
      />
      <div className="flex flex-1 flex-col p-4 pt-3.5">
        {approvals === undefined ? (
          <Skeleton className="h-48 w-full rounded-[12px]" />
        ) : first ? (
          <div className="flex flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-raised">
            <div className="flex items-center gap-2 border-b border-line bg-canvas/70 px-4 py-2.5 text-[12px] font-medium text-muted">
              <Bot className="size-3.5" strokeWidth={2} />
              <span className="truncate">{first.agentLabel} wants to buy</span>
              <span className="ml-auto flex-none text-faint">{relativeTime(first._creationTime)}</span>
            </div>
            <div className="flex flex-1 flex-col px-4 pt-3.5 pb-4">
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
              <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
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

function PotStrip({ pots }: { pots: Pot[] | undefined }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {(pots ?? Array.from({ length: 4 }).map(() => null)).map((p, i) =>
        p ? (
          <Link
            key={p._id}
            href="/pots"
            className="group flex flex-col rounded-lg border border-line bg-surface p-4 shadow-card transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <PotIcon pot={p} size={28} />
                <span className="truncate text-[13.5px] font-medium text-ink">{p.name}</span>
              </div>
              <Ring
                value={p.monthlyBudgetCents ? p.spentMonthCents / p.monthlyBudgetCents : 0}
                size={34}
                stroke={3.5}
                className="hidden sm:inline-flex"
                tone={p.color === "blue" || p.color === "steel" ? "steel" : "brand"}
              />
            </div>
            <div className="mt-4">
              <Amount cents={p.spentMonthCents} size="lg" />
            </div>
            <div className="tabular mt-0.5 text-[12px] text-muted">
              of {formatCents(p.monthlyBudgetCents)} this month ·{" "}
              {formatCents(Math.max(0, p.monthlyBudgetCents - p.spentMonthCents))} left
            </div>
          </Link>
        ) : (
          <Skeleton key={i} className="h-[124px] w-full rounded-lg" />
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
