#!/usr/bin/env bash
# Deploy attn programs to mainnet using Anchor.
#
# Usage:
#   scripts/deploy-mainnet.sh [--dry-run] [--wallet PATH] [program ...]
#
# By default all programs in PROGRAMS array are built and deployed. Use
# positional arguments to deploy a subset. The script supports a dry-run mode
# that prints the commands instead of executing them.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
PROGRAM_DIR="${ROOT}/protocol"

DEFAULT_PROGRAMS=(
  "creator_vault"
  "splitter"
  "stable_vault"
  "rewards_vault"
  # "amm"  # enable once ready
)

DRY_RUN=false
WALLET="${HOME}/.config/solana/id.json"
CLUSTER="https://api.mainnet-beta.solana.com"

usage() {
  cat <<USAGE
Deploy attn programs to mainnet.

Options:
  --dry-run             Print commands without executing them.
  --wallet PATH         Path to the deployer's keypair (default: ${WALLET}).
  --cluster URL         RPC endpoint (default: ${CLUSTER}).
  -h, --help            Show this message.

Specify program names after the options to deploy a subset of programs. When
no programs are provided the default set is deployed.
USAGE
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --wallet)
      WALLET="$2"
      shift 2
      ;;
    --cluster)
      CLUSTER="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -gt 0 ]]; then
  PROGRAMS=("$@")
else
  PROGRAMS=("${DEFAULT_PROGRAMS[@]}")
fi

run() {
  if [[ "${DRY_RUN}" == true ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

export ANCHOR_PROVIDER_WALLET="${WALLET}"
export ANCHOR_PROVIDER_URL="${CLUSTER}"

echo "Using wallet: $(solana-keygen pubkey "${WALLET}")"
echo "Cluster: ${CLUSTER}"
echo "Balance: $(solana balance --url "${CLUSTER}")"

cd "${PROGRAM_DIR}"

for program in "${PROGRAMS[@]}"; do
  echo "=== Building ${program} ==="
  run anchor build --program-name "${program}"

  echo "=== Deploying ${program} ==="
  run anchor deploy --program-name "${program}" --provider.cluster mainnet --provider.wallet "${WALLET}"

  if [[ "${DRY_RUN}" == true ]]; then
    continue
  fi

  id_file="target/idl/${program}.json"
  if [[ -f "${id_file}" ]]; then
    program_id=$(jq -r '.metadata.address' "${id_file}")
    echo "${program} Program Id: ${program_id}"
  else
    echo "warning: missing IDL for ${program}; program id not captured" >&2
  fi
done
