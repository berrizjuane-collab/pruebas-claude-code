# Dhaulagiri I · 8 167 m

Séptimo ochomil de la serie de webs. **Etapa 1: las láminas.** Son seis ilustraciones a pincel seco
sobre fondo oscuro, con el motor de las del Gasherbrum II. Las pinta sobre el relieve real del
macizo: Copernicus DEM GLO-30, unas tres veces más fino que el GLO-90 del G II.

| # | Lámina | Desde | Mirando | Luz |
|---|--------|-------|---------|-----|
| I | El macizo desde Poon Hill | 3 210 m, sobre Ghorepani, a 38 km de la cima | NO | alba |
| II | Campo Base | 4 700 m, glaciar Chhonbardan, al pie de la cara norte | S | última hora de la tarde |
| III | Campo 1 | 5 850 m, collado noreste | OSO, la arista hasta la cima | media mañana |
| IV | Campo 2 | 6 500 m, arista noreste | E, el Annapurna sobre el Kali Gandaki | atardecer |
| V | Campo 3 | 7 300 m, arista noreste | NE, el Tukuche Peak y el Mustang | medianoche, luna |
| VI | Cumbre | arista cimera, a 220 m de la cima | ONO, los Dhaulagiri II–VI, Churen, Putha Hiunchuli | media mañana |

## Qué hay

- `Dhaulagiri_laminas.zip`: la entrega.
  - `Dhaulagiri_laminas.pdf`: portada y las seis láminas a su resolución completa (5 120 × 2 880), en JPEG de calidad 90.
  - `LEEME.md`: cómo reconstruirlas.
  - `codigo/`: el código para rehacerlas a 5K, 8K o cualquier tamaño, idénticas a las del PDF.
- `codigo/`: el mismo código, sin comprimir, para trabajar en la web.
- `vista_previa/`: las seis láminas en JPEG de 1600 px y una hoja de contacto, para verlas en GitHub.

## Regenerar

```bash
cd codigo
python3 -m pip install -r requirements.txt
python3 descargar_dem.py                          # relieve Copernicus (~460 MB, AWS, sin cuenta)
bash herramientas/renderizar.sh salida            # seis masters PNG de 5120 x 2880
python3 pdf_laminas.py salida Dhaulagiri_laminas.pdf
python3 herramientas/exportar.py salida laminas   # WebP -h/-v/-g para la web (convención del G II)
```

Los detalles están en `codigo/LEEME.md`: tiempos, memoria, cómo reencuadrar y de dónde sale cada rasgo.

## Fidelidad

La forma grande de cada vista es la del relieve real, trazado en perspectiva con curvatura y refracción:
siluetas, ocultaciones, ángulos y distancias. Las cimas están llevadas a su altura oficial.

El collado noreste, la arista, la cascada de hielo y el llano del campo base están medidos sobre el
DEM (`codigo/herramientas/campos.py`). Los campos 2 y 3 van en su cota habitual sobre la arista, con
un margen de 200 a 300 m, porque no hay coordenadas publicadas.

Es procedural el detalle de menos de ~150 m, el reparto de nieve, roca y vegetación, las nubes y la
utilería.

Relieve: Copernicus DEM GLO-30 y GLO-90 © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH
2014-2018, provisto bajo COPERNICUS por la Unión Europea y la ESA.
