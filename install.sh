#!/usr/bin/env bash
set -euo pipefail

# MarsAI CLI Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/mariof1/marsai/main/install.sh | bash

REPO="https://github.com/mariof1/marsai.git"
INSTALL_DIR="/usr/local/lib/marsai"
BIN_LINK="/usr/local/bin/marsai"
NODE_MIN_VERSION=18

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

info()  { echo -e "${CYAN}  ▸${RESET} $1"; }
ok()    { echo -e "${GREEN}  ✓${RESET} $1"; }
warn()  { echo -e "${YELLOW}  !${RESET} $1"; }
fail()  { echo -e "${RED}  ✗${RESET} $1"; exit 1; }

echo ""
echo -e "${CYAN}  ╔══════════════════════════════════════╗${RESET}"
echo -e "${CYAN}  ║       🚀  MarsAI CLI Installer       ║${RESET}"
echo -e "${CYAN}  ╚══════════════════════════════════════╝${RESET}"
echo ""

# ── Check root / sudo ──────────────────────────────────────────────
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo &>/dev/null; then
    SUDO="sudo"
    info "Running with sudo for system install..."
  else
    fail "This script requires root or sudo to install to /usr/local"
  fi
fi

# ── Detect architecture ───────────────────────────────────────────
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  NODE_ARCH="x64" ;;
  aarch64) NODE_ARCH="arm64" ;;
  armv7l)  NODE_ARCH="armv7l" ;;
  *) fail "Unsupported architecture: $ARCH" ;;
esac

# ── Check / Install Node.js ───────────────────────────────────────
install_node() {
  local NODE_VERSION="20.19.2"
  local NODE_DIR="node-v${NODE_VERSION}-linux-${NODE_ARCH}"
  local NODE_TAR="${NODE_DIR}.tar.xz"
  local NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}"
  local NODE_INSTALL_DIR="/usr/local/lib/nodejs"

  info "Installing Node.js v${NODE_VERSION} (${NODE_ARCH})..."

  local TMPDIR
  TMPDIR="$(mktemp -d)"
  trap "rm -rf '$TMPDIR'" EXIT

  if command -v curl &>/dev/null; then
    curl -fsSL "$NODE_URL" -o "$TMPDIR/$NODE_TAR"
  elif command -v wget &>/dev/null; then
    wget -q "$NODE_URL" -O "$TMPDIR/$NODE_TAR"
  else
    fail "curl or wget is required to download Node.js"
  fi

  $SUDO mkdir -p "$NODE_INSTALL_DIR"
  $SUDO tar -xJf "$TMPDIR/$NODE_TAR" -C "$NODE_INSTALL_DIR"
  $SUDO ln -sf "$NODE_INSTALL_DIR/$NODE_DIR/bin/node" /usr/local/bin/node
  $SUDO ln -sf "$NODE_INSTALL_DIR/$NODE_DIR/bin/npm" /usr/local/bin/npm
  $SUDO ln -sf "$NODE_INSTALL_DIR/$NODE_DIR/bin/npx" /usr/local/bin/npx

  rm -rf "$TMPDIR"
  trap - EXIT

  ok "Node.js v${NODE_VERSION} installed"
}

NEED_NODE=false
if command -v node &>/dev/null; then
  NODE_VER="$(node -v | sed 's/v//' | cut -d. -f1)"
  if [ "$NODE_VER" -ge "$NODE_MIN_VERSION" ]; then
    ok "Node.js $(node -v) found"
  else
    warn "Node.js $(node -v) is too old (need v${NODE_MIN_VERSION}+)"
    NEED_NODE=true
  fi
else
  warn "Node.js not found"
  NEED_NODE=true
fi

if [ "$NEED_NODE" = true ]; then
  install_node
fi

# ── Download MarsAI ───────────────────────────────────────────────
info "Downloading MarsAI..."

TMPDIR="$(mktemp -d)"
trap "rm -rf '$TMPDIR'" EXIT

if command -v git &>/dev/null; then
  git clone --depth 1 --quiet "$REPO" "$TMPDIR/marsai"
else
  # Fallback to tarball download
  TARBALL_URL="https://github.com/mariof1/marsai/archive/refs/heads/main.tar.gz"
  if command -v curl &>/dev/null; then
    curl -fsSL "$TARBALL_URL" | tar -xz -C "$TMPDIR"
  elif command -v wget &>/dev/null; then
    wget -qO- "$TARBALL_URL" | tar -xz -C "$TMPDIR"
  else
    fail "git, curl, or wget is required"
  fi
  mv "$TMPDIR/marsai-main" "$TMPDIR/marsai"
fi

ok "Downloaded MarsAI"

# ── Install ───────────────────────────────────────────────────────
info "Installing MarsAI..."

# Remove previous install if it exists
$SUDO rm -rf "$INSTALL_DIR"
$SUDO rm -f "$BIN_LINK"

# Copy app to install directory
$SUDO mkdir -p "$INSTALL_DIR"
$SUDO cp -r "$TMPDIR/marsai/bin" "$INSTALL_DIR/"
$SUDO cp -r "$TMPDIR/marsai/src" "$INSTALL_DIR/"
$SUDO cp "$TMPDIR/marsai/package.json" "$INSTALL_DIR/"
$SUDO cp "$TMPDIR/marsai/package-lock.json" "$INSTALL_DIR/" 2>/dev/null || true

# Install npm dependencies
cd "$INSTALL_DIR"
$SUDO npm install --omit=dev --quiet 2>&1 | tail -1

# Create global symlink
$SUDO ln -sf "$INSTALL_DIR/bin/marsai.js" "$BIN_LINK"
$SUDO chmod +x "$INSTALL_DIR/bin/marsai.js"

# Cleanup
rm -rf "$TMPDIR"
trap - EXIT

ok "MarsAI installed to $INSTALL_DIR"
ok "Binary linked at $BIN_LINK"

# ── Done ──────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}  ══════════════════════════════════════${RESET}"
echo -e "${GREEN}  🎉 MarsAI installed successfully!${RESET}"
echo -e "${GREEN}  ══════════════════════════════════════${RESET}"
echo ""
echo -e "  ${DIM}Set your API key:${RESET}"
echo -e "    ${CYAN}export OPENROUTER_API_KEY=sk-or-v1-...${RESET}"
echo -e "    ${DIM}or${RESET}"
echo -e "    ${CYAN}marsai --set-key sk-or-v1-...${RESET}"
echo ""
echo -e "  ${DIM}Then start chatting:${RESET}"
echo -e "    ${CYAN}marsai${RESET}"
echo ""
