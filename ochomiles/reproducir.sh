#!/bin/bash
# Reproduce la película completa desde cero: datos, sonido, imagen y entregas.
# Requisitos: requirements.txt + ffmpeg, fluidsynth, musescore-general-soundfont y Mesa (EGL).
# Tiempo orientativo con 4 núcleos y 16 GB: datos ~1 h, render 4K ~6 h, entregas ~1,5 h.
set -euo pipefail
cd "$(dirname "$0")"

# 1. Datos geográficos ---------------------------------------------------------------
python3 src/geo/download_dem.py                    # Copernicus DEM GLO-30 (29 teselas)
mkdir -p data/raw/naturalearth                     # Natural Earth (dominio público)
for f in ne_50m_coastline ne_50m_land ne_50m_admin_0_countries ne_10m_admin_0_countries \
         ne_10m_admin_0_boundary_lines_land ne_10m_admin_0_boundary_lines_disputed_areas \
         ne_10m_rivers_lake_centerlines ne_10m_lakes ne_10m_glaciated_areas \
         ne_10m_geography_regions_polys; do
  [ -f "data/raw/naturalearth/$f.geojson" ] || curl -fsSL -o "data/raw/naturalearth/$f.geojson" \
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson"
done
python3 src/geo/refine_summits.py                  # cimas afinadas al máximo local del DEM
python3 src/geo/s2_search.py                       # catálogo Sentinel-2 L2A (AWS, sentinel-cogs)
for r in khumbu karakoram annapurna manaslu nangaparbat shishapangma kangchenjunga; do
  python3 src/geo/s2_select.py "$r"                # candidatas sin nubes y con poca nieve reciente
done
# escenas elegidas para la película (véase docs/fuentes_y_licencias.md)
python3 src/geo/s2_fetch.py khumbu 20231203
python3 src/geo/s2_fetch.py karakoram 20251107
python3 src/geo/s2_fetch.py annapurna 20251115
python3 src/geo/s2_fetch.py manaslu 20251115
python3 src/geo/s2_fetch.py nangaparbat 20251115
python3 src/geo/s2_fetch.py shishapangma 20221203
python3 src/geo/s2_fetch.py kangchenjunga 20241219
python3 src/geo/terrain_prep.py all                # niveles L0/L1/L2, huecos, artefactos, cimas
python3 src/geo/albedo_prep.py all                 # albedo y nieve a partir de Sentinel-2
python3 src/geo/map_base.py                        # mapas base del atlas (Terrain Tiles + vectores)

# 2. Sonido -----------------------------------------------------------------------------
python3 -m src.audio.mix --stems                   # partitura, diseño sonoro y máster (-14 LUFS)

# 3. Imagen y entregas ------------------------------------------------------------------
python3 -m src.edit.render_film render --res 3840x2160   # 40 segmentos reanudables (10 bits 4:2:2)
python3 -m src.edit.render_film assemble --master        # MP4 4K y 1080p + máster HEVC 4:2:2
python3 -m src.edit.teaser                               # teaser de 30 s (10 compases)
python3 -m src.edit.stills                               # 3 fijos promocionales 4K
python3 -m src.edit.storyboard                           # storyboard con fotogramas del corte
python3 -m src.edit.render_film verify                   # medidas sobre los archivos exportados
