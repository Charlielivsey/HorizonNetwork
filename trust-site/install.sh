#!/usr/bin/env bash
# Installs or updates trust.hngroup.org.uk only (PM2 hn-trust, port 4880). Data in /var/lib/hn-trust is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
