#!/usr/bin/env bash
# Installs or updates community.horizonetwork.com only (PM2 hn-netcommunity, port 5200). Data in /var/lib/hn-netcommunity is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
