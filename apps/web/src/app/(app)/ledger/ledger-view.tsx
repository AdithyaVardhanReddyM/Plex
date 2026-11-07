"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Eye, HeartHandshake, ListChecks, MapPin, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { ROLE_LABEL, type LedgerRole, type WidgetSpec } from "@plex/backend/lib/ledgerSpec";
import { api } from "@/lib/convex";
import type { Receipt } from "@/components/receipt/receipt";
import { Avatar, Card, EmptyState, Meter, PageHeader, SectionHeading, Segmented } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { cn, formatCents } from "@/lib/utils";
import { Analyst, PinnedWidgets, Watchdog, WidgetCard, type WidgetHost } from "@/components/ledger/analyst";
import { DashboardSkeleton, Figure, StatStrip } from "@/components/ledger/kit";
import { ReceiptPanel } from "@/components/ledger/receipt-panel";
import { ReceiptsCard } from "@/components/ledger/receipts-card";
import { PotGauges } from "@/components/ledger/pots";
import { Scoreboard } from "@/components/ledger/scoreboard";
import { MoneyFlow, ProofVerdicts, ProofWall, TopWorkers } from "@/components/ledger/poster-widgets";
import { CauseTasks, DonationFeed, DonorLeaderboard } from "@/components/ledger/cause-widgets";
import { Toast } from "@/components/ledger/confirm";

const ROLES: { key: LedgerRole; icon: React.ReactNode }[] = [
  { key: "personal", icon: <Wallet /> },
  { key: "poster", icon: <ListChecks /> },
  { key: "cause", icon: <HeartHandshake /> },
];

const ROLE_INTRO: Record<LedgerRole, { title: string; description: string }> = {
  personal: { title: "Your money", description: "This week against your pots, and who still owes you." },
  poster: { title: "Tasks you fund", description: "Money held on proof, what reached workers, and how their proof held up." },
  cause: { title: "Your cause", description: "Gifts coming in and local work paid out, the way the organization sees it." },
};

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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function LedgerView() {
  const [role, setRole] = useRole();
  return (
    <div className="animate-rise">
      <PageHeader
        title="Ledger"
        description="Every payment, with its why, its rule and its proof. Ask a question and the Analyst builds the view; pin what you want to keep."
        actions={
          <Segmented
            items={ROLES.map((r) => ({ value: r.key, label: ROLE_LABEL[r.key], icon: r.icon }))}
            value={role}
            onChange={setRole}
          />
        }
      />
      {/* Keyed by role, so the open receipt and the Analyst's canvas reset on switch */}
      <RoleLedger key={role} role={role} />
    </div>
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
      <div className="space-y-10">
        <div className="space-y-4">
          <Analyst host={host} spotlight={spotlight} onClearSpotlight={clearSpotlight} />
          <Watchdog
            role={role}
            onShow={(a) => {
              setSpotlight(a);
              (document.getElementById("app-scroll") ?? window).scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </div>

        <PinnedWidgets host={host} />

        <section aria-label={ROLE_INTRO[role].title}>
          <SectionHeading title={ROLE_INTRO[role].title} description={ROLE_INTRO[role].description} />
          {role === "personal" ? <PersonalDashboard host={host} onToast={setToast} /> : null}
          {role === "poster" ? <PosterDashboard /> : null}
          {role === "cause" ? <CauseDashboard host={host} /> : null}
        </section>

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
  if (!p) return <DashboardSkeleton />;
  const k = p.kpis;
  const delta = k.spentWeekCents - k.spentPrevWeekCents;
  return (
    <div className="space-y-4">
      <StatStrip
        stats={[
          {
            label: "Spent this week",
            value: <Amount cents={k.spentWeekCents} size="lg" />,
            foot: (
              <span className="inline-flex items-center gap-1">
                {delta >= 0 ? (
                  <TrendingUp className="size-3.5 text-faint" strokeWidth={1.9} />
                ) : (
                  <TrendingDown className="size-3.5 text-green-700" strokeWidth={1.9} />
                )}
                <span className={cn("tabular font-medium", delta < 0 ? "text-green-700" : "text-ink-2")}>
                  {delta >= 0 ? "+" : "−"}
                  {formatCents(Math.abs(delta))}
                </span>
                vs last week
              </span>
            ),
          },
          {
            label: "Held by Plex",
            tone: "steel",
            value: <Amount cents={k.heldCents} size="lg" className="text-steel-800" />,
            foot: `${plural(k.heldCount, "receipt")}, waiting on proof`,
          },
          { label: "Owed to you", value: <Amount cents={k.owedCents} size="lg" />, foot: "From splits, invoiced by PayPal" },
          {
            label: "Saved by agents",
            tone: "green",
            value: <Amount cents={k.savedCents} size="lg" className="text-green-700" />,
            foot: "Off list prices",
          },
        ]}
      />
      <PotGauges pots={p.pots} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
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
    </div>
  );
}

// ── Task poster ──────────────────────────────────────────────────────────────

function PosterDashboard() {
  const p = useQuery(api.ledger.poster);
  if (!p) return <DashboardSkeleton />;
  const settled = p.flow.released + p.flow.refunded;
  return (
    <div className="space-y-4">
      <StatStrip
        stats={[
          {
            label: "Held now",
            tone: "steel",
            value: <Amount cents={p.flow.held} size="lg" className="text-steel-800" />,
            foot: `${plural(p.flowCount.held, "task")}, waiting on proof`,
          },
          {
            label: "Paid to workers",
            tone: "green",
            value: <Amount cents={p.flow.released} size="lg" />,
            foot: `${plural(p.flowCount.released, "payout")}, all on proof`,
          },
          {
            label: "Refunded to you",
            value: <Amount cents={p.flow.refunded} size="lg" />,
            foot: `${Math.round((p.flow.refunded / Math.max(settled, 1)) * 100)}% of settled money`,
          },
          {
            label: "Open tasks",
            value: <Figure>{p.openTasks}</Figure>,
            foot: p.flowCount.disputed ? `${p.flowCount.disputed} in dispute` : "None in dispute",
          },
        ]}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <MoneyFlow flow={p.flow} count={p.flowCount} />
        <ProofVerdicts counts={p.proofCounts} passRate={p.passRate} />
      </div>
      <div className="pt-6">
        <SectionHeading title="Proof wall" description="What workers sent, and what the proof engine made of it." />
        <ProofWall proofs={p.proofs} />
      </div>
      <TopWorkers workers={p.workers} />
    </div>
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
  if (c === null) {
    return (
      <Card>
        <EmptyState
          icon={<HeartHandshake />}
          title="No cause on this account"
          body="When you run a cause on Plex, its gifts and the local work they paid for show up here."
        />
      </Card>
    );
  }
  if (!c) return <DashboardSkeleton />;
  const raised = c.cause.raisedCents / Math.max(c.cause.goalCents, 1);
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_320px] md:items-center md:gap-8">
          <div className="flex min-w-0 items-center gap-3.5">
            {c.org ? <Avatar name={c.org.name} color={c.org.color} size={44} square /> : null}
            <div className="min-w-0">
              <div className="truncate text-[17px] font-semibold tracking-[-0.015em] text-ink">{c.cause.name}</div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                <span className="truncate">{c.org?.name}</span>
                <span className="text-line-strong">·</span>
                <MapPin className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
                <span className="truncate">{c.cause.location}</span>
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-1.5">
                <Amount cents={c.cause.raisedCents} size="lg" />
                <span className="tabular text-[12.5px] text-muted">of {formatCents(c.cause.goalCents)}</span>
              </div>
              <span className="tabular text-[12.5px] font-medium text-ink-2">{Math.round(Math.min(raised, 1) * 100)}%</span>
            </div>
            <Meter value={raised} className="mt-2.5" label="Raised toward the goal" />
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-line bg-canvas/50 px-5 py-2.5 text-[12.5px] text-muted">
          <Eye className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
          <span className="truncate">
            The view {c.org?.name ?? "the cause"} sees. Donors get the same receipts for the shifts they fund.
          </span>
        </div>
      </Card>
      <StatStrip
        stats={[
          {
            label: "Raised, 21 days",
            tone: "green",
            value: <Amount cents={c.totals.last21Cents} size="lg" />,
            foot: `${plural(c.totals.gifts, "gift")}, ${c.totals.recurring} monthly`,
          },
          { label: "Paid to local workers", value: <Amount cents={c.totals.paidToWorkersCents} size="lg" />, foot: "Released on proof" },
          { label: "Shifts done", value: <Figure>{c.totals.shiftsDone}</Figure>, foot: `${c.totals.shiftsOpen} open` },
          {
            label: "Donors, all time",
            value: <Figure>{c.cause.donorsCount}</Figure>,
            foot: `${plural(c.cause.workersPaidCount, "worker")} paid so far`,
          },
        ]}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <WidgetCard spec={DONATIONS_BY_WEEK} host={host} />
        <DonorLeaderboard leaders={c.leaderboard} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <DonationFeed feed={c.feed} />
        <CauseTasks tasks={c.tasks} />
      </div>
    </div>
  );
}
