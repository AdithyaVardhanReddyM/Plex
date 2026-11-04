"use client";

import { ArrowDown, HeartHandshake } from "lucide-react";
import { useHydrated } from "@/components/client-only";
import { LedgerPicture, TasksPicture } from "./bento-pictures";

/**
 * The four surfaces as one bento (planned with Stageshow's bento.md):
 *
 * | Tile         | Span | Kind      | The one thing                               |
 * | Tasks        | 2/3  | Hero UI   | Proof checks pass, the held $12 is paid out |
 * | Plex for Mac | 1/3  | Statement | Your words become a rule the code enforces  |
 * | Causes       | 1/3  | Stat      | $45 pays one cleanup shift, on proof        |
 * | Ledger       | 2/3  | Diagram   | Where the month went, pot by pot            |
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
      <Tile title="Plex for Mac." body="A voice agent in your notch that shops and pays, inside limits you write in plain English.">
        <MacPicture />
      </Tile>
      <Tile title="Plex Causes." body="Fund a task, not a black hole. Donations pay local people for work they prove.">
        <CausesPicture />
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

// ── Plex for Mac: your words become a rule ──────────────────────────────────

function MacPicture() {
  return (
    <div className="flex flex-1 flex-col justify-end px-6 pb-6">
      <blockquote className="text-[22px] font-medium leading-snug tracking-[-0.015em] text-ink">
        “Never buy subscriptions without asking.”
      </blockquote>
      <ArrowDown className="my-4 size-4 text-faint" strokeWidth={1.9} aria-hidden />
      <div className="flex flex-col gap-2">
        <code className="w-fit rounded-md bg-sunken px-2.5 py-1.5 font-mono text-[12.5px] text-ink-2">
          block_category &quot;subscriptions&quot;
        </code>
        <span className="text-[13px] text-muted">Checked in code before every payment.</span>
      </div>
    </div>
  );
}

// ── Causes: one number ──────────────────────────────────────────────────────

function CausesPicture() {
  return (
    <div className="flex flex-1 flex-col justify-end px-6 pb-6">
      <HeartHandshake className="size-5 text-green-600" strokeWidth={1.9} aria-hidden />
      <div className="mt-4 text-[14px] text-muted">One cleanup shift at Lake Merritt</div>
      <div className="tabular mt-1 whitespace-nowrap text-[64px] font-semibold leading-none tracking-[-0.04em] text-ink">
        $45
      </div>
      <div className="mt-3 text-[14px] leading-relaxed text-muted">
        paid to a local worker when the before-and-after photos pass. Lakeside Commons, Oakland.
      </div>
    </div>
  );
}

