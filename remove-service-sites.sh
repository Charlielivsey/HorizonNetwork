#!/usr/bin/env bash
# Removes ONLY the 40 service websites added on 16 October 2026, then reapplies the original
# Auth, website-control and Links configuration. Safe to run if some or none were installed.
#   cd /root/HorizonNetwork && git pull && sudo bash remove-service-sites.sh
# Never touches other websites, PM2 processes (no "pm2 all"), nginx hosts or certificates.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
# id:primary-domain:alias
SITES="billing:billing.hngroup.org.uk: projects:projects.hngroup.org.uk: brand:brand.hngroup.org.uk: downloads:downloads.hngroup.org.uk: feedback:feedback.hngroup.org.uk: events:events.hngroup.org.uk: partners:partners.hngroup.org.uk: services:services.hngroup.org.uk: trust:trust.hngroup.org.uk: learn:learn.hngroup.org.uk: assets:assets.hngroup.org.uk: email:email.hngroup.org.uk: community:community.hngroup.org.uk: bookings:bookings.hngroup.org.uk: forms:forms.hngroup.org.uk: surveys:surveys.hngroup.org.uk: suppliers:suppliers.hngroup.org.uk: procurement:procurement.hngroup.org.uk: expenses:expenses.hngroup.org.uk: licenses:licenses.hngroup.org.uk: developers:developers.hngroup.org.uk: labs:labs.hngroup.org.uk: reports:reports.hngroup.org.uk: sign:sign.hngroup.org.uk: vault:vault.hngroup.org.uk: security:security.hngroup.org.uk: competitions:competitions.hngroup.org.uk: members:members.hngroup.org.uk: hosting:hosting.horizon-network.co.uk:hosting.horizonetwork.com panel:panel.horizon-network.co.uk:panel.horizonetwork.com netstatus:status.horizon-network.co.uk:status.horizonetwork.com domains:domains.horizon-network.co.uk:domains.horizonetwork.com netdevelopers:developers.horizonetwork.com:developers.horizon-network.co.uk showcase:showcase.horizonetwork.com:showcase.horizon-network.co.uk ads:ads.horizonetwork.com:ads.horizon-network.co.uk tools:tools.horizonetwork.com:tools.horizon-network.co.uk sandbox:sandbox.horizonetwork.com:sandbox.horizon-network.co.uk order:order.horizon-network.co.uk:order.horizonetwork.com my:my.horizonetwork.com:my.horizon-network.co.uk netcommunity:community.horizonetwork.com:community.horizon-network.co.uk"
STAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE=/var/lib/hn-removed-service-sites-$STAMP.tar.gz
DATA=()
for entry in $SITES; do
    IFS=: read -r id domain alias <<< "$entry"
    app="hn-$id"
    if pm2 describe "$app" >/dev/null 2>&1; then pm2 delete "$app" >/dev/null && echo "Stopped and removed PM2 $app"; fi
    rm -f "/etc/nginx/sites-enabled/$app" "/etc/nginx/sites-available/$app" "/etc/nginx/hn-control/enabled/$id-gate.conf"
    if [ -d "/etc/letsencrypt/live/$domain" ]; then certbot delete --non-interactive --cert-name "$domain" >/dev/null 2>&1 && echo "Deleted certificate $domain"; fi
    rm -rf "/opt/$app" "/var/www/$app-acme"
    [ -d "/var/lib/$app" ] && DATA+=("var/lib/$app")
done
# Keep a private copy of any data the removed websites had stored, then remove it.
if [ ${#DATA[@]} -gt 0 ]; then
    (umask 077; tar -czf "$ARCHIVE" -C / "${DATA[@]}") && for d in "${DATA[@]}"; do rm -rf "/$d"; done && echo "Archived removed website data to $ARCHIVE"
fi
rm -f /var/log/hn-service-install.log
if nginx -t; then systemctl reload nginx; else echo 'nginx configuration test failed; check nginx -t before reloading.'; fi
pm2 save
# Restore the original registrations: Auth clients and portal bridge, website control (15 websites) and Links.
bash "$ROOT/admin-site/install.sh" || echo 'Website control reinstall reported a problem; rerun: sudo bash admin-site/install.sh'
bash "$ROOT/links-site/install.sh" || echo 'Links reinstall reported a problem; rerun: sudo bash links-site/install.sh'
echo 'The 40 service websites have been removed. Original websites are unchanged.'
