"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Eye, HeartHandshake, ListChecks, MapPin, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { ROLE_LABEL, type LedgerRole, type WidgetSpec } from "@plex/backend/lib/ledgerSpec";
import { api } from "@/lib/convex";
import type { Receipt } from "@/components/receipt/receipt";
import { Avatar, Card, EmptyState, PageHeader, SectionHeading, Segmented } from "@/components/ui/primitives";
import { cn, formatCents } from "@/lib/utils";
import { Analyst, PinnedWidgets, Watchdog, WidgetCard, type WidgetHost } from "@/components/ledger/analyst";
import { DashboardSkeleton, DisplayMoney, FACE, FaceRing, Figure, StatStrip } from "@/components/ledger/kit";
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

/** Figure sizes on the stat board and on the held card. */
const BIG = "text-[38px] text-ink";
const HELD = "text-[44px] text-steel-900";

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
  const [featured, setFeatured] = useState<{ title: string; spec: WidgetSpec } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const receipts = data?.receipts;
  const open = receipts?.find((r) => r._id === openId) ?? null;
  const onOpen = useCallback((r: Receipt) => setOpenId(r._id), []);
  const clearFeatured = useCallback(() => setFeatured(null), []);
  const clearToast = useCallback(() => setToast(null), []);

  const host = useMemo<WidgetHost>(
    () => ({ receipts: receipts ?? [], now, role, onOpen, requested: data?.requested ?? {}, selectedId: openId }),
    [receipts, now, role, onOpen, data?.requested, openId],
  );

  return (
    <>
      <div className="space-y-10">
        <div className="space-y-4">
          <Analyst host={host} featured={featured} onClearFeatured={clearFeatured} />
          <Watchdog
            role={role}
            onShow={(a) => {
              setFeatured(a);
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
            value: <DisplayMoney cents={k.spentWeekCents} className={BIG} />,
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
            value: <DisplayMoney cents={k.heldCents} className={HELD} />,
            foot: `${plural(k.heldCount, "receipt")}, waiting on proof`,
          },
          { label: "Owed to you", value: <DisplayMoney cents={k.owedCents} className={BIG} />, foot: "From splits, invoiced by PayPal" },
          {
            label: "Saved by agents",
            tone: "green",
            value: <DisplayMoney cents={k.savedCents} className={cn(BIG, "text-green-700")} />,
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
            value: <DisplayMoney cents={p.flow.held} className={HELD} />,
            foot: `${plural(p.flowCount.held, "task")}, waiting on proof`,
          },
          {
            label: "Paid to workers",
            tone: "green",
            value: <DisplayMoney cents={p.flow.released} className={BIG} />,
            foot: `${plural(p.flowCount.released, "payout")}, all on proof`,
          },
          {
            label: "Refunded to you",
            value: <DisplayMoney cents={p.flow.refunded} className={BIG} />,
            foot: `${Math.round((p.flow.refunded / Math.max(settled, 1)) * 100)}% of settled money`,
          },
          {
            label: "Open tasks",
            value: <Figure className={BIG}>{p.openTasks}</Figure>,
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
      <div className={cn("relative overflow-hidden rounded-xl p-6 shadow-card sm:p-7", FACE.green)}>
        <FaceRing />
        <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] md:items-end md:gap-10">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              {c.org ? <Avatar name={c.org.name} color={c.org.color} size={40} square /> : null}
              <div className="min-w-0">
                <div className="truncate font-display text-[19px] font-bold tracking-[-0.02em] text-ink">{c.cause.name}</div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2/75">
                  <span className="truncate">{c.org?.name}</span>
                  <MapPin className="ml-1 size-3.5 flex-none" strokeWidth={1.9} />
                  <span className="truncate">{c.cause.location}</span>
                </div>
              </div>
            </div>
            <p className="mt-5 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-2/75">
              <Eye className="mt-0.5 size-4 flex-none" strokeWidth={1.9} />
              The view {c.org?.name ?? "the cause"} sees. Donors get the same receipts for the shifts they fund.
            </p>
          </div>
          <div className="min-w-0">
            <div className="flex items-end justify-between gap-3">
              <div>
                <DisplayMoney cents={c.cause.raisedCents} className="text-[44px] text-ink" />
                <div className="tabular mt-1.5 text-[12.5px] font-medium text-ink-2/70">raised of {formatCents(c.cause.goalCents)}</div>
              </div>
              <span className="tabular font-display text-[20px] font-bold tracking-[-0.03em] text-ink">{Math.round(Math.min(raised, 1) * 100)}%</span>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-white/60"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(raised, 1) * 100)}
              aria-label="Raised toward the goal"
            >
              <div className="h-full rounded-full bg-ink transition-[width] duration-700" style={{ width: `${Math.min(raised, 1) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
      <StatStrip
        stats={[
          {
            label: "Raised, 21 days",
            tone: "green",
            value: <DisplayMoney cents={c.totals.last21Cents} className={BIG} />,
            foot: `${plural(c.totals.gifts, "gift")}, ${c.totals.recurring} monthly`,
          },
          { label: "Paid to local workers", value: <DisplayMoney cents={c.totals.paidToWorkersCents} className={BIG} />, foot: "Released on proof" },
          { label: "Shifts done", value: <Figure className={BIG}>{c.totals.shiftsDone}</Figure>, foot: `${c.totals.shiftsOpen} open` },
          {
            label: "Donors, all time",
            value: <Figure className={BIG}>{c.cause.donorsCount}</Figure>,
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
