#!/usr/bin/env bash
# Start Plex with one command: Convex (local) and the web app on :3000.
#
#   pnpm start              everything
#   pnpm start --no-web     Convex only
#
# Seeds the demo world the first time (when Convex has no Adi yet). Logs from every part
# stream here, each line tagged. Ctrl-C stops everything.
set -uo pipefail
cd "$(dirname "$0")/.."

WEB=1
for arg in "$@"; do
  case "$arg" in
    --no-web) WEB=0 ;;
    -h|--help) sed -n 2,8p "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[31m'; green=$'\033[32m'; reset=$'\033[0m'
say() { printf '%s▸ %s%s\n' "$bold" "$*" "$reset"; }
die() { printf '%s✖ %s%s\n' "$red" "$*" "$reset"; exit 1; }

# ── Prerequisites ────────────────────────────────────────────────────────────
command -v pnpm >/dev/null || die "pnpm is missing (npm i -g pnpm)."
[ -d node_modules ] || { say "Installing packages"; pnpm install --silent || die "pnpm install failed."; }

# Free the ports from an earlier run that didn't shut down.
for port in 3210 $([ "$WEB" = 1 ] && echo 3000); do
  pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    printf '%s  Port %s is in use (pid %s): stopping it.%s\n' "$dim" "$port" "$(echo $pids | tr '\n' ' ')" "$reset"
    kill $pids 2>/dev/null || true
  fi
done
sleep 1

# ── Run each part with tagged output ─────────────────────────────────────────
PIDS=()
start() { # name colour command...
  local name=$1 colour=$2; shift 2
  ( "$@" 2>&1 | while IFS= read -r line; do printf '\033[%sm%-7s\033[0m %s\n' "$colour" "$name" "$line"; done ) &
  PIDS+=($!)
}

stop_all() {
  trap - INT TERM EXIT
  echo
  say "Stopping Plex"
  for pid in "${PIDS[@]}"; do disown "$pid" 2>/dev/null; pkill -P "$pid" 2>/dev/null; kill "$pid" 2>/dev/null; done
  for port in 3210 3000; do
    pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)
    [ -n "$pids" ] && kill $pids 2>/dev/null
  done
  wait 2>/dev/null
  exit 0
}
trap stop_all INT TERM EXIT

wait_for() { # url seconds label
  local url=$1 secs=$2 label=$3
  for _ in $(seq 1 "$secs"); do
    curl -s -m 2 -o /dev/null "$url" && return 0
    sleep 1
  done
  die "$label didn't come up within ${secs}s. Scroll up for its log."
}

convex_query() { # path → JSON value, or empty on error
  curl -s -m 5 http://127.0.0.1:3210/api/query -H 'content-type: application/json' \
    -d "{\"path\":\"$1\",\"args\":{},\"format\":\"json\"}"
}

say "Starting Convex (local, http://127.0.0.1:3210)"
start convex 36 pnpm --filter @plex/backend dev
wait_for http://127.0.0.1:3210/version 90 "Convex"
# The functions must be pushed before the app can call them.
for _ in $(seq 1 90); do
  convex_query users:viewer | grep -q '"status":"success"' && break
  sleep 1
done

if ! convex_query users:viewer | grep -q '"_id"'; then
  say "First run: seeding the demo world"
  pnpm --filter @plex/backend exec convex run seed:run '{}' 2>&1 | tail -1
fi

if [ "$WEB" = 1 ]; then
  say "Starting the web app (http://localhost:3000)"
  start web 34 pnpm --filter @plex/web dev
fi

printf '\n%s✔ Plex is up.%s Convex :3210%s\n' "$green" "$reset" "$([ "$WEB" = 1 ] && echo ' · web http://localhost:3000')"
printf '%s  Ctrl-C stops everything.%s\n\n' "$dim" "$reset"
wait
