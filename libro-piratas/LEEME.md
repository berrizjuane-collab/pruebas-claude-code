# Piratas del Caribe · libro ilustrado de 64 páginas — maqueta para imprenta

Rediseño del interior a partir de `Piratas_del_Caribe_libro_64pp (3).pdf`, con la diagramación de
las dos referencias: dobles páginas compuestas como una sola pieza, notas de pergamino, mapas, carteles
y una ilustración protagonista con bloques breves de texto a su alrededor.

## Entregables (`salida/`)

| Archivo | Para qué sirve |
|---|---|
| `Piratas_del_Caribe_64pp_paginas.pdf` | **Archivo para imprenta.** 64 páginas individuales en orden de lectura (portada = p. 1, contraportada = p. 64), sin imposición, con sangrado de 3 mm y cajas TrimBox/BleedBox definidas. |
| `Piratas_del_Caribe_revision_pliegos.pdf` | **Revisión en pantalla (no imprimir).** Portada sola, las 31 dobles páginas enfrentadas al tamaño de corte y la contraportada sola, como se ven al abrir el libro. |

## Especificaciones técnicas

- **Formato de corte:** 219,12 × 309,37 mm (el del PDF original). Pliego abierto: 438,24 × 309,37 mm.
- **Sangrado:** 3 mm por los cuatro lados en todas las páginas. En el lado del lomo, el sangrado
  contiene los 3 mm de la página enfrentada (igual que exporta InDesign).
- **Paginación:** 64 páginas = portada + 31 dobles páginas + contraportada. Se comprueba al generar.
- **Zona de seguridad:** ningún texto a menos de 16 mm del lomo (franja libre de 32 mm en el centro del
  pliego), ni a menos de 18 mm de los cortes exteriores. Sobre el lomo solo pasan fondos, filetes y las
  rutas punteadas; ni textos ni rostros ni detalles importantes.
- **Tipografía (incrustada y en subconjunto):** EB Garamond (texto), Pirata One (títulos góticos, como el
  título de la referencia 1) y Liberation Serif (portada, portadillas y contraportada: la del original).
  Todas con licencia SIL OFL.
- **Imágenes:** todas las ilustraciones son **vectoriales**. Se extrajeron del PDF original y los pocos
  degradados de 72 ppp que contenían (cielos y halos de luna) se convirtieron en degradados vectoriales.
  Las texturas (pergamino y fondo ahumado, que en el original eran JPEG de 96 ppp) se regeneraron a
  **300 ppp** con los mismos colores medidos en el original. El marco de olas azul, que era un JPEG, ahora
  es vectorial. Resolución mínima efectiva comprobada: 298 ppp (las notas giradas se remuestrean a 300 ppp).
- **Color:** RGB (ver pendientes).

## ⚠ Pendiente de confirmar con la imprenta antes de imprimir

1. **Formato final.** 219,12 × 309,37 mm no es un formato estándar. Tiene la proporción exacta de un A4
   y parece un A4 inflado un 4,3 % (el original se maquetó a 827 × 1169 px, que es un A4 a 100 ppp,
   y se exportó a 96 ppp). Si la imprenta trabaja en A4 (210 × 297 mm), la maqueta escala al 95,84 %
   sin recomponer nada. Si se mantiene el tamaño actual, confirmar que lo aceptan.
2. **Sangrado.** Se han aplicado 3 mm. Algunas imprentas piden 5 mm, sobre todo en tapa dura.
3. **Encuadernación y margen interior.** 64 páginas admiten **grapa (caballete)** o **rústica fresada/cosida**.
   - Con grapa: pedir el valor de *creep* (desplazamiento de las páginas centrales) si lo aplican ellos.
   - Con fresado: la cola come 3–6 mm por lomo. La franja libre actual es de 16 mm por lado, suficiente,
     pero conviene que la imprenta lo confirme.
4. **¿Cubierta aparte?** Si es rústica con lomo o tapa dura, la cubierta (pp. 1 y 64) debe entregarse
   como un pliego aparte con **lomo**, cuyo ancho depende del papel y del gramaje. Las páginas 1 y 64 de este
   PDF sirven como base. Hace falta el ancho de lomo para montarlo (y, en tapa dura, el sangrado de
   cartoné, normalmente 15–20 mm).
5. **Color y estándar PDF.** El archivo está en RGB y usa transparencias (sombras y degradados
   vectoriales). Lo ideal es pedir el perfil de salida (por ejemplo, FOGRA39/ISO Coated v2 o FOGRA51) y
   exportar a **PDF/X-4**, que admite transparencias. *No* usar PDF/X-1a sin aplanar antes. El texto es
   marrón muy oscuro (#2a1b12, el del original). En CMYK irá en cuatricromía: preguntar si prefieren texto
   en 100 % negro para evitar problemas de registro en cuerpos pequeños.
6. **Datos legales.** Si el libro lleva ISBN, depósito legal o código de barras, falta su sitio: la
   contraportada tiene espacio libre en la parte inferior y la p. 2 admite una línea de créditos.
   El original indica que es un trabajo de fans sin fines comerciales, y las marcas son de Disney. Algunas
   imprentas piden confirmación por escrito para material con marcas de terceros.

## Mapa de páginas

| Págs. | Contenido | Composición |
|---|---|---|
| 1 | Portada | Diseño y colores originales |
| 2–3 | Sobre este libro · Índice | Pergamino liso, brújula y calavera del original |
| 4–5 | Introducción | Fondo ahumado. Barco a la luz de la luna como imagen dominante |
| 6–7 | Del parque a la pantalla | Narrativa a dos columnas + infografía «La saga en cifras» |
| 8–9 | La Edad de Oro de la piratería | Columnas, Jolly Roger, comparación corsario/bucanero/pirata |
| 10–11 | Barbanegra · Port Royal, Tortuga y Nassau | Cartel «SE BUSCA» (referencia 1) + **mapa real del Caribe** con la ruta de 1718 |
| 12–19 | I. La maldición de la Perla Negra (2003) | Portadilla original · Sinopsis y reparto · El viaje · Detrás de cámaras y curiosidades |
| 20–27 | II. El cofre del hombre muerto (2006) | ídem |
| 28–35 | III. En el fin del mundo (2007) | ídem |
| 36–43 | IV. En mareas misteriosas (2011) | ídem |
| 44–51 | V. La venganza de Salazar (2017) | ídem |
| 52–53 | Cronología de la saga | Línea de tiempo a lo ancho del pliego (1967–2017) |
| 54–55 | Personajes de la saga | Cartel «SE BUSCA» de Jack + galería |
| 56–57 | Los barcos · La música | Catálogo de la flota · pentagrama y compositores |
| 58–59 | Glosario pirata | Diccionario alfabético |
| 60–61 | Legado | Fondo ahumado, barco fantasma y gráfico de taquilla |
| 62–63 | Mapa y escenarios | Carta del tesoro a doble página con los lugares de rodaje |
| 64 | Contraportada | Diseño original |

Cada capítulo alterna una doble página de imagen (portadilla), una narrativa (sinopsis y reparto),
otra de imagen (**El viaje**: una ruta punteada recorre los cinco actos hasta la X, alrededor del barco
de la película) y otra narrativa con infografía (detrás de cámaras, curiosidades y taquilla).

## Cambios respecto al original

**Diseño**
- Se conservan el diseño y los colores de portada, contraportada y las cinco portadillas. Las posiciones
  se replicaron desde las coordenadas del PDF original. Cambios mínimos:
  la calavera de las portadillas caía justo sobre el lomo y pasa a la página izquierda; el marco del barco
  se desplaza 4 mm hacia fuera para alejarlo del pliegue. En la contraportada, el rótulo provisional
  «Contraportada» se sustituye por el título del libro. Portada y contraportada ya no llevan folio.
- Interior: se mantienen la paleta (pergamino, marco de olas azul, lacre rojo, oro, crema y ahumado) y las
  ilustraciones originales, recompuestas como dobles páginas.

**Texto** (reorganizado, corregido y condensado; la narración de las cinco películas va completa y en orden)
- Curiosidades que repetían la recepción, la introducción o el «detrás de cámaras» se sustituyen por
  datos que no estaban: la película más larga (169 min) y la más corta (129 min) de la saga, el único Óscar de la
  saga, los actores presentes en las cinco películas, la pierna de Barbossa, etc.
- Se elimina el recuadro de relleno «Idea central» del capítulo III.
- Correcciones: «Àstrid Bergès-Frisbey», «lores», «icono», «Petición de tregua», «A finales de los años
  noventa», «costes», «San Vicente y las Granadinas»; «rueda rodante» pasa a «rueda de molino que rueda sin
  control»; Davy Jones «se arrancó el corazón».
- El glosario se ordena alfabéticamente.
- El índice incluye las subsecciones de cada película y **se genera a partir de la paginación real**. Al
  construir, cada entrada se busca en su página del PDF final.

## Archivo fuente editable

No hay archivo de InDesign. La fuente editable es esta carpeta, un sistema HTML/CSS + Python con todos
sus recursos:

```
src/contenido.py        ← todos los textos (editar aquí)
src/maqueta.py          ← composición de cada doble página (posiciones en mm)
src/estilos.css         ← tipografía, colores y estilos
src/decoracion.py       ← piezas vectoriales propias (olas, lacre, bandera, pentagrama, X)
recursos/ilustraciones/ ← ilustraciones vectoriales SVG extraídas del original (+ mapa del Caribe)
recursos/texturas/      ← texturas a 300 ppp
recursos/fuentes/       ← fuentes con sus licencias
recursos/datos/         ← coordenadas de extracción, datos cartográficos (Natural Earth)
herramientas/           ← generación, renderizado, exportación y verificación
maqueta/libro.html      ← maqueta generada (se puede abrir en Chrome para ver los pliegos)
```

Los SVG de `recursos/ilustraciones/` se abren y editan en Illustrator o Inkscape, y se pueden colocar en
InDesign si se quiere rehacer la maqueta allí: `src/maqueta.py` documenta la posición en mm de cada pieza.

### Reconstruir

Requisitos: Python 3 con `pymupdf`, `pypdf`, `numpy`, `Pillow`; Node con `playwright` (Chromium).

```bash
cd libro-piratas
bash herramientas/construir.sh            # texto/maqueta -> PDF -> verificación
bash herramientas/construir.sh original.pdf   # además, vuelve a extraer las ilustraciones del PDF original
```

La verificación (`herramientas/verificar.py`) falla si hay menos o más de 64 páginas, cajas de corte
incorrectas, una entrada del índice que no aparece en su página, texto en la franja del lomo o fuera de
márgenes, textos superpuestos, fuentes de sustitución o imágenes por debajo de 290 ppp.
