#!/usr/bin/env bash
# Renderiza las ocho láminas a 5120x2880 (la vertical se recorta de la apaisada en exportar.py).
#   bash renderizar.sh <carpeta_salida> [escena,escena,...]
set -euo pipefail
OUT=${1:?carpeta de salida}
ESC=${2:-gondogoro,campo_base,campo_1,campo_2,campo_3,cumbre,ruta,caravana}
cd "$(dirname "$0")/../src"
for e in ${ESC//,/ }; do
  python3 generar.py "$e" 5120 2880 --salida "$OUT" 2>&1 | grep -v RuntimeWarning | grep -v "X1 = buf"
done
