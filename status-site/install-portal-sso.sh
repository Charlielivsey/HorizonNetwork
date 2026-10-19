#!/usr/bin/env bash
# Apply only the staff portal files needed for status sign-in. Never run the staff/public installers.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$SCRIPT_DIR/../staff-portal"
PORTAL=/opt/hn-staff-portal
SECRET_DIR=/var/lib/hn-status-sso
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
if [ ! -f "$PORTAL/server.js" ] || [ ! -f "$PORTAL/public/assets/login.js" ] || ! pm2 describe hn-staff-portal >/dev/null 2>&1; then
    echo 'The existing staff portal must be installed and managed by PM2 as hn-staff-portal before connecting status sign-in.'
    exit 1
fi
node --check "$SOURCE/server.js"
node --check "$SOURCE/lib/status-sso.js"
node --check "$SOURCE/lib/resume.js"
node --check "$SOURCE/lib/network-leadership.js"
node --check "$SOURCE/lib/portal-auth.js"
node --check "$SOURCE/public/assets/login.js"
mkdir -p "$SECRET_DIR"
chmod 700 "$SECRET_DIR"
if [ ! -f "$SECRET_DIR/secret" ]; then
    (umask 077; openssl rand -hex 32 > "$SECRET_DIR/secret")
fi
chmod 600 "$SECRET_DIR/secret"
# Skip restarting the portal on future status-only updates if these integration files match.
if cmp -s "$SOURCE/server.js" "$PORTAL/server.js" && \
   cmp -s "$SOURCE/lib/network-leadership.js" "$PORTAL/lib/network-leadership.js" && \
   cmp -s "$SOURCE/lib/resume.js" "$PORTAL/lib/resume.js" && \
   cmp -s "$SOURCE/lib/status-sso.js" "$PORTAL/lib/status-sso.js" && \
   cmp -s "$SOURCE/lib/portal-auth.js" "$PORTAL/lib/portal-auth.js" && \
   cmp -s "$SOURCE/public/login.html" "$PORTAL/public/login.html" && \
   cmp -s "$SOURCE/public/assets/login.js" "$PORTAL/public/assets/login.js"; then
    echo 'Staff portal status sign-in is already up to date.'
    exit 0
fi
BACKUP="$(mktemp -d /var/lib/hn-status-sso/portal-backup-XXXXXX)"
cp "$PORTAL/server.js" "$BACKUP/server.js"
cp "$PORTAL/public/assets/login.js" "$BACKUP/login.js"
cp "$PORTAL/public/login.html" "$BACKUP/login.html"
[ ! -f "$PORTAL/lib/resume.js" ] || cp "$PORTAL/lib/resume.js" "$BACKUP/resume.js"
[ ! -f "$PORTAL/lib/status-sso.js" ] || cp "$PORTAL/lib/status-sso.js" "$BACKUP/status-sso.js"
[ ! -f "$PORTAL/lib/portal-auth.js" ] || cp "$PORTAL/lib/portal-auth.js" "$BACKUP/portal-auth.js"
[ ! -f "$PORTAL/lib/network-leadership.js" ] || cp "$PORTAL/lib/network-leadership.js" "$BACKUP/network-leadership.js"
cp "$SOURCE/lib/network-leadership.js" "$PORTAL/lib/network-leadership.js"
cp "$SOURCE/lib/resume.js" "$PORTAL/lib/resume.js"
cp "$SOURCE/lib/status-sso.js" "$PORTAL/lib/status-sso.js"
cp "$SOURCE/lib/portal-auth.js" "$PORTAL/lib/portal-auth.js"
cp "$SOURCE/public/login.html" "$PORTAL/public/login.html"
cp "$SOURCE/server.js" "$PORTAL/server.js"
cp "$SOURCE/public/assets/login.js" "$PORTAL/public/assets/login.js"
healthy=0
RESTART_APP=hn-staff-portal
CHECK_PORT=3200
if [ -f /var/lib/hn-control/accounts-independent ]; then RESTART_APP=hn-accounts; CHECK_PORT=3250
elif [ -f /var/lib/hn-control/accounts-enabled ]; then RESTART_APP=hn-auth; CHECK_PORT=3250; fi
if pm2 restart "$RESTART_APP"; then
    for attempt in {1..15}; do
        if curl -fsS --max-time 2 http://127.0.0.1:$CHECK_PORT/healthz >/dev/null; then healthy=1; break; fi
        sleep 1
    done
fi
if [ "$healthy" != 1 ]; then
    if [ -f "$BACKUP/network-leadership.js" ]; then cp "$BACKUP/network-leadership.js" "$PORTAL/lib/network-leadership.js"; else rm -f "$PORTAL/lib/network-leadership.js"; fi
    cp "$BACKUP/server.js" "$PORTAL/server.js"
    cp "$BACKUP/login.js" "$PORTAL/public/assets/login.js"
    cp "$BACKUP/login.html" "$PORTAL/public/login.html"
    if [ -f "$BACKUP/portal-auth.js" ]; then cp "$BACKUP/portal-auth.js" "$PORTAL/lib/portal-auth.js"; else rm -f "$PORTAL/lib/portal-auth.js"; fi
    if [ -f "$BACKUP/resume.js" ]; then cp "$BACKUP/resume.js" "$PORTAL/lib/resume.js"; fi
    if [ -f "$BACKUP/status-sso.js" ]; then cp "$BACKUP/status-sso.js" "$PORTAL/lib/status-sso.js"; else rm -f "$PORTAL/lib/status-sso.js"; fi
    pm2 restart "$RESTART_APP" || true
    echo "Staff sign-in integration failed; previous portal files restored. Backup: $BACKUP"
    exit 1
fi
echo "Staff portal sign-in connected. Integration backup: $BACKUP"
