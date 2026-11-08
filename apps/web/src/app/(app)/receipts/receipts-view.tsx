"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowUpRight, Clock, HandCoins, Layers, Lock, ReceiptText, Search } from "lucide-react";
import { AiAgentIcon } from "@/components/ui/icons";
import { useCallback, useMemo, useRef, useState } from "react";
import { direction } from "@plex/backend/lib/ledgerSpec";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Card, EmptyState, Input, PageHeader, Segmented, Skeleton } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { ReceiptCard, ReceiptRow, receiptKindLabel, type Receipt } from "@/components/receipt/receipt";
import { AgentArt, HeldArt, ReceiptStackArt, TaskArt } from "@/components/art/empty-art";
import { Amount } from "@/components/ui/money";
import { DayBars } from "@/components/ui/viz";
import { cn, formatCents } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All", icon: <Layers /> },
  { key: "held", label: "Held", icon: <Lock /> },
  { key: "agents", label: "By agents", icon: <AiAgentIcon /> },
  { key: "tasks", label: "Tasks", icon: <HandCoins /> },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const EMPTY: Record<FilterKey, { art: React.ReactNode; title: string; body: string }> = {
  all: {
    art: <ReceiptStackArt />,
    title: "No receipts yet",
    body: "When an agent moves money for you, the receipt lands here: who it went to, why, and the rule that allowed it.",
  },
  held: {
    art: <HeldArt />,
    title: "Nothing is held right now",
    body: "When you fund a task, PayPal holds the money until the proof passes. Holds show up here until they settle.",
  },
  agents: {
    art: <AgentArt />,
    title: "Your agents haven't spent yet",
    body: "Connect an agent with a key. Everything it buys comes back with a receipt.",
  },
  tasks: {
    art: <TaskArt />,
    title: "No task money yet",
    body: "Post a task and fund it. The hold, the payout and any refund each get a receipt.",
  },
};

function matches(r: Receipt, f: FilterKey) {
  if (f === "all") return true;
  if (f === "held") return r.state === "held";
  if (f === "agents") return Boolean(r.agentLabel);
  return r.kind === "task_funding" || r.kind === "payout" || Boolean(r.taskId);
}

function searchable(r: Receipt) {
  return [r.why, r.payeeLabel, r.payerLabel, r.rule.text, r.agentLabel ?? "", r.category ?? "", receiptKindLabel(r.kind)]
    .join(" ")
    .toLowerCase();
}

function dayLabel(ms: number, now: number) {
  const d = new Date(ms);
  if (d.toDateString() === new Date(now).toDateString()) return "Today";
  if (d.toDateString() === new Date(now - 86_400_000).toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/** Net flow of a group of receipts, as the owner reads it. */
function net(items: Receipt[]) {
  return items.reduce((s, r) => {
    const d = direction(r);
    return d === "in" ? s + r.amountCents : d === "out" ? s - r.amountCents : s;
  }, 0);
}

export function ReceiptsView() {
  const receipts = useQuery(api.receipts.list, { limit: 200 });
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Id<"receipts"> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const c = {} as Record<FilterKey, number>;
    for (const f of FILTERS) c[f.key] = receipts?.filter((r) => matches(r, f.key)).length ?? 0;
    return c;
  }, [receipts]);

  const totals = useMemo(() => {
    const t = { out: 0, in: 0, held: 0, heldCount: 0, agents: 0, outCount: 0, inCount: 0 };
    for (const r of receipts ?? []) {
      if (r.state === "declined") continue;
      const d = direction(r);
      if (d === "out") {
        t.out += r.amountCents;
        t.outCount += 1;
      }
      if (d === "in") {
        t.in += r.amountCents;
        t.inCount += 1;
      }
      if (r.state === "held" || r.state === "funded") {
        t.held += r.amountCents;
        t.heldCount += 1;
      }
      if (r.agentLabel) t.agents += 1;
    }
    return t;
  }, [receipts]);

  // Paid out per day, the last 14 days, for the summary's bars.
  const days = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const from = start.getTime() - (13 - i) * 86_400_000;
      const cents = (receipts ?? [])
        .filter((r) => r.state !== "declined" && direction(r) === "out" && r.occurredAt >= from && r.occurredAt < from + 86_400_000)
        .reduce((sum, r) => sum + r.amountCents, 0);
      return { cents, label: new Date(from).toLocaleDateString("en-US", { day: "numeric" }) };
    });
  }, [receipts, now]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return receipts?.filter((r) => matches(r, filter) && (!needle || searchable(r).includes(needle))) ?? [];
  }, [receipts, filter, q]);

  const groups = useMemo(() => {
    const out: Array<{ day: string; items: Receipt[] }> = [];
    for (const r of visible) {
      const day = dayLabel(r.occurredAt, now);
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(r);
      else out.push({ day, items: [r] });
    }
    return out;
  }, [visible, now]);

  const active = visible.find((r) => r._id === selected) ?? visible[0];

  const pick = useCallback(
    (r: Receipt) => {
      // Phones and tablets have no side column: open the receipt's own page.
      if (!window.matchMedia("(min-width: 1024px)").matches) router.push(`/receipts/${r._id}`);
      else setSelected(r._id);
    },
    [router],
  );

  // Up and down move through the list, like a mail client.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const i = visible.findIndex((r) => r._id === active?._id);
    const next = visible[Math.max(0, Math.min(visible.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    setSelected(next._id);
    listRef.current?.querySelector<HTMLElement>(`[data-id="${next._id}"]`)?.focus();
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title="Receipts"
        description="Every dollar your agents moved: who it went to, why, which rule allowed it, and the proof."
        actions={
          <Link href="/ledger" className={buttonVariants({ variant: "secondary" })}>
            Analyze in the Ledger <ArrowUpRight />
          </Link>
        }
      />

      <Summary loading={receipts === undefined} totals={totals} count={receipts?.length ?? 0} days={days} />

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          items={FILTERS.map((f) => ({ value: f.key, label: f.label, icon: f.icon, count: receipts ? counts[f.key] : undefined }))}
          value={filter}
          onChange={setFilter}
        />
        <label className="relative block sm:w-64">
          <span className="sr-only">Search receipts</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" strokeWidth={1.9} />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search who, why or rule"
            className="rounded-full border-transparent bg-surface pl-8 hover:border-transparent"
          />
        </label>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          {receipts === undefined ? (
            <ListSkeleton />
          ) : groups.length === 0 ? (
            q.trim() ? (
              <EmptyState
                icon={<Search />}
                title={`Nothing matches “${q.trim()}”`}
                body="Search looks at who was paid, the why in your words, the rule and the agent."
                action={
                  <Button variant="secondary" size="sm" onClick={() => setQ("")}>
                    Clear search
                  </Button>
                }
                className="py-16"
              />
            ) : (
              <EmptyState art={EMPTY[filter].art} title={EMPTY[filter].title} body={EMPTY[filter].body} className="py-16" />
            )
          ) : (
            <div ref={listRef} onKeyDown={onKeyDown} className="px-2 pt-2 pb-3">
              {groups.map((g) => {
                const n = net(g.items);
                return (
                  <section key={g.day} aria-label={g.day} className="pt-4 first:pt-3">
                    <div className="flex items-baseline justify-between gap-3 px-4 pb-2">
                      <span className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink-2">{g.day}</span>
                      <span className="flex items-baseline gap-2.5">
                        <span className="tabular text-[12px] text-faint">
                          {g.items.length} receipt{g.items.length === 1 ? "" : "s"}
                        </span>
                        <span
                          className={cn(
                            "tabular font-display text-[15px] font-bold tracking-[-0.02em]",
                            n > 0 ? "text-green-700" : "text-ink-2",
                          )}
                        >
                          {n > 0 ? "+" : n < 0 ? "−" : ""}
                          {formatCents(Math.abs(n))}
                        </span>
                      </span>
                    </div>
                    <div>
                      {g.items.map((r) => {
                        const on = active?._id === r._id;
                        return (
                          <button
                            key={r._id}
                            data-id={r._id}
                            type="button"
                            onClick={() => pick(r)}
                            aria-current={on ? "true" : undefined}
                            className={cn(
                              "block w-full rounded-[12px] text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-green-200 focus-visible:outline-none",
                              on ? "lg:bg-green-50" : "group",
                            )}
                            aria-label={`${receiptKindLabel(r.kind)}: ${r.payeeLabel}, ${formatCents(r.amountCents, r.currency)}`}
                          >
                            <ReceiptRow receipt={r} />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </Card>

        <aside className="hidden lg:sticky lg:top-8 lg:block" aria-label="Selected receipt">
          {receipts === undefined ? (
            <Skeleton className="h-[560px] w-full rounded-lg" />
          ) : active ? (
            <div className="-m-2 max-h-[calc(100vh-6.5rem)] overflow-y-auto p-2 [scrollbar-width:thin]">
              <ReceiptCard key={active._id} receipt={active} className="animate-rise" />
              <div className="mt-3 flex items-center justify-between gap-3 px-1">
                <span className="text-[12px] text-faint">
                  Use <span className="font-medium text-muted">↑ ↓</span> to move through the list
                </span>
                <Link href={`/receipts/${active._id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Open receipt <ArrowUpRight />
                </Link>
              </div>
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={<ReceiptText />}
                title="No receipt selected"
                body="Pick one from the list to see its why, its rule and its PayPal trail."
                className="py-14"
              />
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="px-2 pt-2 pb-3" aria-hidden>
      {[3, 4].map((n, g) => (
        <div key={g} className="pt-4 first:pt-3">
          <div className="flex items-center justify-between px-4 pb-3">
            <Skeleton className="h-4 w-24 rounded-full" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
              <Skeleton className="size-5 rounded-full" />
              <div className="space-y-2">
                <Skeleton className={cn("h-3.5 rounded-full", ["w-40", "w-56", "w-32", "w-48"][i % 4])} />
                <Skeleton className={cn("h-3 rounded-full", ["w-28", "w-36", "w-24", "w-32"][i % 4])} />
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Skeleton className="h-3.5 w-14 rounded-full" />
                <Skeleton className="h-[22px] w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────

type Totals = { out: number; in: number; held: number; heldCount: number; agents: number; outCount: number; inCount: number };

/** Paid out, the screen's headline figure; held money beside it on its own card. */
function Summary({
  loading,
  totals,
  count,
  days,
}: {
  loading: boolean;
  totals: Totals;
  count: number;
  days: { cents: number; label: string }[];
}) {
  const peak = days.reduce((m, d, i) => (d.cents > days[m]!.cents ? i : m), 0);
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="@container flex min-h-[260px] flex-col p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <div className="flex items-center gap-2 font-medium text-ink-2">
            <ArrowUpRight className="size-[18px] text-green-700" strokeWidth={1.9} />
            Paid out
          </div>
          <span className="tabular text-faint">
            {loading ? "All receipts" : `${totals.outCount} payment${totals.outCount === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="mt-4 grid flex-1 items-end gap-6 @[640px]:grid-cols-[auto_minmax(0,1fr)] @[640px]:gap-10">
          <div>
            {loading ? <Skeleton className="h-14 w-52" /> : <Amount cents={totals.out} size="xl" className="text-[56px]" />}
            <div className="tabular mt-3 text-[13px] text-muted">
              <span className="font-medium text-green-700">{loading ? "…" : formatCents(totals.in)} came in</span> ·{" "}
              {loading ? "…" : `${totals.agents} of ${count}`} moved by agents
            </div>
          </div>
          <div className="hidden min-w-0 @[640px]:block">
            <div className="mb-2 text-right text-[11.5px] text-faint">Paid out by day, last 14 days</div>
            <DayBars values={days.map((d) => d.cents)} labels={days.map((d) => d.label)} highlight={peak} height={84} />
          </div>
        </div>
        <p className="mt-6 text-[12.5px] text-muted">Refunds, splits and invoices count as in.</p>
      </Card>

      <Card className="flex min-h-[200px] flex-col justify-between gap-8 p-6 sm:p-7">
        <div className="flex items-center gap-2 text-[13px] font-medium text-steel-700">
          <Lock className="size-[18px]" strokeWidth={1.9} />
          Held until proof
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-11 w-28" />
          ) : (
            <Amount cents={totals.held} size="xl" className="text-[48px] text-steel-900" />
          )}
          <div className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-steel-700">
            <Clock className="size-4" strokeWidth={1.9} />
            {totals.heldCount} waiting on proof
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            Paid out the moment the work is verified. Back to you if it isn&apos;t.
          </p>
        </div>
      </Card>
    </div>
  );
}
