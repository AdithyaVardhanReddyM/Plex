import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
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
  Split,
  TriangleAlert,
  Check,
} from "lucide-react";
import { AiAgentIcon } from "@/components/ui/icons";
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

export function ReceiptKindIcon({ receipt, size = 34 }: { receipt: Receipt; size?: number }) {
  const dir = direction(receipt);
  return (
    <span
      className={cn(
        "relative flex flex-none items-center justify-center [&_svg]:size-5 [&_svg]:stroke-[1.8]",
        dir === "in" ? "text-green-700" : "text-ink-2",
      )}
      style={{ width: size, height: size }}
    >
      {dir === "in" ? <ArrowDownLeft /> : KIND[receipt.kind].icon}
    </span>
  );
}

export function ReceiptRow({ receipt, href }: { receipt: Receipt; href?: string }) {
  const dir = direction(receipt);
  const content = (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors group-hover:bg-sunken/70">
      <ReceiptKindIcon receipt={receipt} />
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-medium leading-snug text-ink">
          {receipt.payeeLabel === "Plex (held)" ? receipt.why : dir === "in" ? receipt.payerLabel : receipt.payeeLabel}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] leading-snug text-muted">
          <span className="truncate">
            {KIND[receipt.kind].label}
            {receipt.agentLabel ? <span className="hidden sm:inline"> · {receipt.agentLabel}</span> : null}
          </span>
          <span className="text-line-strong">·</span>
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
    <Link href={href} className="group block rounded-[10px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200">
      {content}
    </Link>
  ) : (
    <div className="group">{content}</div>
  );
}

// ── Full receipt ─────────────────────────────────────────────────────────────

function Line({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 py-3.5">
      <span className="flex size-7 items-center justify-center text-ink-2 [&_svg]:size-[18px] [&_svg]:stroke-[1.8]">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11.5px] font-medium text-faint">{label}</div>
        <div className="mt-0.5 text-[13.5px] leading-relaxed text-ink-2">{children}</div>
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

/**
 * The receipt: the product's signature object. A foil edge on top, the amount,
 * the person's own words, the rule that allowed it, the evidence, and a
 * timeline down to the PayPal IDs, closed by a perforated foot.
 */
export function ReceiptCard({ receipt, className }: { receipt: Receipt; className?: string }) {
  const dir = direction(receipt);
  const ids = Object.entries(receipt.paypal ?? {}).filter(([, v]) => Boolean(v));
  return (
    <article className={cn("relative", className)}>
      <div className="relative overflow-hidden rounded-t-lg border border-b-0 border-line bg-surface shadow-raised">
        {/* Foil edge: every receipt carries it */}
        <div className="h-1.5 w-full" style={{ background: "var(--metal)" }} aria-hidden />

        <div className="px-5 pt-4 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <ReceiptKindIcon receipt={receipt} size={30} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-ink-2">{KIND[receipt.kind].label}</div>
                <div className="tabular text-[11.5px] text-faint">{shortDate(receipt.occurredAt)}</div>
              </div>
            </div>
            <StatePill state={receipt.state} />
          </div>
          <div className="mt-5 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11.5px] font-medium text-faint">{dir === "in" ? "From" : "To"}</div>
              <div className="mt-0.5 truncate text-[17px] font-semibold tracking-[-0.015em] text-ink">
                {dir === "in" ? receipt.payerLabel : receipt.payeeLabel}
              </div>
              <div className="mt-0.5 truncate text-[12.5px] text-muted">
                {dir === "in" ? "to " + receipt.payeeLabel : "from " + receipt.payerLabel}
              </div>
            </div>
            <Amount cents={receipt.amountCents} currency={receipt.currency} sign={dir} size="lg" className="text-[26px]" />
          </div>
        </div>

        <div className="mx-5 rounded-[14px] bg-gradient-to-br from-green-100/80 via-green-50 to-surface px-4 py-4">
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-green-800">
            <Quote className="size-3.5" strokeWidth={2} />
            Why, in your words
          </div>
          <p className="mt-1.5 text-[14.5px] leading-relaxed font-medium text-pretty text-ink">“{receipt.why}”</p>
        </div>

        <div className="space-y-1 px-5 pt-2 pb-2">
          <Line icon={<ShieldCheck />} label={RULE_SOURCE[receipt.rule.source]}>
            {receipt.rule.text}
          </Line>
          {/* Who got what: shown when the payment didn't all go to one person */}
          {receipt.split?.some((l) => l.via === "kept") ? (
            <Line icon={<Split />} label="Who got what">
              <ul className="mt-1 space-y-1.5">
                {receipt.split.map((l, i) => (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 text-[13px] leading-snug">
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{l.label}</span>
                      <span className="text-muted">
                        {l.note ? ` · ${l.note}` : ""} · {l.via === "payout" ? "PayPal Payouts" : "kept from the capture"}
                      </span>
                    </span>
                    <span className="tabular font-medium text-ink">{formatCents(l.cents, receipt.currency)}</span>
                  </li>
                ))}
              </ul>
            </Line>
          ) : null}
          {receipt.agentLabel ? (
            <Line icon={<AiAgentIcon />} label="Agent">
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
                      <span className={cn("mt-0.5 [&_svg]:size-3.5", c.passed ? "text-green-700" : "text-disputed")}>
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
        <div className="mx-3 mb-3 rounded-[14px] bg-canvas/80 px-4 pt-4 pb-4">
          <div className="mb-3 text-[11.5px] font-medium text-faint">Timeline</div>
          <ol className="relative">
            {receipt.timeline.map((t, i) => {
              const last = i === receipt.timeline.length - 1;
              return (
                <li key={i} className="relative grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-3 pb-3 text-[13px] leading-[1.4] last:pb-0">
                  {!last ? <span className="absolute top-[20px] bottom-[2px] left-[7.5px] w-px bg-line-strong" aria-hidden /> : null}
                  <span className={cn("relative mt-px [&_svg]:size-4 [&_svg]:stroke-[2]", last ? "text-green-600" : "text-faint")}>
                    {last ? <BadgeCheck /> : <Check />}
                  </span>
                  <span className={cn("text-pretty", last ? "font-medium text-ink" : "text-ink-2")}>{t.label}</span>
                  <span className="tabular whitespace-nowrap text-[12px] text-faint">{shortDate(t.at)}</span>
                </li>
              );
            })}
          </ol>
          {ids.length ? (
            <dl className="mt-4 grid gap-1.5 pt-1">
              {ids.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 text-[11.5px]">
                  <dt className="text-faint">PayPal {k.replace(/Id$/, "").replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                  <dd className="truncate font-mono text-muted">{String(v)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
      {/* Perforated foot */}
      <div className="perforation-edge h-3 w-full" aria-hidden />
    </article>
  );
}
