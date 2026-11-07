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
import { Badge, Card, CardHeader, IconTile, Kbd, SectionHeading, Skeleton, StatusDot } from "@/components/ui/primitives";
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
    onClearSpotlight();
  };

  return (
    <section aria-label="Ask the Ledger" className="space-y-4">
      <Card className="overflow-hidden shadow-raised">
        <form
          className="group/ask flex items-center gap-3 px-4 py-3 sm:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(text);
          }}
        >
          <label
            htmlFor="ledger-ask"
            className="flex h-12 min-w-0 flex-1 cursor-text items-center gap-3 rounded-[12px] border border-line bg-surface pr-1.5 pl-3.5 transition-[border-color,box-shadow] group-hover/ask:border-line-strong focus-within:!border-green-500 focus-within:ring-[3px] focus-within:ring-green-100"
          >
            <TextSearch className="size-[18px] flex-none text-faint" strokeWidth={1.9} aria-hidden />
            <span className="sr-only">Ask the Ledger</span>
            <input
              id="ledger-ask"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask about your money, like “what did my agents buy this week?”"
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
              autoComplete="off"
            />
            {text ? null : <Kbd className="hidden sm:inline-flex">/</Kbd>}
            <Button type="submit" size="icon-sm" disabled={!text.trim()} aria-label="Ask">
              <ArrowUp />
            </Button>
          </label>
        </form>
        <div className="flex items-center gap-2 border-t border-line bg-canvas/50 px-4 py-2.5 sm:px-5">
          <span className="flex-none text-[12px] font-medium text-faint">Try</span>
          <div className="flex min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {questions === undefined
              ? ["w-40", "w-32", "w-44"].map((w) => <Skeleton key={w} className={cn("h-7 flex-none rounded-full", w)} />)
              : questions.map((q) => (
                  <Chip key={q} onClick={() => void submit(q)}>
                    {q}
                  </Chip>
                ))}
          </div>
        </div>
      </Card>

      {spotlight ? (
        <div className="animate-rise space-y-4">
          <AnswerHead label="Watchdog" text={spotlight.title} onClose={onClearSpotlight} />
          <Widgets specs={[spotlight.spec]} host={host} from="Watchdog" />
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
      ) : earlier.length ? (
        <div className="flex items-center gap-2 overflow-x-auto px-1 [scrollbar-width:none]">
          <span className="flex flex-none items-center gap-1.5 text-[12px] font-medium text-faint">
            <History className="size-3.5" strokeWidth={1.9} />
            Earlier
          </span>
          {earlier.map((a) => (
            <Chip key={a._id} onClick={() => setActiveId(a._id)} title={a.question} className="max-w-[280px] border-transparent bg-transparent hover:border-line">
              {a.question}
            </Chip>
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
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] gap-x-3.5 px-5 pt-4 pb-4">
        <IconTile tone={watchdog ? "steel" : "mint"} size="md">
          {watchdog ? <Radar /> : <TextSearch />}
        </IconTile>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("text-[12.5px] font-semibold", watchdog ? "text-steel-700" : "text-green-700")}>{label}</span>
            {question ? (
              <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
                <span className="text-line-strong">·</span>
                {via ? <Laptop className="size-3.5 flex-none text-steel-600" strokeWidth={1.9} aria-label={via} /> : null}
                <span className="truncate">“{question}”</span>
              </span>
            ) : null}
          </div>
          {text === null ? (
            <div className="mt-2 space-y-2" aria-live="polite">
              <div className="flex items-center gap-2 text-[13.5px] text-muted">
                <StatusDot live />
                Reading {count ?? "your"} receipts
              </div>
              <Skeleton className="h-3.5 w-[78%] rounded-full" />
              <Skeleton className="h-3.5 w-[52%] rounded-full" />
            </div>
          ) : (
            <p className={cn("mt-1 max-w-3xl text-[15px] leading-relaxed text-pretty", error ? "text-disputed" : "text-ink")}>{text}</p>
          )}
        </div>
        <div className="flex items-start gap-2">
          {note ? (
            <Badge tone="outline" className="hidden text-muted md:inline-flex">
              {note}
            </Badge>
          ) : null}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Dismiss answer" className="-mt-1 -mr-2 text-faint">
            <X />
          </Button>
        </div>
      </div>
      {followUps?.length && onFollowUp ? (
        <div className="flex items-center gap-2 border-t border-line bg-canvas/50 px-5 py-2.5">
          <CornerDownRight className="size-3.5 flex-none text-faint" strokeWidth={1.9} aria-hidden />
          <span className="flex-none text-[12px] font-medium text-faint">Next</span>
          <div className="flex min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {followUps.map((f) => (
              <Chip key={f} onClick={() => onFollowUp(f)}>
                {f}
              </Chip>
            ))}
          </div>
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
      <ul className="px-2 pt-2 pb-2">
        {alerts.map((a, i) => (
          <li key={a.id} className={cn(i > 0 && "border-t border-line/70")}>
            <div className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-3 py-2.5">
              <IconTile tone={a.severity === "warning" ? "amber" : "steel"} size="sm" className="size-[34px] rounded-[10px]">
                {a.severity === "warning" ? <TriangleAlert /> : <Eye />}
              </IconTile>
              <div className="min-w-0">
                <div className="line-clamp-2 text-[13.5px] leading-snug font-medium text-ink sm:truncate">{a.title}</div>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted sm:truncate" title={a.detail}>
                  {a.detail}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onShow({ title: a.title, spec: a.spec })} className="-mr-1">
                Show me
                <ArrowRight />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
