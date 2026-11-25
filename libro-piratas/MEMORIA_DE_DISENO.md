# Piratas del Caribe · Las cinco travesías
## Memoria de diseño de la reedición como libro de consulta

Este documento explica cómo se reorganizó el libro para que cumpla los seis criterios de evaluación de un libro tipo enciclopedia. Para cada criterio se indica primero qué problema tenía la versión anterior (`Piratas_del_Caribe_libro_final_mejorado.pdf`, 64 págs.) y después la solución adoptada, con medidas concretas.

**Entregables**

| Archivo | Para qué sirve |
|---|---|
| `Piratas_del_Caribe_imprenta.pdf` | Original para imprenta: 72 págs., sangrado de 3 mm, marcas de corte y registro, TrimBox/BleedBox definidos. |
| `Piratas_del_Caribe_digital.pdf` | Lectura en pantalla: páginas al corte, marcadores navegables, índice con enlaces y apertura a doble página. |
| `Piratas_del_Caribe_pliegos.pdf` | Vista de libro abierto (pares e impares enfrentadas) para revisar medianil y composición de pliegos. |
| `Piratas_del_Caribe_cubierta.pdf` | Cubierta extendida para tapa dura (contracubierta + lomo + cubierta), con una segunda página de guías acotadas. |
| `Piratas_del_Caribe_guardas.pdf` | Guardas impresas con el motivo de rombos de la edición. |

---

## 1. Navegabilidad y estructura de consulta

**Antes.** El índice tenía un solo nivel (9 líneas, sin escenas). Las portadillas de capítulo caían unas en página impar y otras en par (pp. 7, 18, 29, 40, 51). Las escenas 1 y 2 de la película V estaban en orden invertido (la p. 53 iba detrás de la 54). No había forma de llegar a una película sin hojear.

**Ahora.**

- **Plan de 72 páginas** (4 pliegos de 16 + 1 de 8), con preliminares (pp. 1–9), cinco capítulos de **12 páginas idénticas** (pp. 10–69) y apéndices (pp. 70–72).
- **Cada capítulo tiene la misma estructura**, organizada en 6 pliegos: portadilla + ficha técnica · quién es quién + escena 1 · escenas 2–3 · escena clave (cita + lámina) · escenas 4–5 · escena 6 + reflexión. Quien consulta sabe dónde está cada dato sin mirar el índice.
- **Índice de dos niveles** a doble página (pp. 4–5): películas y todas sus secciones y escenas, con filetes de puntos y folios alineados.
- **Pestañas de color** en el borde exterior: cada película tiene un color y una altura propios (I a V, de arriba abajo). Con el libro cerrado se ven en el canto, como en un diccionario.
- **Cornisas**: en la página par, la película; en la impar, la sección o escena que se consulta. **Folio** en la esquina exterior superior, junto a la cornisa, siempre visible (también en las páginas oscuras, en dorado).
- **Ficha de escena constante**: etiqueta (película · escena n de 6) + indicador de progreso de seis puntos, título, texto, figura numerada y columna «En esta escena» (personajes, lugares, naves, objetos y criaturas citados, con remisión a «Quién es quién»).
- **Remisiones cruzadas**: cada portadilla trae su propio minisumario con páginas; las fichas de personaje indican en qué películas aparece cada uno y en qué escenas del capítulo; cada reflexión remite al capítulo siguiente.
- **Nuevas herramientas de consulta**: «Cómo consultar este libro» (p. 7, esquema anotado de una página tipo) e **índice analítico** (p. 71) con 47 entradas de personajes, naves, lugares, objetos e instituciones, generado automáticamente a partir del texto para que las páginas citadas sean exactas.

## 2. Retícula y jerarquía visual

**Antes.** Cada página colocaba las cajas en un sitio distinto (papeles rasgados con cinta); la anchura de columna variaba de unos 55 a 190 mm; había imágenes partidas entre páginas que no se ven juntas (13|14 y 47|48 son anverso y reverso de la misma hoja).

**Ahora.**

- **Retícula modular de 6 columnas × 6 filas** sobre **línea base de 14 pt**: columnas de 25,23 mm con medianil de columna de 4,5 mm; filas de 7 líneas (34,57 mm) separadas por una línea. Caja de texto de 173,9 × 232,1 mm (47 líneas).
- **Distribución fija** en las páginas de escena: 4 columnas de texto en el lado del lomo y 2 columnas de datos y notas en el lado del corte (las páginas pares e impares son simétricas).
- **Las figuras cuelgan siempre de una línea de la retícula** (fila 3 o 4 según la extensión del texto) y se alinean a la columna de texto.
- **Jerarquía en seis niveles bien diferenciados**: título de entrada (Caslon Display 28/30 pt) · etiqueta (Source Sans 3 semibold 7,6 pt, versalitas espaciadas, color de la película) · texto (Caslon 10,5/14 pt) · notas (Source Sans 3 8,4/11,6 pt con filete de color) · datos (Source Sans 3 8,6 pt) · pies de foto (Source Sans 3 7,9/10,6 pt, número en negrita y procedencia en cursiva).

## 3. Tipografía y legibilidad

**Antes.** Se mezclaban Georgia, Palatino y una tercera letra condensada; el texto se justificaba en columnas estrechas, con ríos y espacios enormes (pp. 21 y 42); había palabras pegadas por el copiado («llamadoWill», «capitánJack», «llamarseTurner», «elKraken», «delHolandés», «mientrasAngelica»…) y cortes en nombres propios («Bec-kett»).

**Ahora.**

- **Libre Caslon Text y Display** para texto y títulos: es un *revival* de la letra inglesa de William Caslon, la tipografía del siglo XVIII, la época en que transcurre la saga. **Source Sans 3** como sans de apoyo para la navegación (cornisas, etiquetas, datos y pies). Solo dos familias.
- **10,5/14 pt** en bandera a la izquierda, con una medida de unas 60–65 letras por línea: sin ríos ni espacios irregulares.
- **Microtipografía**: partición silábica española (con guion blando, nunca en nombres propios); espacios de no separación tras las palabras de una letra y en «p. 12»; las tres últimas palabras de cada párrafo van unidas para que no queden líneas finales cortas; nombres del reparto indivisibles; comillas angulares « », puntos suspensivos tipográficos y cursiva para títulos de películas y nombres de naves (*Perla Negra*, *Holandés Errante*).
- **Control automático**: tras cada composición, un script mide cada párrafo en el navegador: **0 líneas finales por debajo del 16 % de la medida, 0 desbordes de módulo y 0 textos dentro de la zona de riesgo** (a menos de 5 mm del corte o de 15 mm del lomo). No hay párrafos que pasen de una columna o página a otra, así que tampoco puede haber viudas ni huérfanas. Sin falsas negritas ni cursivas: todas las fuentes están incrustadas como subconjuntos TrueType.

## 4. Rigor y calidad de las imágenes

**Antes.** De 54 colocaciones de imagen, **47 quedaban por debajo de 150 ppp** efectivos y 31 por debajo de 100 (la peor, a 39 ppp). **23 estaban deformadas** (escala horizontal distinta de la vertical, hasta un 41 %), varias estaban giradas y estiradas, el barco y la isla se repetían cinco veces cada uno y **ninguna llevaba pie de foto**.

**Ahora.**

- **Ninguna imagen se deforma**: todas se escalan proporcionalmente. El control verifica que la relación de aspecto colocada coincide con la del archivo (36 de 36). Se restituyeron la orientación y la proporción de la ilustración de Jack y Angélica, que estaba girada y estirada.
- **Resolución mínima de 200 ppp efectivos** para todo el material raster: cada imagen se coloca, como máximo, al tamaño que permiten sus píxeles. Las ilustraciones vectoriales originales de la edición se reprodujeron desde el vector a 300–755 ppp; las láminas I, IV y V, a 553 ppp.
- **Recortes solo justificados**: se eliminaron áreas crema vacías y fondos ya fundidos en el archivo, y un 1,2 % de borde con artefactos de exportación en las láminas. A la ilustración del torbellino (lámina III) se le retiró por retoque el texto que traía incrustado.
- **Cada imagen se usa una sola vez y en la escena que ilustra** (por ejemplo, el duelo en la herrería pasa a «Port Royal» y el cofre de monedas a «La maldición»).
- **Pies completos y numerados por película** (Fig. II·4, Lámina III): descripción de lo que se ve, técnica (fotografía de la película, ilustración digital, acuarela, grabado, ilustración vectorial) y procedencia. Los créditos detallados están en el colofón (p. 72).

| Pág. | Figura | Píxeles | Tamaño impreso | ppp efectivos |
|---|---|---|---|---|
| 13 | Fig. I·1 barco en la niebla | 374 × 619 | 47,5 × 78,6 mm | 200 |
| 14 | Fig. I·2 duelo en la herrería | 682 × 395 | 86,6 × 50,2 mm | 200 |
| 19 | Fig. I·5 isla desierta | 1394 × 762 | 114,4 × 62,6 mm | 309 |
| 29 | Lámina II · el Kraken | 912 × 1179 | 114,4 × 147,9 mm | 202 |
| 41 | Lámina III · el torbellino | 912 × 1178 | 114,4 × 147,8 mm | 202 |
| 54 | Fig. IV·4 sirena (vectorial) | 1743 × 2722 | 89,1 × 139,1 mm | 497 |
| 65 | Lámina V (vectorial) | 2490 × 3222 | 114,4 × 148,1 mm | 553 |

*(La tabla completa de las 36 imágenes está en `qa_build.json`.)* **Pendiente recomendado:** varias fotografías solo tienen entre 370 y 760 píxeles de ancho; para imprimirlas más grandes a 300 ppp habría que conseguir originales de al menos 1400 px.

## 5. Coherencia conceptual y cromática

**Antes.** La textura de pergamino con manchas y los papeles rasgados bajaban el contraste del texto; las etiquetas doradas sobre el pergamino apenas se leían; los iconos decorativos (ancla, calavera, X…) cambiaban de esquina en cada página.

**Ahora.**

- **Un concepto: la carta náutica nocturna.** Noche (azul, estrellas, olas) para las páginas de apertura y las escenas clave; papel marfil liso para la consulta. Las ilustraciones vectoriales originales (barco de velas en hoja, cálices, tridente, rosa de los vientos) se conservan y se convierten en el **emblema de cada película**: barco (I), cofre (II), rosa de los vientos (III), cáliz (IV) y tridente (V).
- **Un color por película**, tomado de sus portadillas originales: I azul noche `#1E3D5C`, II verde Kraken `#1D5550`, III índigo `#3A3868`, IV granate `#6A2D28`, V bronce `#74531C`. El color se repite en la pestaña, la etiqueta, los puntos de progreso, la ficha y el índice.
- **Contraste**: texto `#2A2420` sobre marfil `#F6F1E6`, 13,6:1; etiquetas en el color de la película, como mínimo 6:1; los textos secundarios más claros, como mínimo 5:1. El dorado se reserva para filetes y para texto sobre fondo oscuro.

## 6. Producción, encuadernación y acabados

**Antes.** El PDF no tenía sangrado (página = corte) ni marcas; el marco de iconos corría a unos 3 mm del borde, de modo que cualquier desviación de la guillotina se notaría, y en el lomo se perdería dentro de la encuadernación; las imágenes que «sangraban» no llegaban a cubrir un sangrado real.

**Ahora.**

- **Formato** 215,9 × 279,4 mm (carta). **Sangrado** de 3 mm en todo lo que llega al corte (fondos, láminas, pestañas) y **marcas de corte y registro** en una zona de cortesía de 10 mm. Las cajas TrimBox y BleedBox están definidas para la preimpresión.
- **Márgenes**: cabeza 22 mm · pie 25,3 mm · **lomo 22 mm** · corte 20 mm. Ningún texto queda a menos de 15 mm del lomo (comprobado de forma automática), y los pliegos enfrentados no tienen nada importante en el centro: ninguna imagen cruza el medianil.
- **Zona segura**: el marco decorativo de la cubierta se coloca a 10 mm del borde de la tapa y en el interior desaparece el marco perimetral.
- **Papel**: estucado mate de 150 g/m² (buena reproducción de imagen y sin reflejos al leer). Guardas de offset de 140 g/m² impresas con el motivo de rombos.
- **Encuadernación**: tapa dura con cartón de 2,5 mm, **cosido al hilo** y lomo recto con cabezada, para que el libro abra del todo y aguante la consulta. **Lomo calculado: 10,9 mm** (36 hojas × 0,135 mm + guardas + cartones). Cubierta extendida de 492,7 × 315,4 mm con vuelta de 15 mm y cajo de 7 mm; en la segunda página de `cubierta.pdf` están las guías acotadas. *Hay que confirmar estos valores con la imprenta según el papel que use.*

---

### Cómo se generó
Todo el libro se compone desde datos estructurados (`content.py`) con plantillas HTML/CSS (`build.py`, `book.css`), se imprime a PDF con Chromium (`render.js`) y se pasa por un control de calidad automático. La posproducción (`post.py`, `cover.py`) añade marcas, cajas, marcadores y la vista en pliegos. Si se cambia un texto o una imagen, el índice, las remisiones y los folios se recalculan solos.
