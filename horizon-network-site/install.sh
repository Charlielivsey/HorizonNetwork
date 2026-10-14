#!/usr/bin/env bash
# Install the dedicated Horizon Network website and its narrow staff leadership integration.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=horizon-network.co.uk
EMAIL="${1:-}"
APP_DIR=/opt/hn-network
DATA_DIR=/var/lib/hn-network
SSL_DIR=/etc/nginx/hn-network-ssl
CHALLENGE_DIR=/var/www/hn-network-acme
SITE=/etc/nginx/sites-available/hn-network
ENABLED=/etc/nginx/sites-enabled/hn-network
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
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
    if grep -Eq 'server_name[^;]*[[:space:]](www\.)?horizon-network\.co\.uk([[:space:];]|$)' "$config"; then
        echo "Another nginx configuration already serves $DOMAIN: $config. No site configuration changed."
        exit 1
    fi
done
# Install only the staff bridge files needed to read the selected public leadership records.
bash "$SCRIPT_DIR/../status-site/install-portal-sso.sh"

mkdir -p "$APP_DIR/public" "$DATA_DIR" "$SSL_DIR" "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
chmod 700 "$DATA_DIR"
cp "$SCRIPT_DIR/server.js" "$APP_DIR/"
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
            -addext "subjectAltName=DNS:$DOMAIN,DNS:www.$DOMAIN" -keyout "$SSL_DIR/selfsigned.key" -out "$SSL_DIR/selfsigned.crt" >/dev/null 2>&1
        chmod 600 "$SSL_DIR/selfsigned.key"
    fi
    ln -sfn "$SSL_DIR/selfsigned.crt" "$SSL_DIR/fullchain.pem"
    ln -sfn "$SSL_DIR/selfsigned.key" "$SSL_DIR/privkey.pem"
fi
# The direct www host can use its own trusted certificate when the root uses Cloudflare.
if [ -f "/etc/letsencrypt/live/www.$DOMAIN/fullchain.pem" ]; then
    ln -sfn "/etc/letsencrypt/live/www.$DOMAIN/fullchain.pem" "$SSL_DIR/www-fullchain.pem"
    ln -sfn "/etc/letsencrypt/live/www.$DOMAIN/privkey.pem" "$SSL_DIR/www-privkey.pem"
else
    ln -sfn "$SSL_DIR/fullchain.pem" "$SSL_DIR/www-fullchain.pem"
    ln -sfn "$SSL_DIR/privkey.pem" "$SSL_DIR/www-privkey.pem"
fi
# Keep a copy of this site's previous configuration for rollback if nginx validation fails.
BACKUP="$(mktemp -d)"
trap 'rm -rf "$BACKUP"' EXIT
[ ! -f "$SITE" ] || cp "$SITE" "$BACKUP/site"
WAS_ENABLED=0
[ ! -e "$ENABLED" ] || WAS_ENABLED=1
cp "$SCRIPT_DIR/nginx.conf" "$SITE"
if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
ln -sfn "$SITE" "$ENABLED"
if ! nginx -t; then
    if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
    [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
    echo 'nginx validation failed; the Horizon Network configuration was rolled back.'; exit 1
fi
systemctl reload nginx
HTTPS_OK=0
CERT_ARGS=()
if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
if [ -n "$EMAIL" ] || [ -d /etc/letsencrypt/accounts ]; then
    # Prefer a single trusted origin certificate. Do not repeatedly retry a known Cloudflare
    # validation failure on routine updates; NETWORK_REQUIRE_ORIGIN_CERT=1 retries it explicitly.
    if [ -f "$LE_DIR/fullchain.pem" ] || [ ! -f "/etc/letsencrypt/live/www.$DOMAIN/fullchain.pem" ] || [ "${NETWORK_REQUIRE_ORIGIN_CERT:-0}" = 1 ]; then
        if certbot certonly --webroot -w "$CHALLENGE_DIR" -d "$DOMAIN" -d "www.$DOMAIN" --cert-name "$DOMAIN" \
            --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
            --deploy-hook 'nginx -t && systemctl reload nginx'; then
            ln -sfn "$LE_DIR/fullchain.pem" "$SSL_DIR/fullchain.pem"
            ln -sfn "$LE_DIR/privkey.pem" "$SSL_DIR/privkey.pem"
            ln -sfn "$LE_DIR/fullchain.pem" "$SSL_DIR/www-fullchain.pem"
            ln -sfn "$LE_DIR/privkey.pem" "$SSL_DIR/www-privkey.pem"
            nginx -t && systemctl reload nginx
            HTTPS_OK=1
        fi
    fi
    if [ "$HTTPS_OK" != 1 ]; then
        # Cloudflare supplies the root domain's visitor certificate. Secure the directly routed
        # www host separately, and verify the root's real public HTTPS before accepting this mode.
        if certbot certonly --webroot -w "$CHALLENGE_DIR" -d "www.$DOMAIN" --cert-name "www.$DOMAIN" \
            --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
            --deploy-hook 'nginx -t && systemctl reload nginx'; then
            ln -sfn "/etc/letsencrypt/live/www.$DOMAIN/fullchain.pem" "$SSL_DIR/www-fullchain.pem"
            ln -sfn "/etc/letsencrypt/live/www.$DOMAIN/privkey.pem" "$SSL_DIR/www-privkey.pem"
            nginx -t && systemctl reload nginx
            if curl -fsS --max-time 15 -I "https://$DOMAIN/" | grep -qi '^cf-ray:' && \
               curl -fsS --max-time 15 -I "https://www.$DOMAIN/" >/dev/null; then
                HTTPS_OK=1
                echo 'Public HTTPS verified: root via Cloudflare; www via Let’s Encrypt.'
                echo 'The root origin still uses a temporary self-signed certificate. Cloudflare Full (strict) requires fixing root ACME validation and rerunning with NETWORK_REQUIRE_ORIGIN_CERT=1.'
            fi
        fi
    fi
else
    echo 'First SSL registration needs an email: sudo bash horizon-network-site/install.sh you@hngroup.org.uk'
fi
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q certbot.timer; then
    systemctl enable --now certbot.timer
fi
echo "Horizon Network: https://$DOMAIN"
echo 'PM2 process: hn-network (port 3600, loopback only)'
echo 'Live Network Leadership profiles from selected staff records.'
if [ "$HTTPS_OK" != 1 ]; then
    echo 'Trusted public HTTPS could not be verified. Check root and www DNS/Cloudflare settings, then rerun.'
    exit 1
fi

# Add the requested extra domain without changing the primary virtual host.
bash "$SCRIPT_DIR/install-alias.sh" "$EMAIL"
