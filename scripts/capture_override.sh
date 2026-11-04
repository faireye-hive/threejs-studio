#!/usr/bin/env bash
# Capture a single upstream file as a Git-tracked override without importing history.
set -euo pipefail
if [[ ${#} -ne 1 ]]; then
  echo "Uso: bash scripts/capture_override.sh editor/js/Viewport.js" >&2
  exit 2
fi
path="$1"
case "$path" in
  editor/*|build/*|examples/jsm/*|examples/fonts/*) ;;
  *) echo "Permitido apenas editor/, build/, examples/jsm/ ou examples/fonts/." >&2; exit 2 ;;
esac
if [[ "$path" = *..* || "$path" = *//* || "$path" = */./* ]]; then
  echo "Caminho inseguro." >&2
  exit 2
fi
src="upstream/$path"
dest="custom/$path"
if [[ ! -f "$src" || -L "$src" ]]; then
  echo "Arquivo original não encontrado: $src" >&2
  exit 1
fi
if [[ -e "$dest" ]]; then
  echo "Override já existe, preservado: $dest" >&2
  exit 1
fi
mkdir -p "$(dirname "$dest")"
cp "$src" "$dest"
echo "Criado: $dest"
echo "Edite esse arquivo e faça git add custom/ para persistir suas alterações."
