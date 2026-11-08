import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireViewer, getViewer } from "./lib/viewer";
import { generateStructured, HEURISTIC } from "./lib/ai";
import { ALL_WORK_INTERESTS, LANGUAGES, isRealPhoto, rolesOf } from "./lib/profile";
import { answers, validate } from "./lib/answers";

/**
 * Onboarding: what a person came to do, and only what that side needs.
 * Every answer is saved as it is given, with the step to resume at, so a
 * refresh or the trip to PayPal (Auto-pay) picks up where they left off.
 * A role (posting, earning) counts once `complete` runs for it.
 */

/** Everything the onboarding screens prefill from. */
export const state = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const identity = await ctx.auth.getUserIdentity();
    const u = viewer.user;
    return {
      _id: u._id,
      handle: u.handle,
      name: u.name,
      avatarUrl: u.avatarUrl,
      accountPhoto: isRealPhoto(identity?.pictureUrl) ? identity!.pictureUrl : undefined,
      bio: u.bio,
      isGuest: viewer.isGuest,
      roles: rolesOf(u, viewer.isGuest),
      onboarding: u.onboarding ?? {},
      interests: u.interests ?? {},
      workMode: u.workMode,
      place: u.place,
      skills: u.skills ?? [],
      experience: u.experience ?? [],
      languages: u.languages ?? [],
      availability: u.availability ?? [],
      minRateCents: u.minRateCents,
      postDefaults: u.postDefaults,
      paypalEmail: u.paypalEmail,
      hasResume: Boolean(u.resumeFileId),
    };
  },
});

/** Saves the answers given so far, and the step to resume at. */
export const save = mutation({
  args: { answers, step: v.optional(v.string()) },
  handler: async (ctx, { answers: a, step }) => {
    const { user, isGuest } = await requireViewer(ctx);
    if (isGuest) throw new ConvexError("Guests explore the demo as Adi. Sign in to set up your own account.");
    const { intent, ...fields } = validate(a);
    const onboarding = { ...user.onboarding, ...(intent ? { intent } : {}), ...(step ? { step } : {}) };
    await ctx.db.patch(user._id, { ...fields, onboarding });
  },
});

/** Finishes one side. Posting and earning are set up separately, so either can come later. */
export const complete = mutation({
  args: { role: v.union(v.literal("poster"), v.literal("doer")) },
  handler: async (ctx, { role }) => {
    const { user, isGuest } = await requireViewer(ctx);
    if (isGuest) return;
    const onboarding = { ...user.onboarding, [role]: user.onboarding?.[role] ?? Date.now(), step: undefined };
    const roles = { poster: Boolean(onboarding.poster), doer: Boolean(onboarding.doer) };
    // Someone who just added a side lands on it.
    const homeMode = roles.poster && roles.doer ? (role === "doer" ? "earn" : "post") : undefined;
    await ctx.db.patch(user._id, { onboarding, homeMode });
  },
});

// ── Resume ───────────────────────────────────────────────────────────────────

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const RESUME_TYPES = ["application/pdf", "text/plain"];

export const resumeUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const { isGuest } = await requireViewer(ctx);
    if (isGuest) throw new ConvexError("Sign in to upload a resume.");
    return ctx.storage.generateUploadUrl();
  },
});

export const viewerId = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"users"> | null> => {
    const viewer = await getViewer(ctx);
    return viewer && !viewer.isGuest ? viewer.user._id : null;
  },
});

export const attachResume = internalMutation({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  handler: async (ctx, { userId, storageId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return;
    if (user.resumeFileId && user.resumeFileId !== storageId) await ctx.storage.delete(user.resumeFileId);
    await ctx.db.patch(userId, { resumeFileId: storageId });
  },
});

const resumeSchema = z.object({
  headline: z.string().describe("One line: what this person does, e.g. 'Operations coordinator and freelance researcher'"),
  skills: z.array(z.string()).max(15).describe("Short skill names, 1 to 3 words each"),
  experience: z
    .array(z.object({ title: z.string(), company: z.string(), years: z.string().optional().describe("e.g. 2021 – 2023") }))
    .max(3)
    .describe("The three most recent roles"),
  languages: z.array(z.string()).max(8).describe("Spoken languages, English names"),
  workInterests: z.array(z.enum(ALL_WORK_INTERESTS.map((i) => i.id) as [string, ...string[]])).max(6),
});

export type ResumeRead = z.infer<typeof resumeSchema> & { model: string };

/** Reads an uploaded resume into the profile's fields. The person reviews everything before it's saved. */
export const readResume = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }): Promise<ResumeRead> => {
    const userId = await ctx.runQuery(internal.onboarding.viewerId, {});
    if (!userId) throw new ConvexError("Sign in to upload a resume.");
    const blob = await ctx.storage.get(storageId);
    if (!blob) throw new ConvexError("The upload didn't arrive. Try again.");
    if (blob.size > MAX_RESUME_BYTES) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("That file is over 5 MB. Try a smaller PDF.");
    }
    const type = blob.type || "application/pdf";
    if (!RESUME_TYPES.includes(type)) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("Upload a PDF or a .txt file.");
    }
    await ctx.runMutation(internal.onboarding.attachResume, { userId, storageId });

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = type === "text/plain" ? new TextDecoder().decode(bytes).slice(0, 20_000) : undefined;
    const { object, model } = await generateStructured({
      name: "resume reader",
      system:
        "You read resumes for Plex, where people take paid tasks. Extract only what the resume says; never invent roles, skills or languages. Map the person's experience to the work categories they could do.",
      prompt: `Read this resume.\n\nWork categories:\n${ALL_WORK_INTERESTS.map((i) => `- ${i.id}: ${i.label} (${i.hint})`).join("\n")}${text ? `\n\nResume text:\n${text}` : ""}`,
      images: text ? [] : [{ data: bytes, mediaType: "application/pdf", label: "The resume:" }],
      schema: resumeSchema,
      fallback: () => ({ headline: "", skills: [], experience: [], languages: [], workInterests: [] }),
    });
    return {
      ...object,
      languages: object.languages.filter((l) => LANGUAGES.includes(l)),
      model,
    };
  },
});

// ── Bio ──────────────────────────────────────────────────────────────────────

export const bioContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer || viewer.isGuest) return null;
    const u = viewer.user;
    return {
      name: u.name,
      workMode: u.workMode,
      place: u.place?.label,
      interests: ALL_WORK_INTERESTS.filter((i) => u.interests?.work?.includes(i.id)).map((i) => i.label),
      skills: u.skills ?? [],
      experience: u.experience ?? [],
      languages: u.languages ?? [],
      availability: u.availability ?? [],
    };
  },
});

/** A plain-spoken first draft of the profile line posters read. Code writes one when there's no model. */
type BioContext = { name: string; workMode?: string; place?: string; interests: string[]; skills: string[]; experience: { title: string; company: string; years?: string }[]; languages: string[]; availability: string[] };

export function fallbackBio(c: BioContext): string {
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
  const what = c.interests.length ? list(c.interests.slice(0, 3).map((s) => s.toLowerCase())) : "tasks";
  const where =
    c.workMode === "online" ? "online" : c.place ? (c.workMode === "both" ? `around ${c.place} and online` : `around ${c.place}`) : "";
  const role = c.experience[0] ? ` I've worked as ${/^[aeiou]/i.test(c.experience[0].title) ? "an" : "a"} ${c.experience[0].title.toLowerCase()} at ${c.experience[0].company}.` : "";
  const langs = c.languages.length > 1 ? ` I speak ${list(c.languages)}.` : "";
  return `I take on ${what}${where ? ` ${where}` : ""}.${role}${langs}`.trim();
}

export const writeBio = action({
  args: {},
  handler: async (ctx): Promise<{ bio: string; model: string }> => {
    const c: BioContext | null = await ctx.runQuery(internal.onboarding.bioContext, {});
    if (!c) throw new ConvexError("Sign in to write your profile.");
    const { object, model } = await generateStructured({
      name: "profile writer",
      system:
        "You write the one-paragraph profile a person shows on Plex, where posters and their AI agents hire people for real tasks. First person, plain and specific, 2 sentences, under 45 words. No buzzwords, no emoji, no exclamation marks. Only use facts given.",
      prompt: JSON.stringify(c),
      schema: z.object({ bio: z.string() }),
      fallback: () => ({ bio: fallbackBio(c) }),
    });
    return { bio: object.bio.trim().slice(0, 400) || fallbackBio(c), model: model === HEURISTIC ? HEURISTIC : model };
  },
});
