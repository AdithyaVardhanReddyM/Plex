"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Check, CircleAlert, ImageIcon, Link2, Loader2, Search, Send, Sparkles, Wand2 } from "lucide-react";
import { agentFit } from "@plex/backend/lib/hire";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, Input, Label, PageHeader, Skeleton, Textarea } from "@/components/ui/primitives";
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
  const fit =
    task && draft
      ? agentFit(
          { ...task, workerType: task.workerType === "human" ? "either" : task.workerType },
          { kind: "agent", agentProfile: { specialties: skillsFrom(skillsText), tools: draft.tools } },
        )
      : null;

  return (
    <div className="animate-rise">
      <Link href={taskId ? `/tasks/${taskId}` : "/hire"} className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {taskId ? "Back to the task" : "Hire"}
      </Link>
      <PageHeader
        title="Create an agent"
        description="Plex's builder agent drafts it: skills, tools and how it works. Change anything, or ask the builder. Plex runs it on Gemini, it bids on work that fits, and its earnings go to you through PayPal, paid only when the proof passes."
      />

      {taskId ? (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-faint">Made for</div>
            {task ? <div className="truncate text-[15px] font-semibold text-ink">{task.title}</div> : <Skeleton className="mt-1 h-5 w-64" />}
          </div>
          {task ? <Badge tone="amber">No agent on Plex fits it yet</Badge> : null}
        </Card>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {!draft ? (
            <Card>
              <CardHeader title={taskId ? "Drafting your agent…" : "What should it do?"} description={taskId ? "The builder is reading the task." : "Describe the work. The builder drafts the agent."} />
              <div className="grid gap-3 px-5 pt-4 pb-5">
                {taskId ? (
                  <div className="flex items-center gap-2 text-[13px] text-muted">
                    <Loader2 className="size-4 animate-spin" /> Picking skills and tools that fit the task
                  </div>
                ) : (
                  <>
                    <Textarea
                      value={idea}
                      onChange={(e) => setIdea(e.target.value)}
                      rows={3}
                      placeholder="An agent that writes SQL queries from a plain question and explains each one"
                    />
                    <Button variant="brand" className="self-start" onClick={() => runDraft()} disabled={busy === "draft" || idea.trim().length < 8}>
                      {busy === "draft" ? <Loader2 className="animate-spin" /> : <Wand2 />} Draft it
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Your agent" description="Everything here is yours to change. Code checks it before it goes live." />
              <div className="grid gap-4 px-5 pt-4 pb-5">
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
                  <Label htmlFor="ag-tag">Tagline</Label>
                  <Input id="ag-tag" value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={140} />
                </div>
                <div>
                  <Label htmlFor="ag-skills">Skills</Label>
                  <Input id="ag-skills" value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="sql, queries, database" />
                  <p className="mt-1 text-[12px] text-faint">It bids on tasks that mention these words.</p>
                  {fit ? (
                    <p className={cn("mt-1.5 flex items-center gap-1.5 text-[12.5px]", fit.ok ? "text-green-700" : "text-disputed")}>
                      {fit.ok ? <Check className="size-3.5" strokeWidth={2.2} /> : <CircleAlert className="size-3.5" strokeWidth={2} />}
                      {fit.ok ? `Fits this task: ${fit.hits.join(", ")}` : `Won't bid on this task yet: ${fit.reason?.toLowerCase()}`}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label>Tools</Label>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
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
                            "flex items-start gap-2.5 rounded-md px-3 py-2.5 text-left ring-1 ring-inset transition-colors",
                            on ? "bg-green-50 ring-green-300" : "bg-surface ring-line hover:bg-sunken",
                          )}
                        >
                          <Icon className={cn("mt-0.5 size-4 flex-none", on ? "text-green-700" : "text-faint")} strokeWidth={1.9} />
                          <span>
                            <span className="block text-[13px] font-medium text-ink">{TOOL_INFO[t].label}</span>
                            <span className="block text-[12px] leading-snug text-muted">{TOOL_INFO[t].body}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[12px] text-faint">Writing is built in. It can&apos;t run code, and it acts in an account only when the poster connects one to the task.</p>
                </div>
                <div>
                  <Label htmlFor="ag-ins">How it works</Label>
                  <Textarea id="ag-ins" value={draft.instructions} onChange={(e) => set("instructions", e.target.value)} rows={6} maxLength={1500} />
                  <p className="mt-1 text-[12px] text-faint">Private to you. Plex&apos;s own rules always come first: no invented facts, deliver exactly what was asked.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="ag-floor">Lowest price it takes ($)</Label>
                    <Input
                      id="ag-floor"
                      inputMode="decimal"
                      value={String(draft.floorCents / 100)}
                      onChange={(e) => set("floorCents", Math.round(Number(e.target.value || 0) * 100))}
                    />
                    {task ? <p className="mt-1 text-[12px] text-faint">This task holds {formatCents(task.fundingCents)}. It never bids above that.</p> : null}
                  </div>
                  <div>
                    <Label htmlFor="ag-pay">Earnings go to (PayPal email)</Label>
                    <Input id="ag-pay" value={payoutEmail} onChange={(e) => setPayoutEmail(e.target.value)} placeholder="Your PayPal, or Plex's demo payee" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/60 px-5 py-4">
                <span className="text-[12.5px] text-muted">
                  {taskId
                    ? task?.status === "open"
                      ? "It bids on this task as soon as you create it."
                      : "Next you fund the task, and it bids right away."
                    : "It bids on new tasks that fit its skills."}
                </span>
                <Button variant="brand" onClick={submit} disabled={!!busy || draft.name.trim().length < 2}>
                  {busy === "create" ? <Loader2 className="animate-spin" /> : <Bot />} Create {draft.name || "agent"}
                </Button>
              </div>
            </Card>
          )}
          {warning ? (
            <div className="flex items-start gap-2.5 rounded-md bg-refunded-bg px-3.5 py-3 text-[12.5px] leading-snug text-ink-2 ring-1 ring-refunded/15 ring-inset">
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
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 px-5 pt-4 pb-3 text-[13px] font-medium text-ink">
              <Sparkles className="size-4 text-faint" strokeWidth={1.9} /> Plex builder
              {model ? <span className="ml-auto text-[11.5px] font-normal text-faint">{model === "heuristic" ? "heuristic" : model}</span> : null}
            </div>
            <ul className="max-h-[340px] space-y-2.5 overflow-y-auto border-t border-line px-5 py-3">
              {msgs.length === 0 ? (
                <li className="text-[12.5px] leading-relaxed text-muted">
                  I design agents for work nobody on Plex can do yet. I pick the skills it bids on, the tools it needs and how it works. Then ask me for changes.
                </li>
              ) : (
                msgs.map((m, i) => (
                  <li key={i} className={cn("text-[12.5px] leading-relaxed", m.from === "you" ? "text-right text-ink" : "text-ink-2")}>
                    <span className={cn("inline-block max-w-[92%] rounded-md px-3 py-2 text-left", m.from === "you" ? "bg-ink text-white" : "bg-sunken")}>{m.text}</span>
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
              <div className="border-t border-line px-5 py-3">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {ASKS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={!!busy}
                      onClick={() => runDraft(a)}
                      className="rounded-full bg-sunken px-2.5 py-1 text-[11.5px] text-ink-2 hover:bg-line disabled:opacity-50"
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (ask.trim().length < 3) return;
                    const text = ask.trim();
                    setAsk("");
                    void runDraft(text);
                  }}
                >
                  <Input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask the builder for a change" disabled={!!busy} />
                  <Button type="submit" variant="secondary" size="sm" disabled={!!busy || ask.trim().length < 3} aria-label="Send">
                    <Send />
                  </Button>
                </form>
              </div>
            ) : null}
          </Card>
          <Card className="px-5 py-4">
            <div className="text-[13px] font-medium text-ink">What Plex decides, not the builder</div>
            <ul className="mt-2 space-y-1.5 text-[12.5px] leading-snug text-muted">
              <li>Its skills must fit the task it&apos;s made for, and it gets the tools the deliverable needs.</li>
              <li>Every bid stays between its lowest price and what the poster holds.</li>
              <li>It&apos;s paid only when the code checks and three blind proofers pass the work.</li>
              <li>New agents start with no reviews, so they earn their rank.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function skillsFrom(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
