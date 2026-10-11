# 14 cumbres. Un horizonte extraordinario.

Película promocional de 180 s sobre los 14 ochomiles, de Shishapangma (8.027 m) a Everest
(8.848,86 m), para «[NOMBRE DE LA EMPRESA]». Todo lo que se ve y se oye se genera por
código a partir de datos reales: el relieve del Copernicus DEM GLO-30, el color de la
superficie de Sentinel-2, la cartografía de Natural Earth y Terrain Tiles, y una partitura
original. No hay metraje, fotos ni música de archivo.

**Estado:** terminada y verificada sobre los archivos exportados
([`docs/revision.md`](docs/revision.md)). La identidad de marca es provisional (véase
«Campos pendientes de la empresa»). Las versiones de más de 100 MB todavía no están en el
repositorio (véase «Entregas»).

## Entregas

Todas las versiones van a 24 fps, con color BT.709 etiquetado y sonido estéreo a 48 kHz,
masterizado a −14 LUFS con el pico verdadero por debajo de −1 dBTP. Los valores de la
tabla se han medido sobre cada archivo (`render/verificacion.json`).

| Archivo | Qué es | Formato | Sonido medido | Tamaño | Dónde |
|---|---|---|---|---|---|
| `14_cumbres_1080p24_web.mp4` | Película, 180 s | 1920 × 1080 · H.264 High a dos pasadas, 4,0 Mbps de media · AAC 320 kbps | −14,2 LUFS · −1,2 dBTP | 97,7 MB | [`entregables/`](entregables/) |
| `14_cumbres_teaser_30s_1080p24.mp4` | Teaser, 30 s | 1920 × 1080 · H.264 High, CRF 17 · AAC 320 kbps | −14,2 LUFS · −1,5 dBTP | 42,6 MB | [`entregables/`](entregables/) |
| `14_cumbres_teaser_30s_vertical_1080x1920.mp4` | Teaser vertical 9:16, 30 s | 1080 × 1920 · H.264 High, CRF 17 · AAC 320 kbps | −14,2 LUFS · −1,5 dBTP | 32,2 MB | [`entregables/`](entregables/) |
| `fijos/14_cumbres_01…03_*.png` y `.jpg` | Tres fijos promocionales | 3840 × 2160, renderizados directamente (PNG de 8 bits y JPG de calidad 95) | — | 1,4–11,9 MB | [`entregables/fijos/`](entregables/fijos/) |
| `14_cumbres_2160p24.mp4` | Película, 180 s, **4K** | 3840 × 2160 · H.264 High, CRF 18 (49,9 Mbps) · AAC 320 kbps | −14,2 LUFS · −1,2 dBTP | 1.122,4 MB | pendiente de subir |
| `14_cumbres_1080p24.mp4` | Película, 180 s, 1080p de alta calidad | 1920 × 1080 · H.264 High, CRF 17 (13,7 Mbps) · AAC 320 kbps | −14,2 LUFS · −1,2 dBTP | 307,3 MB | pendiente de subir |
| `14_cumbres_teaser_30s_2160p24.mp4` | Teaser, 30 s, 4K | 3840 × 2160 · H.264 High, CRF 18 · AAC 320 kbps | −14,2 LUFS · −1,5 dBTP | 164,7 MB | pendiente de subir |
| `14_cumbres_master_2160p24_hevc422_10bit.mov` | Máster de archivo | 3840 × 2160 · HEVC 4:2:2 de 10 bits, CRF 16 · PCM de 24 bits | −14,1 LUFS · −1,6 dBTP | 1.142,2 MB | pendiente de subir |

**Por qué faltan las versiones grandes.** GitHub no admite archivos de más de 100 MB en
git normal; para eso está Git LFS, y el repositorio ya lo tiene preparado:
`.gitattributes` manda a LFS todo lo que se guarde en `entregables/alta_calidad/`. Pero la
política de red de este entorno de Claude Code bloquea `lfs.github.com` (el proxy
responde 403), así que la subida falla. Hay dos formas de tenerlas:

1. Añadir `lfs.github.com` a los dominios permitidos en la configuración de red del
   entorno ([documentación](https://code.claude.com/docs/en/cloud-environments#network-access)).
   Después basta con copiar los cuatro archivos a `entregables/alta_calidad/` y hacer
   commit y push.
2. Regenerarlas en cualquier máquina con `./reproducir.sh`.

La 1080p «web» es la misma película que la 1080p de alta calidad, con menos tasa de bits.
Cede algo de detalle fino y, con el contraste exagerado, se nota que aplana el grano en los
fondos más oscuros. Para proyección o pantallas grandes conviene la 4K o la 1080p de alta
calidad.

Sin locución no hay subtítulos, así que no se entrega SRT
([`docs/guion.md`](docs/guion.md)).

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/guion.md`](docs/guion.md) | Guion final con TC, fotogramas y compases; texto íntegro en pantalla; teaser y versión vertical |
| [`docs/storyboard.md`](docs/storyboard.md) | Storyboard con fotogramas reales del corte final |
| [`docs/fuentes_y_licencias.md`](docs/fuentes_y_licencias.md) | Convención de altitudes, fuentes de cada dato, datos geográficos, licencias y lo que es ilustrativo |
| [`docs/revision.md`](docs/revision.md) | Revisión en tres pasadas sobre archivos exportados, con medidas |

## Campos pendientes de la empresa

La identidad de marca es provisional y se edita sin tocar la animación:

- `config/brand.json` → `name` es un marcador («NOMBRE DE LA EMPRESA»), y `contact` está
  vacío porque no se facilitó una web ni un teléfono reales.
- El logotipo provisional (un sol ámbar tras una arista) se dibuja en
  `src/render/titles.py` (`logo_mark`).
- Al cambiarlos solo hay que volver a renderizar la firma (f 4032–4319: los tres últimos
  segmentos), reensamblar y rehacer las versiones que la incluyen:

  ```bash
  rm render/seg/4032_4128.mkv render/seg/4128_4224.mkv render/seg/4224_4320.mkv
  python3 -m src.edit.render_film render && python3 -m src.edit.render_film assemble --master
  python3 -m src.edit.render_film web
  python3 -m src.edit.teaser && python3 -m src.edit.vertical
  python3 -m src.edit.storyboard
  python3 -m src.edit.render_film verify --ssim
  ```

## Cómo se hizo

| Carpeta | Contenido |
|---|---|
| `config/` | Datos editoriales verificados (`peaks.json`) e identidad de marca (`brand.json`) |
| `src/geo/` | Descarga y preparación: DEM, Sentinel-2, albedo, horizontes, mapa base |
| `src/render/` | Motor 3D diferido (OpenGL por software), cielo y atmósfera, nubes, macro procedural, atlas cartográfico, tipografía (Skia + HarfBuzz) |
| `src/edit/` | Guion de planos (`film.py`), montaje por capas (`edl.py`), transiciones, mapas animados, compositor, render final y verificación (`render_film.py`), teaser, versión vertical, storyboard y fijos |
| `src/audio/` | Partitura (60 compases, 80 BPM), síntesis y diseño sonoro, mezcla y máster EBU R128 |
| `assets/fonts/` | Source Serif 4 e Inter (SIL OFL 1.1) |
| `data/` | Datos descargados y procesados (no se versionan: se regeneran) |
| `entregables/` | Las versiones que caben en git normal |

Para reproducirlo todo desde cero: `./reproducir.sh` (versiones en `requirements.txt`).
Con 4 núcleos y 16 GB de memoria, el render en 4K nativo tarda unas 6 horas y las
entregas, unas 3,5 horas más (de ellas, el máster HEVC se lleva casi dos).
