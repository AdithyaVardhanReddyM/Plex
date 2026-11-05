import { query } from "./_generated/server";
import { getViewer } from "./lib/viewer";
import { withBillStatus } from "./agent";

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
