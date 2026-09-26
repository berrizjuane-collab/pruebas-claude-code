# TRAZA · Las finanzas con claridad

Calculadora visual de préstamos (sistema francés) para **Ingeniería Económica**.
El entregable es un único archivo, [`index.html`](index.html) (0,88 MB), con HTML, CSS,
JavaScript, fuentes y bibliotecas incorporadas: se abre con doble clic, sin instalación
ni conexión, y no envía datos a ningún servidor.

**Equipo:** Stephy Batiuk · Daniela Vidal · Diego Estevez · Juan Montero · Juan Berrizbeitia · Juan Rafael
**Contacto:** jeberrizbeitia.25@est.ucab.edu.ve

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
- **Power BI**: tres CSV (`traza_escenario`, `traza_amortizacion`, `traza_flujos`) con ID de
  escenario estable, guía de importación, modelo y medidas DAX.
- **Créditos** en tarjeta ladeada que gira para mostrar el contacto del coordinador.

## Estructura

| Ruta | Contenido |
|---|---|
| `index.html` | Entregable generado (no editar a mano). |
| `src/` | Fuentes: `template.html`, `styles.css`, `config.js` (APP_CONFIG), `engine.js` (motor puro), `format.js`, `inputs.js`, `charts.js` (escenas SVG/PDF), `analysis.js`, `csv.js`, `pdf.js`, `app.js`. |
| `vendor/` | jsPDF 4.2.1 y jsPDF-AutoTable 5.0.8 (MIT); Inter 4.1 (SIL OFL 1.1) en WOFF2 para la interfaz y TTF con cifras tabulares para el PDF. |
| `tools/build.mjs` | Ensambla `index.html` (Node, sin dependencias). |
| `tools/build_fonts.py` | Regenera los subconjuntos de Inter (fontTools). |
| `tests/` | Pruebas unitarias (`*.test.mjs`) y verificación de extremo a extremo (`e2e.cjs`). |

```bash
node traza/tools/build.mjs                                # reconstruir index.html
cd traza && node --test tests/*.test.mjs                  # motor, parser, análisis y CSV
NODE_PATH=$(npm root -g) node traza/tests/e2e.cjs [dir]   # navegador (requiere Playwright)
```

## Personalización

Todo lo editable está en `src/config.js` (`APP_CONFIG`): integrantes, roles opcionales,
nombre y correo del coordinador, y el bloque `powerBI` (desactivado). Tras editar,
ejecutar `node traza/tools/build.mjs`.

> **Por confirmar:** el nombre del coordinador se configuró como **Juan Berrizbeitia**
> porque el correo proporcionado (`jeberrizbeitia.25@…`) le corresponde. Si el coordinador
> es otra persona, basta cambiar `coordinatorName`.

## Reporte de validación (26/09/2026)

**Entorno:** Chromium 141 (Playwright 1.56, sin interfaz), Linux, Intel Xeon 2,8 GHz, 4 núcleos.

### Pruebas realizadas

- **Unitarias: 25/25.** Oráculos N01–N06 exactos; invariantes de §16.2 en un barrido de
  480 préstamos (4 montos × 6 tasas × 10 plazos × 2 tipos de tasa); extremos V11
  (10⁹, 100 %, 600 meses) y V12 (0,0001 %); parser V01–V04; formato y CSV sin exponentes;
  análisis entre 192 y 300 palabras sin juicios sin sustento; cobertura total de glifos del
  texto del informe en la fuente incrustada; tres CSV con ID común y n / n+1 filas.
- **Extremo a extremo: 70/70** en Chromium: V01–V19, V21–V25, V27 y V28, más orientación
  inicial, exportaciones deshabilitadas antes del cálculo, tooltips por teclado, ausencia de
  errores de consola y de peticiones de red externas.
- **PDF revisados página por página** (1, 24, 72, 120 y 600 meses; USD, EUR, VES; tasa cero):
  solo fuente Inter incrustada, texto extraíble, sin caracteres sustituidos, 600 filas
  presentes, encabezado repetido en cada página de la tabla, créditos y nota de redondeo.
  El PDF generado mientras se editaba conserva el escenario inicial (V17).
- **Impresión de respaldo:** tabla completa, fórmulas expandidas, ambas vistas de saldo y
  restauración de la interfaz al terminar.
- **Rendimiento:** motor de 600 meses 0,27 ms (objetivo < 50 ms); cálculo y render completo
  tras un cambio confirmado 19–31 ms (objetivo < 100 ms); PDF de 600 meses ≈ 0,5 s.
- **Anchos:** 320, 390, 768, 1024 y 1440 px sin desplazamiento horizontal ni importes cortados.
- **Contraste** (WCAG, calculado por script): tinta/blanco 14,4:1; petróleo/blanco 6,9:1;
  texto secundario 6,3:1; salvia/tinta 8,0:1; bordes de control 3,4:1. El cobre (4,05:1) no se
  usa para texto pequeño.

### Pendientes (no verificados aquí)

- Firefox y Safari/WebKit: no disponibles en este entorno.
- Dispositivo táctil real y lector de pantalla real (NVDA, VoiceOver): no probados; la
  semántica, nombres accesibles y regiones vivas sí se verificaron de forma automatizada.
- V20: importación en Power BI Desktop (requiere Windows) no probada.
- V26: zoom 200 % no probado directamente (sí el reflujo equivalente a 320–390 px).
- Reporte de Power BI publicado e insertado: **pendiente de integración externa**; no se
  proporcionó una URL ni un acceso. La app no muestra ningún reporte simulado.

### Trazabilidad de los 20 requisitos

| Nº | Requisito | Dónde |
|---:|---|---|
| 1–3 | Campo + deslizador de monto, tasa y meses | Panel «Configura tu préstamo» |
| 4 | Botón Calcular | Valida, calcula, enfoca el resultado |
| 5 | Cuota grande | Tarjeta tinta «Cuota mensual estimada» |
| 6 | Capital/intereses | Anillo «Composición del total pagado» |
| 7 | Desglose mensual | Tabla de amortización (n filas, 5 columnas) |
| 8 | Cash Flow Diagram | Diagrama de flujo, perspectiva del deudor |
| 9 | Cash Balance Chart | Deuda pendiente / efectivo acumulado |
| 10 | Dashboard + Power BI | Panel nativo + CSV, guía y DAX (reporte externo pendiente) |
| 11 | Divisas | Denominación y conversión con factor explícito |
| 12 | Reflexión crítica | Análisis, comparación, fórmulas y supuestos |
| 13–14 | Introducción e instrucciones | Encabezado de página y ayuda del panel |
| 15 | PDF | Informe jsPDF + impresión de respaldo |
| 16–18 | Diseño, animaciones, responsive | Identidad TRAZA, transiciones cortas, 320–1440 px |
| 19–20 | Créditos ladeados y correo | Tarjeta giratoria con contacto real |

## Licencias

Inter 4.1 © The Inter Project Authors — SIL Open Font License 1.1.
jsPDF 4.2.1 y jsPDF-AutoTable 5.0.8 — licencia MIT. Los textos completos están en
`vendor/` y dentro de `index.html` («Licencias de terceros», al pie).
