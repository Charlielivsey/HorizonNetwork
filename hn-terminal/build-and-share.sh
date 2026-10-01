#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARE_DIR="/share/GATEWAY"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}  HN Secure Enclave — Build & Deploy${RESET}"
echo ""

if [ ! -d "$SHARE_DIR" ]; then
    echo -e "${RED}  Error: $SHARE_DIR not found${RESET}"
    exit 1
fi

cd "$SCRIPT_DIR"

# Install build tools if needed
if ! command -v make &>/dev/null; then
    echo -e "${CYAN}  Installing build tools...${RESET}"
    apt-get update -qq
    apt-get install -y -qq build-essential
fi

# Clean previous build
rm -rf dist node_modules

# Install dependencies
echo -e "${CYAN}  Installing dependencies...${RESET}"
npm install --no-optional 2>&1 | tail -5

# Install Wine for cross-compiling to Windows
if ! command -v wine &>/dev/null; then
    echo -e "${CYAN}  Installing Wine for Windows cross-compilation...${RESET}"
    dpkg --add-architecture i386 2>/dev/null || true
    apt-get update -qq
    apt-get install -y -qq wine wine64 2>&1 | tail -3
fi

echo -e "${CYAN}  Building Windows installer...${RESET}"
npx electron-builder --win --x64 2>&1 | tail -20

# Find the built installer
INSTALLER=$(find dist -name "HN-Secure-Enclave-Setup-*.exe" -type f 2>/dev/null | head -1)

if [ -z "$INSTALLER" ]; then
    echo -e "${RED}  Error: Build failed — no installer found${RESET}"
    echo -e "  Check the output above for errors."
    exit 1
fi

# Copy to Samba share
mkdir -p "$SHARE_DIR/HN Secure Enclave"
cp "$INSTALLER" "$SHARE_DIR/HN Secure Enclave/"

echo ""
echo -e "${GREEN}  Done!${RESET}"
echo -e "  Installer: ${CYAN}$(basename "$INSTALLER")${RESET}"
echo -e "  Location:  ${CYAN}\\\\GATEWAY\\HN Secure Enclave\\$(basename "$INSTALLER")${RESET}"
echo ""
