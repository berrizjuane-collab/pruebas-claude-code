#!/usr/bin/env bash
# Renderiza las seis láminas (masters PNG sin pérdida).
#   bash herramientas/renderizar.sh <carpeta_salida> [ancho alto] [escena,escena,...]
# Por defecto 5120x2880 (unos 10 min por lámina con 4 núcleos y ~9 GB de RAM). 7680x4320 también vale
# (todo se mide en unidades U = sqrt(ancho·alto)/1946: es el mismo cuadro con más definición).
set -euo pipefail
OUT=${1:?carpeta de salida}
W=${2:-5120}; H=${3:-2880}
ESC=${4:-poon_hill,campo_base,campo_1,campo_2,campo_3,cumbre}
cd "$(dirname "$0")/.."
for e in ${ESC//,/ }; do
  python3 generar.py "$e" "$W" "$H" --salida "$OUT" 2>&1 | grep -v RuntimeWarning | grep -v "X1 = buf"
done
