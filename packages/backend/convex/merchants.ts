import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * What a merchant's own page can learn about a payment Plex made against one of its
 * references (an order, booking or citation number). The invented merchant sites in
 * apps/web (`/sites/*`) call this to flip a checkout to "Paid" when the agent's PayPal
 * Payout carries their reference, the way a real merchant would match the note on an
 * incoming PayPal payment. It reveals only that a payment exists, its amount and its
 * PayPal id, never who paid or why.
 */
export const paymentFor = query({
  args: { reference: v.string() },
  handler: async (ctx, { reference }) => {
    const ref = reference.trim();
    if (!ref) return null;
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_reference", (q) => q.eq("reference", ref))
      .collect();
    const r = receipts.filter((x) => x.state !== "declined" && x.state !== "refunded").at(-1);
    if (!r) return null;
    return {
      amountCents: r.amountCents,
      state: r.state,
      paidAt: r.occurredAt,
      paypalId: r.paypal?.payoutBatchId ?? r.paypal?.orderId ?? null,
    };
  },
});
