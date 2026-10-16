#!/usr/bin/env bash
# Installs or updates downloads.hngroup.org.uk only (PM2 hn-downloads, port 4830). Data in /var/lib/hn-downloads is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
