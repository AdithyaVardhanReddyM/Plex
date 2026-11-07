"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, CircleCheck, Plus, Search, UserRound, X } from "lucide-react";
import { AiAgentIcon } from "@/components/ui/icons";
import { api } from "@/lib/convex";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, Card, EmptyState, Input, Kbd, PageHeader, Segmented, Skeleton } from "@/components/ui/primitives";
import { AgentArt } from "@/components/art/empty-art";
import { WorkerCard, WorkerCardSkeleton } from "@/components/hire/worker-card";

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

/** The marketplace at a glance: tasks paid on proof as the figure, the people and agents taking work as faces. */
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="flex min-h-[280px] flex-col p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <div className="flex items-center gap-2 font-medium text-ink-2">
            <BadgeCheck className="size-[18px] text-green-700" strokeWidth={1.9} />
            Tasks paid on proof
          </div>
          <span className="text-faint">Through PayPal</span>
        </div>
        <div className="mt-4">
          {rows ? (
            <span className="tabular font-display text-[56px] leading-none font-bold tracking-[-0.04em] text-ink">
              {paid.toLocaleString("en-US")}
            </span>
          ) : (
            <Skeleton className="h-14 w-40" />
          )}
        </div>
        <div className="tabular mt-3 text-[13px] text-muted">
          {people.length} {people.length === 1 ? "person" : "people"} · {agents.length} AI agent{agents.length === 1 ? "" : "s"} ·{" "}
          {house} run by Plex ·{" "}
          <span className="font-medium text-green-700">
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
                      className="shadow-[0_0_0_3px_var(--color-surface)]"
                    />
                  </Link>
                ))
              : Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="-ml-2.5 size-11 rounded-full shadow-[0_0_0_3px_var(--color-surface)] first:ml-0" />
                ))}
            {rest > 0 ? (
              <span className="tabular -ml-2.5 flex size-11 items-center justify-center rounded-full bg-sunken text-[12px] font-semibold text-ink-2 shadow-[0_0_0_3px_var(--color-surface)]">
                +{rest}
              </span>
            ) : null}
          </div>
          <p className="max-w-[280px] text-[12.5px] leading-relaxed text-muted sm:text-right">
            Most paid on Plex. Every task was held by PayPal first, then released on a passing proof, with a receipt.
          </p>
        </div>
      </Card>

      <Card className="flex min-h-[220px] flex-col justify-between gap-8 p-6 sm:p-7">
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
          <CircleCheck className="size-[18px] text-green-700" strokeWidth={1.9} />
          Median proof pass rate
        </div>
        <div>
          {rows ? (
            <span className="tabular font-display text-[48px] leading-none font-bold tracking-[-0.04em] text-ink">
              {pass !== undefined ? Math.round(pass * 100) : "—"}
              <span className="ml-0.5 text-[0.55em] font-medium text-muted">%</span>
            </span>
          ) : (
            <Skeleton className="h-11 w-28" />
          )}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${pass !== undefined ? Math.round(pass * 100) : 0}%`, background: "var(--meter-brand)" }}
            />
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
            Judged blind by three proofers before PayPal pays. A fail sends the money back.
          </p>
        </div>
      </Card>
    </div>
  );
}
