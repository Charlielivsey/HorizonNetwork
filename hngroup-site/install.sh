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
# redirects to it). Open roles and the contact form come from the staff portal. It works with the
# domain pointing straight at this server or through Cloudflare's proxy. HTTPS uses a free Let's
# Encrypt certificate, with a temporary self-signed one until that's issued (the email is only
# needed if this server has never had a Let's Encrypt certificate before).
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

# ---- HTTPS certificate ----
# nginx always reads the certificate from /etc/nginx/hngroup-ssl. That points at the Let's Encrypt
# certificate once there is one, and at a temporary self-signed one until then, so HTTPS (and
# Cloudflare, which connects over HTTPS) always gets the website rather than another site.
SSL_DIR="/etc/nginx/hngroup-ssl"
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
mkdir -p "$SSL_DIR" /var/www/letsencrypt
use_cert() { ln -sfn "$1" "$SSL_DIR/fullchain.pem"; ln -sfn "$2" "$SSL_DIR/privkey.pem"; }
if [ -f "$LE_DIR/fullchain.pem" ]; then
    use_cert "$LE_DIR/fullchain.pem" "$LE_DIR/privkey.pem"
else
    if [ ! -f "$SSL_DIR/selfsigned.crt" ]; then
        openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=$DOMAIN" \
            -addext "subjectAltName=DNS:$DOMAIN,DNS:$WWW" \
            -keyout "$SSL_DIR/selfsigned.key" -out "$SSL_DIR/selfsigned.crt" >/dev/null 2>&1
        chmod 600 "$SSL_DIR/selfsigned.key"
    fi
    use_cert "$SSL_DIR/selfsigned.crt" "$SSL_DIR/selfsigned.key"
fi

# ---- nginx: catch-all for addresses this server doesn't host ----
# Any name nginx doesn't know (a website that hasn't finished installing, or a wrong address) gets an HN Group error
# page (HN-NO-SITE) on HTTP and HTTPS, instead of whichever website nginx would otherwise pick (the user's request,
# 29 October 2026: "dont just have them redirect to the main website ... show some form of an error so that we know").
CATCHALL="/etc/nginx/sites-available/hn-catch-all"
if [ ! -f /etc/nginx/hn-catch-all.crt ]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=invalid" \
        -keyout /etc/nginx/hn-catch-all.key -out /etc/nginx/hn-catch-all.crt >/dev/null 2>&1
    chmod 600 /etc/nginx/hn-catch-all.key
fi
mkdir -p /var/www/hn-catch-all
cp "$SCRIPT_DIR/nginx/not-set-up.html" /var/www/hn-catch-all/not-set-up.html
CATCHALL_BACKUP="$(mktemp)"; [ ! -f "$CATCHALL" ] || cp "$CATCHALL" "$CATCHALL_BACKUP"
cat > "$CATCHALL" <<'NGINX'
# Requests for names this server doesn't host. Written by hngroup-site/install.sh.
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    ssl_certificate /etc/nginx/hn-catch-all.crt;
    ssl_certificate_key /etc/nginx/hn-catch-all.key;
    root /var/www/hn-catch-all;
    error_page 404 /not-set-up.html;
    location = /not-set-up.html { internal; default_type text/html; add_header Cache-Control "no-store" always; }
    location / { return 404; }
}
NGINX
[ -s /proc/net/if_inet6 ] || sed -i '/listen \[::\]/d' "$CATCHALL"
# The first HN website's nginx file (setup-websites.sh: sites "horizon") also claimed to be the default for port 80, which
# is why unknown names used to show the main website. Only the catch-all is the default now; that site still answers
# for the server's own IP address.
for other in /etc/nginx/sites-enabled/*; do
    [ -f "$other" ] || continue
    case "$other" in */hn-catch-all) continue ;; esac
    if grep -Eq '^[[:space:]]*listen[^#;]*(80|443)[^#;]*default_server' "$other"; then
        real="$(readlink -f "$other")"; cp "$real" "$real.before-catch-all" 2>/dev/null || true
        sed -i -E 's/^([[:space:]]*listen[^#;]*)[[:space:]]+default_server/\1/; s/^([[:space:]]*server_name[^#;]*)[[:space:]]+_([[:space:]]*;)/\1\2/' "$real"
        ok "Removed default_server from $(basename "$real") (backup: $real.before-catch-all)"
    fi
done
ln -sf "$CATCHALL" /etc/nginx/sites-enabled/hn-catch-all
if ! nginx -t >/dev/null 2>&1; then
    warn "nginx didn't accept the catch-all page, so it was put back as it was:"; nginx -t || true
    if [ -s "$CATCHALL_BACKUP" ]; then cp "$CATCHALL_BACKUP" "$CATCHALL"; else rm -f "$CATCHALL" /etc/nginx/sites-enabled/hn-catch-all; fi
    for other in /etc/nginx/sites-available/*.before-catch-all; do [ -f "$other" ] && mv "$other" "${other%.before-catch-all}"; done
fi
rm -f "$CATCHALL_BACKUP"

# ---- nginx: the website ----
# The file name starts with 00- so nginx loads it before the other sites: if anything else also
# claims hngroup.org.uk, this one wins.
NGINX_SITE="/etc/nginx/sites-available/00-hngroup-website"
rm -f /etc/nginx/sites-enabled/hngroup-website
cp "$SCRIPT_DIR/nginx/hngroup-website.conf" "$NGINX_SITE"
mkdir -p /etc/nginx/snippets
cp "$SCRIPT_DIR/nginx/hngroup-site.conf" /etc/nginx/snippets/hngroup-site.conf
cp "$SCRIPT_DIR/nginx/hngroup-cloudflare.conf" /etc/nginx/snippets/hngroup-cloudflare.conf
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/00-hngroup-website

# Any other nginx config that claims hngroup.org.uk or www (for example an older setup that sent
# the main domain to the staff portal) is switched off, or has those names taken out if it also
# serves something else. Backups go to /root/nginx-backup-<date>.
BACKUP="/root/nginx-backup-$(date +%Y%m%d-%H%M%S)"
NAME_RE="server_name[^;]*[[:space:]](hngroup\.org\.uk|www\.hngroup\.org\.uk)[[:space:];]"
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -e "$f" ] || continue
    real="$(readlink -f "$f")"
    case "$(basename "$f")" in 00-hngroup-website|hn-catch-all) continue ;; esac
    grep -qE "$NAME_RE" "$real" 2>/dev/null || continue
    mkdir -p "$BACKUP"
    cp "$real" "$BACKUP/$(basename "$real")"
    # Every name the file serves, apart from ours.
    others="$(grep -oE "server_name[^;]*" "$real" | sed -E 's/^server_name//' | tr -s ' \t' '\n' | grep -vE '^$|^(www\.)?hngroup\.org\.uk$' || true)"
    if [ -n "$others" ]; then
        # Also serves other names (e.g. staff.hngroup.org.uk): just take ours out of it.
        sed -i -E '/server_name/ s/[[:space:]](www\.)?hngroup\.org\.uk([[:space:];])/\2/g' "$real"
        sed -i -E '/server_name/ s/[[:space:]](www\.)?hngroup\.org\.uk([[:space:];])/\2/g' "$real"
        sed -i -E 's/server_name[[:space:]]*;/server_name hngroup-moved.invalid;/' "$real"
        warn "Removed $DOMAIN from $real (it was sending the main domain elsewhere; backup in $BACKUP)"
    else
        if [ -L "$f" ]; then rm -f "$f"; else mv "$f" "$f.disabled"; fi
        warn "Switched off $f, which was also serving $DOMAIN (backup in $BACKUP)"
    fi
done

# Servers without IPv6 can't listen on [::], so take those lines out of our files there.
if ! nginx -t 2>/dev/null && nginx -t 2>&1 | grep -q "Address family not supported"; then
    sed -i '/listen[[:space:]]*\[::\]/d' "$NGINX_SITE" "$CATCHALL"
    warn "This server has no IPv6, so the website only listens on IPv4"
fi

if nginx -t 2>/dev/null; then
    systemctl reload nginx || systemctl restart nginx
    systemctl enable nginx >/dev/null 2>&1
    ok "nginx configured for $DOMAIN and $WWW"
else
    echo -e "${RED}  [✗] nginx config invalid!${RESET}"
    nginx -t
    if [ -d "${BACKUP:-/nonexistent}" ]; then warn "Backups of anything changed are in $BACKUP"; fi
    exit 1
fi

if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow 'Nginx Full' >/dev/null
    ok "Firewall: opened ports 80 and 443"
fi

# ---- Let's Encrypt ----
# Uses the "webroot" method: Let's Encrypt fetches a file from /.well-known/acme-challenge/,
# which nginx answers on HTTP and HTTPS. That works whether the domain points straight here or
# goes through Cloudflare's proxy.
SERVER_IP="$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
# Is this address Cloudflare's? (their proxy sits in front of the domain when the cloud is orange)
is_cloudflare() {
    python3 -c "import ipaddress,sys
nets=[ipaddress.ip_network(n) for n in '173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32'.split()]
sys.exit(0 if any(ipaddress.ip_address(sys.argv[1]) in n for n in nets) else 1)" "$1" 2>/dev/null
}
# 0 = points here, 1 = through Cloudflare, 2 = somewhere else / nothing
where() {
    local ip; ip="$(getent ahostsv4 "$1" 2>/dev/null | awk 'NR==1{print $1}')"
    if [ "$ip" = "$SERVER_IP" ]; then return 0; elif [ -n "$ip" ] && is_cloudflare "$ip"; then return 1; else return 2; fi
}
NAMES=()
for n in "$DOMAIN" "$WWW"; do
    set +e; where "$n"; w=$?; set -e
    case $w in
        0) NAMES+=(-d "$n") ;;
        1) NAMES+=(-d "$n"); ok "$n goes through Cloudflare's proxy" ;;
        *) warn "$n doesn't point at this server ($SERVER_IP) or Cloudflare yet, so it's left off the certificate." ;;
    esac
done
HTTPS_OK=0
if [ "${NAMES[1]:-}" != "$DOMAIN" ]; then
    warn "Point $DOMAIN at $SERVER_IP (see hngroup-site/README.md), then run the installer again."
    warn "Until then HTTPS uses a temporary self-signed certificate."
elif [ -z "$EMAIL" ] && [ ! -d /etc/letsencrypt/accounts ]; then
    warn "This server has never had a Let's Encrypt certificate, so an email is needed once:"
    warn "  sudo bash staff-portal/install.sh staff.hngroup.org.uk you@hngroup.org.uk"
elif certbot certonly --webroot -w /var/www/letsencrypt "${NAMES[@]}" --cert-name "$DOMAIN" \
        --non-interactive --agree-tos ${EMAIL:+-m "$EMAIL"} --keep-until-expiring --expand \
        --deploy-hook "systemctl reload nginx"; then
    use_cert "$LE_DIR/fullchain.pem" "$LE_DIR/privkey.pem"
    nginx -t 2>/dev/null && (systemctl reload nginx || systemctl restart nginx)
    HTTPS_OK=1
    ok "Let's Encrypt certificate in place for $DOMAIN (renews automatically)"
else
    warn "Let's Encrypt couldn't issue the certificate — see above. HTTPS keeps using the temporary"
    warn "self-signed certificate, which works behind Cloudflare in 'Full' SSL mode (not 'Full (strict)')."
fi

echo ""
echo -e "${GREEN}  All done!${RESET}"
echo ""
if [ "$HTTPS_OK" = 1 ]; then
    echo -e "  ${CYAN}Website:${RESET}  https://$DOMAIN"
else
    echo -e "  ${CYAN}Website:${RESET}  http://$DOMAIN  (once DNS points at $SERVER_IP)"
fi
echo -e "  ${CYAN}Files:${RESET}    $WEB_DIR"

# Check what the domain really serves, and say what to fix if it isn't the website.
bash "$SCRIPT_DIR/check.sh" || true

# Website configuration, Auth and server-enforced maintenance.
bash "$SCRIPT_DIR/install-admin.sh" "$EMAIL"
