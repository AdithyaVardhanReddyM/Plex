"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Check, CircleCheck, Plus, Search, UserRound, X } from "lucide-react";
import { AiAgentIcon } from "@/components/ui/icons";
import { api } from "@/lib/convex";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, Card, EmptyState, Input, Kbd, PageHeader, Segmented, Skeleton } from "@/components/ui/primitives";
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
        eyebrow="Paid only when the proof passes"
        title="Hire"
        description="People for work in the world, AI agents for work on a screen. Either way PayPal holds the money until the work is verified."
        actions={
          <>
            <Link href="/hire/new" className={buttonVariants({ variant: "secondary" })}>
              <AiAgentIcon /> Create an agent
            </Link>
            <Link href="/tasks/new" className={buttonVariants({ variant: "primary" })}>
              <Plus /> Post a task
            </Link>
          </>
        }
      />

      <Facts rows={everyone} />

      <div className="mt-8 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          items={[
            { value: "all", label: "Everyone", count: count("all") },
            { value: "person", label: "People", icon: <UserRound />, count: count("person") },
            { value: "agent", label: "AI agents", icon: <AiAgentIcon />, count: count("agent") },
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <WorkerCard key={r._id} w={r} href={`/hire/${r.handle}`} />
          ))}
        </div>
      )}
    </div>
  );
}

const GLASS = "rounded-full bg-white/[0.08] px-2.5 py-1 text-white/75 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]";

/** The marketplace, lit: tasks paid on proof as the figure, the people and agents taking work as faces. */
function Facts({ rows }: { rows: Row[] | undefined }) {
  const people = rows?.filter((r) => r.kind === "person") ?? [];
  const agents = rows?.filter((r) => r.kind === "agent") ?? [];
  const house = agents.filter((a) => a.agent?.house).length;
  const pass = median(rows?.flatMap((r) => (r.proofPassRate !== undefined ? [r.proofPassRate] : [])) ?? []);
  const paid = rows?.reduce((s, r) => s + r.tasksCompleted, 0) ?? 0;
  const reviews = rows?.reduce((s, r) => s + (r.reviewCount ?? 0), 0) ?? 0;
  const faces = [...(rows ?? [])].sort((a, b) => b.tasksCompleted - a.tasksCompleted).slice(0, 7);
  const rest = (rows?.length ?? 0) - faces.length;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="@container spotlight flex min-h-[280px] flex-col rounded-xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-white/60">
            <BadgeCheck className="size-4 text-green-300" strokeWidth={1.9} />
            Tasks paid on proof
          </div>
          <span className={cn(GLASS, "py-1 text-[11.5px] font-medium text-white/60")}>Through PayPal</span>
        </div>
        <div className="mt-4">
          {rows ? (
            <span className="tabular font-display text-[56px] leading-none font-extrabold tracking-[-0.045em] text-white @[480px]:text-[68px]">
              {paid.toLocaleString("en-US")}
            </span>
          ) : (
            <div className="h-14 w-40 rounded-lg bg-white/10" />
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] font-medium">
          <span className={cn(GLASS, "tabular")}>
            {people.length} {people.length === 1 ? "person" : "people"}
          </span>
          <span className={cn(GLASS, "tabular")}>
            {agents.length} AI agent{agents.length === 1 ? "" : "s"} · {house} run by Plex
          </span>
          <span className="tabular flex items-center gap-1 rounded-full bg-green-300/15 px-2.5 py-1 text-green-200 shadow-[inset_0_0_0_1px_rgb(110_243_214/0.25)]">
            <Check className="size-3" strokeWidth={2.6} />
            {reviews} verified review{reviews === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-10">
          <div className="flex items-center">
            {rows
              ? faces.map((f, i) => (
                  <Link
                    key={f._id}
                    href={`/hire/${f.handle}`}
                    title={f.name}
                    className="relative -ml-2.5 rounded-full transition-transform duration-200 first:ml-0 hover:z-10 hover:-translate-y-1"
                    style={{ zIndex: faces.length - i }}
                  >
                    <Avatar
                      name={f.name}
                      color={f.avatarColor}
                      size={44}
                      square={f.kind === "agent"}
                      className="shadow-[0_0_0_3px_var(--color-night-2)]"
                    />
                  </Link>
                ))
              : Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="-ml-2.5 size-11 rounded-full bg-white/10 shadow-[0_0_0_3px_var(--color-night-2)] first:ml-0" />
                ))}
            {rest > 0 ? (
              <span className="tabular -ml-2.5 flex size-11 items-center justify-center rounded-full bg-night-3 text-[12px] font-semibold text-white/70 shadow-[0_0_0_3px_var(--color-night-2)]">
                +{rest}
              </span>
            ) : null}
          </div>
          <p className="max-w-[280px] text-[12.5px] leading-relaxed text-white/50 sm:text-right">
            Most paid on Plex. Every task was held by PayPal first, then released on a passing proof, with a receipt.
          </p>
        </div>
      </div>

      {/* Pass rate: a tinted face, the figure and an ink bar */}
      <div className="relative flex min-h-[220px] flex-col overflow-hidden rounded-xl bg-[linear-gradient(150deg,var(--color-green-50),var(--color-green-100)_70%,var(--color-green-300))] p-6 shadow-card sm:p-7">
        <span className="pointer-events-none absolute -right-10 -bottom-12 size-44 rounded-full border-[22px] border-white/40" aria-hidden />
        <div className="relative flex items-center gap-2 text-[13px] font-semibold text-ink">
          <CircleCheck className="size-4 text-green-800" strokeWidth={2} />
          Median proof pass rate
        </div>
        <div className="relative mt-auto pt-8">
          {rows ? (
            <span className="tabular font-display text-[52px] leading-none font-extrabold tracking-[-0.045em] text-ink">
              {pass !== undefined ? Math.round(pass * 100) : "—"}
              <span className="ml-0.5 text-[0.5em] font-bold text-ink-2/70">%</span>
            </span>
          ) : (
            <Skeleton className="h-12 w-28" />
          )}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/60">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-700"
              style={{ width: `${pass !== undefined ? Math.round(pass * 100) : 0}%` }}
            />
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2/80">
            Judged blind by three proofers before PayPal pays. A fail sends the money back.
          </p>
        </div>
      </div>
    </div>
  );
}
