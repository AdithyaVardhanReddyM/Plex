"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Cpu,
  Check,
  ChevronRight,
  Fingerprint,
  HandCoins,
  HeartHandshake,
  Link2,
  ListChecks,
  ReceiptText,
  Share,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Avatar, Badge, Card, CardHeader, EmptyState, IconTile, Meter, Skeleton } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { ReceiptCard, StatePill, receiptKindLabel, type Receipt } from "@/components/receipt/receipt";
import { PotIcon } from "@/components/pots/pot-meta";
import { cn, formatCents, relativeTime, shortDate } from "@/lib/utils";

export function ReceiptDetail({ id }: { id: string }) {
  const receipt = useQuery(api.receipts.get, { id: id as Id<"receipts"> });

  return (
    <div className="animate-rise">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/receipts"
          className="inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" strokeWidth={1.9} /> All receipts
        </Link>
        {receipt ? <ShareActions receipt={receipt} /> : null}
      </div>

      {receipt === undefined ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Stage>
            <Skeleton className="h-[620px] w-full max-w-[460px] rounded-lg" />
          </Stage>
          <div className="space-y-4">
            <Skeleton className="h-44 w-full rounded-lg" />
            <Skeleton className="h-36 w-full rounded-lg" />
          </div>
        </div>
      ) : receipt === null ? (
        <Card>
          <EmptyState
            icon={<ReceiptText />}
            title="This receipt isn't here"
            body="It may belong to another account, or the link is incomplete. Every receipt you own is in your list."
            action={
              <Link href="/receipts" className={buttonVariants({ variant: "secondary" })}>
                Back to receipts
              </Link>
            }
            className="py-16"
          />
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Stage>
            <ReceiptCard receipt={receipt} className="w-full max-w-[460px]" />
          </Stage>
          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
            <AtAGlance receipt={receipt} />
            <BelongsTo receipt={receipt} />
          </div>
        </div>
      )}
    </div>
  );
}

/** The calm ground the receipt sits on: a sunken well, the receipt centred on it. */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center rounded-xl bg-canvas px-4 py-8 ring-1 ring-line/80 ring-inset sm:px-8 sm:py-14">
      {children}
    </div>
  );
}

// ── Share ────────────────────────────────────────────────────────────────────

function ShareActions({ receipt }: { receipt: Receipt }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (an iframe, an old browser); the address bar still has the link.
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={copy} aria-live="polite">
        {copied ? <Check className="text-green-700" /> : <Link2 />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      {canShare ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            navigator
              .share({
                title: `Receipt: ${formatCents(receipt.amountCents, receipt.currency)} to ${receipt.payeeLabel}`,
                text: `“${receipt.why}”`,
                url: window.location.href,
              })
              .catch(() => undefined)
          }
        >
          <Share />
          Share receipt
        </Button>
      ) : null}
    </div>
  );
}

// ── At a glance ──────────────────────────────────────────────────────────────

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-3 py-2.5">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] text-ink">{children}</dd>
    </div>
  );
}

function AtAGlance({ receipt }: { receipt: Receipt }) {
  const last = receipt.timeline[receipt.timeline.length - 1];
  return (
    <Card>
      <CardHeader title="At a glance" description="What this receipt proves, in one place." />
      <dl className="mt-2 divide-y divide-line px-5 pb-2">
        <Fact label="State">
          <span className="inline-flex justify-end">
            <StatePill state={receipt.state} />
          </span>
        </Fact>
        <Fact label="Type">{receiptKindLabel(receipt.kind)}</Fact>
        <Fact label="Amount">
          <span className="tabular font-semibold">{formatCents(receipt.amountCents, receipt.currency)}</span>
        </Fact>
        <Fact label="Occurred">
          <span className="tabular">{shortDate(receipt.occurredAt)}</span>
        </Fact>
        {last ? (
          <Fact label="Last update">
            <span className="text-ink-2">{relativeTime(last.at)}</span>
          </Fact>
        ) : null}
        <Fact label="Receipt ID">
          <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted">
            <Fingerprint className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
            <span title={receipt._id}>
              {receipt._id.slice(0, 6)}…{receipt._id.slice(-4)}
            </span>
          </span>
        </Fact>
      </dl>
    </Card>
  );
}

// ── What it belongs to ───────────────────────────────────────────────────────

const TASK_STATUS: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  assigned: "Assigned",
  submitted: "Proof in",
  verifying: "Checking proof",
  approved: "Approved",
  paid: "Paid",
  refunded: "Refunded",
  disputed: "Disputed",
  cancelled: "Cancelled",
};

function ContextRow({
  href,
  icon,
  eyebrow,
  title,
  meta,
  children,
}: {
  href?: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const body = (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_16px] items-start gap-3 rounded-[10px] px-3 py-3 transition-colors group-hover:bg-sunken/70">
      {icon}
      <div className="min-w-0">
        <div className="text-[11.5px] font-medium text-faint">{eyebrow}</div>
        <div className="mt-0.5 line-clamp-2 text-[13.5px] leading-snug font-medium text-ink">{title}</div>
        {meta ? <div className="mt-1 text-[12px] text-muted">{meta}</div> : null}
        {children}
      </div>
      {href ? <ChevronRight className="mt-2.5 size-4 text-faint transition-transform group-hover:translate-x-0.5" strokeWidth={1.9} /> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="group block rounded-[10px] focus-visible:ring-[3px] focus-visible:ring-green-200 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    <div className="group">{body}</div>
  );
}

function BelongsTo({ receipt }: { receipt: Receipt }) {
  const task = useQuery(api.tasks.get, receipt.taskId ? { id: receipt.taskId } : "skip");
  const causes = useQuery(api.causes.list, receipt.causeId ? {} : "skip");
  const pots = useQuery(api.pots.list, receipt.potId ? {} : "skip");
  const cause = causes?.find((c) => c._id === receipt.causeId);
  const pot = pots?.find((p) => p._id === receipt.potId);

  const loading = (receipt.taskId && task === undefined) || (receipt.causeId && causes === undefined) || (receipt.potId && pots === undefined);

  return (
    <Card>
      <CardHeader title="Where it fits" description="The work, the cause and the limits behind this payment." />
      <div className="px-2 pt-2 pb-2">
        {loading ? (
          <div className="space-y-1 p-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : null}

        {task ? (
          <ContextRow
            href={`/tasks/${task.task._id}`}
            icon={
              <IconTile tone="neutral" size="md" className="size-[34px]">
                <ListChecks />
              </IconTile>
            }
            eyebrow="Task"
            title={task.task.title}
            meta={
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <Badge tone="outline" className="text-muted">
                  {TASK_STATUS[task.task.status] ?? task.task.status}
                </Badge>
                <span className="tabular">{formatCents(task.task.fundingCents)}</span>
                {task.assignee ? (
                  <>
                    <span className="text-line-strong">·</span>
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <Avatar name={task.assignee.name} color={task.assignee.avatarColor} src={task.assignee.avatarUrl} size={16} />
                      <span className="truncate">{task.assignee.name}</span>
                    </span>
                  </>
                ) : null}
              </span>
            }
          />
        ) : null}

        {cause ? (
          <ContextRow
            href={`/causes/${cause.slug}`}
            icon={<Avatar name={cause.org.name || cause.name} color={cause.org.avatarColor} size={34} square />}
            eyebrow="Cause"
            title={cause.name}
            meta={`${cause.org.name} · ${cause.locationLabel}`}
          >
            <div className="mt-2.5">
              <Meter value={cause.raisedCents / Math.max(cause.goalCents, 1)} size="sm" label="Raised toward the goal" />
              <div className="tabular mt-1.5 text-[11.5px] text-faint">
                {formatCents(cause.raisedCents)} of {formatCents(cause.goalCents)} raised
              </div>
            </div>
          </ContextRow>
        ) : null}

        {pot ? (
          <ContextRow
            href="/pots"
            icon={<PotIcon pot={pot} size={34} />}
            eyebrow="Pot"
            title={pot.name}
            meta={
              <span className="tabular">
                {formatCents(pot.spentMonthCents)} of {formatCents(pot.monthlyBudgetCents)} spent this month
              </span>
            }
          />
        ) : null}

        {receipt.taskId || receipt.causeId || receipt.potId ? null : receipt.agentLabel ? (
          <ContextRow
            icon={
              <IconTile tone="steel" size="md" className="size-[34px]">
                <Cpu />
              </IconTile>
            }
            eyebrow="Agent"
            title={receipt.agentLabel}
            meta={
              <span className="inline-flex items-start gap-1.5">
                <ShieldCheck className="mt-px size-3.5 flex-none text-green-700" strokeWidth={1.9} />
                <span className="line-clamp-2">Acted inside: {receipt.rule.text}</span>
              </span>
            }
          />
        ) : (
          <ContextRow
            icon={
              <IconTile tone={receipt.kind === "donation" ? "mint" : "neutral"} size="md" className="size-[34px]">
                {receipt.kind === "donation" ? <HeartHandshake /> : <HandCoins />}
              </IconTile>
            }
            eyebrow="Who acted"
            title={receipt.payerLabel}
            meta={receipt.rule.text}
          />
        )}
      </div>
      <div className="border-t border-line px-5 py-3">
        <Link
          href="/ledger"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3 text-muted")}
        >
          See it in the Ledger <ArrowUpRight />
        </Link>
      </div>
    </Card>
  );
}
