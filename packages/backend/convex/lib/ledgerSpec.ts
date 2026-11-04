import { v, type Infer, type VLiteral, type VUnion } from "convex/values";

/**
 * Plex Ledger widget specs: the typed vocabulary the Analyst agent builds
 * dashboards with. The agent never writes UI or queries; it picks a spec from
 * this closed set and the client renders it live (AG Grid / AG Charts) over the
 * viewer's own receipts. The same pure functions run on the server so the
 * agent's answer quotes the numbers the widget will show.
 *
 * AG Studio: these specs map 1:1 onto Studio widget definitions (a grid with
 * column defs and a filter model, or a chart with a series and grouping), so the
 * Studio Agent Framework can call `create_widget` / `update_widget` with the
 * same shapes (see LEDGER_AGENT_TOOLS below).
 *
 * Imported by the web app as `@plex/backend/lib/ledgerSpec`, so keep it free of
 * server-only code.
 */

// ── Vocabulary ───────────────────────────────────────────────────────────────

export const ROLES = ["personal", "poster", "cause"] as const;
export type LedgerRole = (typeof ROLES)[number];

export const RECEIPT_KINDS = [
  "task_funding", "payout", "refund", "donation", "purchase", "invoice", "subscription",
] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

export const RECEIPT_STATES = [
  "pending", "funded", "held", "released", "paid", "refunded", "disputed", "declined",
] as const;
export type ReceiptStateName = (typeof RECEIPT_STATES)[number];

/** Grid columns a widget can ask for. */
export const COLUMN_KEYS = ["when", "party", "why", "rule", "agent", "category", "kind", "state", "amount"] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

/** What a chart can group by. */
export const GROUP_KEYS = ["category", "day", "week", "state", "kind", "agent", "party"] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

export const CHART_TYPES = ["bar", "column", "donut", "line", "area"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const MEASURES = ["sum", "count"] as const;

/** A Convex validator for one of a fixed list of strings. */
const lit = <T extends string>(values: readonly T[]) =>
  v.union(...values.map((x) => v.literal(x))) as unknown as VUnion<T, VLiteral<T, "required">[], "required">;

export const vRole = lit(ROLES);
export const vColumnKey = lit(COLUMN_KEYS);
export const vGroupKey = lit(GROUP_KEYS);

export const vWidgetFilter = v.object({
  /** Only receipts from the last N days. */
  sinceDays: v.optional(v.number()),
  kinds: v.optional(v.array(lit(RECEIPT_KINDS))),
  states: v.optional(v.array(lit(RECEIPT_STATES))),
  categories: v.optional(v.array(v.string())),
  agents: v.optional(v.array(v.string())),
  parties: v.optional(v.array(v.string())),
  direction: v.optional(v.union(v.literal("in"), v.literal("out"))),
  /** Case-insensitive match on the why, the party or the rule. */
  search: v.optional(v.string()),
});

export const vWidgetSpec = v.object({
  kind: v.union(v.literal("grid"), v.literal("chart"), v.literal("stat")),
  title: v.string(),
  subtitle: v.optional(v.string()),
  filter: vWidgetFilter,
  columns: v.optional(v.array(vColumnKey)),
  sort: v.optional(v.object({ column: vColumnKey, desc: v.boolean() })),
  chart: v.optional(
    v.object({
      type: lit(CHART_TYPES),
      groupBy: vGroupKey,
      measure: lit(MEASURES),
      stackBy: v.optional(vGroupKey),
    }),
  ),
  stat: v.optional(
    v.object({
      measure: v.union(v.literal("sum"), v.literal("count"), v.literal("avg")),
      compareToPrevious: v.optional(v.boolean()),
    }),
  ),
});

export type WidgetFilter = Infer<typeof vWidgetFilter>;
export type WidgetSpec = Infer<typeof vWidgetSpec>;

// ── Action tools, scoped per role ────────────────────────────────────────────

/**
 * The dashboard's action tools. Each role only gets the tools it should have
 * (AG Grid's guardrail approach: don't hand the model tools it shouldn't use).
 * Every tool runs behind a confirmation dialog in the UI and is re-checked on
 * the server.
 */
export const ACTION_TOOLS = {
  send_reminder: { label: "Send reminder", verb: "Send", moves: false },
  release_payout: { label: "Release payout", verb: "Release", moves: true },
  refund: { label: "Refund", verb: "Refund", moves: true },
} as const;
export type ActionTool = keyof typeof ACTION_TOOLS;

export const ROLE_TOOLS: Record<LedgerRole, readonly ActionTool[]> = {
  personal: ["send_reminder"],
  poster: ["release_payout", "refund"],
  cause: ["release_payout"],
};

/**
 * Tool definitions for an outside agent harness (AG Studio Agent Framework,
 * MCP). The Analyst's runner uses the same shapes internally.
 */
export const LEDGER_AGENT_TOOLS = [
  {
    name: "create_widget",
    description: "Add a grid, chart or stat to the Ledger, built from the viewer's receipts.",
    input: "WidgetSpec",
  },
  { name: "pin_widget", description: "Pin a widget to the role's dashboard.", input: "{ spec: WidgetSpec }" },
  { name: "ask_ledger", description: "Answer a money question with a short answer and widgets.", input: "{ question: string }" },
] as const;

// ── Pure data functions (client and server) ─────────────────────────────────

/** The fields of a receipt the Ledger reads; a Doc<"receipts"> satisfies it. */
export interface LedgerReceipt {
  kind: ReceiptKind;
  state: ReceiptStateName;
  amountCents: number;
  occurredAt: number;
  payeeLabel: string;
  payerLabel: string;
  payeeId?: string;
  payerId?: string;
  ownerId: string;
  agentLabel?: string;
  category?: string;
  why: string;
  rule: { text: string };
}

const DAY = 86_400_000;

/**
 * Which way the money went for the ledger's owner: "in" to them, "out" from
 * them, or "via" when Plex paid it on from a hold (a worker's payout, already
 * counted when the task was funded).
 */
export function direction(r: LedgerReceipt): "in" | "out" | "via" {
  if (r.payeeId === r.ownerId || r.kind === "refund" || r.kind === "invoice") return "in";
  if (r.kind === "payout" && r.payerId !== r.ownerId) return "via";
  return "out";
}

/** The other side of the payment, as a person reads it. */
export function partyOf(r: LedgerReceipt): string {
  if (direction(r) === "in") return r.payerLabel;
  if (r.kind === "payout") return r.payeeLabel;
  if (r.payeeLabel !== "Plex (held)") return r.payeeLabel;
  // Task money sits with Plex until proof; name where it ended up.
  if (r.state === "released" || r.state === "paid") return "Paid out by Plex";
  if (r.state === "refunded") return "Returned by Plex";
  return "Held by Plex";
}

export function agentOf(r: LedgerReceipt): string {
  return r.agentLabel ?? "You";
}

export function applyFilter<R extends LedgerReceipt>(rows: R[], f: WidgetFilter, now: number): R[] {
  const q = f.search?.trim().toLowerCase();
  const lower = (xs?: string[]) => xs?.map((x) => x.toLowerCase());
  const cats = lower(f.categories);
  const agents = lower(f.agents);
  const parties = lower(f.parties);
  return rows.filter((r) => {
    if (f.sinceDays !== undefined && r.occurredAt < now - f.sinceDays * DAY) return false;
    if (f.kinds?.length && !f.kinds.includes(r.kind)) return false;
    if (f.states?.length && !f.states.includes(r.state)) return false;
    if (cats?.length && !cats.includes((r.category ?? "").toLowerCase())) return false;
    if (agents?.length && !agents.includes(agentOf(r).toLowerCase())) return false;
    if (parties?.length && !parties.some((p) => partyOf(r).toLowerCase().includes(p))) return false;
    if (f.direction && direction(r) !== f.direction) return false;
    if (q && ![r.why, partyOf(r), r.rule.text, r.category ?? ""].some((s) => s.toLowerCase().includes(q))) return false;
    return true;
  });
}

const STATE_LABEL: Record<ReceiptStateName, string> = {
  pending: "Pending", funded: "Funded", held: "Held", released: "Released", paid: "Paid",
  refunded: "Refunded", disputed: "Disputed", declined: "Declined",
};
const KIND_LABEL: Record<ReceiptKind, string> = {
  task_funding: "Task funding", payout: "Payout", refund: "Refund", donation: "Donation",
  purchase: "Purchase", invoice: "Invoice", subscription: "Subscription",
};
export const stateLabel = (s: ReceiptStateName) => STATE_LABEL[s];
export const kindLabel = (k: ReceiptKind) => KIND_LABEL[k];

function dayKey(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The bucket a receipt falls in for a grouping, with a sortable key. */
export function groupOf(r: LedgerReceipt, g: GroupKey): { key: string | number; label: string } {
  switch (g) {
    case "category":
      return { key: r.category ?? "Other", label: r.category ?? "Other" };
    case "state":
      return { key: r.state, label: STATE_LABEL[r.state] };
    case "kind":
      return { key: r.kind, label: KIND_LABEL[r.kind] };
    case "agent":
      return { key: agentOf(r), label: agentOf(r) };
    case "party":
      return { key: partyOf(r), label: partyOf(r) };
    case "day": {
      const k = dayKey(r.occurredAt);
      return { key: k, label: new Date(k).toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
    }
    case "week": {
      const d = new Date(dayKey(r.occurredAt));
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
      return { key: d.getTime(), label: "Week of " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
    }
  }
}

export interface Bucket {
  key: string | number;
  label: string;
  value: number; // cents for sum, count for count
  count: number;
  /** Per-stack values when the chart stacks, keyed by stack label. */
  stacks: Record<string, number>;
}

export function aggregate(
  rows: LedgerReceipt[],
  groupBy: GroupKey,
  measure: "sum" | "count",
  stackBy?: GroupKey,
): { buckets: Bucket[]; stackKeys: string[] } {
  const map = new Map<string | number, Bucket>();
  const stackKeys = new Set<string>();
  for (const r of rows) {
    const g = groupOf(r, groupBy);
    const b = map.get(g.key) ?? { key: g.key, label: g.label, value: 0, count: 0, stacks: {} };
    const amount = measure === "sum" ? r.amountCents : 1;
    b.value += amount;
    b.count += 1;
    if (stackBy) {
      const s = groupOf(r, stackBy).label;
      stackKeys.add(s);
      b.stacks[s] = (b.stacks[s] ?? 0) + amount;
    }
    map.set(g.key, b);
  }
  let buckets = [...map.values()];
  const timeBased = groupBy === "day" || groupBy === "week";
  buckets = timeBased
    ? buckets.sort((a, b) => Number(a.key) - Number(b.key))
    : buckets.sort((a, b) => b.value - a.value);
  return { buckets, stackKeys: [...stackKeys] };
}

export function sumCents(rows: LedgerReceipt[]) {
  return rows.reduce((s, r) => s + r.amountCents, 0);
}

/** Fill missing days with zero so a daily chart reads as a timeline. */
export function fillDays(buckets: Bucket[], sinceDays: number, now: number): Bucket[] {
  const byKey = new Map(buckets.map((b) => [Number(b.key), b]));
  const out: Bucket[] = [];
  const start = dayKey(now - (sinceDays - 1) * DAY);
  for (let t = start; t <= now; t += DAY) {
    const k = dayKey(t);
    out.push(
      byKey.get(k) ?? {
        key: k,
        label: new Date(k).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: 0,
        count: 0,
        stacks: {},
      },
    );
  }
  return out;
}

export const ROLE_LABEL: Record<LedgerRole, string> = {
  personal: "Personal",
  poster: "Task poster",
  cause: "Cause",
};

/** Which receipts a role's Ledger covers (applied to the viewer's receipts). */
export const ROLE_BASE_FILTER: Record<LedgerRole, WidgetFilter> = {
  personal: {},
  poster: { kinds: ["task_funding", "payout", "refund"] },
  cause: {},
};
