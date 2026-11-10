"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ListChecks, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { ROLE_LABEL, type LedgerRole, type WidgetSpec } from "@plex/backend/lib/ledgerSpec";
import { api } from "@/lib/convex";
import type { Receipt } from "@/components/receipt/receipt";
import { PageHeader, SectionHeading, Segmented } from "@/components/ui/primitives";
import { ReconcileCard } from "@/components/ledger/reconcile";
import { cn, formatCents } from "@/lib/utils";
import { Analyst, PinnedWidgets, Watchdog, WidgetCard, type WidgetHost } from "@/components/ledger/analyst";
import { DashboardSkeleton, DisplayMoney, Figure, StatStrip } from "@/components/ledger/kit";
import { ReceiptPanel } from "@/components/ledger/receipt-panel";
import { ReceiptsCard } from "@/components/ledger/receipts-card";
import { Scoreboard } from "@/components/ledger/scoreboard";
import { MoneyFlow, ProofVerdicts, ProofWall, TopWorkers } from "@/components/ledger/poster-widgets";
import { Toast } from "@/components/ledger/confirm";

const ROLES: { key: LedgerRole; icon: React.ReactNode }[] = [
  { key: "personal", icon: <Wallet /> },
  { key: "poster", icon: <ListChecks /> },
];

const ROLE_INTRO: Record<LedgerRole, { title: string; description: string }> = {
  personal: { title: "Your money", description: "This week's spending, and who still owes you." },
  poster: { title: "Tasks you fund", description: "Money held on proof, what reached workers, and how their proof held up." },
};

function useRole(): [LedgerRole, (r: LedgerRole) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("view");
  const role: LedgerRole = raw === "poster" ? raw : "personal";
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
      <div className="mt-10">
        <ReconcileCard />
      </div>
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
        </section>

        <ReceiptsCard
          receipts={receipts}
          title={role === "poster" ? "Task money" : "Receipts"}
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
  subtitle: "Last 14 days, by category",
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
