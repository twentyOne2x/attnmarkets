#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LEDGER_DIR="${LEDGER_DIR:-$PROJECT_ROOT/.localnet-ledger}"
VALIDATOR_LOG="${VALIDATOR_LOG:-$PROJECT_ROOT/.localnet-validator.log}"
NETWORK_URL="${NETWORK_URL:-http://127.0.0.1:8899}"
API_URL="${API_URL:-http://127.0.0.1:8080}"
E2E_KEYPAIR="${E2E_KEYPAIR:-$HOME/.config/solana/id.json}"
BANK_KEYPAIR="${BANK_KEYPAIR:-${DEVNET_BANK_KEYPAIR:-$E2E_KEYPAIR}}"
ATTN_CLI="cargo run -p attn_cli -- --url ${NETWORK_URL} --keypair ${E2E_KEYPAIR}"
BANK_PUBKEY="$(solana-keygen pubkey "$BANK_KEYPAIR")"

REQUIRED_ENV=(CREATOR_VAULT ATTN_MINT REWARDS_ALLOWED_FUNDER SOL_REWARDS_BPS WRAP_AMOUNT SPLIT_MARKET_ID)
for var in "${REQUIRED_ENV[@]}"; do
  if [[ -z "${!var-}" ]]; then
    echo "Environment variable $var is required for the E2E flow" >&2
    exit 1
  fi
done

cleanup() {
  if [[ -n "${VALIDATOR_PID-}" ]]; then
    kill "$VALIDATOR_PID" 2>/dev/null || true
  fi
  if [[ -n "${API_PID-}" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "$LEDGER_DIR"
rm -rf "$LEDGER_DIR"/*

echo "🚀 Starting local validator..."
solana-test-validator --reset --ledger "$LEDGER_DIR" --mint "$BANK_PUBKEY" \
  --rpc-port "${NETWORK_URL##*:}" \
  >"$VALIDATOR_LOG" 2>&1 &
VALIDATOR_PID=$!

sleep 5

echo "⏳ Waiting for local validator RPC..."
for _ in {1..20}; do
  if solana --url "$NETWORK_URL" cluster-version >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

solana config set --url "$NETWORK_URL" --keypair "$E2E_KEYPAIR" >/dev/null

PROGRAMS=(creator_vault stable_vault rewards_vault splitter)

for program in "${PROGRAMS[@]}"; do
  echo "🛠️  Building $program"
  anchor build --program-name "$program"
  echo "📤 Deploying $program"
  ANCHOR_PROVIDER_URL="$NETWORK_URL" ANCHOR_WALLET="$E2E_KEYPAIR" \
    anchor deploy --program-name "$program" --no-idl
done

echo "⚙️  Initializing RewardsVault"
$ATTN_CLI rewards initialize \
  --creator-vault "$CREATOR_VAULT" \
  --attn-mint "$ATTN_MINT" \
  --reward-bps "$SOL_REWARDS_BPS" \
  --allowed-funder "$REWARDS_ALLOWED_FUNDER"

echo "📦 Wrapping creator fees"
$ATTN_CLI wrap --pump-mint "$CREATOR_VAULT" --amount "$WRAP_AMOUNT"

echo "🔀 Splitting position"
$ATTN_CLI split --market "$SPLIT_MARKET_ID" --amount "$WRAP_AMOUNT"

$ATTN_CLI rewards stake --creator-vault "$CREATOR_VAULT" --attn-mint "$ATTN_MINT" --amount "$WRAP_AMOUNT"

echo "💸 financing rewards"
solana transfer --allow-unfunded-recipient --with-compute-unit-price 1 "$REWARDS_ALLOWED_FUNDER" 1 >/dev/null
$ATTN_CLI rewards fund --creator-vault "$CREATOR_VAULT" --amount 1000000 >/dev/null
$ATTN_CLI rewards claim --creator-vault "$CREATOR_VAULT" >/dev/null
$ATTN_CLI rewards unstake --creator-vault "$CREATOR_VAULT" --attn-mint "$ATTN_MINT" --amount "$WRAP_AMOUNT" >/dev/null

ATTN_API_DATA_MODE=mock cargo run -p attn_api >/dev/null 2>&1 &
API_PID=$!
sleep 3

echo "📡 Querying rewards endpoint"
curl -s "$API_URL/v1/rewards" | jq '.'

echo "✅ Localnet E2E flow completed"
