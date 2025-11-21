#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_VERSION="${NODE_VERSION:-20}"              # Aligns with package.json "engines": "20.x"
PNPM_VERSION="${PNPM_VERSION:-9.6.0}"          # Matches packageManager field
NVM_RELEASE="${NVM_RELEASE:-v0.39.7}"
APT_UPDATED=false

log() {
  printf '[setup] %s\n' "$*"
}

die() {
  printf '[setup] ERROR: %s\n' "$*" >&2
  exit 1
}

OS_KERNEL="$(uname -s)"
case "$OS_KERNEL" in
  Darwin*) OS_FAMILY="mac" ;;
  Linux*) OS_FAMILY="linux" ;;
  *) die "Unsupported OS: ${OS_KERNEL}. This script only supports macOS and Debian-based Linux." ;;
esac

if [[ "$OS_FAMILY" == "mac" ]] && ! command -v brew >/dev/null 2>&1; then
  cat <<'MSG' >&2
[setup] ERROR: Homebrew not detected.
[setup] Please install Homebrew from https://brew.sh/ and re-run this script.
MSG
  exit 1
fi

apt_update_if_needed() {
  if [[ "$APT_UPDATED" == "false" ]]; then
    log "Updating apt package index..."
    sudo apt-get update
    APT_UPDATED=true
  fi
}

ensure_tool() {
  local cmd="$1"
  local linux_pkg="${2:-$1}"
  local mac_pkg="${3:-$1}"

  if command -v "$cmd" >/dev/null 2>&1; then
    return
  fi

  if [[ "$OS_FAMILY" == "linux" ]]; then
    if command -v apt-get >/dev/null 2>&1; then
      apt_update_if_needed
      log "Installing ${linux_pkg} via apt..."
      sudo apt-get install -y "$linux_pkg"
      return
    fi
    die "Install ${cmd} (package: ${linux_pkg}) manually and re-run the script."
  else
    if [[ -n "$mac_pkg" ]]; then
      log "Installing ${mac_pkg} via Homebrew..."
      brew install "$mac_pkg"
      return
    fi
    die "Install ${cmd} manually (Command Line Tools) and re-run the script."
  fi
}

ensure_prereqs() {
  ensure_tool curl curl curl
  ensure_tool git git git
  ensure_tool python3 python3 python
  ensure_tool make build-essential ""   # Command Line Tools on macOS already provide make
}

install_node_with_package_manager() {
  if [[ "$OS_FAMILY" == "mac" ]]; then
    if ! brew list node@20 >/dev/null 2>&1; then
      log "Installing node@20 via Homebrew..."
      brew install node@20
    else
      log "node@20 already installed via Homebrew."
    fi
    local node_prefix
    node_prefix="$(brew --prefix node@20)"
    export PATH="${node_prefix}/bin:$PATH"
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    apt_update_if_needed
    log "Adding NodeSource 20.x repository..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    log "Installing nodejs via apt..."
    sudo apt-get install -y nodejs
    return 0
  fi

  return 1
}

load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
  fi
  if [[ -s "$NVM_DIR/bash_completion" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/bash_completion"
  fi
}

install_nvm_if_needed() {
  if command -v nvm >/dev/null 2>&1; then
    return
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -d "$NVM_DIR" ]]; then
    load_nvm
    if command -v nvm >/dev/null 2>&1; then
      return
    fi
  fi

  log "Installing nvm ${NVM_RELEASE}..."
  curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_RELEASE}/install.sh" | bash
  load_nvm
  command -v nvm >/dev/null 2>&1 || die "Failed to install nvm."
}

use_required_node() {
  local desired="${NODE_VERSION}"
  local desired_tag=""
  local desired_major=""

  if [[ "$desired" =~ ^[0-9]+(\.[0-9]+){2}$ ]]; then
    desired_tag="v${desired}"
    desired_major="${desired%%.*}"
  else
    desired_major="${desired%%.*}"
  fi

  if command -v node >/dev/null 2>&1; then
    local current_version
    current_version="$(node -v)"
    local current_major
    current_major="$(echo "$current_version" | sed -E 's/^v([0-9]+).*/\1/')"

    if [[ -n "$desired_tag" && "$current_version" == "$desired_tag" ]]; then
      log "Detected Node ${current_version} (matches required version ${desired_tag})."
      return
    fi

    if [[ -z "$desired_tag" && "$current_major" == "$desired_major" ]]; then
      log "Detected Node ${current_version} (matches required major ${desired_major})."
      return
    fi

    if [[ -n "$desired_tag" ]]; then
      log "Node ${current_version} detected but ${desired_tag} is required; preparing nvm-managed version."
    else
      log "Node ${current_version} detected but major ${current_major} != ${desired_major}; preparing nvm-managed version."
    fi
  else
    log "Node.js not detected, installing via nvm."
  fi

  install_nvm_if_needed
  log "Installing Node ${NODE_VERSION} via nvm..."
  if nvm install "$NODE_VERSION" >/dev/null 2>&1; then
    nvm use "$NODE_VERSION"
    return
  fi

  log "nvm could not install Node ${NODE_VERSION}. Falling back to system package manager..."
  if install_node_with_package_manager; then
    if command -v node >/dev/null 2>&1; then
      local fallback_version
      fallback_version="$(node -v)"
      log "Installed Node ${fallback_version} via package manager."
      return
    fi
  fi

  die "Unable to install Node ${NODE_VERSION}. Please install it manually and re-run the script."
}

install_pnpm() {
  log "Enabling Corepack and activating pnpm ${PNPM_VERSION}..."
  corepack enable
  corepack prepare "pnpm@${PNPM_VERSION}" --activate
}

install_js_dependencies() {
  local use_frozen="${USE_FROZEN_LOCKFILE:-true}"
  local install_cmd=(pnpm install --force)
  if [[ "$use_frozen" == "true" ]]; then
    install_cmd+=(--frozen-lockfile)
  else
    install_cmd+=(--no-frozen-lockfile)
  fi

  log "Installing JavaScript dependencies with pnpm (${install_cmd[*]})..."
  if (cd "$PROJECT_ROOT" && "${install_cmd[@]}"); then
    return
  fi

  if [[ "$use_frozen" == "true" ]]; then
    log "Frozen lockfile install failed, retrying with --no-frozen-lockfile..."
    (cd "$PROJECT_ROOT" && pnpm install --force --no-frozen-lockfile) || die "pnpm install failed."
  else
    die "pnpm install failed."
  fi
}

build_all_apps() {
  if [[ "${SKIP_BUILD:-false}" == "true" ]]; then
    log "SKIP_BUILD set; skipping pnpm -r build step."
    return
  fi
  log "Building every workspace app..."
  (cd "$PROJECT_ROOT" && pnpm -r build)
}

main() {
  log "Detected OS family: ${OS_FAMILY}"
  ensure_prereqs
  use_required_node
  install_pnpm
  install_js_dependencies
  build_all_apps
  log "Environment ready. You can run 'pnpm dev' or use per-app scripts."
}

main "$@"
