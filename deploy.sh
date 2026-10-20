#!/usr/bin/env bash
#
# Deploy the browser-output plugin to OpenCode.
#
# WHY THIS EXISTS
#   OpenCode (Bun) caches plugin modules by *file path*. Rewriting the same
#   plugin file and running `opencode reload` does NOT re-execute changed code —
#   the cached module is returned. Only a NEW path (or a full server restart)
#   makes OpenCode import fresh code.
#
# WHAT IT DOES
#   1. Copies index.js into ~/.opencode/plugin/ under a content-hash filename
#      (a new path => a fresh module import).
#   2. Removes previously deployed copies (the plugin `id` comes from the
#      export, so the filename is free to change — still one instance).
#   3. Runs `opencode reload`.
#
# USAGE
#   ./deploy.sh              # deploy ~/Desktop/opencode-browser-output/index.js
#   ./deploy.sh /path/to.js  # deploy a specific file
#
set -euo pipefail

PLUGDIR="${HOME}/.opencode/plugin"
SRC="${1:-${HOME}/Desktop/opencode-browser-output/index.js}"

if [[ ! -f "$SRC" ]]; then
  echo "error: source not found: $SRC" >&2
  exit 1
fi

mkdir -p "$PLUGDIR"
HASH="$(sha1sum "$SRC" | cut -c1-10)"
DEST="${PLUGDIR}/browser-output-${HASH}.js"

if [[ -f "$DEST" ]]; then
  echo "already deployed (same content): $DEST"
else
  rm -f "${PLUGDIR}"/browser-output-*.js
  cp "$SRC" "$DEST"
  echo "deployed: $DEST"
fi

opencode reload
echo "reloaded. tail of plugin log:"
tail -4 "${HOME}/.cache/opencode-browser-output/plugin.log" 2>/dev/null || true
