#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export NEXT_PUBLIC_API_BASE="https://test.attn.dev"
export NEXT_PUBLIC_DATA_MODE="live"
export NEXT_PUBLIC_SQUADS_ENABLED="1"
export NEXT_PUBLIC_PROGRAM_IDS='{"devnet":{"creator_vault":"HDztZyNcij21HhF5SR6rhk9wx9qx6yViebUrVU9W6C86","splitter":"AmGu31S9SPLXj12etgXKnuVMzTNb653mRjkSqU8bgaPN","stable_vault":"98jhX2iz4cec2evPKhLwA1HriVEbUAsMBo61bQpSef5Z","rewards_vault":"6M8TEGPJhspXoYtDvY5vd9DHg7ojCPgbrqjaWoZa2dfw"}}'

echo "[e2e] Building dapp-prod bundle..." >&2
pnpm run build >/dev/null

echo "[e2e] Launching Playwright tests..." >&2
playwright test "$@"
