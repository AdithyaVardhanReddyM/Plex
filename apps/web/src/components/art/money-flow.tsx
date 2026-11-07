"use client";

import { BadgeCheck, Bot, Lock, ReceiptText, ShieldCheck } from "lucide-react";
import { Card, IconTile, Skeleton, type TileTone } from "@/components/ui/primitives";
import type { Receipt } from "@/components/receipt/receipt";
import { cn, formatCents } from "@/lib/utils";

type Stage = {
  icon: React.ReactNode;
  tone: TileTone;
  label: string;
  value: string;
  note: string;
};

/**
 * Plex's promise as an infographic, filled with this week's numbers: an agent
 * asks, code checks the rules, PayPal holds the money, proof is verified, and
 * the payout lands with a receipt.
 */
export function MoneyFlow({
  receipts,
  approvalsWaiting,
  loading,
  className,
}: {
  receipts: Receipt[];
  approvalsWaiting: number;
  loading?: boolean;
  className?: string;
}) {
  const fromAgents = receipts.filter((r) => r.agentLabel);
  const agents = new Set(fromAgents.map((r) => r.agentLabel)).size;
  const held = receipts.filter((r) => r.state === "held" || r.state === "funded");
  const verified = receipts.filter((r) => r.evidence?.verdict || r.evidence?.checks?.length);
  const paid = receipts.filter((r) => r.state === "paid" || r.state === "released");
  const sum = (rs: Receipt[]) => rs.reduce((s, r) => s + r.amountCents, 0);

  const stages: Stage[] = [
    {
      icon: <Bot />,
      tone: "white",
      label: "An agent asks",
      value: String(fromAgents.length),
      note: `requests from ${agents} agent${agents === 1 ? "" : "s"}`,
    },
    {
      icon: <ShieldCheck />,
      tone: "white",
      label: "Your rules decide",
      value: String(fromAgents.length + approvalsWaiting),
      note: approvalsWaiting ? `checks · ${approvalsWaiting} waiting for your OK` : "checks in code · none broke a limit",
    },
    {
      icon: <Lock />,
      tone: "steel",
      label: "PayPal holds it",
      value: formatCents(sum(held)),
      note: `in ${held.length} authorization${held.length === 1 ? "" : "s"}`,
    },
    {
      icon: <BadgeCheck />,
      tone: "white",
      label: "Proof is verified",
      value: String(verified.length),
      note: "photos, place and time checked",
    },
    {
      icon: <ReceiptText />,
      tone: "ink",
      label: "Paid, with a receipt",
      value: formatCents(sum(paid)),
      note: `${paid.length} receipts written`,
    },
  ];

  return (
    <Card className={cn("relative flex flex-col overflow-hidden", className)}>
      <div className="dot-ground pointer-events-none absolute inset-0 [mask-image:linear-gradient(180deg,transparent,black_55%,transparent)] opacity-60" aria-hidden />
      <div className="relative flex flex-col gap-1 px-6 pt-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink">How every dollar moved this week</div>
          <div className="mt-0.5 text-[13px] text-faint">The model never decides. Code checks your rules, PayPal holds the money, proof releases it.</div>
        </div>
      </div>
      <ol className="relative my-auto grid gap-3 px-5 pt-7 pb-7 md:grid-cols-5 md:gap-0">
        {stages.map((s, i) => (
          <li key={s.label} className="relative flex md:flex-col md:items-center md:px-2 md:text-center">
            {/* Connector to the next stage */}
            {i < stages.length - 1 ? (
              <div
                className="absolute top-[22px] left-[calc(50%+30px)] hidden h-px w-[calc(100%-60px)] md:block"
                aria-hidden
              >
                <div className="h-px w-full bg-[repeating-linear-gradient(90deg,var(--color-line-strong)_0_4px,transparent_4px_8px)]" />
                <span
                  className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-500 shadow-[0_0_0_3px_rgb(13_206_218/0.18)]"
                  style={{ animation: `flow 2.8s ${i * 0.55}s var(--ease-out-soft) infinite` }}
                />
              </div>
            ) : null}
            <div className="relative flex-none">
              <IconTile tone={s.tone} size="lg" className={cn("size-11", s.tone === "ink" && "shadow-raised")}>
                {s.icon}
              </IconTile>
              <span className="tabular absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full border border-line bg-surface text-[10px] font-semibold text-muted">
                {i + 1}
              </span>
            </div>
            <div className="ml-4 min-w-0 md:mt-3 md:ml-0">
              <div className="text-[12.5px] font-medium text-muted">{s.label}</div>
              {loading ? (
                <Skeleton className="mx-auto mt-1.5 h-6 w-16" />
              ) : (
                <div
                  className={cn(
                    "font-display tabular mt-0.5 text-[22px] leading-tight font-bold tracking-[-0.025em]",
                    s.tone === "steel" ? "text-steel-700" : s.tone === "ink" ? "text-green-800" : "text-ink",
                  )}
                >
                  {s.value}
                </div>
              )}
              <div className="mt-0.5 text-[12px] leading-snug text-pretty text-faint">{s.note}</div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
