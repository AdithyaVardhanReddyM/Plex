"use client";

import { BadgeCheck, Cpu, Lock, ReceiptText, ShieldCheck } from "lucide-react";
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
      icon: <Cpu />,
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
                <div className="h-[1.5px] w-full rounded-full bg-[linear-gradient(90deg,var(--color-line-strong),var(--color-green-300))]" />
              </div>
            ) : null}
            <div className="relative flex-none">
              <IconTile tone={s.tone} size="lg" className={cn("size-11", s.tone === "ink" && "shadow-raised")}>
                {s.icon}
              </IconTile>
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
