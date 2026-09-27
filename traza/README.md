# VÉRTICE · El valor correcto. En la fecha correcta.

Calculadora visual de préstamos (sistema francés) para **Ingeniería Económica**.
El entregable es un único archivo, [`index.html`](index.html) (1,03 MB), con HTML, CSS,
JavaScript, fuentes, emblema y bibliotecas incorporadas: se abre con doble clic, sin
instalación ni conexión, y no envía datos a ningún servidor.

**Equipo:** Stephy Batiuk · Daniela Vidal · Diego Estevez · Juan Montero · Juan Berrizbeitia · Juan Rafael
**Contacto:** jeberrizbeitia.25@est.ucab.edu.ve

> La carpeta se sigue llamando `traza/` y el espacio de nombres interno de JavaScript sigue
> siendo `TRAZA` (nombre en clave del proyecto) para no romper enlaces ni código. Nada de eso
> es visible: la interfaz, el PDF y los archivos exportados usan la marca VÉRTICE.

## Qué hace

- Monto, tasa anual y plazo con campo exacto + deslizador sincronizados; tasa **nominal anual**
  (i = j/12) o **efectiva anual** (i = (1+e)^(1/12) − 1).
- «Calcular» valida y lleva al resultado; después, cada cambio válido actualiza todo
  (deslizador: una vez por cuadro; campos: 250 ms o Enter/salida del campo).
- Cuota destacada, KPIs, anillo de **composición del total pagado**, **evolución de saldos**
  (deuda pendiente / efectivo acumulado del préstamo), **diagrama de flujo de efectivo** del
  deudor (esquema o escala proporcional, tramos con llaves y vista de todos los meses) y
  **tabla de amortización** paginada con totales del préstamo completo.
- **Divisas** USD/EUR/GBP/VES como denominación del préstamo, y **conversión** opcional con
  tipo de cambio, fecha y fuente ingresados manualmente (sin cotizaciones inventadas).
- **Análisis crítico** generado localmente (180–300 palabras), comparación n ± 12 meses,
  fórmulas con sustitución y supuestos del modelo.
- **Informe PDF** real (jsPDF + AutoTable) con texto seleccionable, gráficas vectoriales y
  todas las filas; respaldo «Imprimir / guardar como PDF».
- **Power BI**: tres CSV (`vertice_escenario`, `vertice_amortizacion`, `vertice_flujos`) con ID
  de escenario estable (`VRT-XXXXXXXX`), guía de importación, modelo y medidas DAX.
- **Créditos** en tarjeta ladeada que gira para mostrar el contacto del coordinador.

## Identidad VÉRTICE

Aplicada según la *Guía de identidad VÉRTICE*; el cambio de marca solo tocó la presentación
(colores, tipografía, emblema, textos de marca y nombres de archivo). Cálculos, controles,
flujo de uso, columnas de los CSV y contenido del informe son los mismos.

- **Paleta:** verde Vértice `#10372F` (encabezado, pie, capital y deuda), marfil `#F4F1E8`
  (fondo), grafito `#2B3430` (texto), cobre `#B56C4D` (intereses y salidas) y oro mate
  `#C5A25D` (acentos). «Cobre y oro destacan; verde y grafito explican.»
- **Contraste:** como pide la guía, el cobre y el oro de marca no se usan para texto pequeño
  sobre marfil. Para etiquetas se usan derivados accesibles: cobre de texto `#96533A` y gris
  secundario `#5F6963`. El oro solo aparece como texto sobre verde.
- **Emblema:** es la imagen original de la guía, recortada sin reconstruirla
  (`tools/build_brand.py`). Siempre va sobre una loseta marfil, con área de respeto y un tamaño
  mínimo de 18 px en pantalla y 6 mm impreso. Lo usan el encabezado, el pie, el favicon, la
  portada y los encabezados del PDF.
- **Tipografía (sustitución declarada):** la guía pide Georgia (titulares) y Segoe UI
  (interfaz). Son fuentes de Microsoft y no se pueden incrustar, así que la interfaz las usa
  cuando están instaladas (Georgia viene con Windows, macOS e iOS; Segoe UI, solo con
  Windows). Si no, recurre a sustitutos abiertos incorporados:
  - **VerticeSerif** = Gelasio 1.008, con métricas compatibles con Georgia.
  - **VerticeSans** = Noto Sans 2.015, cuyo latín deriva de Open Sans, pariente directo de
    Segoe UI. Incluye flechas y operadores tomados de Inter 4.1.

  El PDF siempre incorpora VerticeSans y VerticeSerif (SIL OFL 1.1, familias renombradas por
  ser subconjuntos modificados; `tools/build_fonts.py`).

## Estructura

| Ruta | Contenido |
|---|---|
| `index.html` | Entregable generado (no editar a mano). |
| `src/` | Fuentes: `template.html`, `styles.css`, `config.js` (APP_CONFIG), `engine.js` (motor puro), `format.js`, `inputs.js`, `charts.js` (escenas SVG/PDF), `analysis.js`, `csv.js`, `pdf.js`, `app.js`. |
| `vendor/brand/` | Emblema VÉRTICE (PNG con transparencia) y favicon, extraídos de la guía. |
| `vendor/fonts/` | VerticeSans y VerticeSerif en WOFF2 (interfaz) y TTF (PDF), `pdf-cmap.json` y licencias OFL. |
| `vendor/jspdf/` | jsPDF 4.2.1 y jsPDF-AutoTable 5.0.8 (MIT). |
| `tools/build.mjs` | Ensambla `index.html` (Node, sin dependencias). |
| `tools/build_fonts.py` | Regenera los subconjuntos tipográficos (fontTools; salida reproducible). |
| `tools/build_brand.py` | Extrae el emblema y el favicon del PDF de la guía (PyMuPDF + Pillow). |
| `tests/` | Pruebas unitarias (`*.test.mjs`) y verificación de extremo a extremo (`e2e.cjs`). |

```bash
node traza/tools/build.mjs                                # reconstruir index.html
cd traza && node --test tests/*.test.mjs                  # motor, parser, análisis, CSV y glifos
NODE_PATH=$(npm root -g) node traza/tests/e2e.cjs [dir]   # navegador (requiere Playwright)
```

## Personalización

Todo lo editable está en `src/config.js` (`APP_CONFIG`): integrantes, roles opcionales,
nombre y correo del coordinador, y el bloque `powerBI` (desactivado). Tras editar,
ejecutar `node traza/tools/build.mjs`.

> **Por confirmar:** el nombre del coordinador se configuró como **Juan Berrizbeitia**
> porque el correo proporcionado (`jeberrizbeitia.25@…`) le corresponde. Si el coordinador
> es otra persona, basta cambiar `coordinatorName`.

## Reporte de validación (27/09/2026, identidad VÉRTICE)

**Entorno:** Chromium 141 (Playwright 1.56, sin interfaz), Linux, Intel Xeon 2,8 GHz, 4 núcleos.

### Pruebas realizadas

- **Unitarias: 26/26.** Oráculos N01–N06 exactos; invariantes de §16.2 en un barrido de
  480 préstamos; extremos V11 (10⁹, 100 %, 600 meses) y V12 (0,0001 %); parser V01–V04;
  formato y CSV sin exponentes; análisis de 180–300 palabras sin juicios sin sustento;
  cobertura de glifos del informe en VerticeSans y de sus títulos en VerticeSerif; tres CSV
  con ID común `VRT-` y n / n+1 filas; nombres de archivo VÉRTICE.
- **Extremo a extremo: 75/75** en Chromium. Cubre V01–V19, V21–V25, V27 y V28, orientación
  inicial, exportaciones deshabilitadas antes del cálculo, tooltips por teclado, y ausencia de
  errores de consola y de peticiones externas. Añade verificaciones de marca: título,
  ningún «TRAZA» visible en textos ni atributos, emblema y favicon incrustados, tipografías
  cargadas, paleta y nombres de los CSV descargados.
- **PDF revisados página por página:** 1 mes con tasa cero, 24 meses, 36 meses convertidos
  a VES, y 600 meses en USD y en VES con factor 100.000.000. Cada uno tiene solo VerticeSans
  y VerticeSerif incrustadas, texto extraíble, ningún carácter sustituido, las 600 filas
  presentes y el emblema en cada página (una sola imagen reutilizada, 8 mm en la portada y
  6 mm en los encabezados). Ninguna cifra desborda la caja de la cuota.
- **Impresión de respaldo:** encabezado y pie claros con filete oro, tabla completa y pie sin
  partirse entre páginas.
- **Anchos:** 320, 390, 768, 1024 y 1440 px sin desplazamiento horizontal ni importes
  cortados. La geometría de los bloques se comparó con la versión anterior: mismas columnas
  y anchos; solo cambian alturas por la tipografía.
- **Rendimiento:** motor de 600 meses 0,49 ms (objetivo < 50 ms); cálculo y render completo
  tras un cambio confirmado 11–19 ms (objetivo < 100 ms); PDF de 600 meses ≈ 0,6 s.
- **Contraste** (WCAG, calculado por script):

  | Uso | Contraste |
  |---|---|
  | Grafito sobre marfil | 11,4:1 |
  | Verde sobre marfil | 11,6:1 |
  | Marfil sobre verde | 11,6:1 |
  | Verde sobre salvia | 11,0:1 |
  | Oro sobre verde | 5,4:1 |
  | Cobre de texto sobre marfil | 5,2:1 |
  | Gris secundario sobre marfil | 5,0:1 |
  | Gris secundario sobre salvia | 4,8:1 |
  | Bordes de control | 3,3:1 o más |
  | Cobre y eje de las gráficas | 3,9:1 y 4,0:1 |

### Pendientes (no verificados aquí)

- Firefox y Safari/WebKit: no disponibles en este entorno.
- Aspecto con Georgia y Segoe UI reales: en este entorno no están instaladas, así que se
  verificaron los sustitutos.
- Dispositivo táctil real y lector de pantalla real (NVDA, VoiceOver): no probados. Sí se
  verificaron de forma automatizada la semántica, los nombres accesibles y las regiones vivas.
- V20: importación en Power BI Desktop (requiere Windows) no probada.
- V26: zoom al 200 % no probado directamente (sí el reflujo equivalente a 320–390 px).
- Reporte de Power BI publicado e insertado: **pendiente de integración externa**; no se
  proporcionó una URL ni un acceso. La app no muestra ningún reporte simulado.

### Trazabilidad de los 20 requisitos

| Nº | Requisito | Dónde |
|---:|---|---|
| 1–3 | Campo + deslizador de monto, tasa y meses | Panel «Configura tu préstamo» |
| 4 | Botón Calcular | Valida, calcula, enfoca el resultado |
| 5 | Cuota grande | Caja salvia «Cuota mensual estimada» |
| 6 | Capital/intereses | Anillo «Composición del total pagado» |
| 7 | Desglose mensual | Tabla de amortización (n filas, 5 columnas) |
| 8 | Cash Flow Diagram | Diagrama de flujo, perspectiva del deudor |
| 9 | Cash Balance Chart | Deuda pendiente / efectivo acumulado |
| 10 | Dashboard + Power BI | Panel nativo + CSV, guía y DAX (reporte externo pendiente) |
| 11 | Divisas | Denominación y conversión con factor explícito |
| 12 | Reflexión crítica | Análisis, comparación, fórmulas y supuestos |
| 13–14 | Introducción e instrucciones | Encabezado de página y ayuda del panel |
| 15 | PDF | Informe jsPDF + impresión de respaldo |
| 16–18 | Diseño, animaciones, responsive | Identidad VÉRTICE, transiciones cortas, 320–1440 px |
| 19–20 | Créditos ladeados y correo | Tarjeta giratoria con contacto real |

## Licencias

- VerticeSans: subconjunto modificado de Noto Sans 2.015 (© The Noto Project Authors), con
  glifos de Inter 4.1 (© The Inter Project Authors).
- VerticeSerif: subconjunto de Gelasio 1.008 (© The Gelasio Project Authors).
- Las tres fuentes están bajo SIL Open Font License 1.1.
- jsPDF 4.2.1 y jsPDF-AutoTable 5.0.8: licencia MIT.

Los textos completos están en `vendor/` y dentro de `index.html` («Licencias de terceros», al
pie). El emblema VÉRTICE pertenece al equipo y proviene de su guía de identidad.
