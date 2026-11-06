#!/usr/bin/env bash
# Start all of Plex with one command: Convex, the brain, the web app and Plex for Mac.
#
#   pnpm start              everything
#   pnpm start --no-web     skip the Next.js app on :3000
#   pnpm start --no-mac     skip building and opening the Mac app (backend, brain and web only)
#
# Seeds the demo world the first time (when Convex has no Adi yet). Logs from every part
# stream here, each line tagged. Ctrl-C stops everything, including the Mac app.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

WEB=1
MAC=1
for arg in "$@"; do
  case "$arg" in
    --no-web) WEB=0 ;;
    --no-mac) MAC=0 ;;
    -h|--help) sed -n 2,9p "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[31m'; green=$'\033[32m'; reset=$'\033[0m'
say() { printf '%s▸ %s%s\n' "$bold" "$*" "$reset"; }
die() { printf '%s✖ %s%s\n' "$red" "$*" "$reset"; exit 1; }

# ── Prerequisites ────────────────────────────────────────────────────────────
command -v pnpm >/dev/null || die "pnpm is missing (npm i -g pnpm)."
command -v uv >/dev/null || die "uv is missing (brew install uv). The brain runs on it."
if [ "$MAC" = 1 ]; then
  command -v xcodegen >/dev/null || die "xcodegen is missing (brew install xcodegen), or run with --no-mac."
  command -v xcodebuild >/dev/null || die "Xcode is missing, or run with --no-mac."
fi
[ -f apps/agent/.env ] || die "apps/agent/.env is missing. Copy apps/agent/.env.example and fill it in (Vertex key, Convex URL, secret)."
command -v agent-desktop >/dev/null || printf '%s  agent-desktop isn'"'"'t installed: computer use on native apps is off (npm i -g agent-desktop agent-browser).%s\n' "$dim" "$reset"
[ -d node_modules ] || { say "Installing packages"; pnpm install --silent || die "pnpm install failed."; }

# Free the ports from an earlier run that didn't shut down.
for port in 3210 8790 $([ "$WEB" = 1 ] && echo 3000); do
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
  [ "$MAC" = 1 ] && pkill -x Plex 2>/dev/null
  for pid in "${PIDS[@]}"; do disown "$pid" 2>/dev/null; pkill -P "$pid" 2>/dev/null; kill "$pid" 2>/dev/null; done
  for port in 3210 8790 3000; do
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
# The functions must be pushed before the brain and the app can call them.
for _ in $(seq 1 90); do
  convex_query users:viewer | grep -q '"status":"success"' && break
  sleep 1
done

if ! convex_query users:viewer | grep -q '"_id"'; then
  say "First run: seeding the demo world"
  pnpm --filter @plex/backend exec convex run seed:run '{}' 2>&1 | tail -1
fi

say "Starting the brain (http://127.0.0.1:8790)"
start brain 35 bash -c "cd '$ROOT/apps/agent' && exec uv run uvicorn server:app --port 8790 --reload"

if [ "$WEB" = 1 ]; then
  say "Starting the web app (http://localhost:3000)"
  start web 34 pnpm --filter @plex/web dev
fi

wait_for http://127.0.0.1:8790/health 120 "The brain"

if [ "$MAC" = 1 ]; then
  say "Building and opening Plex for Mac"
  ( cd apps/mac && ./scripts/run.sh ) 2>&1 | grep -v -e CoreSimulator -e DVTCoreSimulator -e DVTErrorPresenter -e 'Domain: DVT' \
    | sed $'s/^/\033[33mmac\033[0m     /' || die "The Mac app didn't build. Scroll up for the error."
fi

printf '\n%s✔ Plex is up.%s Convex :3210 · brain :8790%s%s\n' "$green" "$reset" \
  "$([ "$WEB" = 1 ] && echo ' · web http://localhost:3000')" "$([ "$MAC" = 1 ] && echo ' · Plex is in your notch')"
printf '%s  Ctrl-C stops everything.%s\n\n' "$dim" "$reset"
wait
