#!/usr/bin/env bash
# Copia lo que sirve el navegador a ochomiles-web/gasherbrum-ii/ (sin src, herramientas ni artifact.html).
set -euo pipefail
cd "$(dirname "$0")/.."
DST=../ochomiles-web/gasherbrum-ii
rm -rf "$DST"
mkdir -p "$DST"
cp index.html "$DST/"
cp -r laminas plantillas datos "$DST/"
echo "copiado a $DST:"; du -sh "$DST"
