#!/usr/bin/env bash
set -euo pipefail
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/offline-site/install.sh"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../website-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
