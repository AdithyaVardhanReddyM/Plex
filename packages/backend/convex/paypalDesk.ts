"use node";

import { v } from "convex/values";
import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_MODEL, HEURISTIC, RETRIES, geminiModel } from "./lib/ai";
import { compareOrder, disputeAction, disputeFor, type DisputeItem, type Fact, type PayPalOrder } from "./lib/paypalDesk";

/**
 * The PayPal desk: an agent that reads PayPal's own records for a task with
 * the PayPal Agent Toolkit (get_order, list_disputes, get_dispute) and tells
 * the poster and the worker what PayPal shows. Read-only by configuration: the
 * toolkit is built with only those three actions, so the model can't move
 * money. Code then compares PayPal's numbers with the receipts and, if the
 * payment is disputed, decides from the proof whether Plex contests it.
 */

const DESK_ACTIONS = { orders: { get: true }, disputes: { list: true, get: true } };

type RawTool = { description: string; parameters: unknown; execute: (args: unknown, opts: unknown) => Promise<unknown> };
type Call = { name: string; input: unknown; output: string };

function toolkit() {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENVIRONMENT } = process.env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) return null;
  return new PayPalAgentToolkit({
    clientId: PAYPAL_CLIENT_ID,
    clientSecret: PAYPAL_CLIENT_SECRET,
    configuration: { actions: DESK_ACTIONS, context: { sandbox: PAYPAL_ENVIRONMENT?.toLowerCase() !== "live" } },
  });
}

/** The toolkit's tools (written for AI SDK v4) as AI SDK v7 tools, logging every call. */
function deskTools(raw: Record<string, RawTool>, calls: Call[]): ToolSet {
  const out: ToolSet = {};
  for (const [name, t] of Object.entries(raw))
    out[name] = tool({
      description: t.description,
      inputSchema: t.parameters as never,
      execute: async (input: unknown) => {
        const res = await t.execute(input, {});
        const output = typeof res === "string" ? res : JSON.stringify(res);
        calls.push({ name, input, output });
        return output.length > 6000 ? `${output.slice(0, 6000)}…` : output;
      },
    });
  return out;
}

function parse<T>(s: string | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

async function runDesk(ctx: ActionCtx, taskId: Id<"tasks">, as: string | undefined, trusted: boolean) {
  const c = await ctx.runQuery(internal.paypalDeskData.context, { taskId, as, trusted });
  if (!c) return;
  const orderId = c.funding.orderId;
  if (!orderId || orderId.startsWith("SEED")) {
    await ctx.runMutation(internal.paypalDeskData.save, {
      taskId,
      check: {
        at: Date.now(),
        model: HEURISTIC,
        match: true,
        summary: orderId ? "Seeded demo task: there's no live PayPal order to look up." : "Not funded yet, so PayPal has nothing on file.",
        facts: [],
        tools: [],
      },
    });
    return;
  }
  const tk = toolkit();
  if (!tk) return;
  const raw = tk.getTools() as unknown as Record<string, RawTool>;
  const calls: Call[] = [];
  const tools = deskTools(raw, calls);
  const captureId = c.funding.captureId;

  // 1. The agent investigates with the toolkit and explains what it found.
  let summary = "";
  let model = HEURISTIC;
  const llm = geminiModel();
  if (llm) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("PayPal desk took over 90s")), 90_000);
      const res = await generateText({
        model: llm,
        tools,
        stopWhen: stepCountIs(6),
        maxRetries: RETRIES,
        abortSignal: controller.signal,
        system:
          "You are Plex's PayPal desk. Plex holds a task's payout with PayPal (an authorization), captures only what the worker is owed when the proof passes, and pays the worker with PayPal Payouts. " +
          "Use the PayPal tools to read PayPal's own records, then tell the poster and the worker, in 2 to 4 plain sentences, what PayPal shows: what was authorized, what was captured (if anything), whether any of the hold was never charged, and whether there's a dispute. " +
          "Only state amounts and statuses the tools returned. No Markdown, no ids longer than needed, no advice about anything else.",
        prompt: [
          `Task: "${c.title}" (Plex status: ${c.status}).`,
          `PayPal order id: ${orderId}. Read it with get_order.`,
          captureId
            ? `Captured payment id: ${captureId}. Call list_disputes with disputed_transaction_id set to it; if there is one, read it with get_dispute.`
            : "Nothing has been captured, so there can't be a dispute yet.",
          `Plex's receipts say: held ${(c.heldCents / 100).toFixed(2)} USD${c.paidCents !== undefined ? `, paid ${(c.paidCents / 100).toFixed(2)} USD to ${c.worker ?? "the worker"} (payout ${c.payoutState ?? "pending"})` : ""}.`,
          c.split?.some((l) => l.via === "kept")
            ? `The capture was split in code: ${c.split
                .map((l) => `${(l.cents / 100).toFixed(2)} USD ${l.via === "payout" ? `sent to ${l.label} by Payouts` : `kept by ${l.label}`}`)
                .join(", ")}. So the payout is smaller than the capture by Plex's share; that is expected.`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
      clearTimeout(timer);
      summary = res.text.trim();
      model = process.env.GEMINI_MODEL_QUALITY ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
    } catch (err) {
      console.warn("[paypal-desk] agent fell back:", err);
    }
  }

  // 2. Code makes sure it has PayPal's records, whatever the model called.
  const call = async (name: string, input: unknown) => {
    const t = raw[name];
    if (!t) return undefined;
    const res = await t.execute(input, {});
    const output = typeof res === "string" ? res : JSON.stringify(res);
    calls.push({ name, input, output });
    return output;
  };
  const orderOut = calls.find((x) => x.name === "get_order" && parse<PayPalOrder>(x.output)?.id === orderId)?.output ?? (await call("get_order", { id: orderId }));
  const order = parse<PayPalOrder>(orderOut);

  let dispute: DisputeItem | undefined;
  if (captureId) {
    const filtered = (x: Call) => (x.input as { disputed_transaction_id?: string } | null)?.disputed_transaction_id === captureId;
    const listed =
      calls.find((x) => x.name === "list_disputes" && filtered(x))?.output ??
      (await call("list_disputes", { disputed_transaction_id: captureId }));
    const items = parse<{ items?: DisputeItem[] }>(listed)?.items ?? [];
    // Filtered by PayPal to this capture; the list may not repeat the transaction ids.
    const first = disputeFor(items, captureId) ?? items[0];
    if (first) {
      const read =
        calls.find((x) => x.name === "get_dispute" && parse<DisputeItem>(x.output)?.dispute_id === first.dispute_id)?.output ??
        (await call("get_dispute", { dispute_id: first.dispute_id }));
      const full: DisputeItem = { ...first, ...(parse<DisputeItem>(read) ?? {}) };
      // Trust the filter only if PayPal's details don't name a different transaction.
      if (!full.disputed_transactions?.length || disputeFor([full], captureId)) dispute = full;
    }
  }

  // 3. Code compares PayPal with the receipts, and decides how to answer a dispute.
  const facts: Fact[] = order
    ? compareOrder(order, { funding: c.funding, heldCents: c.heldCents, paidCents: c.paidCents, payoutState: c.payoutState })
    : [{ label: "Order", value: `PayPal didn't return order ${orderId}`, ok: false }];
  if (c.payoutBatchId) facts.push({ label: "Payout", value: `Batch ${c.payoutBatchId} · ${c.payoutState ?? "sent"}`, ok: c.payoutState !== "declined" });
  let disputeOut: { id: string; status: string; reason: string; amount: string; action: "contest" | "accept"; why: string } | undefined;
  if (dispute) {
    const reason = dispute.reason ?? "OTHER";
    const decision = disputeAction(reason, c.verdict);
    disputeOut = {
      id: dispute.dispute_id,
      status: (dispute.status ?? "OPEN").toLowerCase().replace(/_/g, " "),
      reason: reason.toLowerCase().replace(/_/g, " "),
      amount: dispute.dispute_amount?.value ? `$${dispute.dispute_amount.value}` : "",
      ...decision,
    };
    facts.push({ label: "Dispute", value: `${disputeOut.reason} · ${disputeOut.status}`, ok: false });
  } else if (captureId) facts.push({ label: "Disputes", value: "None on this payment", ok: true });

  const match = facts.every((f) => f.ok !== false || f.label === "Dispute");
  if (!summary)
    summary = order
      ? `PayPal shows order ${orderId} ${order.status.toLowerCase()}. ${facts
          .filter((f) => f.label === "Held" || f.label === "Charged")
          .map((f) => `${f.label}: ${f.value}.`)
          .join(" ")}${disputeOut ? ` There's an open dispute (${disputeOut.reason}).` : ""}`
      : "PayPal didn't return this order.";

  await ctx.runMutation(internal.paypalDeskData.save, {
    taskId,
    check: {
      at: Date.now(),
      model,
      match,
      summary: summary.slice(0, 900),
      facts,
      tools: calls.map((x) => x.name),
      dispute: disputeOut,
    },
  });
}

/** "Check with PayPal" on the task page (the poster or the worker). */
export const check = action({
  args: { taskId: v.id("tasks"), as: v.optional(v.string()) },
  handler: async (ctx, { taskId, as }) => {
    await runDesk(ctx, taskId, as, false);
  },
});

/** Runs on its own after money moves (a release, a refund). */
export const checkInternal = internalAction({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    await runDesk(ctx, taskId, undefined, true);
  },
});
