#!/usr/bin/env bash
# Construye el libro completo: recursos -> HTML -> PDF de pliegos -> PDF de páginas + PDF de revisión -> verificación.
# Uso (desde libro-piratas/):  bash herramientas/construir.sh [ruta_al_pdf_original]
set -euo pipefail
cd "$(dirname "$0")/.."
ORIG="${1:-}"
if [ ! -f recursos/texturas/pergamino_pliego.jpg ]; then python3 herramientas/generar_texturas.py recursos/texturas; fi
if [ -n "$ORIG" ]; then
  python3 herramientas/extraer_ilustraciones.py "$ORIG" recursos/ilustraciones recursos/datos/ilustraciones.json
  python3 herramientas/vectorizar_degradados.py $(grep -l "<image" recursos/ilustraciones/*.svg || true)
fi
[ -d node_modules ] || npm install --silent
node herramientas/generar_mapa.mjs recursos/datos/countries-50m.json recursos/ilustraciones/mapa_caribe.svg
python3 src/decoracion.py recursos/ilustraciones
python3 src/maqueta.py
node herramientas/renderizar.js maqueta/libro.html salida/_pliegos.pdf maqueta/medidas.json
python3 herramientas/exportar.py salida/_pliegos.pdf salida
python3 herramientas/verificar.py maqueta/medidas.json maqueta/indice.json salida/Piratas_del_Caribe_64pp_paginas.pdf
