#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRIND_SCRIPT="${SCRIPT_DIR}/grind-attn.sh"

usage() {
  cat <<'USAGE'
Batch runner for vanity pubkey grinding.

Usage:
  scripts/grind-attn-multi.sh [--pattern SPEC ...]

Options:
  --pattern SPEC   Comma-separated key=value list.
                   Keys: mode, target, target_start, target_end,
                         count, count_start, count_end, ignore_case,
                         threads, out_dir.
                   Example:
                     --pattern mode=both,target_start=attn,target_end=markets,ignore_case=0
  -h, --help       Show this message.

When no patterns are supplied the script runs two defaults:
  1. start=attn, end=markets (case-sensitive)
  2. start=attn, end=attn (case-sensitive)

Environment variables such as THREADS or OUT_DIR apply to all patterns
unless overridden inside a SPEC.
USAGE
}

declare -a PATTERN_SPECS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pattern)
      if [[ $# -lt 2 ]]; then
        echo "error: --pattern requires an argument" >&2
        exit 1
      fi
      PATTERN_SPECS+=("$2")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ${#PATTERN_SPECS[@]} -eq 0 ]]; then
  PATTERN_SPECS=(
    "mode=both,target_start=attn,target_end=markets,ignore_case=0"
    "mode=both,target=attn,ignore_case=0"
  )
fi

run_pattern() {
  local spec="$1"
  declare -A opts=()

  IFS=',' read -ra pairs <<< "$spec"
  for pair in "${pairs[@]}"; do
    [[ -z "$pair" ]] && continue
    if [[ "$pair" != *=* ]]; then
      echo "warning: skipping malformed pair '$pair'" >&2
      continue
    fi
    local key="${pair%%=*}"
    local value="${pair#*=}"
    opts[$key]="$value"
  done

  local mode="${opts[mode]:-both}"
  local target="${opts[target]:-}"
  local target_start="${opts[target_start]:-${opts[start]:-${target}}}"
  local target_end="${opts[target_end]:-${opts[end]:-${target}}}"
  local count="${opts[count]:-1}"
  local count_start="${opts[count_start]:-${count}}"
  local count_end="${opts[count_end]:-${count}}"
  local ignore_case="${opts[ignore_case]:-${IGNORE_CASE:-1}}"
  local threads="${opts[threads]:-${THREADS:-}}"
  local out_dir="${opts[out_dir]:-${OUT_DIR:-}}"

  declare -a env_args=()
  env_args+=("MODE=${mode}")
  if [[ -n "$target" ]]; then env_args+=("TARGET=${target}"); fi
  if [[ -n "$target_start" ]]; then env_args+=("TARGET_START=${target_start}"); fi
  if [[ -n "$target_end" ]]; then env_args+=("TARGET_END=${target_end}"); fi
  env_args+=("COUNT=${count}")
  env_args+=("COUNT_START=${count_start}")
  env_args+=("COUNT_END=${count_end}")
  env_args+=("IGNORE_CASE=${ignore_case}")
  if [[ -n "$threads" ]]; then env_args+=("THREADS=${threads}"); fi
  if [[ -n "$out_dir" ]]; then env_args+=("OUT_DIR=${out_dir}"); fi

  echo "=== Running pattern: ${spec} ==="
  env "${env_args[@]}" "${GRIND_SCRIPT}"
  echo
}

for spec in "${PATTERN_SPECS[@]}"; do
  run_pattern "${spec}"
done
