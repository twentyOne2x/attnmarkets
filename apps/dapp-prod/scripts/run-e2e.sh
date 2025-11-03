#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MOCK_API_PORT="${MOCK_API_PORT:-3999}"
node scripts/mock-api-server.js "$MOCK_API_PORT" &
MOCK_API_PID=$!

cleanup() {
  if kill -0 "$MOCK_API_PID" >/dev/null 2>&1; then
    kill "$MOCK_API_PID"
  fi
}
trap cleanup EXIT

for attempt in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:${MOCK_API_PORT}/__health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

export NEXT_PUBLIC_API_BASE="http://127.0.0.1:${MOCK_API_PORT}"
export NEXT_PUBLIC_DATA_MODE="live"
export NEXT_PUBLIC_SQUADS_ENABLED="1"
export NEXT_PUBLIC_PROGRAM_IDS='{"devnet":{"creator_vault":"FtxLUmapXBT49yd5HUHS3hLp6foGBqgmR9ptxtK9dQcN","splitter":"abyjw2sS6VbdWXN74Xxk2haCQCeQsAfmzefLWCXuiG41","stable_vault":"CsUN3UqbrE8CFRG6dctmKu1F7ZJ6hNzqdK2JKJwgKi4W","rewards_vault":"W5dWeZQqTGG6w7xQEhoDueKPQPGpgRkUF468CEY2k1cr"}}'
export NEXT_PUBLIC_ATTN_API_KEY="playwright-key"
export NEXT_PUBLIC_CSRF_TOKEN="playwright-client"
export NEXT_PUBLIC_SQUADS_ATTN_MEMBER="Attn111111111111111111111111111111111111111"
export NEXT_PUBLIC_ALLOW_LOCAL_API_BASE="1"

echo "[e2e] Building dapp-prod bundle..." >&2
pnpm run build >/dev/null

echo "[e2e] Launching Playwright tests..." >&2
playwright test "$@"
