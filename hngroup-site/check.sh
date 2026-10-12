#!/usr/bin/env bash
# Checks where hngroup.org.uk actually goes, and says what to fix if it isn't the website.
#
#   sudo bash hngroup-site/check.sh
#
# Run automatically at the end of the installer.

DOMAIN="hngroup.org.uk"
WWW="www.$DOMAIN"
MARK='name="hn-site" content="hngroup-website"'
GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}  [✓]${RESET} $1"; }
bad()  { echo -e "${RED}  [✗]${RESET} $1"; PROBLEMS=$((PROBLEMS + 1)); }
info() { echo -e "${YELLOW}      $1${RESET}"; }
PROBLEMS=0

echo ""
echo -e "${CYAN}  Checking $DOMAIN...${RESET}"
SERVER_IP="$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"

# 1. Does nginx on this server serve the website for the domain? (asks this server directly)
for scheme in http https; do
    port=80; [ "$scheme" = https ] && port=443
    body="$(curl -sk --noproxy '*' --max-time 8 -L --max-redirs 3 --resolve "$DOMAIN:$port:127.0.0.1" "$scheme://$DOMAIN/" 2>/dev/null)"
    if echo "$body" | grep -q "$MARK"; then
        ok "This server shows the website for $scheme://$DOMAIN"
    elif [ "$scheme" = https ] && [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        info "No HTTPS certificate for $DOMAIN yet (see the installer output above)."
    else
        bad "This server does NOT show the website for $scheme://$DOMAIN"
        info "nginx sites that mention $DOMAIN:"
        grep -RlsE "server_name[^;]*[[:space:]]($DOMAIN|$WWW)[[:space:];]" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | sed 's/^/        /'
        nginx -t 2>&1 | grep -i "conflicting" | sed 's/^/        /'
    fi
done

# 2. Does the domain's DNS point here?
for n in "$DOMAIN" "$WWW"; do
    ips="$(getent ahostsv4 "$n" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
    v6="$(getent ahostsv6 "$n" 2>/dev/null | awk '{print $1}' | grep ':' | sort -u | tr '\n' ' ')"
    if [ -z "$ips" ]; then
        if [ "$n" = "$DOMAIN" ]; then
            bad "$n has no DNS A record. Add: A  @  $SERVER_IP   (@ means the bare domain; some providers leave the name blank)"
        else
            bad "$n has no DNS A record. Add: A  www  $SERVER_IP"
        fi
    elif [ "$(echo $ips)" != "$SERVER_IP" ]; then
        bad "$n points to $ips — it must point only to $SERVER_IP"
        info "Change the A record at your domain provider, and delete any other A/AAAA/CNAME records for it."
    else
        ok "$n points to this server ($SERVER_IP)"
    fi
    if [ -n "$v6" ] && ! ip -6 addr 2>/dev/null | grep -qF "$(echo $v6 | awk '{print $1}')"; then
        bad "$n also has an IPv6 (AAAA) record ($v6) that isn't this server. Delete that AAAA record."
    fi
done

# 3. What does a visitor actually get? (goes out through DNS, like a browser does)
[ -z "$(getent ahostsv4 "$DOMAIN" 2>/dev/null)" ] && { echo ""; echo -e "${YELLOW}  Fix the items marked [✗] above, then run: sudo bash hngroup-site/check.sh${RESET}"; echo ""; exit 0; }
final="$(curl -s --max-time 10 -L --max-redirs 5 -o /dev/null -w '%{url_effective}' "http://$DOMAIN/" 2>/dev/null)"
first="$(curl -s --max-time 10 -o /dev/null -w '%{redirect_url}' "http://$DOMAIN/" 2>/dev/null)"
if [ -n "$final" ]; then
    if echo "$final" | grep -q "staff\.$DOMAIN"; then
        bad "Visitors to http://$DOMAIN are sent to $final"
        if [ -n "$first" ] && ! echo "$first" | grep -q "^https://$DOMAIN"; then
            info "The redirect comes from: $first"
        fi
        info "If the DNS checks above passed, your domain provider is probably forwarding the"
        info "domain. Turn off 'domain forwarding' / 'URL redirect' / 'web forwarding' for"
        info "$DOMAIN and www in your domain provider's control panel (keep the A records)."
    elif curl -s --max-time 10 -L "http://$DOMAIN/" 2>/dev/null | grep -q "$MARK"; then
        ok "Visitors to http://$DOMAIN get the website ($final)"
    else
        bad "Visitors to http://$DOMAIN end up at $final, which isn't the website"
    fi
fi

echo ""
if [ "$PROBLEMS" = 0 ]; then
    echo -e "${GREEN}  Everything looks right. If your browser still shows the staff portal, it has remembered an${RESET}"
    echo -e "${GREEN}  old redirect: try a private/incognito window, or clear the browser's cache for $DOMAIN.${RESET}"
else
    echo -e "${YELLOW}  Fix the items marked [✗] above, then run: sudo bash hngroup-site/check.sh${RESET}"
fi
echo ""
