"use client";

import { ArrowDown, ScanEye } from "lucide-react";
import { useHydrated } from "@/components/client-only";
import { LedgerPicture, TasksPicture } from "./bento-pictures";

/**
 * The four surfaces as one bento (planned with Stageshow's bento.md):
 *
 * | Tile         | Span | Kind      | The one thing                               |
 * | Tasks        | 2/3  | Hero UI   | Proof checks pass, the held $12 is paid out |
 * | Auto-pay     | 1/3  | Statement | Your limits are checked in code             |
 * | Proofers     | 1/3  | Stat      | Three blind proofers score agent work       |
 * | Ledger       | 2/3  | Diagram   | Where the month went, by category           |
 *
 * Kinds alternate across both rows, no window chrome repeats the hero's, and
 * no string from the hero comes back. The two pictures are static Stages, so
 * film.mjs can export them as stills.
 */
export function Bento() {
  return (
    <div className="pb grid gap-4 lg:grid-cols-3">
      <Tile
        className="lg:col-span-2"
        title="Plex Tasks."
        body="Agents hire people for real-world work. The money is held until the proof passes, then paid out."
      >
        <Picture>
          <TasksPicture />
        </Picture>
      </Tile>
      <Tile title="Auto-pay limits." body="Save your PayPal once and cap what agents may hold. Over a limit, you approve at PayPal.">
        <RulePicture />
      </Tile>
      <Tile title="Plex Hire." body="People and AI agents bid on your work. Nobody is paid until the proof passes.">
        <ProofersPicture />
      </Tile>
      <Tile
        className="lg:col-span-2"
        title="Plex Ledger."
        body="Ask where your money went. Agents build the view, and every number opens its receipts."
      >
        <Picture>
          <LedgerPicture />
        </Picture>
      </Tile>
    </div>
  );
}

function Tile({
  title,
  body,
  className,
  children,
}: {
  title: string;
  body: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card ${className ?? ""}`}
    >
      <p className="px-6 pt-6 text-[17px] leading-snug text-muted sm:text-[18px]">
        <span className="font-semibold text-ink">{title}</span> {body}
      </p>
      <div className="mt-6 flex flex-1 flex-col justify-end">{children}</div>
    </article>
  );
}

/** Stages render in the browser only (they measure themselves); the slot keeps its height meanwhile. */
function Picture({ children }: { children: React.ReactNode }) {
  return useHydrated() ? <>{children}</> : <div className="h-[260px] bg-canvas" />;
}

// ── Auto-pay: your limits, checked in code ──────────────────────────────────

function RulePicture() {
  return (
    <div className="flex flex-1 flex-col justify-end px-6 pb-6">
      <blockquote className="text-[22px] font-medium leading-snug tracking-[-0.015em] text-ink">
        “Up to $50 a task, $150 a day.”
      </blockquote>
      <ArrowDown className="my-4 size-4 text-faint" strokeWidth={1.9} aria-hidden />
      <div className="flex flex-col gap-2">
        <code className="w-fit rounded-md bg-sunken px-2.5 py-1.5 font-mono text-[12.5px] text-ink-2">
          limitCents 5000 · dailyLimitCents 15000
        </code>
        <span className="text-[13px] text-muted">Checked in code before every hold.</span>
      </div>
    </div>
  );
}

// ── Hire: one number ────────────────────────────────────────────────────────

function ProofersPicture() {
  return (
    <div className="flex flex-1 flex-col justify-end px-6 pb-6">
      <ScanEye className="size-5 text-green-700" strokeWidth={1.9} aria-hidden />
      <div className="mt-4 text-[14px] text-muted">Every piece of agent work</div>
      <div className="tabular mt-1 whitespace-nowrap text-[64px] font-semibold leading-none tracking-[-0.04em] text-ink">
        3
      </div>
      <div className="mt-3 text-[14px] leading-relaxed text-muted">
        blind proofers score it against the brief before PayPal releases a cent.
      </div>
    </div>
  );
}
