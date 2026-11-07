"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  ArrowUp,
  Check,
  CornerDownRight,
  Eye,
  History,
  Laptop,
  Pin,
  PinOff,
  Radar,
  TextSearch,
  TriangleAlert,
  X,
} from "lucide-react";
import type { LedgerRole, WidgetSpec } from "@plex/backend/lib/ledgerSpec";
import { api, type Doc, type Id } from "@/lib/convex";
import type { Receipt } from "@/components/receipt/receipt";
import { Badge, Card, CardHeader, SectionHeading, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WidgetBody } from "./widget";
import { Chip, WidgetFrame } from "./kit";

export interface WidgetHost {
  receipts: Receipt[];
  now: number;
  role: LedgerRole;
  onOpen: (r: Receipt) => void;
  requested: Record<string, string>;
  selectedId: string | null;
}

// ── A widget in a card ───────────────────────────────────────────────────────

export function WidgetCard({
  spec,
  host,
  from,
  pinnedId,
  askId,
  className,
}: {
  spec: WidgetSpec;
  host: WidgetHost;
  /** Where it came from: the question, or "Watchdog". */
  from?: string;
  pinnedId?: Id<"ledgerWidgets">;
  askId?: Id<"ledgerAsks">;
  className?: string;
}) {
  const pin = useMutation(api.ledger.pin);
  const unpin = useMutation(api.ledger.unpin);
  const [pinned, setPinned] = useState(false);
  return (
    <WidgetFrame
      className={className}
      title={spec.title}
      description={spec.subtitle ?? (from === "Watchdog" ? "Flagged by Watchdog" : from ? `From “${from}”` : undefined)}
      flush={spec.kind === "grid"}
      action={
        pinnedId ? (
          <Button variant="ghost" size="sm" onClick={() => unpin({ id: pinnedId })} aria-label="Unpin" className="-mr-2 text-muted">
            <PinOff />
            <span className="hidden sm:inline">Unpin</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={pinned}
            className="-mr-2 text-muted disabled:opacity-100"
            onClick={async () => {
              await pin({ role: host.role, spec, askId });
              setPinned(true);
            }}
          >
            {pinned ? <Check className="text-green-700" /> : <Pin />}
            {pinned ? "Pinned" : "Pin"}
          </Button>
        )
      }
    >
      <WidgetBody
        spec={spec}
        receipts={host.receipts}
        now={host.now}
        onOpen={host.onOpen}
        requested={host.requested}
        selectedId={host.selectedId}
      />
    </WidgetFrame>
  );
}

/** Charts and stats side by side, grids full width below. */
function Widgets({ specs, host, from, askId }: { specs: WidgetSpec[]; host: WidgetHost; from?: string; askId?: Id<"ledgerAsks"> }) {
  const small = specs.filter((s) => s.kind !== "grid");
  const grids = specs.filter((s) => s.kind === "grid");
  return (
    <div className="grid grid-cols-1 gap-4">
      {small.length ? (
        <div className={cn("grid grid-cols-1 gap-4", small.length > 1 && "lg:grid-cols-2")}>
          {small.map((s, i) => (
            <WidgetCard key={i} spec={s} host={host} from={from} askId={askId} />
          ))}
        </div>
      ) : null}
      {grids.map((s, i) => (
        <WidgetCard key={`g${i}`} spec={s} host={host} from={from} askId={askId} />
      ))}
    </div>
  );
}

// ── Ask the Ledger ───────────────────────────────────────────────────────────

const VIA_LABEL = { web: null, mcp: "From an agent over MCP" } as const;

export function Analyst({ host, featured, onClearFeatured }: {
  host: WidgetHost;
  featured: { title: string; spec: WidgetSpec } | null;
  onClearFeatured: () => void;
}) {
  const asks = useQuery(api.ledger.asks, { role: host.role });
  const questions = useQuery(api.ledger.demoQuestions, { role: host.role });
  const ask = useMutation(api.ledger.ask);
  const [text, setText] = useState("");
  const [activeId, setActiveId] = useState<Id<"ledgerAsks"> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A new ask (from here or over MCP) takes over the canvas.
  const latest = asks?.[0];
  const lastSeen = useRef<string | null>(null);
  useEffect(() => {
    if (latest && latest._id !== lastSeen.current) {
      if (lastSeen.current !== null) {
        setActiveId(latest._id);
        onClearFeatured();
      }
      lastSeen.current = latest._id;
    }
  }, [latest, onClearFeatured]);

  // "/" jumps to the ask box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active: Doc<"ledgerAsks"> | undefined = asks?.find((a) => a._id === activeId);
  const earlier = asks ? asks.filter((a, i) => asks.findIndex((b) => b.question === a.question) === i).slice(0, 4) : [];

  const submit = async (q: string) => {
    const question = q.trim();
    if (!question) return;
    setText("");
    const id = await ask({ role: host.role, question });
    setActiveId(id);
    onClearFeatured();
  };

  return (
    <section aria-label="Ask the Ledger" className="space-y-4">
      {/* The screen's focal object is the question you ask */}
      <Card className="@container p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <div className="flex items-center gap-2 font-medium text-ink-2">
            <TextSearch className="size-[18px] text-green-700" strokeWidth={1.9} aria-hidden />
            Plex Analyst
          </div>
          <span className="tabular text-faint">Reads {host.receipts.length} receipts</span>
        </div>
        <h2 className="mt-5 max-w-2xl font-display text-[30px] leading-[1.08] font-extrabold tracking-[-0.04em] text-balance text-ink @[640px]:text-[40px]">
          Ask your money anything.
        </h2>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
          The Analyst reads every receipt and builds the view. Pin what you want to keep.
        </p>

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(text);
          }}
        >
          <label
            htmlFor="ledger-ask"
            className={cn(
              "flex h-[60px] min-w-0 cursor-text items-center gap-3 rounded-[18px] bg-sunken/70 pr-2 pl-5 transition-[box-shadow,background-color] duration-200 hover:bg-sunken",
              "focus-within:bg-surface focus-within:shadow-[inset_0_0_0_1px_var(--color-green-500),0_0_0_4px_var(--color-green-100)]",
            )}
          >
            <span className="sr-only">Ask the Ledger</span>
            <input
              id="ledger-ask"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What did my agents buy this week?"
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium text-ink placeholder:text-faint focus:outline-none sm:text-[17px]"
              autoComplete="off"
            />
            {text ? null : (
              <kbd className="hidden h-6 min-w-6 items-center justify-center rounded-[7px] bg-surface px-1.5 font-sans text-[12px] text-muted shadow-[inset_0_0_0_1px_var(--color-line)] sm:inline-flex">/</kbd>
            )}
            <button
              type="submit"
              disabled={!text.trim()}
              aria-label="Ask"
              className="flex size-11 flex-none items-center justify-center rounded-[14px] bg-ink text-surface transition-[opacity,transform] hover:scale-[1.03] disabled:opacity-25 disabled:hover:scale-100 focus-visible:ring-[3px] focus-visible:ring-green-200 focus-visible:outline-none"
            >
              <ArrowUp className="size-5" strokeWidth={2.2} />
            </button>
          </label>
        </form>

        <div className="mt-5 flex flex-wrap gap-2">
          {questions === undefined
            ? ["w-40", "w-32", "w-44"].map((w) => <Skeleton key={w} className={cn("h-8 flex-none rounded-full", w)} />)
            : questions.map((q) => (
                <Chip key={q} onClick={() => void submit(q)}>
                  {q}
                </Chip>
              ))}
        </div>

        {!featured && !active && earlier.length ? (
          <div className="mt-6 flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
            <span className="flex flex-none items-center gap-1.5 text-[12px] font-medium text-faint">
              <History className="size-3.5" strokeWidth={1.9} />
              Earlier
            </span>
            {earlier.map((a) => (
              <button
                key={a._id}
                type="button"
                onClick={() => setActiveId(a._id)}
                title={a.question}
                className="max-w-[280px] flex-none truncate rounded-full px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:bg-sunken hover:text-ink focus-visible:bg-sunken focus-visible:outline-none"
              >
                {a.question}
              </button>
            ))}
          </div>
        ) : null}
      </Card>

      {featured ? (
        <div className="animate-rise space-y-4">
          <AnswerHead label="Watchdog" text={featured.title} onClose={onClearFeatured} />
          <Widgets specs={[featured.spec]} host={host} from="Watchdog" />
        </div>
      ) : active ? (
        <div key={active._id} className="animate-rise space-y-4">
          <AnswerHead
            question={active.question}
            via={VIA_LABEL[active.via]}
            label="Plex Analyst"
            text={active.status === "thinking" ? null : (active.answer ?? "")}
            note={active.engine === "heuristic" ? (active.engineNote ?? "Deterministic parser") : active.engine === "gemini" ? "Gemini · structured output" : undefined}
            error={active.status === "error"}
            count={host.receipts.length}
            followUps={active.followUps}
            onFollowUp={(f) => void submit(f)}
            onClose={() => setActiveId(null)}
          />
          {active.status === "done" && active.widgets ? (
            <Widgets specs={active.widgets} host={host} from={active.question} askId={active._id} />
          ) : active.status === "thinking" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Skeleton className="h-[300px] w-full rounded-lg" />
              <Skeleton className="h-[300px] w-full rounded-lg" />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function AnswerHead({
  question,
  via,
  label,
  text,
  note,
  error,
  count,
  followUps,
  onFollowUp,
  onClose,
}: {
  question?: string;
  via?: string | null;
  label: string;
  text: string | null;
  note?: string;
  error?: boolean;
  count?: number;
  followUps?: string[];
  onFollowUp?: (q: string) => void;
  onClose: () => void;
}) {
  const watchdog = label === "Watchdog";
  return (
    <Card className="p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span className={cn("flex items-center gap-2 font-semibold", watchdog ? "text-steel-700" : "text-green-700")}>
            {watchdog ? <Radar className="size-[18px]" strokeWidth={1.9} /> : <TextSearch className="size-[18px]" strokeWidth={1.9} />}
            {label}
          </span>
          {question ? (
            <span className="flex min-w-0 items-center gap-1.5 text-muted">
              <span className="text-line-strong">·</span>
              {via ? <Laptop className="size-4 flex-none text-steel-600" strokeWidth={1.9} aria-label={via} /> : null}
              <span className="truncate">“{question}”</span>
            </span>
          ) : null}
        </div>
        <div className="flex flex-none items-center gap-2">
          {note ? (
            <Badge tone="neutral" className="hidden text-muted md:inline-flex">
              {note}
            </Badge>
          ) : null}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Dismiss answer" className="-mt-1 -mr-2 text-faint">
            <X />
          </Button>
        </div>
      </div>
      {text === null ? (
        <div className="mt-4 space-y-3" aria-live="polite">
          <div className="text-[14px] text-muted">Reading {count ?? "your"} receipts…</div>
          <Skeleton className="h-5 w-[78%] rounded-full" />
          <Skeleton className="h-5 w-[52%] rounded-full" />
        </div>
      ) : (
        <p
          className={cn(
            "mt-3 max-w-4xl font-display text-[20px] leading-[1.4] font-bold tracking-[-0.02em] text-pretty sm:text-[22px]",
            error ? "text-disputed" : "text-ink",
          )}
        >
          {text}
        </p>
      )}
      {followUps?.length && onFollowUp ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <CornerDownRight className="size-4 flex-none text-faint" strokeWidth={1.9} aria-hidden />
          {followUps.map((f) => (
            <Chip key={f} onClick={() => onFollowUp(f)}>
              {f}
            </Chip>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

// ── Pinned ───────────────────────────────────────────────────────────────────

export function PinnedWidgets({ host }: { host: WidgetHost }) {
  const pinned = useQuery(api.ledger.pinned, { role: host.role });
  if (!pinned?.length) return null;
  const small = pinned.filter((p) => p.spec.kind !== "grid");
  const grids = pinned.filter((p) => p.spec.kind === "grid");
  return (
    <section aria-label="Pinned">
      <SectionHeading title="Pinned by you" description="Views you kept from the Analyst. They stay live as receipts land." />
      <div className="space-y-4">
        {small.length ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {small.map((p) => (
              <WidgetCard key={p._id} spec={p.spec} host={host} from={p.question} pinnedId={p._id} />
            ))}
          </div>
        ) : null}
        {grids.map((p) => (
          <WidgetCard key={p._id} spec={p.spec} host={host} from={p.question} pinnedId={p._id} />
        ))}
      </div>
    </section>
  );
}

// ── Watchdog ─────────────────────────────────────────────────────────────────

export function Watchdog({ role, onShow }: { role: LedgerRole; onShow: (a: { title: string; spec: WidgetSpec }) => void }) {
  const alerts = useQuery(api.ledger.watchdog, { role });
  if (!alerts?.length) return null;
  const warnings = alerts.filter((a) => a.severity === "warning").length;
  return (
    <Card role="region" aria-label="Watchdog">
      <CardHeader
        title="Watchdog"
        description="Plex reads every receipt and flags what you'd want to know."
        action={
          <Badge tone={warnings ? "amber" : "outline"} className="tabular">
            {warnings ? `${warnings} to look at` : `${alerts.length} notes`}
          </Badge>
        }
      />
      <ul className="px-2 pt-3 pb-2">
        {alerts.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onShow({ title: a.title, spec: a.spec })}
              className="group grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3.5 rounded-[12px] px-4 py-3.5 text-left transition-colors hover:bg-sunken/70 focus-visible:ring-[3px] focus-visible:ring-green-200 focus-visible:outline-none"
            >
              {a.severity === "warning" ? (
                <TriangleAlert className="mt-px size-5 text-refunded" strokeWidth={1.8} />
              ) : (
                <Eye className="mt-px size-5 text-steel-600" strokeWidth={1.8} />
              )}
              <span className="min-w-0">
                <span className="line-clamp-2 block text-[14px] leading-snug font-semibold text-ink sm:truncate">{a.title}</span>
                <span className="mt-1 line-clamp-2 block text-[12.5px] leading-snug text-muted sm:truncate" title={a.detail}>
                  {a.detail}
                </span>
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[12.5px] font-medium text-muted transition-colors group-hover:text-ink">
                <span className="hidden sm:inline">Show me</span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.9} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
