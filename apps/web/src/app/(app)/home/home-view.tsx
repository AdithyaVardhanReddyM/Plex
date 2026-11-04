"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ArrowRight, Bot, Coffee, HeartHandshake, MapPin, ShoppingBag, Lock, PiggyBank, ShieldCheck } from "lucide-react";
import { api } from "@/lib/convex";
import type { Doc } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { ReceiptRow } from "@/components/receipt/receipt";
import { cn, formatCents } from "@/lib/utils";

const POT_ICON: Record<string, React.ReactNode> = {
  coffee: <Coffee />,
  "shopping-bag": <ShoppingBag />,
  "map-pin": <MapPin />,
  "heart-handshake": <HeartHandshake />,
};

const POT_TINT: Record<string, { bar: string; chip: string }> = {
  green: { bar: "bg-green-500", chip: "bg-green-50 text-green-700" },
  blue: { bar: "bg-steel-500", chip: "bg-steel-50 text-steel-600" },
  teal: { bar: "bg-green-400", chip: "bg-green-50 text-green-700" },
  steel: { bar: "bg-steel-400", chip: "bg-steel-50 text-steel-600" },
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function HomeView() {
  const viewer = useQuery(api.users.viewer);
  const receipts = useQuery(api.receipts.list, { limit: 40 });
  const pots = useQuery(api.pots.list);
  const approvals = useQuery(api.pots.pendingApprovals);

  const [weekAgo] = useState(() => Date.now() - 7 * 24 * 3_600_000);
  const week = receipts?.filter((r) => r.occurredAt >= weekAgo) ?? [];
  const movedByAgents = week.filter((r) => r.agentLabel).reduce((s, r) => s + r.amountCents, 0);
  const held = receipts?.filter((r) => r.state === "held").reduce((s, r) => s + r.amountCents, 0) ?? 0;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        title={viewer ? `${greeting()}, ${viewer.name.split(" ")[0]}` : <Skeleton className="h-8 w-64" />}
        description="Your agents spent within your limits this week. Everything they moved has a receipt."
        actions={
          <Link href="/tasks" className={buttonVariants({ variant: "secondary" })}>
            Post a task <ArrowRight />
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* This week */}
        <Card className="@container overflow-hidden">
          <div className="grid gap-6 p-5 @[560px]:grid-cols-[minmax(0,1fr)_auto] @[560px]:p-6">
            <div>
              <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
                <Bot className="size-4 text-faint" strokeWidth={1.9} />
                Moved by your agents, last 7 days
              </div>
              <div className="mt-3">
                {receipts ? <Amount cents={movedByAgents} size="xl" /> : <Skeleton className="h-10 w-44" />}
              </div>
              <div className="mt-2 text-[13px] text-muted">
                {receipts ? `${week.length} receipts · 0 outside your rules` : " "}
              </div>
            </div>
            <div className="flex flex-col justify-between gap-3 rounded-md bg-steel-50/70 p-4 ring-1 ring-inset ring-steel-100 @[560px]:w-56">
              <div className="flex items-center gap-2 text-[13px] font-medium text-steel-700">
                <Lock className="size-4" strokeWidth={1.9} />
                Held until proof passes
              </div>
              <div>
                {receipts ? <Amount cents={held} size="lg" className="text-steel-800" /> : <Skeleton className="h-7 w-20" />}
                <div className="mt-1 text-[12.5px] text-steel-600">Paid out only on verified work</div>
              </div>
            </div>
          </div>
          <PotStrip pots={pots} />
        </Card>

        {/* Approvals */}
        <ApprovalsCard approvals={approvals} pots={pots} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader
            title="Recent receipts"
            description="Who it went to, why, and which rule allowed it."
            action={
              <Link href="/receipts" className="text-[13px] font-medium text-green-700 hover:text-green-800">
                View all
              </Link>
            }
          />
          <div className="px-2 pt-2 pb-2">
            {receipts
              ? receipts.slice(0, 7).map((r) => <ReceiptRow key={r._id} receipt={r} href={`/receipts/${r._id}`} />)
              : Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3">
                    <Skeleton className="size-8 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
          </div>
        </Card>
        <RulesCard pots={pots} />
      </div>
    </div>
  );
}

function PotStrip({ pots }: { pots: (Doc<"pots"> & { ruleLines: string[] })[] | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-px border-t border-line bg-line @[640px]:grid-cols-4">
      {(pots ?? Array.from({ length: 4 }).map(() => null)).map((p, i) => (
        <Link
          key={p?._id ?? i}
          href="/pots"
          className="group min-w-0 bg-surface px-5 py-4 transition-colors hover:bg-canvas"
        >
          {p ? (
            <>
              <div className="flex items-center gap-2">
                <span className={cn("flex size-6 items-center justify-center rounded-[7px] [&_svg]:size-3.5", POT_TINT[p.color]?.chip)}>
                  {POT_ICON[p.icon] ?? <PiggyBank />}
                </span>
                <span className="text-[13px] font-medium text-ink-2">{p.name}</span>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <Amount cents={p.spentMonthCents} size="md" />
                <span className="text-[12px] text-faint">of {formatCents(p.monthlyBudgetCents)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-700", POT_TINT[p.color]?.bar)}
                  style={{ width: `${Math.min(100, (p.spentMonthCents / p.monthlyBudgetCents) * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </Link>
      ))}
    </div>
  );
}

function ApprovalsCard({
  approvals,
  pots,
}: {
  approvals: Doc<"approvals">[] | undefined;
  pots: Doc<"pots">[] | undefined;
}) {
  const decide = useMutation(api.pots.decideApproval);
  const first = approvals?.[0];
  const pot = first ? pots?.find((p) => p._id === first.potId) : undefined;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Needs your OK"
        description="Anything over a limit waits for you."
        action={approvals?.length ? <Badge tone="steel">{approvals.length} waiting</Badge> : null}
      />
      <div className="flex flex-1 flex-col p-5 pt-4">
        {approvals === undefined ? (
          <Skeleton className="h-36 w-full" />
        ) : first ? (
          <div className="flex flex-1 flex-col rounded-md border border-line bg-canvas/60 p-4">
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
              <Bot className="size-3.5" strokeWidth={2} />
              {first.agentLabel} wants to buy
            </div>
            <div className="mt-2 text-[15px] font-semibold leading-snug text-ink">{first.description}</div>
            <div className="mt-0.5 text-[13px] text-muted">{first.merchant} · from {pot?.name ?? "a"} pot</div>
            <div className="mt-4 flex items-end justify-between">
              <Amount cents={first.amountCents} size="lg" />
              <span className="flex items-center gap-1.5 text-[12.5px] text-steel-600">
                <ShieldCheck className="size-3.5" strokeWidth={2} />
                {first.ruleText}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => decide({ id: first._id, approve: false })}>
                Decline
              </Button>
              <Button variant="brand" onClick={() => decide({ id: first._id, approve: true })}>
                Approve
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-md border border-dashed border-line px-4 py-8 text-center">
            <ShieldCheck className="size-5 text-green-600" strokeWidth={1.9} />
            <div className="mt-2 text-[14px] font-medium text-ink">Nothing waiting</div>
            <div className="mt-0.5 text-[13px] text-muted">Your agents are inside every limit.</div>
          </div>
        )}
      </div>
    </Card>
  );
}

function RulesCard({ pots }: { pots: (Doc<"pots"> & { ruleLines: string[] })[] | undefined }) {
  return (
    <Card>
      <CardHeader title="Your rules" description="Written in your words, enforced in code." />
      <div className="space-y-4 p-5 pt-4">
        {pots
          ? pots.slice(0, 3).map((p) => (
              <div key={p._id}>
                <div className="text-[13px] font-medium text-ink">{p.name}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">“{p.rulesText}”</p>
              </div>
            ))
          : <Skeleton className="h-32 w-full" />}
        <Link href="/pots" className="inline-flex items-center gap-1 text-[13px] font-medium text-green-700 hover:text-green-800">
          Edit limits <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </Card>
  );
}
