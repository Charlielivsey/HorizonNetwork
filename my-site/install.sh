#!/usr/bin/env bash
# Installs or updates my.horizonetwork.com only (PM2 hn-my, port 5190). Data in /var/lib/hn-my is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
