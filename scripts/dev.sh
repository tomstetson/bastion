#!/usr/bin/env bash
# dev.sh — ONE command to launch Bastion in development mode.
#
# What it does:
# 1. Kills stale Electron/Vite processes from previous runs
# 2. Rebuilds native modules (better-sqlite3, node-pty) for Electron's ABI
# 3. Starts Electron Forge (which runs Vite dev server + Electron)
# 4. On exit, rebuilds native modules for system Node so `npm test` works
#
# Usage:
#   ./scripts/dev.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Killing stale Electron processes..."
pkill -f "electron.*bastion" 2>/dev/null || true
pkill -f "electron-forge start" 2>/dev/null || true

# Wait briefly for processes to die
sleep 1

echo "==> Rebuilding native modules for Electron..."
npx @electron/rebuild -f

echo "==> Starting Bastion..."
npm start

# After the app exits, rebuild native modules for system Node
# so that `npm test` (vitest with system Node) works without manual steps
echo ""
echo "==> Rebuilding native modules for system Node (for npm test)..."
npm run rebuild:node
echo "==> Done. Native modules restored for system Node."
