#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_PATH="/usr/local/bin/horizon-welcome"

echo "Installing Horizon Network welcome screen..."

cp "$SCRIPT_DIR/welcome.sh" "$INSTALL_PATH"
chmod +x "$INSTALL_PATH"

BASHRC="$HOME/.bashrc"
MARKER="# Horizon Network Welcome Screen"

if ! grep -qF "$MARKER" "$BASHRC" 2>/dev/null; then
    cat >> "$BASHRC" <<'EOF'

# Horizon Network Welcome Screen
if [[ $- == *i* ]] && [ -z "$HORIZON_WELCOME_SHOWN" ]; then
    export HORIZON_WELCOME_SHOWN=1
    /usr/local/bin/horizon-welcome
fi
EOF
    echo "Added welcome screen to $BASHRC"
else
    echo "Welcome screen already configured in $BASHRC"
fi

echo "Done. The welcome screen will appear on your next login."
