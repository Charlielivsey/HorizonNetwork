#!/usr/bin/env bash
set -e

TAILSCALE_IP="100.95.232.62"
PUBLIC_IP="217.154.34.205"
SSHD_CONFIG="/etc/ssh/sshd_config"
SSHD_BACKUP="/etc/ssh/sshd_config.backup.$(date +%Y%m%d%H%M%S)"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}  Horizon Network — Tailscale SSH Lockdown${RESET}"
echo -e "${CYAN}  ==========================================${RESET}"
echo ""

if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}  Error: Run this script as root.${RESET}"
    exit 1
fi

if ! command -v tailscale &>/dev/null; then
    echo -e "${RED}  Error: Tailscale is not installed.${RESET}"
    echo -e "  Install it: curl -fsSL https://tailscale.com/install.sh | sh"
    exit 1
fi

if ! tailscale status &>/dev/null; then
    echo -e "${RED}  Error: Tailscale is not running.${RESET}"
    echo -e "  Start it: tailscale up"
    exit 1
fi

echo -e "${GREEN}  [✓]${RESET} Tailscale is running"
echo -e "      Tailscale IP: ${TAILSCALE_IP}"
echo ""

# Step 1: Enable Tailscale SSH
echo -e "${CYAN}  Step 1: Enabling Tailscale SSH...${RESET}"
tailscale set --ssh
echo -e "${GREEN}  [✓]${RESET} Tailscale SSH enabled"
echo ""

# Step 2: Back up sshd_config
echo -e "${CYAN}  Step 2: Backing up SSH config...${RESET}"
cp "$SSHD_CONFIG" "$SSHD_BACKUP"
echo -e "${GREEN}  [✓]${RESET} Backup saved to $SSHD_BACKUP"
echo ""

# Step 3: Rewrite sshd_config to lock down to Tailscale only
echo -e "${CYAN}  Step 3: Locking SSH to Tailscale interface...${RESET}"

# Remove ALL ListenAddress lines (including commented ones that sshd might pick up)
sed -i '/^\s*#*\s*ListenAddress/d' "$SSHD_CONFIG"
sed -i '/^\s*#*\s*PasswordAuthentication/d' "$SSHD_CONFIG"
sed -i '/^\s*#*\s*AddressFamily/d' "$SSHD_CONFIG"

# Remove any previous Horizon block
sed -i '/# Horizon Network/,/^$/d' "$SSHD_CONFIG"

cat >> "$SSHD_CONFIG" << EOF

# Horizon Network — Tailscale lockdown
AddressFamily inet
ListenAddress ${TAILSCALE_IP}
PasswordAuthentication no
EOF

echo -e "${GREEN}  [✓]${RESET} SSH now ONLY listens on ${TAILSCALE_IP}"
echo -e "${GREEN}  [✓]${RESET} Password authentication disabled"
echo ""

# Step 4: Block SSH on public IP with iptables (works even without UFW)
echo -e "${CYAN}  Step 4: Blocking SSH on public interface...${RESET}"

# iptables: drop SSH on the public IP
iptables -D INPUT -d "$PUBLIC_IP" -p tcp --dport 22 -j DROP 2>/dev/null || true
iptables -I INPUT -d "$PUBLIC_IP" -p tcp --dport 22 -j DROP
echo -e "${GREEN}  [✓]${RESET} iptables: port 22 blocked on ${PUBLIC_IP}"

# Also handle UFW if present
if command -v ufw &>/dev/null; then
    ufw delete allow 22/tcp 2>/dev/null || true
    ufw delete allow OpenSSH 2>/dev/null || true
    ufw allow in on tailscale0 to any port 22 proto tcp comment "SSH via Tailscale only" 2>/dev/null || true
    echo -e "${GREEN}  [✓]${RESET} UFW rules updated"
fi

# Persist iptables rules across reboots
if command -v netfilter-persistent &>/dev/null; then
    netfilter-persistent save 2>/dev/null
    echo -e "${GREEN}  [✓]${RESET} iptables rules saved"
elif command -v iptables-save &>/dev/null; then
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4
    echo -e "${GREEN}  [✓]${RESET} iptables rules saved to /etc/iptables/rules.v4"
fi
echo ""

# Step 5: Validate config before restarting
echo -e "${CYAN}  Step 5: Validating and restarting SSH...${RESET}"
if sshd -t 2>/dev/null; then
    systemctl restart sshd
    echo -e "${GREEN}  [✓]${RESET} SSH config valid — service restarted"
else
    echo -e "${RED}  [✗] SSH config invalid! Restoring backup...${RESET}"
    cp "$SSHD_BACKUP" "$SSHD_CONFIG"
    systemctl restart sshd
    echo -e "${YELLOW}  Backup restored. SSH is unchanged.${RESET}"
    exit 1
fi
echo ""

# Step 6: Verify SSH is only on Tailscale
echo -e "${CYAN}  Step 6: Verifying...${RESET}"
LISTENING=$(ss -tlnp | grep ':22 ' || true)
echo "$LISTENING" | while IFS= read -r line; do
    echo -e "  ${GRAY}$line${RESET}"
done

if echo "$LISTENING" | grep -q "$TAILSCALE_IP"; then
    echo -e "${GREEN}  [✓]${RESET} SSH listening on ${TAILSCALE_IP}:22"
fi
if echo "$LISTENING" | grep -q "0.0.0.0\|$PUBLIC_IP"; then
    echo -e "${RED}  [✗] WARNING: SSH still listening on public interface!${RESET}"
else
    echo -e "${GREEN}  [✓]${RESET} SSH NOT listening on public interface"
fi
echo ""

# Summary
echo -e "${CYAN}  ══════════════════════════════════════════${RESET}"
echo -e "${GREEN}  Setup complete!${RESET}"
echo ""
echo -e "  ${YELLOW}IMPORTANT:${RESET} Keep this session open and test"
echo -e "  in a new terminal before closing:"
echo ""
echo -e "    ${CYAN}ssh root@${TAILSCALE_IP}${RESET}"
echo ""
echo -e "  This will only work when your machine is"
echo -e "  connected to Tailscale. No password needed."
echo ""
echo -e "  ${RED}SSH on ${PUBLIC_IP} is now blocked.${RESET}"
echo -e "  If locked out, use your VPS provider's web console"
echo -e "  to restore: cp $SSHD_BACKUP $SSHD_CONFIG"
echo -e "${CYAN}  ══════════════════════════════════════════${RESET}"
echo ""
