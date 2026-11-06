"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ChartNoAxesColumn, History } from "lucide-react";
import { api, type Doc } from "@/lib/convex";
import { EmptyState } from "@/components/ui/primitives";
import { cn, relativeTime } from "@/lib/utils";
import {
  BillsWidget,
  FigureWidget,
  PotsWidget,
  ReceiptsWidget,
  SubscriptionsWidget,
  TimelineWidget,
  type InsightWidget,
} from "./widgets";

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** A figure, or a receipts stat: the headline numbers that lead the page. */
const isHeadline = (w: InsightWidget) => w.kind === "figure" || (w.kind === "receipts" && w.spec.kind === "stat");
/** Wide widgets take the whole row. */
const isWide = (w: InsightWidget) => w.kind === "timeline" || (w.kind === "receipts" && w.spec.kind === "grid");

/** A half-width widget with no partner on its row takes the whole row instead of leaving a hole. */
function lonely(body: InsightWidget[], index: number) {
  let column = 0;
  for (let i = 0; i < index; i++) column = isWide(body[i]!) ? 0 : (column + 1) % 2;
  if (column !== 0) return false;
  const next = body[index + 1];
  return !next || isWide(next);
}

/**
 * Inside Plex for Mac (`?embed=mac`) the page is see-through, so the window's own header and
 * aurora run behind it instead of stopping at a hard canvas edge.
 */
function EmbedStyle() {
  const embedded = useSearchParams().get("embed") === "mac";
  return embedded ? <style>{"html,body{background:transparent!important}"}</style> : null;
}

export function InsightsView({ id }: { id?: string }) {
  return (
    <>
      <EmbedStyle />
      <InsightsBody id={id} />
    </>
  );
}

function InsightsBody({ id }: { id?: string }) {
  const byId = useQuery(api.insights.get, id ? { id } : "skip");
  const latest = useQuery(api.insights.latest, id ? "skip" : {});
  const page = id ? byId : latest;

  if (page === undefined) return null; // the layout's skeleton is still showing
  if (page === null) {
    return (
      <EmptyState
        className="mt-16"
        icon={<ChartNoAxesColumn strokeWidth={1.9} />}
        title={id ? "This page is gone" : "Nothing here yet"}
        body={
          id
            ? "It may have been replaced by a newer one."
            : "Ask Plex a money question, like “How did I do this month?” or “Plan my week”, and it builds the charts here."
        }
        action={id ? <Link href="/insights" className="text-[13px] font-medium text-green-700">See the latest</Link> : undefined}
      />
    );
  }
  return <InsightsPage page={page} following={!id} />;
}

function InsightsPage({ page, following }: { page: Doc<"insights">; following: boolean }) {
  const now = useNow();
  const widgets = page.widgets as InsightWidget[];
  const headline = widgets.filter(isHeadline);
  const body = widgets.filter((w) => !isHeadline(w));

  return (
    <div>
      <header className="flex flex-col gap-4 pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {page.question ? (
            <div className="mb-1.5 truncate text-[13px] text-muted">
              You asked <span className="text-ink-2">“{page.question}”</span>
            </div>
          ) : null}
          <div className="text-[26px] leading-tight font-semibold tracking-[-0.025em] text-ink">{page.title}</div>
          {page.summary ? (
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">{page.summary}</p>
          ) : null}
          <div className="mt-2 text-[12px] text-faint">Updated {relativeTime(page.updatedAt, now)}</div>
        </div>
        <PageHistory current={page._id} following={following} />
      </header>

      {headline.length ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          {headline.map((w, i) => (
            <Widget key={`h${i}`} widget={w} now={now} />
          ))}
        </div>
      ) : null}

      {body.length ? (
        <div className={cn("grid gap-4 lg:grid-cols-2", headline.length ? "mt-4" : null)}>
          {body.map((w, i) => (
            <Widget key={`b${i}`} widget={w} now={now} className={isWide(w) || lonely(body, i) ? "lg:col-span-2" : undefined} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Widget({ widget, now, className }: { widget: InsightWidget; now: number; className?: string }) {
  switch (widget.kind) {
    case "figure":
      return <FigureWidget widget={widget} className={className} />;
    case "receipts":
      return <ReceiptsWidget widget={widget} now={now} className={className} />;
    case "pots":
      return <PotsWidget widget={widget} className={className} />;
    case "bills":
      return <BillsWidget widget={widget} now={now} className={className} />;
    case "subscriptions":
      return <SubscriptionsWidget widget={widget} now={now} className={className} />;
    case "timeline":
      return <TimelineWidget widget={widget} now={now} className={className} />;
  }
}

/** Earlier pages, newest first. Picking one leaves "latest" mode until you come back. */
function PageHistory({ current, following }: { current: string; following: boolean }) {
  const pages = useQuery(api.insights.list);
  const router = useRouter();
  if (!pages || pages.length < 2) return null;
  return (
    <div className="flex flex-none items-center gap-2">
      {following ? null : (
        <Link href="/insights" className="text-[13px] font-medium text-green-700 hover:text-green-800">
          Latest
        </Link>
      )}
      <label className="relative flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface pr-2.5 pl-2.5 text-[13px] text-ink-2 shadow-card">
        <History size={16} strokeWidth={1.9} className="text-muted" />
        <span>Earlier</span>
        <select
          aria-label="Earlier insights"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={current}
          onChange={(e) => router.push((e.target.value === pages[0]!._id ? "/insights" : `/insights/${e.target.value}`) + window.location.search)}
        >
          {pages.map((p) => (
            <option key={p._id} value={p._id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
