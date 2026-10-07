# Pipeline de datos del K2

Convierte las fuentes abiertas en los recursos ligeros que carga el navegador
(`public/data`, ~2,4 MB en total). El navegador **no** procesa GeoTIFF: solo lee
PNG/WebP/JSON ya preparados.

```bash
bash pipeline/run_all.sh        # crea pipeline/.venv e instala numpy, scipy, rasterio, pyproj, pillow
```

Requiere Python ≥ 3.10 y acceso HTTPS a los buckets públicos de AWS Open Data
(`copernicus-dem-30m.s3.amazonaws.com`, `sentinel-cogs.s3.us-west-2.amazonaws.com`).
Las descargas se guardan en `pipeline/.cache/` (no versionado) con su SHA-256 en
`pipeline/.cache/fuentes.json`, que luego se copia al manifiesto.

| Paso | Script | Qué hace |
| --- | --- | --- |
| 1 | `01_descargar.py` | Teselas COG de **Copernicus DEM GLO-30** N35/N36 E076 y sus máscaras FLM/EDM/HEM/WBM; ventanas de **Sentinel-2 L2A** (B02, B03, B04, B11, SCL) de la escena del 14-08-2024 (teselas 43SFV y 43SFA) leídas por rangos HTTP. |
| 2 | `02_terreno.py` | Mosaico → transversa de Mercator local (origen en la coordenada publicada de la cumbre) a 25 m (análisis/núcleo, cúbico), 100 m (contexto) y 400 m (horizonte) con promedio. Busca la cumbre del DEM, aplica la **corrección local documentada** (+39,4 m, radio 250 m), cose los bordes de los anillos, remuestrea la máscara FLM (vecino) y calcula el factor de cielo visible. Exporta PNG de 16 bits y `manifest.json`. |
| 3 | `03_imagen.py` | Albedo desde la reflectancia L2A (ya corregida topográficamente por ESA: se comprobó que la nieve no depende de cos(i)); rellena píxeles en sombra/nube con la media local de su clase; máscara de nieve por NDSI. WebP + PNG por anillo. |
| 4 | `04_rutas_poi.py` | Lee `curated/k2_curado.json` (referencias, puntos de control, POI), traza tramos por **camino de mínimo coste** sobre el DEM (crestas o glaciar), coloca campamentos por altitud documentada sobre su ruta, genera la línea base del serac y los fixtures de tests (proyección comparada con pyproj y alturas). |

## Decisiones reproducibles

- **Sistema**: `+proj=tmerc +lat_0=35.8825 +lon_0=76.5133 +k=1 +ellps=WGS84`. x = este, y = norte (m). En la escena: X = este, Y = altitud − h0, Z = sur. h0 = 6000 m.
- **Vertical**: EGM2008 (la del Copernicus DEM). No se mezcla con alturas elipsoidales.
- **Codificación de alturas**: PNG gris de 16 bits, `H = 3000 + 0,1·v` (precisión 0,1 m; el DEM no es más preciso).
- **Núcleo = recorte exacto de la rejilla de análisis**: malla, rutas y POI comparten alturas idénticas.
- **Sin reescalado global**: la única alteración del relieve es la corrección local de la cumbre, registrada en `manifest.json` (`cumbre.correccion`) y visible en la capa «Procedencia del relieve».

Los datos curados a mano (puntos de control y descripciones) están en
`curated/k2_curado.json`; cambiar una ruta o un campamento no requiere tocar el
código de la aplicación.
