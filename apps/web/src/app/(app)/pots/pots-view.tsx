"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import {
  Cpu,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  FlaskConical,
  Pause,
  PencilLine,
  PiggyBank,
  Play,
  Quote,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "@/lib/convex";
import type { Doc, Id } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  IconTile,
  Input,
  Label,
  PageHeader,
  Segmented,
  Skeleton,
  StatusDot,
  Textarea,
} from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { HeldArt } from "@/components/art/empty-art";
import { PotGauge, PotIcon, RuleLine, type PolicyRule, type Pot } from "@/components/pots/pot-meta";
import { cn, formatCents, relativeTime } from "@/lib/utils";

type Proposal = {
  rules: PolicyRule[];
  lines: string[];
  unparsed: string[];
  source: "gemini" | "heuristic";
  text: string;
};

export function PotsView() {
  const pots = useQuery(api.pots.list);
  const viewer = useQuery(api.users.viewer);
  const pending = useQuery(api.pots.pendingApprovals);
  const [picked, setPicked] = useState<Id<"pots"> | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  // Open on the pot with something waiting (the demo's desk chair), else the
  // first, and stay there when that approval is decided.
  if (picked === null && pots?.length && pending !== undefined) setPicked(pending[0]?.potId ?? pots[0]!._id);
  const selectedId = picked;
  const selected = pots?.find((p) => p._id === selectedId);
  const paused = Boolean(viewer?.agentsPaused);
  const trial = useTrial(selected, proposal);

  const select = (id: Id<"pots">) => {
    setPicked(id);
    setProposal(null);
  };

  return (
    <div className="animate-rise">
      <PageHeader
        icon={<PiggyBank />}
        title="Pots & limits"
        description="Write your limits in plain English. Plex turns them into rules once, and code checks every payment against them."
        actions={<PauseControl paused={paused} ready={viewer !== undefined} />}
      />

      {paused ? (
        <div className="mb-4 flex items-start gap-3 rounded-[12px] bg-refunded-bg px-4 py-3 text-[13.5px] text-refunded ring-1 ring-inset ring-refunded/20">
          <Pause className="mt-0.5 size-4 flex-none" strokeWidth={1.9} />
          <span>
            <span className="font-medium">All agent spending is paused.</span> Every check is blocked until you resume,
            whatever the pot&apos;s rules say.
          </span>
        </div>
      ) : null}

      {/* Pots */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" role="group" aria-label="Pots">
        {pots
          ? pots.map((p) => (
              <PotTile
                key={p._id}
                pot={p}
                waiting={pending?.filter((a) => a.potId === p._id).length ?? 0}
                selected={p._id === selectedId}
                onSelect={() => select(p._id)}
              />
            ))
          : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[150px] w-full rounded-lg" />)}
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        {selected ? (
          <RulesCard
            key={selected._id}
            pot={selected}
            proposal={proposal}
            onProposal={setProposal}
            decided={trial.result ? { index: trial.result.ruleIndex, outcome: trial.result.outcome } : null}
          />
        ) : (
          <Skeleton className="h-[420px] w-full rounded-lg" />
        )}
        {selected ? <TryIt pot={selected} draft={proposal} paused={paused} trial={trial} /> : <Skeleton className="h-[420px] w-full rounded-lg" />}
      </div>

      <Approvals pending={pending} pots={pots} />
    </div>
  );
}

// ── Pause ────────────────────────────────────────────────────────────────────

function PauseControl({ paused, ready }: { paused: boolean; ready: boolean }) {
  const setPaused = useMutation(api.users.setPaused);
  if (!ready) return <Skeleton className="h-11 w-64 rounded-full" />;
  return (
    <div className="flex items-center gap-3 rounded-full border border-line bg-surface py-1 pr-1 pl-3.5 shadow-card">
      <span className={cn("inline-flex items-center gap-2 text-[13px] font-medium", paused ? "text-refunded" : "text-ink-2")}>
        <StatusDot tone={paused ? "amber" : "green"} live={!paused} />
        {paused ? "Spending paused" : "Agents active"}
      </span>
      <Button
        variant={paused ? "primary" : "secondary"}
        size="sm"
        onClick={() => setPaused({ paused: !paused })}
        aria-pressed={paused}
      >
        {paused ? <Play strokeWidth={1.9} /> : <Pause strokeWidth={1.9} />}
        {paused ? "Resume spending" : "Pause all spending"}
      </Button>
    </div>
  );
}

// ── Pot tile ─────────────────────────────────────────────────────────────────

function PotTile({
  pot,
  waiting,
  selected,
  onSelect,
}: {
  pot: Pot;
  waiting: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative flex min-w-0 flex-col rounded-lg border p-4 text-left transition-[border-color,box-shadow,background-color,transform] duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200",
        selected
          ? "-translate-y-0.5 border-line-strong bg-surface shadow-raised"
          : "border-line bg-surface/60 shadow-card hover:border-line-strong hover:bg-surface",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PotIcon pot={pot} size={28} />
          <span className={cn("truncate text-[13.5px] font-medium", selected ? "text-ink" : "text-ink-2")}>{pot.name}</span>
        </div>
        {waiting ? (
          <Badge tone="steel" className="tabular flex-none">
            {waiting}
            <span className="hidden sm:inline">waiting</span>
          </Badge>
        ) : selected ? (
          <span className="flex size-5 flex-none items-center justify-center rounded-full bg-ink text-white">
            <Check className="size-3" strokeWidth={2.6} />
          </span>
        ) : null}
      </div>
      <div className="mt-4">
        <Amount cents={pot.balanceCents} size="lg" />
        <div className="mt-0.5 text-[12px] text-muted">left in the pot</div>
      </div>
      <PotGauge pot={pot} className="mt-3.5" />
    </button>
  );
}

// ── Rules: the user's words and the structured rules ─────────────────────────

function RulesCard({
  pot,
  proposal,
  onProposal,
  decided,
}: {
  pot: Pot;
  proposal: Proposal | null;
  onProposal: (p: Proposal | null) => void;
  decided: { index: number; outcome: "allow" | "needs_approval" | "deny" } | null;
}) {
  const propose = useAction(api.pots.proposeRules);
  const save = useMutation(api.pots.saveRules);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(pot.rulesText);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = async () => {
    setBusy("read");
    setError(null);
    try {
      const res = await propose({ text });
      onProposal({ ...res, text });
    } catch {
      setError("Couldn't read those rules. Try shorter sentences.");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (!proposal) return;
    setBusy("save");
    try {
      await save({ potId: pot._id, rulesText: proposal.text, rules: proposal.rules });
      onProposal(null);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  };

  const cancel = () => {
    onProposal(null);
    setEditing(false);
    setText(pot.rulesText);
    setError(null);
  };

  const showing = proposal ?? { rules: pot.rules, lines: pot.ruleLines, unparsed: [] as string[] };

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div className="flex min-w-0 items-start gap-3">
          <PotIcon pot={pot} size={28} className="mt-px" />
          <div className="min-w-0">
            <div className="text-[14.5px] font-semibold leading-6 tracking-[-0.012em] text-ink">{pot.name} rules</div>
            <div className="text-[13px] leading-snug text-muted">Your words on top. Below, the rules Plex actually enforces.</div>
          </div>
        </div>
        {editing ? null : (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <PencilLine strokeWidth={1.9} />
            Edit
          </Button>
        )}
      </div>

      {/* In your words */}
      <div className="px-5 pt-4">
        {editing ? (
          <div>
            <Label htmlFor="rules-text">In your words</Label>
            <Textarea
              id="rules-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (proposal) onProposal(null);
              }}
              rows={3}
              maxLength={1000}
              placeholder="Up to $40 a day. Ask me before anything over $25. No spending after midnight."
              className="text-[15px]"
            />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] text-muted">
                Try “Never buy subscriptions without asking” or “No spending after 10pm”.
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={cancel}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={read} disabled={busy !== null || !text.trim()}>
                  {busy === "read" ? "Reading…" : "Read my rules"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <figure className="relative overflow-hidden rounded-[12px] bg-canvas/70 py-4 pr-5 pl-6 ring-1 ring-inset ring-line">
            <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ backgroundImage: "linear-gradient(180deg, var(--color-green-300), var(--color-green-500))" }} aria-hidden />
            <figcaption className="flex items-center gap-1.5 text-[12px] font-medium text-faint">
              <Quote className="size-3.5" strokeWidth={2} />
              In your words
            </figcaption>
            <blockquote className="mt-2 text-[16px] leading-relaxed font-medium tracking-[-0.01em] text-pretty text-ink">
              {pot.rulesText}
            </blockquote>
          </figure>
        )}
      </div>

      {/* Enforced as */}
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-2 text-[13px] font-semibold whitespace-nowrap text-ink">
          {proposal ? "Plex read this as" : "Enforced as"}
          <span className="tabular rounded-full bg-sunken px-1.5 text-[11px] leading-[18px] font-medium text-muted">
            {showing.rules.length}
          </span>
        </div>
        {proposal ? (
          <Badge tone={proposal.source === "gemini" ? "steel" : "outline"}>
            {proposal.source === "gemini" ? "Read by Gemini" : "Read by the built-in parser"}
          </Badge>
        ) : (
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-green-700">
            <ShieldCheck className="size-3.5" strokeWidth={2} />
            Checked in code on every payment
          </span>
        )}
      </div>
      <ul className="mt-2 space-y-0.5 px-2 pb-3">
        {showing.rules.length ? (
          showing.rules.map((r, i) => (
            <RuleLine
              key={i}
              rule={r}
              line={showing.lines[i] ?? ""}
              highlight={decided && decided.index === i && decided.outcome !== "allow" ? decided.outcome : null}
            />
          ))
        ) : (
          <li className="mx-3 my-1 rounded-[10px] border border-dashed border-line px-4 py-4 text-[13px] text-muted">
            No limits found. Name an amount and a period, like “up to $40 a day”.
          </li>
        )}
      </ul>

      {proposal?.unparsed.length ? (
        <div className="mx-5 mb-4 rounded-[12px] border border-dashed border-line px-4 py-3">
          <div className="text-[12px] font-medium text-faint">Kept as a note, not a limit</div>
          <ul className="mt-1.5 space-y-1">
            {proposal.unparsed.map((u) => (
              <li key={u} className="text-[13px] leading-snug text-muted">
                “{u}”
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {proposal ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/60 px-5 py-3.5">
          <span className="text-[13px] text-muted">Nothing changes until you confirm. Try it on the right first.</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => onProposal(null)}>
              Edit again
            </Button>
            <Button variant="primary" size="sm" onClick={confirm} disabled={busy !== null || !proposal.rules.length}>
              {busy === "save" ? "Saving…" : `Save ${proposal.rules.length} rule${proposal.rules.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <div className="px-5 pb-4 text-[13px] text-disputed">{error}</div> : null}
    </Card>
  );
}

// ── Try it ───────────────────────────────────────────────────────────────────

const SAMPLE = "$60 desk chair from Lumen & Oak";

/** "$60 desk chair from Lumen & Oak" → amount, item, merchant, category. */
function parseSample(input: string) {
  const amount = input.match(/\$\s?(\d+(?:,\d{3})*(?:\.\d{1,2})?)/);
  const merchant = input.match(/\b(?:from|at)\s+(.+)$/i)?.[1]?.trim();
  const subscription = /\b(subscription|subscribe|membership|monthly plan|annual plan)\b/i.test(input);
  return {
    amountCents: amount ? Math.round(parseFloat(amount[1]!.replace(/,/g, "")) * 100) : null,
    merchant: merchant || undefined,
    category: subscription ? "subscriptions" : undefined,
  };
}

const HOURS = [
  { label: "Now", value: "-1" },
  { label: "9am", value: "9" },
  { label: "2pm", value: "14" },
  { label: "1am", value: "1" },
];

const OUTCOME = {
  allow: {
    label: "Allowed",
    sub: "The agent can pay, and the Receipt cites",
    icon: CircleCheck,
    tile: "mint" as const,
    well: "bg-green-50/70 ring-green-200/80",
    text: "text-green-800",
  },
  needs_approval: {
    label: "Needs your OK",
    sub: "The agent stops and asks you, because of",
    icon: CircleAlert,
    tile: "steel" as const,
    well: "bg-steel-50 ring-steel-200/80",
    text: "text-steel-700",
  },
  deny: {
    label: "Blocked",
    sub: "No money moves, because of",
    icon: CircleX,
    tile: "red" as const,
    well: "bg-disputed-bg ring-disputed/20",
    text: "text-disputed",
  },
};

/** The try-it state lives with the page, so the rules list can light up the rule that decided. */
function useTrial(pot: Pot | undefined, draft: Proposal | null) {
  const [input, setInput] = useState(SAMPLE);
  const [hourChoice, setHourChoice] = useState(-1);
  const [now] = useState(() => new Date().getHours());
  const hour = hourChoice === -1 ? now : hourChoice;
  const sample = useMemo(() => parseSample(input), [input]);
  const result = useQuery(
    api.pots.check,
    pot && sample.amountCents
      ? {
          potId: pot._id,
          amountCents: sample.amountCents,
          merchant: sample.merchant,
          category: sample.category,
          hour,
          rules: draft?.rules,
        }
      : "skip",
  );
  return { input, setInput, hourChoice, setHourChoice, hour, sample, result };
}

type Trial = ReturnType<typeof useTrial>;

function TryIt({ pot, draft, paused, trial }: { pot: Pot; draft: Proposal | null; paused: boolean; trial: Trial }) {
  const { input, setInput, hourChoice, setHourChoice, hour, sample, result } = trial;
  const outcome = result ? OUTCOME[result.outcome] : null;

  const facts: Array<[string, string]> = [
    ["Pot", pot.name],
    ["Merchant", sample.merchant ?? "Any"],
    ["Category", sample.category ?? "None"],
    ["Time", hourLabel(hour)],
  ];

  return (
    <Card className="min-w-0">
      <CardHeader
        icon={<FlaskConical />}
        title="Try it"
        description={draft ? `Against your draft ${pot.name} rules, before you save.` : `What happens if an agent tries this from ${pot.name}.`}
        action={draft ? <Badge tone="amber">Draft</Badge> : null}
      />
      <div className="p-5 pt-4">
        <Label htmlFor="try-purchase">A purchase</Label>
        <div className="relative">
          <Cpu className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" strokeWidth={1.9} />
          <Input id="try-purchase" value={input} onChange={(e) => setInput(e.target.value)} placeholder={SAMPLE} className="pl-9" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[12.5px] font-medium text-muted">At</span>
          <Segmented
            items={HOURS}
            value={String(hourChoice)}
            onChange={(v) => setHourChoice(Number(v))}
            size="sm"
          />
        </div>

        <div className="mt-4" aria-live="polite">
          {!sample.amountCents ? (
            <div className="flex h-[188px] flex-col items-center justify-center rounded-[12px] border border-dashed border-line px-4 text-center text-[13px] text-muted">
              Include an amount, like “$60”.
            </div>
          ) : !outcome || !result ? (
            <Skeleton className="h-[188px] w-full rounded-[12px]" />
          ) : (
            <div className={cn("overflow-hidden rounded-[12px] ring-1 ring-inset", outcome.well)}>
              <div className="px-4 pt-4 pb-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <IconTile tone={outcome.tile} size="sm" className="bg-surface">
                      <outcome.icon />
                    </IconTile>
                    <span className={cn("font-display text-[19px] leading-none font-bold tracking-[-0.02em]", outcome.text)}>
                      {outcome.label}
                    </span>
                  </div>
                  <Amount cents={sample.amountCents} size="md" />
                </div>
                <div className="mt-3 text-[12.5px] text-muted">{outcome.sub}</div>
                <div className="mt-0.5 text-[14px] font-medium leading-snug text-ink">{result.ruleText}</div>
              </div>
              <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
                {facts.map(([k, v]) => (
                  <div key={k} className="min-w-0 bg-surface px-3 py-2.5">
                    <dt className="text-[11px] text-faint">{k}</dt>
                    <dd className="mt-0.5 truncate text-[12.5px] font-medium text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
              {paused ? (
                <div className="border-t border-refunded/15 bg-refunded-bg px-4 py-2 text-[12px] font-medium text-refunded">
                  Spending is paused, so every check is blocked.
                </div>
              ) : null}
            </div>
          )}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          Decided by <code className="font-mono text-muted">evaluate()</code>, the same code that runs before every real
          payment. No model is asked.
        </p>
      </div>
    </Card>
  );
}

function hourLabel(h: number) {
  if (h === 0) return "midnight";
  if (h === 12) return "noon";
  return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
}

// ── Approvals: waiting and history ───────────────────────────────────────────

function Approvals({ pending, pots }: { pending: Doc<"approvals">[] | undefined; pots: Pot[] | undefined }) {
  const history = useQuery(api.pots.approvalHistory, { limit: 8 });
  const decide = useMutation(api.pots.decideApproval);
  const pot = (id: Id<"pots">) => pots?.find((p) => p._id === id);

  return (
    <Card className="mt-4 overflow-hidden">
      <CardHeader
        title="Approvals"
        description="Purchases a rule sent to you, and what you decided."
        action={pending?.length ? <Badge tone="steel">{pending.length} waiting</Badge> : null}
        divider
      />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:divide-x lg:divide-line">
        {/* Waiting */}
        <div className="min-w-0 p-4">
          <div className="mb-2.5 px-1 text-[12.5px] font-medium text-muted">Waiting for you</div>
          {pending === undefined ? (
            <Skeleton className="h-[220px] w-full rounded-[14px]" />
          ) : pending.length ? (
            <div className="space-y-3">
              {pending.map((a) => {
                const p = pot(a.potId);
                return (
                  <div key={a._id} className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-raised">
                    <div className="flex items-center gap-2 border-b border-line bg-canvas/70 px-4 py-2.5 text-[12px] font-medium text-muted">
                      <Cpu className="size-3.5 flex-none" strokeWidth={2} />
                      <span className="truncate">{a.agentLabel} wants to buy</span>
                      <span className="ml-auto flex-none text-faint">{relativeTime(a._creationTime)}</span>
                    </div>
                    <div className="px-4 pt-3.5 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-ink">{a.description}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
                            {p ? <PotIcon pot={p} size={18} /> : null}
                            <span className="truncate">
                              {a.merchant} · {p?.name ?? "Pot"} pot
                            </span>
                          </div>
                        </div>
                        <Amount cents={a.amountCents} size="lg" className="flex-none" />
                      </div>
                      <div className="mt-3 flex items-start gap-2 rounded-[10px] bg-steel-50 px-3 py-2 text-[12.5px] leading-snug text-steel-700 ring-1 ring-inset ring-steel-100">
                        <ShieldCheck className="mt-px size-3.5 flex-none" strokeWidth={2} />
                        <span>
                          Paused by your rule: <span className="font-medium">{a.ruleText}</span>
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button variant="secondary" onClick={() => decide({ id: a._id, approve: false })}>
                          Decline
                        </Button>
                        <Button variant="brand" onClick={() => decide({ id: a._id, approve: true })}>
                          Approve {formatCents(a.amountCents)}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              art={<HeldArt />}
              title="Nothing waiting"
              body="When a purchase goes over one of your limits, the agent stops and it waits here for you."
              className="rounded-[14px] border border-dashed border-line py-8"
            />
          )}
        </div>

        {/* History */}
        <div className="flex min-w-0 flex-col border-t border-line p-4 lg:border-t-0">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[12.5px] font-medium text-muted">History</span>
            {history?.length ? <span className="text-[12px] text-faint">Approved ones open their receipt</span> : null}
          </div>
          {history === undefined ? (
            <div className="space-y-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                  <Skeleton className="size-[34px] rounded-[10px]" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-14" />
                </div>
              ))}
            </div>
          ) : history.length ? (
            <ul className="-mx-1">
              {history.map((a) => {
                const approved = a.status === "approved";
                const row = (
                  <div className="grid grid-cols-[34px_minmax(0,1fr)_auto_14px] items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors group-hover:bg-sunken/70">
                    <IconTile tone={approved ? "mint" : "neutral"} size="md" className="size-[34px]">
                      {approved ? <Check /> : <X />}
                    </IconTile>
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium text-ink">{a.description}</div>
                      <div className="mt-0.5 truncate text-[12px] text-muted">
                        {a.potName} · {approved ? "Approved" : "Declined"} {relativeTime(a.decidedAt ?? a._creationTime)}
                      </div>
                    </div>
                    <Amount cents={a.amountCents} size="sm" className={cn(!approved && "text-muted line-through decoration-faint")} />
                    {a.receiptId ? (
                      <ChevronRight className="size-3.5 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2" strokeWidth={2} />
                    ) : (
                      <span />
                    )}
                  </div>
                );
                return (
                  <li key={a._id}>
                    {a.receiptId ? (
                      <Link
                        href={`/receipts/${a.receiptId}`}
                        className="group block rounded-[10px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="group">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-[12px] border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
              Nothing decided yet. What you approve or decline lands here.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
