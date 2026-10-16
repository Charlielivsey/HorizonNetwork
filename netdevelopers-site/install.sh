#!/usr/bin/env bash
# Installs or updates developers.horizonetwork.com only (PM2 hn-netdevelopers, port 5130). Data in /var/lib/hn-netdevelopers is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
