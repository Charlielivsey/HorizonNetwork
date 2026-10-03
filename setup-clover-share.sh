#!/usr/bin/env bash
set -eo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}  Setting up Clover share...${RESET}"
echo ""

if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}  Error: Must be run as root${RESET}"
    exit 1
fi

if ! command -v smbd &>/dev/null; then
    echo -e "${CYAN}  Installing Samba...${RESET}"
    apt-get update -qq
    apt-get install -y -qq samba
fi

SMB_CONF="/etc/samba/smb.conf"

if grep -q '^\[Clover\]' "$SMB_CONF" 2>/dev/null; then
    echo -e "${GREEN}  [✓]${RESET} Clover share already exists in $SMB_CONF"
else
    echo -e "${CYAN}  Adding Clover share to $SMB_CONF...${RESET}"
    cat >> "$SMB_CONF" << 'SHARE'

[Clover]
   comment = Full Drive Access
   path = /
   browseable = yes
   read only = no
   guest ok = no
   valid users = @sudo
   create mask = 0644
   directory mask = 0755
   force user = root
SHARE
    echo -e "${GREEN}  [✓]${RESET} Share added"
fi

echo -e "${CYAN}  Restarting Samba...${RESET}"
systemctl restart smbd 2>/dev/null || service smbd restart 2>/dev/null
echo -e "${GREEN}  [✓]${RESET} Samba restarted"

echo ""
echo -e "${GREEN}  Clover share is ready!${RESET}"
echo ""
echo -e "  ${CYAN}Windows:${RESET}  \\\\217.154.34.205\\Clover"
echo -e "  ${CYAN}macOS:${RESET}    smb://217.154.34.205/Clover"
echo ""
echo -e "  ${RESET}Log in with your VPS username and password.${RESET}"
echo ""
