#!/usr/bin/env bash
set -eo pipefail

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

# Always build the latest pushed code. Git replaces this file with a new inode,
# so the running copy is unaffected; we then re-run the updated script.
BRANCH="claude/vps-welcome-screen-m373a1"
if [ -z "$HN_SYNCED" ]; then
    echo -e "${CYAN}  Fetching latest code ($BRANCH)...${RESET}"
    git fetch -q origin "$BRANCH"
    # Generated files from older builds that are now tracked would block the update
    for f in package-lock.json .gitignore; do
        if [ -e "$f" ] && ! git ls-files --error-unmatch "$f" &>/dev/null; then
            rm -f "$f"
        fi
    done
    if [ "$(git rev-parse --abbrev-ref HEAD)" != "$BRANCH" ]; then
        git checkout -q "$BRANCH" 2>/dev/null || git checkout -q -b "$BRANCH" "origin/$BRANCH"
    fi
    if ! git merge -q --ff-only "origin/$BRANCH"; then
        echo -e "${RED}  Error: could not update to the latest code.${RESET}"
        echo -e "  Local changes on the VPS are blocking it:"
        git status --short | sed 's/^/    /'
        exit 1
    fi
    echo -e "${GREEN}  [✓]${RESET} Code is at $(git log -1 --format='%h %s' | cut -c1-70)"
    HN_SYNCED=1 exec bash "$SCRIPT_DIR/build-and-share.sh" "$@"
fi

VERSION=$(node -p "require('./package.json').version")
echo -e "  Version: ${CYAN}v${VERSION}${RESET}"
echo ""

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
npm ci 2>&1 | tail -5

# ── Windows build ──────────────────────────────────────

# Install Wine for cross-compiling to Windows
if ! command -v wine &>/dev/null; then
    echo -e "${CYAN}  Installing Wine for Windows cross-compilation...${RESET}"
    dpkg --add-architecture i386 2>/dev/null || true
    apt-get update -qq
    apt-get install -y -qq wine wine64 2>&1 | tail -3
fi

echo -e "${CYAN}  Building Windows installer...${RESET}"
if npx electron-builder --win --x64 2>&1 | tail -20; then
    true
fi

WIN_INSTALLER="dist/HN-Secure-Enclave-Setup-${VERSION}.exe"

if [ ! -f "$WIN_INSTALLER" ]; then
    echo -e "${RED}  Warning: Windows build failed — $WIN_INSTALLER not found${RESET}"
else
    echo -e "${GREEN}  [✓]${RESET} Windows installer built"
fi

# ── macOS build ────────────────────────────────────────

echo -e "${CYAN}  Building macOS app...${RESET}"
if npx electron-builder --mac --x64 --arm64 2>&1 | tail -20; then
    true
fi

MAC_X64="dist/HN-Secure-Enclave-${VERSION}-mac-x64.zip"
MAC_ARM="dist/HN-Secure-Enclave-${VERSION}-mac-arm64.zip"

MAC_FOUND=0
for zipf in "$MAC_X64" "$MAC_ARM"; do
    if [ -f "$zipf" ]; then
        MAC_FOUND=1
    fi
done

if [ $MAC_FOUND -eq 0 ]; then
    echo -e "${RED}  Warning: macOS build failed — no zip files found${RESET}"
else
    echo -e "${GREEN}  [✓]${RESET} macOS app built"
fi

# ── Deploy ─────────────────────────────────────────────

DEST="$SHARE_DIR/HN Secure Enclave"
mkdir -p "$DEST"

# Deploy Windows
if [ -f "$WIN_INSTALLER" ]; then
    rm -f "$DEST"/HN-Secure-Enclave-Setup-*.exe
    cp "$WIN_INSTALLER" "$DEST/"
    chmod 644 "$DEST/$(basename "$WIN_INSTALLER")"
fi

# Deploy macOS
for zipf in "$MAC_X64" "$MAC_ARM"; do
    if [ -f "$zipf" ]; then
        ARCH="$(basename "$zipf" | grep -oP '(x64|arm64)')"
        rm -f "$DEST"/HN-Secure-Enclave-*-mac-"${ARCH}".zip 2>/dev/null || true
        cp "$zipf" "$DEST/"
        chmod 644 "$DEST/$(basename "$zipf")"
    fi
done

echo ""
echo -e "${GREEN}  Done!${RESET}"
echo ""
if [ -f "$WIN_INSTALLER" ]; then
    echo -e "  Windows: ${CYAN}\\\\GATEWAY\\HN Secure Enclave\\$(basename "$WIN_INSTALLER")${RESET}"
fi
if [ -f "$MAC_X64" ]; then
    echo -e "  macOS (Intel): ${CYAN}\\\\GATEWAY\\HN Secure Enclave\\$(basename "$MAC_X64")${RESET}"
fi
if [ -f "$MAC_ARM" ]; then
    echo -e "  macOS (Apple Silicon): ${CYAN}\\\\GATEWAY\\HN Secure Enclave\\$(basename "$MAC_ARM")${RESET}"
fi
echo ""
