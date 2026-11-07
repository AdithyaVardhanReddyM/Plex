/**
 * Pure rules for Plex Hire: who may bid on a task, how a bid is clamped,
 * how blind proofer scorecards become one verdict, and the trust score.
 * Shared by Convex functions and the web app. No Convex server imports.
 *
 * The models propose (a price, a pitch, a score); these functions decide.
 */
import type { Doc } from "../_generated/dataModel";

type Task = Pick<Doc<"tasks">, "proofSpec" | "location" | "workerType" | "title" | "description" | "tags" | "category" | "invitedId">;

/** Work an AI agent can do end to end: nothing to photograph, nowhere to be. */
export function isDigitalTask(task: Pick<Task, "proofSpec" | "location">): boolean {
  return !task.location && task.proofSpec.every((s) => s.type === "text" || s.type === "link" || s.type === "file");
}

type Spec = Doc<"tasks">["proofSpec"][number];
export type Criterion = NonNullable<Doc<"tasks">["criteria"]>[number];

/** A file deliverable that is an image (a logo, an icon, a banner). */
export const isImageSpec = (s: Spec) => s.type === "file" && /logo|icon|image|banner|illustration|design|png|graphic/i.test(`${s.label} ${s.description}`);
/** A text deliverable that lists sources. */
export const isSourcesSpec = (s: Spec) => /source|reference|citation/i.test(`${s.label} ${s.description}`);

/** Word limits stated in a spec item: "80 to 120 words", "six words or fewer", "at least 200 words". */
export function wordBounds(s: Spec): { min?: number; max?: number } {
  const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, fifty: 50, hundred: 100 };
  const text = `${s.label} ${s.description}`.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|fifty|hundred)\b/g, (w) => String(NUM[w]));
  const range = text.match(/(\d+)\s*(?:to|-|–)\s*(\d+)\s*words/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const max = text.match(/(?:(\d+)\s*words?\s*(?:or fewer|or less|max(?:imum)?))|(?:(?:at most|under|no more than|up to)\s*(\d+)\s*words)/);
  const min = text.match(/(?:(?:at least|minimum of|over)\s*(\d+)\s*words)|(?:(\d+)\+\s*words)/);
  const out: { min?: number; max?: number } = {};
  if (max) out.max = Number(max[1] ?? max[2]);
  if (min) out.min = Number(min[1] ?? min[2]);
  // An exact length ("a 100-word description", "about 150 words") allows 10% either way.
  if (!max && !min) {
    const exact = text.match(/\b(\d+)[\s-]words?\b/);
    const n = exact ? Number(exact[1]) : 0;
    if (n >= 5) return { min: Math.round(n * 0.9), max: Math.round(n * 1.1) };
  }
  return out;
}

/** Long-form text with no stated length still has to say something. */
const LONG_FORM = /finding|draft|summary|report|blurb|comparison|notes|description|article|post|email|copy|analysis|answer|brief|plan/i;

/**
 * The objective bar for digital work, derived from the proof spec. Code checks
 * every one before the proofers' votes count; failing any one fails the proof.
 */
export function defaultCriteria(spec: Spec[]): Criterion[] {
  const out: Criterion[] = [];
  spec.forEach((s, i) => {
    if (isImageSpec(s)) out.push({ kind: "image", specIndex: i, minPx: 512 });
    else if (s.type === "text" && !isSourcesSpec(s)) {
      const b = wordBounds(s);
      if (b.min !== undefined || b.max !== undefined) out.push({ kind: "min_words", specIndex: i, words: b.min ?? 1, max: b.max });
      else if (LONG_FORM.test(s.label)) out.push({ kind: "min_words", specIndex: i, words: 60 });
    }
  });
  if (spec.some(isSourcesSpec)) out.push({ kind: "min_sources", count: 3 }, { kind: "links_resolve" });
  return out;
}

export function criterionLabel(c: Criterion, spec: Spec[]): string {
  switch (c.kind) {
    case "min_words": {
      const label = spec[c.specIndex]?.label ?? "Text";
      if (c.max !== undefined && c.words > 1) return `${label}: ${c.words} to ${c.max} words`;
      if (c.max !== undefined) return `${label}: at most ${c.max} words`;
      return `${label}: at least ${c.words} words`;
    }
    case "min_sources":
      return `At least ${c.count} sources`;
    case "links_resolve":
      return "Every link opens";
    case "must_mention":
      return `Mentions ${c.terms.join(", ")}`;
    case "image":
      return `${spec[c.specIndex]?.label ?? "Image"}: an image at least ${c.minPx} px`;
  }
}

/** Width and height from PNG, JPEG, WebP or SVG bytes. Null when it isn't an image we can read. */
export function imageSize(bytes: Uint8Array): { width: number; height: number; type: string } | null {
  const u32 = (o: number) => ((bytes[o]! << 24) | (bytes[o + 1]! << 16) | (bytes[o + 2]! << 8) | bytes[o + 3]!) >>> 0;
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return { width: u32(16), height: u32(20), type: "png" };
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let o = 2;
    while (o + 9 < bytes.length) {
      if (bytes[o] !== 0xff) return null;
      const marker = bytes[o + 1]!;
      const len = (bytes[o + 2]! << 8) | bytes[o + 3]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { height: (bytes[o + 5]! << 8) | bytes[o + 6]!, width: (bytes[o + 7]! << 8) | bytes[o + 8]!, type: "jpeg" };
      o += 2 + len;
    }
    return null;
  }
  if (bytes.length > 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X") return { width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)), height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)), type: "webp" };
    if (chunk === "VP8 ") return { width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff, height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff, type: "webp" };
    return null;
  }
  const head = new TextDecoder().decode(bytes.slice(0, 2000));
  if (/<svg[\s>]/i.test(head)) {
    const vb = head.match(/viewBox=["'][\d.\s-]+?\s([\d.]+)\s+([\d.]+)["']/i);
    const w = Number(head.match(/\swidth=["']([\d.]+)/i)?.[1] ?? vb?.[1] ?? 0);
    const h = Number(head.match(/\sheight=["']([\d.]+)/i)?.[1] ?? vb?.[2] ?? 0);
    return w && h ? { width: Math.round(w), height: Math.round(h), type: "svg" } : null;
  }
  return null;
}

/** Every http(s) link in a piece of text, deduplicated. */
export function linksIn(text: string): string[] {
  return [...new Set((text.match(/https?:\/\/[^\s)\]>"']+/g) ?? []).map((u) => u.replace(/[.,;:]+$/, "")))];
}

/** Humans, agents, or both, as the poster chose. Older tasks: humans. */
export function workerTypeOf(task: Pick<Task, "workerType">) {
  return task.workerType ?? "human";
}

export function canTake(task: Task, worker: Pick<Doc<"users">, "kind">): { ok: true } | { ok: false; reason: string } {
  const type = workerTypeOf(task);
  if (worker.kind === "agent") {
    if (type === "human") return { ok: false, reason: "The poster asked for a person for this task." };
    if (!isDigitalTask(task)) return { ok: false, reason: "This task needs someone on the ground." };
  } else if (type === "agent") return { ok: false, reason: "The poster asked for an AI agent for this task." };
  return { ok: true };
}

/** How many of the agent's specialties the task mentions. 0 means it won't bid. */
export function specialtyHits(task: Task, specialties: string[]): string[] {
  const text = `${task.title} ${task.description} ${task.tags.join(" ")} ${task.category}`.toLowerCase();
  return specialties.filter((s) => s.split(/\s+/).some((w) => w.length > 2 && text.includes(w.toLowerCase())));
}

type AgentLike = Pick<Doc<"users">, "kind"> & { agentProfile?: Pick<NonNullable<Doc<"users">["agentProfile"]>, "specialties" | "tools"> };

/** Can this agent make images? Builder agents say so with a tool; Plex's own by their specialties. */
export const makesImages = (a: AgentLike) =>
  a.agentProfile?.tools ? a.agentProfile.tools.includes("image") : (a.agentProfile?.specialties ?? []).some((s) => /logo|icon|banner|design|illustration/.test(s));

/**
 * Whether an agent can do this task: allowed to take it, at least one of its
 * specialties fits, and it has the tools the deliverable needs (an image needs
 * an agent that makes images). Bidding and the "no agent fits" prompt both use it.
 */
export function agentFit(task: Task, agent: AgentLike): { ok: boolean; hits: string[]; reason?: string } {
  if (!canTake(task, agent).ok) return { ok: false, hits: [], reason: "Not open to agents" };
  const hits = specialtyHits(task, agent.agentProfile?.specialties ?? []);
  if (!hits.length) return { ok: false, hits, reason: "None of its skills fit" };
  if (task.proofSpec.some(isImageSpec) && !makesImages(agent)) return { ok: false, hits, reason: "Can't make images" };
  return { ok: true, hits };
}

/** A bid is always between the agent's private floor and what the poster holds. */
export function clampBid(proposedCents: number, floorCents: number, capCents: number): { cents: number; clamped: boolean } {
  const rounded = Math.round(proposedCents / 50) * 50; // to the half dollar
  const cents = Math.max(floorCents, Math.min(capCents, rounded));
  return { cents, clamped: cents !== rounded };
}

/**
 * The reverse auction: an agent at or above the lowest other bid undercuts it
 * by a dollar, never below its own floor. Returns null when it holds its price.
 */
export function counterBid(currentCents: number, lowestOtherCents: number, floorCents: number): number | null {
  if (currentCents < lowestOtherCents) return null;
  const target = Math.max(floorCents, lowestOtherCents - 100);
  return target < currentCents ? target : null;
}

export type Scorecard = {
  proofer: string;
  completeness: number;
  accuracy: number;
  method: number;
  quality: number;
  verdict: "pass" | "fail" | "unsure";
  note: string;
  model: string;
};

export const cardMean = (c: Pick<Scorecard, "completeness" | "accuracy" | "method" | "quality">) =>
  (c.completeness + c.accuracy + c.method + c.quality) / 4;

/**
 * Blind proofers vote; code decides. Pass needs a majority of pass votes and
 * a mean score of at least 3.5 of 5. A majority of fails, or a mean under 2.5,
 * fails. Anything else goes to the poster.
 */
export function consensus(cards: Scorecard[]): { result: "pass" | "fail" | "unsure"; confidence: number; mean: number; line: string } {
  if (!cards.length) return { result: "unsure", confidence: 0.5, mean: 0, line: "No proofer scored it" };
  const majority = Math.floor(cards.length / 2) + 1;
  const passes = cards.filter((c) => c.verdict === "pass").length;
  const fails = cards.filter((c) => c.verdict === "fail").length;
  const mean = cards.reduce((s, c) => s + cardMean(c), 0) / cards.length;
  const result = passes >= majority && mean >= 3.5 ? "pass" : fails >= majority || mean < 2.5 ? "fail" : "unsure";
  const agree = (result === "pass" ? passes : result === "fail" ? fails : Math.max(passes, fails)) / cards.length;
  const confidence = Math.max(0.3, Math.min(0.97, result === "unsure" ? 0.55 * agree : 0.45 + 0.35 * agree + 0.04 * mean));
  return {
    result,
    confidence: Math.round(confidence * 100) / 100,
    mean: Math.round(mean * 10) / 10,
    line: `${passes} of ${cards.length} passed · mean ${mean.toFixed(1)} of 5`,
  };
}

export type TrustInput = {
  rating?: number;
  proofPassRate?: number;
  tasksCompleted?: number;
  disputes: number;
  reviews: number;
};

/**
 * One number a poster can read: rating, proof pass rate, track record and
 * disputes. 0-100, computed in code from facts on Plex.
 */
export function trustScore(t: TrustInput): { score: number; parts: { label: string; value: string; points: number }[] } {
  const rating = t.rating ?? 4.5;
  const pass = t.proofPassRate ?? 0.9;
  const done = t.tasksCompleted ?? 0;
  const parts = [
    { label: "Rating", value: t.rating !== undefined ? `${t.rating.toFixed(2)} of 5` : "No ratings yet", points: Math.round(((rating - 3) / 2) * 35) },
    { label: "Proof pass rate", value: `${Math.round(pass * 100)}%`, points: Math.round(pass * 35) },
    { label: "Track record", value: `${done} task${done === 1 ? "" : "s"} paid`, points: Math.min(20, Math.round(Math.log10(done + 1) * 9)) },
    { label: "Verified reviews", value: `${t.reviews}`, points: Math.min(10, t.reviews * 2) },
    { label: "Disputes", value: `${t.disputes}`, points: -Math.min(20, t.disputes * 6) },
  ];
  const score = Math.max(0, Math.min(100, parts.reduce((s, p) => s + p.points, 0)));
  return { score, parts };
}
