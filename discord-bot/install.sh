#!/usr/bin/env bash
# Horizon Discord Bot installer: installs Node.js + PM2, deploys the bot, and starts it.
# Usage: sudo bash install.sh            (prompts for the bot token)
#        sudo DISCORD_TOKEN=xxx bash install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="/opt/horizon-discord-bot"
APP_NAME="horizon-discord-bot"
NODE_MAJOR=20

if [ "$(id -u)" -ne 0 ]; then
    echo "Please run as root: sudo bash $0"
    exit 1
fi

echo "==> Installing system packages..."
apt-get update -y
apt-get install -y curl ca-certificates rsync

current_node_major=0
if command -v node &>/dev/null; then
    current_node_major="$(node -p 'process.versions.node.split(".")[0]')"
fi
if [ "$current_node_major" -lt 18 ]; then
    echo "==> Installing Node.js ${NODE_MAJOR}..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
else
    echo "==> Node.js $(node -v) already installed."
fi

if ! command -v pm2 &>/dev/null; then
    echo "==> Installing PM2..."
    npm install -g pm2
fi
if ! pm2 describe pm2-logrotate &>/dev/null; then
    echo "==> Installing PM2 log rotation..."
    pm2 install pm2-logrotate >/dev/null
fi

echo "==> Copying bot files to ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"
rsync -a --delete \
    --exclude node_modules --exclude .env --exclude data --exclude logs \
    "$SCRIPT_DIR/" "$INSTALL_DIR/"

ENV_FILE="$INSTALL_DIR/.env"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
if [ -n "${DISCORD_TOKEN:-}" ] || ! grep -q '^DISCORD_TOKEN=.' "$ENV_FILE"; then
    token="${DISCORD_TOKEN:-}"
    while [ -z "$token" ]; do
        read -rsp "Enter your Discord bot token (input hidden): " token
        echo
    done
    { grep -v '^DISCORD_TOKEN=' "$ENV_FILE" || true; printf 'DISCORD_TOKEN=%s\n' "$token"; } > "$ENV_FILE.new"
    mv "$ENV_FILE.new" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "==> Token saved to ${ENV_FILE} (readable by root only)."
else
    echo "==> Keeping existing token in ${ENV_FILE}."
fi

echo "==> Installing bot dependencies..."
cd "$INSTALL_DIR"
if [ -f package-lock.json ]; then
    npm ci --omit=dev
else
    npm install --omit=dev
fi

echo "==> Starting bot with PM2..."
if pm2 describe "$APP_NAME" &>/dev/null; then
    pm2 reload ecosystem.config.js --update-env
else
    pm2 start ecosystem.config.js
fi
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

echo
echo "Done! The bot is running and will restart automatically on reboot."
echo "  View logs:    pm2 logs ${APP_NAME}"
echo "  Restart:      pm2 restart ${APP_NAME}"
echo "  Status:       pm2 status"
echo "  Update:       git pull, then re-run: sudo bash $SCRIPT_DIR/install.sh"
