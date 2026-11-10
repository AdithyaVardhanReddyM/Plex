"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ArrowRight, CircleAlert, Loader2, Workflow } from "lucide-react";
import { api } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, SectionHeading, Skeleton, Textarea } from "@/components/ui/primitives";
import { AiAgentIcon } from "@/components/ui/icons";
import { Amount } from "@/components/ui/money";
import { errorMessage } from "@/components/tasks/task-ui";
import { cn, formatCents, relativeTime } from "@/lib/utils";

const EXAMPLES = [
  "Launch my coffee cart: a logo, an Instagram launch post, and the menu in Spanish.",
  "Compare three CRMs for a 5-person agency, then write a one-page recommendation.",
  "Write a product announcement, then translate it into Spanish and Hindi.",
];

export const CREW_STATUS: Record<string, { label: string; tone: "neutral" | "green" | "steel" | "amber" | "red" }> = {
  draft: { label: "Draft", tone: "neutral" },
  running: { label: "Running", tone: "steel" },
  paused: { label: "Needs you", tone: "amber" },
  done: { label: "Done", tone: "green" },
  cancelled: { label: "Stopped", tone: "neutral" },
};

/** Crews: one goal, a team of agents, each step paid only when its proof passes. */
export function CrewsView() {
  const router = useRouter();
  const plan = useAction(api.crews.plan);
  const fromTemplate = useMutation(api.crews.fromTemplate);
  const crews = useQuery(api.crews.list, {});
  const templates = useQuery(api.crews.templates);
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("40");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  async function run(name: string, fn: () => Promise<string>) {
    setBusy(name);
    setError(undefined);
    try {
      router.push(`/crews/${await fn()}?build=1`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  const budgetCents = Math.round(Number(budget || 0) * 100);

  return (
    <div className="animate-rise">
      <PageHeader
        title="Crews"
        description="Say what you want done. Plex's planner splits it into steps and picks an agent for each. Every step holds its own money and pays only when its proof passes, so a crew can never spend on work that failed."
      />

      <Card className="p-6 sm:p-7">
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
          <AiAgentIcon className="size-[18px] text-green-700" /> What should your crew get done?
        </div>
        <Textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
          placeholder={EXAMPLES[0]}
          className="mt-4 min-h-[112px] resize-none border-0 bg-transparent px-0 font-display text-[22px] leading-snug font-semibold tracking-[-0.02em] shadow-none placeholder:text-faint/70 focus:ring-0 sm:text-[26px]"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setGoal(e)}
              className="rounded-full bg-sunken px-3 py-1.5 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-line/60"
            >
              {e}
            </button>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <label className="flex items-baseline gap-2">
            <span className="text-[12.5px] text-muted">Budget</span>
            <span className="flex items-baseline">
              <span className="font-display text-[28px] font-bold tracking-[-0.03em] text-faint">$</span>
              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                aria-label="Budget in dollars"
                className="w-24 border-0 bg-transparent p-0 font-display text-[28px] font-bold tracking-[-0.03em] text-ink tabular focus:outline-none"
              />
            </span>
            <span className="text-[12.5px] text-faint">for the whole crew, never more</span>
          </label>
          <Button
            variant="primary"
            size="lg"
            disabled={!!busy || goal.trim().length < 12 || budgetCents < 300}
            onClick={() => run("plan", async () => (await plan({ goal, budgetCents })).crewId)}
          >
            {busy === "plan" ? <Loader2 className="animate-spin" /> : <Workflow />}
            {busy === "plan" ? "Planning the crew…" : "Plan my crew"}
          </Button>
        </div>
        {error ? (
          <p className="mt-3 flex items-start gap-2 text-[12.5px] text-disputed" role="alert">
            <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} /> {error}
          </p>
        ) : null}
      </Card>

      <SectionHeading title="Start from a crew that works" className="mt-10" />
      <div className="grid gap-4 md:grid-cols-3">
        {templates === undefined
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[150px] rounded-lg" />)
          : templates.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={!!busy}
                onClick={() => run(t.key, () => fromTemplate({ key: t.key }))}
                className="group text-left disabled:opacity-60"
              >
                <Card className="flex h-full flex-col p-5 transition-shadow group-hover:shadow-[0_12px_32px_-16px_rgb(12_21_18/0.3)]">
                  <div className="text-[14.5px] font-semibold text-ink">{t.title}</div>
                  <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted">{t.blurb}</p>
                  <div className="mt-4 flex items-center justify-between text-[12.5px]">
                    <span className="text-faint">
                      {t.steps} steps · up to {formatCents(t.budgetCents)}
                    </span>
                    <span className="flex items-center gap-1 font-medium text-ink">
                      {busy === t.key ? <Loader2 className="size-3.5 animate-spin" /> : null} Use it <ArrowRight className="size-3.5" />
                    </span>
                  </div>
                </Card>
              </button>
            ))}
      </div>

      <SectionHeading title="Your crews" className="mt-10" />
      <Card className="p-2">
        {crews === undefined ? (
          <div className="p-3">
            <Skeleton className="h-12 w-full" />
          </div>
        ) : crews.length === 0 ? (
          <EmptyState icon={<Workflow />} title="No crews yet" body="Describe a goal above, or start from one of the crews that work." className="py-10" />
        ) : (
          crews.map((c) => {
            const st = CREW_STATUS[c.status] ?? CREW_STATUS.draft!;
            return (
              <Link
                key={c._id}
                href={`/crews/${c._id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-5 rounded-[12px] px-3 py-3 transition-colors hover:bg-sunken/70"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-ink">{c.title}</div>
                  <div className="truncate text-[12px] text-muted">
                    {c.paid} of {c.steps} steps paid · {relativeTime(c.updatedAt)}
                    {c.slug ? " · published" : ""}
                  </div>
                </div>
                <div className="text-right">
                  <Amount cents={c.spentCents} size="md" className={cn(c.spentCents ? "text-ink" : "text-faint")} />
                  <div className="text-[11.5px] text-faint">of {formatCents(c.budgetCents)}</div>
                </div>
                <Badge tone={st.tone}>{st.label}</Badge>
              </Link>
            );
          })
        )}
      </Card>
    </div>
  );
}
