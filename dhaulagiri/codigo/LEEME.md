# Dhaulagiri I · 8 167 m — código de reconstrucción de las láminas

Este código **regenera las seis láminas a máxima calidad**. El PDF lleva versiones JPEG comprimidas
para pesar poco. Con el mismo código, la misma semilla y las mismas versiones de las librerías salen
los mismos píxeles, a cualquier resolución.

Es el motor de las láminas del Gasherbrum II (pincel seco sobre fondo oscuro: imagen objetivo, campo
de orientación, cinco pasadas de pinceladas, utilería, repintado y acabado de papel, tiza y viñeta),
portado al Dhaulagiri con estos cambios:

- **Relieve más fino.** Copernicus DEM GLO-30 (~30 m) en lugar de GLO-90 (~90 m): el nivel fino L0
  (12,5 m, 44 × 28 km) y el medio L1 (30 m, 150 × 150 km) salen del GLO-30; los horizontes lejanos
  (L2, 400 m, 700 × 700 km) salen del GLO-90.
- **Vegetación y lecho de río.** La vertiente nepalí baja a los 2 500 m del Kali Gandaki y a los
  1 500 m del Myagdi. El sombreado añade bosque bajo la línea de árboles (~3 900 m), prado y matorral
  alpino hasta ~5 000 m, estepa ocre al norte de la cordillera (sombra de lluvia: Mustang, Dolpo,
  Hidden Valley) y la grava del lecho del Kali Gandaki.
- **Línea de nieve propia.** ~4 750 m de media, más alta en las solanas y más baja en las umbrías.
- **Cascadas de hielo del collado noreste.** La de la ruta (hacia el Chhonbardan) y la del lado del
  Kali Gandaki, trazadas sobre el DEM.

## 1. Requisitos

```bash
python3 -m pip install -r requirements.txt     # numpy, scipy, pillow, numba, tifffile, imagecodecs, reportlab
python3 descargar_dem.py                       # ~460 MB de teselas Copernicus a data/ (AWS, sin cuenta)
```

Hace falta Python ≥ 3.10. La primera ejecución construye la caché del relieve: `cache/`, ~850 MB,
unos 7 minutos y unos 6 GB de RAM.

## 2. Reconstruir las láminas (PNG sin pérdida)

```bash
bash herramientas/renderizar.sh salida               # las seis a 5120 x 2880 (las del PDF)
bash herramientas/renderizar.sh salida 7680 4320     # 8K: el mismo cuadro con más definición
python3 generar.py cumbre 3840 2160                  # una sola, a 4K
python3 pdf_laminas.py salida Dhaulagiri_laminas.pdf # rehace el PDF
python3 herramientas/exportar.py salida laminas      # WebP para la web: -h 2560, -v 1440x2880, -g 1280
```

Todo se mide en unidades U = √(ancho·alto)/1946, así que cualquier tamaño da la misma pintura. Un
master de 5120 × 2880 tarda unos 6 a 8 minutos con 4 núcleos y usa unos 9 GB de RAM. Para 8K
conviene tener 16 GB o más.

| # | archivo | lámina | cámara | mira hacia | luz |
|---|---|---|---|---|---|
| I | dh_01_poon_hill | El macizo desde Poon Hill | 28.400 N, 83.689 E · 3 210 m | NO (327°) | alba |
| II | dh_02_campo_base | Campo Base | 28.746 N, 83.502 E · 4 700 m, glaciar Chhonbardan | S (178°) | última hora de la tarde |
| III | dh_03_campo_1 | Campo 1 | 28.710 N, 83.529 E · 5 850 m, collado NE | OSO (246°) | media mañana |
| IV | dh_04_campo_2 | Campo 2 | 28.707 N, 83.514 E · 6 500 m, arista NE | E (104°) | atardecer |
| V | dh_05_campo_3 | Campo 3 | 28.703 N, 83.504 E · 7 300 m, arista NE | NE (46°) | medianoche, luna |
| VI | dh_06_cumbre | Cumbre | 28.699 N, 83.487 E · arista cimera, 220 m al O de la cima | ONO (290°) | media mañana |

**Reencuadrar.** Cada escena es un diccionario en `escenas.py`: `rumbo`, `hfov` y `cy` (fila del
horizonte) para el encuadre, `sol` (acimut, elevación) para la luz, la paleta, las nubes y la
utilería. `herramientas/explorar.py <escena> 960 540 prueba.png` da en segundos la imagen objetivo sin
pintar, con las cimas rotuladas (blanco = se ve; rojo = queda oculta tras el relieve) y la ruta encima.
`herramientas/horizonte.py x y` da el perfil del horizonte desde cualquier punto. Para el móvil,
`exportar.py` recorta 1:2 de la apaisada, centrado donde dice `RECORTE_V`.

## 3. Fidelidad topográfica

- **Relieve real.** Copernicus GLO-30 en un radio de 75 km y GLO-90 hasta 350 km. Siluetas, ángulos,
  ocultaciones y distancias son los de la montaña: el trazado es en perspectiva columna a columna, con
  curvatura terrestre y refracción.
- **Correcciones.** Las cimas llevadas a su altura oficial. El GLO-30 da 8 136 m en el Dhaulagiri I;
  se lleva a 8 167 m con un abultamiento de ~160 m.
- **Rasgos de la ruta medidos sobre el DEM** (`herramientas/campos.py`):
  - el collado noreste, punto de silla entre el Dhaulagiri I y el Tukuche Peak: 5 850 m en
    28.7103 N, 83.5292 E;
  - la arista noreste, camino de crestería del collado a la cima, unos 4 km;
  - la cascada de hielo hacia el glaciar Chhonbardan;
  - el llano del campo base, a 4 654 m en el DEM.
- **Campos situados por su cota habitual** sobre la arista: C2 a ~6 500 m y C3 a ~7 300 m. No tienen
  coordenadas publicadas, así que el margen es de unos 200 a 300 m.
- **Lo que es procedural.** El detalle por debajo de ~150 m (acanaladuras, bandas de roca, seracs,
  morrenas), el reparto nieve/roca/vegetación, las nubes y la utilería (carpas, banderas,
  escaladores).

## 4. Estructura

```
descargar_dem.py   teselas Copernicus GLO-30 / GLO-90 desde AWS
dem.py             lectura de las GeoTIFF y mosaico
terreno.py         niveles L0/L1/L2, cimas oficiales, afilado, microrrelieve, materiales (caché)
render3d.py        cámara, trazado del relieve, normales y sombras (numba)
sombreado.py       imagen objetivo: nieve, roca, hielo, derrubio, vegetación, oclusión, bruma
cielo.py           cielo, cúmulos y mar de nubes
pintor.py          campo de orientación, cinco pasadas de pinceladas, repintado y acabado
objetos.py         utilería vectorial: carpas, comedor, banderas, escaladores, piedras, crestas
escena.py          tubería de una lámina
escenas.py         las seis escenas, los campos y la arista
generar.py         línea de órdenes
pdf_laminas.py     el PDF a partir de los PNG
herramientas/      campos.py, explorar.py, horizonte.py, renderizar.sh, exportar.py
```

## Atribuciones

Relieve: Copernicus DEM GLO-30 y GLO-90. © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH
2014-2018, provisto bajo COPERNICUS por la Unión Europea y la ESA.
