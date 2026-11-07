import { generateObject } from "ai";
import { z } from "zod";
import { geminiModel } from "./ai";
import { describeRule, type PolicyRule } from "./policy";

/**
 * The policy parser. Turns the user's plain-English limits into structured
 * `policyRule`s exactly once, when they write them. It never decides whether
 * money may move: `evaluate()` in `policy.ts` does that, in code.
 *
 * Gemini (structured output) on Vertex AI or AI Studio when configured;
 * otherwise a deterministic parser that covers the phrasings the demo uses.
 * Either way the user confirms the proposal before it is saved.
 */

export interface ParsedPolicy {
  rules: PolicyRule[];
  /** Sentences that aren't limits (or that the parser couldn't read). */
  unparsed: string[];
  source: "gemini" | "heuristic";
}

export const GEMINI_MODEL = "gemini-3.5-flash";

export async function parsePolicy(text: string): Promise<ParsedPolicy> {
  const model = geminiModel(GEMINI_MODEL);
  if (!model) return parsePolicyHeuristic(text);
  try {
    return await parsePolicyWithGemini(text, model);
  } catch (err) {
    console.warn("Gemini policy parse failed, using the heuristic parser", err);
    return parsePolicyHeuristic(text);
  }
}

// ── Gemini ──────────────────────────────────────────────────────────────────

// A flat shape is the most reliable for structured output; it is mapped onto
// the `policyRule` union and validated below.
const geminiSchema = z.object({
  rules: z.array(
    z.object({
      kind: z.enum([
        "daily_limit",
        "monthly_limit",
        "per_purchase_limit",
        "approval_over",
        "block_category",
        "allow_merchants",
        "quiet_hours",
      ]),
      amountDollars: z.number().optional().describe("For limits and approval thresholds, in US dollars"),
      category: z.string().optional().describe("For block_category: lower-case plural, e.g. 'subscriptions'"),
      merchants: z.array(z.string()).optional().describe("For allow_merchants"),
      startHour: z.number().int().min(0).max(23).optional().describe("For quiet_hours, local 24h"),
      endHour: z.number().int().min(0).max(23).optional().describe("For quiet_hours, local 24h"),
    }),
  ),
  unparsed: z.array(z.string()).describe("Sentences that are not spending limits, quoted verbatim"),
});

async function parsePolicyWithGemini(text: string, model: NonNullable<ReturnType<typeof geminiModel>>): Promise<ParsedPolicy> {
  const { object } = await generateObject({
    model,
    schema: geminiSchema,
    temperature: 0,
    system: [
      "You convert a person's plain-English spending limits for their AI agents into structured rules.",
      "Kinds: daily_limit (max total per day), monthly_limit (max total per month), per_purchase_limit (max for one purchase or task),",
      "approval_over (ask the person before anything over an amount), block_category (never buy this category without asking),",
      "allow_merchants (only these merchants), quiet_hours (no spending between startHour and endHour; 'after midnight' means 0 to 6).",
      "Only output rules the text states. Never invent amounts. Anything that isn't a limit goes in unparsed, verbatim.",
    ].join(" "),
    prompt: text,
  });
  const rules: PolicyRule[] = [];
  for (const r of object.rules) {
    const cents = r.amountDollars !== undefined ? Math.round(r.amountDollars * 100) : undefined;
    switch (r.kind) {
      case "daily_limit":
      case "monthly_limit":
      case "per_purchase_limit":
      case "approval_over":
        if (cents && cents > 0) rules.push({ kind: r.kind, amountCents: cents });
        break;
      case "block_category":
        if (r.category) rules.push({ kind: "block_category", category: r.category.toLowerCase() });
        break;
      case "allow_merchants":
        if (r.merchants?.length) rules.push({ kind: "allow_merchants", merchants: r.merchants });
        break;
      case "quiet_hours":
        if (r.startHour !== undefined && r.endHour !== undefined)
          rules.push({ kind: "quiet_hours", startHour: r.startHour, endHour: r.endHour });
        break;
    }
  }
  return { rules: dedupe(rules), unparsed: object.unparsed, source: "gemini" };
}

// ── Deterministic fallback ──────────────────────────────────────────────────

const MONEY = String.raw`\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const toCents = (s: string) => Math.round(parseFloat(s.replace(/,/g, "")) * 100);

/** "midnight", "10pm", "7 am", "22:00" → 0-23, or null. */
export function parseHour(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (s === "midnight") return 0;
  if (s === "noon" || s === "midday") return 12;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1]!, 10);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return h >= 0 && h <= 23 ? h : null;
}

const HOUR = String.raw`(midnight|noon|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)`;

/** Splits on sentence ends and semicolons, keeping "$12.50" intact. */
function sentences(text: string): string[] {
  return text
    .split(/\.(?!\d)|[;\n]+/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

function parseSentence(raw: string): PolicyRule[] {
  const s = raw.toLowerCase().replace(/[’']/g, "'");
  const out: PolicyRule[] = [];
  let m: RegExpMatchArray | null;

  // Ask me before anything over $25 / anything above $50 needs my OK
  m = s.match(new RegExp(String.raw`(?:ask|check with|confirm with|ping)\s+me\b.*?(?:over|above|more than|exceeding)\s+${MONEY}`));
  if (!m) m = s.match(new RegExp(String.raw`(?:anything|purchases?|spending)\s+(?:over|above|more than)\s+${MONEY}\s+(?:needs|requires|gets)\s+(?:my|an?)\s+(?:ok|okay|approval|sign-?off)`));
  if (m) out.push({ kind: "approval_over", amountCents: toCents(m[1]!) });

  // Never buy subscriptions without asking
  m = s.match(/never\s+(?:buy|purchase|pay for|sign up for|spend on)\s+(?:any\s+)?([a-z][a-z &-]*?)\s+without\s+(?:asking|checking|my ok|my approval)/);
  if (!m) m = s.match(/(?:no|don't buy|do not buy)\s+([a-z][a-z &-]*?)\s+without\s+(?:asking|checking|my ok|my approval)/);
  if (m) out.push({ kind: "block_category", category: m[1]!.trim() });

  // Quiet hours: between 11pm and 7am / after midnight / after 10pm / before 8am
  m = s.match(new RegExp(String.raw`(?:no|don't|do not|never)\s+(?:spend(?:ing)?|buy(?:ing)?|purchases?|orders?)[^.]*?between\s+${HOUR}\s+and\s+${HOUR}`));
  if (m) {
    const a = parseHour(m[1]!), b = parseHour(m[2]!);
    if (a !== null && b !== null) out.push({ kind: "quiet_hours", startHour: a, endHour: b });
  } else {
    m = s.match(new RegExp(String.raw`(?:no|don't|do not|never)\s+(?:spend(?:ing)?|buy(?:ing)?|purchases?|orders?)[^.]*?after\s+${HOUR}`));
    if (m) {
      const a = parseHour(m[1]!);
      // "After midnight" means the small hours; "after 10pm" runs to 6am.
      if (a !== null) out.push({ kind: "quiet_hours", startHour: a, endHour: 6 });
    } else {
      m = s.match(new RegExp(String.raw`(?:no|don't|do not|never)\s+(?:spend(?:ing)?|buy(?:ing)?|purchases?|orders?)[^.]*?before\s+${HOUR}`));
      const b = m ? parseHour(m[1]!) : null;
      if (b !== null) out.push({ kind: "quiet_hours", startHour: 0, endHour: b });
    }
  }

  // Only from Lumen & Oak and Kettle Corner
  m = raw.match(/\bonly\s+(?:buy\s+|shop\s+|spend\s+)?(?:from|at)\s+(.+)$/i);
  if (m) {
    const merchants = m[1]!
      .split(/,\s*|\s+or\s+|\s+and\s+(?=[A-Z])/)
      .map((x) => x.replace(/^and\s+/i, "").trim())
      .filter(Boolean);
    if (merchants.length) out.push({ kind: "allow_merchants", merchants });
  }

  // Amount limits. "Up to $40 a day", "$40 a day max", "no more than $50 a month",
  // "up to $120 per purchase", "max $50 per task".
  const limitRe = new RegExp(
    String.raw`(?:up to|at most|no more than|max(?:imum)?(?: of)?|limit(?: of)?|cap(?: of)?|under)?\s*${MONEY}\s*(?:max\s*)?(?:a|an|per|each|every|/)\s*(day|daily|week|month|purchase|order|item|task|errand|buy|transaction)`,
    "g",
  );
  for (const lm of s.matchAll(limitRe)) {
    // Skip amounts already used by an approval rule ("ask me before anything over $25 a day" is rare; keep simple)
    const cents = toCents(lm[1]!);
    const unit = lm[2]!;
    if (out.some((r) => r.kind === "approval_over" && r.amountCents === cents)) continue;
    if (unit === "day" || unit === "daily") out.push({ kind: "daily_limit", amountCents: cents });
    else if (unit === "month") out.push({ kind: "monthly_limit", amountCents: cents });
    else if (unit !== "week") out.push({ kind: "per_purchase_limit", amountCents: cents });
  }
  // "Daily limit $40" / "$40 daily"
  if (!out.some((r) => r.kind === "daily_limit")) {
    m = s.match(new RegExp(String.raw`(?:daily (?:limit|cap|max)(?: of| is)?\s*${MONEY})|(?:${MONEY}\s*daily)`));
    if (m) out.push({ kind: "daily_limit", amountCents: toCents((m[1] ?? m[2])!) });
  }
  return out;
}

export function parsePolicyHeuristic(text: string): ParsedPolicy {
  const rules: PolicyRule[] = [];
  const unparsed: string[] = [];
  for (const sentence of sentences(text)) {
    const found = parseSentence(sentence);
    if (found.length) rules.push(...found);
    else unparsed.push(sentence);
  }
  return { rules: dedupe(rules), unparsed, source: "heuristic" };
}

/** One rule per kind and value; the last mention of a limit wins. */
function dedupe(rules: PolicyRule[]): PolicyRule[] {
  const seen = new Map<string, PolicyRule>();
  for (const r of rules) {
    const key =
      r.kind === "block_category" || r.kind === "allow_merchants" || r.kind === "quiet_hours"
        ? describeRule(r)
        : r.kind;
    seen.set(key, r);
  }
  return [...seen.values()];
}
