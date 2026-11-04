"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { HeartHandshake, ListChecks, MapPin, Wallet } from "lucide-react";
import { ROLE_LABEL, type LedgerRole, type WidgetSpec } from "@plex/backend/lib/ledgerSpec";
import { api } from "@/lib/convex";
import type { Receipt } from "@/components/receipt/receipt";
import { Avatar, Card, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { cn, formatCents } from "@/lib/utils";
import { Analyst, PinnedWidgets, SectionTitle, Watchdog, WidgetCard, type WidgetHost } from "@/components/ledger/analyst";
import { ReceiptPanel } from "@/components/ledger/receipt-panel";
import { ReceiptsCard } from "@/components/ledger/receipts-card";
import { PotGauges } from "@/components/ledger/pots";
import { Scoreboard } from "@/components/ledger/scoreboard";
import { MoneyFlow, ProofVerdicts, ProofWall, TopWorkers } from "@/components/ledger/poster-widgets";
import { CauseTasks, DonationFeed, DonorLeaderboard } from "@/components/ledger/cause-widgets";
import { Toast } from "@/components/ledger/confirm";

const ROLES: { key: LedgerRole; icon: React.ReactNode }[] = [
  { key: "personal", icon: <Wallet size={16} strokeWidth={1.9} /> },
  { key: "poster", icon: <ListChecks size={16} strokeWidth={1.9} /> },
  { key: "cause", icon: <HeartHandshake size={16} strokeWidth={1.9} /> },
];

function useRole(): [LedgerRole, (r: LedgerRole) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("view");
  const role: LedgerRole = raw === "poster" || raw === "cause" ? raw : "personal";
  const set = useCallback(
    (r: LedgerRole) => router.replace(r === "personal" ? pathname : `${pathname}?view=${r}`, { scroll: false }),
    [router, pathname],
  );
  return [role, set];
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function LedgerView() {
  const [role, setRole] = useRole();
  return (
    <>
      <PageHeader
        title="Ledger"
        description="Where your money went and what it did. Ask a question and the Analyst builds the view; pin what you want to keep."
        actions={<RoleTabs role={role} onChange={setRole} />}
      />
      {/* Keyed by role, so the open receipt and the Analyst's canvas reset on switch */}
      <RoleLedger key={role} role={role} />
    </>
  );
}

function RoleLedger({ role }: { role: LedgerRole }) {
  const now = useNow();
  const data = useQuery(api.ledger.receipts, { role });
  const [openId, setOpenId] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<{ title: string; spec: WidgetSpec } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const receipts = data?.receipts;
  const open = receipts?.find((r) => r._id === openId) ?? null;
  const onOpen = useCallback((r: Receipt) => setOpenId(r._id), []);
  const clearSpotlight = useCallback(() => setSpotlight(null), []);
  const clearToast = useCallback(() => setToast(null), []);

  const host = useMemo<WidgetHost>(
    () => ({ receipts: receipts ?? [], now, role, onOpen, requested: data?.requested ?? {}, selectedId: openId }),
    [receipts, now, role, onOpen, data?.requested, openId],
  );

  return (
    <>
      <div className="space-y-6">
        <Analyst host={host} spotlight={spotlight} onClearSpotlight={clearSpotlight} />
        <Watchdog
          role={role}
          onShow={(a) => {
            setSpotlight(a);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
        <PinnedWidgets host={host} />

        {role === "personal" ? <PersonalDashboard host={host} onToast={setToast} /> : null}
        {role === "poster" ? <PosterDashboard /> : null}
        {role === "cause" ? <CauseDashboard host={host} /> : null}

        <ReceiptsCard
          receipts={receipts}
          title={role === "poster" ? "Task money" : role === "cause" ? `Receipts for ${data?.scopeLabel ?? "the cause"}` : "Receipts"}
          columns={role === "cause" ? ["when", "party", "why", "rule", "state", "amount"] : undefined}
          requested={host.requested}
          selectedId={openId}
          onOpen={onOpen}
          fileName={`plex-ledger-${role}.csv`}
        />
      </div>

      <ReceiptPanel
        receipt={open}
        role={role}
        tools={data?.tools ?? []}
        requested={open ? host.requested[open._id] : undefined}
        onClose={() => setOpenId(null)}
        onDone={setToast}
      />
      <Toast message={toast} onDone={clearToast} />
    </>
  );
}

function RoleTabs({ role, onChange }: { role: LedgerRole; onChange: (r: LedgerRole) => void }) {
  return (
    <div role="tablist" aria-label="Dashboard" className="flex w-full rounded-md bg-sunken p-1 sm:w-auto">
      {ROLES.map((r) => (
        <button
          key={r.key}
          type="button"
          role="tab"
          aria-selected={role === r.key}
          onClick={() => onChange(r.key)}
          className={cn(
            "flex h-8 flex-1 items-center justify-center gap-2 rounded-sm px-3 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow] sm:flex-none",
            role === r.key ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          <span className={role === r.key ? "text-green-600" : "text-faint"}>{r.icon}</span>
          {ROLE_LABEL[r.key]}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, children, sub, tone }: { label: string; children: React.ReactNode; sub?: React.ReactNode; tone?: "steel" | "green" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
        {tone ? <span className={cn("size-1.5 rounded-full", tone === "steel" ? "bg-steel-500" : "bg-green-500")} /> : null}
        {label}
      </div>
      <div className="mt-2">{children}</div>
      {sub ? <div className="mt-1 truncate text-[12.5px] text-muted">{sub}</div> : null}
    </Card>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[104px] w-full rounded-lg" />
      ))}
    </div>
  );
}

// ── Personal ─────────────────────────────────────────────────────────────────

const SPEND_BY_DAY: WidgetSpec = {
  kind: "chart",
  title: "Spend by day",
  subtitle: "Last 14 days, by pot",
  filter: { direction: "out", sinceDays: 14 },
  chart: { type: "column", groupBy: "day", measure: "sum", stackBy: "category" },
};

function PersonalDashboard({ host, onToast }: { host: WidgetHost; onToast: (m: string) => void }) {
  const p = useQuery(api.ledger.personal);
  const viewer = useQuery(api.users.viewer);
  if (!p) return <StatsSkeleton />;
  const k = p.kpis;
  const delta = k.spentWeekCents - k.spentPrevWeekCents;
  return (
    <section aria-label="Personal dashboard" className="space-y-3">
      <SectionTitle>Personal</SectionTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Spent this week" sub={`${delta >= 0 ? "+" : "−"}${formatCents(Math.abs(delta))} vs last week`}>
          <Amount cents={k.spentWeekCents} size="lg" />
        </Stat>
        <Stat label="Held by Plex" tone="steel" sub={`${k.heldCount} receipt${k.heldCount === 1 ? "" : "s"}, on proof`}>
          <Amount cents={k.heldCents} size="lg" />
        </Stat>
        <Stat label="Owed to you" sub="From splits">
          <Amount cents={k.owedCents} size="lg" />
        </Stat>
        <Stat label="Saved by agents" tone="green" sub="Off list prices">
          <Amount cents={k.savedCents} size="lg" className="text-green-700" />
        </Stat>
      </div>
      <PotGauges pots={p.pots} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <WidgetCard spec={SPEND_BY_DAY} host={host} />
        {p.splits[0] ? (
          <Scoreboard
            split={p.splits[0]}
            viewerName={viewer?.name ?? "You"}
            viewerColor={p.viewerColor}
            canRemind
            onDone={onToast}
          />
        ) : null}
      </div>
    </section>
  );
}

// ── Task poster ──────────────────────────────────────────────────────────────

function PosterDashboard() {
  const p = useQuery(api.ledger.poster);
  if (!p) return <StatsSkeleton />;
  const settled = p.flow.released + p.flow.refunded;
  return (
    <section aria-label="Task poster dashboard" className="space-y-3">
      <SectionTitle>Task poster</SectionTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Held now" tone="steel" sub={`${p.flowCount.held} task${p.flowCount.held === 1 ? "" : "s"}, on proof`}>
          <Amount cents={p.flow.held} size="lg" />
        </Stat>
        <Stat label="Paid to workers" tone="green" sub={`${p.flowCount.released} payouts, all on proof`}>
          <Amount cents={p.flow.released} size="lg" />
        </Stat>
        <Stat label="Refunded" sub={`${Math.round((p.flow.refunded / Math.max(settled, 1)) * 100)}% of settled money`}>
          <Amount cents={p.flow.refunded} size="lg" />
        </Stat>
        <Stat label="Open tasks" sub={`${p.flowCount.disputed} in dispute`}>
          <span className="tabular text-[22px] font-semibold tracking-[-0.02em] text-ink">{p.openTasks}</span>
        </Stat>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <MoneyFlow flow={p.flow} count={p.flowCount} />
        <ProofVerdicts counts={p.proofCounts} passRate={p.passRate} />
      </div>
      <SectionTitle>Proof wall</SectionTitle>
      <ProofWall proofs={p.proofs} />
      <TopWorkers workers={p.workers} />
    </section>
  );
}

// ── Cause ────────────────────────────────────────────────────────────────────

const DONATIONS_BY_WEEK: WidgetSpec = {
  kind: "chart",
  title: "Donations by week",
  subtitle: "Last four weeks, every gift",
  filter: { kinds: ["donation"], sinceDays: 28 },
  chart: { type: "column", groupBy: "week", measure: "sum" },
};

function CauseDashboard({ host }: { host: WidgetHost }) {
  const c = useQuery(api.ledger.cause);
  if (c === null) return null;
  if (!c) return <StatsSkeleton />;
  const raised = c.cause.raisedCents / Math.max(c.cause.goalCents, 1);
  return (
    <section aria-label="Cause dashboard" className="space-y-3">
      <SectionTitle>Cause</SectionTitle>
      <Card className="overflow-hidden">
        <div className="h-1 w-full" style={{ background: "var(--metal)" }} aria-hidden />
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {c.org ? <Avatar name={c.org.name} color={c.org.color} size={40} /> : null}
            <div className="min-w-0">
              <div className="truncate text-[16px] font-semibold tracking-[-0.01em] text-ink">{c.cause.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
                <span className="truncate">{c.org?.name}</span>
                <span className="text-faint">·</span>
                <MapPin size={13} strokeWidth={1.9} className="flex-none" />
                <span className="truncate">{c.cause.location}</span>
              </div>
            </div>
          </div>
          <div className="w-full md:w-72">
            <div className="flex items-baseline justify-between gap-2">
              <Amount cents={c.cause.raisedCents} size="md" />
              <span className="text-[12.5px] text-muted">of {formatCents(c.cause.goalCents)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(raised, 1) * 100}%` }} />
            </div>
          </div>
        </div>
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">
          The view {c.org?.name ?? "the cause"} sees. Donors get the same receipts for the shifts they fund.
        </p>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Raised, 21 days" tone="green" sub={`${c.totals.gifts} gifts, ${c.totals.recurring} monthly`}>
          <Amount cents={c.totals.last21Cents} size="lg" />
        </Stat>
        <Stat label="Paid to local workers" sub="Released on proof">
          <Amount cents={c.totals.paidToWorkersCents} size="lg" />
        </Stat>
        <Stat label="Shifts done" sub={`${c.totals.shiftsOpen} open`}>
          <span className="tabular text-[22px] font-semibold tracking-[-0.02em] text-ink">{c.totals.shiftsDone}</span>
        </Stat>
        <Stat label="Donors, all time" sub={`${c.cause.workersPaidCount} workers paid so far`}>
          <span className="tabular text-[22px] font-semibold tracking-[-0.02em] text-ink">{c.cause.donorsCount}</span>
        </Stat>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <WidgetCard spec={DONATIONS_BY_WEEK} host={host} />
        <DonorLeaderboard leaders={c.leaderboard} />
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <DonationFeed feed={c.feed} />
        <CauseTasks tasks={c.tasks} />
      </div>
    </section>
  );
}
