# Piratas del Caribe · Las cinco travesías — reedición como libro de consulta

Reorganización del libro según seis criterios de un libro tipo enciclopedia:
navegabilidad, retícula y jerarquía, tipografía, rigor de las imágenes, coherencia
cromática y producción. La explicación completa, criterio por criterio, está en
[`MEMORIA_DE_DISENO.md`](MEMORIA_DE_DISENO.md).

## Estructura

- `maqueta/content.py`: todo el texto, corregido y estructurado (películas, escenas, fichas, índice).
- `maqueta/build.py` + `book.css`: sistema de página (retícula 6 × 6, línea base de 14 pt) y plantillas.
- `maqueta/render.js`: imprime a PDF con Chromium y hace el control de calidad tipográfico (desbordes, líneas cortas, zona segura).
- `maqueta/post.py`: versión de imprenta (sangrado, marcas, TrimBox/BleedBox), versión digital (marcadores) y vista en pliegos.
- `maqueta/cover.py`: cubierta extendida para tapa dura (lomo calculado) y guardas.
- `herramientas/`: extracción y limpieza de las imágenes del PDF original (sin deformar, inventario de ppp).

## Regenerar

Hace falta el PDF original en `../src/original.pdf` y las imágenes preparadas en `maqueta/img/`
(se obtienen con `herramientas/prep_assets.py` y `prep_fix.py`).

```bash
cd maqueta && npm install
python3 build.py && node render.js out/base.pdf && python3 post.py
python3 cover.py && node render_simple.js cover.html out/Piratas_del_Caribe_cubierta.pdf
```

Los PDF finales y las imágenes no se suben porque el repositorio es público y contienen
fotogramas e ilustraciones de terceros (ver `.gitignore`).
