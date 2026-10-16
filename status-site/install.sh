#!/usr/bin/env bash
# Install status.hngroup.org.uk and its minimal staff sign-in integration. No other website installers are invoked.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=status.hngroup.org.uk
EMAIL="${1:-}"
APP_DIR=/opt/hn-status
DATA_DIR=/var/lib/hn-status
SSL_DIR=/etc/nginx/hn-status-ssl
CHALLENGE_DIR=/var/www/hn-status-acme
SITE=/etc/nginx/sites-available/hn-status
ENABLED=/etc/nginx/sites-enabled/hn-status
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
[ "$(id -u)" = 0 ] || { echo 'Run this installer with sudo.'; exit 1; }
for tool in nginx certbot openssl curl node python3; do
    if ! command -v "$tool" >/dev/null; then
        apt-get update -qq
        apt-get install -y nginx certbot openssl curl nodejs npm python3
        break
    fi
done
node -e 'if(Number(process.versions.node.split(".")[0]) < 18) process.exit(1)' || {
    echo 'Node.js 18 or newer is required. Upgrade Node.js before installing status.'; exit 1;
}
if ! command -v pm2 >/dev/null; then npm install -g pm2; fi
# Fail before overwriting anything if the dedicated port belongs to another application.
if python3 -c 'import socket; s=socket.socket(); s.settimeout(2); exit(s.connect_ex(("127.0.0.1",3300)))'; then
    pm2 describe hn-status >/dev/null 2>&1 || { echo 'Port 3300 is already in use. No changes made.'; exit 1; }
fi
# Do not disable or edit another virtual host which already claims this domain.
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = "$ENABLED" ] && continue
    if grep -Eq 'server_name[^;]*[[:space:]]status\.hngroup\.org\.uk([[:space:];]|$)' "$config"; then
        echo "Another nginx configuration already serves $DOMAIN: $config. No changes made."
        exit 1
    fi
done
# The status Admin button uses existing staff credentials and roles.
bash "$SCRIPT_DIR/../auth-site/install.sh" "$EMAIL"

mkdir -p "$APP_DIR/public" "$DATA_DIR" "$SSL_DIR" "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
chmod 700 "$DATA_DIR"
cp "$SCRIPT_DIR/server.js" "$SCRIPT_DIR/auth.js" "$APP_DIR/"
cp -r "$SCRIPT_DIR/public/." "$APP_DIR/public/"
PORT=3300 HOST=127.0.0.1 DATA_DIR="$DATA_DIR" pm2 startOrRestart "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do
    if curl -fsS --max-time 2 http://127.0.0.1:3300/healthz >/dev/null; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" = 1 ] || { echo 'Status failed to start. Check: pm2 logs hn-status'; exit 1; }
if [ -f /opt/hn-admin/reconcile-power.cjs ]; then node /opt/hn-admin/reconcile-power.cjs status; fi
pm2 save
if [ ! -f /etc/systemd/system/pm2-root.service ]; then pm2 startup systemd -u root --hp /root; fi
systemctl enable pm2-root >/dev/null
# Use only this site's certificates; certbot's webroot mode never rewrites other nginx sites.
if [ -f "$LE_DIR/fullchain.pem" ]; then
    ln -sfn "$LE_DIR/fullchain.pem" "$SSL_DIR/fullchain.pem"
    ln -sfn "$LE_DIR/privkey.pem" "$SSL_DIR/privkey.pem"
else
    if [ ! -f "$SSL_DIR/selfsigned.crt" ]; then
        openssl req -x509 -nodes -newkey rsa:2048 -days 365 -subj "/CN=$DOMAIN" \
            -addext "subjectAltName=DNS:$DOMAIN" -keyout "$SSL_DIR/selfsigned.key" -out "$SSL_DIR/selfsigned.crt" >/dev/null 2>&1
        chmod 600 "$SSL_DIR/selfsigned.key"
    fi
    ln -sfn "$SSL_DIR/selfsigned.crt" "$SSL_DIR/fullchain.pem"
    ln -sfn "$SSL_DIR/selfsigned.key" "$SSL_DIR/privkey.pem"
fi
# Keep a copy of this site's previous configuration for rollback if nginx validation fails.
BACKUP="$(mktemp -d)"
trap 'rm -rf "$BACKUP"' EXIT
[ ! -f "$SITE" ] || cp "$SITE" "$BACKUP/site"
WAS_ENABLED=0
[ ! -e "$ENABLED" ] || WAS_ENABLED=1
cp "$SCRIPT_DIR/nginx-status.conf" "$SITE"
if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
ln -sfn "$SITE" "$ENABLED"
if ! nginx -t; then
    if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
    [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
    echo 'nginx validation failed; the status configuration was rolled back.'; exit 1
fi
systemctl reload nginx
HTTPS_OK=0
CERT_ARGS=()
if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
if [ -n "$EMAIL" ] || [ -d /etc/letsencrypt/accounts ]; then
    if certbot certonly --webroot -w "$CHALLENGE_DIR" -d "$DOMAIN" --cert-name "$DOMAIN" \
        --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
        --deploy-hook 'nginx -t && systemctl reload nginx'; then
        ln -sfn "$LE_DIR/fullchain.pem" "$SSL_DIR/fullchain.pem"
        ln -sfn "$LE_DIR/privkey.pem" "$SSL_DIR/privkey.pem"
        nginx -t && systemctl reload nginx
        HTTPS_OK=1
    fi
else
    echo 'First SSL registration needs an email: sudo bash status-site/install.sh you@hngroup.org.uk'
fi
# Debian/Ubuntu certbot packages normally supply this timer.
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q certbot.timer; then
    systemctl enable --now certbot.timer
fi
echo ''
echo "Status installed: https://$DOMAIN"
echo 'PM2 process: hn-status (port 3300, loopback only)'
echo 'Admin page: https://status.hngroup.org.uk/admin'
echo 'Admin sign-in: auth.hngroup.org.uk (system owner and Super Admin role only)'
if [ "$HTTPS_OK" != 1 ]; then
    echo 'WARNING: Trusted SSL could not be issued/refreshed. An existing certificate or temporary self-signed certificate is in use.'
    echo 'Point the status DNS record at this VPS, allow inbound ports 80/443, then rerun this installer.'
    echo 'Sign-in requires trusted HTTPS on auth and status domains.'
fi
