#!/usr/bin/env bash
set -euo pipefail

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

