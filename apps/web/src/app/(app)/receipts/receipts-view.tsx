"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowUpRight, Cpu, HandCoins, HeartHandshake, Layers, Lock, ReceiptText, Search } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { direction } from "@plex/backend/lib/ledgerSpec";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Card, EmptyState, Input, PageHeader, Segmented, Skeleton } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { Amount } from "@/components/ui/money";
import { ReceiptCard, ReceiptRow, receiptKindLabel, type Receipt } from "@/components/receipt/receipt";
import { AgentArt, HeldArt, ReceiptStackArt, TaskArt } from "@/components/art/empty-art";
import { Figure, StatStrip, StatStripSkeleton } from "@/components/ledger/kit";
import { cn, formatCents } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All", icon: <Layers /> },
  { key: "held", label: "Held", icon: <Lock /> },
  { key: "agents", label: "By agents", icon: <Cpu /> },
  { key: "tasks", label: "Tasks", icon: <HandCoins /> },
  { key: "giving", label: "Giving", icon: <HeartHandshake /> },
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
    body: "Connect an agent and give it a pot. Everything it buys comes back with a receipt.",
  },
  tasks: {
    art: <TaskArt />,
    title: "No task money yet",
    body: "Post a task and fund it. The hold, the payout and any refund each get a receipt.",
  },
  giving: {
    art: <ReceiptStackArt />,
    title: "No gifts yet",
    body: "Give to a cause and the receipt shows which shift your money paid for.",
  },
};

function matches(r: Receipt, f: FilterKey) {
  if (f === "all") return true;
  if (f === "held") return r.state === "held";
  if (f === "agents") return Boolean(r.agentLabel);
  if (f === "tasks") return r.kind === "task_funding" || r.kind === "payout" || Boolean(r.taskId);
  return r.kind === "donation";
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

      {receipts === undefined ? (
        <StatStripSkeleton />
      ) : (
        <StatStrip
          stats={[
            {
              label: "Paid out",
              value: <Amount cents={totals.out} size="lg" />,
              foot: `${totals.outCount} payment${totals.outCount === 1 ? "" : "s"}`,
            },
            {
              label: "Came in",
              tone: "green",
              value: <Amount cents={totals.in} size="lg" className="text-green-700" />,
              foot: "Refunds, splits and invoices",
            },
            {
              label: "Held until proof",
              tone: "steel",
              value: <Amount cents={totals.held} size="lg" className="text-steel-800" />,
              foot: `${totals.heldCount} waiting on proof`,
            },
            {
              label: "Moved by agents",
              value: <Figure>{totals.agents}</Figure>,
              foot: `of ${receipts.length} receipts`,
            },
          ]}
        />
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          items={FILTERS.map((f) => ({ value: f.key, label: f.label, icon: f.icon, count: receipts ? counts[f.key] : undefined }))}
          value={filter}
          onChange={setFilter}
        />
        <label className="relative block sm:w-64">
          <span className="sr-only">Search receipts</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" strokeWidth={1.9} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search who, why or rule" className="pl-8" />
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
            <div ref={listRef} onKeyDown={onKeyDown} className="pb-2">
              {groups.map((g, gi) => {
                const n = net(g.items);
                return (
                  <section key={g.day} aria-label={g.day}>
                    <div
                      className={cn(
                        "sticky top-14 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-5 py-2 backdrop-blur-md",
                        gi === 0 ? "rounded-t-lg" : "border-t",
                      )}
                    >
                      <span className="text-[12px] font-medium text-ink-2">{g.day}</span>
                      <span className="flex items-baseline gap-2 text-[12px]">
                        <span className="tabular text-faint">
                          {g.items.length} receipt{g.items.length === 1 ? "" : "s"}
                        </span>
                        <span className={cn("tabular font-medium", n > 0 ? "text-green-700" : "text-ink-2")}>
                          {n > 0 ? "+" : n < 0 ? "−" : ""}
                          {formatCents(Math.abs(n))}
                        </span>
                      </span>
                    </div>
                    <div className="px-2 pt-1.5 pb-1.5">
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
                              "block w-full rounded-[10px] text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-green-200 focus-visible:outline-none",
                              on && "lg:bg-green-50/70 lg:ring-1 lg:ring-green-100 lg:ring-inset",
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

        <aside className="hidden lg:sticky lg:top-20 lg:block" aria-label="Selected receipt">
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
            <EmptyState
              icon={<ReceiptText />}
              title="No receipt selected"
              body="Pick one from the list to see its why, its rule and its PayPal trail."
              className="rounded-lg border border-dashed border-line-strong/80 py-14"
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="pb-2" aria-hidden>
      {[3, 4].map((n, g) => (
        <div key={g}>
          <div className={cn("flex items-center justify-between border-b border-line px-5 py-2.5", g > 0 && "border-t")}>
            <Skeleton className="h-3 w-20 rounded-full" />
            <Skeleton className="h-3 w-14 rounded-full" />
          </div>
          <div className="px-2 pt-1.5 pb-1.5">
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
                <Skeleton className="size-[34px] rounded-[10px]" />
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
        </div>
      ))}
    </div>
  );
}
