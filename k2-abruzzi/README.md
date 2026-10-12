# K2 · Espolón de los Abruzos

Animación cinematográfica de ~56 s que sigue la ruta normal del K2 (8.611 m) por el
**Espolón de los Abruzos**, vertiente paquistaní: del Campo Base sobre el glaciar
Godwin-Austen a la cumbre, pasando por la Chimenea de House, la Pirámide Negra, el Hombro
(Campamento IV), el Bottleneck bajo el serac y la travesía, y la arista final.

| Archivo | Contenido |
|---|---|
| `output/K2_Espolon_de_los_Abruzos.mp4` | 1920×1080, 24 fps, H.264 + AAC 48 kHz, pista de subtítulos en español (activable) |
| `output/K2_Espolon_de_los_Abruzos_subtitulado.mp4` | La misma pieza con los subtítulos incrustados |
| `output/K2_Espolon_de_los_Abruzos.srt` | Subtítulos (transcripción fiel de la narración) |

## Cómo está hecha

La técnica es la de la **rotoscopia pictórica**: primero se rueda una "referencia" y
luego se pinta encima, fotograma a fotograma.

1. **Referencia geográfica real.** El relieve es el modelo digital de elevación
   *Copernicus GLO-30* (ESA, 30 m) de 3×3 grados alrededor del K2, reproyectado a un
   marco local (este-norte-altitud) centrado en la cumbre, con curvatura terrestre y
   refracción. Sobre él se trazó la ruta: el espolón se siguió por la línea de cresta
   del DEM (C1 ≈ 6.050 m, Chimenea de House ≈ 6.600 m, C2 ≈ 6.700 m, Pirámide Negra
   ≈ 6.700–7.400 m, C3 ≈ 7.400 m, Hombro ≈ 7.700–8.000 m); por encima del Hombro la
   pirámide cimera se esculpió según las descripciones de la ruta: el corredor del
   Bottleneck (~8.200 m) bajo un serac colgante, la travesía expuesta **hacia la
   izquierda** bajo la pared de hielo y la pala/arista final hasta 8.611 m.
2. **Render de referencia** (`src/raymarch.py`, `src/scene.py`): trazador de rayos
   sobre campos de alturas anidados (100 m → 10 m → 2,5 m → 0,3 m en primeros planos),
   sombras suaves, cielo y perspectiva aérea por hora del día, nubes volumétricas
   (mar de nubes y penacho de nieve en la cumbre).
3. **Pintura** (`src/painter.py`, `src/brushes.py`): cada pincelada es una partícula
   anclada a un punto del terreno (o a una dirección del cielo); se reproyecta con la
   cámara, se ocultan las que quedan tapadas y se rellenan los huecos. Las pinceladas
   siguen los contornos y la línea de máxima pendiente, toman el color de la
   referencia y se vuelven a pintar **cada dos fotogramas ("on twos")**, de modo que
   la textura "hierve" sutilmente como en la animación pintada a mano. Cuatro capas
   (mancha, cuerpo, detalle, fino), lienzo y relieve de empaste.
4. **Personajes** (`src/figures.py`): escaladores 2D animados (jumar en cuerdas fijas,
   travesía, cumbre) iluminados con la luz de la escena y repintados con pinceladas;
   cuerdas fijas, tiendas del Campo Base y del Campamento IV, frontales en la noche.
5. **Montaje** (`src/compose.py`): transiciones pintadas (el plano siguiente entra con
   pinceladas en la dirección del ascenso; cae la noche desde arriba; la travesía
   entra hacia la izquierda), rótulos tipográficos y fundidos.

### Sonido
* **Narración**: voz neuronal en español de México (Piper `es_MX-claude-high`,
  fonemas es-419 con seseo) vía sherpa-onnx. Cada frase se generó en varias tomas y se
  eligió la mejor transcribiéndola con Whisper *dentro de la mezcla final* (tasa de
  error de palabras ≈ 6 % con música y efectos sonando). Cadena: filtro paso alto,
  ecualización, de-esser, compresor 3:1 y una sala muy corta.
* **Música original** (`src/audio/music.py`): partitura en re menor escrita para
  esta pieza y tocada con las muestras orquestales **VSCO-2 Community Edition (CC0)**:
  bordón y armónicos al inicio, tema de la ruta (i–VI–III–VII), pulso de spiccato en
  la Chimenea, trompas y timbales en la Pirámide Negra, respiración contenida en el
  Hombro, ostinato cromático y latido de timbal en el Bottleneck, crescendo en la
  travesía, re mayor en la cumbre y una quinta vacía al final (aún queda bajar).
* **Diseño sonoro sintetizado** (`src/audio/sfx.py`): viento de altura con ráfagas,
  nieve en polvo, crampones, jumars y mosquetones, lona de tiendas, respiración,
  crujidos del hielo.
* **Mezcla** (`src/audio/mixdown.py`): la música se atenúa ~7 dB bajo la voz
  (sidechain), efectos ~4 dB; master a −16 LUFS integrados, techo −1 dBTP.

## Rigor y licencias
* Las alturas de los rótulos son aproximadas (`≈`), como en las fuentes; la posición
  de los campamentos varía cada temporada.
* No se muestran peligros ni accidentes ficticios: el serac cruje, no cae.
* El ascenso se resume a lo largo de una expedición: del día en el Campo Base al
  atardecer en el Campamento IV, la noche en el Bottleneck, el alba en la travesía y la
  mañana en la cumbre.
* Datos y recursos: Copernicus DEM GLO-30 (© DLR e.V. 2010-2014 y © Airbus Defence and
  Space GmbH 2014-2018, proporcionado bajo COPERNICUS por la Unión Europea y la ESA);
  VSCO-2 CE (CC0); voz Piper `es_MX-claude-high` (Apache-2.0); tipografías Cormorant
  Garamond e Inter (SIL OFL).

## Reconstruir
```bash
pip install numba scipy opencv-python-headless rasterio sherpa-onnx soundfile librosa pyloudnorm
python3 src/terrain_build.py          # DEM -> rejillas ENU (descarga previa de 9 teselas GLO-30)
python3 src/audio/narration.py        # voz (modelos Piper/Whisper de sherpa-onnx)
python3 src/audio/music.py && python3 src/audio/sfx.py && python3 src/audio/mixdown.py
cd src && python3 render.py groups basecamp+spur chimney pyramid shoulder bottleneck traverse ridge summit+pullback
python3 compose.py && python3 encode.py
```
