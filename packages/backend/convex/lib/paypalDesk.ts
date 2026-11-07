/**
 * Pure rules for the PayPal desk: compare what PayPal's own records say (read
 * by the agent through the PayPal Agent Toolkit) with Plex's receipts, and
 * decide how to answer a dispute. The model reads and explains; this decides.
 */
import { formatCents } from "./money";

type Money = { value?: string; currency_code?: string };
type Auth = { id: string; status: string; amount?: Money };
type Capture = { id: string; status: string; amount?: Money };

export interface PayPalOrder {
  id: string;
  status: string;
  intent?: string;
  payer?: { email_address?: string };
  payment_source?: { paypal?: { email_address?: string } };
  purchase_units?: Array<{ amount?: Money; payments?: { authorizations?: Auth[]; captures?: Capture[] } }>;
}

export interface DeskFacts {
  funding: { state: string; orderId?: string; authorizationId?: string; captureId?: string; via?: string };
  heldCents: number;
  paidCents?: number;
  payoutState?: string;
}

export type Fact = { label: string; value: string; ok?: boolean };

const cents = (m?: Money) => (m?.value ? Math.round(Number(m.value) * 100) : undefined);

const AUTH_WORDS: Record<string, string> = {
  CREATED: "active hold",
  PENDING: "pending",
  CAPTURED: "captured",
  PARTIALLY_CAPTURED: "partly captured",
  VOIDED: "voided",
  EXPIRED: "expired",
  DENIED: "denied",
};

export function compareOrder(order: PayPalOrder, f: DeskFacts): Fact[] {
  const pu = order.purchase_units?.[0];
  const auth = pu?.payments?.authorizations?.find((a) => a.id === f.funding.authorizationId) ?? pu?.payments?.authorizations?.[0];
  const capture = pu?.payments?.captures?.find((c) => c.id === f.funding.captureId) ?? pu?.payments?.captures?.[0];
  const payer = order.payer?.email_address ?? order.payment_source?.paypal?.email_address;
  const facts: Fact[] = [
    {
      label: "Order",
      value: `${order.id} · ${order.status.toLowerCase()}${f.funding.via === "autopay" ? " · saved wallet (Vault)" : ""}`,
      ok: order.id === f.funding.orderId && ["COMPLETED", "APPROVED"].includes(order.status),
    },
  ];
  if (payer) facts.push({ label: "Paid from", value: payer });

  const authCents = cents(auth?.amount);
  facts.push({
    label: "Held",
    value: auth ? `${formatCents(authCents ?? 0)} authorized · ${AUTH_WORDS[auth.status] ?? auth.status.toLowerCase()}` : "No authorization on the order",
    ok: Boolean(auth) && auth!.id === f.funding.authorizationId && authCents === f.heldCents,
  });

  const charged = ["captured", "released"].includes(f.funding.state);
  if (charged) {
    const capCents = cents(capture?.amount);
    facts.push({
      label: "Charged",
      value: capture ? `${formatCents(capCents ?? 0)} captured · ${capture.status.toLowerCase()}` : "No capture on the order",
      ok: Boolean(capture) && (f.paidCents === undefined || capCents === f.paidCents),
    });
    if (capCents !== undefined && authCents !== undefined && capCents < authCents)
      facts.push({ label: "Never charged", value: `${formatCents(authCents - capCents)} of the hold was released`, ok: true });
  } else if (f.funding.state === "refunded") {
    const voided = auth?.status === "VOIDED";
    const refunded = capture?.status === "REFUNDED" || capture?.status === "PARTIALLY_REFUNDED";
    facts.push({ label: "Charged", value: voided ? "Nothing: the hold was voided" : refunded ? "Captured, then refunded" : "PayPal doesn't show a void or refund yet", ok: voided || refunded });
  } else {
    facts.push({
      label: "Charged",
      value: capture ? `${formatCents(cents(capture.amount) ?? 0)} captured` : "Nothing yet: held until the proof passes",
      ok: !capture && ["CREATED", "PENDING"].includes(auth?.status ?? ""),
    });
  }
  return facts;
}

export type DisputeItem = {
  dispute_id: string;
  status?: string;
  reason?: string;
  dispute_amount?: Money;
  disputed_transactions?: Array<{ seller_transaction_id?: string; buyer_transaction_id?: string }>;
};

/** The dispute about this task's capture, if PayPal has one. */
export function disputeFor(items: DisputeItem[], captureId?: string): DisputeItem | undefined {
  if (!captureId) return undefined;
  return items.find((d) => d.disputed_transactions?.some((t) => t.seller_transaction_id === captureId));
}

/** Contest only when the proof passed cleanly and the claim is about the work itself. */
export function disputeAction(
  reason: string,
  verdict: { result: string; confidence: number; passed: number; total: number } | null,
): { action: "contest" | "accept"; why: string } {
  const aboutTheWork = ["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"].includes(reason);
  if (verdict && verdict.result === "pass" && verdict.confidence >= 0.9 && aboutTheWork)
    return {
      action: "contest",
      why: `The proof passed ${verdict.passed} of ${verdict.total} checks at ${Math.round(verdict.confidence * 100)}% before any money moved. Plex answers with the proof and the receipts.`,
    };
  return {
    action: "accept",
    why: !aboutTheWork
      ? `The claim (${reason.toLowerCase().replace(/_/g, " ")}) isn't about the work, so the proof can't answer it. Refund the poster.`
      : verdict
        ? `The proof was ${verdict.result} at ${Math.round(verdict.confidence * 100)}%, not strong enough to contest. Refund the poster.`
        : "There's no proof on file to contest with. Refund the poster.",
  };
}
