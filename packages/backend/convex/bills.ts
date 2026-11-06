import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { agentUser } from "./lib/agentAuth";
import { formatCents } from "./lib/money";
import { getViewer } from "./lib/viewer";
import { logActivity, withBillStatus } from "./agent";

/** The viewer's bills by due date. An unpaid bill past its date reads as overdue. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const now = Date.now();
    const bills = await ctx.db
      .query("bills")
      .withIndex("by_owner_due", (q) => q.eq("ownerId", viewer.user._id))
      .collect();
    return bills.map((b) => withBillStatus(b, now));
  },
});

const DAY = 86_400_000;

/**
 * The brain records a bill it found (an emailed bill, a PDF on the Mac, a biller's portal).
 * The same payee with an open bill due within 20 days is the same bill: it's updated, not
 * duplicated. `usualCents` is worked out here, from the payee's paid bills (the average of the
 * last three), so a spike is a number the code computes, not the model's impression.
 */
export const record = mutation({
  args: {
    secret: v.string(),
    payee: v.string(),
    amountCents: v.number(),
    dueAt: v.number(),
    category: v.optional(v.string()),
    payeeEmail: v.optional(v.string()),
    source: v.optional(v.union(v.literal("email"), v.literal("invoice"), v.literal("manual"))),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { secret, ...b }) => {
    const user = await agentUser(ctx, secret);
    if (!Number.isInteger(b.amountCents) || b.amountCents <= 0) throw new ConvexError("Amounts must be positive whole cents");
    const payee = b.payee.trim();
    const key = payee.toLowerCase();
    const all = await ctx.db
      .query("bills")
      .withIndex("by_owner_due", (q) => q.eq("ownerId", user._id))
      .collect();
    const same = all.filter((x) => x.payee.toLowerCase() === key);
    const paid = same.filter((x) => x.status === "paid").sort((a, z) => z.dueAt - a.dueAt).slice(0, 3);
    const prior = same.find((x) => x.usualCents);
    const usualCents = paid.length
      ? Math.round(paid.reduce((s, x) => s + x.amountCents, 0) / paid.length)
      : prior?.usualCents;
    const open = same.find((x) => x.status !== "paid" && Math.abs(x.dueAt - b.dueAt) < 20 * DAY);
    const fields = {
      payee,
      amountCents: b.amountCents,
      dueAt: b.dueAt,
      category: b.category?.trim() || open?.category || prior?.category || "Bills",
      payeeEmail: b.payeeEmail?.trim() || open?.payeeEmail || prior?.payeeEmail,
      source: b.source ?? "email",
      note: b.note?.trim() || undefined,
      usualCents,
    };
    let billId: Id<"bills">;
    if (open) {
      billId = open._id;
      await ctx.db.patch(open._id, fields);
    } else {
      billId = await ctx.db.insert("bills", {
        ...fields,
        ownerId: user._id,
        status: "upcoming",
        autopay: same.some((x) => x.autopay),
      });
    }
    await logActivity(ctx, {
      ownerId: user._id,
      kind: "money",
      title: `${open ? "Updated" : "New"} bill: ${payee} ${formatCents(b.amountCents)}`,
      detail: usualCents ? `Usually ${formatCents(usualCents)}` : undefined,
    });
    return {
      billId,
      updated: Boolean(open),
      usualCents: usualCents ?? null,
      // 2.2 means 2.2 times the usual amount.
      timesUsual: usualCents ? Math.round((b.amountCents / usualCents) * 10) / 10 : null,
    };
  },
});
