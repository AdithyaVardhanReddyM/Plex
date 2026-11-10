"use client";

import Link from "next/link";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Loader2, ScanSearch } from "lucide-react";
import { api } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { useAs } from "@/components/tasks/persona";
import { CheckMark, errorMessage } from "@/components/tasks/task-ui";
import { cn, formatCents, relativeTime } from "@/lib/utils";

type Result = FunctionReturnType<typeof api.reconcile.run>;

/** An agent re-reads each receipt's money at PayPal and code says whether it matches. */
export function ReconcileCard() {
  const as = useAs();
  const run = useAction(api.reconcile.run);
  const [r, setR] = useState<Result>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [all, setAll] = useState(false);
  const rows = r ? (all ? r.rows : [...r.rows.filter((x) => !x.ok), ...r.rows.filter((x) => x.ok)].slice(0, 6)) : [];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
            <ScanSearch className="size-[18px] text-green-700" strokeWidth={1.9} /> Reconcile with PayPal
          </div>
          {r ? (
            <div className="mt-2 flex items-baseline gap-2">
              <span className={cn("font-display text-[40px] leading-none font-extrabold tracking-[-0.04em] tabular", r.matched === r.checked ? "text-ink" : "text-disputed")}>
                {r.matched} of {r.checked}
              </span>
              <span className="text-[13px] text-muted">receipts match PayPal&apos;s records</span>
            </div>
          ) : (
            <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">
              An agent reads every recent payment straight from PayPal, by its own ids (holds, captures, refunds, payouts, invoices), and code checks each amount and state against your receipt.
            </p>
          )}
        </div>
        <Button variant={r ? "secondary" : "primary"} disabled={busy} onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            setR(await run({ as }));
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}>
          {busy ? <Loader2 className="animate-spin" /> : <ScanSearch />} {busy ? "Reading PayPal…" : r ? "Check again" : "Check against PayPal"}
        </Button>
      </div>
      {error ? <p className="mt-3 text-[12.5px] text-disputed">{error}</p> : null}
      {r ? (
        <>
          <p className="mt-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">{r.summary}</p>
          <ol className="mt-4 grid gap-0.5">
            {rows.map((x) => (
              <li key={x.receiptId} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-x-3 py-1.5">
                <CheckMark status={x.ok ? "pass" : "fail"} />
                <div className="min-w-0">
                  <Link href={`/receipts/${x.receiptId}`} className="block truncate text-[13px] font-medium text-ink hover:underline">
                    {x.label}
                  </Link>
                  <div className="truncate text-[12px] text-muted">
                    {x.note} · <span className="font-mono text-[11px] text-faint">{x.source}</span>
                  </div>
                </div>
                <div className="text-right text-[12px] tabular">
                  <div className="text-ink">{formatCents(x.plexCents)}</div>
                  <div className="text-faint">{x.plexState} → {x.paypalState ?? "—"}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-faint">
            <span>
              {r.ledger.note} Checked {relativeTime(r.checkedAt)} · summary by {r.model}
            </span>
            {r.rows.length > 6 ? (
              <button type="button" className="font-medium text-ink-2 hover:text-ink" onClick={() => setAll((a) => !a)}>
                {all ? "Show fewer" : `Show all ${r.rows.length}`}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </Card>
  );
}
