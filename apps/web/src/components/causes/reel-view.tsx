"use client";

import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, CalendarDays, Check, ImageOff, Link2, Lock, MapPin, TriangleAlert } from "lucide-react";
import { api, type Id } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { ReceiptCard } from "@/components/receipt/receipt";
import { cn, formatCents, shortDate } from "@/lib/utils";
import { CauseCover, LocationMap, placeTime, windowLabel } from "./parts";

/**
 * A donor's Proof Reel: what one donation paid for. Built only from receipts
 * and the worker's own proof media; nothing here is generated except the
 * caption's wording, which is labeled.
 */
export function ReelView({ donationId }: { donationId: string }) {
  const reel = useQuery(api.donations.reel, { donationId });
  const writeCaption = useAction(api.donations.writeCaption);
  const asked = useRef(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (asked.current || !reel || reel.status !== "verified" || reel.caption.by !== "template") return;
    asked.current = true;
    void writeCaption({ donationId: donationId as Id<"donations"> }).catch(() => {});
  }, [reel, donationId, writeCaption]);

  if (reel === undefined) return <Skeleton className="mx-auto h-[560px] w-full max-w-2xl" />;
  if (reel === null)
    return (
      <Card className="mx-auto max-w-xl">
        <EmptyState title="No Proof Reel here" body="This link doesn't match a donation." />
      </Card>
    );

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `Proof Reel · ${reel.cause.name}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      // The donor closed the share sheet.
    }
  };

  const paidTotal = reel.workers.reduce((s, w) => s + w.amountCents, 0);
  const place = reel.task?.location ?? reel.cause.location;
  const verified = reel.status === "verified";

  return (
    <div className="mx-auto max-w-2xl animate-rise">
      <article className="overflow-hidden rounded-xl border border-line bg-surface shadow-raised">
        <div className="h-1 w-full" style={{ background: "var(--metal)" }} aria-hidden />
        <CauseCover hue={reel.cause.coverHue} className="px-5 pt-5 pb-6 sm:px-7 sm:pt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
              <Avatar name={reel.org.name} color={reel.org.avatarColor} size={22} />
              {reel.org.name}
            </div>
            <span
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium shadow-card ring-1",
                verified ? "bg-surface text-green-700 ring-green-200" : "bg-surface text-steel-700 ring-steel-200",
              )}
            >
              {verified ? <BadgeCheck className="size-3.5" strokeWidth={1.9} /> : <Lock className="size-3.5" strokeWidth={1.9} />}
              {verified ? "Proof passed" : reel.status === "held" ? "Held until proof" : "Given"}
            </span>
          </div>
          <div className="mt-6 text-[12.5px] font-medium text-ink-2">Proof Reel</div>
          <h1 className="mt-1 text-[24px] font-semibold leading-[1.2] tracking-[-0.025em] text-ink sm:text-[28px]">
            {reel.task?.title ?? reel.cause.name}
          </h1>
          {reel.task ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" strokeWidth={1.9} />
                {windowLabel(reel.task.windowStart, reel.task.windowEnd)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" strokeWidth={1.9} />
                {place.label}
              </span>
            </div>
          ) : null}
        </CauseCover>

        <div className="px-5 py-5 sm:px-7">
          <p className="text-[16px] leading-[1.6] text-ink">{reel.caption.text}</p>
          <div className="mt-2 text-[11.5px] text-faint">
            {reel.caption.by === "template" ? "Caption written from the receipts" : `Caption by ${reel.caption.by}, from the receipts`}
          </div>
        </div>

        {reel.task && reel.media.length ? (
          <div className="px-5 sm:px-7">
            <div className={cn("grid gap-2", reel.media.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
              {reel.media.map((m, i) => (
                <figure key={i} className="min-w-0">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-sunken ring-1 ring-inset ring-line">
                    {m.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt={`${m.label}: ${m.description}`} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-1.5 px-2 text-center">
                        <ImageOff className="size-4 text-faint" strokeWidth={1.9} />
                        <span className="text-[11.5px] leading-snug text-faint">No photo in the seeded demo</span>
                      </div>
                    )}
                    <span className="absolute top-2 left-2 rounded-full bg-surface/90 px-2 py-0.5 text-[11.5px] font-medium text-ink-2 shadow-card">
                      {m.label}
                    </span>
                  </div>
                  <figcaption className="tabular mt-1.5 truncate text-[11.5px] text-muted">
                    {m.capturedAt ? placeTime(m.capturedAt).split(" · ")[1] : m.description}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        ) : null}

        {reel.proof?.verdict ? (
          <div className="mx-5 mt-5 rounded-md bg-canvas p-4 ring-1 ring-inset ring-line sm:mx-7">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13.5px] font-semibold text-ink">
                Checked by Plex · {Math.round(reel.proof.verdict.confidence * 100)}% ·{" "}
                {reel.proof.verdict.checks.filter((c) => c.passed).length} of {reel.proof.verdict.checks.length} checks
              </div>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {reel.proof.verdict.checks.map((c) => (
                <li key={c.check} className="flex items-start gap-2 text-[13px] leading-snug">
                  <span className={cn("mt-0.5", c.passed ? "text-green-600" : "text-disputed")}>
                    {c.passed ? <Check className="size-3.5" strokeWidth={2.4} /> : <TriangleAlert className="size-3.5" strokeWidth={1.9} />}
                  </span>
                  <span>
                    <span className="text-ink">{c.check}</span> <span className="text-muted">· {c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {reel.workers.length ? (
          <div className="mt-5 border-t border-line px-5 py-4 sm:px-7">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[13.5px] font-semibold text-ink">Paid through PayPal Payouts</div>
              <Amount cents={paidTotal} size="sm" className="text-green-700" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {reel.workers.map((w) => (
                <span
                  key={w.receiptId}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-surface pr-3 pl-1 shadow-card ring-1 ring-line"
                >
                  <Avatar name={w.firstName} color={w.avatarColor} size={28} />
                  <span className="text-[13.5px] font-medium text-ink">{w.firstName}</span>
                  <span className="tabular text-[13px] text-muted">{formatCents(w.amountCents)}</span>
                </span>
              ))}
            </div>
          </div>
        ) : reel.task ? (
          <div className="mt-5 flex gap-2.5 border-t border-line px-5 py-4 text-[13.5px] leading-relaxed text-steel-700 sm:px-7">
            <Lock className="mt-0.5 size-4 flex-none" strokeWidth={1.9} />
            Your {formatCents(reel.donation.amountCents)} is held for this shift. When its proof passes, the workers are paid and
            their photos appear here.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/70 px-5 py-3.5 sm:px-7">
          <div className="text-[13px] text-ink-2">
            <span className="tabular font-semibold text-ink">{formatCents(reel.donation.amountCents)}</span> from{" "}
            {reel.donation.donorLabel} · {shortDate(reel.donation.at)}
          </div>
          <Button variant="secondary" size="sm" onClick={share}>
            <Link2 /> {copied ? "Link copied" : "Share"}
          </Button>
        </div>
      </article>

      <p className="mt-3 px-1 text-[12px] leading-relaxed text-faint">
        Built only from Plex receipts and the worker&apos;s own photos. Plex never generates images of the work. Names are first
        names, with consent.
      </p>

      {reel.task && place.lat ? (
        <div className="mt-6">
          <LocationMap label={place.label} lat={place.lat} lng={place.lng} />
        </div>
      ) : null}

      {reel.receipt ? (
        <div className="mt-6">
          <div className="mb-3 text-[15px] font-semibold text-ink">Your receipt</div>
          <ReceiptCard receipt={reel.receipt} />
        </div>
      ) : null}

      <div className="mt-6">
        <Link href={`/c/${reel.cause.slug}`} className={buttonVariants({ variant: "secondary" })}>
          {reel.cause.name} <ArrowRight />
        </Link>
      </div>
    </div>
  );
}
