# Campos — laboratorio de campos vectoriales 3D

Laboratorio en el navegador para explorar campos **F(x, y, z) = (P, Q, R)** y, desde la
versión 1.1, también **F(x, y, z, t)**: dirección y magnitud con flechas, líneas de
corriente, partículas, cortes con mapas escalares, divergencia y rotacional, e inspección de
cualquier punto con sus derivadas. Una **vista libre** inmersiva permite recorrer el espacio
en primera persona. Interfaz
minimalista y estrictamente monocromática (la magnitud se codifica con longitud y
luminancia; el signo, con texturas), en español y pensada para estudiantes de cursos
superiores y especialistas.

## Usarlo

Abre **[`entrega/campos-vectoriales.html`](entrega/campos-vectoriales.html)** con doble clic en
Chrome, Edge, Firefox o Safari recientes (hace falta WebGL2). Es un único archivo de 1.9 MB
con todo dentro (código, estilos, fuentes y el *worker* de cálculo): no necesita servidor ni
conexión. Su historial de versiones está en [`entrega/LEEME.md`](entrega/LEEME.md).

Recorrido rápido:

1. **Ejemplos**: nueve campos del catálogo: seis estacionarios (uniforme, radial ±, rotacional,
   helicoidal, silla) y tres que dependen del tiempo (viento giratorio, lluvia con ráfagas,
   silla giratoria).
2. **Ecuaciones**: escribe P, Q y R con `x`, `y`, `z`, parámetros y funciones (`sin`, `exp`,
   `sqrt`, `atan2`, `hypot`…); se validan mientras escribes y se aplican a los 300 ms.
3. **Parámetros**: deslizador, valor exacto, rango y paso; añade los tuyos.
4. **Visualización**: flechas, líneas de corriente, partículas, glifos de F o de rot F, corte
   con «Escalar» (‖F‖, div F, (rot F)·n, F·n), dominio y densidad.
5. **Inspector**: clic sobre una flecha o el corte, o la tecla **I**: F, ‖F‖, div F, rot F,
   rueda de paletas y jacobiana en P.
6. **Exportar**: configuración `.json` (se vuelve a abrir con «Abrir» o arrastrándola) e
   imagen PNG en tres tamaños. El experimento se guarda solo en el navegador.
7. **Tiempo** (1.1): escribe `t` en una ecuación o elige un campo temporal. La sección «Tiempo»
   tiene el instante, reproducir/pausar (Espacio), la ventana y el bucle. Las flechas cambian
   en su sitio; las partículas (las «gotas») siguen ṙ = F(r, t); las líneas de corriente son
   las del instante. Con «Nacen en: semillas» (Avanzado) se ven las líneas de traza.
8. **Alcance** (1.1): en «Dominio y muestreo», «Ampliar ×2» y «Estrechar ÷2» cambian Ω
   conservando la separación de la malla.
9. **Vista libre** (1.1): botón de la barra de la escena o **V**. Solo la escena, a pantalla
   completa: arrastra o usa las flechas para mirar, W A S D, E y Q para moverte, Mayús para
   ir más rápido, la rueda para la velocidad, + y − para dilatar el espacio (λ), U para el
   espacio sin límites (la malla te acompaña). Esc o V devuelven todo como estaba.

La **ayuda** (botón «Ayuda», **?** o **F1**) explica los conceptos, la sintaxis completa, los
atajos y los supuestos. Atajos principales:

| Teclas | Acción |
| --- | --- |
| ? · F1 | Ayuda |
| F · L · P · C · G | Flechas · líneas · partículas · corte · glifos F / rot F |
| 1 · 2 · 3 · 4 · 5 | Vistas XY · XZ · YZ · isométrica · perspectiva / ortográfica |
| R | Encuadrar y restablecer la cámara |
| I | Inspeccionar un punto por coordenadas |
| Espacio | Pausar / reanudar la animación |
| V | Vista libre (inmersiva) · dentro: W A S D E Q, flechas, Mayús, rueda, + −, U, R, H, Esc |
| Esc | Cierra lo último abierto |
| Ctrl + Z | Deshacer un restablecimiento o una apertura (mientras dure el aviso) |

Con la escena enfocada (Tab hasta ella): flechas para orbitar, Mayús + flechas para
desplazar, + y − para acercar, Intro para inspeccionar el nodo central.

## Desarrollo

Requisitos: **Node ≥ 22.12** y npm ≥ 10. La conexión solo hace falta para instalar.

```bash
cd campos-vectoriales
npm ci                             # dependencias (una vez)
npm run dev                        # http://localhost:5173
npm run check                      # lint + tipos + pruebas unitarias
npm run build                      # → dist/campos-vectoriales.html (archivo único)
```

Pruebas y validación (VALIDATION.md):

```bash
npm test                           # unitarias (Vitest): matemática, numérica, estado…
npm run test:cobertura             # con cobertura; falla si math/ o numerics/ < 90 %
npx playwright install chromium    # una vez, para las pruebas de navegador
npm run test:e2e                   # funcionales, accesibilidad, capturas de referencia y rendimiento
OBJETIVO=archivo npm run test:e2e -- --project=chromium   # contra dist/campos-vectoriales.html (file://)
npm run capturas -- --tarea=REV-04 --capturas=C1,C2 --tamanos=V1,V2,V3   # revisión visual
npm run perf -- --escena=PERF-A --equipo=C0                              # rendimiento
```

Las capturas de referencia de `tests/visual/` solo valen en Linux con Chromium 1194; en otro
sistema, ejecuta `npm run test:e2e -- --project=chromium` o regenéralas con
`--update-snapshots`.

### Estructura

```
src/
  math/        expresiones (léxico, análisis, compilación, derivada simbólica), catálogo
  numerics/    rejilla, RK4 (líneas y partículas), semillas, cortes, diferencias finitas, formato
  geometria/   geometría de flechas, líneas y mapa escalar como datos puros
  compute/     worker de cálculo, protocolo y cliente con cancelación
  state/       esquema del experimento, acciones, almacén y persistencia (JSON v1)
  render/      escena three.js: capas, cámara, texto, selección
  ui/          componentes React: panel, barra superior, leyenda, inspector, ayuda
  app/         composición: orquestador, atajos, archivo, imagen, medición de rendimiento
  export/      JSON y PNG sin React
tests/         e2e (Playwright), visual (referencias), fixtures
scripts/       HTML autocontenido, capturas, medición de rendimiento, utilidades
evidencia/     evidencia de cada tarea (registros, capturas, informes)
```

Las fronteras entre capas las impone ESLint (PLAN §1.5): `math/`, `numerics/` y `geometria/`
son puras; `render/` no conoce React ni el almacén.

## Estado

Ver **[STATUS.md](STATUS.md)** (fase, decisiones D-xx, riesgos, preguntas y registro). En
resumen: hitos H0–H8 completados (salvo la sesión con lector de pantalla de A11Y-02) y H9
casi cerrado. Quedan tres comprobaciones que necesitan el equipo del usuario, cada una con
su guion:

| Pregunta | Qué | Guion |
| --- | --- | --- |
| Q-04 | Sesión con lector de pantalla (NVDA + Firefox o VoiceOver + Safari) | [evidencia/A11Y-02/guion-lector.md](evidencia/A11Y-02/guion-lector.md) |
| Q-05 | Prueba de humo en Firefox y Safari | [evidencia/VAL-02/guion-humo.md](evidencia/VAL-02/guion-humo.md) |
| Q-06 | Medición de rendimiento en el equipo de referencia (i9 + RTX 4060 + 144 Hz) | [evidencia/VAL-03/guion-R1.md](evidencia/VAL-03/guion-R1.md) |

## Documentos

| Documento | Contenido |
| --- | --- |
| [SPEC.md](SPEC.md) | Visión, alcance, fundamentos matemáticos, catálogo y métodos computacionales |
| [DESIGN.md](DESIGN.md) | Dirección visual, composición, componentes y reglas de representación monocromática |
| [PLAN.md](PLAN.md) | Arquitectura, ejecución local, flujos de uso, hitos y tareas |
| [VALIDATION.md](VALIDATION.md) | Tolerancias y pruebas matemáticas, funcionales, visuales, de accesibilidad y de rendimiento |
| [STATUS.md](STATUS.md) | Estado, decisiones, supuestos, riesgos, preguntas y siguiente paso |
