#!/usr/bin/env bash
# Removes HN Group's own mail server and the mail admin site (the user's request, 6 November 2026: "revert everything
# back to gmail. remove the mailserver entirely"). Email stays with Google Workspace; HN Mail goes back to Gmail.
# Run by the root install.sh while any part of it is still on the server; safe to run again.
# Before removing anything it saves the mail server's settings, DKIM keys, mailboxes and admin data to
# /var/backups/hn-mail-removed-<time>.tar.gz (root only). Only the mail packages are removed; other services are untouched.
set -uo pipefail
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
say() { echo "  $*"; }
# Skip install.sh's certbot wrapper (in a temporary folder), so `certbot delete` really runs.
PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '^/tmp/' | paste -sd: -)"

# 1. Private backup of everything the mail server made.
stamp="$(date +%Y%m%d-%H%M%S)"
keep=()
for p in /etc/hn-mail /var/vmail /var/lib/hn-mail-admin /var/lib/rspamd/dkim /var/backups/hn-mail /etc/postfix /etc/dovecot /etc/rspamd; do
    [ -e "$p" ] && keep+=("$p")
done
if [ "${#keep[@]}" -gt 0 ]; then
    umask 077
    tar -czf "/var/backups/hn-mail-removed-$stamp.tar.gz" "${keep[@]}" 2>/dev/null && say "Saved a backup: /var/backups/hn-mail-removed-$stamp.tar.gz"
fi

# 2. Mail admin site.
if pm2 describe hn-mail-admin >/dev/null 2>&1; then pm2 delete hn-mail-admin >/dev/null 2>&1; pm2 save >/dev/null 2>&1; say 'Stopped the mail admin site (hn-mail-admin).'; fi
rm -f /etc/nginx/sites-enabled/hn-mail-admin /etc/nginx/sites-available/hn-mail-admin \
      /etc/nginx/sites-enabled/hn-mail-mx /etc/nginx/sites-available/hn-mail-mx
rm -rf /opt/hn-mail-admin /var/lib/hn-mail-admin /var/www/hn-mail-admin-acme /var/www/hn-mail-acme
if nginx -t >/dev/null 2>&1; then systemctl reload nginx; fi

# 3. Mail services and packages (only the ones the mail server installed).
for svc in postfix dovecot rspamd postsrsd; do systemctl disable --now "$svc" >/dev/null 2>&1 || true; done
pkill -x postsrsd 2>/dev/null || true
pkgs=()
for p in postfix dovecot-core dovecot-imapd dovecot-lmtpd dovecot-sieve dovecot-managesieved rspamd postsrsd; do
    dpkg -s "$p" >/dev/null 2>&1 && pkgs+=("$p")
done
if [ "${#pkgs[@]}" -gt 0 ]; then
    # Only go ahead if apt wouldn't take anything else with them.
    extra="$(apt-get -s purge "${pkgs[@]}" 2>/dev/null | awk '/^Purg /{print $2}' | grep -vxF -f <(printf '%s\n' "${pkgs[@]}" dovecot-pop3d dovecot-lmtpd dovecot-sieve dovecot-managesieved) || true)"
    if [ -z "$extra" ]; then
        DEBIAN_FRONTEND=noninteractive apt-get purge -y -q "${pkgs[@]}" >/dev/null 2>&1 && say "Removed packages: ${pkgs[*]}"
    else
        say "Left the mail packages installed but switched off (removing them would also remove: $(echo $extra))."
    fi
fi
[ -f /etc/postsrsd.conf.before-hn-mail ] && mv -f /etc/postsrsd.conf.before-hn-mail /etc/postsrsd.conf
rm -rf /etc/hn-mail /var/vmail /var/lib/rspamd/dkim /usr/local/lib/hn-mail /var/backups/hn-mail
rm -f /usr/local/sbin/hn-mail-check /usr/local/sbin/hn-mail-relay /etc/cron.d/hn-mail-backup /var/log/hn-mail-backup.log \
      /etc/letsencrypt/renewal-hooks/deploy/hn-mail.sh
getent passwd vmail >/dev/null && userdel vmail 2>/dev/null
getent group vmail >/dev/null && groupdel vmail 2>/dev/null

# 4. Firewall ports opened for mail, and the mx.hngroup.org.uk certificate.
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then
    for port in 25 465 587 993; do ufw delete allow "$port/tcp" >/dev/null 2>&1 || true; done
    say 'Closed TCP 25, 465, 587 and 993 in ufw.'
fi
[ -d /etc/letsencrypt/live/mx.hngroup.org.uk ] && certbot delete --cert-name mx.hngroup.org.uk --non-interactive >/dev/null 2>&1 && say 'Deleted the mx.hngroup.org.uk certificate.'
[ -d /etc/letsencrypt/live/admin.mail.hngroup.org.uk ] && certbot delete --cert-name admin.mail.hngroup.org.uk --non-interactive >/dev/null 2>&1
say 'The HN Group mail server has been removed. Email stays with Google Workspace.'
