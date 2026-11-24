# Broad Peak · Cresta Ancha

Web *scrollytelling* sobre el Broad Peak (8 051 m) construida con la identidad «Cresta Ancha»:
Archivo al 125 % de ancho y Newsreader, la paleta grava · granito · morrena · hielo · nieve con un
único acento (arrebol), las ocho placas de serac como contenedores de datos y las láminas en pincel
seco como fondo permanente. El scroll es la subida: de Concordia (4 600 m) a la cima (8 051 m).

Abre `index.html` desde un servidor local (las texturas WebGL no cargan desde `file://`):

```bash
cd broad-peak && python3 -m http.server 8000   # http://localhost:8000
```

## Qué hay

- `index.html`: la página completa (HTML, CSS y JS en un archivo; sin dependencias salvo Google Fonts).
  Se genera con `herramientas/montar.py` a partir de `src/index.template.html`.
- `img/`: las ocho láminas en AVIF y WebP (2560/1600 px; el panorama, 5120/3200), su mapa de
  profundidad (`*-prof.png`) y las pinceladas de grava que hacen de lavado bajo el texto.
  Las seis láminas de la identidad se repintaron sin pérdida a 3840 × 2160 con su propio código
  (mismas versiones de librerías, mismas semillas). Dos son nuevas, pintadas con el mismo motor:
  - **VII · La ruta normal**: vista aérea de la tarde desde el suroeste, a 6 500 m, con el K2 y todo
    el espolón oeste.
  - **VIII · La Cresta Ancha**: panorámica cilíndrica al atardecer desde el oeste, a 7 100 m, con el
    K2, las tres cumbres y los Gasherbrum.
- `plantillas/`: las placas de hielo de la identidad, sin cambios.
- `herramientas/`: el envoltorio del motor de la identidad y los datos que la página lleva dentro.

## Efectos

- **Escenario WebGL fijo con paralaje de profundidad.** El motor de la identidad calcula la distancia
  de cada píxel; `render_web.py` la guarda y, además, registra cada objeto de utilería (tiendas,
  escaladores, banderas) para darle la distancia de su base. El *shader* desplaza la pintura por
  planos (cielo, cordilleras, primer plano) con el ratón, con el scroll y con una deriva lenta.
- **Transición en pincel seco**, ligada al scroll y reversible: la lámina siguiente se pinta con
  trazos anchos y luego finos, lo lejano antes que lo cercano, y en el frente del trazo asoma la
  grava entre las cerdas.
- **Cumbres en su sitio.** Las cotas se proyectan con la cámara real de cada lámina y se apartan
  cuando el texto pasa por encima.
- **Panorama fijado** que recorre la cresta de norte a sur con la ficha de cada cumbre y el perfil
  real de la arista (DEM).
- **Ruta normal** dibujada con el scroll sobre la lámina VII (241 puntos sobre el relieve, 6,7 km),
  con la cámara siguiendo la cabeza del trazo, campos que aparecen al alcanzarlos, perfil de
  altitud sincronizado y altímetro que sube de 4 847 a 8 051 m.
- Ventisca a pinceladas en el Campo 3 y en la cima; título que se ensancha de 62 % a 125 %.
- Respeta `prefers-reduced-motion` y tiene respaldo sin WebGL (imágenes con fundido).

## Regenerar

Con el código de la identidad (`codigo/` y `data/` del zip «BroadPeak_identidad_completa») y sus
dependencias exactas (`numpy 2.5.3`, `scipy 1.18.1`, `numba 0.68.1`, `Pillow 12.3.0`):

```bash
H=broad-peak/herramientas; C=ruta/a/BroadPeak_identidad_completa/codigo
python3 $H/render_web.py $C salida concordia,campo_base,campo_1,campo_2,campo_3,cumbre,ruta 3840 2160
python3 $H/render_web.py $C salida panorama 6400 1920        # ~2-3 min por lámina
python3 $H/exportar.py salida broad-peak                      # AVIF/WebP, profundidad y anclas
python3 $H/ruta_web.py $C $H/datos/ruta.json                  # ruta proyectada en la lámina VII
python3 $H/datos_dem.py $C $H/datos/datos_dem.json            # perfil de la cresta y distancias
python3 $H/montar.py                                          # index.html
```

(`exportar.py` escribe `img/` y `data/escenas.json` dentro de la carpeta destino; copia ese JSON a
`herramientas/datos/` antes de montar.)

## Datos

Fechas y nombres verificados con fuentes primarias cuando las hay (Himalayan Journal, American
Alpine Journal); la lista está en el pie de la página. Algunas fuentes dan 8 047 m para la cima
principal; aquí se usa la altura de la identidad, 8 051 m.

## Atribuciones

- Relieve: Copernicus DEM GLO-90, © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018,
  provisto bajo COPERNICUS por la Unión Europea y la ESA.
- Campos de la ruta normal: GPS publicados en UKClimbing («Broad Peak route maps»).
- Fuentes: Archivo y Newsreader (SIL Open Font License), servidas por Google Fonts.
