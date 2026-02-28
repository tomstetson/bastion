#!/usr/bin/env bash
#
# Bastion Uninstaller
# Usage: curl -fsSL https://raw.githubusercontent.com/tomstetson/bastion/main/uninstall.sh | bash
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

INSTALL_DIR="${BASTION_INSTALL_DIR:-$HOME/.bastion}"
BIN_DIR="${BASTION_BIN_DIR:-$HOME/.local/bin}"

log() {
  echo -e "${BLUE}[bastion]${NC} $1"
}

success() {
  echo -e "${GREEN}[bastion]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[bastion]${NC} $1"
}

main() {
  echo ""
  echo -e "${BLUE}╭───────────────────────────────────╮${NC}"
  echo -e "${BLUE}│      ${RED}Bastion Uninstaller${BLUE}       │${NC}"
  echo -e "${BLUE}╰───────────────────────────────────╯${NC}"
  echo ""

  # Remove binaries
  if [ -f "$BIN_DIR/bastion" ]; then
    log "Removing $BIN_DIR/bastion..."
    rm -f "$BIN_DIR/bastion"
  fi

  if [ -f "$BIN_DIR/bn" ]; then
    log "Removing $BIN_DIR/bn..."
    rm -f "$BIN_DIR/bn"
  fi

  # Remove installation directory
  if [ -d "$INSTALL_DIR" ]; then
    log "Removing $INSTALL_DIR..."
    rm -rf "$INSTALL_DIR"
  fi

  echo ""
  success "Bastion has been uninstalled"
  echo ""
  warn "Note: PATH entries in shell config files were not removed"
  warn "You may want to manually remove the Bastion PATH entry from your shell config"
  echo ""
}

main "$@"
