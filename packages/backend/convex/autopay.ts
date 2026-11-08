import { ConvexError, v } from "convex/values";
import { PayPalClient, PayPalError, createPaymentToken, createSetupToken, deletePaymentToken } from "@plex/paypal";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getActor, requireActor } from "./lib/actor";
import { formatCents } from "./lib/money";

/**
 * Auto-pay with PayPal Vault. The poster approves once at PayPal (no charge),
 * Plex keeps the payment token, and later tasks (posted on the web, by
 * hands-free mode or by an agent over the API) are held from that wallet
 * without a checkout popup. Still a hold: the charge happens only when the
 * proof passes. Code decides when it may be used: a per-task
 * limit and a daily limit, all set by the person.
 */

const DEFAULT_LIMIT = 50_00;
const DEFAULT_DAILY = 150_00;
const MAX_LIMIT = 500_00;

const today = () => new Date().toISOString().slice(0, 10);

function paypalMessage(err: unknown): string {
  if (err instanceof PayPalError) return `PayPal ${err.name_ ?? err.status}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/** What the settings card shows. Never the payment token itself. */
export const mine = query({
  args: { as: v.optional(v.string()) },
  handler: async (ctx, { as }) => {
    const actor = await getActor(ctx, as);
    if (!actor) return null;
    const row = await ctx.db
      .query("autopay")
      .withIndex("by_user", (q) => q.eq("userId", actor.user._id))
      .first();
    if (!row) return { status: "off" as const, limitCents: DEFAULT_LIMIT, dailyLimitCents: DEFAULT_DAILY, usedTodayCents: 0, name: actor.user.name };
    return {
      status: row.status,
      payerEmail: row.payerEmail,
      limitCents: row.limitCents,
      dailyLimitCents: row.dailyLimitCents,
      usedTodayCents: row.usedDay === today() ? row.usedCents : 0,
      lastUsedAt: row.lastUsedAt,
      name: actor.user.name,
    };
  },
});

export const actorId = internalQuery({
  args: { as: v.optional(v.string()) },
  handler: async (ctx, { as }) => (await requireActor(ctx, as)).user._id,
});

export const rowFor = internalQuery({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) =>
    ctx.db
      .query("autopay")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first(),
});

export const savePending = internalMutation({
  args: { userId: v.id("users"), setupTokenId: v.string() },
  handler: async (ctx, { userId, setupTokenId }) => {
    const row = await ctx.db
      .query("autopay")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();
    if (row) await ctx.db.patch(row._id, { setupTokenId, status: row.status === "active" ? "active" : "pending", updatedAt: now });
    else
      await ctx.db.insert("autopay", {
        userId,
        status: "pending",
        setupTokenId,
        limitCents: DEFAULT_LIMIT,
        dailyLimitCents: DEFAULT_DAILY,
        usedDay: today(),
        usedCents: 0,
        updatedAt: now,
      });
  },
});

export const saveActive = internalMutation({
  args: { userId: v.id("users"), vaultId: v.string(), customerId: v.optional(v.string()), payerEmail: v.optional(v.string()) },
  handler: async (ctx, { userId, vaultId, customerId, payerEmail }) => {
    const row = await ctx.db
      .query("autopay")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, { status: "active", vaultId, customerId, payerEmail, setupTokenId: undefined, updatedAt: Date.now() });
  },
});

export const saveOff = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("autopay")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row) await ctx.db.patch(row._id, { status: "off", vaultId: undefined, customerId: undefined, setupTokenId: undefined, updatedAt: Date.now() });
  },
});

/** Step 1: PayPal asks the person to save their wallet for Plex. Nothing is charged. */
export const start = action({
  args: { origin: v.string(), as: v.optional(v.string()) },
  handler: async (ctx, { origin, as }): Promise<{ approveUrl: string }> => {
    if (!/^https?:\/\/[^/]+$/.test(origin)) throw new ConvexError("Bad return origin");
    if (!PayPalClient.isConfigured()) throw new ConvexError("PayPal isn't configured on this deployment.");
    const userId: Id<"users"> = await ctx.runQuery(internal.autopay.actorId, { as });
    try {
      const token = await createSetupToken(PayPalClient.fromEnv(), {
        returnUrl: `${origin}/developers?autopay=return`,
        cancelUrl: `${origin}/developers?autopay=cancel`,
        description: "Plex auto-pay: hold task payouts without a popup, charged only when proof passes",
        idempotencyKey: `setup-${userId}-${Date.now()}`,
      });
      const approveUrl = token.links.find((l) => l.rel === "approve")?.href;
      if (!approveUrl) throw new ConvexError("PayPal didn't return an approval link.");
      await ctx.runMutation(internal.autopay.savePending, { userId, setupTokenId: token.id });
      return { approveUrl };
    } catch (err) {
      if (err instanceof ConvexError) throw err;
      if (err instanceof PayPalError && err.status === 403)
        throw new ConvexError(
          "PayPal Vault isn't enabled for this app. In the PayPal developer dashboard, open the app, turn on “Save payment methods” under Features, then try again.",
        );
      throw new ConvexError(paypalMessage(err));
    }
  },
});

/** Step 2, back from PayPal: the approved setup token becomes a saved payment token. */
export const finish = action({
  args: { as: v.optional(v.string()) },
  handler: async (ctx, { as }): Promise<{ status: "active" | "not_approved" | "already" }> => {
    const userId: Id<"users"> = await ctx.runQuery(internal.autopay.actorId, { as });
    const row = await ctx.runQuery(internal.autopay.rowFor, { userId });
    if (!row) return { status: "not_approved" };
    if (!row.setupTokenId) return { status: row.status === "active" ? "already" : "not_approved" };
    try {
      const token = await createPaymentToken(PayPalClient.fromEnv(), row.setupTokenId);
      await ctx.runMutation(internal.autopay.saveActive, {
        userId,
        vaultId: token.id,
        customerId: token.customer?.id,
        payerEmail: token.payment_source?.paypal?.email_address,
      });
      return { status: "active" };
    } catch (err) {
      // Not approved yet (the person closed the PayPal window).
      if (err instanceof PayPalError && err.status === 422) return { status: "not_approved" };
      throw new ConvexError(paypalMessage(err));
    }
  },
});

/** Removes the saved wallet at PayPal too. */
export const turnOff = action({
  args: { as: v.optional(v.string()) },
  handler: async (ctx, { as }) => {
    const userId: Id<"users"> = await ctx.runQuery(internal.autopay.actorId, { as });
    const row = await ctx.runQuery(internal.autopay.rowFor, { userId });
    if (row?.vaultId && PayPalClient.isConfigured()) {
      try {
        await deletePaymentToken(PayPalClient.fromEnv(), row.vaultId);
      } catch (err) {
        if (!(err instanceof PayPalError && err.status === 404)) throw new ConvexError(paypalMessage(err));
      }
    }
    await ctx.runMutation(internal.autopay.saveOff, { userId });
  },
});

export const setLimits = mutation({
  args: { limitCents: v.number(), dailyLimitCents: v.number(), as: v.optional(v.string()) },
  handler: async (ctx, { limitCents, dailyLimitCents, as }) => {
    const { user } = await requireActor(ctx, as);
    const per = Math.round(limitCents);
    const daily = Math.round(dailyLimitCents);
    if (!(per >= 100 && per <= MAX_LIMIT)) throw new ConvexError(`Per-task limit must be $1 to ${formatCents(MAX_LIMIT)}.`);
    if (!(daily >= per && daily <= MAX_LIMIT * 4)) throw new ConvexError("The daily limit must be at least the per-task limit.");
    const row = await ctx.db
      .query("autopay")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!row) throw new ConvexError("Turn on auto-pay first.");
    await ctx.db.patch(row._id, { limitCents: per, dailyLimitCents: daily, updatedAt: Date.now() });
  },
});

/**
 * Code decides whether auto-pay may hold this amount. Reserves it against the
 * daily limit; `unreserve` gives it back if PayPal declines.
 */
export const reserve = internalMutation({
  args: { userId: v.id("users"), amountCents: v.number() },
  handler: async (ctx, { userId, amountCents }): Promise<{ vaultId: string; limitText: string } | { skip: string }> => {
    const row = await ctx.db
      .query("autopay")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!row || row.status !== "active" || !row.vaultId) return { skip: "Auto-pay is off" };
    const used = row.usedDay === today() ? row.usedCents : 0;
    if (amountCents > row.limitCents)
      return { skip: `${formatCents(amountCents)} is over your auto-pay limit of ${formatCents(row.limitCents)} per task` };
    if (used + amountCents > row.dailyLimitCents)
      return { skip: `That would pass your auto-pay limit of ${formatCents(row.dailyLimitCents)} a day` };
    await ctx.db.patch(row._id, { usedDay: today(), usedCents: used + amountCents, lastUsedAt: Date.now() });
    return {
      vaultId: row.vaultId,
      limitText: `auto-pay up to ${formatCents(row.limitCents)} a task, ${formatCents(row.dailyLimitCents)} a day`,
    };
  },
});

export const unreserve = internalMutation({
  args: { userId: v.id("users"), amountCents: v.number() },
  handler: async (ctx, { userId, amountCents }) => {
    const row = await ctx.db
      .query("autopay")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row && row.usedDay === today()) await ctx.db.patch(row._id, { usedCents: Math.max(0, row.usedCents - amountCents) });
  },
});
