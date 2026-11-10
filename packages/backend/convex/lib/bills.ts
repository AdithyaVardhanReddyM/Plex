/**
 * Everyday bills: Gemini reads an email and proposes what the bill is; these
 * rules decide whether Plex pays it by itself or asks first. Pure code, no
 * model: a bill pays itself only when every check passes.
 */
import { formatCents } from "./money";

export type BillFacts = {
  amountCents?: number;
  currency?: string;
  payTo?: string;
  invoiceNumber?: string;
  vendor?: string;
  fromEmail: string;
};

export type BillHistory = {
  /** Who this person has paid before for this sender's bills. */
  paidPayeesForSender: string[];
  /** Invoice numbers already paid for this sender. */
  paidNumbersForSender: string[];
  /** The same amount, same sender, paid in the last 25 days. */
  sameAmountRecently: boolean;
  autoPayUnderCents: number;
  autoPayOn: boolean;
};

export type BillCheck = { check: string; passed: boolean; detail: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s?: string) => Boolean(s && EMAIL.test(s.trim()));

/** Bill-ish words, for the Gmail search and the heuristic reader. */
export const BILL_QUERY = 'newer_than:7d -from:me (invoice OR bill OR "amount due" OR "payment due" OR "pay now" OR "balance due")';

export function billChecks(b: BillFacts, h: BillHistory): { checks: BillCheck[]; autoPay: boolean; missing: string[] } {
  const checks: BillCheck[] = [];
  const missing: string[] = [];
  const payTo = b.payTo?.trim().toLowerCase();

  const hasAmount = Boolean(b.amountCents && b.amountCents > 0);
  if (!hasAmount) missing.push("the amount");
  checks.push({ check: "Amount found", passed: hasAmount, detail: hasAmount ? formatCents(b.amountCents!) : "The email doesn't say how much" });

  const usd = !b.currency || b.currency.toUpperCase() === "USD";
  checks.push({ check: "In US dollars", passed: usd, detail: usd ? "USD" : `${b.currency}: Plex pays in USD only` });

  const hasPayee = isEmail(payTo);
  if (!hasPayee) missing.push("the PayPal email to pay");
  checks.push({ check: "Who to pay", passed: hasPayee, detail: hasPayee ? payTo! : "No PayPal email in the bill" });

  // Paying a new address is how invoice fraud works: the first time always asks.
  const knownPayee = hasPayee && h.paidPayeesForSender.includes(payTo!);
  checks.push({
    check: "Paid this payee before",
    passed: knownPayee,
    detail: knownPayee ? `You've paid ${payTo} for ${b.fromEmail} before` : `First bill paying ${hasPayee ? payTo : "this payee"} from ${b.fromEmail}, so Plex asks`,
  });

  const dupNumber = Boolean(b.invoiceNumber && h.paidNumbersForSender.includes(b.invoiceNumber));
  const dup = dupNumber || h.sameAmountRecently;
  checks.push({
    check: "Not paid already",
    passed: !dup,
    detail: dupNumber ? `Invoice ${b.invoiceNumber} was already paid` : h.sameAmountRecently ? "The same amount from this sender was paid in the last 25 days" : b.invoiceNumber ? `Invoice ${b.invoiceNumber} is new` : "No earlier payment matches",
  });

  const underLimit = hasAmount && b.amountCents! <= h.autoPayUnderCents;
  checks.push({
    check: "Under your bill limit",
    passed: underLimit,
    detail: hasAmount ? `${formatCents(b.amountCents!)} ${underLimit ? "≤" : ">"} ${formatCents(h.autoPayUnderCents)}` : "No amount to compare",
  });

  checks.push({ check: "Auto-pay is on", passed: h.autoPayOn, detail: h.autoPayOn ? "Your saved PayPal wallet" : "Turn on auto-pay to let bills pay themselves" });

  return { checks, autoPay: checks.every((c) => c.passed), missing };
}

/** Without Gemini: the first dollar amount, an invoice number and a PayPal email near "paypal". */
export function heuristicBill(text: string): { isBill: boolean; amountCents?: number; invoiceNumber?: string; payTo?: string; dueDate?: string } {
  const isBill = /invoice|amount due|payment due|balance due|pay now/i.test(text);
  const amount = text.match(/(?:amount due|total|balance due|amount)[^$\d]{0,20}\$\s?([\d,]+(?:\.\d{2})?)/i) ?? text.match(/\$\s?([\d,]+\.\d{2})/);
  const number = text.match(/invoice\s*(?:#|no\.?|number)\s*:?\s*([A-Z0-9][\w-]{1,20})/i);
  const pay = text.match(/paypal[^@\n]{0,60}?([\w.+-]+@[\w-]+\.[\w.-]+)/i);
  const due = text.match(/due(?: date)?[:\s]+(\d{4}-\d{2}-\d{2})/i);
  return {
    isBill,
    amountCents: amount ? Math.round(Number(amount[1]!.replace(/,/g, "")) * 100) : undefined,
    invoiceNumber: number?.[1],
    payTo: pay?.[1]?.toLowerCase(),
    dueDate: due?.[1],
  };
}

/** "Sunny Window Co <billing@sunny.example>" → "billing@sunny.example". */
export function emailOf(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
}
