#!/usr/bin/env bash
# HN Group mail server (Postfix + Dovecot + Rspamd) on this VPS, isolated from the websites.
#
#   sudo bash mail-server/install.sh [certificate email]
#
# Safe to re-run. It never touches websites or other services: it only installs/configures postfix, dovecot, rspamd,
# redis-server and postsrsd, restarts only those, and keeps every mailbox (/var/vmail), DKIM key and setting.
# Before changing anything it copies the current Postfix/Dovecot/Rspamd configuration to /var/backups/hn-mail/config-<time>/.
# Mailboxes, aliases, groups and permissions are managed on admin.mail.hngroup.org.uk (mail-admin-site), which writes
# the files in /etc/hn-mail/. This installer never changes DNS: it prints the records to publish and checks the provider
# side (outbound port 25, reverse DNS) so problems are reported, not guessed.
#
# HN_MAIL_TEST=1 (only for the automated tests in a throwaway container): no apt, certbot, nginx, ufw or systemd.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EMAIL="${1:-charlie.livsey@hngroup.org.uk}"
TEST="${HN_MAIL_TEST:-0}"
HOST=mx.hngroup.org.uk
PUBLIC_IP="${HN_MAIL_PUBLIC_IP:-217.154.34.205}"
DOMAINS=(hngroup.org.uk horizon-network.co.uk horizonadvertising.co.uk media.hngroup.org.uk network.hngroup.org.uk)
SELECTOR=hn2026
ETC=/etc/hn-mail
VMAIL=/var/vmail
LIB=/usr/local/lib/hn-mail
BACKUPS=/var/backups/hn-mail
ACME=/var/www/hn-mail-acme
LE_DIR="/etc/letsencrypt/live/$HOST"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
say() { printf '\n== %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*"; WARNINGS+=("$*"); }
WARNINGS=()

# ---------------------------------------------------------------- packages
say 'Packages'
if [ "$TEST" != 1 ]; then
    # Another mail server already on port 25 (e.g. exim) would fight with Postfix: stop rather than break it.
    if ss -ltnp 'sport = :25' 2>/dev/null | grep -q LISTEN && ! ss -ltnp 'sport = :25' | grep -q '"master"'; then
        echo 'Something other than Postfix is listening on port 25:'; ss -ltnp 'sport = :25'
        echo 'MAIL SERVER NOT INSTALLED: stop that program first, then rerun sudo bash mail-server/install.sh'; exit 1
    fi
    echo 'postfix postfix/main_mailer_type select No configuration' | debconf-set-selections
    echo "postfix postfix/mailname string $HOST" | debconf-set-selections
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -q
    apt-get install -y -q --no-install-recommends postfix dovecot-core dovecot-imapd dovecot-lmtpd dovecot-sieve \
        rspamd redis-server postsrsd swaks dnsutils python3 openssl ca-certificates
fi
for tool in postconf postfix doveadm doveconf sievec rspamadm python3 openssl; do command -v "$tool" >/dev/null || { echo "Missing $tool"; exit 1; }; done
# Ubuntu installs Postfix "without configuration" (our debconf answer), which leaves no main.cf: start from Debian's.
if [ ! -s /etc/postfix/main.cf ]; then
    if [ -f /usr/share/postfix/main.cf.debian ]; then cp /usr/share/postfix/main.cf.debian /etc/postfix/main.cf; else : > /etc/postfix/main.cf; fi
    echo 'Created /etc/postfix/main.cf (Postfix was installed without one).'
fi
[ -s /etc/postfix/master.cf ] || cp /usr/share/postfix/master.cf.dist /etc/postfix/master.cf
DOVECOT_VERSION="$(dovecot --version | cut -d' ' -f1)"
case "$DOVECOT_VERSION" in 2.3.*) DOVECOT_CONF=dovecot.conf ;; 2.4.*|2.5.*) DOVECOT_CONF=dovecot-2.4.conf ;; *) echo "Dovecot $DOVECOT_VERSION isn't supported yet (2.3 and 2.4 are)."; exit 1 ;; esac
POSTSRSD_MAJOR="$(postsrsd -v 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
[ -n "$POSTSRSD_MAJOR" ] || POSTSRSD_MAJOR="$(dpkg-query -W -f '${Version}' postsrsd 2>/dev/null | cut -d. -f1)"
echo "Postfix $(postconf -h mail_version), Dovecot $(dovecot --version | cut -d' ' -f1), $(rspamd --version 2>/dev/null | head -1)"

# ---------------------------------------------------------------- backup of the current configuration
say 'Backing up the current mail configuration'
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUPS" && chmod 700 "$BACKUPS"
tar -czf "$BACKUPS/config-$STAMP.tar.gz" --ignore-failed-read -C / etc/postfix etc/dovecot etc/rspamd etc/default/postsrsd etc/postsrsd.conf etc/hn-mail 2>/dev/null || true
chmod 600 "$BACKUPS/config-$STAMP.tar.gz"
echo "Saved $BACKUPS/config-$STAMP.tar.gz"
[ -f /etc/postfix/main.cf.before-hn-mail ] || cp -a /etc/postfix/main.cf /etc/postfix/main.cf.before-hn-mail 2>/dev/null || true
[ -f /etc/dovecot/dovecot.conf.before-hn-mail ] || cp -a /etc/dovecot/dovecot.conf /etc/dovecot/dovecot.conf.before-hn-mail 2>/dev/null || true

# ---------------------------------------------------------------- mail storage user and folders
say 'Mail storage'
getent group vmail >/dev/null || groupadd -g 5000 vmail
getent passwd vmail >/dev/null || useradd -u 5000 -g vmail -d "$VMAIL" -s /usr/sbin/nologin -M vmail
[ "$(id -u vmail)" = 5000 ] || { echo 'The vmail user exists with a uid other than 5000; fix that first.'; exit 1; }
mkdir -p "$VMAIL" && chown vmail:vmail "$VMAIL" && chmod 750 "$VMAIL"
install -d -m 755 "$ETC" "$ETC/postfix" "$ETC/sieve" "$ETC/dkim" "$ETC/tls"
install -d -m 750 -g dovecot "$ETC/dovecot"
install -d -m 750 -g _rspamd "$ETC/rspamd"
install -d -m 755 "$LIB"
# The mail directory's files: only created if missing (admin.mail.hngroup.org.uk keeps them up to date).
seed() { local file="$1" mode="$2" group="$3"; shift 3; if [ ! -f "$file" ]; then printf '%s' "$*" > "$file"; fi; chmod "$mode" "$file"; chgrp "$group" "$file"; }
seed "$ETC/postfix/domains" 644 root "$(printf '%s OK\n' "${DOMAINS[@]}")"
seed "$ETC/postfix/mailboxes" 644 root ''
seed "$ETC/postfix/aliases" 644 root ''
seed "$ETC/postfix/senders" 644 root ''
seed "$ETC/postfix/sender-bcc" 644 root ''
cp "$SCRIPT_DIR/config/recipient-access" "$ETC/postfix/recipient-access"
seed "$ETC/dovecot/users" 640 dovecot ''
seed "$ETC/dovecot/denied" 640 dovecot ''
seed "$ETC/dovecot/master-target" 640 dovecot ''
for i in 1 2 3 4 5 6 7 8 9 10; do seed "$ETC/dovecot/app-$i" 640 dovecot ''; done
rm -f "$ETC/dovecot/app-passwords.json" "$LIB/checkpassword"
seed "$ETC/rspamd/senders.map" 640 _rspamd ''
seed "$ETC/rspamd/ratelimit-user.inc" 640 _rspamd 'user = { bucket = { burst = 60; rate = "200 / 1h"; } }
'
printf '%s\n' "${DOMAINS[@]}" > "$ETC/domains.list"

# HN Mail's private master login: lets HN Mail open a person's own mailbox after HN Group Auth has signed them in.
# Only root can read the secret; Dovecot keeps only its SHA512-CRYPT hash.
if [ ! -s "$ETC/hnmail-master.secret" ]; then (umask 077; openssl rand -hex 32 > "$ETC/hnmail-master.secret"); fi
chmod 600 "$ETC/hnmail-master.secret"
printf 'hnmail:%s\n' "$(doveadm pw -s SHA512-CRYPT -p "$(cat "$ETC/hnmail-master.secret")")" > "$ETC/dovecot/master-users.new"
chmod 640 "$ETC/dovecot/master-users.new" && chgrp dovecot "$ETC/dovecot/master-users.new" && mv "$ETC/dovecot/master-users.new" "$ETC/dovecot/master-users"

install -m 755 "$SCRIPT_DIR/bin/quota-warning" "$LIB/quota-warning"
install -m 755 "$SCRIPT_DIR/bin/backup" "$LIB/backup"
install -m 755 "$SCRIPT_DIR/bin/check" "$LIB/check"
ln -sfn "$LIB/check" /usr/local/sbin/hn-mail-check

# ---------------------------------------------------------------- TLS certificate for mx.hngroup.org.uk
say 'TLS certificate'
use_self_signed() {
    if [ ! -f "$ETC/tls/self-signed.pem" ]; then
        openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=$HOST" -keyout "$ETC/tls/self-signed.key" -out "$ETC/tls/self-signed.pem" 2>/dev/null
        chmod 600 "$ETC/tls/self-signed.key"
    fi
    ln -sfn "$ETC/tls/self-signed.pem" "$ETC/tls/fullchain.pem"; ln -sfn "$ETC/tls/self-signed.key" "$ETC/tls/privkey.pem"
}
if [ "$TEST" = 1 ]; then use_self_signed
else
    mkdir -p "$ACME"
    if [ ! -f "$LE_DIR/fullchain.pem" ]; then
        cat > /etc/nginx/sites-available/hn-mail-mx <<NGINX
# HN Group mail server: only Let's Encrypt's checks for $HOST (no website here).
server {
    listen 80;
    server_name $HOST;
    location /.well-known/acme-challenge/ { root $ACME; }
    location / { return 404; }
}
NGINX
        ln -sfn /etc/nginx/sites-available/hn-mail-mx /etc/nginx/sites-enabled/hn-mail-mx
        if nginx -t 2>/dev/null; then systemctl reload nginx; else rm -f /etc/nginx/sites-enabled/hn-mail-mx; warn 'nginx refused the small mx host, so no certificate yet.'; fi
        if getent ahostsv4 "$HOST" | grep -q "$PUBLIC_IP"; then
            certbot certonly --webroot -w "$ACME" -d "$HOST" --cert-name "$HOST" --non-interactive --agree-tos --keep-until-expiring --email "$EMAIL" \
                || warn "Let's Encrypt couldn't issue a certificate for $HOST yet (a temporary self-signed one is used)."
        else warn "$HOST doesn't point at $PUBLIC_IP yet, so it has no certificate (a temporary self-signed one is used)."; fi
    fi
    if [ -f "$LE_DIR/fullchain.pem" ]; then ln -sfn "$LE_DIR/fullchain.pem" "$ETC/tls/fullchain.pem"; ln -sfn "$LE_DIR/privkey.pem" "$ETC/tls/privkey.pem"
    else use_self_signed; fi
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    cat > /etc/letsencrypt/renewal-hooks/deploy/hn-mail.sh <<'HOOK'
#!/bin/sh
# HN Group mail: pick up a renewed mx.hngroup.org.uk certificate.
case "$RENEWED_DOMAINS" in *mx.hngroup.org.uk*) systemctl reload postfix dovecot ;; esac
HOOK
    chmod 755 /etc/letsencrypt/renewal-hooks/deploy/hn-mail.sh
fi

# ---------------------------------------------------------------- Postfix
say 'Postfix'
while IFS= read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    postconf -e "$line"
done < "$SCRIPT_DIR/config/postfix-main.conf"
python3 - "$SCRIPT_DIR/config/postfix-master.cf" <<'PY'
import re, sys
from pathlib import Path
block = Path(sys.argv[1]).read_text()
p = Path('/etc/postfix/master.cf'); s = p.read_text()
s = re.sub(r'# >>> HN Group mail.*?# <<< HN Group mail <<<\n', '', s, flags=re.S)
p.write_text(s.rstrip('\n') + '\n' + block)
PY
# Sender Rewriting Scheme, so forwarded mail still passes SPF. postsrsd 1.x (Ubuntu 24.04) answers on TCP 10001/10002;
# postsrsd 2.x (Ubuntu 26.04) on a socketmap in Postfix's spool.
if [ "${POSTSRSD_MAJOR:-1}" -ge 2 ] 2>/dev/null; then
    [ -f /etc/postsrsd.conf.before-hn-mail ] || cp -a /etc/postsrsd.conf /etc/postsrsd.conf.before-hn-mail 2>/dev/null || true
    cat > /etc/postsrsd.conf <<SRS
# HN Group mail: Sender Rewriting Scheme (written by mail-server/install.sh).
srs-domain = "hngroup.org.uk"
domains = { $(printf '"%s", ' "${DOMAINS[@]}" | sed 's/, $//') }
socketmap = unix:/var/spool/postfix/srs
keep-alive = 30
original-envelope = embedded
secrets-file = "/etc/postsrsd.secret"
separator = "="
hash-length = 4
hash-minimum = 4
always-rewrite = off
unprivileged-user = "postsrsd"
chroot-dir = "/var/lib/postsrsd"
syslog = on
SRS
    postconf -e 'sender_canonical_maps = socketmap:unix:srs:forward' 'recipient_canonical_maps = socketmap:unix:srs:reverse'
else
    cat > /etc/default/postsrsd <<SRS
# HN Group mail: Sender Rewriting Scheme, so forwarded mail still passes SPF (written by mail-server/install.sh).
SRS_DOMAIN=hngroup.org.uk
SRS_EXCLUDE_DOMAINS=$(IFS=,; echo "${DOMAINS[*]}")
SRS_SEPARATOR==
SRS_SECRET=/etc/postsrsd.secret
SRS_FORWARD_PORT=10001
SRS_REVERSE_PORT=10002
RUN_AS=postsrsd
SRS_LISTEN_ADDR=127.0.0.1
SRS
fi
newaliases 2>/dev/null || true
# Postfix's own folders and files, owned the way it needs (fixes a half-finished package set-up).
postfix set-permissions >/dev/null 2>&1 || true
postfix check

# ---------------------------------------------------------------- Dovecot
say 'Dovecot'
echo "Dovecot $DOVECOT_VERSION: using config/$DOVECOT_CONF"
cp "$SCRIPT_DIR/config/$DOVECOT_CONF" /etc/dovecot/dovecot.conf
cp "$SCRIPT_DIR/config/before.sieve" "$ETC/sieve/before.sieve"
sievec "$ETC/sieve/before.sieve"
chmod 644 "$ETC/sieve/before.sieve" "$ETC/sieve/before.svbin"
touch "$VMAIL/.hn-shared-mailboxes.db" && chown vmail:vmail "$VMAIL/.hn-shared-mailboxes.db" && chmod 600 "$VMAIL/.hn-shared-mailboxes.db"
doveconf -n >/dev/null

# ---------------------------------------------------------------- Rspamd and DKIM keys
say 'Rspamd and DKIM'
mkdir -p /etc/rspamd/local.d
cp "$SCRIPT_DIR"/config/rspamd/* /etc/rspamd/local.d/
cp "$SCRIPT_DIR/config/rspamd.local.lua" /etc/rspamd/rspamd.local.lua
if [ ! -s "$ETC/rspamd/controller-password.inc" ]; then
    printf 'password = "%s";\n' "$(rspamadm pw -q -p "$(openssl rand -hex 24)")" > "$ETC/rspamd/controller-password.inc"
fi
chmod 640 "$ETC/rspamd/controller-password.inc" && chgrp _rspamd "$ETC/rspamd/controller-password.inc"
install -d -m 750 -o _rspamd -g _rspamd /var/lib/rspamd/dkim
for d in "${DOMAINS[@]}"; do
    key="/var/lib/rspamd/dkim/$d.$SELECTOR.key"
    if [ ! -s "$key" ]; then
        rspamadm dkim_keygen -s "$SELECTOR" -d "$d" -b 2048 -k "$key" > "$ETC/dkim/$d.$SELECTOR.txt"
        echo "Made a new DKIM key for $d (selector $SELECTOR)."
    fi
    chown _rspamd:_rspamd "$key"; chmod 600 "$key"
    # The public half, as one TXT value, for DNS (public by design).
    if [ ! -s "$ETC/dkim/$d.$SELECTOR.txt" ] || ! grep -q 'p=' "$ETC/dkim/$d.$SELECTOR.txt"; then
        pub="$(openssl rsa -in "$key" -pubout -outform DER 2>/dev/null | base64 -w0)"
        printf '%s._domainkey IN TXT ( "v=DKIM1; k=rsa; p=%s" ) ;\n' "$SELECTOR" "$pub" > "$ETC/dkim/$d.$SELECTOR.txt"
    fi
    chmod 644 "$ETC/dkim/$d.$SELECTOR.txt"
done
rspamadm configtest >/dev/null

# ---------------------------------------------------------------- firewall
if [ "$TEST" != 1 ] && command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then
    say 'Firewall'
    for port in 25 465 587 993; do ufw allow "$port/tcp" >/dev/null; done
    echo 'Opened TCP 25, 465, 587 and 993 in ufw (any Fasthosts firewall in front of the server must allow them too).'
fi

# ---------------------------------------------------------------- backups (nightly, private, 7 days)
if [ "$TEST" != 1 ]; then
    cat > /etc/cron.d/hn-mail-backup <<'CRON'
# HN Group mail: nightly private backup of mailboxes, settings and DKIM keys (restore: mail-server/README.md).
17 3 * * * root /usr/local/lib/hn-mail/backup >> /var/log/hn-mail-backup.log 2>&1
CRON
    chmod 644 /etc/cron.d/hn-mail-backup
fi

# ---------------------------------------------------------------- start (mail services only)
say 'Starting the mail services'
if [ "$TEST" = 1 ]; then
    pgrep -x redis-server >/dev/null || redis-server --daemonize yes --bind 127.0.0.1 >/dev/null
    install -d -o _rspamd -g _rspamd /run/rspamd
    pkill -x rspamd 2>/dev/null || true; sleep 1; rspamd -u _rspamd -g _rspamd >/dev/null 2>&1
    if pgrep -f 'postsrsd' >/dev/null; then :
    elif [ "${POSTSRSD_MAJOR:-1}" -ge 2 ] 2>/dev/null; then postsrsd -D >/dev/null 2>&1 </dev/null || true
    else (set -a; . /etc/default/postsrsd; postsrsd -s "$SRS_SECRET" -d "$SRS_DOMAIN" -f "$SRS_FORWARD_PORT" -r "$SRS_REVERSE_PORT" -X"$SRS_EXCLUDE_DOMAINS" -u postsrsd -l 127.0.0.1 -D >/dev/null 2>&1 </dev/null) || true; fi
    if doveadm service status >/dev/null 2>&1 || pgrep -x dovecot >/dev/null; then doveadm reload; else dovecot; fi
    if postfix status >/dev/null 2>&1; then postfix reload; else postfix start; fi
else
    for svc in redis-server rspamd postsrsd dovecot postfix; do
        systemctl enable "$svc" >/dev/null 2>&1 || true
        systemctl restart "$svc" || warn "$svc didn't start: see journalctl -u $svc"
    done
fi
sleep 2

# ---------------------------------------------------------------- checks
say 'Checks'
"$LIB/check" --brief || true
if [ "$TEST" != 1 ]; then
    # Provider side: Fasthosts blocks outgoing port 25 on new servers until support unblocks it.
    if timeout 8 bash -c 'exec 3<>/dev/tcp/gmail-smtp-in.l.google.com/25' 2>/dev/null; then echo 'Outgoing port 25: open (other mail servers can be reached).'
    else warn 'Outgoing port 25 is BLOCKED: this server cannot deliver mail to other providers. Ask Fasthosts support (fasthosts.co.uk/support, or the Fasthosts control panel) to unblock outgoing port 25 for this server ($PUBLIC_IP).'; fi
    ptr="$(dig +short -x "$PUBLIC_IP" 2>/dev/null | sed 's/\.$//' | head -1)"
    if [ "$ptr" = "$HOST" ]; then echo "Reverse DNS: $PUBLIC_IP -> $HOST (correct)."
    else warn "Reverse DNS for $PUBLIC_IP is '${ptr:-none}', not $HOST. Ask Fasthosts support (or use the Fasthosts control panel's reverse DNS setting for the server) to set it to $HOST. A change can take a few hours to show."; fi
fi
echo
python3 - "$ETC" "$SELECTOR" "${DOMAINS[@]}" <<'PY'
import json, re, sys
etc, sel, domains = sys.argv[1], sys.argv[2], sys.argv[3:]
out = {}
for d in domains:
    t = open(f'{etc}/dkim/{d}.{sel}.txt').read()
    p = ''.join(re.findall(r'"([^"]*)"', t)) or t
    m = re.search(r'p=([A-Za-z0-9+/=]+)', p.replace(' ', ''))
    out[d] = {'selector': sel, 'dkim': 'v=DKIM1; k=rsa; p=' + (m.group(1) if m else '')}
json.dump(out, open(f'{etc}/dkim/public.json', 'w'), indent=1)
PY
chmod 644 "$ETC/dkim/public.json"
echo
echo 'DNS records this server needs (publish only after the checks above pass; see mail-server/README.md):'
python3 - "$ETC/dkim/public.json" "$HOST" <<'PY'
import json, sys
for d, v in json.load(open(sys.argv[1])).items():
    print(f"  {d}  MX 10 {sys.argv[2]}")
    print(f"  {v['selector']}._domainkey.{d}  TXT \"{v['dkim']}\"")
PY
if [ "${#WARNINGS[@]}" -gt 0 ]; then
    echo; echo 'Mail server installed, with problems to fix:'; printf ' - %s\n' "${WARNINGS[@]}"
else
    echo; echo 'Mail server installed and running.'
fi
