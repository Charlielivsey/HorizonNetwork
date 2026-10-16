#!/usr/bin/env bash
# Installs or updates tools.horizonetwork.com only (PM2 hn-tools, port 5160). Data in /var/lib/hn-tools is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
