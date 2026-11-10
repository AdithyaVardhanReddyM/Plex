"use client";

import { motion } from "motion/react";
import { Fragment } from "react";
import { cn, formatCents } from "@/lib/utils";
import type { Receipt } from "./receipt";

/**
 * Where the money went, as a path drawn from the receipt's own PayPal record:
 * who paid → PayPal's hold → the capture → each share (Payouts, or what Plex
 * kept). Every node shows its PayPal id. Nothing here is illustrative: a step
 * appears only if the receipt has it.
 */

type Node = { key: string; title: string; amount?: number; sub: string; id?: string; tone: "ink" | "steel" | "green" | "muted" | "red" };

function nodesFor(r: Receipt): { main: Node[]; split: Node[] } {
  const p = r.paypal ?? {};
  const states = new Set(r.timeline.map((t) => t.state));
  const main: Node[] = [{ key: "payer", title: r.payerLabel, amount: r.amountCents, sub: r.kind === "invoice" && !r.payerId ? "Paid the PayPal invoice" : "Paid with PayPal", tone: "ink" }];
  if (p.invoiceId) main.push({ key: "invoice", title: "PayPal invoice", sub: "Invoicing v2", id: p.invoiceId, tone: "steel" });
  if (p.authorizationId || states.has("held"))
    main.push({ key: "hold", title: "Held by PayPal", sub: "Authorized, not charged", id: p.authorizationId ?? p.orderId, tone: "steel" });
  if (r.state === "refunded")
    main.push({ key: "back", title: p.refundId ? "Refunded" : "Voided", sub: p.refundId ? "Back to the payer" : "Never charged", id: p.refundId ?? p.authorizationId, tone: "muted" });
  else if (p.captureId || r.state === "released" || r.state === "paid" || states.has("funded"))
    main.push({ key: "capture", title: "Captured", sub: r.rule.source === "proof" ? "Only after the proof passed" : r.rule.source === "policy" ? "Every rule passed" : "Charged", id: p.captureId ?? p.orderId, tone: "green" });

  const split: Node[] = [];
  if (r.split?.length)
    for (const l of r.split)
      split.push({
        key: `${l.role}-${l.label}`,
        title: l.label,
        amount: l.cents,
        sub: l.via === "payout" ? `PayPal Payouts${l.note ? ` · ${l.note}` : ""}` : `Kept by Plex${l.note ? ` · ${l.note}` : ""}`,
        id: l.via === "payout" ? (l.payoutItemId ?? p.payoutItemId ?? p.payoutBatchId) : undefined,
        tone: l.via === "payout" ? "green" : "muted",
      });
  else if (r.state !== "refunded" && r.state !== "held" && r.state !== "pending")
    split.push({
      key: "payee",
      title: r.payeeLabel,
      amount: r.amountCents,
      sub: p.payoutBatchId ? "PayPal Payouts" : r.state === "paid" ? "Paid" : "Released",
      id: p.payoutItemId ?? p.payoutBatchId,
      tone: "green",
    });
  return { main, split };
}

const TONE: Record<Node["tone"], string> = {
  ink: "bg-ink text-white",
  steel: "bg-steel-50 text-steel-900 ring-1 ring-inset ring-steel-200",
  green: "bg-green-50 text-ink ring-1 ring-inset ring-green-200",
  muted: "bg-sunken text-ink-2 ring-1 ring-inset ring-line",
  red: "bg-disputed-bg text-disputed",
};

function Box({ n, i }: { n: Node; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 + i * 0.22, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn("min-w-0 rounded-[12px] px-3 py-2.5", TONE[n.tone])}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-semibold">{n.title}</span>
        {n.amount !== undefined ? <span className="font-display text-[14px] font-bold tabular">{formatCents(n.amount)}</span> : null}
      </div>
      <div className={cn("mt-0.5 truncate text-[11.5px]", n.tone === "ink" ? "text-white/70" : "text-muted")}>{n.sub}</div>
      {n.id ? <div className={cn("mt-1 truncate font-mono text-[10.5px]", n.tone === "ink" ? "text-white/50" : "text-faint")}>{n.id}</div> : null}
    </motion.div>
  );
}

/** A short vertical line that draws itself, with a dot running down it: money moving. */
function Wire({ i, live }: { i: number; live: boolean }) {
  return (
    <div className="relative mx-auto h-6 w-px">
      <motion.span
        className="absolute inset-0 origin-top bg-line-strong"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ delay: 0.22 + i * 0.22, duration: 0.25 }}
      />
      {live ? (
        <motion.span
          className="absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-green-500"
          initial={{ top: 0, opacity: 0 }}
          animate={{ top: ["0%", "100%"], opacity: [0, 1, 0] }}
          transition={{ delay: 0.6 + i * 0.22, duration: 0.9, repeat: Infinity, repeatDelay: 1.6 }}
        />
      ) : null}
    </div>
  );
}

export function MoneyFlow({ receipt, className }: { receipt: Receipt; className?: string }) {
  const { main, split } = nodesFor(receipt);
  const live = receipt.state !== "refunded" && receipt.state !== "declined";
  return (
    <div className={className}>
      {main.map((n, i) => (
        <Fragment key={n.key}>
          {i > 0 ? <Wire i={i} live={live} /> : null}
          <Box n={n} i={i} />
        </Fragment>
      ))}
      {split.length ? (
        <>
          <Wire i={main.length} live={live} />
          <div className={cn("grid gap-2", split.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {split.map((n, j) => (
              <Box key={n.key} n={n} i={main.length + j} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
