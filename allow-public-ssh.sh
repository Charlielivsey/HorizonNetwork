#!/usr/bin/env bash
# Re-opens SSH on the public IP with password login (undoes setup-tailscale-ssh.sh).
set -e

PUBLIC_IP="217.154.34.205"
SSHD_CONFIG="/etc/ssh/sshd_config"
DROPIN_DIR="/etc/ssh/sshd_config.d"
DROPIN="$DROPIN_DIR/00-horizon-public.conf"
BACKUP="/etc/ssh/sshd_config.backup.$(date +%Y%m%d%H%M%S)"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}  [✓]${RESET} $1"; }
warn() { echo -e "${YELLOW}  [!]${RESET} $1"; }
fail() { echo -e "${RED}  [✗]${RESET} $1"; }

echo ""
echo -e "${CYAN}  Horizon Network — Allow SSH on public IP${RESET}"
echo -e "${CYAN}  =========================================${RESET}"
echo ""

if [ "$(id -u)" -ne 0 ]; then
    fail "Run this script as root."
    exit 1
fi

# 1. Back up
cp "$SSHD_CONFIG" "$BACKUP"
ok "Backed up sshd_config to $BACKUP"

restore() {
    fail "SSH config invalid — restoring backup"
    cp "$BACKUP" "$SSHD_CONFIG"
    rm -f "$DROPIN"
    exit 1
}

# 2. Remove the Tailscale lockdown and any conflicting settings
sed -i '/# Horizon Network/,/^$/d' "$SSHD_CONFIG"
sed -i -E '/^\s*(ListenAddress|AddressFamily|PasswordAuthentication|PermitRootLogin)\b/d' "$SSHD_CONFIG"
ok "Removed Tailscale-only ListenAddress and password lockdown"

# 3. Allow password + root login. Drop-in files are read first, so this wins over
#    distro defaults like 50-cloud-init.conf (sshd uses the first value it sees).
if grep -qE '^\s*Include\s+/etc/ssh/sshd_config\.d/' "$SSHD_CONFIG"; then
    mkdir -p "$DROPIN_DIR"
    cat > "$DROPIN" << EOF
# Horizon Network — SSH on all addresses with password login
PasswordAuthentication yes
KbdInteractiveAuthentication yes
PermitRootLogin yes
EOF
    ok "Wrote $DROPIN"
else
    cat >> "$SSHD_CONFIG" << EOF

# Horizon Network — SSH on all addresses with password login
PasswordAuthentication yes
PermitRootLogin yes
EOF
    ok "Updated $SSHD_CONFIG"
fi

sshd -t || restore
ok "SSH config is valid"

# 4. Remove the firewall rule blocking port 22 on the public IP
REMOVED=0
while iptables -D INPUT -d "$PUBLIC_IP" -p tcp --dport 22 -j DROP 2>/dev/null; do
    REMOVED=$((REMOVED + 1))
done
ok "Removed $REMOVED iptables rule(s) blocking port 22 on $PUBLIC_IP"

if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow 22/tcp >/dev/null
    ok "UFW: allowed 22/tcp"
fi

if command -v netfilter-persistent &>/dev/null; then
    netfilter-persistent save >/dev/null 2>&1 && ok "Saved firewall rules"
elif [ -d /etc/iptables ]; then
    iptables-save > /etc/iptables/rules.v4 && ok "Saved firewall rules to /etc/iptables/rules.v4"
fi

# 5. Restart SSH (handles Ubuntu's socket-activated ssh.socket as well as plain sshd)
systemctl daemon-reload
if systemctl is-active --quiet ssh.socket 2>/dev/null; then
    systemctl restart ssh.socket
fi
systemctl restart ssh 2>/dev/null || systemctl restart sshd
ok "SSH restarted (your current session stays open)"

# 6. Verify
echo ""
echo -e "${CYAN}  Verifying...${RESET}"
sleep 1
EFFECTIVE=$(sshd -T 2>/dev/null)
echo "$EFFECTIVE" | grep -q "^passwordauthentication yes" && ok "Password login: enabled" || fail "Password login: still disabled"
echo "$EFFECTIVE" | grep -q "^permitrootlogin yes" && ok "Root login: allowed" || fail "Root login: not allowed"

if ss -tln | grep -qE '(0\.0\.0\.0|\*|\[::\]):22\b'; then
    ok "SSH is listening on all addresses (port 22)"
else
    fail "SSH is not listening on all addresses:"
    ss -tln | grep ':22\b' | sed 's/^/      /'
fi

if iptables -C INPUT -d "$PUBLIC_IP" -p tcp --dport 22 -j DROP 2>/dev/null; then
    fail "A firewall rule still blocks port 22 on $PUBLIC_IP"
else
    ok "No firewall rule blocking port 22 on $PUBLIC_IP"
fi

echo ""
echo -e "${CYAN}  ═════════════════════════════════════════${RESET}"
echo -e "  You can now log in from HN Secure Enclave with:"
echo -e "    ${CYAN}root@${PUBLIC_IP}${RESET} + your root password"
echo ""
echo -e "  If it still times out, check your VPS provider's"
echo -e "  firewall in their control panel allows TCP port 22."
echo -e "${CYAN}  ═════════════════════════════════════════${RESET}"
echo ""
