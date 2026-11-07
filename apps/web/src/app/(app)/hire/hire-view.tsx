"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Bot, MapPin, Search, Star, UsersRound } from "lucide-react";
import { api } from "@/lib/convex";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, Input, PageHeader, Skeleton } from "@/components/ui/primitives";
import { TrustRing } from "@/components/hire/trust";
import { cn } from "@/lib/utils";

type Kind = "person" | "agent" | undefined;

const KINDS: { value: Kind; label: string }[] = [
  { value: undefined, label: "Everyone" },
  { value: "person", label: "People" },
  { value: "agent", label: "AI agents" },
];

export function HireView() {
  const [kind, setKind] = useState<Kind>();
  const [q, setQ] = useState("");
  const rows = useQuery(api.hire.directory, { kind, q: q.trim() || undefined });

  return (
    <div className="animate-rise">
      <PageHeader
        title="Hire"
        description="People for work in the world, AI agents for work on a screen. Either way the money is held by PayPal and paid only when the proof passes."
        actions={
          <div className="flex gap-2">
            <Link href="/hire/new" className={buttonVariants({ variant: "secondary" })}>
              <Bot /> Create an agent
            </Link>
            <Link href="/tasks/new" className={buttonVariants({ variant: "primary" })}>
              Post a task
            </Link>
          </div>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-none self-start rounded-sm bg-sunken p-0.5" role="group" aria-label="Who">
          {KINDS.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => setKind(k.value)}
              aria-pressed={kind === k.value}
              className={cn(
                "h-7 rounded-[6px] px-3 text-[13px] font-medium transition-colors",
                kind === k.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" strokeWidth={1.9} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Skill, place or name" className="pl-9" aria-label="Search" />
        </div>
      </div>

      {rows === undefined ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[214px] w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<UsersRound />} title="Nobody matches that" body="Try a broader skill, or post the task and let people and agents apply." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <Link
              key={r._id}
              href={`/hire/${r.handle}`}
              className="group flex flex-col rounded-lg border border-line bg-surface shadow-card transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-line-strong hover:shadow-raised focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:outline-none"
            >
              <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-3 px-5 pt-4">
                <Avatar name={r.name} color={r.avatarColor} size={44} />
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{r.name}</div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
                    {r.kind === "agent" ? (
                      <>
                        <Bot className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
                        <span className="truncate">{r.agent?.house ? "Plex house agent" : "Outside agent"}</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
                        <span className="truncate">{r.area ?? "Plex"}</span>
                      </>
                    )}
                  </div>
                </div>
                <TrustRing score={r.trust} />
              </div>
              <p className="mt-3 line-clamp-2 min-h-[40px] px-5 text-[13px] leading-relaxed text-ink-2">{r.agent?.tagline ?? r.bio}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 px-5">
                {r.skills.slice(0, 4).map((s) => (
                  <Badge key={s} tone="outline" className="capitalize">
                    {s}
                  </Badge>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[12.5px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3.5 fill-current text-refunded" strokeWidth={1.9} />
                  <span className="tabular font-medium text-ink">{r.rating?.toFixed(2) ?? "New"}</span>
                  {r.reviewCount ? <span className="text-faint">· {r.reviewCount} verified</span> : null}
                </span>
                <span className="tabular">
                  {r.proofPassRate !== undefined ? `${Math.round(r.proofPassRate * 100)}% proofs pass · ` : ""}
                  {r.tasksCompleted} paid
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
