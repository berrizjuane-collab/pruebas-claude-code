# Manaslu · 8 163 m — seis vistas en «pincel seco»

Código para **regenerar las seis ilustraciones a máxima calidad** (el PDF lleva
versiones JPEG comprimidas para pesar poco). Mismo código + misma semilla ⇒ la
misma imagen, a cualquier resolución.

## 1. Requisitos

```bash
python3 -m pip install numpy scipy pillow          # obligatorio
python3 -m pip install reportlab                    # sólo para make_pdf.py
```
Python ≥ 3.10. Un render 3840×2160 con SS=2 tarda ~2 min y usa ~4.5 GB de RAM
(no lances dos a la vez con menos de 10 GB).

## 2. Reconstruir las imágenes (calidad completa, PNG sin pérdida)

```bash
cd codigo
python3 dem_build.py                     # 15 s: crea manaslu_dem.npz desde data/*.txt
python3 scenes.py all 3840 2160 salida/  # las seis, 4K, idénticas a las del PDF
```
Una sola escena: `python3 scenes.py cumbre 3840 2160 cumbre.png [SS] [semilla]`

| archivo | escena | cámara (lat, lon) | mira hacia | luz |
|---|---|---|---|---|
| 01_campo_base | Campo Base 4 850 m | 28.5840, 84.6020 | OSO 244° | mañana |
| 02_campo_1 | Campo 1 5 700 m (cámara a 5 500 m) | 28.5800, 84.5730 | SO 222° | mañana |
| 03_campo_2 | Campo 2 6 400 m | 28.5735, 84.5590 | E 80° | mediodía |
| 04_campo_3 | Campo 3 6 800 m | 28.5670, 84.5570 | NNO 344° | alba |
| 05_campo_4_noche | Campo 4 7 400 m | 28.5600, 84.5543 | N 346° | noche |
| 06_cumbre | Cumbre 8 163 m | 28.5532, 84.5566 | SSE 163° | amanecer |

**Otras resoluciones.** Todo está en unidades U = √(W·H)/1946 (README original §1.1),
así que 5120×2880 o 7680×4320 dan el mismo cuadro con más detalle
(7680×4320 necesita ~16 GB de RAM; baja a `SS=1` si no alcanza, pierde algo de finura en los trazos).
Para formatos verticales (móvil) hay que reencuadrar: cambia `yaw`, `hfov` y
`horizon` de la escena en `SCENES` (scenes.py).

## 3. Para la web

```bash
python3 export_web.py salida/ web/      # WebP (+AVIF si Pillow lo soporta) + JPEG, 640–3840 px
```
Deja en `web/picture_snippets.html` un `<picture>` con `srcset` por imagen.
El grano y la tiza son detalle fino: mantén WebP ≥ 85 de calidad.

## 4. Fidelidad topográfica: de dónde sale el relieve

El README del estilo (§9) advierte que su montaña procedural «no sirve como referencia
topográfica». Aquí la montaña **no es inventada**:

* **Datos reales**: 99 perfiles de elevación ASTER GDEM v3 (30 m) pedidos a la API pública
  de OpenTopoData (`api.opentopodata.org/v1/aster30m`) — `data/*.txt`:
  núcleo del macizo cada ~180–250 m, zona sur (Ngadi Chuli, Himalchuli) cada ~500 m,
  anillo de 70 × 55 km cada ~2 km para los picos lejanos.
* **Cámaras en las posiciones reales** de los campos de la ruta normal (cara NE),
  ubicadas sobre el DEM a sus altitudes habituales.
* `terrain.py` proyecta el DEM en perspectiva (horizonte flotante columna a columna,
  con curvatura terrestre y refracción): siluetas, ángulos y distancias son los reales
  (desde el C1 la cumbre está a ~3 km y 40° sobre el horizonte; desde la cumbre, el
  Ngadi Chuli queda 2.7° por debajo, a 6 km).
* **Correcciones**: ASTER subestima los pináculos; se elevan las cimas conocidas a su
  altura oficial (Manaslu 8 163, Manaslu Norte 7 157, Ngadi Chuli 7 871, Himalchuli 7 893).
* **Lo que sí es procedural**: el detalle por debajo de la malla (< ~200 m), el reparto
  nieve/roca, grietas y seracs, nubes y primer plano (carpas, banderas, escaladores).

**Más fidelidad todavía**: con un DEM completo (p. ej. Copernicus GLO-30, tesela
`N28E084`, GeoTIFF):
```bash
python3 dem_build.py --tif Copernicus_N28_E084.tif --bounds 84 28 85 29
python3 scenes.py all 3840 2160 salida/
```

## 5. Estructura

```
codigo/
  data/            perfiles ASTER reales (lat + 100 elevaciones por línea)
  dem_build.py     mallas → DEM métrico 30 m (+ detalle fractal + corrección de cimas)
  terrain.py       render en perspectiva del DEM, luz, sombras, nieve/roca, seracs, mar de nubes
  paint.py         estilo del README: cielo, cúmulos, θ, pintor de 5 pasadas, re-pincelado, acabado §7
  scenes.py        las seis escenas (cámara, luz, nubes, primer plano, objetos) + CLI
  make_pdf.py      arma el PDF a partir de los PNG
  export_web.py    derivados WebP/AVIF/JPEG + srcset
```
Tubería por imagen (igual que el README): imagen objetivo T + regiones → campo de
orientación θ → 5 pasadas de trazos sobre lienzo 2× → objetos vectoriales → re-pincelado
→ LANCZOS → acabado (temblor, lavado, grano, huecos oscuros, tiza, borde, viñeta).

Datos de elevación: ASTER GDEM v3 (NASA/METI) vía OpenTopoData.
