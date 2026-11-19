# Makalu, el gran negro

Web scrollytelling sobre el Makalu (8 485 m) con la identidad visual «Mahakala»: Rozha One + Karla,
láminas en pincel seco y plantillas de piedra.

Abre `index.html` con cualquier servidor estático (las láminas se cargan por ruta relativa):

```bash
cd makalu && python3 -m http.server 8000     # http://localhost:8000
```

## Estructura

| Ruta | Qué es |
|---|---|
| `src/page.html` | Fuente de la página: CSS, contenido y JS (WebGL, altímetro, ruta) |
| `src/ruta.json` | Ruta normal proyectada en la lámina 07: tramos, campos, perfil de altitud |
| `src/fuentes/` | Rozha One y Karla (woff2) con sus licencias OFL |
| `build.py` | Incrusta fuentes y datos, y escribe `index.html` (documento completo) y `artifact.html` (cuerpo para Artifact) |
| `assets/laminas/` | Las seis láminas del manual y la lámina nueva de la ruta, en WebP a dos tamaños |
| `assets/piedras/` | Las ocho piedras del manual y sus variantes verticales para móvil (`-m@2x`) |
| `tools/` | Scripts que generaron lo nuevo; se ejecutan junto al `codigo/` del paquete de identidad |

```bash
python3 makalu/build.py      # tras editar src/page.html
```

## Lo que se generó para esta web

- **Lámina 07, La ruta** (`tools/ruta.py`): vista aérea oblicua pintada con la misma tubería que las seis
  láminas, sobre el mismo DEM (SRTM3 + ASTER GDEM). Cámara a 12 400 m desde el SSO, elegida con una
  búsqueda que comprueba qué campos quedan a la vista.
- **Trazado de la ruta** (`tools/route_path.py`): camino de menor esfuerzo sobre el DEM entre los campos
  de la ruta normal, proyectado en la lámina; los tramos ocultos tras crestas se dibujan punteados.
- **Etiquetas de cimas** (`tools/labels.py`): posición de cada cima en cada lámina con la cámara real de
  su escena.
- **Piedras verticales** (`tools/piedras_m.py`): misma receta y semilla, otra proporción, para que en
  móvil el texto quepa sin estirar la piedra (el manual no admite más de un 15 %).
