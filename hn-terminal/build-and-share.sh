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

BRANCH="claude/vps-welcome-screen-m373a1"
if [ -z "$HN_SYNCED" ]; then
    echo -e "${CYAN}  Fetching latest code ($BRANCH)...${RESET}"
    git fetch -q origin "$BRANCH"
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

# Install build tools if needed (first run only)
if ! command -v make &>/dev/null; then
    echo -e "${CYAN}  Installing build tools...${RESET}"
    apt-get update -qq
    apt-get install -y -qq build-essential
fi
if ! command -v wine &>/dev/null; then
    echo -e "${CYAN}  Installing Wine for Windows cross-compilation...${RESET}"
    dpkg --add-architecture i386 2>/dev/null || true
    apt-get update -qq
    apt-get install -y -qq wine wine64 2>&1 | tail -3
fi
if ! command -v png2icns &>/dev/null; then
    echo -e "${CYAN}  Installing macOS cross-compilation tools...${RESET}"
    apt-get update -qq
    apt-get install -y -qq icnsutils 2>&1 | tail -3
fi

# Clean previous build output, keep node_modules
rm -rf dist

# Only reinstall if node_modules is missing or package.json changed
if [ ! -d node_modules ] || [ package.json -nt node_modules/.package-lock.json ]; then
    echo -e "${CYAN}  Installing dependencies...${RESET}"
    npm ci 2>&1 | tail -5
else
    echo -e "${GREEN}  [✓]${RESET} Dependencies up to date"
fi

# ── Build Windows ────────────────────────────────────

echo -e "${CYAN}  Building Windows installer...${RESET}"
echo ""

WIN_INSTALLER="dist/HN-Secure-Enclave-Setup-${VERSION}.exe"
if npx electron-builder --win --x64 2>&1 | tail -5; then
    if [ -f "$WIN_INSTALLER" ]; then
        echo -e "${GREEN}  [✓]${RESET} Windows installer built"
    else
        echo -e "${RED}  [✗] Windows build produced no installer${RESET}"
    fi
else
    echo -e "${RED}  [✗] Windows build failed${RESET}"
fi

# ── Build macOS ──────────────────────────────────────

echo ""
echo -e "${CYAN}  Building macOS app...${RESET}"
echo ""

MAC_X64="dist/HN-Secure-Enclave-${VERSION}-mac-x64.zip"
MAC_ARM="dist/HN-Secure-Enclave-${VERSION}-mac-arm64.zip"
if npx electron-builder --mac --x64 --arm64 2>&1 | tail -5; then
    if [ -f "$MAC_X64" ] || [ -f "$MAC_ARM" ]; then
        echo -e "${GREEN}  [✓]${RESET} macOS app built"
    else
        echo -e "${RED}  [✗] macOS build produced no output${RESET}"
    fi
else
    echo -e "${RED}  [✗] macOS build failed${RESET}"
fi

# ── Deploy ─────────────────────────────────────────────

DEST="$SHARE_DIR/HN Secure Enclave"
mkdir -p "$DEST"

if [ -f "$WIN_INSTALLER" ]; then
    rm -f "$DEST"/HN-Secure-Enclave-Setup-*.exe
    cp "$WIN_INSTALLER" "$DEST/"
    chmod 644 "$DEST/$(basename "$WIN_INSTALLER")"
fi

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
