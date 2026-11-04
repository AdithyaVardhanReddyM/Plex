"use client";

import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Check, Info, Lock, Minus, Plus, ShieldCheck } from "lucide-react";
import { api, type Id } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { cn, formatCents } from "@/lib/utils";
import { CauseCover, windowLabel } from "./parts";

export type CausePage = NonNullable<FunctionReturnType<typeof api.causes.bySlug>>;
type Mode = "shift" | "once" | "split";

const ONCE_CHIPS = [1_500, 4_500, 9_000, 18_000];

function parseDollars(s: string) {
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Splits `total` cents evenly; the remainder goes to the first causes. */
function evenSplit(total: number, n: number) {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0));
}

export function DonatePanel({
  data,
  selectedTaskId,
  onSelectTask,
  cancelled,
}: {
  data: CausePage;
  selectedTaskId: Id<"tasks"> | null;
  onSelectTask: (id: Id<"tasks">) => void;
  cancelled?: boolean;
}) {
  const viewer = useQuery(api.users.viewer);
  const splitOptions = useQuery(api.causes.splitOptions);
  const start = useAction(api.donations.start);

  const fundable = data.tasks.filter((t) => t.open && t.fundedCents < t.costCents && ["open", "assigned"].includes(t.status));
  const [mode, setMode] = useState<Mode>(fundable.length ? "shift" : "once");
  const task = fundable.find((t) => t._id === selectedTaskId) ?? fundable[0] ?? null;
  const [shifts, setShifts] = useState(1);
  const [onceCents, setOnceCents] = useState(data.unit?.cents ?? 4_500);
  const [custom, setCustom] = useState("");
  const [splitTotal, setSplitTotal] = useState(9_000);
  const [splitIds, setSplitIds] = useState<Id<"causes">[] | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = task ? task.costCents - task.fundedCents : 0;
  const maxShifts = task ? Math.max(1, Math.ceil(remaining / task.perSpotCents)) : 1;
  const shiftCount = Math.min(shifts, maxShifts);
  const shiftCents = task ? Math.min(shiftCount * task.perSpotCents, remaining) : 0;

  const chosenSplit = splitIds ?? (splitOptions ? splitOptions.map((c) => c._id) : []);
  const splitAmounts = evenSplit(splitTotal, Math.max(1, chosenSplit.length));

  const allocations: Array<{ causeId: Id<"causes">; taskId?: Id<"tasks">; amountCents: number }> =
    mode === "shift" && task
      ? [{ causeId: data.cause._id, taskId: task._id, amountCents: shiftCents }]
      : mode === "once"
        ? [{ causeId: data.cause._id, amountCents: onceCents }]
        : chosenSplit.map((causeId, i) => ({ causeId, amountCents: splitAmounts[i]! }));
  const total = allocations.reduce((s, a) => s + a.amountCents, 0);
  const tooSmall = allocations.some((a) => a.amountCents < 100);

  const defaultName = viewer ? shortName(viewer.name) : "";
  const shownName = name ?? defaultName;

  async function donate() {
    setBusy(true);
    setError(null);
    try {
      const { approvalUrl } = await start({
        returnSlug: data.cause.slug,
        origin: window.location.origin,
        allocations,
        donorLabel: shownName,
        anonymous,
        message: message.trim() || undefined,
      });
      window.location.assign(approvalUrl);
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "Something went wrong reaching PayPal. Try again.");
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden shadow-raised">
      <div className="px-5 pt-5">
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Donate</div>
        <div className="mt-0.5 text-[13px] text-muted">
          {data.unit ? (
            <>
              <span className="tabular font-medium text-ink-2">{formatCents(data.unit.cents)}</span> {data.unit.label}.
            </>
          ) : (
            "Every dollar comes back with a receipt."
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-sm bg-sunken p-1" role="tablist" aria-label="How to give">
          {(
            [
              ["shift", "Fund a shift"],
              ["once", "Give once"],
              ["split", "Split"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              disabled={m === "shift" && !fundable.length}
              onClick={() => setMode(m)}
              className={cn(
                "h-8 rounded-[6px] text-[13px] font-medium transition-[background-color,color,box-shadow] disabled:opacity-40",
                mode === m ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-4">
        {mode === "shift" && task ? (
          <div className="space-y-3">
            <div className="space-y-1.5" role="radiogroup" aria-label="Shift">
              {fundable.map((t) => {
                const on = t._id === task._id;
                return (
                  <button
                    key={t._id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      onSelectTask(t._id);
                      setShifts(1);
                    }}
                    className={cn(
                      "grid w-full grid-cols-[18px_minmax(0,1fr)] gap-2.5 rounded-md px-3 py-2.5 text-left ring-1 ring-inset transition-colors",
                      on ? "bg-surface ring-ink/80" : "ring-line hover:bg-canvas",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-[18px] items-center justify-center rounded-full ring-1 ring-inset",
                        on ? "bg-ink text-white ring-ink" : "ring-line-strong",
                      )}
                    >
                      {on ? <Check className="size-3" strokeWidth={2.6} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium leading-snug text-ink">{t.title}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                        {windowLabel(t.windowStart, t.windowEnd)}
                      </span>
                      <span className="tabular mt-0.5 block text-[12.5px] leading-snug text-muted">
                        {formatCents(t.perSpotCents)} a person · {formatCents(t.costCents - t.fundedCents)} still needed
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-canvas px-3 py-2 ring-1 ring-inset ring-line">
              <div className="text-[13px] text-ink-2">
                People you pay for
                <div className="text-[12px] text-faint">{formatCents(task.perSpotCents)} each</div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="One fewer"
                  disabled={shiftCount <= 1}
                  onClick={() => setShifts(Math.max(1, shiftCount - 1))}
                >
                  <Minus />
                </Button>
                <span className="tabular w-6 text-center text-[15px] font-semibold text-ink">{shiftCount}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="One more"
                  disabled={shiftCount >= maxShifts}
                  onClick={() => setShifts(Math.min(maxShifts, shiftCount + 1))}
                >
                  <Plus />
                </Button>
              </div>
            </div>
            <p className="flex gap-2 text-[12.5px] leading-relaxed text-steel-700">
              <Lock className="mt-0.5 size-3.5 flex-none" strokeWidth={1.9} />
              Plex holds it until the shift&apos;s proof passes, then pays the workers. You get the photos.
            </p>
          </div>
        ) : null}

        {mode === "once" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-1.5">
              {ONCE_CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setOnceCents(c);
                    setCustom("");
                  }}
                  className={cn(
                    "tabular h-10 rounded-sm text-[14px] font-semibold ring-1 ring-inset transition-colors",
                    onceCents === c && !custom ? "bg-ink text-white ring-ink" : "bg-surface text-ink ring-line hover:bg-canvas",
                  )}
                >
                  {formatCents(c)}
                </button>
              ))}
            </div>
            <div>
              <Label htmlFor="custom-amount">Other amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-faint">$</span>
                <Input
                  id="custom-amount"
                  inputMode="decimal"
                  placeholder="25"
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    setOnceCents(parseDollars(e.target.value));
                  }}
                  className="pl-6 tabular"
                />
              </div>
            </div>
            {data.unit && onceCents >= data.unit.cents ? (
              <p className="text-[12.5px] leading-relaxed text-muted">
                That&apos;s {Math.floor(onceCents / data.unit.cents) === 1 ? "one shift" : `${Math.floor(onceCents / data.unit.cents)} shifts`} of paid local work.{" "}
                {data.org.name} assigns it to the next shift that needs it.
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === "split" ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="split-total">Total</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-faint">$</span>
                <Input
                  id="split-total"
                  inputMode="decimal"
                  defaultValue={(splitTotal / 100).toString()}
                  onChange={(e) => setSplitTotal(parseDollars(e.target.value))}
                  className="pl-6 tabular"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              {(splitOptions ?? []).map((c) => {
                const on = chosenSplit.includes(c._id);
                const idx = chosenSplit.indexOf(c._id);
                return (
                  <label
                    key={c._id}
                    className={cn(
                      "grid cursor-pointer grid-cols-[18px_28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-3 py-2 ring-1 ring-inset transition-colors",
                      on ? "bg-surface ring-line-strong" : "ring-line hover:bg-canvas",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-ink)]"
                      checked={on}
                      onChange={() =>
                        setSplitIds(on ? chosenSplit.filter((x) => x !== c._id) : [...chosenSplit, c._id])
                      }
                    />
                    <CauseCover hue={c.coverHue} className="size-7 rounded-[6px]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">{c.name}</span>
                      <span className="block truncate text-[12px] text-muted">{c.orgName}</span>
                    </span>
                    <span className={cn("tabular text-[13px] font-semibold", on ? "text-ink" : "text-faint")}>
                      {on ? formatCents(splitAmounts[idx]!) : "—"}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-[12.5px] leading-relaxed text-muted">One PayPal payment, split evenly. Each cause gets its own receipt.</p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-3 border-t border-line px-5 pt-4">
        <div>
          <Label htmlFor="donor-name">Name on the donor wall</Label>
          <Input
            id="donor-name"
            value={anonymous ? "Anonymous" : shownName}
            disabled={anonymous}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
          />
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-ink)]"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            Give anonymously
          </label>
        </div>
        <div>
          <Label htmlFor="donor-why">Why you&apos;re giving <span className="font-normal text-faint">(optional, goes on your receipt)</span></Label>
          <Textarea
            id="donor-why"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={280}
            placeholder="I walk this shore every morning."
            className="min-h-16"
          />
        </div>
      </div>

      <div className="px-5 pt-4 pb-5">
        {cancelled && !error ? (
          <p className="mb-3 flex gap-2 rounded-sm bg-sunken px-3 py-2 text-[12.5px] text-ink-2">
            <Info className="mt-0.5 size-3.5 flex-none text-muted" strokeWidth={1.9} />
            You cancelled at PayPal. Nothing was charged.
          </p>
        ) : null}
        {error ? (
          <p className="mb-3 rounded-sm bg-disputed-bg px-3 py-2 text-[12.5px] leading-relaxed text-disputed" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          variant="brand"
          size="lg"
          className="w-full"
          disabled={busy || total < 100 || tooSmall || (mode === "split" && chosenSplit.length === 0)}
          onClick={donate}
        >
          {busy ? "Opening PayPal…" : `Donate ${formatCents(total)} with PayPal`}
        </Button>
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[12px] text-faint">
          <ShieldCheck className="size-3.5" strokeWidth={1.9} />
          PayPal sandbox · test money · every gift gets a receipt
        </p>
      </div>
    </Card>
  );
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : name;
}
