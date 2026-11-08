/**
 * What onboarding asks, shared by the backend and the web app: the work
 * vocabulary, the roles a person has, and how "Tasks for you" is ranked.
 * Pure functions only, so the web app can import them too.
 */
import type { Doc } from "../_generated/dataModel";

type Category = Doc<"tasks">["category"];

export type Interest = { id: string; label: string; hint: string; categories: Category[]; words: string[] };

/** Work a person can take. `categories` and `words` decide which tasks match it. */
export const WORK_INTERESTS: { in_person: Interest[]; online: Interest[] } = {
  in_person: [
    { id: "errands", label: "Errands & pickups", hint: "Collect, drop off, wait in line", categories: ["local"], words: ["pickup", "pick up", "drop", "deliver", "errand", "collect", "return"] },
    { id: "checks", label: "Local checks & photos", hint: "Is it open, is it there, how does it look", categories: ["local"], words: ["check", "photo", "verify", "confirm", "visit", "look"] },
    { id: "events", label: "Events & promo", hint: "Flyers, sign-ups, staffing a table", categories: ["local", "impact"], words: ["event", "flyer", "promo", "volunteer", "table"] },
    { id: "hands_on", label: "Hands-on help", hint: "Moving, setup, small repairs", categories: ["local", "impact"], words: ["move", "setup", "assemble", "repair", "carry", "clean"] },
  ],
  online: [
    { id: "research", label: "Research", hint: "Find, compare, fact-check", categories: ["remote", "data"], words: ["research", "find", "compare", "list", "fact"] },
    { id: "writing", label: "Writing & editing", hint: "Copy, summaries, proofreading", categories: ["remote", "creator"], words: ["write", "edit", "copy", "summary", "proofread", "post"] },
    { id: "data", label: "Data & spreadsheets", hint: "Clean, label, enter", categories: ["data"], words: ["data", "spreadsheet", "csv", "label", "entry", "sheet"] },
    { id: "design", label: "Design & creative", hint: "Graphics, slides, video", categories: ["creator"], words: ["design", "logo", "graphic", "video", "slide", "image"] },
    { id: "testing", label: "Testing & QA", hint: "Try an app, file what breaks", categories: ["remote", "agent"], words: ["test", "qa", "bug", "app", "website"] },
    { id: "languages", label: "Translation", hint: "Translate and localize", categories: ["remote", "creator"], words: ["translate", "translation", "spanish", "language", "localize"] },
  ],
};

export const ALL_WORK_INTERESTS = [...WORK_INTERESTS.in_person, ...WORK_INTERESTS.online];

/** What posters want done; tunes their examples and Home. */
export const POST_INTERESTS: { id: string; label: string }[] = [
  { id: "errands", label: "Errands & pickups" },
  { id: "checks", label: "Local checks & photos" },
  { id: "research", label: "Research" },
  { id: "writing", label: "Writing & editing" },
  { id: "data", label: "Data & spreadsheets" },
  { id: "design", label: "Design & creative" },
  { id: "code", label: "Code & testing" },
  { id: "other", label: "Something else" },
];

export const LANGUAGES = [
  "English", "Spanish", "Mandarin", "Hindi", "Telugu", "Tamil", "Bengali", "Arabic", "French", "German",
  "Portuguese", "Russian", "Japanese", "Korean", "Vietnamese", "Tagalog", "Italian", "Turkish", "Polish", "Urdu",
  "Punjabi", "Marathi", "Gujarati", "Kannada", "Malayalam", "Cantonese", "Dutch", "Swedish", "Greek", "Hebrew",
];

export type Roles = { poster: boolean; doer: boolean };

/**
 * A role counts once its onboarding finished. Demo people (and guests, who act
 * as Adi) have both, so the seeded world shows everything.
 */
export function rolesOf(user: Pick<Doc<"users">, "onboarding" | "isDemo" | "kind">, isGuest = false): Roles {
  if (isGuest || user.isDemo || user.kind !== "person") return { poster: true, doer: true };
  return { poster: Boolean(user.onboarding?.poster), doer: Boolean(user.onboarding?.doer) };
}

export function isOnboarded(roles: Roles) {
  return roles.poster || roles.doer;
}

/** Home's mode for a person: their switch if they have both roles, else the one they have. */
export function homeModeOf(user: Pick<Doc<"users">, "homeMode" | "onboarding">, roles: Roles): "post" | "earn" {
  if (roles.poster && !roles.doer) return "post";
  if (roles.doer && !roles.poster) return "earn";
  return user.homeMode ?? (user.onboarding?.intent === "earn" ? "earn" : "post");
}

export const MI_PER_KM = 0.621371;

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Match = { score: number; reasons: string[]; distanceKm?: number };

/**
 * How well an open task fits a person's answers. Null means it doesn't fit at
 * all (an agent-only task, in person for someone online-only, or out of range).
 */
export function matchTask(
  task: Pick<Doc<"tasks">, "category" | "title" | "description" | "tags" | "location" | "workerType">,
  me: Pick<Doc<"users">, "interests" | "workMode" | "place" | "skills">,
): Match | null {
  if (task.workerType === "agent") return null;
  const inPerson = task.category === "local" || task.category === "impact" ? Boolean(task.location) : false;
  if (inPerson && me.workMode === "online") return null;
  if (!inPerson && me.workMode === "in_person" && task.category !== "impact") return null;

  const reasons: string[] = [];
  let score = 0;
  let distance: number | undefined;
  const loc = task.location;
  if (inPerson && loc?.lat !== undefined && loc?.lng !== undefined && me.place?.lat !== undefined && me.place?.lng !== undefined) {
    distance = distanceKm({ lat: loc.lat, lng: loc.lng }, { lat: me.place.lat, lng: me.place.lng });
    if (distance > me.place.radiusKm) return null;
    score += 2;
    reasons.push("Near you");
  }

  const text = `${task.title} ${task.description} ${task.tags.join(" ")}`.toLowerCase();
  const picked = ALL_WORK_INTERESTS.filter((i) => me.interests?.work?.includes(i.id));
  const byCategory = picked.filter((i) => i.categories.includes(task.category));
  const byWord = picked.filter((i) => i.words.some((w) => text.includes(w)));
  if (byWord.length) {
    score += 3;
    reasons.push(byWord[0]!.label);
  } else if (byCategory.length) {
    score += 2;
    reasons.push(byCategory[0]!.label);
  }
  const skill = (me.skills ?? []).find((s) => s.length > 2 && text.includes(s.toLowerCase()));
  if (skill) {
    score += 1;
    reasons.push(`Uses ${skill}`);
  }
  return { score, reasons, distanceKm: distance };
}

/** Clerk gives everyone an image URL; a default one (no photo uploaded) encodes `"type":"default"`. */
export function isRealPhoto(url: string | undefined): url is string {
  if (!url) return false;
  const m = url.match(/img\.clerk\.com\/([A-Za-z0-9_-]+)/);
  if (!m) return true;
  try {
    const b64 = m[1]!.replace(/-/g, "+").replace(/_/g, "/");
    return !atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=")).includes('"default"');
  } catch {
    return true;
  }
}

/** Only same-site paths, never `//evil.com` or a full URL. */
export function safeNext(next: string | null | undefined): string | undefined {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return undefined;
  return next;
}

// ── Resume (no model) ────────────────────────────────────────────────────────

export type ResumeFields = {
  headline: string;
  skills: string[];
  experience: { title: string; company: string; years?: string }[];
  languages: string[];
  workInterests: string[];
};

/**
 * Reads a plain-text resume without a model: a "Skills:" line, roles written
 * "Title, Company — 3 years" or "Title at Company", languages it names, and
 * the work its words point to. Only what the text says; never invents.
 */
export function parseResumeText(text: string): ResumeFields {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lower = text.toLowerCase();

  const skillLine = lines.find((l) => /^(skills|core skills|key skills|tools)\s*[:\-–—]/i.test(l));
  const skills = skillLine
    ? [...new Set(skillLine.replace(/^[^:\-–—]+[:\-–—]\s*/, "").split(/[,;•|·]/).map((s) => s.trim()).filter((s) => s && s.length <= 40))].slice(0, 15)
    : [];

  const experience: ResumeFields["experience"] = [];
  for (const l of lines) {
    if (experience.length >= 3) break;
    if (/^(skills|languages|education)\b/i.test(l)) continue;
    const m =
      l.match(/^(.{2,60}?),\s*(.{2,60}?)\s*[—–-]\s*(.{1,30})$/) ??
      l.match(/^(.{2,60}?)\s+at\s+(.{2,60}?)(?:\s*[—–(-]\s*(.{1,30}?)\)?)?$/i);
    if (m && /[a-z]/i.test(m[1]!) && !/[.!?]$/.test(l)) {
      experience.push({ title: m[1]!.trim(), company: m[2]!.trim(), ...(m[3] ? { years: m[3].trim() } : {}) });
    }
  }

  const languages = LANGUAGES.filter((lang) => new RegExp(`\\b${lang}\\b`, "i").test(text)).slice(0, 8);
  const workInterests = ALL_WORK_INTERESTS.filter((i) => i.words.some((w) => new RegExp(`\\b${w}`, "i").test(lower))).map((i) => i.id).slice(0, 6);
  const headline = lines[1] && lines[1].length <= 80 && !/[:]/.test(lines[1]) ? lines[1] : "";

  return { headline, skills, experience, languages, workInterests };
}
