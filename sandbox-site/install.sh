#!/usr/bin/env bash
# Installs or updates sandbox.horizonetwork.com only (PM2 hn-sandbox, port 5170). Data in /var/lib/hn-sandbox is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
