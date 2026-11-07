"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, CircleAlert, Clock, Hand, ListChecks, Loader2, MapPin, ShieldCheck, UserCheck, Zap } from "lucide-react";
import { payoutSummary, windowLabel } from "@plex/backend/lib/taskRules";
import { criterionLabel, defaultCriteria } from "@plex/backend/lib/hire";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Avatar, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ReceiptCard, ReceiptRow } from "@/components/receipt/receipt";
import { PersonaSwitch, useAs } from "@/components/tasks/persona";
import { CategoryLabel, SpecIcon, StatusBadge, errorMessage, timeLeft } from "@/components/tasks/task-ui";
import { cn } from "@/lib/utils";
import { ActionPanel, Applicants, ApplyCard, ConnectionsCard, MoneyCard, PayPalDeskCard, ProofPanel } from "./panels";

export type TaskPage = NonNullable<FunctionReturnType<typeof api.tasks.get>>;

export function TaskDetail({ id }: { id: string }) {
  const as = useAs();
  const data = useQuery(api.tasks.get, { id: id as Id<"tasks">, as });
  const returning = useFundingReturn(id as Id<"tasks">, data);

  if (data === undefined)
    return (
      <div>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-6 h-8 w-[28rem] max-w-full" />
        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  if (data === null)
    return (
      <Card>
        <EmptyState icon={<ListChecks />} title="Task not found" body="It may have been removed." />
      </Card>
    );

  const { task, role, poster } = data;
  const isPoster = role === "poster";

  return (
    <div className="animate-rise">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/tasks" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Tasks
        </Link>
        <PersonaSwitch />
      </div>

      <header className="pb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge status={task.status} />
          <CategoryLabel task={task} />
        </div>
        <div className="mt-3 text-[26px] leading-tight font-semibold tracking-[-0.025em] text-balance text-ink">{task.title}</div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          {poster ? <Avatar name={poster.name} color={poster.avatarColor} size={20} /> : null}
          <span className="text-ink-2">{isPoster ? "You" : (poster?.name ?? "Someone")}</span>
          {task.agentLabel ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-faint">via</span>
              <Bot className="size-3.5 text-faint" strokeWidth={1.9} />
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

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
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
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-10">
          <MoneyCard data={data} />
          <PayPalDeskCard data={data} />
          <TaskReceipts receipts={data.receipts} />
        </aside>
      </div>
    </div>
  );
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
        "mb-5 flex items-center gap-2.5 rounded-md px-4 py-3 text-[13.5px] ring-1 ring-inset",
        tone === "steel" && "bg-steel-50 text-steel-700 ring-steel-100",
        tone === "red" && "bg-disputed-bg text-disputed ring-disputed/15",
        tone === "neutral" && "bg-surface text-ink-2 ring-line",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      {onClose ? (
        <button type="button" onClick={onClose} className="text-[13px] font-medium underline-offset-2 hover:underline">
          Dismiss
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
      <div className="px-5 pt-4">
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">The task</div>
        <p className="mt-2 text-[14px] leading-relaxed text-pretty text-ink-2">{task.description}</p>
        {task.brief && task.brief !== task.description ? (
          <p className="mt-3 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-muted">
            Asked as: “{task.brief}”
          </p>
        ) : null}
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-px border-y border-line bg-line sm:grid-cols-2">
        <Fact icon={<Clock />} label="Window">
          {windowLabel(task.windowStart, task.windowEnd)}
          <span className="block text-[12.5px] text-muted">{timeLeft(task)}</span>
        </Fact>
        <Fact icon={<MapPin />} label="Where">
          {task.location ? task.location.label : "Remote"}
          {task.location?.radiusM ? <span className="block text-[12.5px] text-muted">Proof within {task.location.radiusM} m</span> : null}
        </Fact>
        <Fact icon={<ShieldCheck />} label="Payout">
          {payoutSummary(task.payout)}
          <span className="block text-[12.5px] text-muted">Paid by PayPal Payouts on proof</span>
        </Fact>
        <Fact icon={<Mode.icon />} label="Verification">
          {Mode.label}
          <span className="block text-[12.5px] text-muted">{Mode.body}</span>
        </Fact>
        <Fact icon={<Bot />} label="Who can take it">
          {WHO[task.workerType ?? "human"]}
          <span className="block text-[12.5px] text-muted">
            {data.digital ? "Delivered as text, files or links" : "Needs someone on the ground"}
          </span>
        </Fact>
        <Fact icon={<UserCheck />} label="Checked by">
          {data.digital ? "Three blind proofer agents" : "The proof engine"}
          <span className="block text-[12.5px] text-muted">{data.digital ? "Plex's rule decides the verdict" : "Photos, time, place, challenge code"}</span>
        </Fact>
      </dl>
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-medium text-ink">Proof spec</div>
          <span className="text-[12px] text-faint">{task.proofSpec.length} items</span>
        </div>
        <ol className="mt-2 divide-y divide-line">
          {task.proofSpec.map((s, i) => (
            <li key={i} className="grid grid-cols-[32px_minmax(0,1fr)] items-start gap-3 py-2.5">
              <span className="flex size-8 items-center justify-center rounded-sm bg-sunken text-ink-2">
                <SpecIcon type={s.type} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-ink">{s.label}</span>
                <span className="block text-[12.5px] leading-snug text-muted">{s.description}</span>
              </span>
            </li>
          ))}
        </ol>
        {data.digital ? (
          <div className="mt-3 rounded-md bg-canvas px-3.5 py-3 ring-1 ring-line ring-inset">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-ink">Done means</span>
              {task.autoHire ? <span className="text-[12px] font-medium text-green-700">Hands-free</span> : null}
            </div>
            <ul className="mt-1.5 space-y-1 text-[12.5px] text-ink-2">
              {(task.criteria ?? defaultCriteria(task.proofSpec)).map((c, i) => (
                <li key={i}>
                  {criterionLabel(c, task.proofSpec)} <span className="text-faint">· checked by code</span>
                </li>
              ))}
              <li>Three blind proofer agents pass it, by Plex&apos;s majority rule</li>
            </ul>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-steel-50/80 px-3.5 py-3 ring-1 ring-steel-100 ring-inset">
            <span className="text-[12.5px] leading-snug text-steel-700">
              Challenge code: shown in one photo, so proof can&apos;t be prepared in advance
            </span>
            <span
              className={cn(
                "flex-none rounded-[6px] px-2 py-1 font-mono text-[13px] font-medium",
                seesCode ? "bg-surface text-ink shadow-card" : "bg-steel-100 text-steel-500",
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

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2.5 bg-surface px-5 py-3.5">
      <span className="mt-0.5 text-faint [&_svg]:size-4 [&_svg]:stroke-[1.9]">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[12px] font-medium text-faint">{label}</dt>
        <dd className="mt-0.5 text-[13.5px] leading-snug text-ink">{children}</dd>
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
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <div className="text-[13px] font-medium text-ink">Receipts</div>
        <div className="text-[12px] text-faint">Every movement of this task&apos;s money</div>
      </div>
      <Link href={`/receipts/${latest._id}`} className="block rounded-lg transition-transform hover:-translate-y-px">
        <ReceiptCard receipt={latest} />
      </Link>
      {rest.length ? (
        <Card className="px-2 py-2">
          {rest.map((r) => (
            <ReceiptRow key={r._id} receipt={r} href={`/receipts/${r._id}`} />
          ))}
        </Card>
      ) : null}
    </div>
  );
}
