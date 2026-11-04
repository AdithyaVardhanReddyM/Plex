import { ConvexError, v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { getViewer } from "./lib/viewer";
import { challengeCode } from "./lib/money";
import { draftCause, type CauseDraft } from "./lib/causesAi";

/**
 * Cause page builder: an NGO pastes its own text, the model drafts the story
 * and Impact Tasks under strict writing rules, and code checks the result.
 */

/**
 * Numbers in the draft that never appear in the NGO's own text. The writing
 * rules forbid invented numbers; this checks it in code, not by trust.
 */
function inventedNumbers(draft: CauseDraft, source: string): string[] {
  const norm = (n: string) => String(Number(n.replace(/,/g, "")));
  const inSource = new Set((source.match(/\d+(?:[.,]\d+)?/g) ?? []).map(norm));
  const found = new Set<string>();
  const scan = (text: string) => {
    for (const n of text.match(/\d+(?:[.,]\d+)?/g) ?? []) if (!inSource.has(norm(n))) found.add(n);
  };
  [draft.name, draft.tagline, ...draft.story].forEach(scan);
  for (const t of draft.tasks) {
    scan(`${t.title} ${t.description}`);
    const pay = String(t.payoutCents / 100);
    const hourly = t.hours ? String(t.payoutCents / 100 / t.hours) : null;
    if (t.payoutCents && !inSource.has(pay) && !(hourly && inSource.has(hourly))) found.add(`$${pay}`);
    if (!inSource.has(String(t.spots)) && t.spots > 1) found.add(`${t.spots} people`);
  }
  return [...found];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PT_OFFSET = 8 * HOUR; // Bay Area causes; Pacific standard time
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** 9am Pacific on the next weekday the task names, or a week out for task `i`. */
function shiftStart(text: string, i: number) {
  const now = Date.now();
  const local = new Date(now - PT_OFFSET);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + PT_OFFSET;
  const named = WEEKDAYS.findIndex((d) => text.toLowerCase().includes(d));
  const days = named >= 0 ? ((named - local.getUTCDay() + 7) % 7) || 7 : 7 + i;
  return midnight + days * DAY + 9 * HOUR;
}

/** Drafts a cause page from pasted text: Gemini, or a template without a key. */
export const draft = action({
  args: { text: v.string() },
  handler: async (_ctx, { text }) => {
    const clean = text.trim();
    if (clean.length < 80) throw new ConvexError("Paste a bit more: at least a paragraph about the work.");
    const d = await draftCause(clean);
    return { ...d, invented: inventedNumbers(d, clean) };
  },
});

const draftTask = v.object({
  title: v.string(),
  description: v.string(),
  payoutCents: v.number(),
  spots: v.number(),
  hours: v.optional(v.number()),
  proof: v.array(v.string()),
});

/** Publishes a drafted cause and its Impact Tasks. */
export const publish = mutation({
  args: {
    name: v.string(),
    tagline: v.string(),
    story: v.array(v.string()),
    locationLabel: v.string(),
    goalCents: v.number(),
    tasks: v.array(draftTask),
    sourceText: v.string(),
    draftedBy: v.string(),
  },
  handler: async (ctx, a) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new ConvexError("Run `pnpm seed` first.");
    const name = a.name.trim().slice(0, 90);
    if (!name) throw new ConvexError("Give the cause a name.");
    if (!a.tasks.length) throw new ConvexError("Add at least one paid task, so donations buy specific work.");
    for (const t of a.tasks) {
      if (!t.title.trim()) throw new ConvexError("Every task needs a title.");
      if (!Number.isInteger(t.payoutCents) || t.payoutCents < 100)
        throw new ConvexError(`Set the pay for "${t.title}".`);
      if (!Number.isInteger(t.spots) || t.spots < 1 || t.spots > 50)
        throw new ConvexError("Each task needs between 1 and 50 spots.");
    }
    if (!Number.isInteger(a.goalCents) || a.goalCents < 100) throw new ConvexError("Set a goal.");

    const base =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "cause";
    let slug = base;
    for (let i = 2; await ctx.db.query("causes").withIndex("by_slug", (q) => q.eq("slug", slug)).unique(); i++) {
      slug = `${base}-${i}`;
    }
    const first = a.tasks[0]!;
    const causeId = await ctx.db.insert("causes", {
      orgId: viewer.user._id,
      slug,
      name,
      tagline: a.tagline.trim().slice(0, 200),
      story: a.story.map((p) => p.trim()).filter(Boolean).join("\n\n"),
      location: { label: a.locationLabel.trim() || viewer.user.area || "Location to be confirmed" },
      coverHue: Array.from(slug).reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7),
      goalCents: a.goalCents,
      raisedCents: 0,
      donorsCount: 0,
      workersPaidCount: 0,
      tags: ["Local jobs"],
      status: "live",
      unitCents: first.payoutCents,
      unitLabel: first.hours ? `pays one person for a ${first.hours}-hour shift` : "pays one person for one shift",
      sourceText: a.sourceText.slice(0, 12_000),
      draftedBy: a.draftedBy,
    });
    for (const [i, t] of a.tasks.entries()) {
      const start = shiftStart(`${t.title} ${t.description}`, i);
      await ctx.db.insert("tasks", {
        posterId: viewer.user._id,
        postedVia: "web",
        title: t.title.trim().slice(0, 90),
        brief: t.description.trim(),
        description: t.description.trim(),
        category: "impact",
        windowStart: start,
        windowEnd: start + (t.hours ?? 3) * HOUR,
        payout: { kind: "fixed", amountCents: t.payoutCents },
        currency: "USD",
        proofSpec: t.proof.slice(0, 4).map((p) => ({
          label: p.split(/[,:]/)[0]!.slice(0, 40),
          description: p,
          type: "photo" as const,
        })),
        verificationMode: "auto",
        challengeCode: challengeCode(),
        status: "open",
        funding: { state: "unfunded" },
        causeId,
        spots: t.spots,
        tags: ["Impact"],
      });
    }
    return slug;
  },
});
