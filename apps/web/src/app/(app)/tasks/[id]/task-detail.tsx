"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Cpu,
  Camera,
  Check,
  CircleAlert,
  Clock,
  Hand,
  Loader2,
  Lock,
  MapPin,
  PenLine,
  RotateCcw,
  Route,
  ShieldCheck,
  UserCheck,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { payoutSummary, windowLabel } from "@plex/backend/lib/taskRules";
import { criterionLabel, defaultCriteria } from "@plex/backend/lib/hire";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { TaskArt } from "@/components/art/empty-art";
import { ReceiptCard, ReceiptRow } from "@/components/receipt/receipt";
import { PersonaSwitch, useAs } from "@/components/tasks/persona";
import { CategoryLabel, SpecIcon, StatusBadge, errorMessage, timeLeft } from "@/components/tasks/task-ui";
import { cn, formatCents, relativeTime } from "@/lib/utils";
import { ActionPanel, Applicants, ApplyCard, ConnectionsCard, MoneyCard, PayPalDeskCard, ProofPanel } from "./panels";

export type TaskPage = NonNullable<FunctionReturnType<typeof api.tasks.get>>;

export function TaskDetail({ id }: { id: string }) {
  const as = useAs();
  const data = useQuery(api.tasks.get, { id: id as Id<"tasks">, as });
  const returning = useFundingReturn(id as Id<"tasks">, data);

  if (data === undefined) return <TaskDetailSkeleton />;
  if (data === null)
    return (
      <div className="animate-rise">
        <BackRow />
        <Card>
          <EmptyState
            art={<TaskArt />}
            title="Task not found"
            body="It may have been removed, or the link is wrong."
            action={
              <Link href="/tasks" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Back to the board
              </Link>
            }
            className="py-14"
          />
        </Card>
      </div>
    );

  const { task, role, poster } = data;
  const isPoster = role === "poster";

  return (
    <div className="animate-rise">
      <BackRow />

      <header className="pb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CategoryLabel task={task} tile />
          <StatusBadge status={task.status} />
        </div>
        <h1 className="mt-3 max-w-4xl font-display text-[28px] leading-[1.15] font-bold tracking-[-0.03em] text-balance text-ink sm:text-[30px]">
          {task.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          {poster ? <Avatar name={poster.name} color={poster.avatarColor} size={24} square={poster.kind !== "person"} /> : null}
          <span className="font-medium text-ink-2">{isPoster ? "You" : (poster?.name ?? "Someone")}</span>
          {task.agentLabel ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-faint">via</span>
              <Cpu className="size-3.5 text-faint" strokeWidth={1.9} />
              {task.agentLabel}
            </span>
          ) : null}
          <span className="text-faint">·</span>
          <span>posted {new Date(task._creationTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          {data.invited ? (
            <>
              <span className="text-faint">·</span>
              <span>
                hired directly:{" "}
                <Link href={`/hire/${data.invited.handle}`} className="font-medium text-ink-2 underline-offset-2 hover:underline">
                  {data.invited.name}
                </Link>
              </span>
            </>
          ) : null}
        </div>
      </header>

      {returning}

      <Lifecycle data={data} />

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <ActionPanel data={data} />
          <ConnectionsCard data={data} />
          {data.proof ? <ProofPanel data={data} /> : null}
          {task.status === "open" || task.status === "draft" ? (
            isPoster ? (
              <Applicants data={data} />
            ) : (
              <ApplyCard data={data} />
            )
          ) : isPoster && data.applications.length ? (
            <Applicants data={data} />
          ) : null}
          <BriefCard data={data} />
        </div>
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-8">
          <MoneyCard data={data} />
          <TaskReceipts receipts={data.receipts} />
          <PayPalDeskCard data={data} />
        </aside>
      </div>
    </div>
  );
}

function BackRow() {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <Link href="/tasks" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.9} /> Tasks
      </Link>
      <PersonaSwitch />
    </div>
  );
}

function TaskDetailSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-16" />
      <div className="mt-8 flex items-center gap-2">
        <Skeleton className="size-[18px] rounded-[6px]" />
        <Skeleton className="h-3.5 w-48" />
      </div>
      <Skeleton className="mt-4 h-8 w-[30rem] max-w-full" />
      <Skeleton className="mt-3 h-4 w-64" />
      <Skeleton className="mt-7 h-[232px] w-full rounded-xl" />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-36 w-full rounded-lg" />
          <Skeleton className="h-80 w-full rounded-lg" />
        </div>
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    </div>
  );
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

type StepState = "done" | "held" | "current" | "todo" | "warn" | "stop";
type Step = { key: string; label: string; sub: React.ReactNode; state: StepState; icon: React.ReactNode };

const PROOF_IN = new Set(["verifying", "submitted", "approved", "paid", "rejected", "disputed"]);

/**
 * The task's life as one line: posted, funds held, assigned, proof in,
 * verified, paid. Held is steel, done is mint, the next step is marked.
 */
function Lifecycle({ data }: { data: TaskPage }) {
  const { task, assignee, proof } = data;
  const f = task.funding;
  const status = task.status;
  const ended = status === "refunded" || status === "cancelled";
  const funded = f.state !== "unfunded";
  const assigned = Boolean(task.assigneeId);
  const proofIn = Boolean(proof) && PROOF_IN.has(status);
  const v = proof?.verdict;
  const verified = status === "approved" || status === "paid" || (status === "submitted" && v?.result === "pass");
  const paid = status === "paid";
  const first = assignee?.name.split(" ")[0];

  const steps: (Omit<Step, "state"> & { done: boolean; problem?: StepState })[] = [
    {
      key: "posted",
      label: "Posted",
      icon: <PenLine />,
      done: true,
      sub: new Date(task._creationTime).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    },
    {
      key: "held",
      label: "Funds held",
      icon: <Lock />,
      done: funded && f.state !== "refunded",
      problem: f.state === "refunded" ? "warn" : undefined,
      sub: !funded ? "Fund to open" : f.state === "refunded" ? (f.captureId ? "Refunded" : "Hold voided") : `${formatCents(task.fundingCents)} by PayPal`,
    },
    {
      key: "assigned",
      label: "Assigned",
      icon: <UserCheck />,
      done: assigned,
      sub: assigned ? (first ?? "Taken") : data.applications.length ? `${data.applications.length} applied` : "Waiting for takers",
    },
    {
      key: "proof",
      label: "Proof in",
      icon: <Camera />,
      done: proofIn,
      sub: proofIn && proof ? relativeTime(proof._creationTime) : assigned ? timeLeft(task) : `${task.proofSpec.length} item${task.proofSpec.length === 1 ? "" : "s"}`,
    },
    {
      key: "verified",
      label: "Verified",
      icon: <BadgeCheck />,
      done: verified,
      problem: status === "rejected" ? "warn" : status === "disputed" ? "stop" : undefined,
      sub:
        status === "verifying"
          ? "Checking now"
          : status === "rejected"
            ? "Rejected"
            : status === "disputed"
              ? "Contested"
              : v
                ? `${v.result === "pass" ? "Pass" : v.result === "fail" ? "Failed" : "Unsure"} · ${Math.round(v.confidence * 100)}%`
                : task.verificationMode === "auto"
                  ? "Automatic"
                  : task.verificationMode === "one_tap"
                    ? "One tap"
                    : "Manual",
    },
    {
      key: "paid",
      label: ended ? (status === "refunded" ? "Refunded" : "Cancelled") : "Paid",
      icon: ended ? <RotateCcw /> : <Banknote />,
      done: paid,
      problem: ended ? "warn" : undefined,
      sub: paid ? (first ? `to ${first}` : "Paid out") : ended ? "Nobody was paid" : status === "approved" ? "Sending now" : "On approval",
    },
  ];

  // A step in trouble is where it stands; otherwise the first open step is next.
  let currentSet = ended || steps.some((s) => s.problem);
  const resolved: Step[] = steps.map((s) => {
    let state: StepState;
    if (s.problem) state = s.problem;
    else if (s.done) state = s.key === "held" && !paid ? "held" : "done";
    else if (!currentSet) {
      state = "current";
      currentSet = true;
    } else state = "todo";
    return { ...s, state };
  });
  const doneCount = resolved.filter((s) => s.state === "done" || s.state === "held").length;

  const current = resolved.find((s) => s.state === "current" || s.state === "warn" || s.state === "stop");
  const headline = STAGE[status];

  return (
    <section className="spotlight rounded-xl px-6 pt-6 pb-7 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-medium text-white/60">
            <Route className="size-4 text-green-300" strokeWidth={1.9} />
            Where it stands
          </div>
          <div className="mt-3 font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.04em] text-balance text-white sm:text-[42px]">
            {headline}
          </div>
          {current ? (
            <p className="mt-2 text-[13px] text-white/55">
              {current.state === "current" ? "Up next: " : ""}
              {current.label} · {current.sub}
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-white/55">Every step is done. Both sides have the receipt.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium">
          <span className={cn(GLASS, "tabular text-white/70")}>
            {doneCount} of {resolved.length} steps
          </span>
          {!ended && !paid ? <span className={cn(GLASS, "text-white/70")}>{timeLeft(task)}</span> : null}
        </div>
      </div>

      <ol className="relative mt-8 grid gap-0 md:grid-cols-6">
        {resolved.map((s, i) => {
          const next = resolved[i + 1];
          const reached = (st: StepState) => st === "done" || st === "held";
          const lit = next && reached(s.state) && next.state !== "todo";
          const fill = lit ? (s.state === "held" ? "var(--meter-steel)" : "var(--meter-brand)") : undefined;
          return (
            <li key={s.key} className="relative flex gap-3.5 pb-5 last:pb-0 md:flex-col md:gap-0 md:pb-0">
              {next ? (
                <>
                  {/* vertical connector (phones) */}
                  <span
                    aria-hidden
                    className={cn("absolute top-8 bottom-1 left-[11px] w-0.5 rounded-full md:hidden", !lit && "bg-white/12")}
                    style={fill ? { backgroundImage: fill } : undefined}
                  />
                  {/* horizontal connector */}
                  <span
                    aria-hidden
                    className={cn("absolute top-[11px] right-3 left-9 hidden h-0.5 rounded-full md:block", !lit && "bg-white/12")}
                    style={fill ? { backgroundImage: fill } : undefined}
                  />
                </>
              ) : null}
              <StepIcon state={s.state} icon={s.icon} />
              <div className="min-w-0 md:pt-3 md:pr-3">
                <div
                  className={cn(
                    "text-[13.5px] leading-snug font-semibold",
                    s.state === "todo"
                      ? "text-white/35"
                      : s.state === "warn"
                        ? "text-refunded-bg"
                        : s.state === "stop"
                          ? "text-disputed-bg"
                          : s.state === "current"
                            ? "text-green-200"
                            : "text-white",
                  )}
                >
                  {s.label}
                </div>
                <div className={cn("mt-0.5 truncate text-[12px] leading-snug", s.state === "todo" ? "text-white/30" : "text-white/55")}>
                  {s.sub}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const GLASS = "rounded-full bg-white/[0.08] px-2.5 py-1 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]";

/** The task's state in a few words: the spotlight's headline. */
const STAGE: Record<TaskPage["task"]["status"], string> = {
  draft: "Not funded yet",
  open: "Open for takers",
  assigned: "Work in progress",
  verifying: "Checking the proof",
  submitted: "Proof in, waiting on approval",
  approved: "Paying out",
  paid: "Paid on proof",
  rejected: "Proof rejected",
  disputed: "Contested",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** A step's state as a bare glyph on the night ground: no circle behind it. */
function StepIcon({ state, icon }: { state: StepState; icon: React.ReactNode }) {
  const base = "relative z-[1] flex size-6 flex-none items-center justify-center [&_svg]:size-5 [&_svg]:stroke-[2]";
  switch (state) {
    case "done":
      return (
        <span className={cn(base, "text-green-300")}>
          <Check className="!stroke-[2.6]" />
        </span>
      );
    case "held":
      return (
        <span className={cn(base, "text-steel-200")}>
          <Lock />
        </span>
      );
    case "current":
      return <span className={cn(base, "text-white")}>{icon}</span>;
    case "warn":
      return <span className={cn(base, "text-refunded-bg")}>{icon}</span>;
    case "stop":
      return <span className={cn(base, "text-disputed-bg")}>{icon}</span>;
    default:
      return <span className={cn(base, "text-white/30")}>{icon}</span>;
  }
}

/** Handles ?paypal=return (authorize the approved order) and ?paypal=cancel. */
function useFundingReturn(taskId: Id<"tasks">, data: TaskPage | null | undefined) {
  const params = useSearchParams();
  const router = useRouter();
  const confirm = useAction(api.taskMoney.confirmFunding);
  const flag = params.get("paypal");
  const started = useRef(false);
  const [state, setState] = useState<"working" | "done" | "not_approved" | "error">("working");
  const [message, setMessage] = useState<string>();
  const funded = data ? data.task.funding.state !== "unfunded" : false;

  useEffect(() => {
    if (flag !== "return" || started.current || !data) return;
    started.current = true;
    if (data.task.funding.state !== "unfunded") {
      router.replace(`/tasks/${taskId}`);
      return;
    }
    confirm({ taskId })
      .then((r) => {
        setState(r.state === "not_approved" ? "not_approved" : "done");
        if (r.state !== "not_approved") router.replace(`/tasks/${taskId}`);
      })
      .catch((err) => {
        setState("error");
        setMessage(errorMessage(err));
      });
  }, [flag, data, confirm, taskId, router]);

  if (flag === "cancel")
    return (
      <Banner tone="neutral" onClose={() => router.replace(`/tasks/${taskId}`)}>
        You left PayPal before approving. Nothing was charged; fund it whenever you&apos;re ready.
      </Banner>
    );
  if (flag !== "return" || state === "done" || (funded && state === "working")) return null;
  if (state === "working")
    return (
      <Banner tone="steel">
        <Loader2 className="size-4 animate-spin" strokeWidth={1.9} /> Confirming with PayPal and placing the hold…
      </Banner>
    );
  return (
    <Banner tone="red" onClose={() => router.replace(`/tasks/${taskId}`)}>
      <CircleAlert className="size-4 flex-none" strokeWidth={1.9} />
      {state === "not_approved" ? "PayPal hasn't approved this order yet. Fund it again to retry." : message}
    </Banner>
  );
}

function Banner({
  tone,
  children,
  onClose,
}: {
  tone: "steel" | "red" | "neutral";
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex items-center gap-2.5 rounded-[12px] px-4 py-3 text-[13.5px] ring-1 ring-inset",
        tone === "steel" && "bg-steel-50 text-steel-700 ring-steel-100",
        tone === "red" && "bg-disputed-bg text-disputed ring-disputed/15",
        tone === "neutral" && "bg-surface text-ink-2 shadow-card ring-line",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="flex size-7 flex-none items-center justify-center rounded-full transition-colors hover:bg-ink/5"
        >
          <X className="size-4" strokeWidth={1.9} />
        </button>
      ) : null}
    </div>
  );
}

const MODE = {
  auto: { label: "Automatic", body: "Pays when the AI verdict passes at 90%+", icon: Zap },
  one_tap: { label: "One tap", body: "Plex checks, the poster taps approve", icon: Hand },
  manual: { label: "Manual", body: "The poster reviews every item", icon: UserCheck },
} as const;

function BriefCard({ data }: { data: TaskPage }) {
  const { task, role } = data;
  const Mode = MODE[task.verificationMode];
  const seesCode = role === "poster" || role === "assignee";
  return (
    <Card>
      <CardHeader className="px-5" title="The brief" description="What the worker sees, and what the proof must show." />
      <div className="px-5 pt-3">
        <p className="text-[14px] leading-relaxed text-pretty text-ink-2">{task.description}</p>
        {task.brief && task.brief !== task.description ? (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            <span className="text-faint">Asked as</span> “{task.brief}”
          </p>
        ) : null}
      </div>

      <dl className="mx-5 mt-5 grid grid-cols-1 gap-x-8 gap-y-5 rounded-[14px] bg-canvas/70 px-5 py-5 sm:grid-cols-2 xl:grid-cols-3">
        <Fact icon={<Clock />} label="Window" foot={timeLeft(task)}>
          {windowLabel(task.windowStart, task.windowEnd)}
        </Fact>
        <Fact icon={<MapPin />} label="Where" foot={task.location?.radiusM ? `Proof within ${task.location.radiusM} m` : undefined}>
          {task.location ? task.location.label : "Remote"}
        </Fact>
        <Fact icon={<Wallet />} label="Payout" foot="PayPal Payouts, on proof">
          {payoutSummary(task.payout)}
        </Fact>
        <Fact icon={<Mode.icon />} label="Verification" foot={Mode.body}>
          {Mode.label}
        </Fact>
        <Fact icon={<Cpu />} label="Who can take it" foot={data.digital ? "Text, files or links" : "Someone on the ground"}>
          {WHO[task.workerType ?? "human"]}
        </Fact>
        <Fact
          icon={<ShieldCheck />}
          label="Checked by"
          foot={data.digital ? "Plex's rule decides" : "Photos, time, place, code"}
        >
          {data.digital ? "Three blind proofer agents" : "The proof engine"}
        </Fact>
      </dl>

      <div className="px-5 pt-6 pb-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink">Proof spec</div>
          <span className="tabular text-[12px] text-faint">
            {task.proofSpec.length} item{task.proofSpec.length === 1 ? "" : "s"}
          </span>
        </div>
        <ol className="-mx-3 mt-1.5">
          {task.proofSpec.map((s, i) => (
            <li key={i} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] px-3 py-3 transition-colors hover:bg-sunken/70">
              <SpecIcon type={s.type} className="size-5 text-ink-2" />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-ink">{s.label}</span>
                {s.description && s.description !== s.label ? (
                  <span className="block text-[12.5px] leading-snug text-muted">{s.description}</span>
                ) : null}
              </span>
              <span className="tabular text-[11.5px] text-faint capitalize">{s.type === "text" ? "note" : s.type}</span>
            </li>
          ))}
        </ol>
        {data.digital ? (
          <div className="mt-3 rounded-[14px] bg-[linear-gradient(150deg,var(--color-green-50),var(--color-green-100)_80%)] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-ink">Done means</span>
              {task.autoHire ? <span className="text-[12px] font-medium text-green-800">Hands-free</span> : null}
            </div>
            <ul className="mt-2 space-y-1.5 text-[12.5px] text-ink-2">
              {(task.criteria ?? defaultCriteria(task.proofSpec)).map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-3.5 flex-none text-green-700" strokeWidth={2.2} />
                  <span>
                    {criterionLabel(c, task.proofSpec)} <span className="text-faint">· checked by code</span>
                  </span>
                </li>
              ))}
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 flex-none text-green-700" strokeWidth={2.2} />
                <span>Three blind proofer agents pass it, by Plex&apos;s majority rule</span>
              </li>
            </ul>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-4 rounded-[14px] bg-[linear-gradient(150deg,var(--color-steel-50),var(--color-steel-100)_80%)] py-3.5 pr-3.5 pl-4">
            <span className="text-[12.5px] leading-snug text-steel-800">
              <span className="font-medium">Challenge code.</span> Shown in one photo, so proof can&apos;t be prepared in advance.
            </span>
            <span
              className={cn(
                "flex-none rounded-[10px] px-3 py-1.5 font-mono text-[15px] font-semibold tracking-wide",
                seesCode ? "bg-surface text-ink shadow-card" : "bg-white/50 text-steel-500",
              )}
            >
              {seesCode ? task.challengeCode : "on accept"}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

const WHO = { human: "A person", either: "A person or an AI agent", agent: "An AI agent" } as const;

function Fact({ icon, label, foot, children }: { icon: React.ReactNode; label: string; foot?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-3">
      <span className="mt-px text-ink-2 [&_svg]:size-[18px] [&_svg]:stroke-[1.9]">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[12px] text-faint">{label}</dt>
        <dd className="mt-0.5 text-[13.5px] leading-snug font-medium text-ink">{children}</dd>
        {foot ? <dd className="mt-0.5 text-[12px] leading-snug text-muted">{foot}</dd> : null}
      </div>
    </div>
  );
}

function TaskReceipts({ receipts }: { receipts: TaskPage["receipts"] }) {
  if (!receipts.length) return null;
  // The newest kind of money movement leads: refund, then payout, then funding.
  const rank = { refund: 3, payout: 2, task_funding: 1 } as Record<string, number>;
  const latest = [...receipts].sort((a, b) => (rank[b.kind] ?? 0) - (rank[a.kind] ?? 0) || b.occurredAt - a.occurredAt)[0]!;
  const rest = receipts.filter((r) => r._id !== latest._id);
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between px-1">
        <div className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink">Receipts</div>
        <div className="tabular text-[12px] text-faint">
          {receipts.length} for this task
        </div>
      </div>
      <Link href={`/receipts/${latest._id}`} className="block rounded-lg transition-shadow hover:shadow-hover">
        <ReceiptCard receipt={latest} />
      </Link>
      {rest.length ? (
        <Card className="p-1.5">
          {rest.map((r) => (
            <ReceiptRow key={r._id} receipt={r} href={`/receipts/${r._id}`} />
          ))}
        </Card>
      ) : null}
    </section>
  );
}
