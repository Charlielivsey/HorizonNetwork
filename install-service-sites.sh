#!/usr/bin/env bash
# Installs or updates the 40 HN Group / Horizon Network service websites, then registers them with
# HN Group Auth, central website control (admin.hngroup.org.uk) and HN Group Links.
#   cd /root/HorizonNetwork && git pull && sudo bash install-service-sites.sh
# Existing data, other hosts and unrelated PM2 processes are preserved. The deferred standalone
# Advertising installer is never run. Never stops or restarts websites other than the ones below.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
EMAIL="${1:-}"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
LOG=/var/log/hn-service-install.log
exec > >(tee -a "$LOG") 2>&1
echo "== $(date -Is) install-service-sites.sh ($(git -C "$ROOT" log -1 --format=%h))"
SITES=$(python3 -c 'import json,sys;print(" ".join(s["id"] for s in json.load(open(sys.argv[1]))))' "$ROOT/service-suite/catalog.json")
COUNT=$(echo "$SITES" | wc -w)

echo "== Capacity"
MEM=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
TOTAL=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
DISK=$(df -Pm /var/lib | awk 'NR==2 {print $4}')
echo "Memory available: ${MEM} MB of ${TOTAL} MB · disk free: ${DISK} MB · websites to run: ${COUNT}"
NEW=0; for id in $SITES; do pm2 describe "hn-$id" >/dev/null 2>&1 || NEW=$((NEW+1)); done
NEED=$((NEW * 55))
if [ "$MEM" -lt "$NEED" ]; then
    echo "Warning: ${NEW} new websites need roughly ${NEED} MB but ${MEM} MB is available. Each is limited to 160 MB and restarts if it exceeds that."
    if [ "${HN_ALLOW_LOW_MEMORY:-0}" != 1 ]; then echo "Stopping before installing. Free memory or add swap, or rerun with HN_ALLOW_LOW_MEMORY=1."; exit 1; fi
fi
[ "$DISK" -gt 1024 ] || { echo 'Less than 1 GB of disk is free. Stopping before installing.'; exit 1; }

echo "== HN Group Auth (registered callbacks and the staff-portal sync bridge)"
failed=()
# Websites still install if Auth fails: public pages work; staff sign-in needs Auth.
bash "$ROOT/auth-site/install.sh" "$EMAIL" || { echo 'Auth installation failed (staff sign-in will not work until it is fixed). Continuing with the websites.'; failed+=("auth"); }

for id in $SITES; do
    echo "== $id"
    bash "$ROOT/$id-site/install.sh" "$EMAIL" || failed+=("$id")
done

echo "== Central website control (maintenance and power for all websites)"
bash "$ROOT/admin-site/install.sh" "$EMAIL" || failed+=("admin")

echo "== HN Group Links"
bash "$ROOT/links-site/install.sh" "$EMAIL" || failed+=("links")
# Only list websites that are running and have a trusted certificate for their primary hostname.
if [ -f /opt/hn-links/public/index.html ]; then
    python3 - "$ROOT/service-suite/catalog.json" /opt/hn-links/public/index.html <<'PY'
import json,re,sys,urllib.request,os
catalog=json.load(open(sys.argv[1]));page=sys.argv[2];html=open(page).read();hidden=[]
for site in catalog:
    ok=False
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{site['port']}/healthz",timeout=3) as r: ok=r.status==200
    except Exception: pass
    ok=ok and os.path.exists(f"/etc/letsencrypt/live/{site['domain']}/fullchain.pem")
    if not ok:
        html,n=re.subn(r'<a class="link-card[^"]*" data-category="[^"]*" data-service="'+re.escape(site['id'])+r'".*?</a>\n?','',html,flags=re.S)
        if n: hidden.append(site['domain'])
open(page,'w').write(html)
print('Links: all service websites listed.' if not hidden else 'Links: not listed until ready: '+', '.join(hidden))
PY
fi

echo "== Summary"
pm2 jlist | python3 -c '
import json,sys
ids=sys.argv[1].split()
apps={a["name"]:a["pm2_env"]["status"] for a in json.load(sys.stdin)}
for i in ids: print(f"hn-{i:14} {apps.get(\"hn-\"+i,\"missing\")}")
' "$SITES"
if [ ${#failed[@]} -gt 0 ]; then echo "Needs attention: ${failed[*]} (rerun this command after fixing; completed websites are unaffected)"; echo "Full log: $LOG"; exit 1; fi
echo "All ${COUNT} service websites installed. Log: $LOG"
