#!/usr/bin/env bash
set -euo pipefail

SOLANA_BIN_DIR="${SOLANA_BIN_DIR:-$HOME/.local/share/solana/install/active_release/bin}"
if command -v solana-keygen >/dev/null 2>&1; then
  :
elif [ -x "${SOLANA_BIN_DIR}/solana-keygen" ]; then
  export PATH="${SOLANA_BIN_DIR}:$PATH"
else
  echo "error: solana-keygen not found. Install the Solana CLI or set SOLANA_BIN_DIR." >&2
  exit 1
fi

OUT_DIR="${OUT_DIR:-./vanity-attn}"
TARGET="attn"
COUNT="${COUNT:-1}"
THREADS="${THREADS:-$(( $(nproc) - 2 ))}"

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

echo "Grinding for ${COUNT} pubkey(s) that start and end with '${TARGET}' using ${THREADS} threads..."
solana-keygen grind \
  --starts-and-ends-with "${TARGET}:${TARGET}:${COUNT}" \
  --num-threads "${THREADS}" \
  --ignore-case
