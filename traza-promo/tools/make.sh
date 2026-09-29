#!/usr/bin/env bash
# TRAZA · Reconstruye el spot completo: marcas → audio → video → HTML autocontenido.
# Requisitos: node + playwright (Chromium), python3 + numpy + scipy, ffmpeg con libx264.
set -euo pipefail
cd "$(dirname "$0")/.."
JOBS=${JOBS:-3}   # páginas de Chromium en paralelo

node tools/render.mjs --cues tools/cues.json
python3 tools/audio.py tools/cues.json traza-promo.wav
ffmpeg -loglevel error -y -i traza-promo.wav -c:a aac -b:a 160k traza-promo.m4a
rm -rf .frames
node tools/render.mjs --frames .frames --jobs "${JOBS:-3}"
node tools/render.mjs --encode traza-promo.mp4 --frames .frames --audio traza-promo.wav
cp .frames/f0899.png poster.png && rm -rf .frames
node tools/build.mjs traza-promo.m4a traza-promo.html
rm -f traza-promo.wav
echo "listo: traza-promo.mp4 · traza-promo.html · poster.png"
