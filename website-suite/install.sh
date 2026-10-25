#!/usr/bin/env bash
# Installs one named site only. Runtime, data, nginx host and certificate remain isolated.
set -euo pipefail
SOURCE="$(cd "$1" && pwd)"
SHARED="$(cd "$(dirname "$0")" && pwd)"
EMAIL="${2:-}"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
read -r SLUG DOMAIN PORT < <(python3 - "$SOURCE/config.json" <<'PY'
import json,re,sys
c=json.load(open(sys.argv[1]))
assert re.fullmatch(r'[a-z]+',c['id']) and c['domain']==c['id']+'.hngroup.org.uk' and 3900<=c['port']<=4600
print(c['id'],c['domain'],c['port'])
PY
)
APP="hn-$SLUG"
SITE="/etc/nginx/sites-available/$APP"
ENABLED="/etc/nginx/sites-enabled/$APP"
CHALLENGE_DIR="/var/www/$APP-acme"
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
for tool in node pm2 nginx certbot curl python3 openssl; do command -v "$tool" >/dev/null || { echo "Required tool missing: $tool"; exit 1; }; done
node --check "$SHARED/server.js"
node --check "$SHARED/public/app.js"
node --check "$SOURCE/auth.js"
if python3 -c "import socket;s=socket.socket();s.settimeout(2);exit(s.connect_ex(('127.0.0.1',$PORT)))"; then
    pm2 describe "$APP" >/dev/null 2>&1 || { echo "Port $PORT belongs to another service. No changes made."; exit 1; }
fi
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = "$ENABLED" ] && continue
    if python3 - "$config" "$DOMAIN" <<'PY'
import re,sys
s=open(sys.argv[1]).read()
s=re.sub(r'#.*','',s)
sys.exit(0 if any(sys.argv[2] in m.split() for m in re.findall(r'\bserver_name\s+([^;]+);',s)) else 1)
PY
    then echo "Another host serves $DOMAIN: $config. No changes made."; exit 1; fi
done
mkdir -p "/opt/$APP/public" "/var/lib/$APP" "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
chmod 700 "/var/lib/$APP"
cp "$SHARED/server.js" "$SOURCE/auth.js" "$SOURCE/config.json" "/opt/$APP/"
cp -r "$SHARED/public/." "/opt/$APP/public/"
cp -r "$SOURCE/public/." "/opt/$APP/public/"
# Announcements shipped with the site (News only) are published once by the server.
if [ -d "$SOURCE/announcements" ]; then rm -rf "/opt/$APP/announcements"; cp -r "$SOURCE/announcements" "/opt/$APP/announcements"; fi
# Seeds are additive only: never overwrite articles edited in the admin panel.
if [ -f "$SOURCE/seed.json" ]; then
    node "$SHARED/seed.cjs" "$SOURCE/seed.json" "/var/lib/$APP/records.json"
fi
pm2 startOrRestart "$SOURCE/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do
    if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/healthz" >/dev/null; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" = 1 ] || { echo "$APP did not start. Nginx was left unchanged."; exit 1; }
BACKUP="$(mktemp -d)"
trap 'rm -rf "$BACKUP"' EXIT
[ ! -f "$SITE" ] || cp "$SITE" "$BACKUP/site"
WAS_ENABLED=0
[ ! -e "$ENABLED" ] || WAS_ENABLED=1
write_config() {
    cp "$SOURCE/nginx-http.conf" "$SITE"
    if [ -f "$LE_DIR/fullchain.pem" ]; then
        python3 - "$SITE" "$DOMAIN" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text();s=s[:s.index('    location / {')]+'    location / { return 301 https://'+sys.argv[2]+'$request_uri; }\n}\n';p.write_text(s)
PY
        cat "$SOURCE/nginx-https.conf" >> "$SITE"
    else
        python3 - "$SITE" <<'PYHTTP'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text();s=s[:s.index('    location / {')]+"    location / { default_type text/plain; return 503 'This website is awaiting its HTTPS certificate. Please try again after setup is complete.'; }\n}\n";p.write_text(s)
PYHTTP
    fi
    if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
    ln -sfn "$SITE" "$ENABLED"
    if ! nginx -t; then
        if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
        [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
        echo "$APP nginx configuration rolled back."; exit 1
    fi
    systemctl reload nginx
}
write_config
if [ -f /opt/hn-admin/reconcile-power.cjs ]; then node /opt/hn-admin/reconcile-power.cjs "$SLUG"; fi
pm2 save
if [ ! -f /etc/systemd/system/pm2-root.service ]; then pm2 startup systemd -u root --hp /root; fi
systemctl enable pm2-root >/dev/null
has_origin_dns() {
    python3 - "$DOMAIN" <<'PY'
import json,sys,urllib.request,ipaddress,socket,subprocess,shutil
answers=[]
try:
    with urllib.request.urlopen('https://dns.google/resolve?name='+sys.argv[1]+'&type=A',timeout=8) as r:
        answers=[a['data'] for a in json.load(r).get('Answer',[]) if a.get('type')==1]
except Exception: pass
# Recently added records can remain negatively cached at one resolver.
if not answers and shutil.which('dig'):
    for resolver in ('1.1.1.1','8.8.8.8'):
        try:
            result=subprocess.run(['dig','@'+resolver,'+time=2','+tries=1','+short',sys.argv[1],'A'],capture_output=True,text=True,timeout=4)
            for value in result.stdout.splitlines():
                try: ipaddress.IPv4Address(value);answers.append(value)
                except ValueError: pass
            if answers: break
        except Exception: pass
if not answers:
    try: answers=socket.gethostbyname_ex(sys.argv[1])[2]
    except Exception: pass
# Accept direct origin and Cloudflare proxied records; ACME checks actual routing.
sys.exit(0 if answers else 1)
PY
}
if ! has_origin_dns; then
    echo "$DOMAIN: PM2 and HTTP host installed; DNS and trusted SSL pending."
    echo "Add A $SLUG -> 217.154.34.205, then rerun: sudo bash $SLUG-site/install.sh"
    exit 0
fi
CERT_ARGS=()
if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
certbot certonly --webroot -w "$CHALLENGE_DIR" -d "$DOMAIN" --cert-name "$DOMAIN" \
    --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
    --deploy-hook 'nginx -t && systemctl reload nginx' || { echo "SSL issuance failed for $DOMAIN. Check DNS and rerun this installer."; exit 1; }
write_config
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q certbot.timer; then systemctl enable --now certbot.timer; fi
echo "Installed https://$DOMAIN · PM2 $APP · loopback port $PORT"
