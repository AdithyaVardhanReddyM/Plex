#!/usr/bin/env bash
# Refresh the PayPal sandbox access token used by Claude Code's PayPal MCP servers.
#
# Reads PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET from the project's .env,
# requests a new token, and writes it to ~/.claude/settings.json
# (env.PAYPAL_SANDBOX_ACCESS_TOKEN). The token is never printed.
#
# Usage:
#   scripts/refresh-paypal-token.sh           # get a new token
#   scripts/refresh-paypal-token.sh --status  # show expiry + check the current token works
#
# After refreshing, fully quit and reopen Claude (Cmd+Q) so MCP servers pick up the new token.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
SETTINGS="$HOME/.claude/settings.json"
API_BASE="https://api-m.sandbox.paypal.com"

die() { echo "✗ $*" >&2; exit 1; }

command -v jq >/dev/null || die "jq is required (brew install jq)"
command -v curl >/dev/null || die "curl is required"
[[ -f "$SETTINGS" ]] || die "$SETTINGS not found"

# Read KEY=value from .env without sourcing it; strips surrounding quotes and whitespace.
env_value() {
  local line
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?$1=" "$ENV_FILE" | tail -n 1 || true)"
  line="${line#*=}"
  line="$(printf '%s' "$line" | tr -d '\r' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g; s/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/')"
  printf '%s' "$line"
}

fmt_time() { date -r "$1" '+%a %d %b, %H:%M'; }

status() {
  local token expires now remaining code
  token="$(jq -r '.env.PAYPAL_SANDBOX_ACCESS_TOKEN // empty' "$SETTINGS")"
  [[ -n "$token" ]] || die "No token in $SETTINGS — run without --status to create one"

  expires="$(jq -r '.env.PAYPAL_SANDBOX_TOKEN_EXPIRES_AT // empty' "$SETTINGS")"
  now="$(date +%s)"
  if [[ -n "$expires" ]]; then
    remaining=$(( expires - now ))
    if (( remaining > 0 )); then
      printf '  Expires:  %s (in %dh %02dm)\n' "$(fmt_time "$expires")" $((remaining / 3600)) $((remaining % 3600 / 60))
    else
      printf '  Expires:  %s (expired)\n' "$(fmt_time "$expires")"
    fi
  else
    echo "  Expires:  unknown (token wasn't created by this script)"
  fi

  code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" \
    "$API_BASE/v1/catalogs/products?page_size=1")"
  if [[ "$code" == "200" ]]; then
    echo "  API check: ✓ token works (HTTP 200)"
  else
    echo "  API check: ✗ HTTP $code — run scripts/refresh-paypal-token.sh"
    exit 1
  fi
}

refresh() {
  [[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found. Copy .env.example to .env and fill in your sandbox Client ID and Secret."

  local client_id client_secret response token expires_in expires_at tmp mode
  client_id="$(env_value PAYPAL_CLIENT_ID)"
  client_secret="$(env_value PAYPAL_CLIENT_SECRET)"
  [[ -n "$client_id" ]] || die "PAYPAL_CLIENT_ID is empty in .env"
  [[ -n "$client_secret" ]] || die "PAYPAL_CLIENT_SECRET is empty in .env"

  # Credentials go to curl via stdin config, so they don't show up in `ps`.
  response="$(printf 'user = "%s:%s"\n' "$client_id" "$client_secret" | curl -s -K - \
    -X POST "$API_BASE/v1/oauth2/token" \
    -H "Accept: application/json" \
    -d "grant_type=client_credentials")" || die "Request to PayPal failed (network?)"

  token="$(jq -r '.access_token // empty' <<<"$response" 2>/dev/null || true)"
  if [[ -z "$token" ]]; then
    local err
    err="$(jq -r '"\(.error // "unknown_error"): \(.error_description // "no description")"' <<<"$response" 2>/dev/null || echo "unexpected response")"
    die "PayPal rejected the request — $err. Check the Client ID/Secret in .env are the sandbox ones."
  fi
  [[ "$token" =~ ^[A-Za-z0-9._-]+$ ]] || die "Token has unexpected characters; not saving it"

  expires_in="$(jq -r '.expires_in // 0' <<<"$response")"
  expires_at=$(( $(date +%s) + expires_in ))

  # Write atomically and keep the file's original permissions.
  mode="$(stat -f '%Lp' "$SETTINGS")"
  tmp="$(mktemp "$SETTINGS.XXXXXX")"
  jq --arg t "$token" --argjson e "$expires_at" \
    '.env = ((.env // {}) + {PAYPAL_SANDBOX_ACCESS_TOKEN: $t, PAYPAL_SANDBOX_TOKEN_EXPIRES_AT: ($e | tostring)})' \
    "$SETTINGS" > "$tmp" || { rm -f "$tmp"; die "Failed to update $SETTINGS"; }
  chmod "$mode" "$tmp"
  mv "$tmp" "$SETTINGS"

  printf '✓ New sandbox token saved to %s\n' "$SETTINGS"
  printf '  Expires:  %s (in %dh %02dm)\n' "$(fmt_time "$expires_at")" $((expires_in / 3600)) $((expires_in % 3600 / 60))
  echo "  Next:     fully quit Claude (Cmd+Q) and reopen it so the MCP servers use the new token."
}

case "${1:-}" in
  --status|-s) status ;;
  ""|--refresh) refresh ;;
  -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) die "Unknown option: $1 (use --status or --help)" ;;
esac
