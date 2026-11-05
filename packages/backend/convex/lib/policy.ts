import type { Infer } from "convex/values";
import type { policyRule } from "../schema";
import { formatCents } from "./money";

export type PolicyRule = Infer<typeof policyRule>;

export interface SpendRequest {
  amountCents: number;
  category?: string;
  merchant?: string;
  /** Local hour 0-23 at the time of the request. */
  hour: number;
  spentTodayCents: number;
  /** This month's spend from the pot. Only `monthly_limit` reads it. */
  spentMonthCents?: number;
  balanceCents: number;
  paused: boolean;
}

export type PolicyDecision =
  | { outcome: "allow"; ruleText: string }
  | { outcome: "needs_approval"; ruleText: string }
  | { outcome: "deny"; ruleText: string };

/** Human sentence for a rule, used on Receipts and approval cards. */
export function describeRule(rule: PolicyRule): string {
  switch (rule.kind) {
    case "daily_limit":
      return `Up to ${formatCents(rule.amountCents)} a day`;
    case "per_purchase_limit":
      return `Up to ${formatCents(rule.amountCents)} per purchase`;
    case "approval_over":
      return `Ask before anything over ${formatCents(rule.amountCents)}`;
    case "block_category":
      return `Never buy ${rule.category} without asking`;
    case "allow_merchants":
      return `Only from ${rule.merchants.join(", ")}`;
    case "quiet_hours":
      return `No spending between ${hourLabel(rule.startHour)} and ${hourLabel(rule.endHour)}`;
    case "monthly_limit":
      return `Up to ${formatCents(rule.amountCents)} a month`;
    case "auto_approve":
      return `Pay ${rule.merchant} up to ${formatCents(rule.upToCents)} without asking`;
  }
}

function hourLabel(h: number) {
  const suffix = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return h === 0 ? "midnight" : `${hr}${suffix}`;
}

function inQuietHours(hour: number, start: number, end: number) {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * The policy engine. Deterministic: the model turns plain English into
 * `rules` once, and this code alone decides whether money may move.
 * Order matters: hard denials first, then standing approvals (`auto_approve`),
 * then limits and ask-first rules, then allow.
 */
export function evaluate(rules: PolicyRule[], req: SpendRequest): PolicyDecision {
  if (req.paused) return { outcome: "deny", ruleText: "All agent spending is paused" };
  if (req.amountCents > req.balanceCents)
    return { outcome: "deny", ruleText: `Pot balance is ${formatCents(req.balanceCents)}` };

  // 1. Hard denials, whatever order the rules were written in.
  for (const rule of rules) {
    if (rule.kind === "quiet_hours" && inQuietHours(req.hour, rule.startHour, rule.endHour))
      return { outcome: "deny", ruleText: describeRule(rule) };
    if (
      rule.kind === "allow_merchants" &&
      req.merchant &&
      !rule.merchants.some((m) => m.toLowerCase() === req.merchant!.toLowerCase())
    )
      return { outcome: "deny", ruleText: describeRule(rule) };
  }
  // 2. Standing approvals ("Always"): that merchant, at or under the amount.
  if (req.merchant) {
    const merchant = req.merchant.trim().toLowerCase();
    const standing = rules.find(
      (r) => r.kind === "auto_approve" && r.merchant.trim().toLowerCase() === merchant && req.amountCents <= r.upToCents,
    );
    if (standing) return { outcome: "allow", ruleText: describeRule(standing) };
  }
  // 3. Limits: over one, a person decides.
  for (const rule of rules) {
    if (rule.kind === "per_purchase_limit" && req.amountCents > rule.amountCents)
      return { outcome: "needs_approval", ruleText: describeRule(rule) };
    if (rule.kind === "daily_limit" && req.spentTodayCents + req.amountCents > rule.amountCents)
      return { outcome: "needs_approval", ruleText: describeRule(rule) };
    if (
      rule.kind === "monthly_limit" &&
      (req.spentMonthCents ?? 0) + req.amountCents > rule.amountCents
    )
      return { outcome: "needs_approval", ruleText: describeRule(rule) };
  }
  // 4. Ask-first rules.
  for (const rule of rules) {
    if (rule.kind === "approval_over" && req.amountCents > rule.amountCents)
      return { outcome: "needs_approval", ruleText: describeRule(rule) };
    if (
      rule.kind === "block_category" &&
      req.category &&
      req.category.toLowerCase() === rule.category.toLowerCase()
    )
      return { outcome: "needs_approval", ruleText: describeRule(rule) };
  }
  const limit = rules.find(
    (r) => r.kind === "daily_limit" || r.kind === "per_purchase_limit" || r.kind === "monthly_limit",
  );
  return { outcome: "allow", ruleText: limit ? describeRule(limit) : "Within pot balance" };
}

/** Where the decision came from: the index of the rule that decided, or -1 for pause/balance. */
export function decidingRuleIndex(rules: PolicyRule[], decision: PolicyDecision): number {
  return rules.findIndex((r) => describeRule(r) === decision.ruleText);
}
