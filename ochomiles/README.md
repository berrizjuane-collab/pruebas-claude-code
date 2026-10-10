# 14 cumbres. Un horizonte extraordinario.

Película promocional de 180 s sobre los 14 ochomiles (en producción). Todo el material
visual se genera por código a partir de datos reales: modelo de elevación Copernicus
GLO-30, imágenes Sentinel-2 y cartografía Natural Earth.

Estado: motor de render de terreno, atlas cartográfico y sistema tipográfico en
construcción. La documentación completa (guion, storyboard, fuentes y licencias) se
añadirá en `docs/` con la entrega.

## Estructura

| Carpeta | Contenido |
|---|---|
| `config/` | Datos editoriales verificados (`peaks.json`) |
| `src/geo/` | Descarga y preparación de datos: DEM, Sentinel-2, albedo, mapa base |
| `src/render/` | Renderizador 3D (OpenGL diferido), atmósfera, nubes, atlas 2D, tipografía |
| `assets/fonts/` | Source Serif 4 e Inter (licencia SIL OFL 1.1) |
| `data/` | Datos descargados y procesados (no se versionan; se regeneran con `src/geo/`) |
