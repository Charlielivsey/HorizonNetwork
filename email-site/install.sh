#!/usr/bin/env bash
# Installs or updates email.hngroup.org.uk only (PM2 hn-email, port 4910). Data in /var/lib/hn-email is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
