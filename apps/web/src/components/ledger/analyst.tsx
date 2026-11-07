"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowUp, Bell, Eye, Laptop, MessageSquareText, Pin, PinOff, TriangleAlert } from "lucide-react";
import type { LedgerRole, WidgetSpec } from "@plex/backend/lib/ledgerSpec";
import { api, type Doc, type Id } from "@/lib/convex";
import type { Receipt } from "@/components/receipt/receipt";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WidgetBody } from "./widget";

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
    <Card className={cn("flex min-w-0 flex-col overflow-hidden", className)}>
      <CardHeader
        title={spec.title}
        description={spec.subtitle ?? (from === "Watchdog" ? "Flagged by Watchdog" : from ? `From “${from}”` : undefined)}
        action={
          pinnedId ? (
            <Button variant="ghost" size="sm" onClick={() => unpin({ id: pinnedId })} aria-label="Unpin">
              <PinOff />
              <span className="hidden sm:inline">Unpin</span>
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={pinned}
              onClick={async () => {
                await pin({ role: host.role, spec, askId });
                setPinned(true);
              }}
            >
              <Pin />
              {pinned ? "Pinned" : "Pin"}
            </Button>
          )
        }
      />
      <div className={cn("min-w-0 flex-1", spec.kind === "grid" ? "mt-3 border-t border-line" : "mt-2")}>
        <WidgetBody
          spec={spec}
          receipts={host.receipts}
          now={host.now}
          onOpen={host.onOpen}
          requested={host.requested}
          selectedId={host.selectedId}
        />
      </div>
    </Card>
  );
}

/** Charts and stats side by side, grids full width below. */
function Widgets({ specs, host, from, askId }: { specs: WidgetSpec[]; host: WidgetHost; from?: string; askId?: Id<"ledgerAsks"> }) {
  const small = specs.filter((s) => s.kind !== "grid");
  const grids = specs.filter((s) => s.kind === "grid");
  return (
    <div className="grid grid-cols-1 gap-3">
      {small.length ? (
        <div className={cn("grid grid-cols-1 gap-3", small.length > 1 && "lg:grid-cols-2")}>
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

export function Analyst({ host, spotlight, onClearSpotlight }: {
  host: WidgetHost;
  spotlight: { title: string; spec: WidgetSpec } | null;
  onClearSpotlight: () => void;
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
        onClearSpotlight();
      }
      lastSeen.current = latest._id;
    }
  }, [latest, onClearSpotlight]);

  const active: Doc<"ledgerAsks"> | undefined = asks?.find((a) => a._id === activeId);

  const submit = async (q: string) => {
    const question = q.trim();
    if (!question) return;
    setText("");
    const id = await ask({ role: host.role, question });
    setActiveId(id);
    onClearSpotlight();
  };

  return (
    <section aria-label="Ask the Ledger" className="space-y-3">
      <Card className="p-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(text);
          }}
        >
          <MessageSquareText size={16} strokeWidth={1.9} className="ml-2.5 flex-none text-faint" />
          <label htmlFor="ledger-ask" className="sr-only">
            Ask the Ledger
          </label>
          <input
            id="ledger-ask"
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask the Ledger about your money"
            className="h-10 min-w-0 flex-1 bg-transparent text-[14.5px] text-ink placeholder:text-faint focus:outline-none"
            autoComplete="off"
          />
          <Button type="submit" size="icon" disabled={!text.trim()} aria-label="Ask">
            <ArrowUp />
          </Button>
        </form>
        <div className="flex gap-1.5 overflow-x-auto px-1.5 pt-1.5 pb-1 [scrollbar-width:none]">
          {(questions ?? []).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void submit(q)}
              className="h-7 flex-none rounded-full border border-line bg-surface px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:bg-canvas"
            >
              {q}
            </button>
          ))}
        </div>
      </Card>

      {spotlight ? (
        <div className="animate-rise space-y-3">
          <AnswerHead label="Watchdog" text={spotlight.title} />
          <Widgets specs={[spotlight.spec]} host={host} from="Watchdog" />
        </div>
      ) : active ? (
        <div key={active._id} className="animate-rise space-y-3">
          <AnswerHead
            question={active.question}
            via={VIA_LABEL[active.via]}
            label="Plex Analyst"
            text={active.status === "thinking" ? null : (active.answer ?? "")}
            note={active.engine === "heuristic" ? (active.engineNote ?? "Deterministic parser") : active.engine === "gemini" ? "Gemini · structured output" : undefined}
            error={active.status === "error"}
            count={host.receipts.length}
          />
          {active.status === "done" && active.widgets ? (
            <Widgets specs={active.widgets} host={host} from={active.question} askId={active._id} />
          ) : active.status === "thinking" ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Skeleton className="h-64 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          ) : null}
          {active.followUps?.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12.5px] text-faint">Next</span>
              {active.followUps.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => void submit(f)}
                  className="h-7 rounded-full bg-sunken px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-line"
                >
                  {f}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : asks && asks.length ? (
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <span className="mr-1 flex-none text-[12.5px] text-faint">Earlier</span>
          {asks.filter((a, i) => asks.findIndex((b) => b.question === a.question) === i).slice(0, 4).map((a) => (
            <button
              key={a._id}
              type="button"
              onClick={() => setActiveId(a._id)}
              className="h-7 max-w-[260px] flex-none truncate rounded-full bg-sunken px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-line"
            >
              {a.question}
            </button>
          ))}
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
}: {
  question?: string;
  via?: string | null;
  label: string;
  text: string | null;
  note?: string;
  error?: boolean;
  count?: number;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4 shadow-card">
      {question ? (
        <div className="flex items-center gap-2 text-[13px] text-muted">
          {via ? <Laptop size={14} strokeWidth={1.9} className="text-steel-600" /> : null}
          <span className="truncate">
            {via ? `${via}: ` : ""}“{question}”
          </span>
        </div>
      ) : null}
      <div className={cn("flex items-baseline justify-between gap-3", question && "mt-2.5")}>
        <div className="text-[12px] font-semibold tracking-[0.01em] text-green-700">{label}</div>
        {note ? <div className="truncate text-[11.5px] text-faint">{note}</div> : null}
      </div>
      {text === null ? (
        <div className="mt-1.5 flex items-center gap-2 text-[14.5px] text-muted">
          <span className="size-1.5 animate-pulse rounded-full bg-green-500" />
          Reading {count ?? "your"} receipts…
        </div>
      ) : (
        <p className={cn("mt-1 text-[15px] leading-relaxed", error ? "text-disputed" : "text-ink")}>{text}</p>
      )}
    </div>
  );
}

// ── Pinned ───────────────────────────────────────────────────────────────────

export function PinnedWidgets({ host }: { host: WidgetHost }) {
  const pinned = useQuery(api.ledger.pinned, { role: host.role });
  if (!pinned?.length) return null;
  const small = pinned.filter((p) => p.spec.kind !== "grid");
  const grids = pinned.filter((p) => p.spec.kind === "grid");
  return (
    <section aria-label="Pinned" className="space-y-3">
      <SectionTitle icon={<Pin size={14} strokeWidth={1.9} />}>Pinned by you</SectionTitle>
      {small.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {small.map((p) => (
            <WidgetCard key={p._id} spec={p.spec} host={host} from={p.question} pinnedId={p._id} />
          ))}
        </div>
      ) : null}
      {grids.map((p) => (
        <WidgetCard key={p._id} spec={p.spec} host={host} from={p.question} pinnedId={p._id} />
      ))}
    </section>
  );
}

// ── Watchdog ─────────────────────────────────────────────────────────────────

export function Watchdog({ role, onShow }: { role: LedgerRole; onShow: (a: { title: string; spec: WidgetSpec }) => void }) {
  const alerts = useQuery(api.ledger.watchdog, { role });
  if (!alerts?.length) return null;
  return (
    <section aria-label="Watchdog" className="space-y-2">
      <SectionTitle icon={<Bell size={14} strokeWidth={1.9} />}>Watchdog</SectionTitle>
      <Card className="divide-y divide-line">
        {alerts.map((a) => (
          <div key={a.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3.5 sm:grid-cols-[28px_minmax(0,1fr)_auto] sm:items-center">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full sm:self-start",
                a.severity === "warning" ? "bg-refunded-bg text-refunded" : "bg-steel-50 text-steel-600",
              )}
            >
              {a.severity === "warning" ? <TriangleAlert size={14} strokeWidth={1.9} /> : <Eye size={14} strokeWidth={1.9} />}
            </span>
            <div className="min-w-0">
              <div className="text-[14px] leading-snug font-semibold text-ink">{a.title}</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{a.detail}</p>
            </div>
            <div className="col-start-2 sm:col-start-3">
              <Button variant="secondary" size="sm" onClick={() => onShow({ title: a.title, spec: a.spec })}>
                Show me
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </section>
  );
}

export function SectionTitle({ icon, children, action }: { icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
        {icon ? <span className="text-faint">{icon}</span> : null}
        {children}
      </div>
      {action}
    </div>
  );
}

