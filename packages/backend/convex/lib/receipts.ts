import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export type ReceiptInput = Omit<Doc<"receipts">, "_id" | "_creationTime" | "timeline" | "occurredAt"> & {
  occurredAt?: number;
  timelineLabel?: string;
};

/**
 * Every engine writes money movements through here, so every payment gets a
 * Receipt with its why, rule and evidence.
 */
export async function writeReceipt(ctx: MutationCtx, input: ReceiptInput): Promise<Id<"receipts">> {
  const { timelineLabel, occurredAt, ...rest } = input;
  const at = occurredAt ?? Date.now();
  return ctx.db.insert("receipts", {
    ...rest,
    occurredAt: at,
    timeline: [{ at, label: timelineLabel ?? defaultLabel(rest.state), state: rest.state }],
  });
}

/** Moves a receipt to a new state and appends to its timeline. */
export async function advanceReceipt(
  ctx: MutationCtx,
  id: Id<"receipts">,
  state: Doc<"receipts">["state"],
  label?: string,
  patch: Partial<Pick<Doc<"receipts">, "paypal" | "evidence">> = {},
) {
  const r = await ctx.db.get(id);
  if (!r) throw new Error("Receipt not found");
  await ctx.db.patch(id, {
    state,
    ...patch,
    paypal: patch.paypal ? { ...r.paypal, ...patch.paypal } : r.paypal,
    evidence: patch.evidence ? { ...r.evidence, ...patch.evidence } : r.evidence,
    timeline: [...r.timeline, { at: Date.now(), label: label ?? defaultLabel(state), state }],
  });
}

function defaultLabel(state: Doc<"receipts">["state"]) {
  return {
    pending: "Waiting on PayPal",
    funded: "Funded through PayPal",
    held: "Held by Plex until proof passes",
    released: "Released to the worker",
    paid: "Paid",
    refunded: "Refunded",
    disputed: "Disputed",
    declined: "Declined",
  }[state];
}
