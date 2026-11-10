"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, GitPullRequest, Loader2, MousePointer2, Plus, Send, Share2, Square, Trash2, Wallet, Wand2, Workflow } from "lucide-react";
import { STATE_WORDS } from "@plex/backend/lib/crew";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar, Badge, Card, Input, Label, Meter, Skeleton, Textarea } from "@/components/ui/primitives";
import { AiAgentIcon } from "@/components/ui/icons";
import { Amount } from "@/components/ui/money";
import { CrewCanvas, STATE_TONE } from "@/components/crews/canvas";
import { AssemblyLayer, useAssembly } from "@/components/crews/assembly";
import { useAutoPay } from "@/components/tasks/use-fund";
import { CheckMark, errorMessage } from "@/components/tasks/task-ui";
import { cn, formatCents } from "@/lib/utils";
import { CREW_STATUS } from "../crews-view";

type Crew = NonNullable<FunctionReturnType<typeof api.crews.get>>;
type Step = Crew["steps"][number];
type Editable = Pick<Step, "key" | "title" | "brief" | "deliver" | "payoutCents" | "dependsOn" | "agentHandle" | "building" | "built" | "x" | "y">;

const strip = (s: Step | Editable): Editable => ({
  key: s.key,
  title: s.title,
  brief: s.brief,
  deliver: s.deliver,
  payoutCents: s.payoutCents,
  dependsOn: s.dependsOn,
  agentHandle: s.agentHandle,
  building: s.building,
  built: s.built,
  x: s.x,
  y: s.y,
});

export function CrewView({ id }: { id: string }) {
  const crewId = id as Id<"crews">;
  const crew = useQuery(api.crews.get, { crewId });
  const roster = useQuery(api.crews.roster);
  const save = useMutation(api.crews.saveSteps);
  const start = useAction(api.crews.start);
  const resume = useAction(api.crews.resume);
  const cancel = useMutation(api.crews.cancel);
  const publish = useMutation(api.crews.publish);
  const finishAutoPay = useAction(api.autopay.finish);
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [shared, setShared] = useState<string>();
  const total = crew ? crew.steps.reduce((a, s) => a + s.payoutCents, 0) : 0;
  const autoPay = useAutoPay(crew?.steps.length ? Math.max(...crew.steps.map((s) => s.payoutCents)) : 0);

  // Fresh from the planner (?build=1): watch the crew assemble itself. Replay any time.
  const [requested, setRequested] = useState(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("build") ? 1 : 0));
  const assembly = useAssembly({ steps: crew?.steps ?? [], agents: roster, playKey: crew && roster ? requested : 0 });

  // Back from GitHub or PayPal.
  const returned = useRef(false);
  useEffect(() => {
    if (returned.current) return;
    returned.current = true;
    const p = new URLSearchParams(window.location.search);
    const github = p.get("github");
    const autopay = p.get("autopay");
    if (!github && !autopay && !p.get("build")) return;
    window.history.replaceState(null, "", window.location.pathname);
    queueMicrotask(() => {
      if (github) setNotice(github === "connected" ? "GitHub is connected for this crew." : "GitHub didn't connect. Try again.");
      if (autopay === "return")
        void finishAutoPay({}).then(
          (r) => setNotice(r.status === "not_approved" ? "PayPal didn't confirm auto-pay." : "Auto-pay is on. Each step holds its money as it starts."),
          (err) => setError(errorMessage(err)),
        );
    });
  }, [finishAutoPay]);

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (crew === undefined) return <Skeleton className="h-[620px] w-full" />;
  if (crew === null)
    return (
      <Card className="p-8 text-center">
        <div className="text-[15px] font-semibold text-ink">This crew isn&apos;t here</div>
        <Link href="/crews" className={cn(buttonVariants({ variant: "secondary" }), "mt-4")}>
          Back to Crews
        </Link>
      </Card>
    );

  const draft = crew.status === "draft";
  const steps = crew.steps;
  const sel = steps.find((s) => s.key === selected);
  const status = CREW_STATUS[crew.status] ?? CREW_STATUS.draft!;
  const persist = (next: Editable[]) => run("save", () => save({ crewId, steps: next }));
  const edit = (key: string, patch: Partial<Editable>) => persist(steps.map((s) => (s.key === key ? { ...strip(s), ...patch } : strip(s))));
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const paidSteps = steps.filter((s) => s.state === "paid").length;
  const blocked = crew.readiness.some((r) => r.blocking);

  return (
    <div className="animate-rise">
      <Link href="/crews" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Crews
      </Link>

      <div className="flex flex-col gap-5 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="text-[12.5px] text-faint">
              {steps.length} step{steps.length > 1 ? "s" : ""} · planned by {crew.plannerModel === "heuristic" ? "a heuristic" : crew.template ? "a template" : (crew.plannerModel ?? "the planner")}
            </span>
          </div>
          <h1 className="font-display text-[32px] leading-[1.05] font-extrabold tracking-[-0.04em] text-ink sm:text-[40px]">{crew.title}</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{crew.goal}</p>
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2">
          {draft ? (
            <Button
              variant="brand"
              size="lg"
              disabled={!!busy || blocked || assembly.playing}
              onClick={() => run("start", () => start({ crewId, origin }))}
            >
              {busy === "start" ? <Loader2 className="animate-spin" /> : <Workflow />}
              Run for <Amount cents={total} size="md" className="text-ink" />
              {autoPay.on ? " with auto-pay" : ""}
            </Button>
          ) : crew.status === "paused" ? (
            <Button variant="brand" size="lg" disabled={!!busy} onClick={() => run("resume", () => resume({ crewId, origin }))}>
              {busy === "resume" ? <Loader2 className="animate-spin" /> : <Workflow />} Pick up where it stopped
            </Button>
          ) : null}
          {crew.status === "running" || crew.status === "paused" ? (
            <Button variant="ghost" disabled={!!busy} onClick={() => run("stop", () => cancel({ crewId }))}>
              <Square /> Stop
            </Button>
          ) : null}
          <Button
            variant="secondary"
            disabled={!!busy}
            onClick={() =>
              run("share", async () => {
                const slug = await publish({ crewId });
                const url = `${origin}/crews/s/${slug}`;
                await navigator.clipboard.writeText(url).catch(() => undefined);
                setShared(url);
              })
            }
          >
            {shared ? <Check /> : <Share2 />} {shared ? "Link copied" : "Share"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 flex items-start gap-2 text-[12.5px] text-disputed" role="alert">
          <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} /> {error}
        </p>
      ) : notice ? (
        <p className="mb-4 flex items-start gap-2 text-[12.5px] text-green-800" role="status">
          <Check className="mt-px size-4 flex-none" strokeWidth={2.2} /> {notice}
        </p>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="relative h-[600px] overflow-hidden p-0">
          <CrewCanvas
            steps={steps.map((s) => ({ ...s, state: draft ? undefined : s.state }))}
            editable={draft}
            selected={selected}
            onSelect={setSelected}
            roster={roster}
            show={assembly.show}
            onMove={(key, x, y) => edit(key, { x, y })}
            onConnect={(from, to) => {
              const t = steps.find((s) => s.key === to);
              if (t && !t.dependsOn.includes(from)) edit(to, { dependsOn: [...t.dependsOn, from] });
            }}
            onDisconnect={(from, to) => {
              const t = steps.find((s) => s.key === to);
              if (t) edit(to, { dependsOn: t.dependsOn.filter((d) => d !== from) });
            }}
          >
            <AssemblyLayer cursors={assembly.cursors} drag={assembly.drag} caption={assembly.caption} />
          </CrewCanvas>
          {!assembly.playing ? (
            <Button variant="secondary" size="sm" className="absolute top-4 right-4 z-10" onClick={() => setRequested((k) => k + 1)}>
              <MousePointer2 /> Watch it assemble
            </Button>
          ) : null}
          {draft && !assembly.playing ? (
            <div className="pointer-events-none absolute top-4 left-4 flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="pointer-events-auto"
                disabled={!!busy || steps.length >= 6}
                onClick={() => {
                  const key = `step-${steps.length + 1}`;
                  const last = steps[steps.length - 1];
                  persist([
                    ...steps.map(strip),
                    {
                      key,
                      title: "New step",
                      brief: "Describe what this agent should do.",
                      deliver: { label: "Result", description: "The finished work", type: "text" },
                      payoutCents: 500,
                      dependsOn: [],
                      x: (last?.x ?? 0) + 40,
                      y: (last?.y ?? 0) + 220,
                    },
                  ]);
                  setSelected(key);
                }}
              >
                <Plus /> Add a step
              </Button>
              <span className="text-[12px] text-faint">Drag to arrange. Connect a step&apos;s right edge to the next to pass its work along.</span>
            </div>
          ) : null}
        </Card>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6">
          {draft ? <ReadyCard crew={crew} crewId={crewId} onError={setError} /> : null}
          <MoneyCard crew={crew} total={total} paidSteps={paidSteps} autoPay={autoPay.on} />
          {sel ? (
            draft ? (
              <StepEditor key={sel.key} step={sel} steps={steps} roster={roster ?? []} busy={busy === "save"} onSave={(patch) => edit(sel.key, patch)} onDelete={() => {
                setSelected(undefined);
                persist(steps.filter((s) => s.key !== sel.key).map((s) => ({ ...strip(s), dependsOn: s.dependsOn.filter((d) => d !== sel.key) })));
              }} />
            ) : (
              <StepLive step={sel} />
            )
          ) : draft ? (
            <PlannerChat crewId={crewId} />
          ) : (
            <Card className="p-5">
              <div className="text-[14.5px] font-semibold text-ink">How this crew runs</div>
              <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
                <li>Each step holds its own price through PayPal, then agents bid and one is hired.</li>
                <li>Three blind proofers check the work. Only a pass moves money, and only that step&apos;s.</li>
                <li>The next step starts with the earlier work as its input. Tap a step to follow it.</li>
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Before a draft runs: what Plex still needs, asked for only when a step needs it. */
function ReadyCard({ crew, crewId, onError }: { crew: Crew; crewId: Id<"crews">; onError: (e: string) => void }) {
  const connectGithub = useAction(api.githubOAuth.start);
  const startAutoPay = useAction(api.autopay.start);
  const [busy, setBusy] = useState<string>();
  const go = (name: string, fn: () => Promise<string>) => {
    setBusy(name);
    fn().then(
      (url) => window.location.assign(url),
      (err) => {
        onError(errorMessage(err));
        setBusy(undefined);
      },
    );
  };
  const ready = !crew.readiness.some((r) => r.blocking);
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-[14.5px] font-semibold text-ink">Before it runs</div>
        <span className={cn("text-[12.5px] font-medium", ready ? "text-green-700" : "text-refunded")}>{ready ? "Ready" : "Needs you"}</span>
      </div>
      <ol className="mt-2 grid">
        {crew.readiness.map((r) => (
          <li key={r.key} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 py-2">
            <CheckMark status={r.key === "agents" && !r.ok ? "pending" : r.ok ? "pass" : r.blocking ? "fail" : "unsure"} />
            <div className="min-w-0">
              <div className="text-[13px] leading-snug text-ink">{r.text}</div>
              {r.key === "github" && !r.ok ? (
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={!!busy}
                  onClick={() => go("github", async () => (await connectGithub({ crewId, origin: window.location.origin })).url)}
                >
                  {busy === "github" ? <Loader2 className="animate-spin" /> : <GitPullRequest />} Connect GitHub
                </Button>
              ) : null}
              {r.key === "paypal" && !r.ok ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  disabled={!!busy}
                  onClick={() => go("paypal", async () => (await startAutoPay({ origin: window.location.origin, returnPath: `/crews/${crewId}` })).approveUrl)}
                >
                  {busy === "paypal" ? <Loader2 className="animate-spin" /> : <Wallet />} Turn on auto-pay
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {crew.github ? <p className="mt-1 text-[12px] text-faint">{crew.github.label} is lent to this crew only, and forgotten when it ends.</p> : null}
    </Card>
  );
}

function MoneyCard({ crew, total, paidSteps, autoPay }: { crew: Crew; total: number; paidSteps: number; autoPay: boolean }) {
  const draft = crew.status === "draft";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-medium text-ink-2">{draft ? "This crew will cost" : "Paid for passed work"}</span>
        <span className="text-faint">budget {formatCents(crew.budgetCents)}</span>
      </div>
      <Amount cents={draft ? total : crew.paidCents} size="xl" className="mt-2 block text-[44px]" />
      <Meter value={Math.min(1, (draft ? total : crew.paidCents) / Math.max(1, crew.budgetCents))} className="mt-4" />
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
        <div>
          <div className="text-[11.5px] text-faint">Held, not charged</div>
          <div className="font-display text-[18px] font-bold tracking-[-0.02em] text-steel-700 tabular">{formatCents(crew.heldCents)}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-faint">Steps paid</div>
          <div className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink tabular">
            {paidSteps} of {crew.steps.length}
          </div>
        </div>
      </div>
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
        {draft
          ? autoPay
            ? "Auto-pay holds each step from your saved PayPal as it starts. Nothing is charged until that step's proof passes."
            : "Each step asks you to approve its hold at PayPal as it starts. Turn on auto-pay in Agents & API to run it hands-free."
          : "Each step is charged only after its proof passes. A stopped step's hold is voided from its task page."}
      </p>
    </Card>
  );
}

function StepLive({ step }: { step: Step }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        {step.worker ? <Avatar name={step.worker.name} color={step.worker.color} square size={36} /> : <AiAgentIcon className="size-7 text-faint" />}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-ink">{step.title}</div>
          <div className={cn("text-[12.5px] font-medium", STATE_TONE[step.state])}>{STATE_WORDS[step.state]}</div>
        </div>
        <Amount cents={step.payoutCents} size="lg" className="ml-auto" />
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-ink-2">{step.brief}</p>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-[14px] bg-canvas/70 p-4">
        <div>
          <div className="text-[11.5px] text-faint">Bids</div>
          <div className="text-[14px] font-medium text-ink">{step.bids ? `${step.bids}, from ${formatCents(step.lowBid ?? 0)}` : "None yet"}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-faint">Proof</div>
          <div className="text-[14px] font-medium text-ink">
            {step.verdict ? `${step.verdict.result === "pass" ? "Passed" : step.verdict.result === "fail" ? "Failed" : "Unsure"} · ${Math.round(step.verdict.confidence * 100)}%` : "Not yet"}
          </div>
        </div>
      </div>
      {step.output?.video ? (
        <video src={step.output.video} controls playsInline className="mt-4 max-h-[420px] w-full rounded-[14px] bg-ink object-contain" />
      ) : step.output?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={step.output.image} alt={step.deliver.label} className="mt-4 aspect-square w-full rounded-[14px] bg-canvas object-cover" />
      ) : step.output?.text ? (
        <div className="mt-4 rounded-[14px] bg-canvas/70 p-4 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">{step.output.text}</div>
      ) : null}
      {step.state === "needs_approval" && step.note ? (
        <a href={step.note} className={cn(buttonVariants({ variant: "brand" }), "mt-4 w-full")}>
          Approve this step at PayPal <ArrowUpRight />
        </a>
      ) : step.note && !step.note.startsWith("http") ? (
        <p className="mt-4 text-[12.5px] text-disputed">{step.note}</p>
      ) : null}
      {step.state === "bidding" && !step.bids && step.task ? (
        <Link href={`/hire/new?task=${step.task._id}`} className={cn(buttonVariants({ variant: "secondary" }), "mt-4 w-full")}>
          <Wand2 /> No agent fits: create one
        </Link>
      ) : null}
      {step.task ? (
        <Link href={`/tasks/${step.task._id}`} className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">
          Open the step&apos;s task, receipts and proof <ArrowUpRight className="size-3.5" />
        </Link>
      ) : null}
    </Card>
  );
}

function StepEditor({
  step,
  steps,
  roster,
  busy,
  onSave,
  onDelete,
}: {
  step: Step;
  steps: Step[];
  roster: FunctionReturnType<typeof api.crews.roster>;
  busy: boolean;
  onSave: (patch: Partial<Editable>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(step.title);
  const [brief, setBrief] = useState(step.brief);
  const [deliver, setDeliver] = useState(step.deliver);
  const [price, setPrice] = useState(String(step.payoutCents / 100));
  const [agent, setAgent] = useState(step.agentHandle ?? "");
  const before = steps.filter((s) => step.dependsOn.includes(s.key)).map((s) => s.title);
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-[14.5px] font-semibold text-ink">Edit step</div>
        <Button variant="ghost" size="sm" onClick={onDelete} aria-label="Remove step">
          <Trash2 /> Remove
        </Button>
      </div>
      <div className="mt-4 grid gap-3">
        <div>
          <Label htmlFor="st-title">Title</Label>
          <Input id="st-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} />
        </div>
        <div>
          <Label htmlFor="st-brief">What the agent does</Label>
          <Textarea id="st-brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} />
          {before.length ? <p className="mt-1 text-[12px] text-faint">Gets the work of {before.join(" and ")} as input.</p> : null}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
          <div>
            <Label htmlFor="st-del">Delivers</Label>
            <Input id="st-del" value={deliver.description} onChange={(e) => setDeliver({ ...deliver, description: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="st-type">As</Label>
            <select
              id="st-type"
              value={deliver.type}
              onChange={(e) => setDeliver({ ...deliver, type: e.target.value as typeof deliver.type })}
              className="h-9 w-full rounded-[10px] border border-line bg-surface px-2 text-sm text-ink shadow-card"
            >
              <option value="text">Text</option>
              <option value="file">Image/file</option>
              <option value="link">Link</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
          <div>
            <Label htmlFor="st-agent">Agent</Label>
            <select
              id="st-agent"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="h-9 w-full rounded-[10px] border border-line bg-surface px-2 text-sm text-ink shadow-card"
            >
              <option value="">Let agents bid</option>
              {roster.map((a) => (
                <option key={a.handle} value={a.handle}>
                  {a.name} · from {formatCents(a.floorCents)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="st-price">Pays ($)</Label>
            <Input id="st-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
        </div>
        <Button
          variant="primary"
          disabled={busy || !title.trim() || !brief.trim()}
          onClick={() =>
            onSave({ title: title.trim(), brief: brief.trim(), deliver: { ...deliver, label: title.trim() }, payoutCents: Math.round(Number(price || 0) * 100), agentHandle: agent || undefined })
          }
        >
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Save step
        </Button>
        <Link href={`/hire/new`} className="text-center text-[12.5px] text-muted hover:text-ink">
          Need an agent that isn&apos;t here? <span className="font-medium text-ink">Create one</span>
        </Link>
      </div>
    </Card>
  );
}

function PlannerChat({ crewId }: { crewId: Id<"crews"> }) {
  const revise = useAction(api.crews.revise);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<{ from: "you" | "planner"; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const asks = ["Add a Spanish translation at the end", "Make it cheaper", "Run the steps side by side"];

  async function send(request: string) {
    setBusy(true);
    setMsgs((m) => [...m, { from: "you", text: request }]);
    try {
      const r = await revise({ crewId, request });
      setMsgs((m) => [...m, { from: "planner", text: r.reply }]);
    } catch (err) {
      setMsgs((m) => [...m, { from: "planner", text: errorMessage(err) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
        <AiAgentIcon className="size-[18px] text-green-700" /> Planner
      </div>
      <div className="mt-3 flex max-h-[260px] flex-col gap-2.5 overflow-y-auto">
        {msgs.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-muted">Tap a step to edit it, or tell me what to change and I&apos;ll redraw the crew.</p>
        ) : (
          msgs.map((m, i) => (
            <div key={i} className={cn("max-w-[92%] rounded-[14px] px-3.5 py-2.5 text-[13px] leading-relaxed", m.from === "you" ? "self-end bg-ink text-white" : "self-start bg-canvas text-ink-2")}>
              {m.text}
            </div>
          ))
        )}
        {busy ? (
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <Loader2 className="size-3.5 animate-spin" /> Redrawing the crew…
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {asks.map((a) => (
          <button key={a} type="button" disabled={busy} onClick={() => send(a)} className="rounded-full bg-sunken px-3 py-1 text-[12px] text-ink-2 hover:bg-line/60 disabled:opacity-50">
            {a}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length < 3) return;
          const t = text.trim();
          setText("");
          void send(t);
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask the planner for a change" disabled={busy} />
        <Button type="submit" variant="secondary" size="icon" disabled={busy || text.trim().length < 3} aria-label="Send">
          <Send />
        </Button>
      </form>
    </Card>
  );
}
