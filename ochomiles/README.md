# 14 cumbres. Un horizonte extraordinario.

Película promocional de 180 s sobre los 14 ochomiles, de Shishapangma (8.027 m) a Everest
(8.848,86 m), para «[NOMBRE DE LA EMPRESA]». Todo lo que se ve y se oye se genera por
código a partir de datos reales: el relieve del Copernicus DEM GLO-30, el color de la
superficie de Sentinel-2, la cartografía de Natural Earth y Terrain Tiles, y una partitura
original. No hay metraje, fotos ni música de archivo.

**Estado:** película montada y revisada; render final en 4K en curso.

## Entregas

Se publicarán en `entregables/` cuando termine el render 4K (película en 4K y 1080p,
máster de archivo, teaser de 30 s y tres fijos).

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/guion.md`](docs/guion.md) | Guion final con TC, fotogramas y compases; texto íntegro en pantalla |
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
  segmentos) y reensamblar:

  ```bash
  rm render/seg/4032_4128.mkv render/seg/4128_4224.mkv render/seg/4224_4320.mkv
  python3 -m src.edit.render_film render && python3 -m src.edit.render_film assemble --master
  python3 -m src.edit.teaser
  ```

## Cómo se hizo

| Carpeta | Contenido |
|---|---|
| `config/` | Datos editoriales verificados (`peaks.json`) e identidad de marca (`brand.json`) |
| `src/geo/` | Descarga y preparación: DEM, Sentinel-2, albedo, horizontes, mapa base |
| `src/render/` | Motor 3D diferido (OpenGL por software), cielo y atmósfera, nubes, macro procedural, atlas cartográfico, tipografía (Skia + HarfBuzz) |
| `src/edit/` | Guion de planos (`film.py`), montaje por capas (`edl.py`), transiciones, mapas animados, compositor, render final, teaser, storyboard y fijos |
| `src/audio/` | Partitura (60 compases, 80 BPM), síntesis y diseño sonoro, mezcla y máster EBU R128 |
| `assets/fonts/` | Source Serif 4 e Inter (SIL OFL 1.1) |
| `data/` | Datos descargados y procesados (no se versionan: se regeneran) |

Para reproducirlo todo desde cero: `./reproducir.sh` (versiones en `requirements.txt`).
Con 4 núcleos y 16 GB de memoria, el render en 4K nativo tarda unas 6 horas y las
entregas, alrededor de hora y media más.
