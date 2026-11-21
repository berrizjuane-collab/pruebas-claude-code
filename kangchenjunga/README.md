# Kangchenjunga · Cinco tesoros

Web *scrollytelling* sobre el Kangchenjunga (8 586 m) hecha con la identidad visual «Cinco tesoros»:
el scroll es la subida, de campo en campo, desde el glaciar Yalung hasta unos pasos de la cima.

Publicada como artefacto: https://claude.ai/artifact/CK5eLesGQ183DksF2f5eJ1

## Qué hay en la página

| Capítulo | Lámina de fondo | Pieza |
|---|---|---|
| Prólogo | El macizo (ocaso) | Título, nombre tibetano y la lámina «pintándose» al cargar |
| I · El nombre y la montaña sagrada | Desde Sikkim (nueva) | Brocado con el nombre, folio, glosario de los cinco tesoros, hojas sueltas |
| II · Cinco cimas y ficha | Campo Base | Sección fijada: un folio del tesoro por cima, con su etiqueta encendida sobre la lámina; fardo con la ficha técnica |
| III · Un siglo de intentos | Campo 1 | Línea de tiempo en tiras: horizontal y fijada en escritorio, vertical en móvil |
| IV · Hazañas | Campo 2 | Folios apilados que se hunden al taparse |
| V · Historias de campamento | Campo 3 (noche) | Hojas sueltas en collage con paralaje |
| VI · La ruta del Yalung | Vista aérea (nueva) | La ruta se dibuja sobre el relieve con sus seis campos y el altímetro sigue a la cabeza |
| VII · Cumbre | Cumbre | Etiquetas del Jannu, Makalu, Lhotse y Everest con su distancia real; la promesa de 1955 |

## Técnica

- **Fondo WebGL** (`site/index.html`): las ocho láminas como texturas, encuadre *cover* con foco por escena,
  zoom lento ligado al scroll y paralaje de ratón. Las transiciones son una máscara de **pincel seco**
  en el shader: carriles de trazo que avanzan a distinto ritmo, cerdas fibrosas, borde húmedo y arrastre del color.
  Nieve procedural en tres capas con paralaje de scroll y viento (ventisca en la cumbre).
  Sin WebGL, cae a dos imágenes que se funden con el mismo encuadre.
- **Etiquetas y ruta proyectadas**: `tools/extra.py` usa la misma cámara de `scenes.py` que pintó cada lámina
  para proyectar las cimas (con prueba de oclusión contra el relieve) y el trazado de la ruta muestreado sobre el
  DEM (`extra/info.json`, `extra/route.json`). Por eso las etiquetas caen exactamente sobre las cumbres pintadas.
- **Pechas sin deformar**: cada plantilla escala en proporción y su texto se mide en unidades de contenedor
  (`cqi`) respecto a la caja segura de `pechas.json`; si un texto no cabe, se reduce poco a poco hasta caber.
  Para pantallas estrechas, `tools/pechas_v.py` genera **variantes verticales** con el mismo generador procedural
  (folio, tapa, fardo, brocado, tira, folio gastado y hoja suelta).
- **Dos láminas nuevas** con el motor de la identidad: `ruta` (vista aérea de la cara suroeste) y `sikkim`
  (amanecer desde el lado de Sikkim, con chorten y banderas de oración).
- Tipografías Eczar, Hind y Jomolhari subconjuntadas e incrustadas (SIL OFL 1.1, licencias en `fonts/`).

## Ver en local

Las texturas WebGL necesitan servirse por HTTP:

```bash
cd kangchenjunga/site
python3 -m http.server 8000      # y abrir http://localhost:8000/
```

## Reconstruir

Hace falta el paquete de la identidad (`Kangchenjunga_identidad/`, con su código de láminas y pechas) y Python con
NumPy, SciPy y Pillow.

```bash
# láminas nuevas (3840 × 2160) y proyección de cimas y ruta
python3 -I tools/extra.py <identidad>/codigo/ilustraciones render ruta 3840 2160 ruta.png
python3 -I tools/extra.py <identidad>/codigo/ilustraciones render sikkim 3840 2160 sikkim.png
python3 -I tools/extra.py <identidad>/codigo/ilustraciones info extra/info.json macizo campo_base cumbre sikkim ruta campo_3 campo_1 campo_2

# pechas verticales
python3 -I tools/pechas_v.py <identidad>/codigo/identidad pechas_v 2

# página: incrusta fuentes y ruta en build/index.src.html → site/index.html
python3 tools/build.py .
```

Alturas oficiales; relieve SRTM3 + ASTER GDEM. Las posiciones de los campos son aproximadas, y la asignación de
cada tesoro a una cima es de la identidad, no de la tradición.
