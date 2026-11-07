"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Eye, FileText, Plus, TriangleAlert, X } from "lucide-react";
import { api } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, Input, Label, PageHeader, Skeleton, Textarea } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { cn, formatCents } from "@/lib/utils";
import { CauseCover, PlaceChip, RaisedBar } from "./parts";

type Draft = FunctionReturnType<typeof api.causeBuilder.draft>;
type DraftTask = Draft["tasks"][number];

const EXAMPLE = `Bayview Seed Library

We run a free seed library at the Bayview branch library in San Francisco. Every spring, gardeners drop off seeds from their own plots, and neighbors take what they want to grow.

Packaging day, Saturday: 3 people x 4 hours, $18 an hour each. Proof: photo of the sorted trays and the labeled packets.

Donations pay the packers. The seeds, envelopes and the room are donated.`;

const errorText = (err: unknown, fallback: string) => (err instanceof ConvexError ? String(err.data) : fallback);

/** New pages get a cover in the brand's aqua until the org picks one. */
const NEW_COVER_HUE = 172;

export function BuilderView() {
  const router = useRouter();
  const draftAction = useAction(api.causeBuilder.draft);
  const publish = useMutation(api.causeBuilder.publish);

  const [source, setSource] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDraft() {
    setBusy("draft");
    setError(null);
    try {
      const d = await draftAction({ text: source });
      setDraft(d);
      const total = d.tasks.reduce((s, t) => s + t.payoutCents * t.spots, 0);
      // The goal starts at what the drafted tasks cost, never a made-up number.
      setGoal(total ? String(total / 100) : "");
    } catch (err) {
      setError(errorText(err, "Drafting failed. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function runPublish() {
    if (!draft) return;
    setBusy("publish");
    setError(null);
    try {
      const slug = await publish({
        name: draft.name,
        tagline: draft.tagline,
        story: draft.story,
        locationLabel: draft.locationLabel,
        goalCents: Math.round(Number(goal) * 100),
        tasks: draft.tasks.map((t) => ({
          title: t.title,
          description: t.description,
          payoutCents: t.payoutCents,
          spots: t.spots,
          hours: t.hours,
          proof: t.proof,
        })),
        sourceText: source,
        draftedBy: draft.by,
      });
      router.push(`/causes/${slug}`);
    } catch (err) {
      setError(errorText(err, "Publishing failed. Try again."));
      setBusy(null);
    }
  }

  const setTask = (i: number, patch: Partial<DraftTask>) =>
    setDraft((d) => (d ? { ...d, tasks: d.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) } : d));

  const tasksTotal = draft ? draft.tasks.reduce((s, t) => s + t.payoutCents * t.spots, 0) : 0;
  const goalCents = Math.round(Number(goal || 0) * 100);

  return (
    <div className="animate-rise">
      <Link href="/causes" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.9} /> Causes
      </Link>
      <PageHeader
        icon={<FileText />}
        title="Build a cause page"
        description="Paste what your organization already says about the work. Plex drafts the story and the paid tasks. It only uses facts and numbers from your text, and it flags anything missing."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {/* 1. Source */}
          <Card>
            <StepHeader n={1} title="Your text" description="Website copy, a flyer, a grant summary. Plain text is fine." done={Boolean(draft)} />
            <div className="p-5 pt-4">
              <Textarea
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Who you are, what the work is, where it happens, and what one shift pays."
                className={cn("font-[inherit]", draft ? "min-h-36" : "min-h-72")}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => setSource(EXAMPLE)}>
                    Use an example
                  </Button>
                  <span className="tabular text-[12px] text-faint">{source.trim().length < 80 ? `${80 - source.trim().length} more characters to draft` : `${source.trim().length} characters`}</span>
                </div>
                <Button variant="primary" onClick={runDraft} disabled={busy !== null || source.trim().length < 80}>
                  {busy === "draft" ? "Drafting…" : draft ? "Draft again" : "Draft the page"}
                  {busy === "draft" ? null : <ArrowRight />}
                </Button>
              </div>
              {error ? (
                <p className="mt-3 rounded-[10px] bg-disputed-bg px-3 py-2 text-[12.5px] text-disputed" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </Card>

          {busy === "draft" && !draft ? <Skeleton className="h-[420px] w-full rounded-lg" /> : null}

          {!draft && busy !== "draft" ? (
            <div className="space-y-3" aria-hidden>
              {[
                { n: 2, title: "The page", description: "Name, what a donation pays for, the story, where and the goal." },
                { n: 3, title: "Paid tasks", description: "Shifts with pay per person, how many people, and the photo proof." },
              ].map((s) => (
                <div key={s.n} className="flex items-start gap-3 rounded-lg border border-dashed border-line px-5 py-4">
                  <span className="tabular mt-0.5 flex size-6 flex-none items-center justify-center rounded-full bg-sunken text-[12px] font-semibold text-faint ring-1 ring-inset ring-line">
                    {s.n}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-semibold leading-6 tracking-[-0.012em] text-muted">{s.title}</div>
                    <div className="text-[13px] leading-snug text-faint">{s.description} Fills in after the draft.</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {draft ? (
            <>
              {draft.invented.length || draft.missing.length ? (
                <div className="space-y-2">
                  {draft.invented.length ? (
                    <div className="flex gap-3 rounded-[12px] bg-refunded-bg px-4 py-3 text-[13px] leading-relaxed text-refunded ring-1 ring-inset ring-refunded/15">
                      <TriangleAlert className="mt-0.5 size-4 flex-none" strokeWidth={1.9} />
                      <span>
                        These numbers aren&apos;t in your text: <strong className="font-semibold">{draft.invented.join(", ")}</strong>.
                        Check them or take them out before publishing.
                      </span>
                    </div>
                  ) : null}
                  {draft.missing.length ? (
                    <div className="rounded-[12px] border border-line bg-canvas/60 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
                      <span className="font-medium text-ink">Your text doesn&apos;t say:</span> {draft.missing.join("; ")}.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* 2. Page */}
              <Card>
                <StepHeader n={2} title="The page" description="What donors read first. Edit anything." />
                <div className="grid gap-4 p-5 pt-4">
                  <div>
                    <Label htmlFor="b-name">Name</Label>
                    <Input id="b-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="b-tagline">What a donation pays for</Label>
                    <Input id="b-tagline" value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="b-story">Story</Label>
                    <Textarea
                      id="b-story"
                      value={draft.story.join("\n\n")}
                      onChange={(e) => setDraft({ ...draft, story: e.target.value.split(/\n{2,}/) })}
                      className="min-h-40"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="b-place">Where</Label>
                      <Input
                        id="b-place"
                        value={draft.locationLabel}
                        onChange={(e) => setDraft({ ...draft, locationLabel: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="b-goal">Goal</Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-faint">$</span>
                        <Input id="b-goal" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} className="tabular pl-6" />
                      </div>
                      {tasksTotal ? (
                        <div className="tabular mt-1.5 text-[12px] text-muted">The tasks below cost {formatCents(tasksTotal)}.</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>

              {/* 3. Tasks */}
              <Card>
                <StepHeader
                  n={3}
                  title="Paid tasks"
                  description="Shifts donors can fund. Workers are paid only after proof passes."
                  aside={<Badge tone="outline" className="tabular">{draft.tasks.length} {draft.tasks.length === 1 ? "task" : "tasks"}</Badge>}
                />
                <div className="space-y-3 p-5 pt-4">
                  {draft.tasks.map((t, i) => (
                    <div key={i} className="rounded-[12px] border border-line bg-canvas/40 p-3.5">
                      <div className="flex items-start gap-2">
                        <span className="tabular mt-2 flex size-5 flex-none items-center justify-center rounded-full bg-surface text-[11px] font-semibold text-muted ring-1 ring-inset ring-line">
                          {i + 1}
                        </span>
                        <Input
                          value={t.title}
                          onChange={(e) => setTask(i, { title: e.target.value })}
                          placeholder="What the shift is"
                          className="font-medium"
                          aria-label={`Task ${i + 1} title`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove task"
                          onClick={() => setDraft({ ...draft, tasks: draft.tasks.filter((_, j) => j !== i) })}
                        >
                          <X />
                        </Button>
                      </div>
                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3 pl-7 sm:pr-11">
                        <div>
                          <Label htmlFor={`t-pay-${i}`}>Pay per person</Label>
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-faint">$</span>
                            <Input
                              id={`t-pay-${i}`}
                              inputMode="decimal"
                              value={t.payoutCents ? String(t.payoutCents / 100) : ""}
                              onChange={(e) => setTask(i, { payoutCents: Math.round(Number(e.target.value || 0) * 100) })}
                              className="tabular pl-6"
                            />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor={`t-people-${i}`}>People</Label>
                          <Input
                            id={`t-people-${i}`}
                            inputMode="numeric"
                            value={String(t.spots)}
                            onChange={(e) => setTask(i, { spots: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })}
                            className="tabular"
                          />
                        </div>
                        <div className="pb-2 text-right">
                          <div className="text-[11.5px] text-faint">Funds in full at</div>
                          <div className="tabular text-[13.5px] font-semibold text-ink">{formatCents(t.payoutCents * t.spots)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-start gap-1.5 pl-7 text-[12.5px] text-muted">
                        <Camera className="mt-0.5 size-3.5 flex-none text-faint" strokeWidth={1.9} />
                        Proof: {t.proof.join(" · ")}
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        tasks: [
                          ...draft.tasks,
                          { title: "", description: "", payoutCents: 0, spots: 1, proof: ["Before photo", "After photo"] },
                        ],
                      })
                    }
                  >
                    <Plus /> Add a task
                  </Button>
                </div>
              </Card>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-5 py-3.5 shadow-card">
                <span className="text-[12.5px] text-muted">
                  {draft.by === "template" ? "Drafted by a template (no AI key set)." : `Drafted by ${draft.by}.`} Nothing is live
                  until you publish.
                </span>
                <Button variant="primary" onClick={runPublish} disabled={busy !== null}>
                  {busy === "publish" ? "Publishing…" : "Publish the page"}
                </Button>
              </div>
            </>
          ) : null}
        </div>

        {/* Live preview */}
        <div className="min-w-0 lg:sticky lg:top-20">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
              <Eye className="size-3.5" strokeWidth={1.9} />
              Live preview
            </div>
            <span className="text-[12px] text-faint">As it shows in Causes</span>
          </div>
          <Preview draft={draft} goalCents={goalCents} onExample={() => setSource(EXAMPLE)} hasSource={source.trim().length > 0} />
        </div>
      </div>
    </div>
  );
}

function StepHeader({
  n,
  title,
  description,
  aside,
  done,
}: {
  n: number;
  title: string;
  description: string;
  aside?: React.ReactNode;
  done?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "tabular mt-0.5 flex size-6 flex-none items-center justify-center rounded-full text-[12px] font-semibold",
            done ? "bg-green-300 text-ink" : "bg-ink text-white",
          )}
        >
          {n}
        </span>
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold leading-6 tracking-[-0.012em] text-ink">{title}</div>
          <div className="text-[13px] leading-snug text-muted">{description}</div>
        </div>
      </div>
      {aside ? <div className="flex-none pt-0.5">{aside}</div> : null}
    </div>
  );
}

/** The directory card, filled from the draft as it's edited. */
function Preview({
  draft,
  goalCents,
  onExample,
  hasSource,
}: {
  draft: Draft | null;
  goalCents: number;
  onExample: () => void;
  hasSource: boolean;
}) {
  const first = draft?.tasks.find((t) => t.payoutCents > 0);
  return (
    <div className="space-y-3">
      <Card className={cn("overflow-hidden", !draft && "opacity-90")}>
        <CauseCover hue={NEW_COVER_HUE} className="h-[120px] border-b border-line/70">
          {draft?.locationLabel ? (
            <PlaceChip label={draft.locationLabel} className="absolute bottom-3 left-3" />
          ) : (
            <span className="absolute bottom-3 left-3 h-6 w-28 rounded-full bg-surface/70" />
          )}
        </CauseCover>
        <div className="px-5 pt-4 pb-5">
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <Avatar name="Your organization" color="var(--color-steel-500)" size={20} square />
            <span className="font-medium text-ink-2">Your organization</span>
          </div>
          {draft ? (
            <>
              <div className="mt-2.5 text-[16px] font-semibold leading-snug tracking-[-0.015em] text-ink">
                {draft.name || <span className="text-faint">Name the cause</span>}
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">
                {draft.tagline || <span className="text-faint">What a donation pays for</span>}
              </p>
            </>
          ) : (
            <>
              <div className="mt-3 h-5 w-48 rounded-full bg-sunken" />
              <div className="mt-2 h-3.5 w-full rounded-full bg-sunken" />
              <div className="mt-1.5 h-3.5 w-2/3 rounded-full bg-sunken" />
            </>
          )}
          <div className="mt-5 flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-1.5">
              <Amount cents={0} size="lg" />
              <span className="tabular text-[12.5px] text-muted">of {goalCents ? formatCents(goalCents) : "your goal"}</span>
            </div>
            <span className="tabular text-[12.5px] font-medium text-ink-2">0%</span>
          </div>
          <RaisedBar raisedCents={0} goalCents={goalCents || 1} className="mt-2.5" thin />
        </div>
        <div className="flex items-center gap-3 border-t border-line bg-canvas/60 px-5 py-3 text-[13px] text-ink-2">
          {first ? (
            <span className="min-w-0 flex-1 truncate">
              <span className="tabular font-semibold text-ink">{formatCents(first.payoutCents)}</span> pays one person for one
              &ldquo;{first.title || "untitled"}&rdquo; shift
            </span>
          ) : (
            <span className="flex-1 text-faint">The price of one shift goes here</span>
          )}
          <span className="flex size-6 flex-none items-center justify-center rounded-full bg-surface text-muted ring-1 ring-inset ring-line">
            <ArrowRight className="size-3.5" strokeWidth={2} />
          </span>
        </div>
      </Card>

      {draft && draft.tasks.length ? (
        <Card>
          <div className="px-4 pt-3.5 pb-1 text-[12.5px] font-medium text-muted">Donors can fund</div>
          <ul className="px-2 pb-2">
            {draft.tasks.map((t, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-2 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-ink">{t.title || <span className="text-faint">Untitled task</span>}</div>
                  <div className="tabular text-[12px] text-muted">
                    {t.spots} {t.spots === 1 ? "person" : "people"} · {formatCents(t.payoutCents)} each
                  </div>
                </div>
                <span className="tabular text-[13px] font-semibold text-ink">{formatCents(t.payoutCents * t.spots)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : !draft ? (
        <div className="rounded-[12px] border border-dashed border-line px-4 py-4 text-[13px] leading-relaxed text-muted">
          The draft fills this in: a story in your own words, and paid tasks with pay, people and photo proof.
          {hasSource ? null : (
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={onExample}>
                Try the example
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
