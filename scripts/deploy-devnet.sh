#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
PROTOCOL_DIR="${ROOT_DIR}/protocol"
PROGRAM_NAME="${1:-creator_vault}"

WALLET="${WALLET:-$HOME/.config/solana/id.json}"
CLUSTER_URL="https://api.devnet.solana.com"

echo "=== Deploying ${PROGRAM_NAME} to Devnet ==="
echo "Wallet: $(solana-keygen pubkey "${WALLET}")"
echo "Cluster: ${CLUSTER_URL}"

export ANCHOR_PROVIDER_WALLET="${WALLET}"
export ANCHOR_PROVIDER_URL="${CLUSTER_URL}"

(
  cd "${PROTOCOL_DIR}"
  anchor build --program-name "${PROGRAM_NAME}"
  anchor deploy \
    --program-name "${PROGRAM_NAME}" \
    --provider.cluster devnet \
    --provider.wallet "${WALLET}"
)

echo "=== Running devnet tests for ${PROGRAM_NAME} ==="
(
  cd "${PROTOCOL_DIR}"
  cargo test -p "${PROGRAM_NAME}"
)

echo "=== Done ==="
