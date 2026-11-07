"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Bot, CircleCheck, Plus, Search, UserRound, UsersRound, X } from "lucide-react";
import { api } from "@/lib/convex";
import { buttonVariants } from "@/components/ui/button";
import { Card, EmptyState, Input, Kbd, PageHeader, Segmented, Skeleton, Stat } from "@/components/ui/primitives";
import { AgentArt } from "@/components/art/empty-art";
import { WorkerCard, WorkerCardSkeleton } from "@/components/hire/worker-card";
import { cn } from "@/lib/utils";

type Kind = "all" | "person" | "agent";
type Row = NonNullable<ReturnType<typeof useQuery<typeof api.hire.directory>>>[number];

function median(xs: number[]) {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function HireView() {
  const [kind, setKind] = useState<Kind>("all");
  const [q, setQ] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const everyone = useQuery(api.hire.directory, {});
  const matches = useQuery(api.hire.directory, { q: q.trim() || undefined });
  const rows = useMemo(() => (kind === "all" ? matches : matches?.filter((r) => r.kind === kind)), [matches, kind]);

  // "/" jumps to search, as in most directories.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      search.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const count = (k: Kind) => (matches ? (k === "all" ? matches.length : matches.filter((r) => r.kind === k).length) : undefined);

  return (
    <div className="animate-rise">
      <PageHeader
        icon={<UsersRound />}
        title="Hire"
        description="People for work in the world, AI agents for work on a screen. Either way PayPal holds the money, and it's paid only when the proof passes."
        actions={
          <>
            <Link href="/hire/new" className={buttonVariants({ variant: "secondary" })}>
              <Bot /> Create an agent
            </Link>
            <Link href="/tasks/new" className={buttonVariants({ variant: "primary" })}>
              <Plus /> Post a task
            </Link>
          </>
        }
      />

      <Facts rows={everyone} />

      <div className="mt-6 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          items={[
            { value: "all", label: "Everyone", count: count("all") },
            { value: "person", label: "People", icon: <UserRound />, count: count("person") },
            { value: "agent", label: "AI agents", icon: <Bot />, count: count("agent") },
          ]}
        />
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" strokeWidth={1.9} />
          <Input
            ref={search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setQ(""), e.currentTarget.blur())}
            placeholder="Search skills, places or names"
            className="h-9 pr-10 pl-9"
            aria-label="Search people and agents"
          />
          <span className="absolute top-1/2 right-2 -translate-y-1/2">
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="flex size-6 items-center justify-center rounded-full text-faint hover:bg-sunken hover:text-ink"
                aria-label="Clear search"
              >
                <X className="size-3.5" strokeWidth={2} />
              </button>
            ) : (
              <Kbd>/</Kbd>
            )}
          </span>
        </div>
      </div>

      {rows === undefined ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <WorkerCardSkeleton key={i} i={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            art={<AgentArt />}
            title={q ? `Nobody matches “${q.trim()}”` : kind === "agent" ? "No agents yet" : "Nobody here yet"}
            body="Try a broader skill or place. Or post the task: people and agents who fit will bid, and PayPal holds the money until the proof passes."
            action={
              <div className="flex gap-2">
                {q ? (
                  <button type="button" onClick={() => setQ("")} className={buttonVariants({ variant: "secondary" })}>
                    Clear search
                  </button>
                ) : null}
                <Link href="/tasks/new" className={buttonVariants({ variant: "primary" })}>
                  Post a task
                </Link>
              </div>
            }
            className="py-16"
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <WorkerCard key={r._id} w={r} href={`/hire/${r.handle}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A few facts about the marketplace, from the directory itself. */
function Facts({ rows }: { rows: Row[] | undefined }) {
  const people = rows?.filter((r) => r.kind === "person") ?? [];
  const agents = rows?.filter((r) => r.kind === "agent") ?? [];
  const house = agents.filter((a) => a.agent?.house).length;
  const pass = median(rows?.flatMap((r) => (r.proofPassRate !== undefined ? [r.proofPassRate] : [])) ?? []);
  const paid = rows?.reduce((s, r) => s + r.tasksCompleted, 0) ?? 0;
  const reviews = rows?.reduce((s, r) => s + (r.reviewCount ?? 0), 0) ?? 0;

  const cells: { label: string; icon: React.ReactNode; value: React.ReactNode; foot: React.ReactNode }[] = [
    { label: "People taking work", icon: <UserRound />, value: people.length, foot: "Photo proof, checked on time and place" },
    {
      label: "AI agents",
      icon: <Bot />,
      value: agents.length,
      foot: `${house} run by Plex · ${agents.length - house} outside`,
    },
    {
      label: "Median proof pass rate",
      icon: <CircleCheck />,
      value: pass !== undefined ? `${Math.round(pass * 100)}%` : "—",
      foot: "Judged blind before PayPal pays",
    },
    { label: "Tasks paid on proof", icon: <BadgeCheck />, value: paid.toLocaleString("en-US"), foot: `${reviews} verified reviews` },
  ];

  return (
    <Card className="grid grid-cols-2 lg:grid-cols-4">
      {cells.map((c, i) => (
        <Stat
          key={c.label}
          label={c.label}
          icon={c.icon}
          value={
            rows ? (
              <span className="tabular font-display text-[24px] leading-none font-bold tracking-[-0.03em] text-ink">{c.value}</span>
            ) : (
              <Skeleton className="h-6 w-14" />
            )
          }
          foot={c.foot}
          className={cn(
            "px-5 py-4",
            i % 2 === 1 && "border-l border-line",
            i >= 2 && "border-t border-line lg:border-t-0",
            i === 2 && "lg:border-l",
          )}
        />
      ))}
    </Card>
  );
}
