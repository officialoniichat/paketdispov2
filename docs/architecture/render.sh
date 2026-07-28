#!/usr/bin/env bash
# Rendert jede Mermaid-Quelle aus src/ als SVG nach rendered/.
# Reproduzierbar, offline-fähig, keine proprietäre Cloud: nutzt mermaid-cli (Headless-Chromium).
#
# Aufruf:
#   ./render.sh                # alle Diagramme rendern
#   ./render.sh c2-container   # ein einzelnes Diagramm per Basisname rendern
#
# Voraussetzung: Node.js + pnpm/npx. mermaid-cli wird bei Bedarf via npx geholt.
# Lesbarkeit: mermaid.config.json setzt eine größere Grundschrift (16px, C4 15px) und
# useMaxWidth=false, damit die SVGs ihre natürliche Breite behalten statt auf
# Fensterbreite heruntergestaucht zu werden — der Viewer (index.html) übernimmt Zoom + Pan.
set -euo pipefail
cd "$(dirname "$0")"

MMDC=(npx -y @mermaid-js/mermaid-cli@latest)
CONFIG="mermaid.config.json"
mkdir -p rendered

render_one() {
  local f="$1"
  local name
  name="$(basename "$f" .mmd)"
  echo "→ rendere $name.svg"
  "${MMDC[@]}" -i "$f" -o "rendered/$name.svg" -c "$CONFIG" -b transparent
}

if [[ $# -gt 0 ]]; then
  render_one "src/$1.mmd"
else
  for f in src/*.mmd; do render_one "$f"; done
fi

echo "Fertig. SVGs in ./rendered/"
