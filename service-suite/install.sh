#!/usr/bin/env bash
# Installs or updates ONE service website: its runtime in /opt/hn-<id>, PM2 process hn-<id>,
# nginx host (primary + alias redirect) and Let's Encrypt certificate. Data in /var/lib/hn-<id>
# is never removed or overwritten. Other websites, PM2 processes and nginx hosts are untouched.
set -euo pipefail
SOURCE="$(cd "$1" && pwd)"
SHARED="$(cd "$(dirname "$0")" && pwd)"
EMAIL="${2:-}"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
read -r SLUG DOMAIN PORT ALIAS < <(python3 - "$SOURCE/config.json" <<'PY'
import json,re,sys
c=json.load(open(sys.argv[1]))
host=re.compile(r'^[a-z0-9-]+(\.[a-z0-9-]+)+$')
assert c.get('engine')=='service-suite' and re.fullmatch(r'[a-z]{2,20}',c['id']) and host.fullmatch(c['domain']) and 4800<=c['port']<=5200 and c['port']!=5000
aliases=c.get('aliases') or []
assert len(aliases)<=1 and all(host.fullmatch(a) for a in aliases)
print(c['id'],c['domain'],c['port'],aliases[0] if aliases else '-')
PY
)
[ "$ALIAS" = - ] && ALIAS=""
APP="hn-$SLUG"
SITE="/etc/nginx/sites-available/$APP"
ENABLED="/etc/nginx/sites-enabled/$APP"
CHALLENGE_DIR="/var/www/$APP-acme"
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
for tool in node pm2 nginx certbot curl python3 openssl; do command -v "$tool" >/dev/null || { echo "Required tool missing: $tool"; exit 1; }; done
for file in "$SHARED/server.js" "$SHARED"/lib/*.js "$SHARED/public/app.js" "$SHARED/public/tools.js"; do node --check "$file"; done
# Refuse to take a port that belongs to another program.
if python3 -c "import socket;s=socket.socket();s.settimeout(2);exit(s.connect_ex(('127.0.0.1',$PORT)))"; then
    pm2 describe "$APP" >/dev/null 2>&1 || { echo "Port $PORT belongs to another service. $APP was not installed."; exit 1; }
fi
# Refuse to install if another nginx host already serves one of these names.
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$(readlink -f "$config")" = "$(readlink -f "$SITE" 2>/dev/null || echo none)" ] && continue
    for name in "$DOMAIN" $ALIAS; do
        if python3 - "$config" "$name" <<'PY'
import re,sys
s=re.sub(r'#.*','',open(sys.argv[1]).read())
sys.exit(0 if any(sys.argv[2] in m.split() for m in re.findall(r'\bserver_name\s+([^;]+);',s)) else 1)
PY
        then echo "Another nginx host serves $name: $config. $APP was not installed."; exit 1; fi
    done
done
# Gentle capacity check: warn (do not fail) when memory is tight.
AVAILABLE_MB=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
if [ "${AVAILABLE_MB:-0}" -lt 150 ]; then echo "Warning: only ${AVAILABLE_MB} MB of memory is available. $APP needs about 60–100 MB."; fi

mkdir -p "/opt/$APP/public" "/opt/$APP/lib" "/var/lib/$APP" "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
chmod 700 "/var/lib/$APP"
cp "$SHARED/server.js" "$SOURCE/config.json" "/opt/$APP/"
cp "$SHARED"/lib/*.js "/opt/$APP/lib/"
cp -r "$SHARED/public/." "/opt/$APP/public/"
cp -r "$SOURCE/public/." "/opt/$APP/public/"
pm2 startOrRestart "$SOURCE/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..20}; do
    if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/healthz" >/dev/null; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" = 1 ] || { echo "$APP did not start (see: pm2 logs $APP). nginx was left unchanged."; exit 1; }

BACKUP="$(mktemp -d)"
trap 'rm -rf "$BACKUP"' EXIT
[ ! -f "$SITE" ] || cp "$SITE" "$BACKUP/site"
WAS_ENABLED=0
[ ! -e "$ENABLED" ] || WAS_ENABLED=1
cert_covers() { [ -f "$LE_DIR/fullchain.pem" ] && openssl x509 -in "$LE_DIR/fullchain.pem" -noout -ext subjectAltName 2>/dev/null | grep -q "DNS:$1\b"; }
write_config() {
    IPV6=""; if [ ! -s /proc/net/if_inet6 ]; then IPV6="--no-ipv6"; fi
    if cert_covers "$DOMAIN"; then
        ALIAS_FLAG=""; if [ -n "$ALIAS" ] && cert_covers "$ALIAS"; then ALIAS_FLAG="--alias"; fi
        python3 "$SHARED/nginx-compose.py" "$SOURCE" https $ALIAS_FLAG $IPV6 > "$SITE"
    else
        python3 "$SHARED/nginx-compose.py" "$SOURCE" pending $IPV6 > "$SITE"
    fi
    ln -sfn "$SITE" "$ENABLED"
    if ! nginx -t; then
        if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
        [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
        echo "$APP nginx configuration rolled back."; exit 1
    fi
    systemctl reload nginx
}
write_config
# Keep this website stopped if website control has it switched off (affects only this process).
if [ -f /opt/hn-admin/reconcile-power.cjs ]; then node /opt/hn-admin/reconcile-power.cjs "$SLUG" || echo "Website control does not list $SLUG yet; run admin-site/install.sh."; fi
pm2 save
if [ ! -f /etc/systemd/system/pm2-root.service ]; then pm2 startup systemd -u root --hp /root; fi
systemctl enable pm2-root >/dev/null

resolves() {
    python3 - "$1" <<'PY'
import json,sys,urllib.request,ipaddress,socket,subprocess,shutil
answers=[]
try:
    with urllib.request.urlopen('https://dns.google/resolve?name='+sys.argv[1]+'&type=A',timeout=8) as r:
        answers=[a['data'] for a in json.load(r).get('Answer',[]) if a.get('type')==1]
except Exception: pass
if not answers and shutil.which('dig'):
    for resolver in ('1.1.1.1','8.8.8.8'):
        try:
            out=subprocess.run(['dig','@'+resolver,'+time=2','+tries=1','+short',sys.argv[1],'A'],capture_output=True,text=True,timeout=4).stdout
            for v in out.splitlines():
                try: ipaddress.IPv4Address(v);answers.append(v)
                except ValueError: pass
            if answers: break
        except Exception: pass
if not answers:
    try: answers=socket.gethostbyname_ex(sys.argv[1])[2]
    except Exception: pass
sys.exit(0 if answers else 1)
PY
}
if ! resolves "$DOMAIN"; then
    echo "$DOMAIN: running in PM2 as $APP on port $PORT; DNS and trusted SSL pending. Add A ${DOMAIN} -> 217.154.34.205, then rerun this installer."
    exit 0
fi
NAMES=(-d "$DOMAIN")
if [ -n "$ALIAS" ]; then
    if resolves "$ALIAS"; then NAMES+=(-d "$ALIAS"); else echo "$ALIAS does not resolve yet; the certificate covers $DOMAIN only. Rerun once it resolves."; fi
fi
CERT_ARGS=()
if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
certbot certonly --webroot -w "$CHALLENGE_DIR" "${NAMES[@]}" --cert-name "$DOMAIN" --expand \
    --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
    --deploy-hook 'nginx -t && systemctl reload nginx' || { echo "SSL issuance failed for $DOMAIN. Check DNS and rerun this installer."; exit 1; }
write_config
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q certbot.timer; then systemctl enable --now certbot.timer >/dev/null; fi
# Verify routing end-to-end through nginx on this server.
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/healthz" || true)
redirect=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 --resolve "$DOMAIN:80:127.0.0.1" "http://$DOMAIN/" || true)
echo "Installed https://$DOMAIN · PM2 $APP · port $PORT · HTTPS check $code · HTTP redirect $redirect${ALIAS:+ · alias $ALIAS}"
