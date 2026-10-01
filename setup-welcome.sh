#!/usr/bin/env bash
set -e

BLUE='\033[1;34m'
GREEN='\033[0;32m'
GRAY='\033[0;37m'
RED='\033[0;31m'
RESET='\033[0m'

echo ""
echo -e "${BLUE}── Horizon Network Welcome Screen Setup ──${RESET}"
echo ""

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
WELCOME="$REPO_DIR/welcome.sh"

if [ ! -f "$WELCOME" ]; then
    echo -e "${RED}[✗] welcome.sh not found in $REPO_DIR${RESET}"
    exit 1
fi

# 1. Remove ALL old references from .bashrc and .profile
echo -e "${GRAY}[1/4] Cleaning old welcome screen entries from .bashrc and .profile...${RESET}"
for rcfile in ~/.bashrc ~/.profile ~/.bash_profile ~/.bash_login; do
    if [ -f "$rcfile" ]; then
        # Remove any line that calls welcome.sh or horizon
        sed -i '/welcome\.sh/d' "$rcfile"
        sed -i '/HorizonNetwork\/welcome/d' "$rcfile"
        sed -i '/\/usr\/local\/bin\/horizon/d' "$rcfile"
        sed -i '/HN_IN_CONSOLE/d' "$rcfile"
    fi
done

# 2. Remove old symlink/command
echo -e "${GRAY}[2/4] Removing old horizon command...${RESET}"
rm -f /usr/local/bin/horizon

# 3. Install fresh
echo -e "${GRAY}[3/4] Installing welcome screen...${RESET}"
chmod +x "$WELCOME"

# Create the horizon command as a symlink to the repo file
ln -sf "$WELCOME" /usr/local/bin/horizon

# Add to .bashrc — only runs on interactive login, skips if already in console
cat >> ~/.bashrc << 'BASHRC'

# Horizon Network welcome menu
if [ -z "$HN_IN_CONSOLE" ] && [ -t 0 ]; then
    ~/HorizonNetwork/welcome.sh
fi
BASHRC

# 4. Verify
echo -e "${GRAY}[4/4] Verifying...${RESET}"
if [ -L /usr/local/bin/horizon ]; then
    echo -e "${GREEN}[✓]${RESET} horizon command installed"
else
    echo -e "${RED}[✗] horizon symlink failed${RESET}"
fi

if grep -q "HorizonNetwork/welcome.sh" ~/.bashrc; then
    echo -e "${GREEN}[✓]${RESET} .bashrc configured"
else
    echo -e "${RED}[✗] .bashrc entry missing${RESET}"
fi

echo ""
echo -e "${GREEN}Done.${RESET} The welcome menu will show on next login."
echo -e "${GRAY}You can also type 'horizon' at any time to open it.${RESET}"
echo ""
