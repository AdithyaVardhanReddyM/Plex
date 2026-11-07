import { generateText, Output } from "ai";
import { aiConfigured, geminiModel } from "./ai";
import { z } from "zod";
import {
  aggregate,
  agentOf,
  applyFilter,
  CHART_TYPES,
  COLUMN_KEYS,
  GROUP_KEYS,
  kindLabel,
  partyOf,
  RECEIPT_KINDS,
  RECEIPT_STATES,
  ROLE_LABEL,
  sumCents,
  type LedgerReceipt,
  type LedgerRole,
  type WidgetFilter,
  type WidgetSpec,
} from "./ledgerSpec";
import { formatCents } from "./money";

/**
 * Plex Analyst: the Ledger's dashboard agent.
 *
 * It turns a money question into a short answer plus one or two widget specs
 * from the closed vocabulary in `ledgerSpec.ts`. The client renders the specs
 * live over the same receipts. With a Gemini key it uses structured output;
 * without one, a deterministic intent parser handles the demo questions and the
 * result is labelled as such.
 *
 * The runner is a plain function (question + scoped data in, typed result out)
 * so an AG Studio Agent Framework harness can call it as a custom agent.
 */

export interface AnalystInput {
  question: string;
  role: LedgerRole;
  receipts: LedgerReceipt[];
  now: number;
  viewerName: string;
}

export interface AnalystResult {
  answer: string;
  widgets: WidgetSpec[];
  followUps: string[];
  engine: "gemini" | "heuristic";
  engineNote?: string;
}

export const DEMO_QUESTIONS: Record<LedgerRole, string[]> = {
  personal: [
    "Where did my money go this week?",
    "What did my agents buy?",
    "Show my spending by day",
    "What's still held?",
  ],
  poster: [
    "What's held right now?",
    "Who did I pay this month?",
    "Show refunds and disputes",
    "How much went to Errands?",
  ],
  cause: [
    "Who gave the most?",
    "Show donations by week",
    "How much did shift workers earn?",
    "Which gifts came from saved money?",
  ],
};

export async function runAnalyst(input: AnalystInput): Promise<AnalystResult> {
  if (aiConfigured()) {
    try {
      return await runGemini(input);
    } catch (err) {
      const result = runHeuristic(input);
      return { ...result, engineNote: `Gemini failed (${(err as Error).message.slice(0, 80)}); deterministic parser used` };
    }
  }
  return { ...runHeuristic(input), engineNote: "No Gemini key: deterministic intent parser" };
}

// ── Gemini (structured output) ───────────────────────────────────────────────

const zFilter = z.object({
  sinceDays: z.number().int().min(1).max(90).optional().describe("Only the last N days. 7 for 'this week', 30 for 'this month'."),
  kinds: z.array(z.enum(RECEIPT_KINDS)).optional(),
  states: z.array(z.enum(RECEIPT_STATES)).optional(),
  categories: z.array(z.string()).optional().describe("Pot categories, e.g. Food, Shopping, Errands, Giving"),
  agents: z.array(z.string()).optional().describe("Agent names exactly as listed, or 'You'"),
  parties: z.array(z.string()).optional().describe("Merchant or person names (substring match)"),
  direction: z.enum(["in", "out"]).optional(),
  search: z.string().optional().describe("Free-text match on the why, party or rule"),
});

const zWidget = z.object({
  kind: z.enum(["grid", "chart", "stat"]),
  title: z.string().max(60),
  subtitle: z.string().max(90).optional(),
  filter: zFilter,
  columns: z.array(z.enum(COLUMN_KEYS)).optional().describe("Grid only. Usually when, party, why, state, amount."),
  sort: z.object({ column: z.enum(COLUMN_KEYS), desc: z.boolean() }).optional(),
  chart: z
    .object({
      type: z.enum(CHART_TYPES),
      groupBy: z.enum(GROUP_KEYS),
      measure: z.enum(["sum", "count"]),
      stackBy: z.enum(GROUP_KEYS).optional(),
    })
    .optional()
    .describe("Chart only. donut for shares, column for time, bar for ranked lists."),
  stat: z.object({ measure: z.enum(["sum", "count", "avg"]), compareToPrevious: z.boolean().optional() }).optional(),
});

const zResult = z.object({
  answer: z.string().max(320).describe("Two sentences at most, plain and specific, quoting real amounts from the data."),
  widgets: z.array(zWidget).min(1).max(2),
  followUps: z.array(z.string().max(48)).max(3),
});

async function runGemini(input: AnalystInput): Promise<AnalystResult> {
  const { receipts, now } = input;
  const rows = receipts
    .slice(0, 120)
    .map((r) =>
      [
        new Date(r.occurredAt).toISOString().slice(0, 10),
        kindLabel(r.kind),
        r.state,
        formatCents(r.amountCents),
        partyOf(r),
        r.category ?? "-",
        agentOf(r),
        `"${r.why.slice(0, 70)}"`,
      ].join(" | "),
    )
    .join("\n");
  const agents = [...new Set(receipts.map(agentOf))].join(", ");
  const categories = [...new Set(receipts.map((r) => r.category).filter(Boolean))].join(", ");

  const { output } = await generateText({
    model: geminiModel(process.env.GEMINI_MODEL ?? "gemini-2.5-flash")!,
    output: Output.object({ schema: zResult }),
    system: [
      "You are Plex Analyst, the agent inside Plex Ledger. Plex is a money layer where agents spend and hire people within limits, and every payment has a Receipt (why, rule, evidence).",
      `You are looking at the ${ROLE_LABEL[input.role]} view for ${input.viewerName}. Today is ${new Date(now).toISOString().slice(0, 10)}.`,
      "Answer the question with real numbers from the receipts below, then choose one or two widgets that show it. Prefer one chart plus one grid. Never invent receipts, people or amounts.",
      "States: held = Plex is holding the money until proof passes; released/paid = money moved; refunded; disputed.",
      `Agents: ${agents}. Categories: ${categories}.`,
    ].join("\n"),
    prompt: `Receipts (date | kind | state | amount | party | category | agent | why):\n${rows}\n\nQuestion: ${input.question}`,
  });
  if (!output) throw new Error("empty output");
  return { ...output, engine: "gemini" };
}

// ── Deterministic intent parser ──────────────────────────────────────────────

/** Word-prefix match, so "pending" doesn't fire inside "spending". */
const has = (q: string, ...words: string[]) =>
  words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(q));

function timeWindow(q: string): { sinceDays?: number; phrase: string } {
  if (has(q, "today")) return { sinceDays: 1, phrase: "today" };
  if (has(q, "yesterday")) return { sinceDays: 2, phrase: "since yesterday" };
  if (has(q, "this week", "past week", "last week", "7 days", "seven days")) return { sinceDays: 7, phrase: "this week" };
  if (has(q, "two weeks", "2 weeks", "14 days", "fortnight")) return { sinceDays: 14, phrase: "in the last two weeks" };
  if (has(q, "this month", "past month", "last month", "30 days")) return { sinceDays: 30, phrase: "this month" };
  return { phrase: "in the last three weeks" };
}

const GRID = (title: string, filter: WidgetFilter, extra: Partial<WidgetSpec> = {}): WidgetSpec => ({
  kind: "grid",
  title,
  filter,
  columns: ["when", "party", "why", "agent", "state", "amount"],
  sort: { column: "when", desc: true },
  ...extra,
});

export function runHeuristic(input: AnalystInput): Omit<AnalystResult, "engineNote"> {
  const q = input.question.toLowerCase().replace(/[’']/g, "'");
  const { sinceDays, phrase } = timeWindow(q);
  const { receipts, now, role } = input;
  const when = sinceDays ? { sinceDays } : {};
  const pick = (f: WidgetFilter) => applyFilter(receipts, f, now);
  const money = formatCents;

  // Known names in the data, so "Kettle Corner" or "Rosa" filter directly.
  const categories = [...new Set(receipts.map((r) => r.category).filter((c): c is string => Boolean(c)))];
  const parties = [...new Set(receipts.map(partyOf))].filter((p) => p.length > 2);
  const agents = [...new Set(receipts.map((r) => r.agentLabel).filter((a): a is string => Boolean(a)))];
  const category = categories.find((c) => q.includes(c.toLowerCase()));
  const party = parties.find((p) => q.includes(p.toLowerCase()) || q.includes(p.split(" ")[0]!.toLowerCase() + " "));
  const agent = agents.find((a) => q.includes(a.toLowerCase().split(" ")[0]!.replace(/[()]/g, "")) && !q.includes("agents"));

  // Held / pending money
  if (has(q, "held", "holding", "escrow", "waiting", "pending", "locked")) {
    const f: WidgetFilter = { states: ["held", "funded"], ...when };
    const rows = pick(f);
    const total = sumCents(rows);
    return {
      answer: rows.length
        ? `${money(total)} is held across ${rows.length} receipt${rows.length === 1 ? "" : "s"}. It moves only when proof passes or the payer pays; otherwise it's refunded.`
        : "Nothing is held right now.",
      widgets: [
        { kind: "stat", title: "Held now", filter: f, stat: { measure: "sum" } },
        GRID("What's held", f, { columns: ["when", "party", "why", "rule", "state", "amount"] }),
      ],
      followUps: ["What was released this week?", "Show refunds and disputes"],
      engine: "heuristic",
    };
  }

  // Refunds and disputes
  if (has(q, "refund", "dispute", "failed", "fail", "went wrong", "problem")) {
    const f: WidgetFilter = { states: ["refunded", "disputed"], ...when };
    const rows = pick(f);
    const refunded = rows.filter((r) => r.state === "refunded");
    const disputed = rows.filter((r) => r.state === "disputed");
    return {
      answer: `${refunded.length} refund${refunded.length === 1 ? "" : "s"} (${money(sumCents(refunded))}) and ${disputed.length} dispute${disputed.length === 1 ? "" : "s"} (${money(sumCents(disputed))}) ${phrase}. Each one carries the proof check that triggered it.`,
      widgets: [
        { kind: "chart", title: "Refunds and disputes by week", filter: f, chart: { type: "column", groupBy: "week", measure: "sum", stackBy: "state" } },
        GRID("Refunds and disputes", f, { columns: ["when", "party", "why", "rule", "state", "amount"] }),
      ],
      followUps: ["What's held right now?", "Who did I pay this month?"],
      engine: "heuristic",
    };
  }

  // Agents
  if (has(q, "agent", "claude", "mcp", "bot", "automat") || agent) {
    const f: WidgetFilter = { direction: "out", ...when, ...(agent ? { agents: [agent] } : {}) };
    const rows = pick(f).filter((r) => r.agentLabel);
    const byAgent = aggregate(rows, "agent", "sum").buckets;
    const lead = byAgent[0];
    return {
      answer: lead
        ? `Your agents spent ${money(sumCents(rows))} ${phrase} across ${rows.length} receipts. ${lead.label} spent the most: ${money(lead.value)}.`
        : `Your agents haven't spent anything ${phrase}.`,
      widgets: [
        { kind: "chart", title: "Spend by agent", filter: { ...f, agents: agent ? [agent] : agents }, chart: { type: "bar", groupBy: "agent", measure: "sum", stackBy: "category" } },
        GRID(agent ? `What ${agent} bought` : "What your agents bought", { ...f, agents: agent ? [agent] : agents }, {
          columns: ["when", "party", "why", "agent", "rule", "amount"],
        }),
      ],
      followUps: ["What's the biggest purchase?", "Where did my money go this week?"],
      engine: "heuristic",
    };
  }

  // Donations, giving, causes
  if (role === "cause" || has(q, "donat", "giv", "cause", "charity", "saved money", "savings fund")) {
    if (role === "cause" && has(q, "shift", "worker", "earn", "payout", "paid")) {
      const f: WidgetFilter = { kinds: ["payout"], ...when };
      const rows = pick(f);
      return {
        answer: `${money(sumCents(rows))} went to local workers across ${rows.length} paid shifts ${phrase}, each released only after its before-and-after photos passed.`,
        widgets: [
          { kind: "chart", title: "Paid to each worker", filter: f, chart: { type: "bar", groupBy: "party", measure: "sum" } },
          GRID("Shift payouts", f, { columns: ["when", "party", "why", "rule", "amount"] }),
        ],
        followUps: ["Who gave the most?", "Show donations by week"],
        engine: "heuristic",
      };
    }
    const saved = has(q, "saved", "savings", "agent saved");
    const f: WidgetFilter = { kinds: ["donation"], ...when, ...(saved ? { search: "saved" } : {}) };
    const rows = pick(f);
    const byWeek = has(q, "week", "trend", "over time", "by day");
    const top = aggregate(rows, "party", "sum").buckets[0];
    return {
      answer: rows.length
        ? `${money(sumCents(rows))} in ${rows.length} donation${rows.length === 1 ? "" : "s"} ${phrase}.${top ? ` The largest giver: ${top.label}, ${money(top.value)}.` : ""}`
        : `No donations ${phrase}.`,
      widgets: [
        byWeek
          ? { kind: "chart", title: "Donations by week", filter: f, chart: { type: "column", groupBy: "week", measure: "sum" } }
          : { kind: "chart", title: saved ? "Gifts from saved money" : "Top donors", filter: f, chart: { type: "bar", groupBy: "party", measure: "sum" } },
        GRID(saved ? "Gifts from saved money" : "Donations", f, { columns: ["when", "party", "why", "agent", "state", "amount"] }),
      ],
      followUps: role === "cause" ? ["How much did shift workers earn?", "Show donations by week"] : ["Where did my money go this week?"],
      engine: "heuristic",
    };
  }

  // People paid (payouts)
  if (has(q, "who did i pay", "workers", "payout", "paid out", "who got", "top worker", "who earned")) {
    const f: WidgetFilter = { kinds: ["payout"], ...when };
    const rows = pick(f);
    const top = aggregate(rows, "party", "sum").buckets[0];
    return {
      answer: rows.length
        ? `You paid ${money(sumCents(rows))} to ${new Set(rows.map(partyOf)).size} people ${phrase}, every payout released on proof.${top ? ` ${top.label} earned the most: ${money(top.value)}.` : ""}`
        : `No payouts ${phrase}.`,
      widgets: [
        { kind: "chart", title: "Paid per person", filter: f, chart: { type: "bar", groupBy: "party", measure: "sum" } },
        GRID("Payouts", f, { columns: ["when", "party", "why", "rule", "state", "amount"] }),
      ],
      followUps: ["Show refunds and disputes", "What's held right now?"],
      engine: "heuristic",
    };
  }

  // Biggest purchases
  if (has(q, "biggest", "largest", "most expensive", "top purchase", "big ")) {
    const f: WidgetFilter = { direction: "out", ...when };
    const rows = pick(f).sort((a, b) => b.amountCents - a.amountCents);
    const top = rows[0];
    return {
      answer: top ? `Your biggest payment ${phrase} was ${money(top.amountCents)} to ${partyOf(top)}: “${top.why}”.` : `Nothing spent ${phrase}.`,
      widgets: [GRID("Largest payments", f, { sort: { column: "amount", desc: true }, columns: ["when", "party", "why", "rule", "agent", "amount"] })],
      followUps: ["What did my agents buy?", "Where did my money go this week?"],
      engine: "heuristic",
    };
  }

  // Time series
  if (has(q, "by day", "per day", "daily", "trend", "over time", "each day", "by week")) {
    const byWeek = has(q, "week");
    const f: WidgetFilter = { direction: "out", sinceDays: sinceDays ?? (byWeek ? 28 : 14), ...(category ? { categories: [category] } : {}) };
    const rows = pick(f);
    const days = new Set(rows.map((r) => new Date(r.occurredAt).toDateString())).size || 1;
    return {
      answer: `${money(sumCents(rows))} over ${byWeek ? "the last four weeks" : `the last ${f.sinceDays} days`}, about ${money(Math.round(sumCents(rows) / Math.max(days, 1)))} on a day you spent anything.`,
      widgets: [
        { kind: "chart", title: byWeek ? "Spend by week" : "Spend by day", filter: f, chart: { type: "column", groupBy: byWeek ? "week" : "day", measure: "sum", stackBy: "category" } },
      ],
      followUps: ["Where did my money go this week?", "What's the biggest purchase?"],
      engine: "heuristic",
    };
  }

  // A named merchant, person or category: "how much at Kettle Corner?"
  if (party || category) {
    const f: WidgetFilter = {
      ...when,
      ...(party ? { parties: [party] } : {}),
      ...(category ? { categories: [category], direction: "out" as const } : {}),
    };
    const rows = pick(f);
    const name = party ?? category!;
    return {
      answer: rows.length
        ? `${money(sumCents(rows))} across ${rows.length} receipt${rows.length === 1 ? "" : "s"} for ${name} ${phrase}.`
        : `Nothing for ${name} ${phrase}.`,
      widgets: [
        { kind: "chart", title: `${name} by day`, filter: { ...f, sinceDays: sinceDays ?? 21 }, chart: { type: "column", groupBy: "day", measure: "sum" } },
        GRID(name, f),
      ],
      followUps: ["Where did my money go this week?", "What did my agents buy?"],
      engine: "heuristic",
    };
  }

  // Default: where did the money go
  const f: WidgetFilter = { direction: "out", sinceDays: sinceDays ?? 7 };
  const rows = pick(f);
  const byCat = aggregate(rows, "category", "sum").buckets;
  const top = byCat[0];
  const p = sinceDays ? phrase : "this week";
  return {
    answer: rows.length
      ? `You spent ${money(sumCents(rows))} ${p} across ${rows.length} receipts.${top ? ` Most went to ${top.label}: ${money(top.value)} (${Math.round((top.value / Math.max(sumCents(rows), 1)) * 100)}%).` : ""}`
      : `Nothing went out ${p}.`,
    widgets: [
      { kind: "chart", title: `Where it went, ${p}`, filter: f, chart: { type: "donut", groupBy: "category", measure: "sum" } },
      GRID("Every receipt", f, { columns: ["when", "party", "why", "category", "agent", "amount"] }),
    ],
    followUps: ["What did my agents buy?", "Show my spending by day", "What's still held?"],
    engine: "heuristic",
  };
}
