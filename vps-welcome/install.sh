#!/usr/bin/env bash
# Isolated shell-only install: no package installs, network access or service restarts.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.' >&2; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX="${HN_HORIZON_INSTALL_ROOT:-}"
python3 -c 'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text())' "$ROOT/vps-welcome/horizon.py"
sh -n "$ROOT/vps-welcome/profile.sh"
install -d -m 755 "$PREFIX/usr/local/lib/hn-horizon" "$PREFIX/usr/local/bin" "$PREFIX/etc/profile.d"
install -m 755 "$ROOT/vps-welcome/horizon.py" "$PREFIX/usr/local/lib/hn-horizon/horizon.py"
install -m 644 "$ROOT/admin-site/catalog.json" "$PREFIX/usr/local/lib/hn-horizon/catalog.json"
install -m 644 "$ROOT/vps-welcome/profile.sh" "$PREFIX/etc/profile.d/90-hn-horizon.sh"
cat > "$PREFIX/usr/local/bin/horizon" <<'WRAPPER'
#!/usr/bin/env sh
exec /usr/bin/python3 /usr/local/lib/hn-horizon/horizon.py "$@"
WRAPPER
chmod 755 "$PREFIX/usr/local/bin/horizon"
echo 'HN Group welcome installed. Reopen it with: horizon'
echo 'Interactive SSH logins show the welcome automatically; scripted connections stay unchanged.'
