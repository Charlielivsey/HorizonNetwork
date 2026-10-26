#!/usr/bin/env bash
# Isolated HN Group Docs site (docs.hngroup.org.uk, staff only). Keeps its data (/var/lib/hn-docs) and every other service.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=docs.hngroup.org.uk
EMAIL="${1:-}"
SITE=/etc/nginx/sites-available/hn-docs
ENABLED=/etc/nginx/sites-enabled/hn-docs
CHALLENGE_DIR=/var/www/hn-docs-acme
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
for tool in node pm2 nginx certbot curl python3 openssl; do command -v "$tool" >/dev/null || { echo "Required tool missing: $tool"; exit 1; }; done
for file in server.js lib/store.js lib/auth.js lib/catalog.js lib/sanitize.js lib/pdf.js public/assets/documents.js; do node --check "$SCRIPT_DIR/$file"; done
if python3 -c 'import socket;s=socket.socket();s.settimeout(2);exit(s.connect_ex(("127.0.0.1",4500)))'; then
    pm2 describe hn-docs >/dev/null 2>&1 || { echo 'Port 4500 belongs to another service. No changes made.'; exit 1; }
fi
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = "$ENABLED" ] && continue
    if grep -Eq 'server_name[^;]*[[:space:]]docs\.hngroup\.org\.uk([[:space:];]|$)' "$config"; then
        echo "Another host serves $DOMAIN: $config. No changes made."; exit 1
    fi
done
# docs.hngroup.org.uk used to be the public help-article site (website-suite, also PM2 hn-docs on 4500). The
# user replaced it with HN Group Docs on 26 October 2026: stop the old process once and keep its articles in a
# private archive next to the new data (nothing is deleted).
if [ -f /opt/hn-docs/config.json ]; then
    pm2 delete hn-docs >/dev/null 2>&1 || true
    STAMP=$(date +%Y%m%d-%H%M%S)
    mkdir -p "/var/lib/hn-docs/old-help-site-$STAMP"
    find /var/lib/hn-docs -mindepth 1 -maxdepth 1 ! -name 'old-help-site-*' ! -name documents.json ! -name files ! -name avatars -exec mv {} "/var/lib/hn-docs/old-help-site-$STAMP/" \;
    rm -rf /opt/hn-docs
    echo "Retired the old docs help-article site; its data is kept in /var/lib/hn-docs/old-help-site-$STAMP."
fi
mkdir -p /var/lib/hn-docs /opt/hn-docs "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
chmod 700 /var/lib/hn-docs
rm -rf /opt/hn-docs/lib /opt/hn-docs/public /opt/hn-docs/seed
cp "$SCRIPT_DIR/server.js" /opt/hn-docs/server.js
cp -r "$SCRIPT_DIR/lib" "$SCRIPT_DIR/public" "$SCRIPT_DIR/seed" /opt/hn-docs/
pm2 startOrRestart "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do
    if curl -fsS --max-time 2 http://127.0.0.1:4500/healthz >/dev/null; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" = 1 ] || { echo 'Docs did not start (see: pm2 logs hn-docs). Nginx was left unchanged.'; exit 1; }
if ! grep -q "docs: { name: 'HN Group Docs'" /opt/hn-auth/server.js 2>/dev/null; then
    echo 'Note: HN Group Auth does not know HN Group Docs yet, so staff cannot sign in. Run: sudo bash auth-site/install.sh'
fi
[ -f /var/lib/hn-status-sso/secret ] || echo "Note: HN Group Auth isn’t integrated on this server yet, so signing in to Docs won’t work until auth-site/install.sh has run."
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
p=Path(sys.argv[1]);s=p.read_text();s=s[:s.index('    location / {')]+'    location / { return 301 https://docs.hngroup.org.uk$request_uri; }\n}\n';p.write_text(s)
PYCONF
        cat "$SCRIPT_DIR/nginx-https.conf" >> "$SITE"
    fi
    if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
    ln -sfn "$SITE" "$ENABLED"
    if ! nginx -t; then
        if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
        [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
        echo 'Docs nginx configuration rolled back.'; exit 1
    fi
    systemctl reload nginx
}
write_config
# Website control may not know this site until admin-site/install.sh runs (install.sh runs it last).
if [ -f /opt/hn-admin/reconcile-power.cjs ]; then node /opt/hn-admin/reconcile-power.cjs docs 2>/dev/null || echo "Note: website control will pick up the docs site when admin-site/install.sh runs."; fi
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
    echo 'Docs installed and running in PM2. Public DNS and SSL are pending.'
    echo 'Add A docs -> 217.154.34.205 (DNS only) in the hngroup.org.uk DNS zone.'
    echo 'Then rerun: sudo bash docs-site/install.sh'
    exit 0
fi
CERT_ARGS=()
if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
certbot certonly --webroot -w "$CHALLENGE_DIR" -d "$DOMAIN" --cert-name "$DOMAIN" \
    --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
    --deploy-hook 'nginx -t && systemctl reload nginx' || { echo 'SSL issuance failed. Check DNS and rerun: sudo bash docs-site/install.sh'; exit 1; }
write_config
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q certbot.timer; then systemctl enable --now certbot.timer; fi
echo 'HN Group Docs installed with HTTPS: https://docs.hngroup.org.uk · PM2 hn-docs · port 4500 · staff sign in through HN Group Auth.'
