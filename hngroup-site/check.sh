#!/usr/bin/env bash
# Checks where hngroup.org.uk actually goes, and says what to fix if it isn't the website.
# Understands Cloudflare's proxy (the orange cloud) in front of the domain.
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
CLOUDFLARE=0

is_cloudflare() {
    python3 -c "import ipaddress,sys
nets=[ipaddress.ip_network(n) for n in '173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32'.split()]
sys.exit(0 if all(any(ipaddress.ip_address(a) in n for n in nets) for a in sys.argv[1:]) else 1)" "$@" 2>/dev/null
}

echo ""
echo -e "${CYAN}  Checking $DOMAIN...${RESET}"
SERVER_IP="$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"

# 1. Does nginx on this server serve the website for the domain? (asks this server directly)
for scheme in http https; do
    port=80; [ "$scheme" = https ] && port=443
    body="$(curl -sk --noproxy '*' --max-time 8 --resolve "$DOMAIN:$port:127.0.0.1" -w '\nREDIRECT:%{redirect_url}' "$scheme://$DOMAIN/" 2>/dev/null)"
    if echo "$body" | grep -q "$MARK"; then
        ok "This server shows the website for $scheme://$DOMAIN"
    elif [ "$scheme" = http ] && echo "$body" | grep -q "^REDIRECT:https://$DOMAIN/"; then
        ok "This server redirects http://$DOMAIN to HTTPS"
    else
        bad "This server does NOT show the website for $scheme://$DOMAIN"
        info "Run the installer again: cd /root/HorizonNetwork && git pull && sudo bash staff-portal/install.sh"
        grep -RlsE "server_name[^;]*[[:space:]]($DOMAIN|$WWW)[[:space:];]" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | sed 's/^/        nginx config mentioning the domain: /'
    fi
done
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    ok "Let's Encrypt certificate: expires $(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" | cut -d= -f2)"
else
    info "No Let's Encrypt certificate yet; HTTPS is using a temporary self-signed one (see the installer output)."
fi

# 2. Where does the domain's DNS point?
for n in "$DOMAIN" "$WWW"; do
    ips="$(getent ahostsv4 "$n" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
    # IPv6 addresses, ignoring IPv4 ones written in IPv6 form (::ffff:1.2.3.4)
    v6="$(getent ahostsv6 "$n" 2>/dev/null | awk '{print $1}' | grep ':' | grep -vi '^::ffff:' | sort -u | tr '\n' ' ')"
    if [ -z "$ips" ]; then
        if [ "$n" = "$DOMAIN" ]; then bad "$n has no DNS A record. Add: A  @  $SERVER_IP"; else bad "$n has no DNS A record. Add: A  www  $SERVER_IP"; fi
        continue
    fi
    if [ "$(echo $ips)" = "$SERVER_IP" ]; then
        ok "$n points straight to this server ($SERVER_IP)"
    elif is_cloudflare $ips; then
        CLOUDFLARE=1
        ok "$n goes through Cloudflare's proxy (orange cloud) — that's fine"
        info "In Cloudflare its A record should be $SERVER_IP."
    else
        bad "$n points to $ips — it must point to $SERVER_IP (or through Cloudflare's proxy)"
        info "Change the A record at your DNS provider, and delete any other A/AAAA/CNAME records for it."
    fi
    if [ -n "$v6" ] && ! is_cloudflare $v6 && ! ip -6 addr 2>/dev/null | grep -qF "$(echo $v6 | awk '{print $1}')"; then
        bad "$n has an IPv6 (AAAA) record ($v6) that isn't this server. Delete that AAAA record."
    fi
done

# 3. What does a visitor actually get? (goes out through DNS and Cloudflare, like a browser)
if [ -n "$(getent ahostsv4 "$DOMAIN" 2>/dev/null)" ]; then
    for scheme in https http; do
        out="$(curl -s --max-time 15 -L --max-redirs 5 -w '\n%{http_code} %{url_effective}' "$scheme://$DOMAIN/" 2>/dev/null)"
        meta="$(echo "$out" | tail -n 1)"; code="${meta%% *}"; final="${meta#* }"
        if echo "$out" | grep -q "$MARK"; then
            ok "Visitors to $scheme://$DOMAIN get the website"
        elif echo "$final" | grep -q "staff\.$DOMAIN"; then
            bad "Visitors to $scheme://$DOMAIN are sent to $final"
            info "Turn off any 'domain forwarding' / 'URL redirect' / Cloudflare Page Rule or Redirect Rule"
            info "that sends $DOMAIN to the staff portal."
        elif echo "$out" | grep -qi "staff portal"; then
            bad "Visitors to $scheme://$DOMAIN get the staff portal"
            info "Run the installer again so this server answers HTTPS for $DOMAIN:"
            info "  cd /root/HorizonNetwork && git pull && sudo bash staff-portal/install.sh"
        elif [ "$CLOUDFLARE" = 1 ] && [[ "$code" =~ ^52[0-9]$ ]]; then
            bad "Cloudflare shows error $code for $scheme://$DOMAIN (it can't reach this server properly)"
            [ "$code" = 526 ] && info "Cloudflare's SSL mode is 'Full (strict)' but there's no Let's Encrypt certificate yet. Set SSL/TLS to 'Full' in Cloudflare, run the installer again, then you can switch back to 'Full (strict)'."
            [ "$code" = 525 ] || [ "$code" = 521 ] || [ "$code" = 522 ] && info "Run the installer again, and make sure ports 80 and 443 are open on the server."
        else
            bad "Visitors to $scheme://$DOMAIN don't get the website (HTTP $code at $final)"
        fi
    done
fi

echo ""
if [ "$PROBLEMS" = 0 ]; then
    echo -e "${GREEN}  Everything looks right. If your browser still shows the staff portal, it has remembered an${RESET}"
    echo -e "${GREEN}  old redirect: try a private/incognito window, or clear the browser's cache for $DOMAIN.${RESET}"
    [ "$CLOUDFLARE" = 1 ] && echo -e "${GREEN}  Behind Cloudflare you can also purge its cache: Caching → Configuration → Purge Everything.${RESET}"
else
    echo -e "${YELLOW}  Fix the items marked [✗] above, then run: sudo bash hngroup-site/check.sh${RESET}"
fi
echo ""
