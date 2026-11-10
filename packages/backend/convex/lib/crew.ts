/**
 * Pure rules for Crews: a goal split into steps that run in order of their
 * dependencies. Shared by Convex and the web canvas. No Convex server imports.
 */
import type { Doc } from "../_generated/dataModel";

export type CrewStep = Doc<"crews">["steps"][number];
export type StepState = "waiting" | "ready" | "funding" | "needs_approval" | "bidding" | "working" | "checking" | "paid" | "failed";

export const MAX_STEPS = 6;
export const COL_W = 340;
export const ROW_H = 190;

/** A step that acts in GitHub (writes code, opens or merges a pull request): it needs the crew's GitHub connection. */
export function stepNeedsGithub(step: Pick<CrewStep, "title" | "brief">): boolean {
  return /github|pull request|\bPR\b|\brepo(sitory)?\b/i.test(`${step.title} ${step.brief}`);
}

/**
 * What must be true before a draft crew runs, as plain checks. `blocking` ones
 * stop Run; the others are advice.
 */
export function crewReadiness(
  steps: Pick<CrewStep, "title" | "brief" | "agentHandle" | "building" | "payoutCents">[],
  facts: { budgetCents: number; githubConnected: boolean; autoPayOn: boolean },
): { key: "agents" | "github" | "paypal" | "budget"; ok: boolean; blocking: boolean; text: string }[] {
  const building = steps.filter((s) => s.building);
  const open = steps.filter((s) => !s.agentHandle && !s.building);
  const github = steps.filter(stepNeedsGithub);
  const total = steps.reduce((a, s) => a + s.payoutCents, 0);
  const out: ReturnType<typeof crewReadiness> = [
    {
      key: "agents",
      ok: !building.length,
      blocking: building.length > 0,
      text: building.length
        ? `Building ${building.length === 1 ? "an agent" : `${building.length} agents`} for ${building.map((s) => s.title).join(" and ")}`
        : open.length
          ? `${open.map((s) => s.title).join(" and ")}: agents will bid`
          : `Every step has its agent`,
    },
  ];
  if (github.length)
    out.push({
      key: "github",
      ok: facts.githubConnected,
      blocking: !facts.githubConnected,
      text: facts.githubConnected ? `GitHub is connected for ${github.map((s) => s.title).join(" and ")}` : `${github.map((s) => s.title).join(" and ")} act in GitHub: connect it`,
    });
  out.push({
    key: "paypal",
    ok: facts.autoPayOn,
    blocking: false,
    text: facts.autoPayOn ? "Auto-pay holds each step as it starts" : "You'll approve each step's hold at PayPal",
  });
  out.push({ key: "budget", ok: total <= facts.budgetCents, blocking: total > facts.budgetCents, text: `Steps add up to $${(total / 100).toFixed(total % 100 ? 2 : 0)} of $${(facts.budgetCents / 100).toFixed(0)}` });
  return out;
}

/** Keys unique, dependencies real, no cycles, at most MAX_STEPS. Returns the problem, or null. */
export function planProblem(steps: Pick<CrewStep, "key" | "dependsOn">[]): string | null {
  if (!steps.length) return "A crew needs at least one step.";
  if (steps.length > MAX_STEPS) return `A crew has at most ${MAX_STEPS} steps.`;
  const keys = new Set(steps.map((s) => s.key));
  if (keys.size !== steps.length) return "Two steps share a name.";
  for (const s of steps) for (const d of s.dependsOn) if (!keys.has(d) || d === s.key) return `“${s.key}” depends on a step that isn't there.`;
  return depths(steps) ? null : "The steps loop back on each other.";
}

/** Longest path from a start step, per key; null when there's a cycle. */
export function depths(steps: Pick<CrewStep, "key" | "dependsOn">[]): Record<string, number> | null {
  const by = new Map(steps.map((s) => [s.key, s]));
  const memo: Record<string, number> = {};
  const visiting = new Set<string>();
  const depth = (k: string): number => {
    if (k in memo) return memo[k]!;
    if (visiting.has(k)) throw new Error("cycle");
    visiting.add(k);
    const deps = by.get(k)?.dependsOn ?? [];
    const d = deps.length ? 1 + Math.max(...deps.map(depth)) : 0;
    visiting.delete(k);
    return (memo[k] = d);
  };
  try {
    for (const s of steps) depth(s.key);
    return memo;
  } catch {
    return null;
  }
}

/** Columns by dependency depth, rows centered: a readable left-to-right flow. */
export function layout<T extends Pick<CrewStep, "key" | "dependsOn">>(steps: T[]): (T & { x: number; y: number })[] {
  const d = depths(steps) ?? {};
  const cols = new Map<number, T[]>();
  for (const s of steps) cols.set(d[s.key] ?? 0, [...(cols.get(d[s.key] ?? 0) ?? []), s]);
  const tallest = Math.max(...[...cols.values()].map((c) => c.length));
  return steps.map((s) => {
    const col = cols.get(d[s.key] ?? 0)!;
    const i = col.indexOf(s);
    return { ...s, x: (d[s.key] ?? 0) * COL_W, y: (i + (tallest - col.length) / 2) * ROW_H };
  });
}

/** Payouts fit inside the budget: scaled down if over, never under $1 a step. */
export function fitBudget(payouts: number[], budgetCents: number): number[] {
  const total = payouts.reduce((a, b) => a + b, 0);
  if (total <= budgetCents) return payouts.map((c) => Math.max(100, Math.round(c / 50) * 50));
  return payouts.map((c) => Math.max(100, Math.floor(((c * budgetCents) / total) / 50) * 50));
}

/** What a step is doing, from its task (and whether the steps before it are done). */
export function stepState(
  step: Pick<CrewStep, "taskId" | "note">,
  task: Pick<Doc<"tasks">, "status" | "funding"> | null,
  proof: Pick<Doc<"proofs">, "status"> | null,
  depsDone: boolean,
): StepState {
  if (!step.taskId || !task) return depsDone ? "ready" : "waiting";
  switch (task.status) {
    case "draft":
      return step.note?.startsWith("http") ? "needs_approval" : "funding";
    case "open":
      return "bidding";
    case "assigned":
    case "rejected":
      return "working";
    case "submitted":
    case "verifying":
      return proof?.status === "fail" ? "failed" : "checking";
    case "approved":
    case "paid":
      return "paid";
    case "disputed":
    case "refunded":
    case "cancelled":
      return "failed";
    default:
      return "working";
  }
}

export const STATE_WORDS: Record<StepState, string> = {
  waiting: "Waiting on earlier steps",
  ready: "Ready",
  funding: "Holding the money",
  needs_approval: "Approve at PayPal",
  bidding: "Agents bidding",
  working: "Working",
  checking: "Checking the proof",
  paid: "Proof passed, paid",
  failed: "Stopped",
};

// ── Templates ────────────────────────────────────────────────────────────────

type TemplateStep = Omit<CrewStep, "x" | "y" | "taskId" | "note">;
export type CrewTemplate = { key: string; title: string; goal: string; budgetCents: number; blurb: string; steps: TemplateStep[] };

export const TEMPLATES: CrewTemplate[] = [
  {
    key: "launch-kit",
    title: "Launch kit for a small business",
    goal: "Launch Kettle Corner, a coffee cart in the Mission: a logo, a short Instagram launch post, and the menu in Spanish.",
    budgetCents: 40_00,
    blurb: "Logo, launch post and a Spanish menu, each paid when it passes",
    steps: [
      {
        key: "logo",
        title: "Logo",
        brief: "Design a logo for Kettle Corner, a friendly coffee cart in the Mission, San Francisco. Two colors, a simple kettle mark, the name spelled exactly “Kettle Corner”.",
        deliver: { label: "Logo", description: "A square logo image with the name “Kettle Corner”, two colors", type: "file" },
        payoutCents: 15_00,
        dependsOn: [],
      },
      {
        key: "post",
        title: "Launch post",
        brief: "Write an Instagram launch post for Kettle Corner's opening day this Saturday. Warm, short, two or three relevant hashtags. Refer to the logo from the earlier step.",
        deliver: { label: "Launch post", description: "An Instagram caption of 40 to 70 words with two or three hashtags", type: "text" },
        payoutCents: 8_00,
        dependsOn: ["logo"],
      },
      {
        key: "menu",
        title: "Spanish menu",
        brief: "Translate Kettle Corner's menu into natural Mexican Spanish, one item per line, English then Spanish: Drip coffee, Oat latte, Cold brew, Chai, Croissant, Banana bread, Hot chocolate.",
        deliver: { label: "Spanish menu", description: "All 7 items, one per line, English then Spanish", type: "text" },
        payoutCents: 8_00,
        dependsOn: [],
      },
    ],
  },
  {
    key: "research-brief",
    title: "Research to a one-page brief",
    goal: "Compare three standing desks under $400 that fit a 100 cm wall, then turn it into a short buying brief for my team.",
    budgetCents: 30_00,
    blurb: "A sourced comparison, then a plain one-page brief from it",
    steps: [
      {
        key: "research",
        title: "Compare desks",
        brief: "Compare three standing desks under $400 that fit a 100 cm wide wall. For each: width, height range, motor, warranty and price, each with its source.",
        deliver: { label: "Findings", description: "The comparison, with a short recommendation first", type: "text" },
        payoutCents: 15_00,
        dependsOn: [],
      },
      {
        key: "brief",
        title: "Team brief",
        brief: "Turn the desk comparison from the earlier step into a one-page buying brief for a small team: the pick, why, and the runner-up.",
        deliver: { label: "Brief", description: "A brief of 120 to 180 words", type: "text" },
        payoutCents: 8_00,
        dependsOn: ["research"],
      },
    ],
  },
  {
    key: "global-post",
    title: "One post, three languages",
    goal: "Write a LinkedIn post announcing our new feature, then translate it into Spanish and Hindi.",
    budgetCents: 25_00,
    blurb: "Write once, then two translators work side by side",
    steps: [
      {
        key: "post",
        title: "English post",
        brief: "Write a LinkedIn post announcing that Plex now lets a team of AI agents run a job end to end, each paid only when its proof passes. Plain and specific, no hype.",
        deliver: { label: "Post", description: "A post of 80 to 120 words", type: "text" },
        payoutCents: 8_00,
        dependsOn: [],
      },
      {
        key: "spanish",
        title: "Spanish",
        brief: "Translate the LinkedIn post from the earlier step into natural Spanish, keeping its tone and length.",
        deliver: { label: "Spanish post", description: "The post in Spanish", type: "text" },
        payoutCents: 6_00,
        dependsOn: ["post"],
      },
      {
        key: "hindi",
        title: "Hindi",
        brief: "Translate the LinkedIn post from the earlier step into natural Hindi (Devanagari), keeping its tone and length.",
        deliver: { label: "Hindi post", description: "The post in Hindi", type: "text" },
        payoutCents: 6_00,
        dependsOn: ["post"],
      },
    ],
  },
];
