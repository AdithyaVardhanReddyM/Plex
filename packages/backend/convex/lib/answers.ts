import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { ALL_WORK_INTERESTS, LANGUAGES, POST_INTERESTS } from "./profile";

/** The answers onboarding and Settings save, and the checks every one of them passes. */
const workerType = v.union(v.literal("human"), v.literal("agent"), v.literal("either"));
export const answers = v.object({
  intent: v.optional(v.union(v.literal("post"), v.literal("earn"), v.literal("both"))),
  name: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  bio: v.optional(v.string()),
  postInterests: v.optional(v.array(v.string())),
  workInterests: v.optional(v.array(v.string())),
  workMode: v.optional(v.union(v.literal("in_person"), v.literal("online"), v.literal("both"))),
  place: v.optional(
    v.union(
      v.null(),
      v.object({ label: v.string(), lat: v.optional(v.number()), lng: v.optional(v.number()), radiusKm: v.number(), unit: v.union(v.literal("mi"), v.literal("km")) }),
    ),
  ),
  skills: v.optional(v.array(v.string())),
  experience: v.optional(v.array(v.object({ title: v.string(), company: v.string(), years: v.optional(v.string()) }))),
  languages: v.optional(v.array(v.string())),
  availability: v.optional(v.array(v.union(v.literal("weekdays"), v.literal("evenings"), v.literal("weekends")))),
  minRateCents: v.optional(v.union(v.null(), v.number())),
  postDefaults: v.optional(v.object({ workerType, approval: v.union(v.literal("one_tap"), v.literal("auto")) })),
  paypalEmail: v.optional(v.union(v.null(), v.string())),
});

const AVATAR_HOSTS = ["api.dicebear.com", "img.clerk.com", "images.clerk.dev"];
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(s: string, max: number) {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Checks and normalizes answers; throws a message the form can show. */
export function validate(a: typeof answers.type): Partial<Doc<"users">> & { intent?: "post" | "earn" | "both" } {
  const out: Partial<Doc<"users">> & { intent?: "post" | "earn" | "both" } = {};
  if (a.intent) out.intent = a.intent;
  if (a.name !== undefined) {
    const name = clean(a.name, 60);
    if (name.length < 1) throw new ConvexError("Tell us what to call you.");
    out.name = name;
  }
  if (a.avatarUrl !== undefined) {
    let host = "";
    try {
      const u = new URL(a.avatarUrl);
      if (u.protocol !== "https:") throw new Error();
      host = u.hostname;
    } catch {
      throw new ConvexError("That photo link doesn't work.");
    }
    if (!AVATAR_HOSTS.includes(host)) throw new ConvexError("Pick a photo from your account or one of ours.");
    out.avatarUrl = a.avatarUrl;
  }
  if (a.bio !== undefined) out.bio = a.bio.trim().slice(0, 400);
  if (a.postInterests || a.workInterests) {
    const post = a.postInterests?.filter((id) => POST_INTERESTS.some((i) => i.id === id)).slice(0, 12);
    const work = a.workInterests?.filter((id) => ALL_WORK_INTERESTS.some((i) => i.id === id)).slice(0, 12);
    out.interests = { ...(post ? { post } : {}), ...(work ? { work } : {}) };
  }
  if (a.workMode) out.workMode = a.workMode;
  if (a.place !== undefined) {
    if (a.place === null) out.place = undefined;
    else {
      const label = clean(a.place.label, 80);
      if (!label) throw new ConvexError("Add the city you work in.");
      const radiusKm = Math.round(a.place.radiusKm * 10) / 10;
      if (!(radiusKm >= 1 && radiusKm <= 200)) throw new ConvexError("Pick how far you'll travel, 1 to 200 km.");
      const ok = (n: number | undefined, lim: number) => n === undefined || (Number.isFinite(n) && Math.abs(n) <= lim);
      if (!ok(a.place.lat, 90) || !ok(a.place.lng, 180)) throw new ConvexError("That place doesn't look right.");
      out.place = { ...a.place, label, radiusKm };
      out.area = label;
    }
  }
  if (a.skills) out.skills = [...new Set(a.skills.map((s) => clean(s, 40)).filter(Boolean))].slice(0, 20);
  if (a.experience) {
    const rows = a.experience
      .map((e) => ({ title: clean(e.title, 60), company: clean(e.company, 60), years: e.years ? clean(e.years, 20) : undefined }))
      .filter((e) => e.title || e.company);
    if (rows.some((e) => !e.title || !e.company)) throw new ConvexError("Add a job title and company for each role.");
    out.experience = rows.slice(0, 3);
  }
  if (a.languages) out.languages = a.languages.filter((l) => LANGUAGES.includes(l)).slice(0, 10);
  if (a.availability) out.availability = [...new Set(a.availability)];
  if (a.minRateCents !== undefined) {
    if (a.minRateCents === null) out.minRateCents = undefined;
    else {
      if (!Number.isInteger(a.minRateCents) || a.minRateCents < 0 || a.minRateCents > 100_000_00)
        throw new ConvexError("Your lowest rate should be between $0 and $100,000.");
      out.minRateCents = a.minRateCents;
    }
  }
  if (a.postDefaults) out.postDefaults = a.postDefaults;
  if (a.paypalEmail !== undefined) {
    if (a.paypalEmail === null || a.paypalEmail.trim() === "") out.paypalEmail = undefined;
    else {
      const email = a.paypalEmail.trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 120) throw new ConvexError("That doesn't look like an email address.");
      out.paypalEmail = email;
    }
  }
  return out;
}

