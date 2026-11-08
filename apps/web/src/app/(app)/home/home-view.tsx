"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  HandCoins,
  ListChecks,
  Lock,
  ReceiptText,
} from "lucide-react";
import { AiAgentIcon } from "@/components/ui/icons";
import { api } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui/primitives";
import { EarnHome } from "./earn-home";
import { Amount } from "@/components/ui/money";
import { DayBars } from "@/components/ui/viz";
import { ReceiptRow, type Receipt } from "@/components/receipt/receipt";
import { MoneyFlow } from "@/components/art/money-flow";
import { cn, formatCents, relativeTime } from "@/lib/utils";

const DAY = 24 * 3_600_000;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function HomeView() {
  const viewer = useQuery(api.users.viewer);
  const setMode = useMutation(api.users.setHomeMode);
  // The switch answers at once; the saved mode catches up.
  const [picked, setPicked] = useState<"post" | "earn">();
  const both = Boolean(viewer?.roles.poster && viewer?.roles.doer);
  const mode = picked && both ? picked : (viewer?.mode ?? "post");
  const name = viewer ? `${greeting()}, ${viewer.name.split(" ")[0]}` : <Skeleton className="h-9 w-72" />;
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const switcher = both ? (
    <Segmented
      value={mode}
      onChange={(m) => {
        setPicked(m);
        if (!viewer?.isGuest) void setMode({ mode: m });
      }}
      items={[
        { value: "post", label: "Posting", icon: <ListChecks /> },
        { value: "earn", label: "Earning", icon: <HandCoins /> },
      ]}
    />
  ) : null;

  if (mode === "earn")
    return (
      <div className="animate-rise">
        <PageHeader eyebrow={date} title={name} description="Tasks that fit you, with the money already held at PayPal." actions={switcher} />
        <EarnHome viewer={viewer ?? undefined} />
      </div>
    );
  return <PostHome title={name} date={date} switcher={switcher} showAddEarn={Boolean(viewer && !viewer.isGuest && !viewer.roles.doer)} />;
}

function PostHome({ title, date, switcher, showAddEarn }: { title: React.ReactNode; date: string; switcher: React.ReactNode; showAddEarn: boolean }) {
  const receipts = useQuery(api.receipts.list, { limit: 80 });
  const tasks = useQuery(api.tasks.myOpenTasks);

  const [now] = useState(() => Date.now());
  const week = useMemo(() => receipts?.filter((r) => r.occurredAt >= now - 7 * DAY) ?? [], [receipts, now]);
  const movedByAgents = week.filter((r) => r.agentLabel).reduce((s, r) => s + r.amountCents, 0);
  const held = receipts?.filter((r) => r.state === "held" || r.state === "funded") ?? [];
  const heldCents = held.reduce((s, r) => s + r.amountCents, 0);
  const fresh = receipts !== undefined && receipts.length === 0;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={date}
        title={title}
        description={
          fresh
            ? "Say what you need done. People or AI agents do it, and PayPal pays them only when the proof checks out."
            : "Your agents spent inside your limits this week. Everything they moved has a receipt."
        }
        actions={
          switcher ?? (
            <Link href="/ledger" className={buttonVariants({ variant: "secondary" })}>
              Ask the Ledger <ArrowUpRight />
            </Link>
          )
        }
      />

      <Composer />

      {fresh ? null : (
        <>
          <div className="mt-4">
            <WeekCard week={week} movedCents={movedByAgents} heldCents={heldCents} heldCount={held.length} now={now} loading={!receipts} />
          </div>
          <MoneyFlow receipts={week} loading={!receipts} className="mt-4" />
        </>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader
            title="Recent receipts"
            description="Who it went to, why, and what allowed it."
            action={
              <Link href="/receipts" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                View all <ArrowRight />
              </Link>
            }
          />
          <div className="px-2 pt-2 pb-2">
            {receipts === undefined ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="size-[34px] rounded-[10px]" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))
            ) : receipts.length ? (
              receipts.slice(0, 10).map((r) => <ReceiptRow key={r._id} receipt={r} href={`/receipts/${r._id}`} />)
            ) : (
              <EmptyState icon={<ReceiptText />} title="No receipts yet" body="Every payment, hold and refund on your tasks writes one, with who, why and the rule that allowed it." className="py-10" />
            )}
          </div>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <TasksCard tasks={tasks} />
          {showAddEarn ? <AddEarnCard /> : null}
        </div>
      </div>
    </div>
  );
}

/** Home's first move for a poster: say it in a line, the Task Writer does the rest on the next screen. */
function Composer() {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const go = () => router.push(`/tasks/new${brief.trim() ? `?brief=${encodeURIComponent(brief.trim())}` : ""}`);
  return (
    <Card className="p-5 sm:p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <label htmlFor="home-brief" className="sr-only">
          What do you need done?
        </label>
        <input
          id="home-brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="What do you need done? Say it like a text…"
          className="h-12 min-w-0 flex-1 rounded-[12px] bg-sunken px-4 text-[15px] text-ink outline-none placeholder:text-faint focus:ring-[3px] focus:ring-green-100"
        />
        <Button type="submit" size="lg">
          {brief.trim() ? "Write it up" : "Post a task"} <ArrowRight />
        </Button>
      </form>
    </Card>
  );
}

function AddEarnCard() {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
        <HandCoins className="size-[18px] text-green-700" strokeWidth={1.9} /> Earn on Plex too
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">Take tasks near you or online. Set up the earning side in about two minutes.</p>
      <Link href="/onboarding?add=doer&next=%2Fhome" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-4")}>
        Set up earning <ArrowRight />
      </Link>
    </Card>
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
      return { cents, label: new Date(from).toLocaleDateString("en-US", { weekday: "short" }) };
    });
  }, [week, now]);
  const peak = days.reduce((m, d, i) => (d.cents > days[m]!.cents ? i : m), days.length - 1);
  const agents = new Set(week.map((r) => r.agentLabel).filter(Boolean)).size;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="flex min-h-[300px] flex-col p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <div className="flex items-center gap-2 font-medium text-ink-2">
            <AiAgentIcon className="size-[18px] text-green-700" />
            Moved by your agents
          </div>
          <span className="text-faint">Last 7 days</span>
        </div>
        <div className="mt-4">
          {loading ? <Skeleton className="h-14 w-52" /> : <Amount cents={movedCents} size="xl" className="text-[56px]" />}
        </div>
        <div className="tabular mt-3 text-[13px] text-muted">
          {week.length} receipts · {agents} agent{agents === 1 ? "" : "s"} ·{" "}
          <span className="font-medium text-green-700">0 outside your limits</span>
        </div>
        <DayBars
          values={days.map((d) => d.cents)}
          labels={days.map((d) => d.label)}
          highlight={peak}
          height={96}
          className="mt-auto pt-8"
        />
      </Card>

      <Card className="flex flex-col justify-between gap-8 p-6 sm:p-7">
        <div className="flex items-center gap-2 text-[13px] font-medium text-steel-700">
          <Lock className="size-[18px]" strokeWidth={1.9} />
          Held by PayPal
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-11 w-28" />
          ) : (
            <Amount cents={heldCents} size="xl" className="text-[48px] text-steel-900" />
          )}
          <div className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-steel-700">
            <Clock className="size-4" strokeWidth={1.9} />
            {heldCount} waiting on proof
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            Paid out the moment the work is verified. Back to you if it isn&apos;t.
          </p>
        </div>
      </Card>
    </div>
  );
}

// ── Tasks you posted ─────────────────────────────────────────────────────────

type OpenTask = NonNullable<ReturnType<typeof useQuery<typeof api.tasks.myOpenTasks>>>[number];

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
