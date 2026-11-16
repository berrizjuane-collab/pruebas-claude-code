# Pintura · motor «pincel seco sobre fondo oscuro»

`paint.py`, `kit.py` y `scenes.py` son el motor y las seis escenas originales de la identidad
«Epitafio», sin cambios. `extra.py` añade las escenas nuevas de la web, construidas con las mismas
piezas (macizos 3D proyectados, planos de glaciar en perspectiva, nubes, utilería de alta montaña).

```bash
pip install numpy scipy pillow

# cinco de las seis originales, idénticas bit a bit a los PNG de la identidad
# (la sexta, `ruta`, se pinta abajo en dos capas)
python3 scenes.py concordia  3840 2160 k2_01_concordia.png          2
python3 scenes.py base       3840 2160 k2_02_campo_base.png         2
python3 scenes.py campo4     3840 2160 k2_04_campo_4_noche.png      2
python3 scenes.py bottleneck 3840 2160 k2_05_cuello_de_botella.png  2
python3 scenes.py cumbre     3840 2160 k2_06_cumbre.png             2

# las nuevas (--meta guarda las coordenadas que usa la web: cumbres, trazado de la ruta…)
python3 extra.py ruta_placa 3840 2160 k2_03_ruta_placa.png 2 --meta k2_03_ruta_placa.json
python3 extra.py ruta_linea 3840 2160 k2_03_ruta_linea.png 2 --meta k2_03_ruta_linea.json
python3 extra.py horizonte  3840 2160 k2_07_horizonte.png  2 --meta k2_07_horizonte.json
python3 extra.py baltoro    3840 2160 k2_08_baltoro.png    2 --meta k2_08_baltoro.json
python3 extra.py anfiteatro 7200 2000 k2_09_anfiteatro.png 2 --meta k2_09_anfiteatro.json
python3 extra.py gilkey     3840 2160 k2_10_gilkey.png     2 --meta k2_10_gilkey.json
```

Cada lámina 4K tarda unos 90 s y usa unos 2,2 GB de RAM; la panorámica, unos 200 s y 5 GB.
Para componer se puede previsualizar en segundos a baja resolución (`960 540 … 1`): la composición
es la misma, solo cambia el trazo.

## Qué aporta `extra.py`

- **`ruta_placa` / `ruta_linea`.** La escena `ruta` original, pintada sin y con la línea, las
  carpas y el banderín. `render()` resiembra el generador antes del acabado, de modo que el grano,
  la tiza y los huecos coinciden en las dos: la diferencia entre ambas es exactamente lo añadido.
  `activos.py` la recorta como capa con transparencia.
- **`anfiteatro`.** Panorámica 3,6:1. `set_unit()` fija la unidad de trazo a la de un 16:9 de la
  misma altura para que la pincelada mida lo mismo en pantalla que en las demás láminas, y
  `massif_win()` calcula cada macizo solo en la ventana de columnas que ocupa.
- **`horizonte`.** `range_layer()` pinta cordilleras lejanas con relieve isótropo y bruma (la capa
  de crestas del motor está pensada para paredes cercanas, con estrías verticales).
- **`baltoro`** y **`gilkey`.** Añaden utilería propia: `porter()` (porteador con la carga a la
  espalda), `theodolite()`, `surveyor()` y `plaque()` (placas y platos de metal del memorial).

Las láminas son interpretativas: perfiles, rumbos y distancias están compuestos, no medidos.
