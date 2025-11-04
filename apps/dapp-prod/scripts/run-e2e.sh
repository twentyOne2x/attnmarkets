#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MOCK_API_PORT="${MOCK_API_PORT:-3999}"
USE_MOCK_API="${USE_MOCK_API:-1}"

ENV_FILE="$ROOT_DIR/.env.playwright"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ "$USE_MOCK_API" != "0" ]]; then
  node scripts/mock-api-server.js "$MOCK_API_PORT" &
  MOCK_API_PID=$!
fi

cleanup() {
  if [[ -n "${MOCK_API_PID-}" ]]; then
    if kill -0 "$MOCK_API_PID" >/dev/null 2>&1; then
      kill "$MOCK_API_PID"
    fi
  fi
}
trap cleanup EXIT

if [[ "$USE_MOCK_API" != "0" ]]; then
  for attempt in $(seq 1 50); do
    if curl -sf "http://127.0.0.1:${MOCK_API_PORT}/__health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
fi

if [[ "$USE_MOCK_API" != "0" ]]; then
  : "${NEXT_PUBLIC_API_BASE:=http://127.0.0.1:${MOCK_API_PORT}}"
else
  if [[ -z "${NEXT_PUBLIC_API_BASE:-}" ]]; then
    echo "NEXT_PUBLIC_API_BASE must be provided when USE_MOCK_API=0" >&2
    exit 1
  fi
fi

: "${NEXT_PUBLIC_DATA_MODE:=live}"
: "${NEXT_PUBLIC_SQUADS_ENABLED:=true}"
: "${NEXT_PUBLIC_PROGRAM_IDS:='{"devnet":{"creator_vault":"HDztZyNcij21HhF5SR6rhk9wx9qx6yViebUrVU9W6C86","splitter":"AmGu31S9SPLXj12etgXKnuVMzTNb653mRjkSqU8bgaPN","rewards_vault":"6M8TEGPJhspXoYtDvY5vd9DHg7ojCPgbrqjaWoZa2dfw","stable_vault":"98jhX2iz4cec2evPKhLwA1HriVEbUAsMBo61bQpSef5Z"}}'}"
: "${NEXT_PUBLIC_ATTN_API_KEY:=playwright-key}"
: "${NEXT_PUBLIC_CSRF_TOKEN:=playwright-client}"
: "${NEXT_PUBLIC_SQUADS_ATTN_MEMBER:=BVQHZaUHBTWk2mfUFsaHdbBhe5EkxNz8nP7or1sHmmYQ}"
: "${NEXT_PUBLIC_ALLOW_LOCAL_API_BASE:=1}"
: "${NEXT_PUBLIC_CLUSTER:=devnet}"

export NEXT_PUBLIC_API_BASE
export NEXT_PUBLIC_DATA_MODE
export NEXT_PUBLIC_SQUADS_ENABLED
export NEXT_PUBLIC_PROGRAM_IDS
export NEXT_PUBLIC_ATTN_API_KEY
export NEXT_PUBLIC_CSRF_TOKEN
export NEXT_PUBLIC_SQUADS_ATTN_MEMBER
export NEXT_PUBLIC_ALLOW_LOCAL_API_BASE
export NEXT_PUBLIC_CLUSTER

echo "[e2e] Building dapp-prod bundle..." >&2
pnpm run build >/dev/null

echo "[e2e] Launching Playwright tests..." >&2
playwright test "$@"
