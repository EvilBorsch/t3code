#!/bin/bash
# Local CLI wrapper: use the rebuilt `t3` from this checkout, but prefer the
# installed desktop app (Nightly in /Applications) — do NOT force the local
# Alpha/.electron-runtime launcher.
#
# Opt into the local rebuilt desktop only when debugging desktop itself:
#   T3CODE_USE_LOCAL_DESKTOP=1 t3 .
set -euo pipefail

SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$SOURCE" ]]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "${T3CODE_USE_LOCAL_DESKTOP:-}" == "1" ]]; then
  export T3CODE_DESKTOP_BINARY="$REPO_ROOT/scripts/t3-code-desktop-local.mjs"
else
  # Ensure a leftover override from the shell does not force Alpha/local.
  unset T3CODE_DESKTOP_BINARY
fi

exec "$REPO_ROOT/apps/server/dist/bin.mjs" "$@"
