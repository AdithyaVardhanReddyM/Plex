"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  CircleAlert,
  Crosshair,
  Hand,
  ListChecks,
  Loader2,
  Lock,
  PenLine,
  Plus,
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
import { Avatar, Badge, Card, Input, Label, PageHeader, Textarea } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { PersonaSwitch, useAs } from "@/components/tasks/persona";
import { PolicyLine, SpecIcon, TaskCard, errorMessage, type CardTask } from "@/components/tasks/task-ui";
import { useFund } from "@/components/tasks/use-fund";
import { cn } from "@/lib/utils";

const HOUR = 3_600_000;

const EXAMPLES = [
  "Find someone to check if the café on 5th has a quiet corner, and photograph the menu.",
  "Research three standing desks under $400 that fit a 100cm wall. Compare them, with sources.",
  "Design a logo for Kettle Corner, a coffee cart in the Mission. Two colors, friendly.",
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
  const [saving, setSaving] = useState<"draft" | "fund" | null>(null);

  const payoutCents = form ? Math.round(Number(form.payout || 0) * 100) : 0;
  const pots = useQuery(api.pots.list);
  const errands = as ? undefined : pots?.find((p) => p.name === "Errands");
  const [hour] = useState(() => new Date().getHours());
  const policy = useQuery(
    api.pots.check,
    errands && payoutCents > 0 ? { potId: errands._id, amountCents: payoutCents, category: "Errands", hour } : "skip",
  );

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

  async function save(andFund: boolean) {
    if (!form) return;
    setError(undefined);
    setSaving(andFund ? "fund" : "draft");
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
      if (andFund) await fund(id);
      else router.push(`/tasks/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(null);
    }
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <div className="animate-rise">
      <Link href="/tasks" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Tasks
      </Link>
      <PageHeader
        title={invited ? `Hire ${invited.name}` : "Post a task"}
        description="Describe it the way you'd text a friend. The Task Writer turns it into a clear card with a proof spec; you edit, then fund it through PayPal."
        actions={<PersonaSwitch />}
      />

      {invited ? (
        <div className="mb-5 flex items-center gap-3 rounded-md bg-surface px-4 py-3 text-[13.5px] text-ink-2 shadow-card ring-1 ring-line ring-inset">
          <Avatar name={invited.name} color={invited.avatarColor} size={28} />
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

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <Label htmlFor="brief">What do you need done?</Label>
            <Textarea
              id="brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runWriter();
              }}
              placeholder="Find someone to check whether the café on 5th has a quiet corner…"
              className="min-h-28 text-[15px]"
            />
            {!form ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setBrief(ex);
                      runWriter(ex);
                    }}
                    className="max-w-full truncate rounded-full bg-sunken px-3 py-1.5 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-line"
                  >
                    {ex}
                  </button>
                ))}
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
                  "Plex adds a challenge word the worker shows in one photo."
                )}
              </span>
              <Button variant={form ? "secondary" : "primary"} onClick={() => runWriter()} disabled={writing}>
                {writing ? <Loader2 className="animate-spin" /> : <PenLine />}
                {writing ? "Writing the task…" : form ? "Rewrite" : "Write the task"}
              </Button>
            </div>
          </Card>

          {writing && !form ? <WriterSkeleton /> : null}
          {form ? <Editor form={form} set={set} /> : null}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-10">
          {form ? (
            <>
              <TaskCard preview task={previewTask(form, payoutCents)} />
              <Card className="overflow-hidden">
                <div className="px-5 pt-4 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-steel-700">
                      <Lock className="size-4" strokeWidth={1.9} /> Held through PayPal
                    </span>
                    <Amount cents={payoutCents} size="lg" />
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                    PayPal authorizes it now. You&apos;re charged only when you approve the proof; cancel and the hold is voided.
                  </p>
                  <PolicyLine
                    pot={errands?.name}
                    outcome={policy?.outcome}
                    ruleText={policy?.ruleText}
                  />
                </div>
                <div className="flex flex-col gap-2 border-t border-line bg-canvas/60 px-5 py-4">
                  <Button
                    variant="brand"
                    size="lg"
                    onClick={() => save(true)}
                    disabled={!!saving || funding || payoutCents < 100 || policy?.outcome === "deny"}
                  >
                    {saving === "fund" || funding ? <Loader2 className="animate-spin" /> : null}
                    {saving === "fund" || funding ? "Opening PayPal…" : <>Fund <Amount cents={payoutCents} size="md" className="text-white" /> with PayPal</>}
                  </Button>
                  <Button variant="ghost" onClick={() => save(false)} disabled={!!saving}>
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
            <Card className="p-5">
              <div className="text-[13px] font-medium text-ink">How a task works</div>
              <ol className="mt-3 space-y-3">
                {[
                  ["Fund", "PayPal holds the payout. Your pot's rules are checked first."],
                  ["Match", "People apply, AI agents bid against each other; Match ranks them by record and ask."],
                  ["Proof", "People upload photos with the challenge word. Agents' work is scored by three blind proofer agents."],
                  ["Pay", "You approve, PayPal captures and pays out. Both sides get the receipt."],
                ].map(([t, d], i) => (
                  <li key={t} className="grid grid-cols-[22px_minmax(0,1fr)] gap-3">
                    <span className="tabular flex size-[22px] items-center justify-center rounded-full bg-sunken text-[11.5px] font-semibold text-ink-2">
                      {i + 1}
                    </span>
                    <span className="text-[13px] leading-snug text-muted">
                      <span className="font-medium text-ink">{t}.</span> {d}
                    </span>
                  </li>
                ))}
              </ol>
              {error ? (
                <p className="mt-4 flex items-start gap-2 text-[12.5px] text-disputed" role="alert">
                  <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} /> {error}
                </p>
              ) : null}
            </Card>
          )}
        </aside>
      </div>
    </div>
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
    <Card className="p-5">
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <Loader2 className="size-4 animate-spin" strokeWidth={1.9} /> Reading your request, writing the proof spec…
      </div>
      <div className="mt-5 space-y-3">
        <div className="skeleton h-9 rounded-sm" />
        <div className="skeleton h-20 rounded-sm" />
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-9 rounded-sm" />
          <div className="skeleton h-9 rounded-sm" />
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
    <div className="rounded-md bg-canvas p-3.5 ring-1 ring-line ring-inset">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
        <ListChecks className="size-4 text-faint" strokeWidth={1.9} /> Done means
      </div>
      <ul className="mt-2 space-y-1.5 text-[12.5px] text-ink-2">
        {criteria.map((c, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 flex-none text-green-600" strokeWidth={2.2} />
            <span>
              {criterionLabel(c, form.proofSpec)} <span className="text-faint">· checked by code</span>
            </span>
          </li>
        ))}
        <li className="flex items-start gap-2">
          <Check className="mt-0.5 size-3.5 flex-none text-green-600" strokeWidth={2.2} />
          <span>Three blind proofer agents pass it, by Plex&apos;s majority rule</span>
        </li>
      </ul>
      {agents ? (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 border-t border-line pt-3">
          <input
            type="checkbox"
            checked={form.autoHire}
            onChange={(e) => set("autoHire", e.target.checked)}
            className="mt-0.5 size-4 accent-green-500"
          />
          <span>
            <span className="block text-[13px] font-medium text-ink">Hands-free</span>
            <span className="block text-[12px] leading-snug text-muted">
              Plex hires the best bid, the agent does the work, and PayPal pays only when every check above passes. A failed first try goes back to the agent once.
            </span>
          </span>
        </label>
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
  { value: "agent", label: "An AI agent", body: "Agents bid; three proofers score the work.", icon: <Bot /> },
];

function Editor({ form, set }: { form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
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
    <Card className="animate-rise">
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Task card</div>
        <Badge tone="outline">Edit anything</Badge>
      </div>
      <div className="grid gap-4 px-5 pt-4 pb-5">
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
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set("category", k)}
                aria-pressed={form.category === k}
                className={cn(
                  "h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                  form.category === k ? "bg-ink text-white" : "bg-surface text-ink-2 ring-1 ring-line ring-inset hover:bg-sunken",
                )}
              >
                {CATEGORY_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Who can take it</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {WHO.map((w) => {
              const blocked = w.value !== "human" && !digital;
              const active = (digital ? form.workerType : "human") === w.value;
              return (
                <button
                  key={w.value}
                  type="button"
                  disabled={blocked}
                  onClick={() => set("workerType", w.value)}
                  aria-pressed={active}
                  className={cn(
                    "grid grid-cols-[18px_minmax(0,1fr)] gap-x-2.5 rounded-md px-3 py-2.5 text-left ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:stroke-[1.9]",
                    active ? "bg-surface ring-ink" : "bg-surface ring-line hover:bg-sunken",
                  )}
                >
                  <span className={active ? "text-ink" : "text-faint"}>{w.icon}</span>
                  <span>
                    <span className="block text-[13px] font-medium text-ink">{w.label}</span>
                    <span className="block text-[12px] leading-snug text-muted">{w.body}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {!digital ? (
            <p className="mt-1.5 text-[12.5px] text-muted">
              Agents can take work delivered as text, files or links with no place to be. This one needs a person.
            </p>
          ) : null}
        </div>

        {digital ? <AcceptanceCriteria form={form} set={set} /> : null}

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
                  <span className="tabular">
                    Pinned {form.lat.toFixed(4)}, {form.lng.toFixed(4)}
                  </span>
                  <span className="text-faint">·</span>
                  <label className="inline-flex items-center gap-1.5">
                    Proof within
                    <select
                      value={form.radiusM}
                      onChange={(e) => set("radiusM", Number(e.target.value))}
                      className="rounded-[6px] border border-line bg-surface px-1.5 py-0.5 text-[12.5px] text-ink"
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

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px]">
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
                className="tabular pl-6"
              />
            </div>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">Proof spec</Label>
            <span className="text-[12px] text-faint">What the worker must upload</span>
          </div>
          <ul className="divide-y divide-line rounded-md border border-line">
            {form.proofSpec.map((s, i) => (
              <li key={i} className="grid grid-cols-[36px_minmax(0,1fr)_32px] items-start gap-2 p-2.5">
                <label className="relative flex size-9 items-center justify-center rounded-sm bg-sunken text-ink-2" title="Type">
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
            className="mt-2"
            onClick={() => set("proofSpec", [...form.proofSpec, { label: "Photo", description: "What it must show", type: "photo" }])}
            disabled={form.proofSpec.length >= 6}
          >
            <Plus /> Add proof item
          </Button>
        </div>

        <div>
          <Label>Verification</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => set("verificationMode", m.value)}
                aria-pressed={form.verificationMode === m.value}
                className={cn(
                  "rounded-md border p-3 text-left transition-[border-color,box-shadow,background-color]",
                  form.verificationMode === m.value
                    ? "border-ink bg-surface shadow-card"
                    : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-ink [&_svg]:size-4 [&_svg]:text-faint">
                  {m.icon}
                  {m.label}
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-muted">{m.body}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
