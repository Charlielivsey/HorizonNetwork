#!/usr/bin/env bash
# Installs or updates members.hngroup.org.uk only (PM2 hn-members, port 5080). Data in /var/lib/hn-members is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
