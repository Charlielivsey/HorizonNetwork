#!/usr/bin/env bash
# Isolated public download site. Preserve cached release metadata and other services.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=downloads.hngroup.org.uk
EMAIL="${1:-}"
SITE=/etc/nginx/sites-available/hn-downloads
ENABLED=/etc/nginx/sites-enabled/hn-downloads
CHALLENGE_DIR=/var/www/hn-downloads-acme
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
for tool in node pm2 nginx certbot curl python3 openssl; do command -v "$tool" >/dev/null || { echo "Required tool missing: $tool"; exit 1; }; done
for file in server.js lib/releases.js lib/apps.js public/app.js; do node --check "$SCRIPT_DIR/$file"; done
if python3 -c 'import socket;s=socket.socket();s.settimeout(2);exit(s.connect_ex(("127.0.0.1",5100)))'; then
    pm2 describe hn-downloads >/dev/null 2>&1 || { echo 'Port 5100 belongs to another service. No changes made.'; exit 1; }
fi
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = "$ENABLED" ] && continue
    if grep -Eq 'server_name[^;]*[[:space:]]downloads\.hngroup\.org\.uk([[:space:];]|$)' "$config"; then
        echo "Another host serves $DOMAIN: $config. No changes made."; exit 1
    fi
done
mkdir -p /var/lib/hn-downloads /opt/hn-downloads "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
chmod 700 /var/lib/hn-downloads
rm -rf /opt/hn-downloads/lib /opt/hn-downloads/public
cp "$SCRIPT_DIR/server.js" /opt/hn-downloads/server.js
cp -r "$SCRIPT_DIR/lib" "$SCRIPT_DIR/public" /opt/hn-downloads/
# The latest browser release CI recorded, so the site is current even before it reaches GitHub.
[ ! -f "$SCRIPT_DIR/release.json" ] || cp "$SCRIPT_DIR/release.json" /opt/hn-downloads/release.json
[ ! -f "$SCRIPT_DIR/secure-network.json" ] || cp "$SCRIPT_DIR/secure-network.json" /opt/hn-downloads/secure-network.json
for manifest in secure-network-windows.json app-manager-mac.json app-manager-windows.json; do
    [ ! -f "$SCRIPT_DIR/$manifest" ] || cp "$SCRIPT_DIR/$manifest" /opt/hn-downloads/
done
pm2 startOrRestart "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do
    if curl -fsS --max-time 2 http://127.0.0.1:5100/healthz >/dev/null; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" = 1 ] || { echo 'Downloads did not start (see: pm2 logs hn-downloads). Nginx was left unchanged.'; exit 1; }
SERVING="$(curl -fsS --max-time 30 http://127.0.0.1:5100/api/releases | python3 -c 'import sys,json;r=json.load(sys.stdin).get("release");print(r["version"] if r else "none")' 2>/dev/null || echo unknown)"
echo "Downloads is offering HN Browser $SERVING."
curl -fsS --max-time 5 http://127.0.0.1:5100/healthz | python3 -c 'import sys,json;s=json.load(sys.stdin).get("release",{});print("  Source: "+str(s.get("source"))+("; problems: "+"; ".join(s["problems"]) if s.get("problems") else ""))' 2>/dev/null || true
BACKUP="$(mktemp -d)"
trap 'rm -rf "$BACKUP"' EXIT
[ ! -f "$SITE" ] || cp "$SITE" "$BACKUP/site"
WAS_ENABLED=0
[ ! -e "$ENABLED" ] || WAS_ENABLED=1
write_config() {
    cp "$SCRIPT_DIR/nginx-http.conf" "$SITE"
    if [ -f "$LE_DIR/fullchain.pem" ]; then
        python3 - "$SITE" <<'PYCONF'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text();s=s[:s.index('    location / {')]+'    location / { return 301 https://downloads.hngroup.org.uk$request_uri; }\n}\n';p.write_text(s)
PYCONF
        cat "$SCRIPT_DIR/nginx-https.conf" >> "$SITE"
    fi
    if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
    ln -sfn "$SITE" "$ENABLED"
    if ! nginx -t; then
        if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
        [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
        echo 'Downloads nginx configuration rolled back.'; exit 1
    fi
    systemctl reload nginx
}
write_config
# Website control may not know this site until admin-site/install.sh runs (install.sh runs it last).
if [ -f /opt/hn-admin/reconcile-power.cjs ]; then node /opt/hn-admin/reconcile-power.cjs downloads 2>/dev/null || echo "Note: website control will pick up the downloads site when admin-site/install.sh runs."; fi
pm2 save
if [ ! -f /etc/systemd/system/pm2-root.service ]; then pm2 startup systemd -u root --hp /root; fi
systemctl enable pm2-root >/dev/null
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

if ! has_web_dns "$DOMAIN"; then
    echo 'Downloads installed and running in PM2. Public DNS and SSL are pending.'
    echo 'Add A downloads -> 217.154.34.205 (DNS only) in the hngroup.org.uk DNS zone.'
    echo 'Then rerun: sudo bash downloads-site/install.sh'
    exit 0
fi
CERT_ARGS=()
if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
certbot certonly --webroot -w "$CHALLENGE_DIR" -d "$DOMAIN" --cert-name "$DOMAIN" \
    --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
    --deploy-hook 'nginx -t && systemctl reload nginx' || { echo 'SSL issuance failed. Check DNS and rerun: sudo bash downloads-site/install.sh'; exit 1; }
write_config
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q certbot.timer; then systemctl enable --now certbot.timer; fi
echo 'HN Group downloads installed with HTTPS: https://downloads.hngroup.org.uk · PM2 hn-downloads · port 5100 · public downloads.'
