# Nanga Parbat · la montaña desnuda

Web *scrollytelling* sobre el Nanga Parbat (8126 m) con la identidad **Diamir**:
las láminas en pincel seco pintadas sobre el relieve real son siempre el fondo,
y los textos se apoyan en las piedras del manual.

## Ver la web

Es estática y sin paso de compilación, pero necesita servirse por HTTP (los
módulos ES y las texturas WebGL no funcionan desde `file://`):

```bash
cd nanga-parbat
```

```bash
python3 -m http.server 8000
```

y abre <http://localhost:8000>. Añade `?debug` a la URL para exponer
`window.__np` (director, escenario, superposiciones) en la consola.

## Capítulos

| # | Capítulo | Fondo |
|---|---|---|
| 1 | **Portada multiplano**: el título vive entre la montaña y la pradera, que sube y se lo traga | Lámina 1 cortada en tres capas |
| 2 | **La montaña desnuda**: el nombre, ficha, cuatro cifras | Lámina 1, acercándose a la cara |
| 3 | **Las tres caras**: Rakhiot, Diamir y Rupal, con cumbres etiquetadas sobre la lámina, la cota de 4600 m y un minimapa con el cono de visión de cada cámara | Láminas 1 → 3 → 2 |
| 4 | **El macizo desde arriba**: mapa pintado que entra inclinado como una maqueta y revela caras, glaciares, cumbres y cuatro rutas | Lámina 8 (nueva) |
| 5 | **Quienes viven a sus pies**: Diamir, shina y nastaliq, rocas de Chilas, los colores del valle, Fairy Meadows | Láminas 2 y 1 |
| 6 | **La montaña asesina**: de Mummery (1895) a la invernal de 2018, con odómetro de años | Cambia por época |
| 7 | **Lo que solo pasó aquí**: ocho hazañas en medallones | Lámina 2 |
| 8 | **Subir por la Diamir**: la ruta Kinshofer de campo en campo, con altímetro y perfil del relieve real | Láminas 3 → 4 → 5 → 6 → 7 |
| 9 | **Desde la cumbre**: Meseta de Plata, Silbersattel, Pico Rakhiot y Chongra etiquetados donde están | Lámina 7 |
| 10 | **Relatos de campamento** | Lámina 6 |
| 11 | **Las ocho láminas**: galería horizontal con la ficha y la cámara de cada una | Lámina 5 |

## Cómo está hecho

- **Escenario WebGL** (`js/stage.js`): las láminas a pantalla completa con
  encuadre *cover*, Ken Burns atado al scroll y una transición de **pincel
  seco** escrita en GLSL: el frente avanza con trazos alargados (como las
  «rayas» del acabado de las láminas), deja asomar el fondo noche entre las
  cerdas y arrastra tiza clara en el borde húmedo. Sin WebGL, dos capas DOM
  con un barrido suave.
- **Director** (`js/director.js`): cada elemento con `data-shot` es un plano
  (lámina, foco, zoom de entrada y salida, oscurecido, dirección del pincel);
  entre planos, la transición se pinta y despinta con el scroll.
- **Superposiciones** (`js/overlays.js`): etiquetas y rutas en coordenadas de
  la imagen, reproyectadas en cada fotograma para seguir al encuadre.
- **Piedras**: las elásticas (losa, lápida, pizarra, tablilla, dintel) usan
  `border-image` en 9 cortes sobre la caja segura del manual, con la escala
  ajustada al ancho real; las de forma fija (estela, medallón, Chilas) colocan
  el texto con `inset` en su caja. En pantallas estrechas, Chilas pasa a una
  variante vertical.
- **Perfil de la ruta** (`js/profile.js`): una serie, cruceta y tooltip con
  ratón y teclado, y tabla de datos.
- GSAP 3.13 + ScrollTrigger y Lenis 1.3, alojados en `vendor/`.
- Accesibilidad: `prefers-reduced-motion` desactiva el desplazamiento suave,
  la entrada y los parallax; el nastaliq va con `lang="ur"` y `dir="rtl"`.

## Imágenes

Todo sale del PDF del manual (`Nanga_Parbat_Diamir.pdf`) y de su código
adjunto (`pdfdetach -saveall`), que es procedural y determinista:

- `assets/laminas/`: las siete láminas reconstruidas **sin pérdida** con
  `reconstruir.py` (3600 × 2400) y exportadas a WebP en 2400 y 1280 px.
- `assets/piedras/`: las ocho piedras de `piedras.py`, con transparencia, más
  `piedra_chilas_v` (variante vertical, `herramientas/chilas_v.py`).
- `assets/mapa/`: **lámina 8, nueva**, el macizo visto desde arriba con el mismo
  pintor de trazos sobre el DEM (`herramientas/paint_map.py`).
- `assets/capas/`: la lámina 1 en tres planos. `herramientas/layers.py` repite
  el render de la escena paso a paso, dibuja los objetos también en una máscara
  y captura el desplazamiento del acabado, así que el corte coincide píxel a
  píxel con la lámina (se comprueba: diferencia 0). Lo que cada capa tapa se
  rellena y se repinta con trazos.
- `assets/data/geo.json` (`herramientas/geo.py`): rutas trazadas sobre el relieve
  (caminos de mínimo coste por crestas y valles), perfil de la Kinshofer, y la
  proyección de cumbres, campos y rutas sobre cada lámina con la cámara real
  de `scenes.py` y un test de oclusión por trazado de rayos (con curvatura y
  refracción, como el motor).

Los scripts de `herramientas/` importan el código del manual: se ejecutan con
la carpeta de ese código como primer argumento (ver la cabecera de cada uno).

## Versión en un solo archivo

`herramientas/build_single.py` empaqueta todo (imágenes, tipografías, CSS, JS y datos) en un único
HTML que se abre con doble clic, sin servidor ni red (`dist/nanga-parbat.html`, unos 11 MB; `dist/`
no se versiona). Las láminas se reducen a 1800 px (`--ancho`). La cabecera del script explica los
requisitos.

## Fuentes y prudencia

Datos históricos contrastados con el *American Alpine Journal*, el
*Himalayan Journal*, Explorersweb, Guinness World Records y otras fuentes; donde
discrepan (la hora de cumbre de Buhl, la cota de algunos campos, la longitud de
la arista Mazeno) se usa la formulación prudente. Los trazados de ruta y la
posición de los campos son aproximados: orientan, no sirven como croquis.
