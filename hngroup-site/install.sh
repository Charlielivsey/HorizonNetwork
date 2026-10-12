#!/usr/bin/env bash
# Installs (or updates) the HN Group public website on this VPS.
#
#   sudo bash hngroup-site/install.sh [email-for-ssl]
#
# The site is served by nginx from /var/www/hngroup for hngroup.org.uk (www.hngroup.org.uk
# redirects to it). Open roles and the contact form come from the staff portal, so install that
# first (staff-portal/install.sh). If an email is given and DNS already points at this server,
# free Let's Encrypt HTTPS certificates are set up for both names.
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

# ---- nginx ----
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
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    # Existing certificate: re-attach it to the freshly copied nginx config.
    if certbot --nginx -d "$DOMAIN" -d "$WWW" --cert-name "$DOMAIN" --non-interactive --redirect --keep-until-expiring; then
        HTTPS_OK=1
        ok "HTTPS certificate re-applied"
    else
        warn "certbot failed — see above. The site is still reachable over HTTP."
    fi
elif [ -z "$EMAIL" ]; then
    warn "No email given, so HTTPS was skipped. Re-run with: sudo bash $0 you@hngroup.org.uk"
elif [ "$(dns_ip "$DOMAIN")" != "$SERVER_IP" ] || [ "$(dns_ip "$WWW")" != "$SERVER_IP" ]; then
    warn "$DOMAIN resolves to '$(dns_ip "$DOMAIN")' and $WWW to '$(dns_ip "$WWW")', not this server ($SERVER_IP)."
    warn "Point both at $SERVER_IP (see hngroup-site/README.md), wait for DNS to update, then re-run this script."
else
    if certbot --nginx -d "$DOMAIN" -d "$WWW" --cert-name "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect --keep-until-expiring; then
        HTTPS_OK=1
        ok "HTTPS certificate installed (auto-renews)"
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
