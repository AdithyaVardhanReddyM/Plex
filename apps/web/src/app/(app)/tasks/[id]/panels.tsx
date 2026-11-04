"use client";

import Link from "next/link";
import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Camera,
  Check,
  CircleAlert,
  Clock,
  Hourglass,
  Loader2,
  Lock,
  MessageSquareQuote,
  RefreshCw,
  RotateCcw,
  Scale,
  Send,
  Upload,
  Users,
} from "lucide-react";
import { api } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, Input, Label, Textarea } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { isPosterPersona, useAs } from "@/components/tasks/persona";
import { useFund } from "@/components/tasks/use-fund";
import { useRun } from "@/components/tasks/use-run";
import {
  CheckList,
  MatchScore,
  PolicyLine,
  SpecIcon,
  VerdictPill,
  verdictRows,
} from "@/components/tasks/task-ui";
import { cn, formatCents, relativeTime, shortDate } from "@/lib/utils";
import type { TaskPage } from "./task-detail";

function ErrorLine({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-start gap-2 text-[12.5px] leading-snug text-disputed" role="alert">
      <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} /> {message}
    </p>
  );
}

function Panel({
  tone = "neutral",
  icon,
  title,
  body,
  children,
}: {
  tone?: "neutral" | "green" | "steel" | "amber" | "red";
  icon: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const chip = {
    neutral: "bg-sunken text-ink-2",
    green: "bg-green-50 text-green-700",
    steel: "bg-steel-50 text-steel-600",
    amber: "bg-refunded-bg text-refunded",
    red: "bg-disputed-bg text-disputed",
  }[tone];
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3.5 px-5 py-4">
        <span className={cn("flex size-9 items-center justify-center rounded-md [&_svg]:size-[18px]", chip)}>{icon}</span>
        <div className="min-w-0 self-center">
          <div className="text-[15px] leading-snug font-semibold tracking-[-0.01em] text-ink">{title}</div>
          {body ? <div className="mt-1 text-[13px] leading-relaxed text-muted">{body}</div> : null}
        </div>
      </div>
      {children ? <div className="border-t border-line bg-canvas/60 px-5 py-4">{children}</div> : null}
    </Card>
  );
}

// ── What happens next ────────────────────────────────────────────────────────

export function ActionPanel({ data }: { data: TaskPage }) {
  const as = useAs();
  const { task, role, assignee, proof, poster } = data;
  const release = useAction(api.taskMoney.release);
  const refund = useAction(api.taskMoney.refund);
  const cancelDraft = useMutation(api.tasks.cancelDraft);
  const reject = useMutation(api.proofs.reject);
  const contest = useMutation(api.proofs.contest);
  const { fund, busy: funding, error: fundError } = useFund();
  const { run, busy, errorFor } = useRun();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const isPoster = role === "poster";
  const workerFirst = assignee?.name.split(" ")[0] ?? "the worker";
  const posterFirst = poster?.name.split(" ")[0] ?? "the poster";
  const payTo = (
    <>
      Approve and pay <Amount cents={payoutFor(data)} size="md" className="text-white" />
    </>
  );

  switch (task.status) {
    case "draft":
      if (!isPoster)
        return <Panel icon={<Hourglass />} title="Not funded yet" body="This task opens once the poster funds it through PayPal." />;
      return (
        <Panel
          tone="steel"
          icon={<Lock />}
          title="Fund it to open the task"
          body="PayPal authorizes the payout now and Plex holds it. You're charged only when you approve the proof."
        >
          <PolicyLine pot={data.policy?.potName} outcome={data.policy?.outcome} ruleText={data.policy?.ruleText} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="brand"
              onClick={() => fund(task._id)}
              disabled={funding || data.policy?.outcome === "deny"}
            >
              {funding ? <Loader2 className="animate-spin" /> : null}
              {funding ? "Opening PayPal…" : <>Fund <Amount cents={task.fundingCents} size="md" className="text-white" /> with PayPal</>}
            </Button>
            <Button variant="ghost" onClick={() => run("cancel", () => cancelDraft({ id: task._id, as }))} disabled={!!busy}>
              Delete draft
            </Button>
          </div>
          <div className="mt-3">
            <ErrorLine message={fundError ?? errorFor("cancel")} />
          </div>
        </Panel>
      );

    case "open":
      if (isPoster)
        return (
          <Panel
            tone="green"
            icon={<Users />}
            title={data.applications.length ? `${data.applications.length} ${data.applications.length === 1 ? "person has" : "people have"} applied` : "Open and funded"}
            body={
              data.applications.length
                ? "Match ranked them below. Accept one to start; the money stays held until the proof passes."
                : "Your payout is held by PayPal. People nearby can apply now."
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12.5px] text-muted">Changed your mind? Cancelling voids the hold; you&apos;re never charged.</span>
              <Button variant="danger" size="sm" onClick={() => run("refund", () => refund({ taskId: task._id, as }))} disabled={!!busy}>
                {busy === "refund" ? <Loader2 className="animate-spin" /> : <RotateCcw />} Cancel task
              </Button>
            </div>
            <div className="mt-2">
              <ErrorLine message={errorFor("refund")} />
            </div>
          </Panel>
        );
      return null;

    case "assigned":
      if (role === "assignee")
        return (
          <Panel
            tone="green"
            icon={<Camera />}
            title="You're on it"
            body={
              <>
                Write <span className="rounded-[5px] bg-surface px-1.5 py-0.5 font-mono text-[12.5px] font-medium text-ink shadow-card">{task.challengeCode}</span> on paper and show it in one photo. Upload before the window ends.
              </>
            }
          >
            <Link href={`/tasks/${task._id}/proof`} className={buttonVariants({ variant: "primary" })}>
              <Upload /> Upload proof
            </Link>
          </Panel>
        );
      return (
        <Panel
          tone="steel"
          icon={<Clock />}
          title={isPoster ? `Waiting for ${workerFirst}'s proof` : `${workerFirst} is on it`}
          body={isPoster ? `${workerFirst} has the challenge code. You'll see each check resolve here when the proof arrives.` : undefined}
        />
      );

    case "verifying":
      return (
        <Panel
          tone="steel"
          icon={<Loader2 className="animate-spin" />}
          title="Checking the proof"
          body="Each item is checked against the spec, plus the time window, the place and the challenge code."
        />
      );

    case "submitted": {
      if (!isPoster)
        return (
          <Panel
            tone="steel"
            icon={<Hourglass />}
            title={`Waiting for ${posterFirst} to approve`}
            body="The proof engine is done. You're paid by PayPal as soon as it's approved."
          />
        );
      const v = proof?.verdict;
      const autoBlocked = task.verificationMode === "auto" && v && (v.model === "heuristic" || v.confidence < 0.9 || v.result !== "pass");
      return (
        <Panel
          tone={v?.result === "pass" ? "green" : v?.result === "fail" ? "red" : "amber"}
          icon={<BadgeCheck />}
          title={v?.result === "pass" ? "Proof passed. Approve to pay." : v?.result === "fail" ? "Proof failed some checks" : "Proof needs your eye"}
          body={
            autoBlocked
              ? "Automatic release needs an AI verdict at 90% or more, so this one waits for your tap."
              : `Approving captures ${formatCents(payoutFor(data))} from the hold and pays ${workerFirst} through PayPal Payouts.`
          }
        >
          {rejecting ? (
            <div className="grid gap-2">
              <Label htmlFor="reason" className="mb-0">
                What&apos;s wrong with it?
              </Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="The menu photo is blurry and the prices can't be read."
                className="min-h-20 bg-surface"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  onClick={() =>
                    run("reject", () => reject({ proofId: proof!._id, reason, as })).then((ok) => ok && setRejecting(false))
                  }
                  disabled={!!busy || !reason.trim()}
                >
                  {busy === "reject" ? <Loader2 className="animate-spin" /> : null} Reject proof
                </Button>
                <Button variant="ghost" onClick={() => setRejecting(false)}>
                  Back
                </Button>
              </div>
              <span className="text-[12px] text-muted">The money stays held while {workerFirst} can contest. You can refund after.</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="brand" onClick={() => run("release", () => release({ taskId: task._id, as }))} disabled={!!busy}>
                {busy === "release" ? <Loader2 className="animate-spin" /> : <Check />}
                {busy === "release" ? "Paying through PayPal…" : payTo}
              </Button>
              <Button variant="secondary" onClick={() => setRejecting(true)} disabled={!!busy}>
                Reject
              </Button>
            </div>
          )}
          <div className="mt-2">
            <ErrorLine message={errorFor("release") ?? errorFor("reject")} />
          </div>
        </Panel>
      );
    }

    case "approved":
      return (
        <Panel tone="green" icon={<Loader2 className="animate-spin" />} title="Paying out" body="Capturing the held funds and sending the payout through PayPal." />
      );

    case "paid": {
      const payout = data.receipts.find((r) => r.kind === "payout");
      return (
        <Panel
          tone="green"
          icon={<Check />}
          title={
            <>
              {isPoster ? `Paid ${assignee?.name ?? "the worker"}` : role === "assignee" ? "You were paid" : "Paid"}{" "}
              <Amount cents={payout?.amountCents ?? payoutFor(data)} size="md" className="text-green-700" />
            </>
          }
          body={
            payout?.state === "paid"
              ? "PayPal confirmed the payout landed. Both sides have the receipt."
              : "Sent by PayPal Payouts. The receipt updates when PayPal confirms it landed."
          }
        />
      );
    }

    case "rejected":
      if (isPoster)
        return (
          <Panel
            tone="amber"
            icon={<CircleAlert />}
            title="You rejected the proof"
            body={`“${proof?.rejectReason}”. The money is still held while ${workerFirst} can contest or re-upload.`}
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => run("refund", () => refund({ taskId: task._id, as }))} disabled={!!busy}>
                {busy === "refund" ? <Loader2 className="animate-spin" /> : <RotateCcw />} Refund me
              </Button>
              <Button variant="ghost" onClick={() => run("release", () => release({ taskId: task._id, as }))} disabled={!!busy}>
                Approve anyway
              </Button>
            </div>
            <div className="mt-2">
              <ErrorLine message={errorFor("refund") ?? errorFor("release")} />
            </div>
          </Panel>
        );
      if (role === "assignee")
        return (
          <Panel tone="amber" icon={<CircleAlert />} title={`${posterFirst} rejected your proof`} body={`“${proof?.rejectReason}”`}>
            <div className="grid gap-2">
              <Label htmlFor="contest" className="mb-0">
                Contest it
              </Label>
              <Textarea
                id="contest"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="The prices are readable at full size; I can send a closer photo."
                className="min-h-20 bg-surface"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => run("contest", () => contest({ proofId: proof!._id, note, as }))} disabled={!!busy || !note.trim()}>
                  {busy === "contest" ? <Loader2 className="animate-spin" /> : <Scale />} Contest
                </Button>
                <Link href={`/tasks/${task._id}/proof`} className={buttonVariants({ variant: "secondary" })}>
                  <Upload /> Upload new proof
                </Link>
              </div>
              <ErrorLine message={errorFor("contest")} />
            </div>
          </Panel>
        );
      return <Panel tone="amber" icon={<CircleAlert />} title="Proof rejected" />;

    case "disputed": {
      const m = proof?.mediation;
      return (
        <Panel
          tone="red"
          icon={<Scale />}
          title={isPoster ? `${workerFirst} contested your rejection` : "Contested: waiting for a decision"}
          body={
            <span className="block">
              <span className="block text-ink-2">“{proof?.contestNote}”</span>
            </span>
          }
        >
          <div className="rounded-md bg-surface p-3.5 ring-1 ring-line ring-inset">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                <Bot className="size-4 text-faint" strokeWidth={1.9} /> Mediator
                {m ? <span className="font-normal text-faint">· {m.model === "heuristic" ? "heuristic" : m.model}</span> : null}
              </span>
              {m ? (
                <Badge tone={m.recommendation === "release" ? "green" : m.recommendation === "refund" ? "amber" : "steel"}>
                  Suggests {m.recommendation}
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
              {m ? m.summary : <span className="text-muted">Reading the spec, the checks and both sides…</span>}
            </p>
          </div>
          {isPoster ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="brand" onClick={() => run("release", () => release({ taskId: task._id, as }))} disabled={!!busy}>
                {busy === "release" ? <Loader2 className="animate-spin" /> : <Check />} Release payment
              </Button>
              <Button variant="danger" onClick={() => run("refund", () => refund({ taskId: task._id, as }))} disabled={!!busy}>
                {busy === "refund" ? <Loader2 className="animate-spin" /> : <RotateCcw />} Refund me
              </Button>
            </div>
          ) : null}
          <div className="mt-2">
            <ErrorLine message={errorFor("release") ?? errorFor("refund")} />
          </div>
        </Panel>
      );
    }

    case "refunded":
      return (
        <Panel
          icon={<RotateCcw />}
          title={task.funding.authorizationId && !task.funding.captureId ? "Cancelled: the hold was voided" : "Refunded"}
          body="Nobody was paid for this task. The receipt shows what happened to the money."
        />
      );
    case "cancelled":
      return <Panel icon={<RotateCcw />} title="Cancelled" body="This draft was never funded." />;
  }
}

/** What the worker gets: the accepted ask, capped at what's held. */
export function payoutFor(data: TaskPage) {
  const accepted = data.applications.find((a) => a.status === "accepted" && a.applicantId === data.task.assigneeId);
  return accepted ? Math.min(accepted.askCents, data.task.fundingCents) : data.task.fundingCents;
}

// ── Proof ────────────────────────────────────────────────────────────────────

export function ProofPanel({ data }: { data: TaskPage }) {
  const { proof, task } = data;
  if (!proof) return null;
  const checking = proof.status === "checking";
  const rows = checking || !proof.verdict ? (proof.progress ?? []) : verdictRows(proof.verdict.checks);
  const v = proof.verdict;
  return (
    <Card>
      <CardHeader
        title="Proof"
        description={
          <>
            {data.assignee?.name ?? "Worker"} · submitted {relativeTime(proof._creationTime)}
            {data.proofCount > 1 ? ` · attempt ${data.proofCount}` : ""}
          </>
        }
        action={v && !checking ? <VerdictPill result={v.result} /> : <Badge tone="steel"><Loader2 className="animate-spin" /> Checking</Badge>}
      />
      <div className="mt-4 grid grid-cols-2 gap-2 px-5 sm:grid-cols-3">
        {task.proofSpec.map((s, i) => {
          const it = proof.items.find((x) => x.specIndex === i);
          if (s.type === "text" || s.type === "link")
            return (
              <div key={i} className="col-span-2 rounded-md bg-sunken p-3 sm:col-span-3">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-faint">
                  <SpecIcon type={s.type} className="size-3.5" /> {s.label}
                </div>
                <div className="mt-1 text-[13.5px] leading-relaxed break-words text-ink-2">
                  {s.type === "link" && it?.url ? (
                    <a href={it.url} target="_blank" rel="noreferrer" className="text-green-700 underline-offset-2 hover:underline">
                      {it.url}
                    </a>
                  ) : (
                    (it?.text ?? "—")
                  )}
                </div>
              </div>
            );
          return (
            <figure key={i} className="min-w-0">
              <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-sunken ring-1 ring-line ring-inset">
                {it?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt={s.label} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1.5 text-faint">
                    <SpecIcon type={s.type} className="size-5" />
                    <span className="text-[11.5px]">{it ? "Seeded, no image" : "Missing"}</span>
                  </div>
                )}
              </div>
              <figcaption className="mt-1.5 flex items-baseline justify-between gap-2 text-[12px]">
                <span className="truncate font-medium text-ink-2">{s.label}</span>
                {it?.capturedAt ? <span className="tabular flex-none text-faint">{shortDate(it.capturedAt).split(", ").pop()}</span> : null}
              </figcaption>
            </figure>
          );
        })}
      </div>
      {proof.note ? (
        <p className="mx-5 mt-4 flex gap-2 text-[13px] leading-relaxed text-ink-2">
          <MessageSquareQuote className="mt-0.5 size-4 flex-none text-faint" strokeWidth={1.9} /> {proof.note}
        </p>
      ) : null}
      <div className="mt-4 border-t border-line px-5 pt-1 pb-3">
        <CheckList rows={rows} />
      </div>
      {v && !checking ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-canvas/60 px-5 py-3 text-[12.5px] text-muted">
          <span className="min-w-0 flex-1 basis-64 text-ink-2">{v.summary}</span>
          <span className="tabular flex-none">
            {Math.round(v.confidence * 100)}% confident · {v.model === "heuristic" ? "Heuristic" : v.model}
          </span>
        </div>
      ) : null}
    </Card>
  );
}

// ── Applicants (poster) ──────────────────────────────────────────────────────

export function Applicants({ data }: { data: TaskPage }) {
  const as = useAs();
  const decide = useMutation(api.applications.decide);
  const rerank = useMutation(api.applications.rerank);
  const { run, busy, errorFor } = useRun();
  const { task, applications } = data;
  const canDecide = task.status === "open";

  return (
    <Card>
      <CardHeader
        title="Applicants"
        description="Ranked by Match: distance, rating, proof record and the ask against your budget."
        action={
          applications.length && canDecide ? (
            <Button variant="ghost" size="sm" onClick={() => run("rerank", () => rerank({ taskId: task._id, as }))} disabled={!!busy}>
              <RefreshCw className={cn(busy === "rerank" && "animate-spin")} /> Re-rank
            </Button>
          ) : null
        }
      />
      {applications.length === 0 ? (
        <div className="px-5 pt-3 pb-5 text-[13px] text-muted">
          {task.status === "draft" ? "People can apply once it's funded." : "No one yet. Applications appear here, ranked as they arrive."}
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {applications.map((a, i) => {
            const diff = a.askCents - task.fundingCents;
            return (
              <li key={a._id} className={cn("px-5 py-4", a.status === "declined" && "opacity-55")}>
                <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3.5 sm:grid-cols-[40px_minmax(0,1fr)_auto]">
                  <MatchScore score={a.matchScore} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {a.applicant ? <Avatar name={a.applicant.name} color={a.applicant.avatarColor} size={22} /> : null}
                      <span className="text-[14px] font-medium text-ink">{a.applicant?.name}</span>
                      {i === 0 && a.matchScore !== undefined && canDecide ? <Badge tone="green">Best match</Badge> : null}
                      {a.viaAgent ? (
                        <Badge tone="outline">
                          <Bot /> Their agent
                        </Badge>
                      ) : null}
                      {a.status === "accepted" ? <Badge tone="steel"><Check /> Accepted</Badge> : null}
                    </div>
                    <div className="mt-1 text-[12.5px] leading-snug text-muted">
                      {a.matchReason ?? <span className="text-faint">Match is ranking…</span>}
                    </div>
                    {a.message ? <p className="mt-2 text-[13px] leading-relaxed text-ink-2">“{a.message}”</p> : null}
                  </div>
                  <div className="col-span-2 mt-3 flex items-center justify-between gap-3 sm:col-span-1 sm:mt-0 sm:flex-col sm:items-end sm:justify-start">
                    <div className="sm:text-right">
                      <Amount cents={a.askCents} size="md" />
                      <div className={cn("text-[11.5px]", diff > 0 ? "text-refunded" : "text-faint")}>
                        {diff === 0 ? "posted price" : diff > 0 ? `+${formatCents(diff)} over budget` : `${formatCents(-diff)} under`}
                      </div>
                    </div>
                    {canDecide && a.status === "pending" ? (
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => run(`no-${a._id}`, () => decide({ applicationId: a._id, accept: false, as }))} disabled={!!busy}>
                          Decline
                        </Button>
                        <Button size="sm" onClick={() => run(`yes-${a._id}`, () => decide({ applicationId: a._id, accept: true, as }))} disabled={!!busy}>
                          {busy === `yes-${a._id}` ? <Loader2 className="animate-spin" /> : null} Accept
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
                {diff > 0 && a.status === "pending" && canDecide ? (
                  <p className="mt-2 pl-[54px] text-[12px] text-faint">Only {formatCents(task.fundingCents)} is held, so that&apos;s the most they can be paid.</p>
                ) : null}
                <div className="pl-[54px]">
                  <ErrorLine message={errorFor(`yes-${a._id}`) ?? errorFor(`no-${a._id}`)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── Apply (worker) ───────────────────────────────────────────────────────────

export function ApplyCard({ data }: { data: TaskPage }) {
  const as = useAs();
  const apply = useMutation(api.applications.apply);
  const withdraw = useMutation(api.applications.withdraw);
  const { run, busy, errorFor } = useRun();
  const { task, myApplication, me } = data;
  const [ask, setAsk] = useState(() => (task.fundingCents / 100).toFixed(task.fundingCents % 100 ? 2 : 0));
  const [message, setMessage] = useState("");

  if (task.status === "draft") return null;

  if (myApplication)
    return (
      <Panel
        tone={myApplication.status === "declined" ? "neutral" : "steel"}
        icon={<Send />}
        title={myApplication.status === "declined" ? "The poster chose someone else" : "You applied"}
        body={
          <>
            Asking <span className="font-medium text-ink">{formatCents(myApplication.askCents)}</span>
            {myApplication.matchScore !== undefined ? <> · Match {myApplication.matchScore}: {myApplication.matchReason}</> : " · Match is ranking you…"}
          </>
        }
      >
        {myApplication.status === "pending" ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-muted">You&apos;ll get the challenge code when you&apos;re accepted.</span>
            <Button variant="ghost" size="sm" onClick={() => run("withdraw", () => withdraw({ applicationId: myApplication._id, as }))} disabled={!!busy}>
              Withdraw
            </Button>
          </div>
        ) : null}
        <ErrorLine message={errorFor("withdraw")} />
      </Panel>
    );

  if (!me) return null;
  return (
    <Card>
      <CardHeader
        title="Take this task"
        description={
          isPosterPersona(me)
            ? "Switch “Acting as” to a demo worker to apply."
            : `Applying as ${me.name}. Match ranks you against the others.`
        }
      />
      <div className="grid gap-3 px-5 pt-4 pb-5">
        <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
          <div>
            <Label htmlFor="ask">Your ask</Label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">$</span>
              <Input id="ask" inputMode="decimal" value={ask} onChange={(e) => setAsk(e.target.value.replace(/[^\d.]/g, ""))} className="tabular pl-6" />
            </div>
          </div>
          <div>
            <Label htmlFor="msg">Message</Label>
            <Input id="msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="I'm two blocks away and can be there by 3." />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-muted">Posted at {formatCents(task.fundingCents)}, held by PayPal.</span>
          <Button
            onClick={() => run("apply", () => apply({ taskId: task._id, askCents: Math.round(Number(ask) * 100), message, as }))}
            disabled={!!busy || isPosterPersona(me) || !Number(ask)}
          >
            {busy === "apply" ? <Loader2 className="animate-spin" /> : <ArrowRight />} Apply
          </Button>
        </div>
        <ErrorLine message={errorFor("apply")} />
      </div>
    </Card>
  );
}

// ── Money ────────────────────────────────────────────────────────────────────

const STEPS = [
  { key: "authorized", label: "Held", sub: "Authorized" },
  { key: "captured", label: "Captured", sub: "On approval" },
  { key: "released", label: "Paid out", sub: "Payouts" },
] as const;

export function MoneyCard({ data }: { data: TaskPage }) {
  const { task } = data;
  const f = task.funding;
  const order = { unfunded: -1, authorized: 0, captured: 1, released: 2, refunded: -2 }[f.state];
  const refunded = f.state === "refunded";
  const headline =
    f.state === "unfunded"
      ? "Not funded yet"
      : refunded
        ? f.captureId
          ? "Refunded"
          : "Hold voided"
        : f.state === "released"
          ? "Paid out"
          : "Held until proof passes";
  return (
    <Card className="overflow-hidden">
      <div className="h-1 w-full" style={{ background: "var(--metal)" }} aria-hidden />
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={cn("flex items-center gap-1.5 text-[13px] font-medium", f.state === "released" ? "text-green-700" : refunded ? "text-refunded" : "text-steel-700")}>
              {f.state === "released" ? <Check className="size-4" strokeWidth={2} /> : refunded ? <RotateCcw className="size-4" strokeWidth={1.9} /> : <Lock className="size-4" strokeWidth={1.9} />}
              {headline}
            </div>
            <div className="mt-2">
              <Amount cents={task.fundingCents} size="xl" className={cn(refunded && "text-muted line-through decoration-1")} />
            </div>
          </div>
        </div>
        <ol className="mt-5 grid grid-cols-3 gap-2">
          {STEPS.map((s, i) => {
            const done = !refunded && order >= i;
            return (
              <li key={s.key} className="min-w-0">
                <div className={cn("h-1 rounded-full transition-colors duration-500", done ? (i === 2 ? "bg-green-500" : "bg-steel-400") : "bg-sunken")} />
                <div className={cn("mt-2 text-[12.5px] font-medium", done ? "text-ink" : "text-faint")}>{s.label}</div>
                <div className="truncate text-[11.5px] text-faint">{s.sub}</div>
              </li>
            );
          })}
        </ol>
      </div>
      {f.orderId ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-line bg-canvas/60 px-5 py-3">
          {(
            [
              ["order", f.orderId],
              ["authorization", f.authorizationId],
              ["capture", f.captureId],
            ] as const
          )
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <span key={k} className="min-w-0 truncate text-[11.5px] text-faint">
                PayPal {k} <span className="font-mono text-muted">{v}</span>
              </span>
            ))}
        </div>
      ) : null}
    </Card>
  );
}
