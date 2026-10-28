#!/usr/bin/env bash
# Installs (or updates) the HN Group Staff Portal on this VPS.
#
#   sudo bash staff-portal/install.sh [domain] [email-for-ssl]
#
# Defaults: domain = staff.hngroup.org.uk. If the domain's DNS points at this server, a free
# Let's Encrypt HTTPS certificate is set up. The email is only needed the very first time
# (to register with Let's Encrypt); after that the existing registration is reused.
#
# This also installs or updates the public website (hngroup.org.uk, see hngroup-site/), so one
# command updates both:  cd /root/HorizonNetwork && git pull && sudo bash staff-portal/install.sh
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
cp "$SCRIPT_DIR/server.js" "$SCRIPT_DIR/reset-admin.js" "$SCRIPT_DIR/public-proxy.js" "$APP_DIR/"
cp -r "$SCRIPT_DIR/lib" "$SCRIPT_DIR/public" "$APP_DIR/"
ok "Portal deployed to $APP_DIR (user data kept in $DATA_DIR)"

# ---- Run under PM2 ----
pm2 delete "$PM2_NAME" 2>/dev/null || true
if [ -f /var/lib/hn-control/accounts-enabled ]; then
    PORT=$PORT HOST=127.0.0.1 DATA_DIR="$DATA_DIR" pm2 start "$APP_DIR/public-proxy.js" --name "$PM2_NAME" --update-env
    if [ -f /var/lib/hn-control/accounts-independent ]; then pm2 restart hn-accounts; else pm2 restart hn-auth; fi
else
    PORT=$PORT HOST=127.0.0.1 DATA_DIR="$DATA_DIR" pm2 start "$APP_DIR/server.js" --name "$PM2_NAME" --update-env
fi
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
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
if [ -f "$CERT_DIR/fullchain.pem" ] && [ -f "$CERT_DIR/privkey.pem" ]; then
    # The certificate already exists: write the HTTPS site ourselves, so the portal never depends on
    # certbot putting it back (when that failed, only port 80 was left and HTTPS visits got nginx's
    # empty catch-all answer).
    {
        sed -e "s/staff\.hngroup\.org\.uk/$DOMAIN/" \
            -e "s/^\(\s*\)listen 80;/\1listen 443 ssl;/" -e "s/^\(\s*\)listen \[::\]:80;/\1listen [::]:443 ssl;/" \
            -e "/^\s*server_name /a\\    ssl_certificate $CERT_DIR/fullchain.pem;\\n    ssl_certificate_key $CERT_DIR/privkey.pem;" \
            "$SCRIPT_DIR/nginx-staff.conf"
        [ -f /etc/letsencrypt/options-ssl-nginx.conf ] && SSL_OPTS="    include /etc/letsencrypt/options-ssl-nginx.conf;" || SSL_OPTS=""
        [ -f /etc/letsencrypt/ssl-dhparams.pem ] && SSL_OPTS="$SSL_OPTS
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
        cat <<NGINX

server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
NGINX
    } > "$NGINX_SITE"
    if [ -n "$SSL_OPTS" ]; then
        python3 - "$NGINX_SITE" "$SSL_OPTS" <<'PY'
import sys
path, extra = sys.argv[1], sys.argv[2]
text = open(path).read()
marker = "privkey.pem;\n"
open(path, "w").write(text.replace(marker, marker + extra + "\n", 1))
PY
    fi
    STAFF_HTTPS_WRITTEN=1
else
    sed "s/staff\.hngroup\.org\.uk/$DOMAIN/" "$SCRIPT_DIR/nginx-staff.conf" > "$NGINX_SITE"
    STAFF_HTTPS_WRITTEN=0
fi
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

if [ "$STAFF_HTTPS_WRITTEN" = 1 ]; then
    HTTPS_OK=1
    ok "HTTPS: using the existing certificate (it renews automatically)"
elif [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    # Existing certificate: re-attach it to the freshly written nginx config (renews if close to expiry).
    if certbot --nginx -d "$DOMAIN" --non-interactive --redirect --keep-until-expiring; then
        HTTPS_OK=1
        ok "HTTPS certificate re-applied"
    else
        warn "certbot failed — see the output above. The portal is still reachable over HTTP."
    fi
elif [ -z "$EMAIL" ] && [ ! -d /etc/letsencrypt/accounts ]; then
    warn "No email given, so HTTPS was skipped. Re-run with: sudo bash $0 $DOMAIN you@hngroup.org.uk"
elif [ "$DNS_IP" != "$SERVER_IP" ]; then
    warn "$DOMAIN resolves to '${DNS_IP:-nothing}', not this server ($SERVER_IP)."
    warn "Add the DNS A record first (see staff-portal/README.md), then re-run this script."
else
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos ${EMAIL:+-m "$EMAIL"} --redirect --keep-until-expiring; then
        HTTPS_OK=1
        ok "HTTPS certificate installed (auto-renews)"
    else
        warn "certbot failed — see the output above. The portal is still reachable over HTTP."
    fi
fi

# ---- The public website (hngroup.org.uk) ----
# Installed by the same command so both stay up to date. Set SKIP_WEBSITE=1 to leave it out.
if [ "${SKIP_WEBSITE:-0}" != 1 ] && [ -f "$SCRIPT_DIR/../hngroup-site/install.sh" ]; then
    echo ""
    bash "$SCRIPT_DIR/../hngroup-site/install.sh" "$EMAIL" || warn "The website install had a problem — see the output above."
fi

echo ""
echo -e "${GREEN}  All done!${RESET}"
echo ""
if [ "$HTTPS_OK" = 1 ]; then
    echo -e "  ${CYAN}Staff Portal:${RESET}  https://$DOMAIN"
else
    echo -e "  ${CYAN}Staff Portal:${RESET}  http://$DOMAIN  (once DNS points at $SERVER_IP)"
fi
echo -e "  ${CYAN}Default login:${RESET} admin@hngroup.org.uk / admin (if you haven't changed it yet)"
echo -e "  ${CYAN}Logs:${RESET}          pm2 logs $PM2_NAME"
echo ""

if [ -f /opt/hn-admin/reconcile-power.cjs ]; then node /opt/hn-admin/reconcile-power.cjs staff; fi
pm2 save
