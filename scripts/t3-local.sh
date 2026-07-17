#!/bin/bash
# Wrapper so `t3` prefers the locally rebuilt desktop app (with open-workspace support).
REPO_ROOT="/Users/dngulyachenkov/GolandProjects/t3code"
export T3CODE_DESKTOP_BINARY="$REPO_ROOT/scripts/t3-code-desktop-local.mjs"
exec "$REPO_ROOT/apps/server/dist/bin.mjs" "$@"
