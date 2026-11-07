"use client";

import Link from "next/link";
import { ConvexError } from "convex/values";
import {
  Bot,
  Camera,
  Check,
  CircleDashed,
  Clock,
  FileText,
  Globe,
  Link2,
  Loader2,
  Lock,
  MapPin,
  TriangleAlert,
  Users,
  Video,
  X,
  CircleHelp,
  ShieldCheck,
} from "lucide-react";
import type { Doc } from "@/lib/convex";
import { CATEGORY_LABEL, payoutSummary, windowLabel } from "@plex/backend/lib/taskRules";
import { Avatar, Badge, type BadgeTone } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { cn, relativeTime } from "@/lib/utils";

export type Task = Doc<"tasks">;
export type CardTask = Task & {
  poster: { name: string; avatarColor?: string } | null;
  applicantCount: number;
  fundingCents: number;
};
export type Status = Task["status"];

/** A message from a thrown Convex error, without the stack noise. */
export function errorMessage(err: unknown): string {
  if (err instanceof ConvexError) return typeof err.data === "string" ? err.data : "Something went wrong.";
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/(?:Uncaught (?:Convex)?Error: )([\s\S]*?)(?:\n\s+at |$)/);
  return (m?.[1] ?? msg).replace(/^\[.*?\]\s*/, "").trim();
}

const STATUS: Record<Status, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft · not funded", tone: "outline" },
  open: { label: "Open", tone: "green" },
  assigned: { label: "In progress", tone: "steel" },
  verifying: { label: "Checking proof", tone: "steel" },
  submitted: { label: "Proof in", tone: "steel" },
  approved: { label: "Paying out", tone: "green" },
  paid: { label: "Paid", tone: "green" },
  rejected: { label: "Proof rejected", tone: "amber" },
  disputed: { label: "Disputed", tone: "red" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  refunded: { label: "Refunded", tone: "amber" },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} className={className}>
      {status === "verifying" || status === "approved" ? <Loader2 className="animate-spin" /> : null}
      {s.label}
    </Badge>
  );
}

export function CategoryLabel({ task, className }: { task: Pick<Task, "category" | "location">; className?: string }) {
  const local = Boolean(task.location);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted", className)}>
      {local ? <MapPin className="size-3.5 flex-none text-faint" strokeWidth={1.9} /> : <Globe className="size-3.5 flex-none text-faint" strokeWidth={1.9} />}
      <span className="font-medium text-ink-2">{CATEGORY_LABEL[task.category]}</span>
      <span className="text-faint">·</span>
      <span className="truncate">{task.location ? task.location.label : "Remote"}</span>
    </span>
  );
}

const SPEC_ICON = {
  photo: Camera,
  video: Video,
  file: FileText,
  text: FileText,
  link: Link2,
} as const;

export function SpecIcon({ type, className }: { type: Task["proofSpec"][number]["type"]; className?: string }) {
  const Icon = SPEC_ICON[type];
  return <Icon className={cn("size-4", className)} strokeWidth={1.9} />;
}

/** "3 photos + a note" */
export function proofNeeded(spec: Task["proofSpec"]): string {
  const counts = new Map<string, number>();
  for (const s of spec) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  const words: Record<string, [string, string]> = {
    photo: ["photo", "photos"],
    video: ["video", "videos"],
    file: ["file", "files"],
    text: ["note", "notes"],
    link: ["link", "links"],
  };
  return [...counts]
    .map(([type, n]) => (n === 1 && type === "text" ? "a note" : n === 1 && type === "link" ? "a link" : `${n} ${words[type]![n === 1 ? 0 : 1]}`))
    .join(" + ");
}

export function timeLeft(task: Pick<Task, "windowStart" | "windowEnd" | "status">, now = Date.now()) {
  if (["paid", "approved", "cancelled", "refunded"].includes(task.status)) return "Done";
  if (now < task.windowStart) return `Opens ${relativeTime(task.windowStart, now)}`;
  if (now < task.windowEnd) return `Ends ${relativeTime(task.windowEnd, now)}`;
  return `Ended ${relativeTime(task.windowEnd, now)}`;
}

// ── Board card ───────────────────────────────────────────────────────────────

export function TaskCard({ task, preview }: { task: CardTask; preview?: boolean }) {
  const held = task.funding.state === "authorized" || task.funding.state === "captured";
  const body = (
    <>
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <CategoryLabel task={task} className="pt-0.5" />
        {task.status === "open" ? null : <StatusBadge status={task.status} />}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 px-5 pt-2">
        <div className="text-[16px] leading-snug font-semibold tracking-[-0.015em] text-ink text-pretty">{task.title}</div>
        <div className="text-right">
          <Amount cents={task.payout.kind === "fixed" ? task.payout.amountCents : task.fundingCents} size="lg" />
          {task.payout.kind !== "fixed" ? <div className="text-[11.5px] text-muted">{payoutSummary(task.payout).split(",")[0]}</div> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-5 text-[12.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5 text-faint" strokeWidth={1.9} />
          {windowLabel(task.windowStart, task.windowEnd)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Camera className="size-3.5 text-faint" strokeWidth={1.9} />
          {proofNeeded(task.proofSpec)}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted">
          {task.poster ? <Avatar name={task.poster.name} color={task.poster.avatarColor} size={20} /> : null}
          <span className="truncate text-ink-2">{task.poster?.name ?? "Someone"}</span>
          {task.agentLabel ? (
            <span className="hidden min-w-0 items-center gap-1 sm:inline-flex">
              <span className="text-faint">via</span>
              <Bot className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
              <span className="truncate">{task.agentLabel}</span>
            </span>
          ) : null}
        </span>
        <span className="flex flex-none items-center gap-3 text-[12.5px]">
          {task.workerType && task.workerType !== "human" ? (
            <span className="inline-flex items-center gap-1 text-muted" title="AI agents can bid on this task">
              <Bot className="size-3.5 text-faint" strokeWidth={1.9} />
              {task.workerType === "agent" ? "Agents" : "Open to agents"}
            </span>
          ) : null}
          {task.applicantCount > 0 && task.status === "open" ? (
            <span className="inline-flex items-center gap-1 text-muted">
              <Users className="size-3.5 text-faint" strokeWidth={1.9} />
              {task.applicantCount}
            </span>
          ) : null}
          {held ? (
            <span className="inline-flex items-center gap-1 font-medium text-steel-600">
              <Lock className="size-3.5" strokeWidth={1.9} />
              Funded
            </span>
          ) : null}
        </span>
      </div>
    </>
  );
  const frame = "group flex flex-col rounded-lg border border-line bg-surface shadow-card";
  if (preview) return <div className={cn(frame, "shadow-raised")}>{body}</div>;
  return (
    <Link
      href={`/tasks/${task._id}`}
      className={cn(
        frame,
        "transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-line-strong hover:shadow-raised focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:outline-none",
      )}
    >
      {body}
    </Link>
  );
}

// ── Checks resolving ─────────────────────────────────────────────────────────

/**
 * Agent deliverables are Markdown. A small, safe renderer: headings, bullets,
 * numbered lines, **bold** and links. No HTML is ever injected.
 */
export function Deliverable({ text, className }: { text: string; className?: string }) {
  const inline = (line: string, key: number) =>
    line.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={`${key}-${i}`} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      ) : /^https?:\/\//.test(part) ? (
        <a key={`${key}-${i}`} href={part} target="_blank" rel="noreferrer" className="break-all text-green-700 underline-offset-2 hover:underline">
          {part}
        </a>
      ) : (
        part
      ),
    );
  return (
    <div className={cn("space-y-1.5", className)}>
      {text.split("\n").map((raw, n) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={n} className="h-1" />;
        const heading = line.match(/^#{1,4}\s+(.*)/);
        if (heading) return <div key={n} className="pt-1 text-[13.5px] font-semibold text-ink">{inline(heading[1]!, n)}</div>;
        const bullet = line.match(/^\s*[-*•]\s+(.*)/);
        if (bullet)
          return (
            <div key={n} className="grid grid-cols-[12px_minmax(0,1fr)] gap-1.5">
              <span className="text-faint">•</span>
              <span>{inline(bullet[1]!, n)}</span>
            </div>
          );
        return <p key={n}>{inline(line, n)}</p>;
      })}
    </div>
  );
}

export type CheckRow = { check: string; status: "pending" | "pass" | "fail" | "unsure"; detail?: string };

export function CheckList({ rows, className }: { rows: CheckRow[]; className?: string }) {
  return (
    <ol className={cn("divide-y divide-line", className)}>
      {rows.map((r) => (
        <li key={r.check} className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-3 py-2.5">
          <CheckMark status={r.status} />
          <div className="min-w-0">
            <div className={cn("text-[13.5px] leading-snug font-medium", r.status === "pending" ? "text-muted" : "text-ink")}>
              {r.check}
            </div>
            <div className="mt-0.5 min-h-[18px] text-[12.5px] leading-snug text-muted">
              {r.status === "pending" ? <span className="text-faint">Checking…</span> : r.detail?.replace(/^Unsure · /, "")}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function CheckMark({ status }: { status: CheckRow["status"] }) {
  const base = "mt-px flex size-[22px] items-center justify-center rounded-full [&_svg]:size-3.5 transition-colors duration-300";
  if (status === "pending")
    return (
      <span className={cn(base, "text-faint")}>
        <CircleDashed className="!size-[18px] animate-spin [animation-duration:2.4s]" strokeWidth={1.9} />
      </span>
    );
  if (status === "pass")
    return (
      <span className={cn(base, "bg-green-50 text-green-700 ring-1 ring-green-200 ring-inset")}>
        <Check strokeWidth={2.4} />
      </span>
    );
  if (status === "fail")
    return (
      <span className={cn(base, "bg-disputed-bg text-disputed ring-1 ring-disputed/20 ring-inset")}>
        <X strokeWidth={2.4} />
      </span>
    );
  return (
    <span className={cn(base, "bg-refunded-bg text-refunded ring-1 ring-refunded/20 ring-inset")}>
      <CircleHelp strokeWidth={2.2} />
    </span>
  );
}

/** Verdict checks from the stored verdict, as rows. */
export function verdictRows(checks: { check: string; passed: boolean; detail: string }[]): CheckRow[] {
  return checks.map((c) => ({
    check: c.check,
    status: c.passed ? "pass" : c.detail.startsWith("Unsure") ? "unsure" : "fail",
    detail: c.detail,
  }));
}

export function VerdictPill({ result }: { result: "pass" | "fail" | "unsure" }) {
  return result === "pass" ? (
    <Badge tone="green">
      <Check /> Pass
    </Badge>
  ) : result === "fail" ? (
    <Badge tone="red">
      <TriangleAlert /> Fail
    </Badge>
  ) : (
    <Badge tone="amber">
      <CircleHelp /> Needs a human
    </Badge>
  );
}

// ── Match score ──────────────────────────────────────────────────────────────

export function MatchScore({ score }: { score?: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const pending = score === undefined;
  return (
    <span className="relative inline-flex size-10 flex-none items-center justify-center" aria-label={pending ? "Ranking" : `Match ${score}`}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" className="stroke-sunken" />
        {!pending ? (
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - score / 100)}
            className={cn("transition-[stroke-dashoffset] duration-700", score >= 85 ? "stroke-green-500" : score >= 70 ? "stroke-green-300" : "stroke-steel-300")}
          />
        ) : null}
      </svg>
      {pending ? (
        <Loader2 className="size-4 animate-spin text-faint" strokeWidth={1.9} />
      ) : (
        <span className="tabular text-[12.5px] font-semibold text-ink" style={{ textBoxTrim: "trim-both", textBoxEdge: "cap alphabetic" } as React.CSSProperties}>
          {score}
        </span>
      )}
    </span>
  );
}

// ── Policy engine result ─────────────────────────────────────────────────────

export function PolicyLine({
  pot,
  outcome,
  ruleText,
}: {
  pot?: string;
  outcome?: "allow" | "needs_approval" | "deny";
  ruleText?: string;
}) {
  if (!pot)
    return (
      <div className="mt-3 flex items-start gap-2 rounded-sm bg-sunken px-3 py-2.5 text-[12.5px] leading-snug text-muted">
        <ShieldCheck className="mt-px size-4 flex-none text-faint" strokeWidth={1.9} />
        Posted directly, no pot limits apply.
      </div>
    );
  if (!outcome) return <div className="mt-3 h-[42px] rounded-sm skeleton" />;
  const tone =
    outcome === "allow"
      ? "bg-green-50 text-green-800 ring-green-200/70"
      : outcome === "needs_approval"
        ? "bg-refunded-bg text-refunded ring-refunded/15"
        : "bg-disputed-bg text-disputed ring-disputed/15";
  return (
    <div className={cn("mt-3 flex items-start gap-2 rounded-sm px-3 py-2.5 text-[12.5px] leading-snug ring-1 ring-inset", tone)}>
      {outcome === "allow" ? (
        <Check className="mt-px size-4 flex-none" strokeWidth={2.2} />
      ) : (
        <TriangleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} />
      )}
      <span>
        {outcome === "allow" ? (
          <>
            Within your {pot} rule: <span className="font-medium">{ruleText}</span>
          </>
        ) : outcome === "needs_approval" ? (
          <>
            Over your {pot} rule (<span className="font-medium">{ruleText}</span>). Funding it yourself counts as your approval, and the receipt says so.
          </>
        ) : (
          <>
            Blocked by your {pot} pot: <span className="font-medium">{ruleText}</span>
          </>
        )}
      </span>
    </div>
  );
}
