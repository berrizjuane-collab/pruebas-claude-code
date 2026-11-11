#!/usr/bin/env bash
# Reconstruye el reel completo. Cambiar de voz: VOICE=es-ES-AlvaroNeural ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
VOICE="${VOICE:-en-US-AndrewMultilingualNeural}" RATE="${RATE:--2%}" python3 tts.py audio/vo   # 1. narración + tiempos por palabra
python3 build_timeline.py audio/vo                                                              # 2. línea de tiempo y subtítulos
python3 music.py audio audio/vo                                                                 # 3. banda sonora + mezcla
node render.cjs                                                                                 # 4. 2.655 fotogramas -> build/video.mp4
ffmpeg -y -loglevel error -i build/video.mp4 -i audio/mix.wav -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -profile:v high -level 4.2 -r 30 -g 60 \
  -af "alimiter=limit=0.89:attack=4:release=60,loudnorm=I=-14:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 224k \
  -movflags +faststart -t 88.5 annapurna-1950-reel.mp4                                          # 5. máster
echo "listo: annapurna-1950-reel.mp4"
