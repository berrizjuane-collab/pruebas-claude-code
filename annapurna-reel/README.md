# Annapurna 1950 — reel

Reel vertical (1080×1920, 30 fps, 1:28) sobre la primera ascensión a un ochomil:
Annapurna I, 3 de junio de 1950 (Maurice Herzog y Louis Lachenal).

**Vídeo final:** `annapurna-1950-reel.mp4`

## Cómo está hecho

| Pieza | Archivo | Técnica |
|---|---|---|
| Animación | `src/` | Canvas 2D procedural, estilo *paper-cut*: cada montaña es una hoja de papel recortado con textura, canto iluminado y sombra proyectada. Todo es función pura de `t`, así que el render es reproducible fotograma a fotograma. |
| Narración | `tts.py` | Voz neural con marcas de tiempo por palabra (alimentan los subtítulos sincronizados). |
| Guion visual | `build_timeline.py` | Une los tiempos de la voz con las escenas y los bloques de subtítulos. |
| Música | `music.py` | Partitura original escrita en código (MIDI → orquesta muestreada con FluidSynth) + diseño sonoro sintetizado + mezcla con *ducking* bajo la voz. |
| Render | `render.cjs` | 4 páginas de Chromium pintan en paralelo y vuelcan a ffmpeg. |

## Reconstruir

```bash
pip install edge-tts numpy scipy
apt-get install -y fluidsynth fluid-soundfont-gm ffmpeg
./build.sh                               # o: VOICE=es-ES-AlvaroNeural ./build.sh
```

Vista previa en el navegador: abrir `src/index.html?play` (tiempo real) o `?t=48.5` (un instante).

## Fuentes de los hechos

Los datos narrados (fecha y hora de cumbre, 8.091 m, ascenso sin oxígeno, el diálogo
Herzog–Lachenal, la noche en la grieta, las congelaciones y la frase final) proceden de
*Annapurna, premier 8.000* (M. Herzog, 1951). El relato de Herzog ha sido matizado por
otros miembros de la expedición; el reel cuenta la versión canónica.

Tipografías: Fraunces y Barlow Condensed (SIL Open Font License).
