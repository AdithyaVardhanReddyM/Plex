"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { ArrowLeft, Camera, Plus, TriangleAlert, X } from "lucide-react";
import { api } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, Input, Label, PageHeader, Textarea } from "@/components/ui/primitives";
import { cn, formatCents } from "@/lib/utils";
import { CauseCover, PlaceChip } from "./parts";

type Draft = FunctionReturnType<typeof api.causeBuilder.draft>;
type DraftTask = Draft["tasks"][number];

const EXAMPLE = `Bayview Seed Library

We run a free seed library at the Bayview branch library in San Francisco. Every spring, gardeners drop off seeds from their own plots, and neighbors take what they want to grow.

Packaging day, Saturday: 3 people x 4 hours, $18 an hour each. Proof: photo of the sorted trays and the labeled packets.

Donations pay the packers. The seeds, envelopes and the room are donated.`;

const errorText = (err: unknown, fallback: string) => (err instanceof ConvexError ? String(err.data) : fallback);

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

  return (
    <div className="animate-rise">
      <Link href="/causes" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.9} /> Causes
      </Link>
      <PageHeader
        title="Build a cause page"
        description="Paste what your organization already says about the work. Plex drafts the story and the paid tasks. It only uses facts and numbers from your text, and it flags anything missing."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="self-start">
          <CardHeader title="Your text" description="Website copy, a flyer, a grant summary. Plain text is fine." />
          <div className="p-5 pt-4">
            <Textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Who you are, what the work is, where it happens, and what one shift pays."
              className="min-h-72 font-[inherit]"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="text-[13px] font-medium text-muted hover:text-ink"
                onClick={() => setSource(EXAMPLE)}
              >
                Use an example
              </button>
              <Button variant="primary" onClick={runDraft} disabled={busy !== null || source.trim().length < 80}>
                {busy === "draft" ? "Drafting…" : draft ? "Draft again" : "Draft the page"}
              </Button>
            </div>
            {error ? (
              <p className="mt-3 rounded-sm bg-disputed-bg px-3 py-2 text-[12.5px] text-disputed" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </Card>

        {draft ? (
          <div className="space-y-4">
            {draft.invented.length || draft.missing.length ? (
              <Card className="p-4">
                {draft.invented.length ? (
                  <p className="flex gap-2 text-[13px] leading-relaxed text-refunded">
                    <TriangleAlert className="mt-0.5 size-4 flex-none" strokeWidth={1.9} />
                    <span>
                      These numbers aren&apos;t in your text: <strong>{draft.invented.join(", ")}</strong>. Check them or take
                      them out before publishing.
                    </span>
                  </p>
                ) : null}
                {draft.missing.length ? (
                  <div className={cn("text-[13px] leading-relaxed text-ink-2", draft.invented.length && "mt-2")}>
                    <span className="font-medium text-ink">Your text doesn&apos;t say:</span> {draft.missing.join("; ")}.
                  </div>
                ) : null}
              </Card>
            ) : null}

            <Card className="overflow-hidden">
              <CauseCover hue={180} className="h-24">
                {draft.locationLabel ? <PlaceChip label={draft.locationLabel} className="absolute bottom-3 left-3" /> : null}
              </CauseCover>
              <div className="space-y-3 p-5">
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="b-place">Where</Label>
                    <Input
                      id="b-place"
                      value={draft.locationLabel}
                      onChange={(e) => setDraft({ ...draft, locationLabel: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="b-goal">Goal ($)</Label>
                    <Input id="b-goal" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} className="tabular" />
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Impact tasks" description="Paid shifts that donors can fund. Workers are paid only after proof passes." />
              <div className="space-y-3 p-5 pt-4">
                {draft.tasks.map((t, i) => (
                  <div key={i} className="rounded-md p-3 ring-1 ring-inset ring-line">
                    <div className="flex items-start gap-2">
                      <Input value={t.title} onChange={(e) => setTask(i, { title: e.target.value })} className="font-medium" />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove task"
                        onClick={() => setDraft({ ...draft, tasks: draft.tasks.filter((_, j) => j !== i) })}
                      >
                        <X />
                      </Button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <Label>Pay per person ($)</Label>
                        <Input
                          inputMode="decimal"
                          value={t.payoutCents ? String(t.payoutCents / 100) : ""}
                          onChange={(e) => setTask(i, { payoutCents: Math.round(Number(e.target.value || 0) * 100) })}
                          className="tabular"
                        />
                      </div>
                      <div>
                        <Label>People</Label>
                        <Input
                          inputMode="numeric"
                          value={String(t.spots)}
                          onChange={(e) => setTask(i, { spots: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })}
                          className="tabular"
                        />
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-start gap-1.5 text-[12.5px] text-muted">
                      <Camera className="mt-0.5 size-3.5 flex-none text-faint" strokeWidth={1.9} />
                      {t.proof.join(" · ")}
                    </div>
                    <div className="tabular mt-1 text-[12.5px] text-muted">
                      Funds in full at {formatCents(t.payoutCents * t.spots)}
                    </div>
                  </div>
                ))}
                <Button
                  variant="ghost"
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

            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-faint">
                {draft.by === "template" ? "Drafted by a template (no AI key set)" : `Drafted by ${draft.by}`}
              </span>
              <Button variant="primary" onClick={runPublish} disabled={busy !== null}>
                {busy === "publish" ? "Publishing…" : "Publish the page"}
              </Button>
            </div>
          </div>
        ) : (
          <Card className="flex min-h-72 items-center justify-center self-start border-dashed bg-transparent shadow-none">
            <div className="max-w-xs px-6 py-10 text-center text-[13px] leading-relaxed text-muted">
              The draft appears here: a story in your own words, and paid tasks with pay, people and photo proof.
              <div className="mt-3">
                <button type="button" className={buttonVariants({ variant: "secondary", size: "sm" })} onClick={() => setSource(EXAMPLE)}>
                  Try the example
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
