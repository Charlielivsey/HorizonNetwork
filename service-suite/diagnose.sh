#!/usr/bin/env bash
# Read-only status report for the 40 service websites. Changes nothing.
#   cd /root/HorizonNetwork && git pull && sudo bash service-suite/diagnose.sh
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Repository: $(git -C "$ROOT" log -1 --format='%h %s' 2>/dev/null) on branch $(git -C "$ROOT" branch --show-current 2>/dev/null)"
echo "Memory available: $(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo) MB · Auth: $(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3400/healthz) · portal secret: $([ -s /var/lib/hn-status-sso/secret ] && echo present || echo MISSING)"
echo "nginx: $(nginx -t 2>&1 | tail -1)"
printf '%-14s %-8s %-6s %-6s %-5s %-8s %s\n' SITE PM2 LOCAL NGINX CERT HTTPS DOMAIN
pm2 jlist 2>/dev/null > /tmp/hn-diagnose-pm2.json
python3 - "$ROOT/service-suite/catalog.json" <<'PY'
import json,os,subprocess,sys,urllib.request
catalog=json.load(open(sys.argv[1]))
try: apps={a['name']:a['pm2_env']['status'] for a in json.load(open('/tmp/hn-diagnose-pm2.json'))}
except Exception: apps={}
for s in catalog:
    local='down'
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{s['port']}/healthz",timeout=3) as r: local='ok' if r.status==200 else str(r.status)
    except Exception: pass
    nginx='yes' if os.path.exists(f"/etc/nginx/sites-enabled/hn-{s['id']}") else 'NO'
    cert='yes' if os.path.exists(f"/etc/letsencrypt/live/{s['domain']}/fullchain.pem") else 'NO'
    code=subprocess.run(['curl','-sk','-o','/dev/null','-w','%{http_code}','--max-time','5','--resolve',f"{s['domain']}:443:127.0.0.1",f"https://{s['domain']}/healthz"],capture_output=True,text=True).stdout or '000'
    print(f"{s['id']:<14} {apps.get('hn-'+s['id'],'missing'):<8} {local:<6} {nginx:<6} {cert:<5} {code:<8} {s['domain']}")
PY
rm -f /tmp/hn-diagnose-pm2.json
echo "Default nginx site enabled: $([ -e /etc/nginx/sites-enabled/default ] && echo yes || echo no)"
echo "Last certbot errors:"; tail -n 5 /var/log/letsencrypt/letsencrypt.log 2>/dev/null | grep -iE 'error|challenge|fail' || echo "  none recorded"
