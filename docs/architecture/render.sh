#!/usr/bin/env bash
# Render every Mermaid source in src/ to an SVG in rendered/.
# Reproducible, offline-capable, no proprietary cloud: uses mermaid-cli (headless Chromium).
#
# Usage:
#   ./render.sh                # render all diagrams
#   ./render.sh c2-container   # render a single diagram by basename
#
# Requires: Node.js + pnpm/npx. mermaid-cli is fetched on demand via npx.
set -euo pipefail
cd "$(dirname "$0")"

MMDC=(npx -y @mermaid-js/mermaid-cli@latest)
CONFIG="mermaid.config.json"
mkdir -p rendered

render_one() {
  local f="$1"
  local name
  name="$(basename "$f" .mmd)"
  echo "→ rendering $name.svg"
  "${MMDC[@]}" -i "$f" -o "rendered/$name.svg" -c "$CONFIG" -b transparent
}

if [[ $# -gt 0 ]]; then
  render_one "src/$1.mmd"
else
  for f in src/*.mmd; do render_one "$f"; done
fi

echo "Done. SVGs in ./rendered/"
