# Lhotse · la cumbre al sur

Web *scrollytelling* sobre el Lhotse construida con la identidad visual «Banda Amarilla»: paleta,
Zilla Slab + Hanken Grotesk, las ocho lajas de mármol como contenedores de texto y las láminas
pintadas como fondo permanente.

Abre `index.html` desde un servidor local (las texturas WebGL no cargan desde `file://`):

```bash
cd lhotse && python3 -m http.server 8000   # http://localhost:8000
```

## Qué hay

- `index.html`: la página completa (HTML, CSS y JS en un archivo, sin dependencias salvo Google Fonts).
- `img/`: las siete láminas en WebP a tres anchos (2560/1920/960; la de la ruta, 2400/1800/900).
  Las seis originales se regeneraron sin pérdida con `codigo_reconstruccion/` de la identidad;
  la VII (`ruta`) es nueva, pintada con el mismo motor.
- `lajas/`: las plantillas de la identidad, sin cambios.
- `herramientas/`: los scripts que añaden la escena de la ruta al motor y proyectan cumbres, campos y
  la traza de OpenStreetMap en cada lámina (`ruta.json`, `hitos.json`).

## Efectos

- Escenario WebGL fijo: cada capítulo trae su lámina; el cambio es un estrato que sube desde abajo,
  pincelado y rematado por una franja ocre (la Banda Amarilla), ligado al scroll.
- Capítulo de la ruta: la traza real se dibuja con el scroll, la cámara sigue al escalador y en cada
  campo se abre un iris pincelado hacia la lámina de ese campo; altímetro con las cotas oficiales.
- Rótulos de cumbres proyectados con la cámara real de cada lámina; galería horizontal fijada.
- Respeta `prefers-reduced-motion` y tiene respaldo sin WebGL.

## Regenerar la lámina de la ruta

Con el motor de `codigo_reconstruccion/` y su terreno ya construido (`python3 terreno.py fuentes_compactas`):

```bash
python3 herramientas/pintar_ruta.py <codigo_reconstruccion> 2400 1600 lhotse_ruta.png ruta.json 2
```

## Atribuciones

Terreno: Berthier, E. (2022), Pléiades DEM del Khumbu, doi:10.5281/zenodo.6979691 (CC BY 4.0).
Ruta: © colaboradores de OpenStreetMap, relación 17822898 (ODbL 1.0); el ramal final hacia la
cumbre del Lhotse es aproximado. Tipografías bajo SIL Open Font License 1.1.
