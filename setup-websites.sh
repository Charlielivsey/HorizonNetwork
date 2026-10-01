#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HN_DIR="/opt/horizon-network"
HA_DIR="/opt/horizon-advertising"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}  Setting up Horizon Network websites...${RESET}"
echo ""

if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}  Error: Run this script as root.${RESET}"
    exit 1
fi

# Install nginx if not present
if ! command -v nginx &>/dev/null; then
    echo -e "  Installing nginx..."
    apt-get update -qq
    apt-get install -y -qq nginx
fi
echo -e "${GREEN}  [✓]${RESET} nginx installed"

# Install Node.js if not present
if ! command -v node &>/dev/null; then
    echo -e "  Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
echo -e "${GREEN}  [✓]${RESET} Node.js installed"

# Install PM2 if not present
if ! command -v pm2 &>/dev/null; then
    npm install -g pm2
    pm2 startup systemd -u root --hp /root 2>/dev/null || true
fi
echo -e "${GREEN}  [✓]${RESET} PM2 installed"

# Deploy Horizon Network main website
mkdir -p "$HN_DIR"
cp -r "$SCRIPT_DIR/website/server.js" "$HN_DIR/"
cp -r "$SCRIPT_DIR/website/public" "$HN_DIR/"
echo -e "${GREEN}  [✓]${RESET} Horizon Network website deployed to ${HN_DIR}"

# Deploy Horizon Advertising website
mkdir -p "$HA_DIR"
cp -r "$SCRIPT_DIR/horizon-advertising/server.js" "$HA_DIR/"
cp -r "$SCRIPT_DIR/horizon-advertising/public" "$HA_DIR/"
echo -e "${GREEN}  [✓]${RESET} Horizon Advertising website deployed to ${HA_DIR}"

# Start/restart PM2 processes
pm2 delete hn-website 2>/dev/null || true
pm2 delete ha-website 2>/dev/null || true
pm2 start "$HN_DIR/server.js" --name hn-website
pm2 start "$HA_DIR/server.js" --name ha-website
pm2 save
echo -e "${GREEN}  [✓]${RESET} PM2: hn-website (port 3000) and ha-website (port 3100) running"

# Configure nginx
cp "$SCRIPT_DIR/nginx-horizon.conf" /etc/nginx/sites-available/horizon
ln -sf /etc/nginx/sites-available/horizon /etc/nginx/sites-enabled/horizon
rm -f /etc/nginx/sites-enabled/default

if nginx -t 2>/dev/null; then
    systemctl restart nginx
    systemctl enable nginx
    echo -e "${GREEN}  [✓]${RESET} nginx configured and running"
else
    echo -e "${RED}  [✗] nginx config invalid!${RESET}"
    nginx -t
    exit 1
fi

echo ""
echo -e "${GREEN}  All done!${RESET}"
echo ""
echo -e "  ${CYAN}Horizon Network:${RESET}     http://217.154.34.205"
echo -e "  ${CYAN}Horizon Advertising:${RESET}  http://217.154.34.205/ha"
echo ""
