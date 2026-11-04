"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useMutation } from "convex/react";
import { ArrowUpRight, RotateCcw, X } from "lucide-react";
import { ACTION_TOOLS, type ActionTool, type LedgerRole } from "@plex/backend/lib/ledgerSpec";
import { api } from "@/lib/convex";
import { ReceiptCard, type Receipt } from "@/components/receipt/receipt";
import { Button } from "@/components/ui/button";
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
      <button type="button" aria-label="Close receipt" className="fixed inset-0 z-40 bg-ink/10 lg:bg-transparent" onClick={onClose} />
      <aside
        className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] animate-rise overflow-y-auto rounded-t-xl border-t border-line bg-canvas p-4 shadow-float sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:border-t-0 sm:border-l sm:p-5"
        aria-label="Receipt"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[13px] font-medium text-muted">Receipt</div>
          <div className="flex items-center gap-1">
            <Link
              href={`/receipts/${receipt._id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[13px] font-medium text-ink-2 hover:bg-sunken"
            >
              Open
              <ArrowUpRight size={16} strokeWidth={1.9} />
            </Link>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
              <X />
            </Button>
          </div>
        </div>

        <ReceiptCard receipt={receipt} />

        {actions.length ? (
          <div className="mt-4 rounded-lg border border-line bg-surface p-4 shadow-card">
            <div className="text-[13.5px] font-semibold text-ink">{amount} is held for this task</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {requested
                ? `${requested} requested. Tasks runs it through PayPal and this receipt updates.`
                : "Release it to the worker, or refund it to you. Both ask first."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
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
          </div>
        ) : null}
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
