#!/usr/bin/env bash
set -e

BLUE='\033[1;34m'
GREEN='\033[0;32m'
GRAY='\033[0;37m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

echo ""
echo -e "${BLUE}══════════════════════════════════════════════════${RESET}"
echo -e "${BLUE}  Horizon Network — Welcome Screen Installer${RESET}"
echo -e "${BLUE}══════════════════════════════════════════════════${RESET}"
echo ""

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO_DIR/welcome.sh"

if [ ! -f "$SRC" ]; then
    echo -e "${RED}[✗] welcome.sh not found in $REPO_DIR${RESET}"
    exit 1
fi

# ── STEP 1: Nuke everything old ──────────────────────────────────
echo -e "${YELLOW}[1/4] Removing ALL old welcome screen traces...${RESET}"

# Remove old command
rm -f /usr/local/bin/horizon

# Remove old profile.d script
rm -f /etc/profile.d/horizon-welcome.sh
rm -f /etc/profile.d/horizon.sh

# Clean every user's shell rc files
for home_dir in /root /home/*; do
    [ -d "$home_dir" ] || continue
    for rcfile in "$home_dir/.bashrc" "$home_dir/.profile" "$home_dir/.bash_profile" "$home_dir/.bash_login"; do
        [ -f "$rcfile" ] || continue
        sed -i '/# Horizon Network welcome menu/d' "$rcfile" 2>/dev/null || true
        sed -i '/HN_IN_CONSOLE.*horizon/d' "$rcfile" 2>/dev/null || true
        sed -i '/\/usr\/local\/bin\/horizon/d' "$rcfile" 2>/dev/null || true
        sed -i '\|HorizonNetwork/welcome\.sh|d' "$rcfile" 2>/dev/null || true
    done
done

echo -e "${GREEN}  [✓] Old entries removed${RESET}"

# ── STEP 2: Copy the script to /usr/local/bin ────────────────────
echo -e "${YELLOW}[2/4] Installing horizon command...${RESET}"

cp -f "$SRC" /usr/local/bin/horizon
chmod 755 /usr/local/bin/horizon

echo -e "${GREEN}  [✓] /usr/local/bin/horizon installed${RESET}"

# ── STEP 3: System-wide login hook ───────────────────────────────
echo -e "${YELLOW}[3/4] Setting up system-wide login hook...${RESET}"

cat > /etc/profile.d/horizon.sh << 'EOF'
if [ -z "$HN_IN_CONSOLE" ] && [ -t 0 ] && [ -x /usr/local/bin/horizon ]; then
    /usr/local/bin/horizon
fi
EOF
chmod 644 /etc/profile.d/horizon.sh

echo -e "${GREEN}  [✓] /etc/profile.d/horizon.sh created${RESET}"

# ── STEP 4: Verify ───────────────────────────────────────────────
echo -e "${YELLOW}[4/4] Verifying installation...${RESET}"

PASS=0
FAIL=0

if [ -x /usr/local/bin/horizon ]; then
    echo -e "${GREEN}  [✓] horizon command exists and is executable${RESET}"
    PASS=$((PASS+1))
else
    echo -e "${RED}  [✗] horizon command missing${RESET}"
    FAIL=$((FAIL+1))
fi

if [ -f /etc/profile.d/horizon.sh ]; then
    echo -e "${GREEN}  [✓] profile.d login hook installed${RESET}"
    PASS=$((PASS+1))
else
    echo -e "${RED}  [✗] profile.d hook missing${RESET}"
    FAIL=$((FAIL+1))
fi

if grep -q "User Management" /usr/local/bin/horizon; then
    echo -e "${GREEN}  [✓] Menu has all options (User Management found)${RESET}"
    PASS=$((PASS+1))
else
    echo -e "${RED}  [✗] Menu is outdated (User Management missing)${RESET}"
    FAIL=$((FAIL+1))
fi

if grep -q "Log Out All Sessions" /usr/local/bin/horizon; then
    echo -e "${GREEN}  [✓] Menu has Log Out All Sessions${RESET}"
    PASS=$((PASS+1))
else
    echo -e "${RED}  [✗] Menu missing Log Out All Sessions${RESET}"
    FAIL=$((FAIL+1))
fi

# Check dogday user exists
if id dogday &>/dev/null; then
    echo -e "${GREEN}  [✓] User dogday exists — will see menu on login${RESET}"
    PASS=$((PASS+1))
else
    echo -e "${GRAY}  [—] User dogday does not exist yet${RESET}"
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}All checks passed. ${PASS}/${PASS} OK.${RESET}"
else
    echo -e "${RED}${FAIL} check(s) failed.${RESET}"
fi

echo ""
echo -e "${GREEN}Done.${RESET}"
echo -e "  • Every user will see the menu on SSH login"
echo -e "  • Any user can type ${CYAN}horizon${RESET} to reopen it"
echo -e "  • Press ${CYAN}[1]${RESET} Open Console to get a normal shell"
echo -e "  • Disconnect and reconnect to test"
echo ""
