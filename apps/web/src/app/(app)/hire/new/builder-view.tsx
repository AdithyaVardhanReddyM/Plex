"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  CircleAlert,
  ImageIcon,
  Link2,
  ListChecks,
  Loader2,
  MessagesSquare,
  PenLine,
  Scale,
  Search,
  Send,
} from "lucide-react";
import { agentFit } from "@plex/backend/lib/hire";
import { PLEX_BPS, pct, plexCents } from "@plex/backend/lib/split";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Badge, Card, IconTile, Input, Label, PageHeader, Skeleton, Textarea } from "@/components/ui/primitives";
import { WorkerCard } from "@/components/hire/worker-card";
import { useAs } from "@/components/tasks/persona";
import { errorMessage } from "@/components/tasks/task-ui";
import { cn, formatCents } from "@/lib/utils";

type Draft = FunctionReturnType<typeof api.agentBuilder.draft>["draft"];
type Msg = { from: "builder" | "you"; text: string };

const TOOL_INFO = {
  web_search: { label: "Web search", body: "Google Search for current facts, with the source next to each one", icon: Search },
  image: { label: "Image making", body: "Logos, icons and banners with Gemini's image model", icon: ImageIcon },
  mcp: { label: "Connected accounts", body: "Acts in GitHub or any MCP server the poster connects to a task", icon: Link2 },
} as const;

const ASKS = ["Make it cite a source for every fact", "Make it cheaper", "Keep answers short and plain", "Add image making"];

/**
 * Create an agent with Plex's builder agent. From a task nobody could do
 * (`?task=`), it drafts the skills, tools and instructions; the person edits
 * them or asks the builder for changes, then creates it and it bids at once.
 */
export function BuilderView() {
  const router = useRouter();
  const as = useAs();
  const taskId = (useSearchParams().get("task") ?? undefined) as Id<"tasks"> | undefined;
  const page = useQuery(api.tasks.get, taskId ? { id: taskId, as } : "skip");
  const task = page?.task;
  const draftAgent = useAction(api.agentBuilder.draft);
  const create = useMutation(api.agentBuilder.create);

  const [idea, setIdea] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [skillsText, setSkillsText] = useState("");
  const [payoutEmail, setPayoutEmail] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState<"draft" | "create" | null>(null);
  const [error, setError] = useState<string>();
  const [model, setModel] = useState<string>();
  const [warning, setWarning] = useState<string | null>(null);
  const started = useRef(false);
  const chat = useRef<HTMLUListElement>(null);

  async function runDraft(request?: string) {
    setBusy("draft");
    setError(undefined);
    if (request) setMsgs((m) => [...m, { from: "you", text: request }]);
    try {
      const r = await draftAgent({
        taskId,
        idea: idea.trim() || undefined,
        current: draft ? { ...draft, skills: skillsFrom(skillsText) } : undefined,
        request,
      });
      setDraft(r.draft);
      setSkillsText(r.draft.skills.join(", "));
      setModel(r.model);
      setWarning(r.warning);
      setMsgs((m) => [...m, { from: "builder", text: r.reply }]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // From a task: the builder drafts one as soon as the page opens.
  useEffect(() => {
    if (!taskId || started.current) return;
    started.current = true;
    queueMicrotask(() => runDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    const el = chat.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs.length, busy]);

  async function submit() {
    if (!draft) return;
    setBusy("create");
    setError(undefined);
    try {
      const r = await create({ draft: { ...draft, skills: skillsFrom(skillsText) }, taskId, payoutEmail: payoutEmail.trim() || undefined, as });
      router.push(taskId ? `/tasks/${taskId}` : `/hire/${r.handle}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const skills = skillsFrom(skillsText);
  const fit =
    task && draft
      ? agentFit(
          { ...task, workerType: task.workerType === "human" ? "either" : task.workerType },
          { kind: "agent", agentProfile: { specialties: skills, tools: draft.tools } },
        )
      : null;

  const done = {
    identity: !!draft && draft.name.trim().length >= 2 && draft.tagline.trim().length > 0,
    skills: !!draft && skills.length > 0 && (fit ? fit.ok : true),
    how: !!draft && draft.instructions.trim().length >= 20,
    price: !!draft && draft.floorCents > 0,
  };

  return (
    <div className="animate-rise">
      <Link
        href={taskId ? `/tasks/${taskId}` : "/hire"}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" strokeWidth={1.9} /> {taskId ? "Back to the task" : "Hire"}
      </Link>
      <PageHeader
        icon={<Bot />}
        title="Create an agent"
        description="Plex's builder drafts it: the skills it bids on, the tools it needs and how it works. Change anything, or ask the builder. Plex runs it on Gemini, and you earn 80% of what it's paid, through PayPal, only when the proof passes."
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {taskId ? (
            <Card className="flex flex-wrap items-center gap-3 px-5 py-4">
              <IconTile tone="steel">
                <ListChecks />
              </IconTile>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-muted">Made for</div>
                {task ? (
                  <div className="truncate text-[14.5px] font-semibold tracking-[-0.012em] text-ink">{task.title}</div>
                ) : (
                  <Skeleton className="mt-1 h-4 w-64" />
                )}
              </div>
              {task ? (
                <Badge tone="amber">
                  <CircleAlert /> No agent on Plex fits it yet
                </Badge>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <ol>
              {/* 1. Describe */}
              <Step
                n={1}
                state={draft ? "done" : "current"}
                title={taskId ? "Read the task" : "Describe the work"}
                description={
                  draft
                    ? model === "heuristic"
                      ? `Drafted from ${taskId ? "the task's own words" : "your description"} with a heuristic (no model configured).`
                      : `Drafted by the builder${model ? ` on ${model}` : ""}. Ask it for changes on the right.`
                    : taskId
                      ? "The builder is reading the task and picking skills and tools that fit."
                      : "Say what it should do, in a sentence or two. The builder drafts the rest."
                }
              >
                {draft ? null : taskId ? (
                  <div className="flex items-center gap-2 rounded-[10px] bg-canvas/60 px-3.5 py-3 text-[13px] text-muted ring-1 ring-inset ring-line">
                    <Loader2 className="size-4 animate-spin text-faint" /> Drafting your agent…
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <Textarea
                      value={idea}
                      onChange={(e) => setIdea(e.target.value)}
                      rows={3}
                      placeholder="An agent that writes SQL queries from a plain question and explains each one"
                      aria-label="What the agent should do"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12px] text-faint">You can change everything it drafts.</span>
                      <Button onClick={() => runDraft()} disabled={busy === "draft" || idea.trim().length < 8}>
                        {busy === "draft" ? <Loader2 className="animate-spin" /> : <PenLine />} Draft it
                      </Button>
                    </div>
                  </div>
                )}
              </Step>

              {/* 2. Name and pitch */}
              <Step n={2} state={!draft ? "todo" : done.identity ? "done" : "current"} title="Name and pitch" description="What posters see first in Hire.">
                {draft ? (
                  <div className="grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="ag-name">Name</Label>
                        <Input id="ag-name" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={24} />
                      </div>
                      <div>
                        <Label htmlFor="ag-turn">Delivers in</Label>
                        <Input id="ag-turn" value={draft.turnaround} onChange={(e) => set("turnaround", e.target.value)} maxLength={40} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between">
                        <Label htmlFor="ag-tag">Tagline</Label>
                        <span className="tabular text-[11.5px] text-faint">{draft.tagline.length}/140</span>
                      </div>
                      <Input id="ag-tag" value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={140} />
                    </div>
                  </div>
                ) : null}
              </Step>

              {/* 3. Skills and tools */}
              <Step
                n={3}
                state={!draft ? "todo" : done.skills ? "done" : "current"}
                title="Skills and tools"
                description="It bids on tasks that mention its skills, with only the tools you give it."
              >
                {draft ? (
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="ag-skills">Skills</Label>
                      <Input id="ag-skills" value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="sql, queries, database" />
                      <p className="mt-1.5 text-[12px] text-faint">Comma separated. Plain words posters use.</p>
                      {fit ? (
                        <div
                          className={cn(
                            "mt-2.5 flex items-start gap-2 rounded-[10px] px-3 py-2 text-[12.5px] leading-snug ring-1 ring-inset",
                            fit.ok ? "bg-green-50 text-green-800 ring-green-100" : "bg-disputed-bg text-disputed ring-disputed/15",
                          )}
                        >
                          {fit.ok ? <Check className="mt-px size-3.5 flex-none" strokeWidth={2.2} /> : <CircleAlert className="mt-px size-3.5 flex-none" strokeWidth={2} />}
                          <span>{fit.ok ? `Fits this task: ${fit.hits.join(", ")}` : `Won't bid on this task yet: ${fit.reason?.toLowerCase()}`}</span>
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <Label>Tools</Label>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {(Object.keys(TOOL_INFO) as (keyof typeof TOOL_INFO)[]).map((t) => {
                          const on = draft.tools.includes(t);
                          const Icon = TOOL_INFO[t].icon;
                          return (
                            <button
                              key={t}
                              type="button"
                              aria-pressed={on}
                              onClick={() => set("tools", on ? draft.tools.filter((x) => x !== t) : [...draft.tools, t])}
                              className={cn(
                                "relative flex flex-col gap-2.5 rounded-[12px] border p-3 text-left transition-[border-color,background-color,box-shadow]",
                                on ? "border-green-300 bg-green-50/60 shadow-card" : "border-line bg-surface hover:border-line-strong",
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <IconTile tone={on ? "mint" : "neutral"} size="sm">
                                  <Icon />
                                </IconTile>
                                <span
                                  className={cn(
                                    "flex size-4 items-center justify-center rounded-full ring-1 ring-inset transition-colors",
                                    on ? "bg-green-500 text-white ring-green-500" : "bg-surface ring-line-strong",
                                  )}
                                  aria-hidden
                                >
                                  {on ? <Check className="size-2.5" strokeWidth={3} /> : null}
                                </span>
                              </div>
                              <span>
                                <span className="block text-[13px] font-medium text-ink">{TOOL_INFO[t].label}</span>
                                <span className="mt-0.5 block text-[12px] leading-snug text-muted">{TOOL_INFO[t].body}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[12px] text-faint">
                        Writing is built in. It can&apos;t run code, and it acts in an account only when the poster connects one to the task.
                      </p>
                    </div>
                  </div>
                ) : null}
              </Step>

              {/* 4. How it works */}
              <Step n={4} state={!draft ? "todo" : done.how ? "done" : "current"} title="How it works" description="Its private instructions. Plex's own rules come first.">
                {draft ? (
                  <div>
                    <Textarea
                      id="ag-ins"
                      aria-label="How it works"
                      value={draft.instructions}
                      onChange={(e) => set("instructions", e.target.value)}
                      rows={7}
                      maxLength={1500}
                      className="text-[13.5px]"
                    />
                    <div className="mt-1.5 flex items-start justify-between gap-3 text-[12px] text-faint">
                      <span>Private to you. Plex always adds: no invented facts, deliver exactly what was asked.</span>
                      <span className="tabular flex-none">{draft.instructions.length}/1500</span>
                    </div>
                  </div>
                ) : null}
              </Step>

              {/* 5. Price and payout */}
              <Step n={5} last state={!draft ? "todo" : done.price ? "done" : "current"} title="Price and payout" description="Where its earnings go when the proof passes.">
                {draft ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="ag-floor">Lowest price it takes</Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13.5px] text-faint">$</span>
                        <Input
                          id="ag-floor"
                          inputMode="decimal"
                          className="tabular pl-6"
                          value={String(draft.floorCents / 100)}
                          onChange={(e) => set("floorCents", Math.round(Number(e.target.value || 0) * 100))}
                        />
                      </div>
                      <p className="mt-1.5 text-[12px] text-faint">
                        {task ? `This task holds ${formatCents(task.fundingCents)}. It never bids above that.` : "Every bid stays between this and what the poster holds."}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="ag-pay">Earnings go to</Label>
                      <Input id="ag-pay" type="email" value={payoutEmail} onChange={(e) => setPayoutEmail(e.target.value)} placeholder="Your PayPal email" />
                      <p className="mt-1.5 text-[12px] text-faint">Paid by PayPal Payouts. Empty uses Plex&apos;s demo payee.</p>
                    </div>
                    <p className="text-[12.5px] leading-relaxed text-muted sm:col-span-2">
                      You earn <span className="font-medium text-ink">{pct(10_000 - PLEX_BPS.custom)}</span> of every job it&apos;s paid for; Plex
                      keeps {pct(PLEX_BPS.custom)} to run it. The fee comes out of the price, so posters pay exactly the bid.
                      {draft.floorCents > 0 ? (
                        <>
                          {" "}At your {formatCents(draft.floorCents)} floor you&apos;d earn{" "}
                          <span className="tabular font-medium text-ink">{formatCents(draft.floorCents - plexCents(draft.floorCents, PLEX_BPS.custom))}</span>.
                        </>
                      ) : null}
                    </p>
                  </div>
                ) : null}
              </Step>
            </ol>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-line bg-canvas/60 px-5 py-4">
              <span className="text-[12.5px] text-muted">
                {!draft
                  ? "Draft it first. Nothing goes live until you create it."
                  : taskId
                    ? task?.status === "open"
                      ? "It bids on this task as soon as you create it."
                      : "Next you fund the task, and it bids right away."
                    : "It bids on new tasks that fit its skills."}
              </span>
              <Button onClick={submit} disabled={!draft || !!busy || draft.name.trim().length < 2}>
                {busy === "create" ? <Loader2 className="animate-spin" /> : <Bot />} Create {draft?.name || "agent"}
              </Button>
            </div>
          </Card>

          {warning ? (
            <div className="flex items-start gap-2.5 rounded-[12px] bg-refunded-bg px-4 py-3 text-[12.5px] leading-snug text-ink-2 ring-1 ring-refunded/15 ring-inset">
              <CircleAlert className="mt-px size-4 flex-none text-refunded" strokeWidth={1.9} />
              <span>
                <span className="font-medium text-ink">An agent can&apos;t fully do this yet.</span> {warning} It can still prepare the work (a review, a plan, the text), and the proofers will judge what it delivers.
              </span>
            </div>
          ) : null}
          {error ? (
            <p className="flex items-start gap-2 text-[12.5px] text-disputed" role="alert">
              <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} /> {error}
            </p>
          ) : null}

          <div className="rounded-[12px] border border-line bg-canvas/50 px-5 py-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
              <Scale className="size-4 text-faint" strokeWidth={1.9} /> What Plex decides, not the builder
            </div>
            <ul className="mt-3 grid gap-x-6 gap-y-2 text-[12.5px] leading-snug text-muted sm:grid-cols-2">
              {[
                "Its skills must fit the task it's made for, and it gets the tools the deliverable needs.",
                "Every bid stays between its lowest price and what the poster holds.",
                "It's paid only when the code checks and three blind proofers pass the work.",
                "New agents start with no reviews, so they earn their rank.",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-px size-3.5 flex-none text-green-700" strokeWidth={2.2} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          <div>
            <div className="mb-2 flex items-center justify-between px-0.5 text-[12px] text-muted">
              <span>Preview in Hire</span>
              {draft ? <span className="text-faint">Updates as you type</span> : null}
            </div>
            <WorkerCard
              w={{
                handle: "preview",
                name: draft?.name ?? "",
                kind: "agent",
                skills,
                tasksCompleted: 0,
                agent: { house: true, model: "gemini", tagline: draft?.tagline, turnaround: draft?.turnaround },
              }}
              className={cn(!draft && "opacity-60")}
            />
          </div>

          <Card className="flex flex-col overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <IconTile tone="ink" size="sm">
                <MessagesSquare />
              </IconTile>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium leading-tight text-ink">Plex builder</div>
                <div className="truncate text-[11.5px] text-faint">{model ? (model === "heuristic" ? "Heuristic, no model configured" : model) : "Designs agents for work nobody can do yet"}</div>
              </div>
            </div>
            <ul ref={chat} className="max-h-[260px] min-h-[96px] space-y-2.5 overflow-y-auto px-4 py-3">
              {msgs.length === 0 && busy !== "draft" ? (
                <li className="text-[12.5px] leading-relaxed text-muted">
                  I pick the skills it bids on, the tools it needs and how it works. Once there&apos;s a draft, ask me for changes here.
                </li>
              ) : (
                msgs.map((m, i) => (
                  <li key={i} className={cn("flex text-[12.5px] leading-relaxed", m.from === "you" ? "justify-end" : "justify-start")}>
                    <span
                      className={cn(
                        "max-w-[88%] rounded-[12px] px-3 py-2",
                        m.from === "you" ? "rounded-br-[4px] bg-ink text-white" : "rounded-bl-[4px] bg-sunken text-ink-2",
                      )}
                    >
                      {m.text}
                    </span>
                  </li>
                ))
              )}
              {busy === "draft" ? (
                <li className="flex items-center gap-2 text-[12.5px] text-muted">
                  <Loader2 className="size-3.5 animate-spin" /> Thinking…
                </li>
              ) : null}
            </ul>
            {draft ? (
              <div className="border-t border-line px-4 py-3">
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {ASKS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={!!busy}
                      onClick={() => runDraft(a)}
                      className="h-7 rounded-full border border-line bg-surface px-2.5 text-[12px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <form
                  className="relative"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (ask.trim().length < 3) return;
                    const text = ask.trim();
                    setAsk("");
                    void runDraft(text);
                  }}
                >
                  <Input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask the builder for a change" disabled={!!busy} className="pr-11" />
                  <Button
                    type="submit"
                    size="icon-sm"
                    className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
                    disabled={!!busy || ask.trim().length < 3}
                    aria-label="Send"
                  >
                    <Send />
                  </Button>
                </form>
              </div>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  );
}

/** One numbered section of the form, on a rail that ties the steps together. */
function Step({
  n,
  title,
  description,
  state,
  last,
  children,
}: {
  n: number;
  title: string;
  description: string;
  state: "done" | "current" | "todo";
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className={cn("grid grid-cols-[28px_minmax(0,1fr)] gap-x-4 px-5 pt-5", !last && "border-b border-line pb-5", last && "pb-5", state === "todo" && "pb-4")}>
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "tabular flex size-7 flex-none items-center justify-center rounded-full text-[12px] font-semibold transition-colors",
            state === "done" && "bg-green-300 text-ink",
            state === "current" && "bg-ink text-white",
            state === "todo" && "bg-surface text-faint ring-1 ring-inset ring-line",
          )}
        >
          {state === "done" ? <Check className="size-3.5" strokeWidth={2.6} /> : n}
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex min-h-7 flex-col justify-center">
          <div className={cn("text-[14.5px] font-semibold leading-tight tracking-[-0.012em]", state === "todo" ? "text-faint" : "text-ink")}>{title}</div>
        </div>
        {state !== "todo" ? <p className="mt-0.5 text-[13px] leading-snug text-muted">{description}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </li>
  );
}

function skillsFrom(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

