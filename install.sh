#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_PATH="/usr/local/bin/horizon-welcome"

echo "Installing Horizon Network welcome screen..."

# Install Node.js and PM2 if not present
if ! command -v node &>/dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

if ! command -v pm2 &>/dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
    pm2 startup systemd -u root --hp /root 2>/dev/null || true
    echo "PM2 installed."
fi

# Install welcome script
cp "$SCRIPT_DIR/welcome.sh" "$INSTALL_PATH"
chmod +x "$INSTALL_PATH"

# Add 'horizon' shortcut command
ALIAS_PATH="/usr/local/bin/horizon"
cat > "$ALIAS_PATH" << 'EOF'
#!/usr/bin/env bash
exec /usr/local/bin/horizon-welcome
EOF
chmod +x "$ALIAS_PATH"

# Add auto-launch on login
BASHRC="$HOME/.bashrc"
MARKER="# Horizon Network Welcome Screen"

if ! grep -qF "$MARKER" "$BASHRC" 2>/dev/null; then
    cat >> "$BASHRC" << 'EOF'

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

echo ""
echo "Done! PM2 is installed. The welcome screen appears on login."
echo "Type 'horizon' at any time to reopen the welcome screen."
