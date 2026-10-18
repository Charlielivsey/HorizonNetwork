#!/usr/bin/env bash
# Install central website control. Never execute shutdown or maintenance actions during installation.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOMAIN=admin.hngroup.org.uk
EMAIL="${1:-}"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
for tool in node pm2 nginx certbot curl python3 openssl; do command -v "$tool" >/dev/null || { echo "Required tool missing: $tool"; exit 1; }; done
nginx -V 2>&1 | grep -q http_auth_request_module || { echo 'nginx must include http_auth_request_module.'; exit 1; }
for file in "$SCRIPT_DIR/server.js" "$SCRIPT_DIR"/lib/*.js "$SCRIPT_DIR"/*.cjs "$SCRIPT_DIR/public/app.js" "$SCRIPT_DIR/public/login.js" "$SCRIPT_DIR/accounts-server.js" "$ROOT/auth-site/supervisor.js" "$ROOT/staff-portal/public-proxy.js"; do node --check "$file"; done
if python3 -c 'import socket;s=socket.socket();exit(s.connect_ex(("127.0.0.1",4700)))'; then pm2 describe hn-admin >/dev/null 2>&1 || { echo 'Port 4700 belongs to another application.'; exit 1; }; fi
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = /etc/nginx/sites-enabled/hn-admin ] && continue
    if grep -Eq 'server_name[^;]*[[:space:]]admin\.hngroup\.org\.uk([[:space:];]|$)' "$config"; then echo "Another configuration already serves $DOMAIN: $config"; exit 1; fi
done
mkdir -p /opt/hn-admin /var/lib/hn-control /var/lib/hn-auth /var/www/hn-admin-acme/.well-known/acme-challenge /etc/nginx/hn-control/enabled
chmod 700 /var/lib/hn-control /var/lib/hn-auth
if [ ! -s /var/lib/hn-control/edge-secret ]; then (umask 077; openssl rand -hex 32 > /var/lib/hn-control/edge-secret); fi
cp "$SCRIPT_DIR/server.js" "$SCRIPT_DIR/accounts-server.js" "$SCRIPT_DIR/catalog.json" "$SCRIPT_DIR/write-gates.cjs" "$SCRIPT_DIR/reconcile-power.cjs" "$SCRIPT_DIR/integrate-nginx.py" /opt/hn-admin/
cp -r "$SCRIPT_DIR/lib" "$SCRIPT_DIR/public" /opt/hn-admin/
node "$SCRIPT_DIR/import-legacy.cjs"
pm2 startOrRestart "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do if curl -fsS --max-time 2 http://127.0.0.1:4700/healthz >/dev/null; then healthy=1; break; fi; sleep 1; done
[ "$healthy" = 1 ] || { echo 'Website control failed to start. nginx was left unchanged.'; exit 1; }
# Back up all touched nginx files before adding only the known hosts' gate includes.
BACKUP="$(mktemp -d /var/lib/hn-control/nginx-backup-XXXXXX)"
cp -a /etc/nginx/sites-available "$BACKUP/"
cp -a /etc/nginx/snippets "$BACKUP/"
cp -a /etc/nginx/hn-control/enabled "$BACKUP/gates"
node "$SCRIPT_DIR/write-gates.cjs"
python3 "$SCRIPT_DIR/integrate-nginx.py"
cp "$SCRIPT_DIR/nginx-http.conf" /etc/nginx/sites-available/hn-admin
write_admin_https() {
    python3 - "$SCRIPT_DIR/nginx-http.conf" <<'PY'
from pathlib import Path
import sys
p=Path('/etc/nginx/sites-available/hn-admin');s=Path(sys.argv[1]).read_text();s=s[:s.index('    location / {')]+'    location / { return 301 https://admin.hngroup.org.uk$request_uri; }\n}\n';p.write_text(s)
PY
    cat "$SCRIPT_DIR/nginx-https.conf" >> /etc/nginx/sites-available/hn-admin
}
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then write_admin_https; else
    python3 - <<'PYHTTP'
from pathlib import Path
p=Path('/etc/nginx/sites-available/hn-admin');s=p.read_text();s=s[:s.index('    location / {')]+"    location / { default_type text/plain; return 503 'Website control is awaiting its HTTPS certificate.'; }\n}\n";p.write_text(s)
PYHTTP
fi
if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' /etc/nginx/sites-available/hn-admin; fi
ln -sfn /etc/nginx/sites-available/hn-admin /etc/nginx/sites-enabled/hn-admin
if ! nginx -t; then
    cp -a "$BACKUP/sites-available/." /etc/nginx/sites-available/
    cp -a "$BACKUP/snippets/." /etc/nginx/snippets/
    python3 - <<'PY'
from pathlib import Path
for p in Path('/etc/nginx/hn-control/enabled').glob('*-gate.conf'):p.unlink()
if not Path('/etc/nginx/sites-available/hn-admin').exists():Path('/etc/nginx/sites-enabled/hn-admin').unlink(missing_ok=True)
PY
    cp -a "$BACKUP/gates/." /etc/nginx/hn-control/enabled/
    echo "nginx integration failed. Existing files restored from $BACKUP."; exit 1
fi
systemctl reload nginx
# These narrowly scoped staff files make central maintenance authoritative, with one account writer.
cp "$ROOT/staff-portal/lib/store.js" /opt/hn-staff-portal/lib/store.js
cp "$ROOT/staff-portal/public/assets/app.js" /opt/hn-staff-portal/public/assets/app.js
cp "$ROOT/staff-portal/public-proxy.js" /opt/hn-staff-portal/public-proxy.js
if ! pm2 describe hn-auth >/dev/null 2>&1; then bash "$ROOT/auth-site/install.sh" "$EMAIL"; fi
mkdir -p /opt/hn-auth
cp "$ROOT/auth-site/server.js" "$ROOT/auth-site/native.js" "$ROOT/auth-site/supervisor.js" /opt/hn-auth/
python3 "$SCRIPT_DIR/install-accounts.py"
bash "$ROOT/auth-site/install.sh" "$EMAIL"
printf '1\n' > /var/lib/hn-control/enabled
for folder in hngroup-site horizon-network-site; do
    if [ "$folder" = hngroup-site ]; then APP=hn-website; else APP=hn-network; fi
    changed=0
    for relative in server.js control/app.js; do
        if ! cmp -s "$ROOT/$folder/$relative" "/opt/$APP/$relative"; then
            cp "$ROOT/$folder/$relative" "/opt/$APP/$relative"
            changed=1
        fi
    done
    if [ "$changed" = 1 ] && pm2 jlist | python3 -c 'import json,sys;sys.exit(0 if any(a["name"]==sys.argv[1] and a["pm2_env"]["status"]=="online" for a in json.load(sys.stdin)) else 1)' "$APP"; then
        pm2 startOrRestart "$ROOT/$folder/ecosystem.config.cjs" --update-env
    fi
done
if [ -f /opt/hn-links/public/index.html ]; then cp "$ROOT/links-site/public/index.html" /opt/hn-links/public/index.html; fi
pm2 save
systemctl enable pm2-root >/dev/null
if ! getent ahosts "$DOMAIN" >/dev/null 2>&1 && ! dig @1.1.1.1 +time=2 +tries=1 +short A "$DOMAIN" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
    echo 'Website control is installed in PM2. Add A admin -> 217.154.34.205 (DNS only), then rerun this installer for trusted SSL.'
    exit 0
fi
CERT_ARGS=(); if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
certbot certonly --webroot -w /var/www/hn-admin-acme -d "$DOMAIN" --cert-name "$DOMAIN" --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" --deploy-hook 'nginx -t && systemctl reload nginx'
write_admin_https
if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' /etc/nginx/sites-available/hn-admin; fi
nginx -t && systemctl reload nginx
systemctl enable --now certbot.timer >/dev/null
echo 'Website control installed with HTTPS: https://admin.hngroup.org.uk · PM2 hn-admin · port 4700'
echo 'Access: system owner and owner-level accounts, Charlie’s permanent grant, and the saved panel ACL. Existing availability and audit history were preserved.'
