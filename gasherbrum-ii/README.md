# Gasherbrum II · la caravana

Web *scrollytelling* sobre el Gasherbrum II (K4, 8 035 m) construida con la identidad visual «Caravana»:
la carga de los porteadores baltis como contenedor de los textos, sobre ocho láminas pintadas a pincel
seco que hacen de fondo permanente. Paleta cobalto `#2645B0`, morrena `#17191F`, hielo `#EEF0F3`,
cartón `#DCD5C6` y grava `#6B6E79`; tipografías Big Shoulders Stencil (títulos y cifras) y Literata
(texto).

Abre `index.html` desde un servidor local (las texturas WebGL no cargan desde `file://`):

```bash
cd gasherbrum-ii && python3 -m http.server 8000   # http://localhost:8000
```

## Qué hay

- `index.html`: la página completa (HTML, CSS y JS en un archivo, sin dependencias salvo Google Fonts).
- `artifact.html`: el mismo contenido sin `<!doctype>` ni metas de charset y viewport, tal como se
  publica como Artifact de claude.ai (el visor pone ese esqueleto). Lo genera `herramientas/web.py`.
- `laminas/`: ocho láminas en WebP, cada una en tres versiones: `-h` apaisada (2560 × 1440), `-v`
  vertical para móvil (1440 × 2880, recorte 1:2 del master a resolución nativa, con su propio centro) y
  `-g` para la galería (1280 × 720). Todas salen de masters de 5120 × 2880 pintados con `src/`.
- `plantillas/`: las cinco familias de la identidad en WebP con transparencia:
  - **lona** de carga (cobalto, cruda y grava): 9-slice con ojales, refuerzos y amarres, más su tela
    repetible con los pliegues de haber viajado doblada; cinta de capítulo, telón de entrada y friso.
  - **ficha** de carga (cartón, blanca y cobalto; vertical colgada de su cordel y horizontal con talón
    troquelado) para los datos.
  - **fardo** de rafia atado en cruz (blanco y azul; apaisado y vertical) para las hazañas.
  - **bidón**: tapa con aro de cierre (cobalto y blanca) para el altímetro y las cifras, y su costado
    para el altímetro de la barra en móvil.
  - **morrena** del Baltoro (ancha, fina y vertical, repetibles) para separadores y líneas de tiempo.
- `datos/proyecciones.json`: dónde cae cada cima, campo y rasgo de la ruta en cada lámina y orientación
  (con su visibilidad real), la ruta proyectada, el perfil muestreado sobre el relieve y las curvas de
  nivel del plano.
- `src/`: el motor de las láminas (el código de reconstrucción del G II) con dos añadidos:
  `escenas_extra.py` (las láminas VII y VIII, la ruta normal completa y los recortes verticales) y la
  figura del porteador en `objetos.py`. `generar.py` importa `escenas_extra`. El generador del PDF de
  láminas (`pdf_g2.py` y sus fuentes) se queda en el zip original: la web no lo usa.
- `herramientas/`: render de los masters, exportación web, proyecciones, plantillas y pruebas de
  encuadre.

## Capítulos

Portada con el telón de lona, cifras en tapas de bidón, el macizo desde el Gondogoro La (las cimas
aparecen una a una), la caravana de porteadores con el camino de Askole al campo base, la ruta normal
(la traza se dibuja con el scroll junto al perfil y un plano con curvas de nivel), los cuatro campos y la
cumbre, las ascensiones de 1856 a 2011 sobre un hilo de morrena, hazañas y anécdotas en fardos, el
cuaderno de láminas y el colofón.

El G II comparte con el G I el campo base y el Campo 1: la ruta de la web usa en la cascada de hielo los
mismos puntos de paso que la web del G I, y si se sirve junto a ella aparece un enlace en el capítulo de
la caravana.

## Láminas

| # | Lámina | Desde | Hora |
|---|--------|-------|------|
| I | El macizo desde el Gondogoro La | 5 585 m, mirando al NE | atardecer |
| II | Campo Base | ~5 120 m, morrena del glaciar Abruzzi | mañana |
| III | Campo 1 | ~5 880 m, circo del Gasherbrum Sur | tarde |
| IV | Campo 2 | ~6 410 m, repisa del espolón SO | tarde dorada |
| V | Campo 3 | ~7 010 m, hombro bajo la pirámide | medianoche, luna |
| VI | Cumbre | 8 035 m | primera hora de la tarde |
| VII | La ruta normal (nueva) | 12 500 m al sur-suroeste | media mañana |
| VIII | La caravana (nueva) | ~5 200 m, morrena del Abruzzi | mañana |

## Regenerar

Python 3.10+ con las versiones de `src/requirements.txt`, más scikit-image para el plano. El relieve no va
en el repositorio: `python3 src/descargar_dem.py` baja las teselas a `src/data/` (o copia la carpeta
`data/` del zip de reconstrucción). La primera ejecución construye la caché del relieve (`cache/`,
~430 MB, unos 4 minutos).

```bash
bash herramientas/renderizar.sh /tmp/g2_master          # 8 masters de 5120x2880 (unos 4-5 min cada uno)
python3 herramientas/exportar.py /tmp/g2_master laminas  # -h, -v y -g en WebP
python3 herramientas/proyectar.py datos/proyecciones.json
python3 herramientas/plantillas.py /tmp/g2_plantillas    # las cinco familias en PNG
python3 herramientas/web.py /tmp/g2_plantillas .         # plantillas WebP y artifact.html
python3 herramientas/explorar.py ruta 960 540 prueba.png # prueba rápida de un encuadre
```

Todo es determinista (semillas fijas por escena y por plantilla).

## Atribuciones

- Relieve: Copernicus DEM GLO-90. © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018,
  provisto bajo COPERNICUS por la Unión Europea y la ESA. Teselas reempaquetadas por el proyecto
  Vershiny (`agran/vershiny-dem`, `agran/vershiny-dem-hi`).
- Fuentes tipográficas: Big Shoulders Stencil y Literata (SIL Open Font License), servidas por Google
  Fonts.
- Datos históricos contrastados con el Himalayan Journal (1956 y 1975), el American Alpine Journal (1984
  y 2011) y Guinness World Records (enlaces en el colofón de la página). Las posiciones de los campos no
  tienen coordenadas publicadas: están situadas sobre el relieve a partir de las descripciones de la
  ruta, con un margen de unos 200 a 300 m.
