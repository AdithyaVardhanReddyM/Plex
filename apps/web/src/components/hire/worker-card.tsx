"use client";

import Link from "next/link";
import { Cpu, Clock, MapPin, Star } from "lucide-react";
import { Avatar, Badge, Skeleton } from "@/components/ui/primitives";
import { TrustRing } from "@/components/hire/trust";
import { cn } from "@/lib/utils";

/** What a marketplace card needs: a row of `api.hire.directory`, or a draft agent. */
export type WorkerCardData = {
  handle: string;
  name: string;
  kind: "person" | "agent";
  avatarColor?: string;
  area?: string;
  bio?: string;
  skills: string[];
  rating?: number;
  proofPassRate?: number;
  tasksCompleted: number;
  reviewCount?: number;
  trust?: number;
  agent: { house?: boolean; model?: string; tagline?: string; turnaround?: string } | null;
};

/** `gemini-2.5-flash` → `Gemini 2.5 Flash`; an outside agent's own model reads as such. */
export function modelLabel(model?: string) {
  if (!model || model === "external") return "Own model";
  return model
    .split("-")
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "about 3 minutes" → "~3 min", so it fits a stat cell. */
export function shortTurnaround(t?: string) {
  if (!t) return "—";
  return t
    .replace(/^about\s+/i, "~")
    .replace(/\bminutes?\b/i, "min")
    .replace(/\bhours?\b/i, "h")
    .replace(/\bseconds?\b/i, "s");
}

/** People are round; agents are rounded squares with a quiet marker. */
export function WorkerAvatar({ w, size }: { w: Pick<WorkerCardData, "name" | "kind" | "avatarColor">; size: number }) {
  return <Avatar name={w.name || "Agent"} color={w.avatarColor} size={size} square={w.kind === "agent"} />;
}

/** "AI agent" marker. House agents are run by Plex; outside agents through the API. */
export function AgentMarker({ house, className }: { house?: boolean; className?: string }) {
  return (
    <Badge tone={house ? "steel" : "outline"} className={cn("h-5 px-1.5 text-[11px]", className)}>
      <Cpu />
      {house ? "Plex agent" : "Outside agent"}
    </Badge>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3 first:pl-5 last:pr-5">
      <div className="text-[11.5px] text-faint">{label}</div>
      <div className="tabular mt-1 truncate text-[13px] font-medium text-ink">{children}</div>
    </div>
  );
}

/**
 * The marketplace card. One height everywhere: two lines of pitch, one line of
 * skills, a three-cell stat foot. `href` makes it a link; the builder's live
 * preview renders it without one.
 */
export function WorkerCard({ w, href, className }: { w: WorkerCardData; href?: string; className?: string }) {
  const isAgent = w.kind === "agent";
  const pitch = w.agent?.tagline || w.bio;
  const shown = w.skills.slice(0, 3);
  const more = w.skills.length - shown.length;

  const body = (
    <>
      <div className="flex items-start gap-3 px-5 pt-5">
        <WorkerAvatar w={w} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold tracking-[-0.012em] text-ink">{w.name || "Untitled agent"}</span>
            {isAgent ? <AgentMarker house={w.agent?.house} className="flex-none" /> : null}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
            {isAgent ? (
              <>
                <span className="truncate">{modelLabel(w.agent?.model)}</span>
                <span className="text-line-strong">·</span>
                <Clock className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
                <span className="truncate">{w.agent?.turnaround ?? "—"}</span>
              </>
            ) : (
              <>
                <MapPin className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
                <span className="truncate">{w.area ?? "Remote"}</span>
              </>
            )}
          </div>
        </div>
        {w.trust !== undefined ? <TrustRing score={w.trust} size={42} /> : <span className="size-[42px] flex-none rounded-full border border-dashed border-line-strong" aria-hidden />}
      </div>

      <p className={cn("mt-3 line-clamp-2 min-h-[42px] px-5 text-[13.5px] leading-[1.55] text-pretty", pitch ? "text-ink-2" : "text-faint")}>
        {pitch || "A one-line pitch posters read first."}
      </p>

      <div className="mt-3 flex h-[22px] items-center gap-1.5 overflow-hidden px-5">
        {shown.length ? (
          <>
            {shown.map((s) => (
              <Badge key={s} tone="outline" className="max-w-[9rem] truncate text-muted">
                {capitalize(s)}
              </Badge>
            ))}
            {more > 0 ? <span className="tabular text-[11.5px] font-medium text-faint">+{more}</span> : null}
          </>
        ) : (
          <span className="text-[12px] text-faint">No skills yet</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-line border-t border-line bg-canvas/40">
        <Cell label="Rating">
          {w.rating !== undefined ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3 fill-current text-refunded" strokeWidth={1.9} />
              {w.rating.toFixed(2)}
              {w.reviewCount ? <span className="text-[11.5px] font-normal text-faint">({w.reviewCount})</span> : null}
            </span>
          ) : (
            <span className="font-normal text-muted">New</span>
          )}
        </Cell>
        <Cell label="Proofs pass">
          {w.proofPassRate !== undefined ? `${Math.round(w.proofPassRate * 100)}%` : <span className="font-normal text-muted">—</span>}
        </Cell>
        <Cell label="Paid tasks">{w.tasksCompleted}</Cell>
      </div>
    </>
  );

  const shell = "group flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-card";
  if (!href) return <div className={cn(shell, className)}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(
        shell,
        "transition-[box-shadow,border-color] duration-200 hover:border-line-strong hover:shadow-hover focus-visible:ring-[3px] focus-visible:ring-green-200 focus-visible:outline-none",
        className,
      )}
    >
      {body}
    </Link>
  );
}

/** The card's real geometry, for loading. */
export function WorkerCardSkeleton({ i = 0 }: { i?: number }) {
  const name = ["w-[58%]", "w-[44%]", "w-[66%]", "w-[50%]"][i % 4];
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <div className="flex items-start gap-3 px-5 pt-5">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className={cn("h-3.5", name)} />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="size-[42px] rounded-full" />
      </div>
      <div className="mt-4 space-y-2 px-5">
        <Skeleton className="h-3 w-[92%]" />
        <Skeleton className="h-3 w-[64%]" />
      </div>
      <div className="mt-4 flex gap-1.5 px-5">
        <Skeleton className="h-[22px] w-16 rounded-full" />
        <Skeleton className="h-[22px] w-20 rounded-full" />
        <Skeleton className="h-[22px] w-14 rounded-full" />
      </div>
      <div className="mt-4 h-[58px] border-t border-line bg-canvas/40" />
    </div>
  );
}
