# Everest · Chomolungma

Web de scrollytelling sobre el Everest construida con la identidad visual «Chomolungma».
La página es un ascenso: ocho láminas pintadas, ordenadas por altitud (5 150 → 8 848,86 m),
se suceden detrás del texto mientras un altímetro sube con el scroll.

`index.html` es la página final (CSS, JS, datos y fuentes incrustados); las imágenes están en `img/`.
Está en formato de artifact (sin `<!doctype>`); la copia lista para servir, enlazada desde el mapa
de la serie, está en `ochomiles-web/everest/`.

## Qué hace

- **Escenario WebGL** (`src/escena.js`): cada lámina tiene su mapa de profundidad real (sacado del
  modelo del terreno). La transición entre láminas revela la nueva de lejos a cerca a lo largo de
  trazos diagonales de ruido, con niebla entre el día y la noche y entre la noche y el amanecer.
  Parallax 2.5D con el ratón, cielo que fluye, estrellas y frontales que titilan, linterna frontal en
  el Collado Sur y amanecer progresivo en la cumbre. Sin WebGL, un respaldo con `<img>` encuadra igual.
- **Motor del ascenso** (`src/main.js`): cada `.paso` define encuadre (`data-cam`), rótulos
  (`data-rot`), progreso de la ruta (`data-ruta`) y altitud; el scroll interpola la cámara.
- **Rótulos exactos**: las cumbres se proyectan con la cámara real de cada lámina
  (`tools/analizar.py`), así que caen sobre el pico pintado.
- **Lámina VIII, «La ruta»**: vista aérea nueva pintada con el mismo código que las otras siete
  (`tools/ruta_cfg.py`, `tools/pintar_ruta.py`); encima se dibuja la ruta OSM del Collado Sur
  sincronizada con un perfil de altitud interactivo.
- **Plantillas**: thangkas que se desenrollan (vara separada), khatas que se despliegan, lung ta que
  caen y se mecen, y un cordel cuyas diez banderas ondean por separado. Si un texto no cabe en un
  thangka estrecho, se parte en dos (regla de la guía de identidad: nunca por debajo de 15 px).

## Reconstruir

Necesita el paquete `Everest_identidad_visual` (fuentes, plantillas y `codigo_reconstruccion/`) y
Python 3.11+ con `numpy scipy Pillow pyproj fonttools brotli`.

```bash
R=ruta/a/Everest_identidad_visual
# 1. terreno y láminas originales a 4K (desde codigo_reconstruccion/)
python3 reconstruir.py
# 2. lámina VIII y análisis de cámaras (proyecciones + mapas de profundidad)
python3 tools/pintar_ruta.py $R/codigo_reconstruccion salida/everest_ruta.png 3840 2160 2
python3 tools/analizar.py $R/codigo_reconstruccion analisis
# 3. imágenes web, plantillas troceadas y datos
python3 tools/exportar_laminas.py <dir_png> analisis img
python3 tools/preparar_plantillas.py $R/plantillas img
python3 tools/exportar_datos.py analisis/proyecciones.json src/datos.json
# 4. página final con subconjuntos de fuentes incrustados
python3 build.py $R/fuentes
```

## Créditos

- Láminas: DEM Pléiades del Khumbu (Berthier, 2022, CC BY 4.0), SRTM3 de la NASA (dominio público),
  ruta del Collado Sur de OpenStreetMap (© colaboradores de OpenStreetMap, ODbL).
- Tipografías: Gotu y Mukta (Ek Type), Noto Serif Tibetan (Google), SIL Open Font License 1.1.
- Oxígeno disponible: modelo de presión barométrica de West para el Himalaya.
