#!/usr/bin/env bash
# Installs (or updates) the HN Group Staff Portal on this VPS.
#
#   sudo bash staff-portal/install.sh [domain] [email-for-ssl]
#
# Defaults: domain = staff.hngroup.org.uk. If an email is given and the domain's
# DNS already points at this server, a free Let's Encrypt HTTPS certificate is set up.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN="${1:-staff.hngroup.org.uk}"
EMAIL="${2:-}"
APP_DIR="/opt/hn-staff-portal"
DATA_DIR="/var/lib/hn-staff-portal"
PORT=3200
PM2_NAME="hn-staff-portal"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}  [✓]${RESET} $1"; }
warn() { echo -e "${YELLOW}  [!]${RESET} $1"; }

echo ""
echo -e "${CYAN}  Installing HN Group Staff Portal (${DOMAIN})...${RESET}"
echo ""

if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}  Error: Run this script as root (sudo bash $0).${RESET}"
    exit 1
fi

# ---- Packages ----
if ! command -v nginx &>/dev/null || ! command -v certbot &>/dev/null; then
    echo "  Installing nginx and certbot..."
    apt-get update -qq
    apt-get install -y -qq nginx certbot python3-certbot-nginx
fi
ok "nginx and certbot installed"

if ! command -v node &>/dev/null; then
    echo "  Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
ok "Node.js $(node -v) installed"

if ! command -v pm2 &>/dev/null; then
    npm install -g pm2
    pm2 startup systemd -u root --hp /root 2>/dev/null || true
fi
ok "PM2 installed"

# ---- App files ----
mkdir -p "$APP_DIR" "$DATA_DIR"
chmod 700 "$DATA_DIR"
rm -rf "$APP_DIR/public" "$APP_DIR/lib"
cp "$SCRIPT_DIR/server.js" "$SCRIPT_DIR/reset-admin.js" "$APP_DIR/"
cp -r "$SCRIPT_DIR/lib" "$SCRIPT_DIR/public" "$APP_DIR/"
ok "Portal deployed to $APP_DIR (user data kept in $DATA_DIR)"

# ---- Run under PM2 ----
pm2 delete "$PM2_NAME" 2>/dev/null || true
PORT=$PORT HOST=127.0.0.1 DATA_DIR="$DATA_DIR" pm2 start "$APP_DIR/server.js" --name "$PM2_NAME" --update-env
pm2 save
sleep 1
if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null; then
    ok "PM2: $PM2_NAME running on 127.0.0.1:$PORT"
else
    echo -e "${RED}  [✗] Portal did not start. Check: pm2 logs $PM2_NAME${RESET}"
    exit 1
fi

# ---- nginx ----
NGINX_SITE="/etc/nginx/sites-available/hn-staff-portal"
sed "s/staff\.hngroup\.org\.uk/$DOMAIN/" "$SCRIPT_DIR/nginx-staff.conf" > "$NGINX_SITE"
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/hn-staff-portal
if nginx -t 2>/dev/null; then
    systemctl reload nginx || systemctl restart nginx
    systemctl enable nginx >/dev/null 2>&1
    ok "nginx configured for $DOMAIN"
else
    echo -e "${RED}  [✗] nginx config invalid!${RESET}"
    nginx -t
    exit 1
fi

# ---- Firewall ----
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow 'Nginx Full' >/dev/null
    ok "Firewall: opened ports 80 and 443"
fi

# ---- HTTPS ----
SERVER_IP="$(curl -4 -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
DNS_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}')"
HTTPS_OK=0

if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    # Existing certificate: re-attach it to the freshly written nginx config (renews if close to expiry).
    if certbot --nginx -d "$DOMAIN" --non-interactive --redirect --keep-until-expiring; then
        HTTPS_OK=1
        ok "HTTPS certificate re-applied"
    else
        warn "certbot failed — see the output above. The portal is still reachable over HTTP."
    fi
elif [ -z "$EMAIL" ]; then
    warn "No email given, so HTTPS was skipped. Re-run with: sudo bash $0 $DOMAIN you@hngroup.org.uk"
elif [ "$DNS_IP" != "$SERVER_IP" ]; then
    warn "$DOMAIN resolves to '${DNS_IP:-nothing}', not this server ($SERVER_IP)."
    warn "Add the DNS A record first (see staff-portal/README.md), then re-run this script."
else
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect --keep-until-expiring; then
        HTTPS_OK=1
        ok "HTTPS certificate installed (auto-renews)"
    else
        warn "certbot failed — see the output above. The portal is still reachable over HTTP."
    fi
fi

echo ""
echo -e "${GREEN}  All done!${RESET}"
echo ""
if [ "$HTTPS_OK" = 1 ]; then
    echo -e "  ${CYAN}Staff Portal:${RESET}  https://$DOMAIN"
else
    echo -e "  ${CYAN}Staff Portal:${RESET}  http://$DOMAIN  (once DNS points at $SERVER_IP)"
fi
echo -e "  ${CYAN}Default login:${RESET} admin / admin (if you haven't changed it yet)"
echo -e "  ${CYAN}Logs:${RESET}          pm2 logs $PM2_NAME"
echo ""
