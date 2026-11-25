# Gasherbrum I · la montaña escondida

Web *scrollytelling* sobre el Gasherbrum I (Hidden Peak, 8 080 m) construida con la identidad visual
«Balti»: paleta de nogal, lana y orejón, Young Serif + Figtree, las tallas de madera de Khaplu como
contenedores de texto y las láminas pintadas a pincel seco como fondo permanente.

Abre `index.html` desde un servidor local (las texturas WebGL no cargan desde `file://`):

```bash
cd gasherbrum-i && python3 -m http.server 8000   # http://localhost:8000
```

## Qué hay

- `index.html`: la página completa (HTML, CSS y JS en un archivo, sin dependencias salvo Google Fonts).
- `artifact.html`: el mismo contenido sin la cabecera `<!doctype>`/`charset`, tal como se publica como
  Artifact de claude.ai (el visor añade ese esqueleto).
- `laminas/`: ocho láminas en WebP, cada una en tres versiones: `-h` apaisada (2560×1440), `-v` vertical
  para móvil con encuadre propio (1080×2160) y `-g` para la galería (1280×720). Las seis originales se
  repintaron sin pérdida con el `codigo/` de la identidad. La VII (`ruta`) y la VIII (`concordia`) son
  nuevas, pintadas con el mismo motor.
- `plantillas/`: las plantillas talladas (tablero, dintel, ventana, celosía, ficha, medallón, friso y
  marco) generadas con `plantillas.py`, en WebP con transparencia. Los dos `tablero_*_centro.webp` son el
  campo liso del tablero, recortado para rellenarlo sin costuras en el 9-slice.
- `datos/proyecciones.json`: posición de cada cumbre, campo y rasgo de la ruta en cada lámina y
  orientación (con su visibilidad real), el perfil de la ruta muestreado sobre el relieve y las curvas de
  nivel del plano.
- `herramientas/`: los scripts que añaden las dos escenas nuevas al motor, prueban encuadres, pintan,
  proyectan y exportan.

## Capítulos

Portada, cifras, el macizo (las cimas aparecen una a una sobre la lámina aérea), la montaña escondida
(desde Concordia el G I queda oculto tras el G V), Baltistán, la ruta normal (la traza se dibuja con el
scroll junto al perfil y un plano con curvas de nivel), los cinco campos (Campo Base, C1, C2, C3 y
cumbre), las ascensiones de 1856 a 2013, hazañas y anécdotas, el cuaderno de láminas y el colofón.

## Efectos

- Escenario WebGL fijo: cada capítulo trae su lámina y el cambio es una pasada de pincel seco ligada al
  scroll, con bandas de cerdas desflecadas y dirección propia (sube hacia la cumbre, cae la noche).
- Encuadre lento por capítulo, paralaje con el ratón y, en la historia, la noche se posa sobre la cumbre.
- Altímetro en un medallón tallado (en móvil, en el friso) con la cota desde la que se pinta cada lámina.
- Telón de entrada: las dos hojas de una celosía de Khaplu se abren sobre la primera lámina.
- Polvo de nieve y ventisca en los campos altos; galería horizontal fijada en el cuaderno de láminas.
- Los textos se ajustan para caber siempre dentro de la zona segura de cada talla.
- Respeta `prefers-reduced-motion` y tiene respaldo sin WebGL.

## Regenerar las láminas nuevas y las proyecciones

Con el `codigo/` de la identidad (y sus dependencias de `requirements.txt`):

```bash
export G1_CODIGO=/ruta/a/Gasherbrum_I_web/codigo
python3 herramientas/explorar.py ruta 800 450 prueba.png          # encuadre rápido con la ruta encima
python3 herramientas/pintar.py ruta,concordia 2560 1440 salida    # apaisadas
python3 herramientas/pintar.py ruta,concordia 1080 2160 salida_v  # verticales
python3 herramientas/proyectar.py proy.json                       # cimas, campos, ruta, perfil y plano
python3 herramientas/web.py <scratch> <gasherbrum-i> <plantillas> # WebP y datos/
```

## Atribuciones

- Relieve: Copernicus DEM GLO-90. © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018,
  provisto bajo COPERNICUS por la Unión Europea y la ESA.
- Fuentes tipográficas: Young Serif, Figtree, Jomolhari y Noto Nastaliq Urdu (OFL), servidas por Google
  Fonts. Las grafías tibetana y nastaliq son decorativas; antes de usarlas como texto conviene que las
  revise alguien que lea balti.
- Datos históricos contrastados con el Himalayan Journal, el American Alpine Journal, ExplorersWeb y
  Guinness World Records (enlaces en el colofón de la página).
