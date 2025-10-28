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
TARGET="${TARGET:-attn}"
THREADS_DEFAULT=$(( $(nproc) > 2 ? $(nproc) - 2 : 1 ))
THREADS="${THREADS:-$THREADS_DEFAULT}"

MODE="${MODE:-both}"            # valid values: both, start, end
COUNT="${COUNT:-1}"             # used in MODE=both
COUNT_START="${COUNT_START:-${COUNT:-1}}"
COUNT_END="${COUNT_END:-${COUNT:-1}}"

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

case "$MODE" in
  both)
    echo "Grinding for ${COUNT} pubkey(s) that start AND end with '${TARGET}' using ${THREADS} threads..."
    solana-keygen grind \
      --starts-and-ends-with "${TARGET}:${TARGET}:${COUNT}" \
      --num-threads "${THREADS}" \
      --ignore-case
    ;;
  start)
    echo "Grinding for ${COUNT_START} pubkey(s) that start with '${TARGET}' using ${THREADS} threads..."
    solana-keygen grind \
      --starts-with "${TARGET}:${COUNT_START}" \
      --num-threads "${THREADS}" \
      --ignore-case
    ;;
  end)
    echo "Grinding for ${COUNT_END} pubkey(s) that end with '${TARGET}' using ${THREADS} threads..."
    solana-keygen grind \
      --ends-with "${TARGET}:${COUNT_END}" \
      --num-threads "${THREADS}" \
      --ignore-case
    ;;
  *)
    echo "error: MODE must be one of 'both', 'start', or 'end' (got '${MODE}')" >&2
    exit 1
    ;;
esac
