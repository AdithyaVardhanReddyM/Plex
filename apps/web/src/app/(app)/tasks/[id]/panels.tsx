"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
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
  Landmark,
  Link2,
  Loader2,
  Lock,
  MessageSquareQuote,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  Send,
  Star,
  Upload,
  Users,
  Wand2,
} from "lucide-react";
import { api } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, Input, Label, Textarea } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { isPosterPersona, useAs } from "@/components/tasks/persona";
import { useAutoPay, useFund } from "@/components/tasks/use-fund";
import { useRun } from "@/components/tasks/use-run";
import {
  CheckList,
  Deliverable,
  MatchScore,
  PolicyLine,
  SpecIcon,
  VerdictPill,
  errorMessage,
  verdictRows,
} from "@/components/tasks/task-ui";
import { isImageSpec, needsAccountAction } from "@plex/backend/lib/hire";
import { servicesIn } from "@plex/backend/lib/connect";
import type { FunctionReturnType } from "convex/server";
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

/**
 * Connections: the poster lends this task access to an account (GitHub, or any
 * MCP server) so the hired agent can act there. Tokens are encrypted, never
 * shown again, and deleted when the task is paid or refunded.
 */
export function ConnectionsCard({ data }: { data: TaskPage }) {
  const as = useAs();
  const { task } = data;
  const conn = useQuery(api.connections.list, { taskId: task._id, as });
  const add = useAction(api.connections.add);
  const remove = useMutation(api.connections.remove);
  const { run, busy, errorFor } = useRun();
  const [kind, setKind] = useState<"github" | "mcp">("github");
  const [token, setToken] = useState("");
  const [url, setUrl] = useState("");
  const [allow, setAllow] = useState("");
  const needed = needsAccountAction(task);
  if (!conn || (!needed && !conn.rows.length) || !data.digital) return null;
  const live = conn.rows.filter((r) => !r.wiped);
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Link2 className="size-4 text-faint" strokeWidth={1.9} /> Connections
            {live.length ? <Badge tone="green">{live.length} connected</Badge> : needed ? <Badge tone="amber">Needed</Badge> : null}
          </span>
        }
        description="Lend the hired agent access to an account for this task only. Plex encrypts the token, only the agent's tool calls and the proof check use it, and it's deleted when the task is paid or refunded."
      />
      {conn.rows.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {conn.rows.map((r) => (
            <li key={r._id} className={cn("flex items-center justify-between gap-3 px-5 py-3", r.wiped && "opacity-60")}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                  {r.label} <Badge tone={r.kind === "github" ? "steel" : "neutral"}>{r.kind === "github" ? "GitHub MCP" : "MCP server"}</Badge>
                </div>
                <div className="truncate text-[12px] text-faint">
                  {r.url} · {r.wiped ? "token deleted" : r.hasToken ? "token encrypted" : "no token"}
                  {r.allow.length ? ` · only ${r.allow.join(", ")}` : ""}
                </div>
              </div>
              {conn.canEdit && !r.wiped ? (
                <Button variant="ghost" size="sm" onClick={() => run(`rm-${r._id}`, () => remove({ connectionId: r._id, as }))} disabled={!!busy}>
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {conn.canEdit && live.length < 3 ? (
        <div className="grid gap-3 border-t border-line px-5 pt-4 pb-5">
          {!conn.ready ? <p className="text-[12.5px] text-disputed">This deployment has no CONNECTIONS_KEY, so it can&apos;t store tokens.</p> : null}
          <div className="inline-flex self-start rounded-sm bg-sunken p-0.5" role="group" aria-label="Connection type">
            {(
              [
                ["github", "GitHub"],
                ["mcp", "Any MCP server"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                aria-pressed={kind === value}
                className={cn(
                  "inline-flex h-7 items-center rounded-[6px] px-3 text-[13px] font-medium transition-colors",
                  kind === value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {kind === "mcp" ? (
            <>
              <RegistrySearch task={task} onPick={(u) => setUrl(u)} />
              <div>
                <Label htmlFor="conn-url">MCP server URL (https)</Label>
                <Input id="conn-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" />
                <p className="mt-1 text-[12px] leading-snug text-faint">
                  One URL for thousands of apps works too: Zapier MCP, Composio or Pipedream give you a personal MCP URL with the logins already handled. Plex encrypts the URL; only its host is shown.
                </p>
              </div>
            </>
          ) : null}
          <div>
            <Label htmlFor="conn-token">{kind === "github" ? "GitHub token" : "Bearer token (optional)"}</Label>
            <Input id="conn-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={kind === "github" ? "github_pat_…" : ""} />
            {kind === "github" ? (
              <p className="mt-1 text-[12px] leading-snug text-faint">
                Use a fine-grained token limited to the one repository, with Pull requests and Contents (read and write) and Checks (read). Plex uses GitHub&apos;s own MCP server; deleting, forking and settings tools are never offered to the agent.
              </p>
            ) : null}
          </div>
          {kind === "mcp" ? (
            <div>
              <Label htmlFor="conn-allow">Only these tools (optional)</Label>
              <Input id="conn-allow" value={allow} onChange={(e) => setAllow(e.target.value)} placeholder="search_docs, create_ticket" />
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <ErrorLine message={errorFor("connect")} />
            <Button
              variant="brand"
              size="sm"
              className="ml-auto"
              disabled={!!busy || !conn.ready || (kind === "github" ? token.trim().length < 20 : url.trim().length < 10)}
              onClick={() =>
                run("connect", async () => {
                  await add({
                    taskId: task._id,
                    kind,
                    url: kind === "mcp" ? url.trim() : undefined,
                    token: token.trim() || undefined,
                    allow: allow.split(",").map((s) => s.trim()).filter(Boolean),
                    as,
                  });
                  setToken("");
                  setUrl("");
                  setAllow("");
                })
              }
            >
              {busy === "connect" ? <Loader2 className="animate-spin" /> : <Link2 />} Connect
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
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
  const autoPay = useAutoPay(data.task.fundingCents, data.policy?.outcome);
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
          body={
            autoPay.on
              ? `Auto-pay holds the payout from your saved PayPal${autoPay.payerEmail ? ` (${autoPay.payerEmail})` : ""}, no popup. You're charged only when the proof passes.`
              : "PayPal authorizes the payout now and Plex holds it. You're charged only when you approve the proof."
          }
        >
          <PolicyLine pot={data.policy?.potName} outcome={data.policy?.outcome} ruleText={data.policy?.ruleText} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="brand"
              onClick={() => fund(task._id)}
              disabled={funding || data.policy?.outcome === "deny"}
            >
              {funding ? <Loader2 className="animate-spin" /> : null}
              {funding
                ? autoPay.on ? "Holding with auto-pay…" : "Opening PayPal…"
                : autoPay.on
                  ? <>Hold <Amount cents={task.fundingCents} size="md" className="text-white" /> with auto-pay</>
                  : <>Fund <Amount cents={task.fundingCents} size="md" className="text-white" /> with PayPal</>}
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
            title={data.applications.length ? `${data.applications.length} ${data.applications.length === 1 ? "bid or application" : "bids and applications"}` : "Open and funded"}
            body={
              data.applications.length
                ? task.autoHire
                  ? "Hands-free: Plex hires the best bid once the bidding settles. The money stays held until every check passes."
                  : "Match ranked them below. Accept one to start; the money stays held until the proof passes."
                : (task.workerType ?? "human") === "human"
                  ? "Your payout is held by PayPal. People nearby can apply now."
                  : "Your payout is held by PayPal. People can apply and AI agents are bidding."
            }
          >
            {data.digital ? <AgentBidding data={data} /> : null}
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
          icon={assignee?.kind === "agent" ? <Bot /> : <Clock />}
          title={isPoster ? (assignee?.kind === "agent" ? `${workerFirst} is working on it` : `Waiting for ${workerFirst}'s proof`) : `${workerFirst} is on it`}
          body={
            isPoster
              ? assignee?.kind === "agent"
                ? `An AI agent delivers in ${assignee.agent?.turnaround ?? "a few minutes"}. Three proofer agents score it before you approve.`
                : `${workerFirst} has the challenge code. You'll see each check resolve here when the proof arrives.`
              : undefined
          }
        />
      );

    case "verifying":
      return (
        <Panel
          tone="steel"
          icon={<Loader2 className="animate-spin" />}
          title="Checking the proof"
          body={
            data.digital
              ? "Each item is checked, then three proofer agents score the work without seeing each other. Plex's rule decides."
              : "Each item is checked against the spec, plus the time window, the place and the challenge code."
          }
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
        >
          {isPoster || data.review ? <ReviewBox data={data} /> : null}
        </Panel>
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

// ── Agents ──────────────────────────────────────────────────────────────────────────────

/** The poster opens a digital task to AI agents, or asks them to bid again. */
function AgentBidding({ data }: { data: TaskPage }) {
  const as = useAs();
  const invite = useMutation(api.houseAgents.invite);
  const openToAgents = useMutation(api.houseAgents.openToAgents);
  const { run, busy, errorFor } = useRun();
  const { task } = data;
  const human = (task.workerType ?? "human") === "human";
  const agentBids = data.applications.filter((a) => a.applicant?.kind === "agent").length;
  const fit = useQuery(api.agentBuilder.fit, { taskId: task._id });
  const names = fit?.fits.map((f) => f.name) ?? [];
  // Nobody on Plex can do it: offer to create an agent for it.
  if (!human && !agentBids && fit && fit.digital && !names.length)
    return (
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-refunded-bg px-3.5 py-3 ring-1 ring-refunded/15 ring-inset">
        <span className="flex min-w-0 items-start gap-2 text-[12.5px] leading-snug text-ink-2">
          <Bot className="mt-px size-4 flex-none text-faint" strokeWidth={1.9} />
          <span>
            <span className="font-medium text-ink">No agent on Plex can do this yet.</span> Create one for it: Plex&apos;s builder drafts the skills and tools, you check them, and it bids right away.
          </span>
        </span>
        <Link href={`/hire/new?task=${task._id}`} className={buttonVariants({ variant: "brand", size: "sm" })}>
          <Wand2 /> Create an agent for this
        </Link>
      </div>
    );
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface px-3.5 py-3 ring-1 ring-line ring-inset">
      <span className="flex min-w-0 items-center gap-2 text-[12.5px] leading-snug text-ink-2">
        <Bot className="size-4 flex-none text-faint" strokeWidth={1.9} />
        {human
          ? "This is digital work, so an AI agent could do it too."
          : fit && !fit.digital
            ? `Agents can't take this one. ${fit.reason ?? ""}`
            : agentBids
            ? `${agentBids} agent${agentBids > 1 ? "s" : ""} bid. Prices stay between each agent's floor and what you hold.`
            : names.length
              ? `${names.slice(0, 3).join(", ")} can do this and bid when asked.`
              : "Agents bid when it fits their skills."}
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => run("agents", () => (human ? openToAgents({ taskId: task._id, as }) : invite({ taskId: task._id, as })))}
        disabled={!!busy}
      >
        {busy === "agents" ? <Loader2 className="animate-spin" /> : <Bot />}
        {human ? "Open to agents" : agentBids ? "Ask again" : "Ask agents to bid"}
      </Button>
      <ErrorLine message={errorFor("agents")} />
    </div>
  );
}

/** Round by round: what the agent asked, and when code moved its number. */
function BidTrail({ bids }: { bids: NonNullable<TaskPage["applications"][number]["bids"]> }) {
  return (
    <ol className="mt-2.5 space-y-1.5 border-l border-line pl-3">
      {bids.map((b, i) => (
        <li key={i} className="text-[12.5px] leading-snug">
          <span className="tabular font-medium text-ink">Round {b.round} · {formatCents(b.cents)}</span>
          <span className="text-faint"> · {b.model === "code" ? "reverse auction, in code" : b.model === "external" ? "via API" : b.model === "heuristic" ? "heuristic" : b.model}</span>
          {b.clamped ? <span className="text-refunded"> · clamped to the limits</span> : null}
          {b.round > 1 ? <span className="block text-muted">{b.note}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** Blind proofer cards and Plex's consensus. */
function Scorecards({ cards }: { cards: NonNullable<NonNullable<TaskPage["proof"]>["scorecards"]> }) {
  const dims = ["completeness", "accuracy", "method", "quality"] as const;
  return (
    <div className="mt-4 border-t border-line px-5 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[13px] font-medium text-ink">Proofer scorecards</div>
        <div className="text-[12px] text-faint">Scored blind · 1 to 5</div>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-[12.5px]">
          <thead>
            <tr className="text-left text-faint">
              <th className="py-1.5 pr-3 font-medium">Proofer</th>
              {dims.map((d) => (
                <th key={d} className="py-1.5 pr-3 font-medium capitalize">
                  {d}
                </th>
              ))}
              <th className="py-1.5 font-medium">Vote</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {cards.map((c) => (
              <tr key={c.proofer} className="align-top">
                <td className="py-2 pr-3">
                  <span className="font-medium text-ink">{c.proofer}</span>
                  <span className="mt-0.5 block max-w-[220px] text-muted">{c.note}</span>
                </td>
                {dims.map((d) => (
                  <td key={d} className="tabular py-2 pr-3 text-ink">
                    {c[d]}
                  </td>
                ))}
                <td className="py-2">
                  <VerdictPill result={c.verdict} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewBox({ data }: { data: TaskPage }) {
  const as = useAs();
  const leave = useMutation(api.hire.leaveReview);
  const { run, busy, errorFor } = useRun();
  const [stars, setStars] = useState(5);
  const [text, setText] = useState("");
  const name = data.assignee?.name.split(" ")[0] ?? "them";
  if (data.review)
    return (
      <div className="flex items-start gap-3 text-[13px]">
        <span className="flex flex-none items-center gap-0.5 pt-0.5" aria-label={`${data.review.stars} of 5 stars`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={i < data.review!.stars ? "size-3.5 fill-current text-refunded" : "size-3.5 text-line-strong"} strokeWidth={1.9} />
          ))}
        </span>
        <span className="text-ink-2">“{data.review.text}” · verified review on {name}&apos;s profile</span>
      </div>
    );
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="mb-0">Review {name}</Label>
        <span className="flex items-center gap-0.5" role="radiogroup" aria-label="Stars">
          {Array.from({ length: 5 }).map((_, i) => (
            <button key={i} type="button" role="radio" aria-checked={stars === i + 1} aria-label={`${i + 1} stars`} onClick={() => setStars(i + 1)} className="p-0.5">
              <Star className={i < stars ? "size-4 fill-current text-refunded" : "size-4 text-line-strong"} strokeWidth={1.9} />
            </button>
          ))}
        </span>
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What was good, what could be better." className="min-h-16 bg-surface" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-muted">Tied to this paid task, so it shows as verified.</span>
        <Button size="sm" onClick={() => run("review", () => leave({ taskId: data.task._id, stars, text, as }))} disabled={!!busy}>
          {busy === "review" ? <Loader2 className="animate-spin" /> : null} Post review
        </Button>
      </div>
      <ErrorLine message={errorFor("review")} />
    </div>
  );
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
                <div className="mt-1 max-h-72 overflow-y-auto text-[13.5px] leading-relaxed break-words text-ink-2">
                  {s.type === "link" && it?.url ? (
                    <a href={it.url} target="_blank" rel="noreferrer" className="text-green-700 underline-offset-2 hover:underline">
                      {it.url}
                    </a>
                  ) : it?.text ? (
                    <Deliverable text={it.text} />
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            );
          if (s.type === "file" && isImageSpec(s) && it?.imageUrl)
            return (
              <figure key={i} className="col-span-2 sm:col-span-1">
                <a href={it.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md bg-surface ring-1 ring-line ring-inset">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.imageUrl} alt={s.label} className="aspect-square size-full object-contain" />
                </a>
                <figcaption className="mt-1.5 text-[12px] font-medium text-ink-2">{s.label}</figcaption>
              </figure>
            );
          if (s.type === "file")
            return (
              <div key={i} className="col-span-2 flex items-center justify-between gap-3 rounded-md bg-sunken p-3 sm:col-span-3">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
                  <SpecIcon type="file" className="size-4 text-faint" /> {s.label}
                </span>
                {it?.imageUrl ? (
                  <a href={it.imageUrl} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-green-700 underline-offset-2 hover:underline">
                    Open file
                  </a>
                ) : (
                  <span className="text-[12.5px] text-faint">{it ? "Seeded, no file" : "Missing"}</span>
                )}
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
      {proof.scorecards?.length && !checking ? <Scorecards cards={proof.scorecards} /> : null}
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
                      {a.applicant ? (
                        <Link href={`/hire/${a.applicant.handle}`} className="text-[14px] font-medium text-ink underline-offset-2 hover:underline">
                          {a.applicant.name}
                        </Link>
                      ) : null}
                      {i === 0 && a.matchScore !== undefined && canDecide ? <Badge tone="green">Best match</Badge> : null}
                      {a.applicant?.kind === "agent" ? (
                        <Badge tone="steel">
                          <Bot /> {a.applicant.agent?.house ? "Plex agent" : "AI agent"}
                        </Badge>
                      ) : a.viaAgent ? (
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
                    {a.bids?.length ? <BidTrail bids={a.bids} /> : null}
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
          {f.via === "autopay" ? <span className="text-[11.5px] text-faint">held by auto-pay (PayPal Vault), no popup</span> : null}
        </div>
      ) : null}
    </Card>
  );
}

/** Search the official MCP Registry; the task's own words suggest what to look for. */
function RegistrySearch({ task, onPick }: { task: TaskPage["task"]; onPick: (url: string) => void }) {
  const search = useAction(api.connections.search);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [results, setResults] = useState<FunctionReturnType<typeof api.connections.search> | null>(null);
  const suggested = servicesIn(`${task.title} ${task.description}`);

  async function find(term: string) {
    setQ(term);
    setBusy(true);
    setError(undefined);
    try {
      setResults(await search({ q: term }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md bg-canvas px-3.5 py-3 ring-1 ring-line ring-inset">
      <div className="text-[12.5px] font-medium text-ink">Find a server in the MCP Registry</div>
      <p className="mt-0.5 text-[12px] leading-snug text-faint">Prefer Official servers: a third-party server sees everything the agent sends it, including your token.</p>
      {suggested.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-faint">This task mentions</span>
          {suggested.map((s) => (
            <button key={s} type="button" onClick={() => find(s)} className="rounded-full bg-surface px-2.5 py-0.5 text-[12px] text-ink-2 ring-1 ring-line ring-inset hover:bg-sunken">
              {s}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) void find(q.trim());
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="notion, linear, slack…" className="h-8" />
        <Button type="submit" variant="secondary" size="sm" disabled={busy || q.trim().length < 2}>
          {busy ? <Loader2 className="animate-spin" /> : <Search />} Search
        </Button>
      </form>
      {error ? <p className="mt-2 text-[12px] text-disputed">{error}</p> : null}
      {results ? (
        results.length ? (
          <ul className="mt-2 divide-y divide-line">
            {results.map((r) => (
              <li key={r.name} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate text-[12.5px] font-medium text-ink">
                    {r.title} {r.official ? <Badge tone="green">Official</Badge> : <Badge tone="neutral">Third party</Badge>}
                  </div>
                  <div className="truncate text-[11.5px] text-faint">{new URL(r.url).host}</div>
                  {r.description ? <div className="line-clamp-2 text-[12px] leading-snug text-muted">{r.description}</div> : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => onPick(r.url)}>
                  Use
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[12px] text-muted">No remote server found for “{q}”. Try a one-URL service like Zapier MCP.</p>
        )
      ) : null}
    </div>
  );
}

/**
 * The PayPal desk: an agent with the PayPal Agent Toolkit reads PayPal's own
 * records for this task; code compares them with the receipts.
 */
export function PayPalDeskCard({ data }: { data: TaskPage }) {
  const as = useAs();
  const check = useAction(api.paypalDesk.check);
  const { run, busy, errorFor } = useRun();
  const { task, role } = data;
  const c = task.paypalCheck;
  if (task.funding.state === "unfunded" || (role !== "poster" && role !== "assignee")) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <Landmark className="size-4 text-faint" strokeWidth={1.9} /> PayPal desk
            {c ? c.match ? <Badge tone="green">Matches PayPal</Badge> : <Badge tone="red">Check this</Badge> : null}
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-faint">
            An agent reads PayPal&apos;s own records with the PayPal Agent Toolkit. Code compares them with the receipts.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => run("desk", () => check({ taskId: task._id, as }))} disabled={!!busy}>
          {busy === "desk" ? <Loader2 className="animate-spin" /> : <RefreshCw />} {c ? "Re-check" : "Check"}
        </Button>
      </div>
      {c ? (
        <div className="border-t border-line px-5 py-3">
          <p className="text-[13px] leading-relaxed text-ink-2">{c.summary}</p>
          {c.facts.length ? (
            <dl className="mt-3 grid gap-1.5">
              {c.facts.map((f) => (
                <div key={f.label} className="grid grid-cols-[92px_minmax(0,1fr)_16px] items-start gap-2 text-[12.5px]">
                  <dt className="text-faint">{f.label}</dt>
                  <dd className="min-w-0 break-words text-ink-2">{f.value}</dd>
                  {f.ok === undefined ? <span /> : f.ok ? <Check className="size-3.5 text-green-600" strokeWidth={2.2} /> : <CircleAlert className="size-3.5 text-disputed" strokeWidth={2} />}
                </div>
              ))}
            </dl>
          ) : null}
          {c.dispute ? (
            <div className={cn("mt-3 rounded-md px-3.5 py-3 ring-1 ring-inset", c.dispute.action === "contest" ? "bg-steel-50 ring-steel-200" : "bg-refunded-bg ring-refunded/15")}>
              <div className="text-[12.5px] font-medium text-ink">
                Dispute {c.dispute.amount} · {c.dispute.reason} · Plex will {c.dispute.action === "contest" ? "contest it with the proof" : "accept it and refund"}
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-muted">{c.dispute.why}</p>
            </div>
          ) : null}
          <div className="mt-3 text-[11.5px] text-faint">
            {c.tools.length ? `Toolkit calls: ${c.tools.join(" → ")} · ` : ""}
            {c.model === "heuristic" ? "No model, code only" : c.model} · {relativeTime(c.at)}
          </div>
        </div>
      ) : (
        <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted">
          {busy === "desk" ? "Reading PayPal's records…" : "Runs on its own after money moves, or tap Check."}
        </div>
      )}
      {errorFor("desk") ? (
        <div className="border-t border-line px-5 py-2">
          <ErrorLine message={errorFor("desk")} />
        </div>
      ) : null}
    </Card>
  );
}
