#!/usr/bin/env bash
# Copies Plex's secrets into the Convex deployment, where the backend reads them.
#
#   scripts/set-keys.sh                          PayPal only, from .env
#   scripts/set-keys.sh ~/keys/vertex-key.json   PayPal, plus Gemini on Vertex AI from a service-account key
#
# Values are read from files and passed straight to `convex env set`; nothing is printed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/packages/backend"

setenv() { npx convex env set "$1" -- "$2" >/dev/null && echo "  set $1"; }

# ── PayPal (sandbox app credentials from .env) ───────────────────────────────
if [[ -f "$ROOT/.env" ]]; then
  echo "PayPal, from .env"
  for name in PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET PAYPAL_ENVIRONMENT PAYPAL_DEMO_PAYEE_EMAIL; do
    value="$(grep -E "^${name}=" "$ROOT/.env" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
    if [[ -n "$value" ]]; then setenv "$name" "$value"; else echo "  skip $name (empty in .env)"; fi
  done
else
  echo "No .env: copy .env.example to .env and fill in the PayPal sandbox app's Client ID and Secret."
fi

# ── Gemini on Vertex AI (service-account JSON) ───────────────────────────────
if [[ $# -ge 1 ]]; then
  KEY="$1"
  [[ -f "$KEY" ]] || { echo "No file at $KEY"; exit 1; }
  [[ "$(jq -r .type "$KEY")" == "service_account" ]] || { echo "$KEY isn't a service-account key (type should be service_account)"; exit 1; }
  echo "Gemini on Vertex AI, from $(basename "$KEY")"
  setenv GOOGLE_VERTEX_PROJECT "$(jq -r .project_id "$KEY")"
  setenv GOOGLE_VERTEX_LOCATION "${GOOGLE_VERTEX_LOCATION:-global}"
  setenv GOOGLE_CLIENT_EMAIL "$(jq -r .client_email "$KEY")"
  setenv GOOGLE_PRIVATE_KEY "$(jq -r .private_key "$KEY")"
  setenv GOOGLE_PRIVATE_KEY_ID "$(jq -r .private_key_id "$KEY")"
fi

echo "Done. Convex picks these up immediately; no restart needed."
