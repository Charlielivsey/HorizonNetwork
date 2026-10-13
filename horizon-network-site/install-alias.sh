#!/usr/bin/env bash
# Add horizonetwork.com to the existing Horizon Network service; no service restart or other host edits.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=horizonetwork.com
EMAIL="${1:-}"
SITE=/etc/nginx/sites-available/hn-network-com
ENABLED=/etc/nginx/sites-enabled/hn-network-com
CHALLENGE_DIR=/var/www/hn-network-com-acme
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
pm2 describe hn-network >/dev/null 2>&1 && curl -fsS --max-time 3 http://127.0.0.1:3600/healthz >/dev/null || {
    echo 'Install the existing Horizon Network service first: sudo bash horizon-network-site/install.sh'; exit 1;
}
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = "$ENABLED" ] && continue
    if grep -Eq 'server_name[^;]*[[:space:]](www\.)?horizonetwork\.com([[:space:];]|$)' "$config"; then
        echo "Another host already serves $DOMAIN: $config. No changes made."; exit 1
    fi
done
mkdir -p "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
BACKUP="$(mktemp -d)"
trap 'rm -rf "$BACKUP"' EXIT
[ ! -f "$SITE" ] || cp "$SITE" "$BACKUP/site"
WAS_ENABLED=0
[ ! -e "$ENABLED" ] || WAS_ENABLED=1
write_config() {
    cp "$SCRIPT_DIR/nginx-alias-http.conf" "$SITE"
    if [ -f "$LE_DIR/fullchain.pem" ]; then
        # HTTP redirects to HTTPS once a trusted certificate exists.
        python3 - "$SITE" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text();start=s.index('    location / {');s=s[:start]+'    location / { return 301 https://horizonetwork.com$request_uri; }\n}\n';p.write_text(s)
PY
        if openssl x509 -in "$LE_DIR/fullchain.pem" -noout -ext subjectAltName | grep -q 'DNS:www.horizonetwork.com'; then
            cat "$SCRIPT_DIR/nginx-alias-https.conf" >> "$SITE"
        else
            sed 's/server_name horizonetwork.com www.horizonetwork.com;/server_name horizonetwork.com;/' "$SCRIPT_DIR/nginx-alias-https.conf" >> "$SITE"
        fi
    fi
    if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
    ln -sfn "$SITE" "$ENABLED"
    if ! nginx -t; then
        if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
        [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
        echo 'Alias configuration restored after nginx validation failed.'; exit 1
    fi
    systemctl reload nginx
}
write_config
# DNS can be created after the host is prepared. Do not attempt ACME for absent names.
if ! getent ahosts "$DOMAIN" >/dev/null 2>&1; then
    echo 'Hosting prepared for horizonetwork.com; DNS and SSL are pending.'
    echo 'Add A @ -> 217.154.34.205 (and optionally A www -> 217.154.34.205).'
    echo 'Then rerun: sudo bash horizon-network-site/install-alias.sh'
    exit 0
fi
CERT_ARGS=()
if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
# www is optional: include it only when it resolves, so an absent www cannot block the root.
DOMAIN_ARGS=(-d "$DOMAIN")
if getent ahosts "www.$DOMAIN" >/dev/null 2>&1; then DOMAIN_ARGS+=(-d "www.$DOMAIN"); fi
if certbot certonly --webroot -w "$CHALLENGE_DIR" "${DOMAIN_ARGS[@]}" --cert-name "$DOMAIN" \
    --non-interactive --agree-tos --keep-until-expiring --expand "${CERT_ARGS[@]}" \
    --deploy-hook 'nginx -t && systemctl reload nginx'; then
    write_config
else
    echo 'Alias hosting is prepared, but trusted SSL could not be issued. Check the alias DNS and rerun.'; exit 1
fi
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q certbot.timer; then systemctl enable --now certbot.timer; fi
echo 'Horizon Network is also hosted at https://horizonetwork.com using the existing hn-network PM2 service.'
