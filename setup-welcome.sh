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

# 1. Clean old per-user entries from root and all users
echo -e "${GRAY}[1/5] Cleaning old per-user welcome screen entries...${RESET}"
for home_dir in /root /home/*; do
    [ -d "$home_dir" ] || continue
    for rcfile in "$home_dir/.bashrc" "$home_dir/.profile" "$home_dir/.bash_profile" "$home_dir/.bash_login"; do
        if [ -f "$rcfile" ]; then
            sed -i '/welcome\.sh/d' "$rcfile"
            sed -i '/HorizonNetwork\/welcome/d' "$rcfile"
            sed -i '/\/usr\/local\/bin\/horizon/d' "$rcfile"
            sed -i '/HN_IN_CONSOLE/d' "$rcfile"
            sed -i '/Horizon Network welcome menu/d' "$rcfile"
        fi
    done
done

# Also remove old system-wide profile script if it exists
rm -f /etc/profile.d/horizon-welcome.sh

# 2. Remove old symlink/command
echo -e "${GRAY}[2/5] Removing old horizon command...${RESET}"
rm -f /usr/local/bin/horizon

# 3. Install fresh — system-wide for ALL users
echo -e "${GRAY}[3/5] Installing welcome screen system-wide...${RESET}"
chmod +x "$WELCOME"

# Create the horizon command as a symlink
ln -sf "$WELCOME" /usr/local/bin/horizon

# Install system-wide via /etc/profile.d/ — runs for every user on login
cat > /etc/profile.d/horizon-welcome.sh << 'PROFILE'
# Horizon Network welcome menu — runs on login for all users
if [ -z "$HN_IN_CONSOLE" ] && [ -t 0 ] && command -v horizon &>/dev/null; then
    horizon
fi
PROFILE
chmod +x /etc/profile.d/horizon-welcome.sh

# 4. Sync settings to user dogday
echo -e "${GRAY}[4/5] Syncing settings to user dogday...${RESET}"
if id dogday &>/dev/null; then
    DOGDAY_HOME=$(eval echo ~dogday)
    # Make sure dogday can access the repo
    if [ ! -d "$DOGDAY_HOME" ]; then
        echo -e "${RED}[✗] dogday home directory not found${RESET}"
    else
        # Copy root's bashrc settings (minus old welcome stuff, already cleaned)
        # Ensure dogday has a .bashrc
        if [ ! -f "$DOGDAY_HOME/.bashrc" ]; then
            cp /etc/skel/.bashrc "$DOGDAY_HOME/.bashrc" 2>/dev/null || touch "$DOGDAY_HOME/.bashrc"
        fi
        chown dogday:dogday "$DOGDAY_HOME/.bashrc"
        echo -e "${GREEN}[✓]${RESET} dogday configured (system-wide profile handles the menu)"
    fi
else
    echo -e "${RED}[✗] User 'dogday' does not exist${RESET}"
fi

# 5. Verify
echo -e "${GRAY}[5/5] Verifying...${RESET}"
if [ -L /usr/local/bin/horizon ]; then
    echo -e "${GREEN}[✓]${RESET} horizon command installed at /usr/local/bin/horizon"
else
    echo -e "${RED}[✗] horizon symlink failed${RESET}"
fi

if [ -f /etc/profile.d/horizon-welcome.sh ]; then
    echo -e "${GREEN}[✓]${RESET} system-wide login script installed (/etc/profile.d/)"
else
    echo -e "${RED}[✗] profile.d script missing${RESET}"
fi

echo ""
echo -e "${GREEN}Done.${RESET} The welcome menu will show on login for ALL users."
echo -e "${GRAY}Any user can type 'horizon' at any time to open it.${RESET}"
echo ""
