#!/usr/bin/env bash
# Installs (or updates) the HN Group public website on this VPS.
#
#   sudo bash hngroup-site/install.sh [email-for-ssl]
#
# You don't normally need to run this yourself: staff-portal/install.sh runs it too, so
#   cd /root/HorizonNetwork && git pull && sudo bash staff-portal/install.sh
# updates the portal and the website together.
#
# The site is served by nginx from /var/www/hngroup for hngroup.org.uk (www.hngroup.org.uk
# redirects to it). Open roles and the contact form come from the staff portal. When DNS points
# at this server, a free Let's Encrypt HTTPS certificate is set up (the email is only needed if
# this server has never had a certificate before).
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN="hngroup.org.uk"
WWW="www.$DOMAIN"
EMAIL="${1:-}"
WEB_DIR="/var/www/hngroup"
PORTAL_PORT=3200

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'
ok()   { echo -e "${GREEN}  [✓]${RESET} $1"; }
warn() { echo -e "${YELLOW}  [!]${RESET} $1"; }

echo ""
echo -e "${CYAN}  Installing the HN Group website (${DOMAIN})...${RESET}"
echo ""

if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}  Error: Run this script as root (sudo bash $0).${RESET}"
    exit 1
fi

if ! command -v nginx &>/dev/null || ! command -v certbot &>/dev/null; then
    echo "  Installing nginx and certbot..."
    apt-get update -qq
    apt-get install -y -qq nginx certbot python3-certbot-nginx
fi
ok "nginx and certbot installed"

# ---- Site files ----
mkdir -p "$WEB_DIR"
rm -rf "${WEB_DIR:?}/"*
cp -r "$SCRIPT_DIR/public/." "$WEB_DIR/"
chown -R www-data:www-data "$WEB_DIR" 2>/dev/null || true
ok "Website copied to $WEB_DIR"

# ---- Staff portal (for open roles and the contact form) ----
if curl -fsS "http://127.0.0.1:$PORTAL_PORT/healthz" >/dev/null 2>&1; then
    ok "Staff portal is running, so Careers and the contact form will work"
else
    warn "The staff portal isn't running on port $PORTAL_PORT. The website will work, but Careers"
    warn "and the contact form need it: sudo bash staff-portal/install.sh"
fi

# ---- nginx: catch-all for HTTPS ----
# Without this, nginx answers HTTPS requests for any name it doesn't know (for example the main
# domain before its certificate exists) with the first HTTPS site it has, which is the staff
# portal. This closes those connections instead.
CATCHALL="/etc/nginx/sites-available/hn-catch-all"
if [ ! -f /etc/nginx/hn-catch-all.crt ]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=invalid" \
        -keyout /etc/nginx/hn-catch-all.key -out /etc/nginx/hn-catch-all.crt >/dev/null 2>&1
    chmod 600 /etc/nginx/hn-catch-all.key
fi
cat > "$CATCHALL" <<'NGINX'
# Requests for names this server doesn't host. Written by hngroup-site/install.sh.
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    ssl_certificate /etc/nginx/hn-catch-all.crt;
    ssl_certificate_key /etc/nginx/hn-catch-all.key;
    return 444;
}
NGINX
if grep -Rqs "listen.*443.*default_server" /etc/nginx/sites-enabled/ --exclude=hn-catch-all; then
    warn "Another nginx site is already the default for HTTPS, so the catch-all was not enabled."
else
    ln -sf "$CATCHALL" /etc/nginx/sites-enabled/hn-catch-all
fi

# ---- nginx: the website ----
NGINX_SITE="/etc/nginx/sites-available/hngroup-website"
cp "$SCRIPT_DIR/nginx-hngroup.conf" "$NGINX_SITE"
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/hngroup-website
if nginx -t 2>/dev/null; then
    systemctl reload nginx || systemctl restart nginx
    systemctl enable nginx >/dev/null 2>&1
    ok "nginx configured for $DOMAIN and $WWW"
else
    echo -e "${RED}  [✗] nginx config invalid!${RESET}"
    nginx -t
    exit 1
fi

if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow 'Nginx Full' >/dev/null
    ok "Firewall: opened ports 80 and 443"
fi

# ---- HTTPS ----
SERVER_IP="$(curl -4 -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
dns_ip() { getent ahostsv4 "$1" 2>/dev/null | awk 'NR==1{print $1}'; }
HTTPS_OK=0
# Only ask for names that already point here, so a missing www record doesn't block the main one.
NAMES=()
for n in "$DOMAIN" "$WWW"; do
    if [ "$(dns_ip "$n")" = "$SERVER_IP" ]; then NAMES+=(-d "$n"); else warn "$n points to '$(dns_ip "$n")', not this server ($SERVER_IP)."; fi
done
if [ "$(dns_ip "$DOMAIN")" != "$SERVER_IP" ]; then
    warn "Point $DOMAIN at $SERVER_IP (see hngroup-site/README.md), wait for DNS to update, then run the installer again."
elif [ -z "$EMAIL" ] && [ ! -d /etc/letsencrypt/accounts ]; then
    warn "This server has never had a certificate, so an email is needed once:"
    warn "  sudo bash staff-portal/install.sh staff.hngroup.org.uk you@hngroup.org.uk"
else
    # --expand adds www to the certificate later if its DNS record is added after the first install.
    if certbot --nginx "${NAMES[@]}" --cert-name "$DOMAIN" --non-interactive --agree-tos ${EMAIL:+-m "$EMAIL"} --redirect --keep-until-expiring --expand; then
        HTTPS_OK=1
        ok "HTTPS certificate in place for hngroup.org.uk (auto-renews)"
    else
        warn "certbot failed — see above. The site is still reachable over HTTP."
    fi
fi

echo ""
echo -e "${GREEN}  All done!${RESET}"
echo ""
if [ "$HTTPS_OK" = 1 ]; then
    echo -e "  ${CYAN}Website:${RESET}  https://$DOMAIN"
else
    echo -e "  ${CYAN}Website:${RESET}  http://$DOMAIN  (once DNS points at $SERVER_IP)"
fi
echo -e "  ${CYAN}Files:${RESET}    $WEB_DIR (re-run this script after changing hngroup-site/public)"
echo ""
