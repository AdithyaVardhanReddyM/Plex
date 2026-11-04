/**
 * Typed wrappers for the PayPal APIs Plex uses. See the integration map in
 * docs/Plex-Project-Plan.md §6. Amounts in and out are integer cents.
 */
import type { PayPalClient } from "./client";

export const toValue = (cents: number): string => (cents / 100).toFixed(2);
export const toCents = (value: string | number): number => Math.round(Number(value) * 100);

type Money = { currency_code: string; value: string };
type Link = { href: string; rel: string; method?: string };

// ── Orders v2 ────────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  amountCents: number;
  currency?: string;
  /** CAPTURE charges on approval; AUTHORIZE holds funds until proof passes. */
  intent?: "CAPTURE" | "AUTHORIZE";
  description: string;
  /** Our id (task, donation...) so webhooks can find the record. */
  referenceId: string;
  customId?: string;
  returnUrl?: string;
  cancelUrl?: string;
  brandName?: string;
  idempotencyKey?: string;
}

export interface Order {
  id: string;
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  intent: "CAPTURE" | "AUTHORIZE";
  links: Link[];
  purchase_units: Array<{
    reference_id?: string;
    amount: Money;
    payments?: {
      captures?: Array<{ id: string; status: string; amount: Money }>;
      authorizations?: Array<{ id: string; status: string; amount: Money; expiration_time?: string }>;
    };
  }>;
  payer?: { email_address?: string; payer_id?: string; name?: { given_name?: string; surname?: string } };
}

export function createOrder(pp: PayPalClient, input: CreateOrderInput): Promise<Order> {
  const currency = input.currency ?? "USD";
  return pp.request<Order>("POST", "/v2/checkout/orders", {
    idempotencyKey: input.idempotencyKey,
    body: {
      intent: input.intent ?? "CAPTURE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.customId ?? input.referenceId,
          description: input.description.slice(0, 127),
          amount: { currency_code: currency, value: toValue(input.amountCents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: input.brandName ?? "Plex",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });
}

export const getOrder = (pp: PayPalClient, orderId: string) =>
  pp.request<Order>("GET", `/v2/checkout/orders/${orderId}`);

export const captureOrder = (pp: PayPalClient, orderId: string, idempotencyKey?: string) =>
  pp.request<Order>("POST", `/v2/checkout/orders/${orderId}/capture`, { idempotencyKey, body: {} });

export const authorizeOrder = (pp: PayPalClient, orderId: string, idempotencyKey?: string) =>
  pp.request<Order>("POST", `/v2/checkout/orders/${orderId}/authorize`, { idempotencyKey, body: {} });

export const approvalUrl = (order: Order): string | undefined =>
  order.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;

// ── Payments v2: authorizations, captures, refunds ───────────────────────────

export const captureAuthorization = (
  pp: PayPalClient,
  authorizationId: string,
  opts: { amountCents?: number; currency?: string; idempotencyKey?: string } = {},
) =>
  pp.request<{ id: string; status: string; amount: Money }>(
    "POST",
    `/v2/payments/authorizations/${authorizationId}/capture`,
    {
      idempotencyKey: opts.idempotencyKey,
      body:
        opts.amountCents === undefined
          ? { final_capture: true }
          : {
              final_capture: true,
              amount: { currency_code: opts.currency ?? "USD", value: toValue(opts.amountCents) },
            },
    },
  );

export const voidAuthorization = (pp: PayPalClient, authorizationId: string) =>
  pp.request<void>("POST", `/v2/payments/authorizations/${authorizationId}/void`);

export const refundCapture = (
  pp: PayPalClient,
  captureId: string,
  opts: { amountCents?: number; currency?: string; note?: string; idempotencyKey?: string } = {},
) =>
  pp.request<{ id: string; status: string; amount?: Money }>(
    "POST",
    `/v2/payments/captures/${captureId}/refund`,
    {
      idempotencyKey: opts.idempotencyKey,
      body: {
        ...(opts.amountCents === undefined
          ? {}
          : { amount: { currency_code: opts.currency ?? "USD", value: toValue(opts.amountCents) } }),
        note_to_payer: opts.note?.slice(0, 255),
      },
    },
  );

// ── Payouts v1 ───────────────────────────────────────────────────────────────

export interface PayoutItemInput {
  /** PayPal email of the receiver (sandbox personal account). */
  receiver: string;
  amountCents: number;
  currency?: string;
  note: string;
  /** Our id for this item, e.g. the proof or receipt id. */
  senderItemId: string;
}

export interface PayoutBatch {
  batch_header: {
    payout_batch_id: string;
    batch_status: "PENDING" | "PROCESSING" | "SUCCESS" | "DENIED" | "CANCELED";
    sender_batch_header?: { sender_batch_id: string };
  };
  items?: Array<{
    payout_item_id: string;
    transaction_status: string;
    payout_item: { receiver: string; sender_item_id: string; amount: Money };
  }>;
}

export function createPayout(
  pp: PayPalClient,
  input: { senderBatchId: string; subject: string; message?: string; items: PayoutItemInput[] },
): Promise<PayoutBatch> {
  return pp.request<PayoutBatch>("POST", "/v1/payments/payouts", {
    idempotencyKey: input.senderBatchId,
    body: {
      sender_batch_header: {
        sender_batch_id: input.senderBatchId,
        email_subject: input.subject,
        email_message: input.message ?? input.subject,
      },
      items: input.items.map((i) => ({
        recipient_type: "EMAIL",
        receiver: i.receiver,
        note: i.note.slice(0, 4000),
        sender_item_id: i.senderItemId,
        amount: { currency: i.currency ?? "USD", value: toValue(i.amountCents) },
      })),
    },
  });
}

export const getPayoutBatch = (pp: PayPalClient, batchId: string) =>
  pp.request<PayoutBatch>("GET", `/v1/payments/payouts/${batchId}`);

// ── Invoicing v2 (splits, freelance-style tasks) ─────────────────────────────

export interface InvoiceInput {
  recipientEmail: string;
  recipientName?: string;
  items: Array<{ name: string; amountCents: number; quantity?: number }>;
  currency?: string;
  note?: string;
  invoicerEmail?: string;
  reference?: string;
}

export interface Invoice {
  id: string;
  status: string;
  detail?: { metadata?: { recipient_view_url?: string } };
  links?: Link[];
}

export function createInvoice(pp: PayPalClient, input: InvoiceInput): Promise<Invoice> {
  const currency = input.currency ?? "USD";
  return pp.request<Invoice>("POST", "/v2/invoicing/invoices", {
    body: {
      detail: {
        currency_code: currency,
        note: input.note,
        reference: input.reference,
        payment_term: { term_type: "DUE_ON_RECEIPT" },
      },
      ...(input.invoicerEmail ? { invoicer: { email_address: input.invoicerEmail } } : {}),
      primary_recipients: [
        {
          billing_info: {
            email_address: input.recipientEmail,
            ...(input.recipientName ? { name: { given_name: input.recipientName } } : {}),
          },
        },
      ],
      items: input.items.map((i) => ({
        name: i.name.slice(0, 200),
        quantity: String(i.quantity ?? 1),
        unit_amount: { currency_code: currency, value: toValue(i.amountCents) },
      })),
    },
  });
}

export const sendInvoice = (pp: PayPalClient, invoiceId: string) =>
  pp.request<{ href?: string }>("POST", `/v2/invoicing/invoices/${invoiceId}/send`, {
    body: { send_to_invoicer: false },
  });

export const remindInvoice = (pp: PayPalClient, invoiceId: string, note?: string) =>
  pp.request<void>("POST", `/v2/invoicing/invoices/${invoiceId}/remind`, {
    body: { note, send_to_invoicer: false },
  });

export const getInvoice = (pp: PayPalClient, invoiceId: string) =>
  pp.request<Invoice>("GET", `/v2/invoicing/invoices/${invoiceId}`);

// ── Reporting ────────────────────────────────────────────────────────────────

export const listTransactions = (
  pp: PayPalClient,
  q: { startDate: string; endDate: string; page?: number; pageSize?: number },
) =>
  pp.request<{ transaction_details: unknown[]; total_items?: number }>("GET", "/v1/reporting/transactions", {
    query: {
      start_date: q.startDate,
      end_date: q.endDate,
      fields: "all",
      page: q.page ?? 1,
      page_size: q.pageSize ?? 100,
    },
  });

export const getBalances = (pp: PayPalClient) =>
  pp.request<{ balances: Array<{ currency: string; total_balance: Money; available_balance: Money }> }>(
    "GET",
    "/v1/reporting/balances",
  );

// ── Webhooks ─────────────────────────────────────────────────────────────────

export interface WebhookHeaders {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
}

/** Verifies a webhook with PayPal's verify-webhook-signature endpoint. */
export async function verifyWebhook(
  pp: PayPalClient,
  input: { webhookId: string; headers: WebhookHeaders; event: unknown },
): Promise<boolean> {
  const res = await pp.request<{ verification_status: "SUCCESS" | "FAILURE" }>(
    "POST",
    "/v1/notifications/verify-webhook-signature",
    {
      body: {
        auth_algo: input.headers.authAlgo,
        cert_url: input.headers.certUrl,
        transmission_id: input.headers.transmissionId,
        transmission_sig: input.headers.transmissionSig,
        transmission_time: input.headers.transmissionTime,
        webhook_id: input.webhookId,
        webhook_event: input.event,
      },
    },
  );
  return res.verification_status === "SUCCESS";
}

export function webhookHeadersFrom(get: (name: string) => string | null): WebhookHeaders | null {
  const h = {
    transmissionId: get("paypal-transmission-id"),
    transmissionTime: get("paypal-transmission-time"),
    transmissionSig: get("paypal-transmission-sig"),
    certUrl: get("paypal-cert-url"),
    authAlgo: get("paypal-auth-algo"),
  };
  return Object.values(h).every(Boolean) ? (h as WebhookHeaders) : null;
}
