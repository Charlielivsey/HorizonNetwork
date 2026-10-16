#!/usr/bin/env bash
# Installs or updates security.hngroup.org.uk only (PM2 hn-security, port 5060). Data in /var/lib/hn-security is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
