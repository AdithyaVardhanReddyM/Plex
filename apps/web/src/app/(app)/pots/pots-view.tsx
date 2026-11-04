"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import {
  Bot,
  CircleAlert,
  CircleCheck,
  CircleX,
  FlaskConical,
  Pause,
  PencilLine,
  Play,
  Quote,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/convex";
import type { Doc, Id } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Input, Label, PageHeader, Skeleton, Textarea } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
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
        title="Pots & limits"
        description="Write your limits in plain English. Plex turns them into rules once, and code checks every payment against them."
        actions={<PauseControl paused={paused} ready={viewer !== undefined} />}
      />

      {paused ? (
        <div className="mb-4 flex items-start gap-3 rounded-md bg-refunded-bg px-4 py-3 text-[13.5px] text-refunded ring-1 ring-inset ring-refunded/20">
          <Pause className="mt-0.5 size-4 flex-none" strokeWidth={1.9} />
          <span>
            <span className="font-medium">All agent spending is paused.</span> Every check is blocked until you resume,
            whatever the pot&apos;s rules say.
          </span>
        </div>
      ) : null}

      {/* Pots */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {pots
          ? pots.map((p) => (
              <PotTile key={p._id} pot={p} selected={p._id === selectedId} onSelect={() => select(p._id)} />
            ))
          : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[132px] w-full rounded-lg" />)}
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {selected ? (
          <RulesCard
            key={selected._id}
            pot={selected}
            proposal={proposal}
            onProposal={setProposal}
            decided={trial.result ? { index: trial.result.ruleIndex, outcome: trial.result.outcome } : null}
          />
        ) : (
          <Skeleton className="h-96 w-full rounded-lg" />
        )}
        <div className="grid min-w-0 content-start items-start gap-4 md:grid-cols-2 xl:grid-cols-1">
          {selected ? <TryIt pot={selected} draft={proposal} paused={paused} trial={trial} /> : <Skeleton className="h-72 w-full rounded-lg" />}
          <Approvals pending={pending} pots={pots} />
        </div>
      </div>
    </div>
  );
}

// ── Pause ────────────────────────────────────────────────────────────────────

function PauseControl({ paused, ready }: { paused: boolean; ready: boolean }) {
  const setPaused = useMutation(api.users.setPaused);
  if (!ready) return <Skeleton className="h-9 w-48" />;
  return (
    <div className="flex items-center gap-3">
      <Badge tone={paused ? "amber" : "green"}>
        <span className={cn("size-1.5 rounded-full", paused ? "bg-refunded" : "bg-green-500")} />
        {paused ? "Paused" : "Agents active"}
      </Badge>
      <Button variant="secondary" onClick={() => setPaused({ paused: !paused })} aria-pressed={paused}>
        {paused ? <Play strokeWidth={1.9} /> : <Pause strokeWidth={1.9} />}
        {paused ? "Resume spending" : "Pause all spending"}
      </Button>
    </div>
  );
}

// ── Pot tile ─────────────────────────────────────────────────────────────────

function PotTile({ pot, selected, onSelect }: { pot: Pot; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "min-w-0 rounded-lg border bg-surface p-4 text-left shadow-card transition-[border-color,box-shadow] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400",
        selected ? "border-ink/80 shadow-raised" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-center gap-2">
        <PotIcon pot={pot} />
        <span className="truncate text-[13.5px] font-medium text-ink-2">{pot.name}</span>
      </div>
      <div className="mt-3">
        <Amount cents={pot.balanceCents} size="lg" />
        <div className="mt-0.5 text-[12px] text-muted">left in the pot</div>
      </div>
      <PotGauge pot={pot} className="mt-3" />
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
    <Card className="min-w-0">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <PotIcon pot={pot} size={22} />
            {pot.name} rules
          </span>
        }
        description="Your words on top. Below, the rules Plex actually enforces."
        action={
          editing ? null : (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <PencilLine strokeWidth={1.9} />
              Edit
            </Button>
          )
        }
      />

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
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
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
          <div className="flex gap-3 rounded-md bg-canvas px-4 py-3.5 ring-1 ring-inset ring-line">
            <Quote className="mt-0.5 size-4 flex-none text-faint" strokeWidth={1.9} />
            <p className="text-[15px] leading-relaxed text-ink">{pot.rulesText}</p>
          </div>
        )}
      </div>

      {/* Enforced as */}
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px] font-medium tracking-[0.01em] text-faint">
            {proposal ? "Plex read this as" : "Enforced as"}
          </div>
          {proposal ? (
            <Badge tone={proposal.source === "gemini" ? "steel" : "outline"}>
              {proposal.source === "gemini" ? "Read by Gemini" : "Read by the built-in parser"}
            </Badge>
          ) : (
            <span className="flex items-center gap-1.5 text-[12px] text-green-700">
              <ShieldCheck className="size-3.5" strokeWidth={2} />
              Checked in code on every payment
            </span>
          )}
        </div>
      </div>
      <ul className="-mx-0 mt-2 space-y-1 px-2 pb-2">
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
          <li className="px-3 py-4 text-[13.5px] text-muted">
            No limits found. Name an amount and a period, like “up to $40 a day”.
          </li>
        )}
      </ul>

      {proposal?.unparsed.length ? (
        <div className="mx-5 mb-4 rounded-md border border-dashed border-line px-4 py-3">
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
  { label: "Now", value: -1 },
  { label: "9am", value: 9 },
  { label: "2pm", value: 14 },
  { label: "1am", value: 1 },
];

const OUTCOME = {
  allow: { label: "Allowed", sub: "The agent can pay, and the Receipt cites", tone: "green" as const, icon: CircleCheck },
  needs_approval: { label: "Needs your OK", sub: "It waits on Home for you, because of", tone: "steel" as const, icon: CircleAlert },
  deny: { label: "Blocked", sub: "No money moves, because of", tone: "red" as const, icon: CircleX },
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

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <FlaskConical className="size-4 text-faint" strokeWidth={1.9} />
            Try it
          </span>
        }
        description={draft ? `Against your draft ${pot.name} rules, before you save.` : `What would happen if an agent tried this from ${pot.name}?`}
      />
      <div className="p-5 pt-4">
        <Label htmlFor="try-purchase">A purchase</Label>
        <Input id="try-purchase" value={input} onChange={(e) => setInput(e.target.value)} placeholder={SAMPLE} />
        <div className="mt-3 flex items-center gap-1.5" role="radiogroup" aria-label="Time of day">
          <span className="mr-1 text-[12.5px] text-muted">At</span>
          {HOURS.map((h) => (
            <button
              key={h.value}
              type="button"
              role="radio"
              aria-checked={hourChoice === h.value}
              onClick={() => setHourChoice(h.value)}
              className={cn(
                "h-7 rounded-full px-2.5 text-[12.5px] font-medium transition-colors",
                hourChoice === h.value ? "bg-ink text-white" : "text-ink-2 ring-1 ring-inset ring-line hover:bg-sunken",
              )}
            >
              {h.label}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-md border border-line bg-canvas/60 p-4" aria-live="polite">
          {!sample.amountCents ? (
            <div className="text-[13px] text-muted">Include an amount, like “$60”.</div>
          ) : !outcome || !result ? (
            <Skeleton className="h-14 w-full" />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <Badge tone={outcome.tone} className="h-6 px-2.5 text-[12.5px] [&_svg]:size-3.5">
                  <outcome.icon strokeWidth={2} />
                  {outcome.label}
                </Badge>
                <Amount cents={sample.amountCents} size="md" />
              </div>
              <div className="mt-3 text-[12.5px] text-muted">{outcome.sub}</div>
              <div className="mt-1 text-[14px] font-medium leading-snug text-ink">{result.ruleText}</div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-dashed border-line pt-3 text-[12px] text-faint">
                <span>{pot.name} pot</span>
                {sample.merchant ? <span>{sample.merchant}</span> : null}
                {sample.category ? <span>{sample.category}</span> : null}
                <span>{hourLabel(hour)}</span>
                {paused ? <span className="text-refunded">Paused</span> : null}
              </div>
            </>
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
  const potName = (id: Id<"pots">) => pots?.find((p) => p._id === id)?.name ?? "Pot";

  return (
    <Card>
      <CardHeader
        title="Approvals"
        description="Purchases a rule sent to you, and what you decided."
        action={pending?.length ? <Badge tone="steel">{pending.length} waiting</Badge> : null}
      />
      <div className="px-2 pt-2 pb-2">
        {pending === undefined || history === undefined ? (
          <Skeleton className="m-3 h-24" />
        ) : !pending.length && !history.length ? (
          <EmptyState title="No approvals yet" body="When a purchase is over a limit, it waits here for you." className="py-8" />
        ) : (
          <ul>
            {pending.map((a) => (
              <li key={a._id} className="rounded-md px-3 py-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-ink">{a.description}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
                      <Bot className="size-3.5 flex-none" strokeWidth={1.9} />
                      <span className="truncate">
                        {a.agentLabel} · {a.merchant} · {potName(a.potId)}
                      </span>
                    </div>
                  </div>
                  <Amount cents={a.amountCents} size="sm" />
                </div>
                <div className="mt-1.5 text-[12.5px] text-steel-600">{a.ruleText}</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => decide({ id: a._id, approve: false })}>
                    Decline
                  </Button>
                  <Button variant="brand" size="sm" onClick={() => decide({ id: a._id, approve: true })}>
                    Approve {formatCents(a.amountCents)}
                  </Button>
                </div>
              </li>
            ))}
            {history.map((a) => {
              const row = (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5 transition-colors group-hover:bg-sunken/70">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-ink">{a.description}</div>
                    <div className="mt-0.5 truncate text-[12.5px] text-muted">
                      {a.potName} · {relativeTime(a.decidedAt ?? a._creationTime)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Amount cents={a.amountCents} size="sm" />
                    <Badge tone={a.status === "approved" ? "green" : "neutral"}>
                      {a.status === "approved" ? "Approved" : "Declined"}
                    </Badge>
                  </div>
                </div>
              );
              return (
                <li key={a._id}>
                  {a.receiptId ? (
                    <Link
                      href={`/receipts/${a.receiptId}`}
                      className="group block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                    >
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
