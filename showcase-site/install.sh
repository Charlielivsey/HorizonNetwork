#!/usr/bin/env bash
# Installs or updates showcase.horizonetwork.com only (PM2 hn-showcase, port 5140). Data in /var/lib/hn-showcase is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
