#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARE_DIR="/share/GATEWAY"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}  HN Terminal — Build & Deploy${RESET}"
echo ""

if [ ! -d "$SHARE_DIR" ]; then
    echo -e "${RED}  Error: $SHARE_DIR not found${RESET}"
    exit 1
fi

cd "$SCRIPT_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${CYAN}  Installing dependencies...${RESET}"
    npm install
fi

# Install Wine for cross-compiling to Windows
if ! command -v wine &>/dev/null; then
    echo -e "${CYAN}  Installing Wine for Windows cross-compilation...${RESET}"
    dpkg --add-architecture i386 2>/dev/null || true
    apt-get update -qq
    apt-get install -y -qq wine wine64
fi

echo -e "${CYAN}  Building Windows installer...${RESET}"
npx electron-builder --win --x64

# Find the built installer
INSTALLER=$(find dist -name "HN-Terminal-Setup-*.exe" -type f | head -1)

if [ -z "$INSTALLER" ]; then
    echo -e "${RED}  Error: Build failed — no installer found${RESET}"
    exit 1
fi

# Copy to Samba share
mkdir -p "$SHARE_DIR/HN Terminal"
cp "$INSTALLER" "$SHARE_DIR/HN Terminal/"
echo ""
echo -e "${GREEN}  Done!${RESET}"
echo -e "  Installer copied to: ${CYAN}\\\\GATEWAY\\HN Terminal\\$(basename "$INSTALLER")${RESET}"
echo ""
