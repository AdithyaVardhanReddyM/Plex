"use client";

import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CircleDashed, Clapperboard, Lock, RotateCcw } from "lucide-react";
import { api, type Id } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { ReceiptCard } from "@/components/receipt/receipt";
import { formatCents } from "@/lib/utils";

type Phase = { kind: "capturing" } | { kind: "done" } | { kind: "error"; message: string };

export function ThanksView({ slug, checkoutId, token }: { slug: string; checkoutId: string | null; token: string | null }) {
  const complete = useAction(api.donations.complete);
  const data = useQuery(api.donations.forCheckout, checkoutId ? { checkoutId } : "skip");
  const [phase, setPhase] = useState<Phase>({ kind: "capturing" });
  const started = useRef(false);

  const run = async () => {
    if (!checkoutId) return;
    setPhase({ kind: "capturing" });
    try {
      await complete({ checkoutId: checkoutId as Id<"donationCheckouts">, token: token ?? undefined });
      setPhase({ kind: "done" });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof ConvexError ? String(err.data) : "We couldn't confirm this payment with PayPal.",
      });
    }
  };

  useEffect(() => {
    if (started.current || !checkoutId) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutId]);

  if (!checkoutId)
    return (
      <Card className="mx-auto max-w-xl">
        <EmptyState title="Nothing to confirm" body="This page opens after PayPal sends you back from a donation." />
      </Card>
    );

  const completed = data?.status === "completed" && data.rows.length > 0;

  if (!completed && phase.kind === "error")
    return (
      <Card className="mx-auto max-w-xl p-6">
        <div className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">The donation didn&apos;t go through</div>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{phase.message}</p>
        <p className="mt-1 text-[13px] text-faint">Nothing is recorded until PayPal confirms the capture.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={run}>
            <RotateCcw /> Try again
          </Button>
          <Link href={`/c/${slug}`} className={buttonVariants({ variant: "secondary" })}>
            Back to the cause
          </Link>
        </div>
      </Card>
    );

  if (!completed || !data)
    return (
      <Card className="mx-auto max-w-xl p-6">
        <div className="flex items-center gap-3">
          <CircleDashed className="size-5 animate-spin text-steel-500 [animation-duration:2s]" strokeWidth={1.9} />
          <div className="text-[15px] font-medium text-ink">Confirming your donation with PayPal…</div>
        </div>
        <Skeleton className="mt-6 h-40 w-full" />
      </Card>
    );

  const first = data.rows[0]!;
  const held = data.rows.filter((r) => r.receipt?.state === "held");
  const firstName = data.donorLabel === "Anonymous" ? null : data.donorLabel.split(/\s+/)[0];
  const headline =
    data.rows.length > 1
      ? `${formatCents(data.totalCents)}, split across ${data.rows.length} causes.`
      : first.taskTitle
        ? `${formatCents(first.donation.amountCents)} is held for “${first.taskTitle}”.`
        : `${formatCents(first.donation.amountCents)} went to ${first.causeName}.`;

  const steps = [
    { label: "Captured through PayPal", done: true },
    ...(held.length
      ? [
          { label: "Held by Plex until the shift's proof passes", done: true, steel: true },
          { label: "Workers paid through PayPal Payouts", done: false },
          { label: "Your Proof Reel arrives with their photos", done: false },
        ]
      : [{ label: `Paid to ${first.receipt?.payeeLabel ?? first.causeName}`, done: true }]),
  ];

  return (
    <div className="mx-auto max-w-xl animate-rise">
      <div className="spotlight rounded-xl p-6 sm:p-7">
        <div className="flex items-center gap-2 text-[13px] font-medium text-white/60">
          <Check className="size-4 text-green-300" strokeWidth={2.4} />
          Donation confirmed by PayPal
        </div>
        <h1 className="mt-4 font-display text-[40px] leading-[1.05] font-extrabold tracking-[-0.04em] text-white sm:text-[48px]">
          Thank you{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-white/70">{headline}</p>
      </div>

      <Card className="mt-4 p-6">
        <div className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink">What happens to your money</div>
        <ol className="mt-4 space-y-3.5">
          {steps.map((s, i) => {
            const steel = "steel" in s && s.steel;
            return (
              <li key={i} className="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-3 text-[14px]">
                {s.done ? (
                  steel ? (
                    <Lock className="size-[18px] text-steel-600" strokeWidth={2} />
                  ) : (
                    <Check className="size-[18px] text-green-700" strokeWidth={2.4} />
                  )
                ) : (
                  <span className="tabular text-center font-display text-[14px] font-bold text-faint">{i + 1}</span>
                )}
                <span className={s.done ? "text-ink" : "text-muted"}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href={`/c/${first.causeSlug}/reel/${first.donation._id}`} className={buttonVariants({ variant: "primary" })}>
          <Clapperboard /> {held.length ? "Your Proof Reel" : "See what it funds"}
        </Link>
        <Link href={`/c/${slug}`} className={buttonVariants({ variant: "secondary" })}>
          Back to the cause <ArrowRight />
        </Link>
      </div>

      <div className="mt-8 space-y-4">
        <div className="flex items-baseline justify-between">
          <div className="text-[15px] font-semibold text-ink">{data.rows.length > 1 ? "Your receipts" : "Your receipt"}</div>
          <Amount cents={data.totalCents} size="sm" className="text-muted" />
        </div>
        {data.rows.map((r) => (r.receipt ? <ReceiptCard key={r.donation._id} receipt={r.receipt} /> : null))}
      </div>
    </div>
  );
}
