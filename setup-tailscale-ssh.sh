#!/usr/bin/env bash
set -e

TAILSCALE_IP="100.95.232.62"
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

# Check Tailscale is installed and running
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

# Step 3: Lock down OpenSSH to Tailscale interface only
echo -e "${CYAN}  Step 3: Locking SSH to Tailscale interface...${RESET}"

# Remove any existing ListenAddress lines
sed -i '/^ListenAddress /d' "$SSHD_CONFIG"
sed -i '/^#ListenAddress /d' "$SSHD_CONFIG"

# Remove any existing PasswordAuthentication lines
sed -i '/^PasswordAuthentication /d' "$SSHD_CONFIG"
sed -i '/^#PasswordAuthentication /d' "$SSHD_CONFIG"

# Add our config at the end
cat >> "$SSHD_CONFIG" << EOF

# Horizon Network — Tailscale lockdown
ListenAddress ${TAILSCALE_IP}
PasswordAuthentication no
EOF

echo -e "${GREEN}  [✓]${RESET} SSH now only listens on ${TAILSCALE_IP}"
echo -e "${GREEN}  [✓]${RESET} Password authentication disabled"
echo ""

# Step 4: Configure firewall to block SSH on public interface
echo -e "${CYAN}  Step 4: Configuring firewall...${RESET}"
if command -v ufw &>/dev/null; then
    ufw delete allow 22/tcp 2>/dev/null || true
    ufw delete allow OpenSSH 2>/dev/null || true
    ufw allow in on tailscale0 to any port 22 proto tcp comment "SSH via Tailscale only" 2>/dev/null || true
    echo -e "${GREEN}  [✓]${RESET} UFW rules updated — port 22 blocked on public IP"
else
    echo -e "${YELLOW}  [!]${RESET} UFW not found — skipping firewall rules"
    echo -e "      Consider installing ufw: apt install ufw"
fi
echo ""

# Step 5: Restart SSH
echo -e "${CYAN}  Step 5: Restarting SSH service...${RESET}"
systemctl restart sshd
echo -e "${GREEN}  [✓]${RESET} SSH restarted"
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
echo -e "  ${RED}SSH on 217.154.34.205 is now disabled.${RESET}"
echo -e "  If you get locked out, use your VPS provider's"
echo -e "  console to restore: cp $SSHD_BACKUP $SSHD_CONFIG"
echo -e "${CYAN}  ══════════════════════════════════════════${RESET}"
echo ""
