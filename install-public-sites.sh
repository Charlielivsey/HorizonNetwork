#!/usr/bin/env bash
# Update only the requested public websites and their narrow shared Auth/staff integrations.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/hngroup-site/install-admin.sh" "${1:-}"
bash "$SCRIPT_DIR/horizon-network-site/install.sh" "${1:-}"
