import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  CircleDashed,
  FileText,
  HandCoins,
  HeartHandshake,
  Lock,
  Quote,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Repeat,
  TriangleAlert,
  Check,
} from "lucide-react";
import type { Doc } from "@plex/backend/dataModel";
import { Badge, type BadgeTone } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { cn, formatCents, relativeTime, shortDate } from "@/lib/utils";

export type Receipt = Doc<"receipts">;
type State = Receipt["state"];

const STATE: Record<State, { label: string; tone: BadgeTone; icon: React.ReactNode }> = {
  pending: { label: "Pending", tone: "neutral", icon: <CircleDashed /> },
  funded: { label: "Funded", tone: "steel", icon: <Lock /> },
  held: { label: "Held", tone: "steel", icon: <Lock /> },
  released: { label: "Released", tone: "green", icon: <Check /> },
  paid: { label: "Paid", tone: "green", icon: <Check /> },
  refunded: { label: "Refunded", tone: "amber", icon: <RotateCcw /> },
  disputed: { label: "Disputed", tone: "red", icon: <TriangleAlert /> },
  declined: { label: "Declined", tone: "neutral", icon: <CircleDashed /> },
};

export function StatePill({ state, className }: { state: State; className?: string }) {
  const s = STATE[state];
  return (
    <Badge tone={s.tone} className={className}>
      {s.icon}
      {s.label}
    </Badge>
  );
}

const KIND: Record<Receipt["kind"], { label: string; icon: React.ReactNode }> = {
  task_funding: { label: "Task funding", icon: <HandCoins /> },
  payout: { label: "Payout", icon: <ArrowUpRight /> },
  refund: { label: "Refund", icon: <RotateCcw /> },
  donation: { label: "Donation", icon: <HeartHandshake /> },
  purchase: { label: "Purchase", icon: <ShoppingBag /> },
  invoice: { label: "Invoice", icon: <FileText /> },
  subscription: { label: "Subscription", icon: <Repeat /> },
};

export const receiptKindLabel = (k: Receipt["kind"]) => KIND[k].label;

/** Money flowing toward the ledger's owner reads as "in". */
function direction(r: Receipt): "in" | "out" {
  return r.payeeId === r.ownerId || r.kind === "refund" || r.kind === "invoice" ? "in" : "out";
}

// ── Compact row, for lists ───────────────────────────────────────────────────

export function ReceiptRow({ receipt, href }: { receipt: Receipt; href?: string }) {
  const dir = direction(receipt);
  const content = (
    <div className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5 transition-colors group-hover:bg-sunken/70">
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-full [&_svg]:size-4",
          dir === "in" ? "bg-green-50 text-green-700" : "bg-steel-50 text-steel-600",
        )}
      >
        {dir === "in" ? <ArrowDownLeft /> : KIND[receipt.kind].icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[14px] font-medium leading-snug text-ink">{receipt.payeeLabel === "Plex (held)" ? receipt.why : receipt.payeeLabel}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] leading-snug text-muted">
          <span className="truncate">
            {KIND[receipt.kind].label}
            {receipt.agentLabel ? ` · ${receipt.agentLabel}` : ""}
          </span>
          <span className="text-faint">·</span>
          <span className="flex-none">{relativeTime(receipt.occurredAt)}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Amount cents={receipt.amountCents} currency={receipt.currency} sign={dir} size="sm" />
        <StatePill state={receipt.state} />
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 rounded-md">
      {content}
    </Link>
  ) : (
    <div className="group">{content}</div>
  );
}

// ── Full receipt ─────────────────────────────────────────────────────────────

function Line({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 gap-y-1 py-3">
      <span className="mt-0.5 text-faint [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <div className="text-[12px] font-medium tracking-[0.01em] text-faint">{label}</div>
        <div className="mt-1 text-[14px] leading-relaxed text-ink-2">{children}</div>
      </div>
    </div>
  );
}

const RULE_SOURCE: Record<Receipt["rule"]["source"], string> = {
  policy: "Allowed by your rule",
  approval: "Approved by you",
  poster: "Set by the poster",
  donor: "Chosen by the donor",
  proof: "Released on proof",
  system: "Plex",
};

export function ReceiptCard({ receipt, className }: { receipt: Receipt; className?: string }) {
  const dir = direction(receipt);
  const ids = Object.entries(receipt.paypal ?? {}).filter(([, v]) => Boolean(v));
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-lg border border-line bg-surface shadow-raised",
        className,
      )}
    >
      {/* Foil edge: every receipt carries it */}
      <div className="h-1 w-full" style={{ background: "var(--metal)" }} aria-hidden />

      <div className="px-5 pt-4 pb-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-muted [&_svg]:size-4">
            {KIND[receipt.kind].icon}
            <span className="truncate">{KIND[receipt.kind].label}</span>
          </div>
          <StatePill state={receipt.state} />
        </div>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold tracking-[-0.015em] text-ink">
              {dir === "in" ? receipt.payerLabel : receipt.payeeLabel}
            </div>
            <div className="mt-0.5 text-[13px] text-muted">
              {dir === "in" ? "to " + receipt.payeeLabel : "from " + receipt.payerLabel} · {shortDate(receipt.occurredAt)}
            </div>
          </div>
          <Amount cents={receipt.amountCents} currency={receipt.currency} sign={dir} size="lg" />
        </div>
      </div>

      <div className="divide-y divide-line px-5">
        <Line icon={<Quote />} label="Why">
          <span className="text-ink">“{receipt.why}”</span>
        </Line>
        <Line icon={<ShieldCheck />} label={RULE_SOURCE[receipt.rule.source]}>
          {receipt.rule.text}
        </Line>
        {receipt.agentLabel ? (
          <Line icon={<Bot />} label="Agent">
            {receipt.agentLabel}
          </Line>
        ) : null}
        {receipt.evidence?.verdict || receipt.evidence?.checks?.length ? (
          <Line icon={<BadgeCheck />} label="Evidence">
            {receipt.evidence.verdict ? <div className="font-medium text-ink">{receipt.evidence.verdict}</div> : null}
            {receipt.evidence.checks?.length ? (
              <ul className="mt-1.5 space-y-1">
                {receipt.evidence.checks.map((c) => (
                  <li key={c.check} className="flex items-start gap-2 text-[13px]">
                    <span className={cn("mt-0.5 [&_svg]:size-3.5", c.passed ? "text-green-600" : "text-disputed")}>
                      {c.passed ? <Check /> : <TriangleAlert />}
                    </span>
                    <span>
                      <span className="text-ink">{c.check}</span> <span className="text-muted">· {c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Line>
        ) : null}
        {receipt.evidence?.transcript?.length ? (
          <Line icon={<HandCoins />} label={receipt.evidence.savedCents ? `Negotiated by agents · saved ${formatCents(receipt.evidence.savedCents)}` : "Negotiated by agents"}>
            <ol className="space-y-1.5">
              {receipt.evidence.transcript.map((t, i) => (
                <li key={i} className="text-[13px] leading-snug">
                  <span className="font-medium text-ink">{t.from}:</span> <span>{t.text}</span>
                </li>
              ))}
            </ol>
          </Line>
        ) : null}
      </div>

      {/* Timeline */}
      <div className="border-t border-line bg-canvas/60 px-5 py-3.5">
        <ol className="space-y-2">
          {receipt.timeline.map((t, i) => (
            <li key={i} className="grid grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
              <span
                className={cn(
                  "size-2 rounded-full",
                  i === receipt.timeline.length - 1 ? "bg-green-500" : "bg-line-strong",
                )}
              />
              <span className="truncate text-ink-2">{t.label}</span>
              <span className="tabular text-faint">{shortDate(t.at)}</span>
            </li>
          ))}
        </ol>
        {ids.length ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-line pt-3">
            {ids.map(([k, v]) => (
              <span key={k} className="text-[11.5px] text-faint">
                PayPal {k.replace(/Id$/, "").replace(/([A-Z])/g, " $1").toLowerCase()}{" "}
                <span className="font-mono text-muted">{String(v)}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
