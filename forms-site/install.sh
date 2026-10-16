#!/usr/bin/env bash
# Installs or updates forms.hngroup.org.uk only (PM2 hn-forms, port 4940). Data in /var/lib/hn-forms is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
