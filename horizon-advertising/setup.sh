#!/usr/bin/env bash
set -e

HA_DIR="/opt/horizon-advertising"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}  Setting up Horizon Advertising...${RESET}"
echo ""

# Copy to its own dedicated directory
mkdir -p "$HA_DIR"
cp -r "$SCRIPT_DIR/server.js" "$HA_DIR/"
cp -r "$SCRIPT_DIR/public" "$HA_DIR/"

echo -e "${GREEN}  [✓]${RESET} Installed to ${HA_DIR}"

# Start with PM2
if command -v pm2 &>/dev/null; then
    pm2 delete ha-website 2>/dev/null || true
    pm2 start "$HA_DIR/server.js" --name ha-website
    pm2 save
    echo -e "${GREEN}  [✓]${RESET} ha-website running in PM2 on port 3100"
else
    echo "  PM2 not found — run install.sh from the main directory first"
    exit 1
fi

echo ""
echo -e "${GREEN}  Done!${RESET} Visit http://100.95.232.62:3100 in your browser"
echo ""
