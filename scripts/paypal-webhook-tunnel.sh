#!/bin/sh
# PayPal webhooks for a local Convex deployment, through an ngrok tunnel.
#
#   scripts/paypal-webhook-tunnel.sh          start the tunnel and register the webhook
#   scripts/paypal-webhook-tunnel.sh --stop   stop the tunnel
#
# PayPal can't reach http://127.0.0.1:3211, so this:
#   1. starts `ngrok http 3211` (the Convex site port from packages/backend/.env.local),
#   2. registers a sandbox webhook at https://<tunnel>/paypal/webhook through PayPal's REST API
#      (replacing any webhook an earlier run of this script made, whose URL is an ngrok one),
#   3. sets PAYPAL_WEBHOOK_ID in the Convex deployment, so events are signature-verified.
#
# The tunnel's address changes each time ngrok starts (unless you have a reserved domain:
# NGROK_DOMAIN=your-name.ngrok-free.app), so run this again after a restart.
# Needs: ngrok signed in (`ngrok config add-authtoken …`), PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env.
set -eu
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--stop" ]; then
  pkill -f "ngrok http" && echo "Tunnel stopped." || echo "No tunnel running."
  exit 0
fi

. ./.env
API="https://api-m.sandbox.paypal.com"
SITE_PORT=$(sed -n 's/^CONVEX_SITE_URL=.*:\([0-9]*\).*/\1/p' packages/backend/.env.local)
SITE_PORT=${SITE_PORT:-3211}

# 1. The tunnel (reuse one that's already up).
public_url() {
  curl -s http://127.0.0.1:4040/api/tunnels | python3 -c 'import json,sys
try:
    t = json.load(sys.stdin).get("tunnels", [])
    print(next((x["public_url"] for x in t if x["public_url"].startswith("https")), ""))
except Exception:
    print("")'
}
URL=$(public_url)
if [ -z "$URL" ]; then
  if [ -n "${NGROK_DOMAIN:-}" ]; then
    nohup ngrok http "$SITE_PORT" --domain "$NGROK_DOMAIN" --log stdout > /tmp/plex-ngrok.log 2>&1 &
  else
    nohup ngrok http "$SITE_PORT" --log stdout > /tmp/plex-ngrok.log 2>&1 &
  fi
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    URL=$(public_url)
    [ -n "$URL" ] && break
  done
fi
[ -n "$URL" ] || { echo "ngrok didn't start; see /tmp/plex-ngrok.log"; exit 1; }
HOOK="$URL/paypal/webhook"
echo "Tunnel: $URL -> http://127.0.0.1:$SITE_PORT"

# 2. The webhook.
TOKEN=$(curl -s -u "$PAYPAL_CLIENT_ID:$PAYPAL_CLIENT_SECRET" -d grant_type=client_credentials "$API/v1/oauth2/token" |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

# Earlier tunnel webhooks from this script point at an old ngrok address: remove them (PayPal allows 10 per app).
curl -s -H "Authorization: Bearer $TOKEN" "$API/v1/notifications/webhooks" | python3 -c 'import json,sys
for w in json.load(sys.stdin).get("webhooks", []):
    if "ngrok" in w["url"] and w["url"].endswith("/paypal/webhook"):
        print(w["id"])' | while read -r old; do
  curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN" "$API/v1/notifications/webhooks/$old"
  echo "Removed the old tunnel webhook $old"
done

EVENTS='CHECKOUT.ORDER.APPROVED PAYMENT.AUTHORIZATION.CREATED PAYMENT.CAPTURE.COMPLETED PAYMENT.CAPTURE.DENIED
PAYMENT.CAPTURE.REFUNDED PAYMENT.CAPTURE.REVERSED PAYMENT.PAYOUTS-ITEM.SUCCEEDED PAYMENT.PAYOUTS-ITEM.UNCLAIMED
PAYMENT.PAYOUTS-ITEM.FAILED PAYMENT.PAYOUTS-ITEM.RETURNED PAYMENT.PAYOUTS-ITEM.BLOCKED PAYMENT.PAYOUTS-ITEM.DENIED
INVOICING.INVOICE.PAID INVOICING.INVOICE.CANCELLED'
BODY=$(HOOK="$HOOK" EVENTS="$EVENTS" python3 -c 'import json,os
print(json.dumps({"url": os.environ["HOOK"], "event_types": [{"name": e} for e in os.environ["EVENTS"].split()]}))')
ID=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$BODY" \
  "$API/v1/notifications/webhooks" | python3 -c 'import json,sys
d = json.load(sys.stdin)
print(d.get("id") or "ERROR " + json.dumps(d)[:400])')
case "$ID" in ERROR*) echo "PayPal refused the webhook: $ID"; exit 1 ;; esac
echo "Webhook: $HOOK ($ID)"

# 3. Convex verifies events with this id.
pnpm --filter @plex/backend exec convex env set PAYPAL_WEBHOOK_ID "$ID" > /dev/null
echo "Set PAYPAL_WEBHOOK_ID in Convex. PayPal events now reach your local Plex."
