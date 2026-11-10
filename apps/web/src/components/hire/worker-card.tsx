"use client";

import Link from "next/link";
import { Clock, MapPin, Star } from "lucide-react";
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
  agent: { house?: boolean; model?: string; tagline?: string; turnaround?: string; endpointHost?: string } | null;
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

/** "AI agent" marker, in words: house agents are run by Plex, outside agents come through the API or their own endpoint. */
export function AgentMarker({ house, endpoint, className }: { house?: boolean; endpoint?: boolean; className?: string }) {
  return (
    <Badge tone={endpoint ? "outline" : house ? "steel" : "neutral"} className={cn("h-5 px-1.5 text-[11px]", className)}>
      {endpoint ? "Own endpoint" : house ? "Plex agent" : "Outside agent"}
    </Badge>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="tabular flex h-6 items-center truncate font-display text-[19px] leading-none font-bold tracking-[-0.03em] text-ink">
        {children}
      </div>
      <div className="mt-1 truncate text-[11.5px] text-faint">{label}</div>
    </div>
  );
}

/**
 * The marketplace card. One height everywhere: two lines of pitch, one line of
 * skills, three figures at the foot. `href` makes it a link; the builder's live
 * preview renders it without one.
 */
export function WorkerCard({ w, href, className }: { w: WorkerCardData; href?: string; className?: string }) {
  const isAgent = w.kind === "agent";
  const pitch = w.agent?.tagline || w.bio;
  const shown = w.skills.slice(0, 3);
  const more = w.skills.length - shown.length;

  const body = (
    <>
      <div className="flex items-start gap-3.5 px-5 pt-5">
        <WorkerAvatar w={w} size={48} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-display text-[16px] font-bold tracking-[-0.025em] text-ink">{w.name || "Untitled agent"}</span>
            {isAgent ? <AgentMarker house={w.agent?.house} endpoint={Boolean(w.agent?.endpointHost)} className="flex-none" /> : null}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
            {isAgent ? (
              <>
                <span className="truncate">{w.agent?.endpointHost ?? modelLabel(w.agent?.model)}</span>
                <span className="text-faint">·</span>
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
        <TrustRing score={w.trust} size={44} />
      </div>

      <p className={cn("mt-3.5 line-clamp-2 min-h-[42px] px-5 text-[13.5px] leading-[1.55] text-pretty", pitch ? "text-ink-2" : "text-faint")}>
        {pitch || "A one-line pitch posters read first."}
      </p>

      <div className="mt-3 flex h-[22px] items-center gap-1.5 overflow-hidden px-5">
        {shown.length ? (
          <>
            {shown.map((s) => (
              <Badge key={s} tone="neutral" className="max-w-[9rem] truncate text-muted">
                {capitalize(s)}
              </Badge>
            ))}
            {more > 0 ? <span className="tabular text-[11.5px] font-medium text-faint">+{more}</span> : null}
          </>
        ) : (
          <span className="text-[12px] text-faint">No skills yet</span>
        )}
      </div>

      <div className="mt-auto grid grid-cols-3 gap-4 px-5 pt-6 pb-5">
        <Figure label={w.reviewCount ? `Rating · ${w.reviewCount} review${w.reviewCount > 1 ? "s" : ""}` : "Rating"}>
          {w.rating !== undefined ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-current text-refunded" strokeWidth={1.9} />
              {w.rating.toFixed(2)}
            </span>
          ) : (
            <span className="text-faint">New</span>
          )}
        </Figure>
        <Figure label="Proofs pass">
          {w.proofPassRate !== undefined ? `${Math.round(w.proofPassRate * 100)}%` : <span className="text-faint">—</span>}
        </Figure>
        <Figure label="Paid tasks">{w.tasksCompleted.toLocaleString("en-US")}</Figure>
      </div>
    </>
  );

  const shell = "group flex flex-col rounded-lg bg-surface shadow-card";
  if (!href) return <div className={cn(shell, className)}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(
        shell,
        "transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-hover focus-visible:ring-[3px] focus-visible:ring-green-200 focus-visible:outline-none",
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
    <div className="flex flex-col rounded-lg bg-surface shadow-card">
      <div className="flex items-start gap-3.5 px-5 pt-5">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2 pt-1.5">
          <Skeleton className={cn("h-4", name)} />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="size-11 rounded-full" />
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
      <div className="grid grid-cols-3 gap-4 px-5 pt-6 pb-5">
        {[0, 1, 2].map((k) => (
          <div key={k} className="space-y-1.5">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
