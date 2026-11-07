"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useMutation } from "convex/react";
import { ArrowUpRight, Lock, RotateCcw, X } from "lucide-react";
import { ACTION_TOOLS, type ActionTool, type LedgerRole } from "@plex/backend/lib/ledgerSpec";
import { api } from "@/lib/convex";
import { ReceiptCard, type Receipt } from "@/components/receipt/receipt";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { formatCents } from "@/lib/utils";
import { ConfirmDialog } from "./confirm";

const canAct = (r: Receipt) => r.kind === "task_funding" && (r.state === "held" || r.state === "funded" || r.state === "disputed");

/**
 * The full Receipt for a grid row, in a side panel (a sheet on phones), with
 * the role's action tools when they apply to this receipt.
 */
export function ReceiptPanel({
  receipt,
  role,
  tools,
  requested,
  onClose,
  onDone,
}: {
  receipt: Receipt | null;
  role: LedgerRole;
  tools: readonly ActionTool[];
  requested?: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const release = useMutation(api.ledger.stubReleasePayout);
  const refund = useMutation(api.ledger.stubRefund);
  const [confirm, setConfirm] = useState<ActionTool | null>(null);

  useEffect(() => {
    if (!receipt) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !confirm && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [receipt, confirm, onClose]);

  if (!receipt) return null;
  const actions = canAct(receipt) ? tools.filter((t) => t === "release_payout" || t === "refund") : [];
  const amount = formatCents(receipt.amountCents, receipt.currency);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close receipt"
        className="fixed inset-0 z-40 bg-ink/15 backdrop-blur-[1px] lg:bg-ink/[0.04] lg:backdrop-blur-none"
        onClick={onClose}
      />
      <aside
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] animate-rise flex-col overflow-hidden rounded-t-xl bg-canvas shadow-float sm:inset-x-auto sm:top-2 sm:right-2 sm:bottom-2 sm:max-h-none sm:w-[460px] sm:rounded-xl"
        aria-label="Receipt"
      >
        <div className="flex h-16 flex-none items-center justify-between gap-3 pr-3 pl-6">
          <div className="min-w-0">
            <div className="font-display text-[18px] font-bold tracking-[-0.025em] text-ink">Receipt</div>
          </div>
          <div className="flex items-center gap-1">
            <Link href={`/receipts/${receipt._id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Open page
              <ArrowUpRight />
            </Link>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
              <X />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4 sm:px-5 sm:pb-5">
          {actions.length ? (
            <Card className="mb-4 p-5">
              <div className="flex items-center gap-2 text-[13px] font-medium text-steel-700">
                <Lock className="size-[18px]" strokeWidth={1.9} />
                Held for this task
              </div>
              <div className="tabular mt-3 font-display text-[40px] leading-none font-extrabold tracking-[-0.045em] text-steel-900">{amount}</div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                {requested
                  ? `${requested} requested. Tasks runs it through PayPal and this receipt updates.`
                  : "Release it to the worker, or refund it to you. Both ask first."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {actions.includes("release_payout") && receipt.state !== "disputed" ? (
                  <Button variant="brand" size="sm" onClick={() => setConfirm("release_payout")} disabled={Boolean(requested)}>
                    <ArrowUpRight />
                    Release {amount}
                  </Button>
                ) : null}
                {actions.includes("refund") ? (
                  <Button variant="secondary" size="sm" onClick={() => setConfirm("refund")} disabled={Boolean(requested)}>
                    <RotateCcw />
                    Refund
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}

          <ReceiptCard key={receipt._id} receipt={receipt} />
        </div>
      </aside>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "refund" ? `Refund ${amount}?` : `Release ${amount}?`}
        body={
          confirm === "refund" ? (
            <>Tasks refunds the hold to you through PayPal and closes the task. The worker isn&apos;t paid.</>
          ) : (
            <>Tasks pays the worker {amount} through PayPal Payouts. This receipt moves to Released when the payout lands.</>
          )
        }
        detail={
          <>
            “{receipt.why}”
            <br />
            Rule: {receipt.rule.text}
          </>
        }
        confirmLabel={confirm ? `${ACTION_TOOLS[confirm].verb} ${amount}` : ""}
        moves
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (confirm === "refund") await refund({ role, receiptId: receipt._id });
          else await release({ role, receiptId: receipt._id });
          onDone(`${confirm === "refund" ? "Refund" : "Release"} of ${amount} handed to Tasks`);
        }}
      />
    </>,
    document.body,
  );
}
