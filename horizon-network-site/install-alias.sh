#!/usr/bin/env bash
# Keep horizonetwork.com (a former Horizon Network address) redirecting to network.hngroup.org.uk; no service restart or other host edits.
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
p=Path(sys.argv[1]);s=p.read_text();start=s.index('    location / {');s=s[:start]+'    location / { return 301 https://network.hngroup.org.uk$request_uri; }\n}\n';p.write_text(s)
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
# A newly created record can be visible publicly while the VPS caches its old negative answer.
# Consult independent public resolvers before deciding that DNS is missing. Never change system DNS.
has_web_dns() {
    if getent ahosts "$1" >/dev/null 2>&1; then return 0; fi
    if command -v dig >/dev/null 2>&1; then
        local resolver answers
        for resolver in 1.1.1.1 8.8.8.8; do
            answers="$(dig @"$resolver" +time=2 +tries=1 +short "$1" A 2>/dev/null || true)
$(dig @"$resolver" +time=2 +tries=1 +short "$1" AAAA 2>/dev/null || true)"
            if printf '%s\n' "$answers" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9a-fA-F:]*:[0-9a-fA-F:]+$'; then
                echo "Public DNS resolves $1; ignoring the stale local DNS result." >&2
                return 0
            fi
        done
    else
        # Standard-library fallback for hosts without the optional dig command.
        if python3 - "$1" <<'PYDNS'
import json,sys,urllib.request,ipaddress
for domain_type in ('A','AAAA'):
    try:
        url='https://dns.google/resolve?name='+sys.argv[1]+'&type='+domain_type
        with urllib.request.urlopen(url,timeout=5) as response: value=json.load(response)
        for record in value.get('Answer',[]):
            if record.get('type') not in (1,28): continue
            ipaddress.ip_address(record['data'])
            sys.exit(0)
    except Exception:
        pass
sys.exit(1)
PYDNS
        then
            echo "Public DNS resolves $1; ignoring the stale local DNS result." >&2
            return 0
        fi
    fi
    return 1
}
# DNS can be created after the host is prepared. Do not attempt ACME for absent names.
if ! has_web_dns "$DOMAIN"; then
    echo 'Hosting prepared for horizonetwork.com; DNS and SSL are pending.'
    echo 'Add A @ -> 217.154.34.205 (and optionally A www -> 217.154.34.205).'
    echo 'Then rerun: sudo bash horizon-network-site/install-alias.sh'
    exit 0
fi
CERT_ARGS=()
if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
# www is optional: include it only when it resolves, so an absent www cannot block the root.
DOMAIN_ARGS=(-d "$DOMAIN")
if has_web_dns "www.$DOMAIN"; then DOMAIN_ARGS+=(-d "www.$DOMAIN"); fi
if certbot certonly --webroot -w "$CHALLENGE_DIR" "${DOMAIN_ARGS[@]}" --cert-name "$DOMAIN" \
    --non-interactive --agree-tos --keep-until-expiring --expand "${CERT_ARGS[@]}" \
    --deploy-hook 'nginx -t && systemctl reload nginx'; then
    write_config
else
    echo 'Alias hosting is prepared, but trusted SSL could not be issued. Check the alias DNS and rerun.'; exit 1
fi
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q certbot.timer; then systemctl enable --now certbot.timer; fi
echo 'https://horizonetwork.com redirects to https://network.hngroup.org.uk.'
