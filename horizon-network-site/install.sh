#!/usr/bin/env bash
# Install the dedicated Horizon Network website (network.hngroup.org.uk) and its narrow staff leadership integration.
# Its former addresses, horizon-network.co.uk and horizonetwork.com, redirect there (the user's request, 30 October 2026).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=network.hngroup.org.uk
OLD=horizon-network.co.uk
EMAIL="${1:-}"
APP_DIR=/opt/hn-network
DATA_DIR=/var/lib/hn-network
SSL_DIR=/etc/nginx/hn-network-ssl
CHALLENGE_DIR=/var/www/hn-network-acme
SITE=/etc/nginx/sites-available/hn-network
ENABLED=/etc/nginx/sites-enabled/hn-network
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
OLD_LE="/etc/letsencrypt/live/$OLD"
[ "$(id -u)" = 0 ] || { echo 'Run this installer with sudo.'; exit 1; }
for tool in nginx certbot openssl curl node python3; do
    if ! command -v "$tool" >/dev/null; then
        apt-get update -qq
        apt-get install -y nginx certbot openssl curl nodejs npm python3
        break
    fi
done
node --check "$SCRIPT_DIR/server.js"
node -e 'if(Number(process.versions.node.split(".")[0]) < 18) process.exit(1)' || {
    echo 'Node.js 18 or newer is required. Upgrade Node.js before installing Horizon Network.'; exit 1;
}
if ! command -v pm2 >/dev/null; then npm install -g pm2; fi
# Fail before overwriting anything if the dedicated port belongs to another application.
if python3 -c 'import socket; s=socket.socket(); s.settimeout(2); exit(s.connect_ex(("127.0.0.1",3600)))'; then
    pm2 describe hn-network >/dev/null 2>&1 || { echo 'Port 3600 is already in use. No site configuration changed.'; exit 1; }
fi
# Do not disable or edit another virtual host which already claims this domain.
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = "$ENABLED" ] && continue
    if grep -Eq 'server_name[^;]*[[:space:]]((www\.)?horizon-network\.co\.uk|network\.hngroup\.org\.uk)([[:space:];]|$)' "$config"; then
        echo "Another nginx configuration already serves $DOMAIN: $config. No site configuration changed."
        exit 1
    fi
done
# Install only the staff bridge files needed to read the selected public leadership records.
bash "$SCRIPT_DIR/../auth-site/install.sh" "$EMAIL"

mkdir -p "$APP_DIR/public" "$DATA_DIR" "$SSL_DIR" "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
chmod 700 "$DATA_DIR"
cp "$SCRIPT_DIR/server.js" "$SCRIPT_DIR/auth.js" "$APP_DIR/"
mkdir -p "$APP_DIR/control"
cp -r "$SCRIPT_DIR/control/." "$APP_DIR/control/"
mkdir -p /var/www/hn-network
cp -r "$SCRIPT_DIR/public/." /var/www/hn-network/
chown -R www-data:www-data /var/www/hn-network
PORT=3600 HOST=127.0.0.1 DATA_DIR="$DATA_DIR" pm2 startOrRestart "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do
    if curl -fsS --max-time 2 http://127.0.0.1:3600/healthz >/dev/null; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" = 1 ] || { echo 'Horizon Network failed to start. Check: pm2 logs hn-network'; exit 1; }
if [ -f /opt/hn-admin/reconcile-power.cjs ]; then node /opt/hn-admin/reconcile-power.cjs network; fi
pm2 save
if [ ! -f /etc/systemd/system/pm2-root.service ]; then pm2 startup systemd -u root --hp /root; fi
systemctl enable pm2-root >/dev/null
# The former address keeps its own certificates (renewed by certbot.timer); a temporary one is made only if it has none.
if [ -f "$OLD_LE/fullchain.pem" ]; then
    ln -sfn "$OLD_LE/fullchain.pem" "$SSL_DIR/fullchain.pem"
    ln -sfn "$OLD_LE/privkey.pem" "$SSL_DIR/privkey.pem"
elif [ ! -e "$SSL_DIR/fullchain.pem" ]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 -subj "/CN=$OLD" \
        -addext "subjectAltName=DNS:$OLD,DNS:www.$OLD" -keyout "$SSL_DIR/selfsigned.key" -out "$SSL_DIR/selfsigned.crt" >/dev/null 2>&1
    chmod 600 "$SSL_DIR/selfsigned.key"
    ln -sfn "$SSL_DIR/selfsigned.crt" "$SSL_DIR/fullchain.pem"
    ln -sfn "$SSL_DIR/selfsigned.key" "$SSL_DIR/privkey.pem"
fi
if [ -f "/etc/letsencrypt/live/www.$OLD/fullchain.pem" ]; then
    ln -sfn "/etc/letsencrypt/live/www.$OLD/fullchain.pem" "$SSL_DIR/www-fullchain.pem"
    ln -sfn "/etc/letsencrypt/live/www.$OLD/privkey.pem" "$SSL_DIR/www-privkey.pem"
elif [ ! -e "$SSL_DIR/www-fullchain.pem" ]; then
    ln -sfn "$SSL_DIR/fullchain.pem" "$SSL_DIR/www-fullchain.pem"
    ln -sfn "$SSL_DIR/privkey.pem" "$SSL_DIR/www-privkey.pem"
fi
# Keep a copy of this site's previous configuration for rollback if nginx validation fails.
BACKUP="$(mktemp -d)"
trap 'rm -rf "$BACKUP"' EXIT
[ ! -f "$SITE" ] || cp "$SITE" "$BACKUP/site"
WAS_ENABLED=0
[ ! -e "$ENABLED" ] || WAS_ENABLED=1
write_config() {
    cat "$SCRIPT_DIR/nginx.conf" "$SCRIPT_DIR/nginx-network-http.conf" > "$SITE"
    if [ -f "$LE_DIR/fullchain.pem" ]; then
        cat "$SCRIPT_DIR/nginx-network-https.conf" >> "$SITE"
    else
        # Until its certificate exists, the new address answers over HTTP only to say so.
        python3 - "$SITE" <<'PY2'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text();i=s.rindex('    location / { return 301 https://network.hngroup.org.uk$request_uri; }')
s=s[:i]+"    location / { default_type text/plain; return 503 'Horizon Network is moving to network.hngroup.org.uk. Please try again in a few minutes.'; }"+s[i+len('    location / { return 301 https://network.hngroup.org.uk$request_uri; }'):]
p.write_text(s)
PY2
    fi
    if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
    ln -sfn "$SITE" "$ENABLED"
    if ! nginx -t; then
        if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
        [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
        echo 'nginx validation failed; the Horizon Network configuration was rolled back.'; exit 1
    fi
    systemctl reload nginx
}
write_config
if [ ! -f "$LE_DIR/fullchain.pem" ]; then
    CERT_ARGS=()
    if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
    if certbot certonly --webroot -w "$CHALLENGE_DIR" -d "$DOMAIN" --cert-name "$DOMAIN" \
        --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
        --deploy-hook 'nginx -t && systemctl reload nginx'; then
        write_config
    else
        echo "A certificate for $DOMAIN couldn't be issued yet. Check its DNS record (A network -> 217.154.34.205), then rerun: sudo bash horizon-network-site/install.sh"
        exit 1
    fi
fi
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q certbot.timer; then
    systemctl enable --now certbot.timer
fi
# horizonetwork.com redirects to the new address too.
bash "$SCRIPT_DIR/install-alias.sh" "$EMAIL"
echo "Horizon Network: https://$DOMAIN (horizon-network.co.uk and horizonetwork.com redirect here)"
echo 'PM2 process: hn-network (port 3600, loopback only)'
