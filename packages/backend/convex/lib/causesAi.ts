/**
 * AI for Plex Causes: Proof Reel captions and the cause page builder.
 *
 * Gemini through the Vercel AI SDK, with structured output. When
 * GOOGLE_GENERATIVE_AI_API_KEY is missing (or the call fails) every function
 * falls back to a deterministic template, and says so in `by`.
 *
 * Writing rules for everything here: factual, specific, dignified. No
 * guilt-trip copy, no invented numbers: only numbers that are in the input.
 */
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

const MODEL = "gemini-2.5-flash";

const WRITING_RULES = [
  "Write plainly, like a good local newspaper. Factual, specific and dignified.",
  "Never use guilt, pity, urgency or emotional pressure. No 'imagine', 'heartbreaking', 'desperately', 'before it's too late'.",
  "Never invent numbers, names, dates or outcomes. Use only facts present in the input. If a number is missing, leave it out.",
  "Describe people by first name only, and only when the input names them.",
  "Never describe photos you have not been given.",
].join("\n");

function model() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;
  return createGoogleGenerativeAI({ apiKey })(MODEL);
}

export const aiConfigured = () => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

// ── Proof Reel caption ───────────────────────────────────────────────────────

export interface ReelFacts {
  causeName: string;
  orgName: string;
  taskTitle?: string;
  locationLabel?: string;
  donationCents: number;
  workers: Array<{ firstName: string; amountCents: number }>;
  proofSummary?: string;
  completedAt?: number;
}

const dollars = (cents: number) =>
  `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export function templateCaption(f: ReelFacts): string {
  const names = f.workers.map((w) => w.firstName);
  const who =
    names.length === 0
      ? "local workers"
      : names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const paid = f.workers.reduce((s, w) => s + w.amountCents, 0);
  if (!f.taskTitle) {
    return `Your ${dollars(f.donationCents)} went to ${f.orgName} for ${f.causeName.toLowerCase()}. It pays local people for shifts, and each shift is checked against before-and-after proof before anyone is paid.`;
  }
  if (!f.workers.length) {
    return `Your ${dollars(f.donationCents)} is held for "${f.taskTitle}". It's released when the shift's proof passes, and you'll see the photos here.`;
  }
  return `${who} worked "${f.taskTitle}"${f.locationLabel ? ` at ${f.locationLabel}` : ""}. The proof passed Plex's checks, and ${dollars(paid)} was paid out through PayPal. Your ${dollars(f.donationCents)} was part of it.`;
}

export async function reelCaption(f: ReelFacts): Promise<{ text: string; by: string }> {
  const m = model();
  if (!m) return { text: templateCaption(f), by: "template" };
  try {
    const { object } = await generateObject({
      model: m,
      schema: z.object({ caption: z.string().max(320) }),
      system: `You write the one-paragraph caption on a donor's Proof Reel: what their donation paid for.\n${WRITING_RULES}\nAt most two sentences. Address the donor as "you".`,
      prompt: JSON.stringify({ ...f, donation: dollars(f.donationCents) }),
    });
    return { text: object.caption, by: MODEL };
  } catch {
    return { text: templateCaption(f), by: "template" };
  }
}

// ── Cause page builder ───────────────────────────────────────────────────────

export const causeDraftSchema = z.object({
  name: z.string().describe("Short cause name, e.g. 'A clean Lake Merritt shoreline'"),
  tagline: z.string().describe("One factual sentence on what a donation pays for"),
  story: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe("2 to 5 short paragraphs: the problem, the work, where the money goes, how donors will know"),
  locationLabel: z.string().describe("Place name from the text, or empty"),
  tags: z.array(z.string()).max(4),
  tasks: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        payoutCents: z.number().int().describe("Pay per person per shift, in cents, only if the text gives it"),
        spots: z.number().int().min(1).max(50),
        hours: z.number().optional(),
        proof: z.array(z.string()).min(1).max(4).describe("Photo proof items, e.g. 'Before photo at the marked spot'"),
      }),
    )
    .max(5),
  missing: z.array(z.string()).describe("Facts the page needs that the text doesn't give (e.g. 'hourly pay')"),
});

export type CauseDraft = z.infer<typeof causeDraftSchema> & { by: string };

export async function draftCause(text: string): Promise<CauseDraft> {
  const m = model();
  if (m) {
    try {
      const { object } = await generateObject({
        model: m,
        schema: causeDraftSchema,
        system: `You turn an NGO's own text into a Plex cause page: a story and a few paid Impact Tasks that local people can take.\n${WRITING_RULES}\nIf the text doesn't give pay, set payoutCents to 0 and list "pay per shift" in missing.`,
        prompt: text.slice(0, 12_000),
      });
      return { ...object, by: MODEL };
    } catch {
      // fall through to the template
    }
  }
  return heuristicDraft(text);
}

/** No model: split the NGO's own sentences into a page, and pull tasks from lines with "$" and a count. */
export function heuristicDraft(text: string): CauseDraft {
  const clean = text.replace(/\r/g, "").trim();
  const lines = clean.split("\n");
  const firstLine = (lines[0] ?? "").replace(/^#+\s*/, "").trim();
  // A short first line with no full stop is the organization's title.
  const hasTitle = firstLine.length > 0 && firstLine.length <= 80 && !/[.!?]$/.test(firstLine);
  const body = hasTitle ? lines.slice(1).join("\n").trim() : clean;
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 30);
  const sentences = body.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean);
  const first = sentences[0] ?? "";
  const name = (hasTitle ? firstLine : first.split(/[,.]/)[0]!.slice(0, 80)) || "New cause";

  const tasks: CauseDraft["tasks"] = [];
  const paraList = body.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
  for (const para of paraList) {
    const money = para.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
    if (!money) continue;
    const spots = Number(para.match(/(\d+)\s*(?:people|persons|volunteers|workers|spots)/i)?.[1] ?? 1);
    const hours = Number(para.match(/(\d+(?:\.\d)?)\s*(?:hours|hrs|h)\b/i)?.[1] ?? 0) || undefined;
    let cents = Math.round(Number(money[1]) * 100);
    if (/an hour|per hour|\/hr|\/hour/i.test(para) && hours) cents = cents * hours;
    const proofText = para.match(/proof:\s*([^.]+)/i)?.[1];
    const proof = proofText
      ? proofText
          .replace(/^(a\s+)?photos?\s+of\s+/i, "")
          .split(/,\s*|\s+and\s+/)
          .map((p) => p.replace(/^the\s+/i, "").trim())
          .filter(Boolean)
          .map((p) => `Photo: ${p}`)
      : ["Before photo at the marked spot", "After photo, same spot and angle"];
    const sentence = para.split(/(?<=[.!?])\s+/).find((s) => s.includes("$")) ?? para;
    tasks.push({
      title: sentence.split(":")[0]!.replace(/[.]+$/, "").slice(0, 70),
      description: para.replace(/\s*proof:[^.]+\.?/i, "").trim(),
      payoutCents: cents,
      spots: Math.min(Math.max(spots, 1), 50),
      hours,
      proof: proof.slice(0, 4),
    });
    if (tasks.length >= 3) break;
  }
  const missing: string[] = [];
  if (!tasks.length) missing.push("Paid tasks with pay per shift (e.g. '4 people × 3 hours, $15 an hour')");
  if (!/\b(in|at|near)\s+[A-Z]/.test(clean)) missing.push("Where the work happens");

  return {
    name,
    tagline: first.slice(0, 160),
    story: (paragraphs.length ? paragraphs : sentences)
      .map((p) => p.replace(/\s*proof:[^.]+\.?/i, "").trim())
      .filter(Boolean)
      .slice(0, 4),
    locationLabel: clean.match(/\b(?:in|at|near)\s+([A-Z][\w'’]+(?:[ ,]+[A-Z][\w'’]+){0,3})/)?.[1] ?? "",
    tags: [],
    tasks,
    missing,
    by: "template",
  };
}
