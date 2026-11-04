# PayPal webhooks

Plex receives PayPal webhooks at **`POST /paypal/webhook`** on the Convex
deployment's site URL (`convex/http.ts` → `convex/webhooks.ts`).

What happens to each event:

1. The signature is verified with PayPal's `verify-webhook-signature` API,
   using `PAYPAL_WEBHOOK_ID`.
2. The event is stored in `webhookEvents`, idempotent by PayPal's event id.
   A replayed event is acknowledged and not applied twice.
3. Verified events are applied:

| Event | Effect |
|---|---|
| `CHECKOUT.ORDER.APPROVED` | If the task for that order is still unfunded, authorize the order (same code path as returning from checkout). |
| `PAYMENT.CAPTURE.COMPLETED` | Task funding marked captured; note on the funding receipt. |
| `PAYMENT.CAPTURE.DENIED` | Note on the funding receipt. |
| `PAYMENT.CAPTURE.REFUNDED` / `REVERSED` | Task and funding receipt move to refunded. |
| `PAYMENT.PAYOUTS-ITEM.*` | The payout receipt (found by `sender_item_id`, which is the receipt id) moves to paid, notes "unclaimed", or is marked declined. |

Unverified events are stored for inspection but never applied.

## Register it

PayPal must reach the URL over public HTTPS, so a local deployment
(`http://127.0.0.1:<site-port>`) needs a tunnel, or use a cloud dev deployment.

1. Get the public URL:
   - Cloud deployment: `https://<deployment>.convex.site/paypal/webhook`
   - Local: run a tunnel to the Convex site port, for example
     `cloudflared tunnel --url http://127.0.0.1:3211`, and use
     `https://<tunnel-host>/paypal/webhook`.
2. In the PayPal developer dashboard, open the sandbox app (the one whose
   client id is in `.env`) → **Webhooks** → **Add webhook**. Paste the URL and
   subscribe to:
   `CHECKOUT.ORDER.APPROVED`, `PAYMENT.AUTHORIZATION.CREATED`,
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`,
   `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`,
   `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`,
   `PAYMENT.PAYOUTS-ITEM.FAILED`, `PAYMENT.PAYOUTS-ITEM.RETURNED`,
   `PAYMENT.PAYOUTS-ITEM.BLOCKED`, `PAYMENT.PAYOUTS-ITEM.DENIED`.
3. Copy the webhook id PayPal shows and set it in Convex:

   ```bash
   pnpm --filter @plex/backend exec convex env set PAYPAL_WEBHOOK_ID <id>
   ```

4. Send a test from the dashboard's webhook simulator. It appears in the
   `webhookEvents` table. (Simulator events can't be signature-verified; for a
   local replay only, `convex env set PAYPAL_WEBHOOK_SKIP_VERIFY 1`, and unset
   it afterwards.)

## Without webhooks

The app doesn't depend on them. Funding is authorized when the poster returns
from PayPal, and after a payout Plex polls the batch status itself (8 s, 45 s
and 3 min later) through `taskMoney.refreshPayout`. Webhooks make the same
updates arrive sooner and cover events that happen later, like a refund made
in the PayPal dashboard.
