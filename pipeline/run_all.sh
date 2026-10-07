#!/usr/bin/env bash
# Regenera todos los datos de public/data y los fixtures de tests desde las fuentes.
# Uso: bash pipeline/run_all.sh   (crea pipeline/.venv la primera vez)
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x pipeline/.venv/bin/python ]; then
  python3 -m venv pipeline/.venv
  pipeline/.venv/bin/pip install -q --upgrade pip
  pipeline/.venv/bin/pip install -q -r pipeline/requirements.txt
fi
PY=pipeline/.venv/bin/python
$PY pipeline/01_descargar.py
$PY pipeline/02_terreno.py
$PY pipeline/03_imagen.py
$PY pipeline/04_rutas_poi.py
echo "Listo: public/data actualizado."
