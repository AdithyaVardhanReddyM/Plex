"use client";

import Link from "next/link";
import { ConvexError } from "convex/values";
import {
  Camera,
  Check,
  CircleHelp,
  Clapperboard,
  Clock,
  Database,
  FileText,
  Globe,
  HeartHandshake,
  Link2,
  Loader2,
  Lock,
  MapPin,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Users,
  Video,
  X,
} from "lucide-react";
import { AiAgentIcon } from "@/components/ui/icons";
import type { Doc } from "@/lib/convex";
import { CATEGORY_LABEL, windowLabel } from "@plex/backend/lib/taskRules";
import { Avatar, Badge, type BadgeTone } from "@/components/ui/primitives";
import { Ring } from "@/components/ui/viz";
import { cn, formatCents, relativeTime } from "@/lib/utils";

export type Task = Doc<"tasks">;
export type CardTask = Task & {
  poster: { name: string; avatarColor?: string; kind?: string } | null;
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

// ── Kind of work ─────────────────────────────────────────────────────────────

export const KIND_ICON = {
  local: MapPin,
  remote: Globe,
  data: Database,
  creator: Clapperboard,
  agent: AiAgentIcon,
  impact: HeartHandshake,
} as const satisfies Record<Task["category"], unknown>;

/** The kind of work as its bare glyph (no tile behind it). */
export function KindTile({
  category,
  size = "xs",
  className,
}: {
  category: Task["category"];
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const Icon = KIND_ICON[category];
  const px = { xs: "size-4", sm: "size-[18px]", md: "size-5" }[size];
  return <Icon className={cn("flex-none text-ink-2", px, className)} strokeWidth={1.9} aria-hidden />;
}

export function CategoryLabel({
  task,
  className,
  tile,
}: {
  task: Pick<Task, "category" | "location">;
  className?: string;
  /** Lead with the kind's tile instead of a place/remote glyph. */
  tile?: boolean;
}) {
  const local = Boolean(task.location);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted", className)}>
      {tile ? (
        <KindTile category={task.category} size="sm" className="mr-0.5" />
      ) : local ? (
        <MapPin className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
      ) : (
        <Globe className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
      )}
      <span className="flex-none font-medium text-ink-2">{CATEGORY_LABEL[task.category]}</span>
      <span className="text-faint">·</span>
      <span className="truncate">{task.location ? task.location.label : "Remote"}</span>
    </span>
  );
}

/** Where the task's money is: held is steel, paid is mint. */
export function FundingBadge({ funding, className }: { funding: Task["funding"]; className?: string }) {
  switch (funding.state) {
    case "authorized":
      return (
        <Badge tone="steel" className={className}>
          <Lock /> Held by PayPal
        </Badge>
      );
    case "captured":
      return (
        <Badge tone="steel" className={className}>
          <Lock /> Captured
        </Badge>
      );
    case "released":
      return (
        <Badge tone="green" className={className}>
          <Check /> Paid out
        </Badge>
      );
    case "refunded":
      return (
        <Badge tone="amber" className={className}>
          <RotateCcw /> Returned
        </Badge>
      );
    default:
      return (
        <Badge tone="outline" className={cn("text-muted", className)}>
          Not funded
        </Badge>
      );
  }
}

/** Where the money is, in words and color: a quiet line for cards and rows. */
export function FundingLine({ funding, className }: { funding: Task["funding"]; className?: string }) {
  const base = "inline-flex items-center gap-1.5 text-[12.5px] font-medium [&_svg]:size-3.5 [&_svg]:stroke-[2]";
  switch (funding.state) {
    case "authorized":
      return (
        <span className={cn(base, "text-steel-600", className)}>
          <Lock /> Held by PayPal
        </span>
      );
    case "captured":
      return (
        <span className={cn(base, "text-steel-600", className)}>
          <Lock /> Captured, paying out
        </span>
      );
    case "released":
      return (
        <span className={cn(base, "text-green-700", className)}>
          <Check /> Paid out
        </span>
      );
    case "refunded":
      return (
        <span className={cn(base, "text-refunded", className)}>
          <RotateCcw /> Returned
        </span>
      );
    default:
      return <span className={cn(base, "text-faint", className)}>Not funded yet</span>;
  }
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

/** The figure a task card leads with: the fixed payout, or the most it can pay. */
export function headlineCents(task: Pick<CardTask, "payout" | "fundingCents">) {
  return task.payout.kind === "fixed" ? task.payout.amountCents : task.fundingCents;
}

// ── Board card ───────────────────────────────────────────────────────────────

export function TaskCard({ task, preview }: { task: CardTask; preview?: boolean }) {
  const open = task.status === "open";
  const agents = task.workerType && task.workerType !== "human";
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <CategoryLabel task={task} tile className="min-w-0" />
        {open ? (
          preview ? null : (
            <span className="flex-none text-[12px] text-faint">{timeLeft(task)}</span>
          )
        ) : (
          <StatusBadge status={task.status} className="flex-none" />
        )}
      </div>

      <div className="mt-3 line-clamp-2 text-[16px] leading-[1.35] font-semibold tracking-[-0.016em] text-pretty text-ink">
        {task.title}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5 text-faint" strokeWidth={1.9} />
          {windowLabel(task.windowStart, task.windowEnd)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SpecIcon type={task.proofSpec[0]?.type ?? "photo"} className="size-3.5 text-faint" />
          {proofNeeded(task.proofSpec)}
        </span>
      </div>

      <div className="mt-auto flex items-end justify-between gap-4 pt-6">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="tabular inline-flex items-start font-display text-[34px] leading-none font-extrabold tracking-[-0.045em] text-ink">
              <span className="mt-[0.16em] mr-0.5 text-[0.46em] font-bold text-faint">$</span>
              {formatCents(headlineCents(task)).replace("$", "")}
            </span>
            {task.payout.kind !== "fixed" ? (
              <span className="text-[12px] text-muted">{task.payout.kind === "per_unit" ? "at most" : "capped"}</span>
            ) : null}
          </div>
          <FundingLine funding={task.funding} className="mt-2" />
        </div>
        <div className="flex min-w-0 flex-col items-end gap-1.5 text-[12px] text-muted">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-ink-2">{task.poster?.name ?? (preview ? "You" : "Someone")}</span>
            <Avatar
              name={task.poster?.name ?? (preview ? "You" : "Someone")}
              color={task.poster?.avatarColor}
              size={26}
              square={Boolean(task.poster?.kind && task.poster.kind !== "person")}
            />
          </span>
          <span className="flex items-center gap-3">
            {agents ? (
              <span className="inline-flex items-center gap-1" title="AI agents can bid on this task">
                <AiAgentIcon className="size-3.5 text-faint" strokeWidth={1.9} />
                {task.workerType === "agent" ? "Agents" : "Open to agents"}
              </span>
            ) : null}
            {task.applicantCount > 0 && open ? (
              <span className="tabular inline-flex items-center gap-1" title={`${task.applicantCount} applied`}>
                <Users className="size-3.5 text-faint" strokeWidth={1.9} />
                {task.applicantCount} applied
              </span>
            ) : task.agentLabel && !agents ? (
              <span className="truncate">via {task.agentLabel}</span>
            ) : null}
          </span>
        </div>
      </div>
    </>
  );
  const frame = "group relative flex min-h-[208px] flex-col rounded-lg bg-surface p-5 shadow-card";
  if (preview) return <div className={cn(frame, "shadow-raised")}>{body}</div>;
  return (
    <Link
      href={`/tasks/${task._id}`}
      className={cn(
        frame,
        "transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-hover focus-visible:ring-[3px] focus-visible:ring-green-200 focus-visible:outline-none",
      )}
    >
      {body}
    </Link>
  );
}

/** A board card's skeleton, at the card's real geometry. */
export function TaskCardSkeleton() {
  return (
    <div className="flex h-[208px] flex-col rounded-lg bg-surface p-5 shadow-card">
      <div className="flex items-center gap-2">
        <span className="skeleton size-[18px] rounded-[6px]" />
        <span className="skeleton h-3 w-40 rounded-full" />
      </div>
      <span className="skeleton mt-4 h-4 w-3/5 rounded-full" />
      <span className="skeleton mt-3 h-3 w-48 rounded-full" />
      <div className="mt-auto flex items-end justify-between">
        <span>
          <span className="skeleton block h-8 w-20 rounded-[8px]" />
          <span className="skeleton mt-2.5 block h-3 w-24 rounded-full" />
        </span>
        <span className="flex items-center gap-2">
          <span className="skeleton h-3 w-24 rounded-full" />
          <span className="skeleton size-[26px] rounded-full" />
        </span>
      </div>
    </div>
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
              <span className="text-faint">–</span>
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
    <ol className={cn("grid gap-0.5", className)}>
      {rows.map((r) => (
        <li key={r.check} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 py-2">
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

/** A check's state as its bare glyph: no circle behind it. */
export function CheckMark({ status }: { status: CheckRow["status"] }) {
  const base = "mt-px flex size-5 items-center justify-center transition-colors duration-300 [&_svg]:size-[18px]";
  if (status === "pending")
    return (
      <span className={cn(base, "text-faint")}>
        <Loader2 className="animate-spin" strokeWidth={1.9} />
      </span>
    );
  if (status === "pass")
    return (
      <span className={cn(base, "text-green-700")}>
        <Check strokeWidth={2.4} />
      </span>
    );
  if (status === "fail")
    return (
      <span className={cn(base, "text-disputed")}>
        <X strokeWidth={2.4} />
      </span>
    );
  return (
    <span className={cn(base, "text-refunded")}>
      <CircleHelp strokeWidth={2.1} />
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
  const pending = score === undefined;
  return (
    <span aria-label={pending ? "Ranking" : `Match ${score}`} className="inline-flex flex-none">
      <Ring value={pending ? 0 : score / 100} size={40} stroke={3.5} tone={!pending && score >= 70 ? "brand" : "steel"}>
        {pending ? (
          <Loader2 className="size-4 animate-spin text-faint" strokeWidth={1.9} />
        ) : (
          <span className="trim-cap text-[12.5px] font-semibold text-ink">{score}</span>
        )}
      </Ring>
    </span>
  );
}

// ── Policy engine result ─────────────────────────────────────────────────────

export function PolicyLine({
  pot,
  outcome,
  ruleText,
  className,
}: {
  pot?: string;
  outcome?: "allow" | "needs_approval" | "deny";
  ruleText?: string;
  className?: string;
}) {
  const frame = "flex items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-[12.5px] leading-snug ring-1 ring-inset";
  if (!pot)
    return (
      <div className={cn(frame, "bg-sunken/70 text-muted ring-line/70", className)}>
        <ShieldCheck className="mt-px size-4 flex-none text-faint" strokeWidth={1.9} />
        Posted directly, no pot limits apply.
      </div>
    );
  if (!outcome) return <div className={cn("skeleton h-[42px] rounded-[10px]", className)} />;
  const tone =
    outcome === "allow"
      ? "bg-green-50 text-green-800 ring-green-200/70"
      : outcome === "needs_approval"
        ? "bg-refunded-bg text-refunded ring-refunded/15"
        : "bg-disputed-bg text-disputed ring-disputed/15";
  return (
    <div className={cn(frame, tone, className)}>
      {outcome === "allow" ? (
        <ShieldCheck className="mt-px size-4 flex-none" strokeWidth={1.9} />
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
