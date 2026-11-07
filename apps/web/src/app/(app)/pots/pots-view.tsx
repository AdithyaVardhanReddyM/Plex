"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  FlaskConical,
  Pause,
  PencilLine,
  PiggyBank,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { AiAgentIcon } from "@/components/ui/icons";
import { api } from "@/lib/convex";
import type { Doc, Id } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Segmented,
  Skeleton,
  Switch,
  Textarea,
} from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { HeldArt } from "@/components/art/empty-art";
import { PotIcon, RuleLine, type PolicyRule, type Pot } from "@/components/pots/pot-meta";
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
  const [creating, setCreating] = useState(false);

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
        actions={
          <div className="flex items-center gap-3">
            {pots?.length && !creating ? (
              <Button variant="secondary" onClick={() => setCreating(true)}>
                <Plus strokeWidth={1.9} />
                New pot
              </Button>
            ) : null}
            <PauseControl paused={paused} ready={viewer !== undefined} />
          </div>
        }
      />

      {paused ? (
        <div className="mb-4 flex items-start gap-3 rounded-[14px] bg-refunded-bg px-4 py-3.5 text-[13.5px] text-refunded">
          <Pause className="mt-0.5 size-4 flex-none" strokeWidth={1.9} />
          <span>
            <span className="font-medium">All agent spending is paused.</span> Every check is blocked until you resume,
            whatever the pot&apos;s rules say.
          </span>
        </div>
      ) : null}

      {pots?.length === 0 || creating ? (
        <NewPot
          first={pots?.length === 0}
          taken={pots?.map((p) => p.name.toLowerCase()) ?? []}
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            select(id);
          }}
        />
      ) : null}

      {/* Pots */}
      {pots?.length === 0 ? null : (
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
            : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[172px] w-full rounded-xl" />)}
        </div>
      )}

      {pots?.length === 0 ? null : (
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
      )}

      <Approvals pending={pending} pots={pots} />
    </div>
  );
}

// ── New pot ──────────────────────────────────────────────────────────────────

const POT_ICON_CHOICES = [
  { icon: "coffee", label: "Food" },
  { icon: "shopping-bag", label: "Shopping" },
  { icon: "map-pin", label: "Errands" },
  { icon: "heart-handshake", label: "Giving" },
  { icon: "piggy-bank", label: "Anything else" },
] as const;

/** Name, monthly budget, icon. The rules come next, in the pot's own card. */
function NewPot({
  first,
  taken,
  onCancel,
  onCreated,
}: {
  first: boolean;
  taken: string[];
  onCancel: () => void;
  onCreated: (id: Id<"pots">) => void;
}) {
  const create = useMutation(api.pots.create);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [icon, setIcon] = useState<string>("coffee");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const budgetCents = Math.round(parseFloat(budget.replace(/[$,\s]/g, "")) * 100);
  const ready = name.trim().length > 0 && Number.isFinite(budgetCents) && budgetCents > 0;
  const suggestions = POT_ICON_CHOICES.slice(0, 4).filter((c) => !taken.includes(c.label.toLowerCase()));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await create({ name, monthlyBudgetCents: budgetCents, icon }));
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "Couldn't make the pot. Try again.");
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4 overflow-hidden">
      <form onSubmit={submit}>
        <div className="px-6 pt-5">
          <div className="font-display text-[16px] leading-6 font-bold tracking-[-0.02em] text-ink">
            {first ? "Make your first pot" : "New pot"}
          </div>
          <div className="max-w-xl text-[13px] leading-snug text-faint">
            A pot is what an agent can spend on one part of your life, each month. Name it and set the budget; you write
            its limits next.
          </div>
        </div>

        <div className="grid gap-4 px-6 pt-5 md:grid-cols-[minmax(0,1fr)_200px_auto]">
          <div className="min-w-0">
            <Label htmlFor="pot-name">Name</Label>
            <Input
              id="pot-name"
              value={name}
              maxLength={32}
              autoFocus
              placeholder="Food"
              onChange={(e) => setName(e.target.value)}
            />
            {suggestions.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.icon}
                    type="button"
                    onClick={() => {
                      setName(s.label);
                      setIcon(s.icon);
                    }}
                    className="flex h-7 items-center gap-1.5 rounded-full bg-sunken px-2.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-line/60 hover:text-ink"
                  >
                    <PotIcon pot={{ icon: s.icon, color: "green" }} size={16} />
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <Label htmlFor="pot-budget">Monthly budget</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-faint">$</span>
              <Input
                id="pot-budget"
                inputMode="decimal"
                value={budget}
                placeholder="400"
                className="tabular pl-6"
                onChange={(e) => setBudget(e.target.value.replace(/[^\d.,]/g, ""))}
              />
            </div>
          </div>
          <div>
            <Label id="pot-icon-label">Icon</Label>
            <div role="radiogroup" aria-labelledby="pot-icon-label" className="flex h-9 items-center gap-1">
              {POT_ICON_CHOICES.map((c) => (
                <button
                  key={c.icon}
                  type="button"
                  role="radio"
                  aria-checked={icon === c.icon}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => setIcon(c.icon)}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-[10px] transition-colors",
                    icon === c.icon ? "bg-ink text-white" : "text-muted hover:bg-sunken hover:text-ink",
                  )}
                >
                  <PotIcon pot={{ icon: c.icon, color: "" }} size={22} className="text-current" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 px-6 pb-5">
          {error ? <span className="mr-auto text-[13px] text-disputed">{error}</span> : null}
          {first ? null : (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="primary" size="sm" disabled={!ready || busy}>
            {busy ? "Making…" : "Make pot"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ── Pause ────────────────────────────────────────────────────────────────────

function PauseControl({ paused, ready }: { paused: boolean; ready: boolean }) {
  const setPaused = useMutation(api.users.setPaused);
  if (!ready) return <Skeleton className="h-11 w-56 rounded-full" />;
  return (
    <div className="flex h-11 items-center gap-3 rounded-full bg-surface pr-3 pl-4 shadow-card">
      <span className="text-left leading-tight">
        <span className={cn("block text-[13px] font-semibold", paused ? "text-refunded" : "text-ink")}>
          {paused ? "Spending paused" : "Agents can spend"}
        </span>
        <span className="block text-[11.5px] text-muted">{paused ? "Every check is blocked" : "Inside your limits"}</span>
      </span>
      <Switch
        checked={!paused}
        onChange={(on) => setPaused({ paused: !on })}
        label={paused ? "Resume agent spending" : "Pause all agent spending"}
      />
    </div>
  );
}

// ── Pot face ─────────────────────────────────────────────────────────────────

/** Tinted card faces, the same as Home's pot strip. */
const POT_FACE: Record<string, string> = {
  green: "bg-[linear-gradient(150deg,var(--color-green-50),var(--color-green-100)_70%,var(--color-green-200))]",
  teal: "bg-[linear-gradient(150deg,var(--color-green-50),var(--color-green-100)_70%,var(--color-green-300))]",
  blue: "bg-[linear-gradient(150deg,var(--color-steel-50),var(--color-steel-100)_70%,var(--color-steel-200))]",
  steel: "bg-[linear-gradient(150deg,var(--color-steel-50),var(--color-steel-100)_70%,var(--color-steel-200))]",
};

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
  const pct = pot.monthlyBudgetCents ? Math.min(100, (pot.spentMonthCents / pot.monthlyBudgetCents) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative flex min-h-[172px] min-w-0 flex-col overflow-hidden rounded-xl p-5 text-left transition-[box-shadow,transform,filter] duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200",
        POT_FACE[pot.color] ?? POT_FACE.green,
        selected
          ? "-translate-y-1 shadow-[0_2px_4px_rgb(12_21_18/0.06),0_24px_44px_-18px_rgb(12_21_18/0.35)]"
          : "shadow-card saturate-[0.7] hover:-translate-y-0.5 hover:shadow-hover hover:saturate-100",
      )}
    >
      <span className="pointer-events-none absolute -right-8 -bottom-10 size-36 rounded-full border-[18px] border-white/40" aria-hidden />
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PotIcon pot={pot} size={24} />
          <span className="truncate text-[13.5px] font-semibold text-ink">{pot.name}</span>
        </div>
        {waiting ? (
          <span className="tabular flex-none rounded-full bg-ink px-2 py-0.5 text-[11.5px] font-semibold text-white">
            {waiting}
            <span className="hidden sm:inline"> waiting</span>
          </span>
        ) : selected ? (
          <Check className="size-[18px] flex-none text-ink" strokeWidth={2.4} />
        ) : null}
      </div>
      <div className="relative mt-auto pt-6">
        <span className="tabular font-display text-[30px] leading-none font-extrabold tracking-[-0.045em] text-ink">
          {formatCents(pot.balanceCents)}
        </span>
        <div className="tabular mt-1.5 truncate text-[12px] font-medium text-ink-2/70">
          left · {formatCents(pot.spentMonthCents)} of {formatCents(pot.monthlyBudgetCents)} spent
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/60">
          <div
            className={cn("h-full rounded-full transition-[width,background-color] duration-700", selected ? "bg-ink" : "bg-ink/45")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
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
  const [editing, setEditing] = useState(!pot.rulesText && pot.rules.length === 0);
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
      <div className="flex items-start justify-between gap-4 px-6 pt-5">
        <div className="flex min-w-0 items-start gap-2.5">
          <PotIcon pot={pot} size={24} />
          <div className="min-w-0">
            <div className="font-display text-[16px] leading-6 font-bold tracking-[-0.02em] text-ink">{pot.name} rules</div>
            <div className="text-[13px] leading-snug text-faint">Your words on top. Below, the rules Plex actually enforces.</div>
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
      <div className="px-6 pt-5">
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
        ) : !pot.rulesText ? (
          <p className="text-[14px] leading-relaxed text-muted">
            No limits yet. Agents can spend up to what&apos;s left in this pot. Choose Edit to write your limits.
          </p>
        ) : (
          <figure>
            <figcaption className="text-[12px] font-medium text-faint">In your words</figcaption>
            <blockquote className="relative mt-2 font-display text-[24px] leading-[1.3] font-bold tracking-[-0.03em] text-pretty text-ink sm:text-[28px]">
              <span className="text-green-500">&ldquo;</span>
              {pot.rulesText}
              <span className="text-green-500">&rdquo;</span>
            </blockquote>
          </figure>
        )}
      </div>

      {/* Enforced as */}
      <div className="flex items-center justify-between gap-3 px-6 pt-7">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold whitespace-nowrap text-ink">
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
      <ul className="mt-2 space-y-0.5 px-2 pb-4">
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
          <li className="mx-2 my-1 rounded-[12px] bg-sunken/60 px-4 py-4 text-[13px] text-muted">
            No limits found. Name an amount and a period, like “up to $40 a day”.
          </li>
        )}
      </ul>

      {proposal?.unparsed.length ? (
        <div className="mx-4 mb-4 rounded-[14px] bg-sunken/60 px-4 py-3">
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
        <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-steel-50 px-4 py-3.5">
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
      {error ? <div className="px-6 pb-4 text-[13px] text-disputed">{error}</div> : null}
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
    text: "text-green-300",
  },
  needs_approval: {
    label: "Needs your OK",
    sub: "The agent stops and asks you, because of",
    icon: CircleAlert,
    text: "text-steel-200",
  },
  deny: {
    label: "Blocked",
    sub: "No money moves, because of",
    icon: CircleX,
    text: "text-[color-mix(in_oklab,var(--color-disputed)_45%,white)]",
  },
};

const GLASS =
  "rounded-full bg-white/[0.08] px-2.5 py-1 text-[11.5px] font-medium text-white/60 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]";

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
          <AiAgentIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" strokeWidth={1.9} />
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
            <div className="flex h-[264px] flex-col items-center justify-center rounded-xl bg-sunken/60 px-4 text-center text-[13px] text-muted">
              Include an amount, like &ldquo;$60&rdquo;.
            </div>
          ) : !outcome || !result ? (
            <Skeleton className="h-[264px] w-full rounded-xl" />
          ) : (
            <div className="spotlight flex min-h-[264px] flex-col rounded-xl p-5">
              <div className="flex items-center justify-between gap-3">
                <div className={cn("flex items-center gap-2", outcome.text)}>
                  <outcome.icon className="size-5" strokeWidth={2} />
                  <span className="font-display text-[22px] leading-none font-bold tracking-[-0.025em]">{outcome.label}</span>
                </div>
                <span className={GLASS}>evaluate()</span>
              </div>
              <span className="tabular mt-4 inline-flex items-start font-display text-[44px] leading-none font-extrabold tracking-[-0.045em] text-white">
                <span className="mt-[0.18em] mr-1 text-[0.42em] font-bold text-white/45">$</span>
                {formatCents(sample.amountCents).replace("$", "")}
              </span>
              <div className="mt-4 text-[12.5px] text-white/55">{outcome.sub}</div>
              <div className="mt-0.5 text-[14.5px] font-medium leading-snug text-white">{result.ruleText}</div>
              <dl className="mt-auto grid grid-cols-2 gap-x-6 gap-y-3 pt-5">
                {facts.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[11.5px] text-white/45">{k}</dt>
                    <dd className="mt-0.5 truncate text-[13.5px] font-medium text-white/90">{v}</dd>
                  </div>
                ))}
              </dl>
              {paused ? (
                <div className="mt-4 text-[12.5px] font-medium text-refunded-bg">Spending is paused, so every check is blocked.</div>
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
    <Card className="mt-4">
      <CardHeader
        title="Approvals"
        description="Purchases a rule sent to you, and what you decided."
        action={pending?.length ? <Badge tone="steel">{pending.length} waiting</Badge> : null}
      />
      <div className="grid gap-6 p-4 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Waiting */}
        <div className="min-w-0">
          <div className="mb-2.5 px-2 text-[12.5px] font-medium text-muted">Waiting for you</div>
          {pending === undefined ? (
            <Skeleton className="h-[220px] w-full rounded-[14px]" />
          ) : pending.length ? (
            <div className="space-y-3">
              {pending.map((a) => {
                const p = pot(a.potId);
                return (
                  <div key={a._id} className="rounded-[16px] bg-sunken/60">
                    <div className="flex items-center gap-2 px-4 pt-4 text-[12px] font-medium text-muted">
                      <AiAgentIcon className="size-4 flex-none" strokeWidth={1.9} />
                      <span className="truncate">{a.agentLabel} wants to buy</span>
                      <span className="ml-auto flex-none text-faint">{relativeTime(a._creationTime)}</span>
                    </div>
                    <div className="px-4 pt-2 pb-4">
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
                        <Amount cents={a.amountCents} size="lg" className="flex-none text-[30px]" />
                      </div>
                      <div className="mt-3 flex items-start gap-2 rounded-[12px] bg-steel-50 px-3 py-2.5 text-[12.5px] leading-snug text-steel-700">
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
              className="rounded-[16px] bg-sunken/50 py-8"
            />
          )}
        </div>

        {/* History */}
        <div className="flex min-w-0 flex-col">
          <div className="mb-1.5 flex items-center justify-between px-2">
            <span className="text-[12.5px] font-medium text-muted">History</span>
            {history?.length ? <span className="text-[12px] text-faint">Approved ones open their receipt</span> : null}
          </div>
          {history === undefined ? (
            <div className="space-y-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                  <Skeleton className="size-5 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-14" />
                </div>
              ))}
            </div>
          ) : history.length ? (
            <ul>
              {history.map((a) => {
                const approved = a.status === "approved";
                const row = (
                  <div className="grid grid-cols-[20px_minmax(0,1fr)_auto_14px] items-center gap-4 rounded-[12px] px-3 py-3 transition-colors group-hover:bg-sunken/70">
                    {approved ? (
                      <Check className="size-5 text-green-700" strokeWidth={2.2} />
                    ) : (
                      <X className="size-5 text-faint" strokeWidth={2.2} />
                    )}
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
                        className="group block rounded-[12px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200"
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
            <div className="flex flex-1 items-center justify-center rounded-[16px] bg-sunken/50 px-4 py-6 text-center text-[13px] text-muted">
              Nothing decided yet. What you approve or decline lands here.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
