"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Cpu,
  Camera,
  Check,
  CircleAlert,
  Crosshair,
  Hand,
  ListChecks,
  Loader2,
  Lock,
  MapPin,
  Palette,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react";
import type { TaskDraft } from "@plex/backend/tasks";
import { CATEGORY_LABEL } from "@plex/backend/lib/taskRules";
import { criterionLabel, defaultCriteria } from "@plex/backend/lib/hire";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, IconTile, Input, Kbd, Label, PageHeader, Segmented, Skeleton, Switch, Textarea } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { PersonaSwitch, useAs } from "@/components/tasks/persona";
import { KIND_ICON, PolicyLine, SpecIcon, TaskCard, errorMessage, type CardTask } from "@/components/tasks/task-ui";
import { useAutoPay, useFund } from "@/components/tasks/use-fund";
import { cn } from "@/lib/utils";

const HOUR = 3_600_000;

const EXAMPLES: { text: string; icon: React.ReactNode }[] = [
  { text: "Find someone to check if the café on 5th has a quiet corner, and photograph the menu.", icon: <MapPin /> },
  { text: "Research three standing desks under $400 that fit a 100cm wall. Compare them, with sources.", icon: <Search /> },
  { text: "Design a logo for Kettle Corner, a coffee cart in the Mission. Two colors, friendly.", icon: <Palette /> },
];

type SpecItem = TaskDraft["proofSpec"][number];
type Mode = TaskDraft["verificationMode"];
type Category = TaskDraft["category"];
type WorkerType = TaskDraft["workerType"];

interface Form {
  title: string;
  description: string;
  category: Category;
  locationLabel: string;
  lat?: number;
  lng?: number;
  radiusM: number;
  start: number;
  end: number;
  payout: string;
  proofSpec: SpecItem[];
  verificationMode: Mode;
  tags: string[];
  workerType: WorkerType;
  autoHire: boolean;
}

const REMOTE_KINDS: Category[] = ["remote", "data", "creator", "agent"];

/** Can any agent on Plex do this? If not, the poster creates one right here. */
function AgentFitLine({ form, onBuild, building }: { form: Form; onBuild: () => void; building: boolean }) {
  const fit = useQuery(api.agentBuilder.fit, {
    draft: {
      title: form.title,
      description: form.description,
      tags: form.tags,
      category: form.category,
      proofSpec: form.proofSpec.map((s) => ({ label: s.label, description: s.description, type: s.type })),
      remote: true,
    },
  });
  if (!fit) return <div className="skeleton -mt-1 h-[18px] w-72 rounded-full" />;
  if (!fit.digital)
    return <p className="-mt-1 text-[12.5px] leading-snug text-refunded">Agents can&apos;t take this one. {fit.reason}</p>;
  const names = fit.fits.map((f) => f.name);
  return names.length ? (
    <p className="-mt-1 flex items-center gap-1.5 text-[12.5px] text-green-800">
      <Check className="size-3.5 flex-none" strokeWidth={2.2} /> {names.slice(0, 3).join(", ")} can do this. They bid once it&apos;s funded.
    </p>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[12px] bg-refunded-bg px-3.5 py-3 ring-1 ring-refunded/15 ring-inset">
      <span className="min-w-0 flex-1 basis-64 text-[12.5px] leading-snug text-ink-2">
        <span className="font-medium text-ink">No agent on Plex can do this yet.</span> Create one with the agent builder. It bids once you fund the task.
      </span>
      <Button variant="secondary" size="sm" onClick={onBuild} disabled={building}>
        {building ? <Loader2 className="animate-spin" /> : <Cpu />} Create an agent for this
      </Button>
    </div>
  );
}

function toLocalInput(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDraft(d: TaskDraft): Form {
  const quarter = 15 * 60_000;
  const start = Math.ceil((Date.now() + d.startsInHours * HOUR) / quarter) * quarter;
  return {
    title: d.title,
    description: d.description,
    category: d.category,
    locationLabel: d.locationLabel ?? "",
    lat: d.lat ?? undefined,
    lng: d.lng ?? undefined,
    radiusM: d.radiusM ?? 300,
    start,
    end: start + Math.max(1, d.durationHours) * HOUR,
    payout: (d.payoutCents / 100).toFixed(d.payoutCents % 100 ? 2 : 0),
    proofSpec: d.proofSpec,
    verificationMode: d.verificationMode,
    tags: d.tags,
    workerType: d.workerType ?? "human",
    autoHire: (d.workerType ?? "human") !== "human",
  };
}

/** Agents deliver text, files and links, and can't be anywhere. */
function digitalForm(f: Pick<Form, "proofSpec" | "category" | "locationLabel">) {
  const remote = REMOTE_KINDS.includes(f.category);
  return (remote || !f.locationLabel.trim()) && f.proofSpec.every((s) => s.type === "text" || s.type === "link" || s.type === "file");
}

export function NewTaskView() {
  const router = useRouter();
  const as = useAs();
  const invitedHandle = useSearchParams().get("for") ?? undefined;
  const invited = useQuery(api.hire.profile, invitedHandle ? { handle: invitedHandle } : "skip");
  const write = useAction(api.tasks.write);
  const createDraft = useMutation(api.tasks.createDraft);
  const { fund, busy: funding, error: fundError } = useFund();

  const [brief, setBrief] = useState("");
  const [writing, setWriting] = useState(false);
  const [model, setModel] = useState<string>();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState<"draft" | "fund" | "build" | null>(null);

  const payoutCents = form ? Math.round(Number(form.payout || 0) * 100) : 0;
  const pots = useQuery(api.pots.list);
  const errands = as ? undefined : pots?.find((p) => p.name === "Errands");
  const [hour] = useState(() => new Date().getHours());
  const policy = useQuery(
    api.pots.check,
    errands && payoutCents > 0 ? { potId: errands._id, amountCents: payoutCents, category: "Errands", hour } : "skip",
  );
  const autoPay = useAutoPay(payoutCents, policy?.outcome);

  async function runWriter(text = brief) {
    if (text.trim().length < 8) {
      setError("Say a little more about what you need done.");
      return;
    }
    setError(undefined);
    setWriting(true);
    try {
      const res = await write({ brief: text });
      const next = fromDraft(res.draft);
      // Hiring an agent directly: the task is open to agents if it can be.
      if (invited?.kind === "agent" && next.workerType === "human" && digitalForm(next)) {
        next.workerType = "either";
        next.autoHire = true;
      }
      setForm(next);
      setModel(res.model);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWriting(false);
    }
  }

  async function save(mode: "draft" | "fund" | "build") {
    if (!form) return;
    setError(undefined);
    setSaving(mode);
    try {
      const remote = REMOTE_KINDS.includes(form.category);
      const id: Id<"tasks"> = await createDraft({
        as,
        brief,
        title: form.title,
        description: form.description,
        category: form.category,
        location:
          !remote && form.locationLabel.trim()
            ? { label: form.locationLabel.trim(), lat: form.lat, lng: form.lng, radiusM: form.lat !== undefined ? form.radiusM : undefined }
            : undefined,
        windowStart: form.start,
        windowEnd: form.end,
        payoutCents,
        proofSpec: form.proofSpec.filter((s) => s.label.trim()),
        verificationMode: form.verificationMode,
        tags: form.tags,
        writerModel: model,
        workerType: digitalForm(form) ? form.workerType : "human",
        invitedHandle: invited ? invitedHandle : undefined,
        autoHire: digitalForm(form) && form.workerType !== "human" && form.autoHire,
      });
      if (mode === "fund") {
        if (await fund(id)) router.push(`/tasks/${id}`);
      } else if (mode === "build") router.push(`/hire/new?task=${id}`);
      else router.push(`/tasks/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(null);
    }
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <div className="animate-rise">
      <Link href="/tasks" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.9} /> Tasks
      </Link>
      <PageHeader
        title={invited ? `Hire ${invited.name}` : "Post a task"}
        description="Describe it the way you'd text a friend. The Task Writer turns it into a clear card with a proof spec. You edit it, then fund it through PayPal."
        actions={<PersonaSwitch />}
      />

      {invited ? (
        <div className="mb-4 flex items-center gap-3 rounded-[12px] bg-surface px-4 py-3 text-[13.5px] text-ink-2 shadow-card ring-1 ring-line ring-inset">
          <Avatar name={invited.name} color={invited.avatarColor} size={28} square={invited.kind === "agent"} />
          <span className="min-w-0 flex-1">
            {invited.kind === "agent" ? (
              <>
                <span className="font-medium text-ink">{invited.name}</span> bids first once you fund it. It takes work delivered as text, files or links.
              </>
            ) : (
              <>
                <span className="font-medium text-ink">{invited.name}</span> sees this task in their list and can take it first. Others can still apply.
              </>
            )}
          </span>
          <Link href="/tasks/new" className="flex-none text-[13px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline">
            Post to everyone
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_368px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader
              icon={<PenLine />}
              title="What do you need done?"
              description="Who, where, by when, and what proof you'd accept. Plain words are fine."
            />
            <div className="px-5 pt-3.5 pb-5">
              <Textarea
                id="brief"
                aria-label="What do you need done?"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runWriter();
                }}
                placeholder="Find someone to check whether the café on 5th has a quiet corner…"
                className="min-h-28 text-[15px]"
              />
              {!form ? (
                <div className="mt-4">
                  <div className="mb-1.5 text-[12px] text-faint">Or start from one of these</div>
                  <ul className="-mx-2">
                    {EXAMPLES.map((ex) => (
                      <li key={ex.text}>
                        <button
                          type="button"
                          onClick={() => {
                            setBrief(ex.text);
                            runWriter(ex.text);
                          }}
                          disabled={writing}
                          className="group grid w-full grid-cols-[28px_minmax(0,1fr)_16px] items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-sunken/70 disabled:opacity-60"
                        >
                          <IconTile size="sm">{ex.icon}</IconTile>
                          <span className="truncate text-[13px] text-ink-2 group-hover:text-ink">{ex.text}</span>
                          <ArrowRight className="size-4 text-faint opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.9} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[12.5px] text-muted">
                  {model ? (
                    <span className="inline-flex items-center gap-1.5">
                      <PenLine className="size-3.5 text-faint" strokeWidth={1.9} />
                      Written by {model === "heuristic" ? "the heuristic writer (no Gemini key yet)" : model}
                    </span>
                  ) : (
                    <span className="hidden items-center gap-1.5 sm:inline-flex">
                      <Kbd>⌘</Kbd>
                      <Kbd>Enter</Kbd>
                      <span className="ml-1">to write it</span>
                    </span>
                  )}
                </span>
                <Button variant={form ? "secondary" : "primary"} onClick={() => runWriter()} disabled={writing}>
                  {writing ? <Loader2 className="animate-spin" /> : <PenLine />}
                  {writing ? "Writing the task…" : form ? "Rewrite" : "Write the task"}
                </Button>
              </div>
              {error && !form ? (
                <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-snug text-disputed" role="alert">
                  <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} /> {error}
                </p>
              ) : null}
            </div>
          </Card>

          {writing && !form ? <WriterSkeleton /> : null}
          {form ? <Editor form={form} set={set} onBuild={() => save("build")} building={saving === "build"} /> : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          {form ? (
            <>
              <div>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <span className="text-[13px] font-medium text-ink">Preview</span>
                  <span className="text-[12px] text-faint">How it shows on the board</span>
                </div>
                <TaskCard preview task={previewTask(form, payoutCents)} />
              </div>
              <Card className="overflow-hidden">
                <div className="relative bg-gradient-to-b from-steel-50 to-surface px-5 pt-5 pb-4">
                  <div className="absolute inset-x-0 top-0 h-1" style={{ background: "var(--metal)" }} aria-hidden />
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-steel-700">
                    <Lock className="size-4" strokeWidth={1.9} /> You fund now
                  </div>
                  <div className="mt-2.5">
                    <Amount cents={payoutCents} size="xl" className="text-steel-900" />
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-steel-600">
                    {autoPay.on ? (
                      <>
                        Auto-pay holds it from your saved PayPal{autoPay.payerEmail ? <> ({autoPay.payerEmail})</> : null}, no popup. PayPal keeps it until the proof passes.
                      </>
                    ) : (
                      <>PayPal holds it until the proof passes. Nothing is charged before then.</>
                    )}
                  </p>
                </div>
                <ol className="space-y-3 px-5 pt-1 pb-4">
                  {[
                    { icon: <Lock />, tone: "steel" as const, title: "Now", body: "PayPal authorizes the payout and holds it." },
                    { icon: <BadgeCheck />, tone: "mint" as const, title: "When the proof passes", body: "Captured and paid to the worker by PayPal Payouts." },
                    { icon: <RotateCcw />, tone: "neutral" as const, title: "If you cancel", body: "The hold is voided. You're never charged." },
                  ].map((s) => (
                    <li key={s.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                      <IconTile tone={s.tone} size="sm">
                        {s.icon}
                      </IconTile>
                      <span className="min-w-0 text-[12.5px] leading-snug">
                        <span className="block font-medium text-ink">{s.title}</span>
                        <span className="block text-muted">{s.body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="px-5 pb-4">
                  <PolicyLine pot={errands?.name} outcome={policy?.outcome} ruleText={policy?.ruleText} />
                </div>
                <div className="flex flex-col gap-2 border-t border-line bg-canvas/60 px-5 py-4">
                  <Button
                    variant="brand"
                    size="lg"
                    onClick={() => save("fund")}
                    disabled={!!saving || funding || payoutCents < 100 || policy?.outcome === "deny"}
                  >
                    {saving === "fund" || funding ? <Loader2 className="animate-spin" /> : null}
                    {saving === "fund" || funding ? (
                      autoPay.on ? "Holding with auto-pay…" : "Opening PayPal…"
                    ) : autoPay.on ? (
                      <>
                        Hold <Amount cents={payoutCents} size="md" /> with auto-pay
                      </>
                    ) : (
                      <>
                        Fund <Amount cents={payoutCents} size="md" /> with PayPal
                      </>
                    )}
                  </Button>
                  <Button variant="ghost" onClick={() => save("draft")} disabled={!!saving}>
                    Save as draft
                  </Button>
                  {error || fundError ? (
                    <p className="flex items-start gap-2 text-[12.5px] leading-snug text-disputed" role="alert">
                      <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} /> {error ?? fundError}
                    </p>
                  ) : null}
                </div>
              </Card>
            </>
          ) : (
            <HowItWorks />
          )}
        </aside>
      </div>
    </div>
  );
}

/** The four steps of a task, before there's a draft to preview. */
function HowItWorks() {
  const steps = [
    { icon: <Lock />, tone: "steel" as const, title: "Fund", body: "PayPal holds the payout. Your pot's rules are checked first, in code." },
    { icon: <UsersRound />, tone: "white" as const, title: "Match", body: "People apply and AI agents bid. Match ranks them by record and ask." },
    { icon: <Camera />, tone: "white" as const, title: "Proof", body: "Photos with the challenge word, or agent work scored by three blind proofers." },
    { icon: <BadgeCheck />, tone: "ink" as const, title: "Pay", body: "You approve, PayPal captures and pays out. Both sides get the receipt." },
  ];
  return (
    <Card>
      <CardHeader title="How a task works" description="The money moves only when the proof passes." />
      <ol className="px-5 pt-4 pb-5">
        {steps.map((s, i) => (
          <li key={s.title} className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3.5 pb-5 last:pb-0">
            {i < steps.length - 1 ? (
              <span className="absolute top-10 bottom-1 left-[17.5px] w-px bg-[repeating-linear-gradient(180deg,var(--color-line-strong)_0_4px,transparent_4px_8px)]" aria-hidden />
            ) : null}
            <IconTile tone={s.tone} size="md">
              {s.icon}
            </IconTile>
            <span className="min-w-0 pt-0.5">
              <span className="block text-[13.5px] font-medium text-ink">
                <span className="tabular mr-1.5 text-faint">{i + 1}</span>
                {s.title}
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function previewTask(f: Form, cents: number): CardTask {
  const remote = REMOTE_KINDS.includes(f.category);
  return {
    _id: "preview" as Id<"tasks">,
    _creationTime: 0,
    posterId: "" as Id<"users">,
    postedVia: "web",
    title: f.title || "Untitled task",
    brief: "",
    description: f.description,
    category: f.category,
    location: !remote && f.locationLabel ? { label: f.locationLabel } : undefined,
    windowStart: f.start,
    windowEnd: f.end,
    payout: { kind: "fixed", amountCents: cents },
    currency: "USD",
    proofSpec: f.proofSpec.length ? f.proofSpec : [{ label: "Photo", description: "", type: "photo" }],
    verificationMode: f.verificationMode,
    challengeCode: "",
    status: "open",
    funding: { state: "authorized" },
    tags: f.tags,
    workerType: digitalForm(f) ? f.workerType : "human",
    poster: null,
    applicantCount: 0,
    fundingCents: cents,
  };
}

function WriterSkeleton() {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5 text-[13px] text-muted">
        <Loader2 className="size-4 animate-spin" strokeWidth={1.9} /> Reading your request, writing the proof spec…
      </div>
      <div className="space-y-4 p-5">
        <div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-9 w-full rounded-[10px]" />
        </div>
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-20 w-full rounded-[10px]" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16 rounded-[12px]" />
          <Skeleton className="h-16 rounded-[12px]" />
          <Skeleton className="h-16 rounded-[12px]" />
        </div>
      </div>
    </Card>
  );
}

/** What code checks before anyone is paid, and the hands-free switch. */
function AcceptanceCriteria({ form, set }: { form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  const criteria = defaultCriteria(form.proofSpec);
  const agents = form.workerType !== "human";
  return (
    <div className="rounded-[12px] bg-canvas/70 ring-1 ring-line ring-inset">
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <ListChecks className="size-4 text-faint" strokeWidth={1.9} /> Done means
        </div>
        <ul className="mt-2 space-y-1.5 text-[12.5px] text-ink-2">
          {criteria.map((c, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 flex-none text-green-700" strokeWidth={2.2} />
              <span>
                {criterionLabel(c, form.proofSpec)} <span className="text-faint">· checked by code</span>
              </span>
            </li>
          ))}
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 flex-none text-green-700" strokeWidth={2.2} />
            <span>Three blind proofer agents pass it, by Plex&apos;s majority rule</span>
          </li>
        </ul>
      </div>
      {agents ? (
        <div className="flex items-start justify-between gap-4 border-t border-line px-4 py-3">
          <span>
            <span className="block text-[13px] font-medium text-ink">Hands-free</span>
            <span className="block text-[12px] leading-snug text-muted">
              Plex hires the best bid, the agent does the work, and PayPal pays only when every check above passes. A failed first try goes back to the agent once.
            </span>
          </span>
          <Switch checked={form.autoHire} onChange={(v) => set("autoHire", v)} label="Hands-free" className="mt-0.5" />
        </div>
      ) : null}
    </div>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────

const MODES: { value: Mode; label: string; body: string; icon: React.ReactNode }[] = [
  { value: "one_tap", label: "One tap", body: "Plex checks the proof, you tap approve.", icon: <Hand /> },
  { value: "auto", label: "Automatic", body: "Pays out when the AI verdict passes at 90% or more.", icon: <Zap /> },
  { value: "manual", label: "Manual", body: "You review every item yourself.", icon: <UserCheck /> },
];

const KINDS: Category[] = ["local", "remote", "agent", "data", "creator", "impact"];

const WHO: { value: WorkerType; label: string; body: string; icon: React.ReactNode }[] = [
  { value: "human", label: "A person", body: "Real-world work with photo proof.", icon: <UserRound /> },
  { value: "either", label: "Person or agent", body: "People apply, AI agents bid. Best ask wins.", icon: <UsersRound /> },
  { value: "agent", label: "An AI agent", body: "Agents bid; three proofers score the work.", icon: <Cpu /> },
];

/** One of a few options, as a card with its icon, label and a line of help. */
function Choice({
  active,
  disabled,
  onClick,
  icon,
  label,
  body,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  body: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex flex-col items-start gap-2.5 rounded-[12px] bg-surface p-3 text-left ring-inset transition-[box-shadow,background-color] disabled:cursor-not-allowed disabled:opacity-45",
        active ? "shadow-card ring-[1.5px] ring-ink" : "ring-1 ring-line hover:bg-canvas/60 hover:ring-line-strong",
      )}
    >
      <span className="flex w-full items-center justify-between">
        <IconTile tone={active ? "ink" : "neutral"} size="sm">
          {icon}
        </IconTile>
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded-full ring-inset",
            active ? "bg-ink ring-0" : "ring-1 ring-line-strong",
          )}
          aria-hidden
        >
          {active ? <span className="size-1.5 rounded-full bg-white" /> : null}
        </span>
      </span>
      <span>
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted">{body}</span>
      </span>
    </button>
  );
}

function Section({
  n,
  title,
  description,
  aside,
  children,
}: {
  n: number;
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="tabular mt-px flex size-[22px] flex-none items-center justify-center rounded-full bg-sunken text-[11.5px] font-semibold text-ink-2 ring-1 ring-line/70 ring-inset">
            {n}
          </span>
          <div>
            <h2 className="text-[14.5px] leading-6 font-semibold tracking-[-0.012em] text-ink">{title}</h2>
            {description ? <p className="text-[12.5px] leading-snug text-muted">{description}</p> : null}
          </div>
        </div>
        {aside}
      </div>
      <div className="grid gap-4 sm:pl-[34px]">{children}</div>
    </section>
  );
}

function Editor({
  form,
  set,
  onBuild,
  building,
}: {
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  onBuild: () => void;
  building: boolean;
}) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string>();
  const remote = REMOTE_KINDS.includes(form.category);
  const digital = digitalForm(form);

  function pinMyLocation() {
    if (!navigator.geolocation) return setLocError("This browser can't share a location.");
    setLocating(true);
    setLocError(undefined);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set("lat", Number(pos.coords.latitude.toFixed(5)));
        set("lng", Number(pos.coords.longitude.toFixed(5)));
        if (!form.locationLabel) set("locationLabel", "Near me");
        setLocating(false);
      },
      () => {
        setLocError("Location wasn't shared.");
        setLocating(false);
      },
      { timeout: 8000 },
    );
  }

  const updateSpec = (i: number, patch: Partial<SpecItem>) =>
    set(
      "proofSpec",
      form.proofSpec.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );

  return (
    <Card className="animate-rise divide-y divide-line">
      <Section n={1} title="The task" description="What the worker reads. Edit anything the writer got wrong." aside={<Badge tone="outline">Draft</Badge>}>
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="desc">Instructions</Label>
          <Textarea id="desc" value={form.description} onChange={(e) => set("description", e.target.value)} className="min-h-20" />
        </div>
        <div>
          <Label>Kind of work</Label>
          <Segmented
            size="sm"
            value={form.category}
            onChange={(k) => set("category", k)}
            items={KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              return { value: k, label: CATEGORY_LABEL[k], icon: <Icon /> };
            })}
          />
        </div>
      </Section>

      <Section n={2} title="Who can take it" description="Agents take work delivered as text, files or links with no place to be.">
        <div className="grid gap-2 sm:grid-cols-3">
          {WHO.map((w) => (
            <Choice
              key={w.value}
              active={(digital ? form.workerType : "human") === w.value}
              disabled={w.value !== "human" && !digital}
              onClick={() => set("workerType", w.value)}
              icon={w.icon}
              label={w.label}
              body={w.body}
            />
          ))}
        </div>
        {!digital ? (
          <p className="-mt-1 text-[12.5px] text-muted">This one needs someone on the ground, so it&apos;s for a person.</p>
        ) : form.workerType !== "human" ? (
          <AgentFitLine form={form} onBuild={onBuild} building={building} />
        ) : null}
        {digital ? <AcceptanceCriteria form={form} set={set} /> : null}
      </Section>

      <Section n={3} title={remote ? "When, and how much" : "Where, when, and how much"} description="The payout is what PayPal holds until the proof passes.">
        {!remote ? (
          <div>
            <Label htmlFor="where">Where</Label>
            <div className="flex gap-2">
              <Input
                id="where"
                value={form.locationLabel}
                onChange={(e) => set("locationLabel", e.target.value)}
                placeholder="A place a worker can find"
              />
              <Button variant="secondary" onClick={pinMyLocation} disabled={locating} aria-label="Use my location" className="flex-none">
                {locating ? <Loader2 className="animate-spin" /> : <Crosshair />}
                <span className="hidden sm:inline">Use my location</span>
              </Button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
              {form.lat !== undefined && form.lng !== undefined ? (
                <>
                  <span className="tabular inline-flex items-center gap-1">
                    <MapPin className="size-3.5 text-faint" strokeWidth={1.9} />
                    Pinned {form.lat.toFixed(4)}, {form.lng.toFixed(4)}
                  </span>
                  <span className="text-faint">·</span>
                  <label className="inline-flex items-center gap-1.5">
                    Proof within
                    <select
                      value={form.radiusM}
                      onChange={(e) => set("radiusM", Number(e.target.value))}
                      className="rounded-[8px] border border-line bg-surface px-1.5 py-0.5 text-[12.5px] text-ink"
                    >
                      {[100, 150, 300, 500, 1000, 3000].map((m) => (
                        <option key={m} value={m}>
                          {m < 1000 ? `${m} m` : `${m / 1000} km`}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <span>No pin yet, so the location check will need a human.</span>
              )}
              {locError ? <span className="text-disputed">{locError}</span> : null}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_132px]">
          <div>
            <Label htmlFor="start">Starts</Label>
            <Input
              id="start"
              type="datetime-local"
              value={toLocalInput(form.start)}
              onChange={(e) => e.target.value && set("start", new Date(e.target.value).getTime())}
            />
          </div>
          <div>
            <Label htmlFor="end">Ends</Label>
            <Input
              id="end"
              type="datetime-local"
              value={toLocalInput(form.end)}
              onChange={(e) => e.target.value && set("end", new Date(e.target.value).getTime())}
            />
          </div>
          <div>
            <Label htmlFor="payout">Payout</Label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">$</span>
              <Input
                id="payout"
                inputMode="decimal"
                value={form.payout}
                onChange={(e) => set("payout", e.target.value.replace(/[^\d.]/g, ""))}
                className="tabular pl-6 font-semibold"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        n={4}
        title="Proof"
        description="What the worker must upload. Plex checks each item."
        aside={<span className="tabular pt-1 text-[12px] text-faint">{form.proofSpec.length} of 6</span>}
      >
        <div>
          <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
            {form.proofSpec.map((s, i) => (
              <li key={i} className="grid grid-cols-[36px_minmax(0,1fr)_32px] items-start gap-2.5 bg-surface p-2.5">
                <label
                  className="relative flex size-9 cursor-pointer items-center justify-center rounded-[10px] bg-sunken text-ink-2 ring-1 ring-line/70 ring-inset transition-colors hover:bg-line/60"
                  title="Change the type"
                >
                  <SpecIcon type={s.type} />
                  <select
                    value={s.type}
                    onChange={(e) => updateSpec(i, { type: e.target.value as SpecItem["type"] })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label={`Type of ${s.label}`}
                  >
                    {(["photo", "video", "file", "text", "link"] as const).map((t) => (
                      <option key={t} value={t}>
                        {t[0]!.toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-1.5">
                  <Input value={s.label} onChange={(e) => updateSpec(i, { label: e.target.value })} className="h-8 font-medium" aria-label="Item" />
                  <Input
                    value={s.description}
                    onChange={(e) => updateSpec(i, { description: e.target.value })}
                    className="h-8 text-[13px] text-ink-2"
                    aria-label="What it must show"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${s.label}`}
                  onClick={() => set("proofSpec", form.proofSpec.filter((_, j) => j !== i))}
                  disabled={form.proofSpec.length <= 1}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 -ml-1"
            onClick={() => set("proofSpec", [...form.proofSpec, { label: "Photo", description: "What it must show", type: "photo" }])}
            disabled={form.proofSpec.length >= 6}
          >
            <Plus /> Add proof item
          </Button>
        </div>
      </Section>

      <Section n={5} title="Verification" description="Who says the proof is good enough to pay.">
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <Choice
              key={m.value}
              active={form.verificationMode === m.value}
              onClick={() => set("verificationMode", m.value)}
              icon={m.icon}
              label={m.label}
              body={m.body}
            />
          ))}
        </div>
      </Section>
    </Card>
  );
}
