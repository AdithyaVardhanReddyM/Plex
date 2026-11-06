import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { insightWidget } from "./schema";
import { agentUser } from "./lib/agentAuth";
import { getViewer } from "./lib/viewer";
import { logActivity } from "./agent";

/**
 * Insights for Plex for Mac: pages of widgets the worker builds to answer a money question.
 * The worker saves a page (`save`, with the brain's secret); the Mac's Insights page shows the
 * web's /insights route, which reads it here as the viewer and draws each widget over live data.
 */

const MAX_WIDGETS = 12;

export const latest = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    return ctx.db
      .query("insights")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer.user._id))
      .order("desc")
      .first();
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const viewer = await getViewer(ctx);
    const insightId = ctx.db.normalizeId("insights", id);
    if (!viewer || !insightId) return null;
    const doc = await ctx.db.get(insightId);
    return doc && doc.ownerId === viewer.user._id ? doc : null;
  },
});

/** Earlier pages, newest first, for the history menu. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const docs = await ctx.db
      .query("insights")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer.user._id))
      .order("desc")
      .take(20);
    return docs.map((d) => ({ _id: d._id, title: d.title, question: d.question, updatedAt: d.updatedAt }));
  },
});

/** The brain saves a page, or replaces an existing one's widgets (after acting on it). */
export const save = mutation({
  args: {
    secret: v.string(),
    id: v.optional(v.string()),
    title: v.string(),
    question: v.optional(v.string()),
    summary: v.optional(v.string()),
    widgets: v.array(insightWidget),
  },
  handler: async (ctx, { secret, id, title, question, summary, widgets }) => {
    const user = await agentUser(ctx, secret);
    if (widgets.length === 0) throw new ConvexError("An insights page needs at least one widget");
    if (widgets.length > MAX_WIDGETS) throw new ConvexError(`At most ${MAX_WIDGETS} widgets`);
    const now = Date.now();
    const existing = id ? ctx.db.normalizeId("insights", id) : null;
    if (existing) {
      const doc = await ctx.db.get(existing);
      if (doc && doc.ownerId === user._id) {
        await ctx.db.patch(existing, {
          title: title.trim(),
          widgets,
          updatedAt: now,
          ...(summary ? { summary: summary.trim() } : {}),
        });
        return existing;
      }
    }
    const insightId: Id<"insights"> = await ctx.db.insert("insights", {
      ownerId: user._id,
      title: title.trim(),
      question: question?.trim() || undefined,
      summary: summary?.trim() || undefined,
      widgets,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, { ownerId: user._id, kind: "task", title: `Insights: ${title.trim()}`, detail: question?.trim() });
    return insightId;
  },
});
