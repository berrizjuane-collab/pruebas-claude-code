# PLAN — Arquitectura, hitos y checklist

> Cómo se construye lo especificado en [SPEC.md](SPEC.md) y [DESIGN.md](DESIGN.md), y cómo
> se demuestra con [VALIDATION.md](VALIDATION.md). El estado vivo está en [STATUS.md](STATUS.md).
>
> Estado del documento: **borrador para aprobación** · Fecha: 2026-10-02.

---

## 1. Arquitectura

### 1.1 Lo que hay en el entorno (inspección del 2026-10-02)

| Hecho observado | Consecuencia |
| --- | --- |
| El repositorio aloja **varios proyectos independientes**: un juego en la raíz (Vite + TS, desplegado en GitHub Pages desde `main`), `traza/` y `traza-promo/` con su propio `package.json` | El laboratorio vive en **`campos-vectoriales/`**, autocontenido, con sus propias dependencias. Se respeta la convención |
| El `tsconfig.json` de la raíz incluye solo `src` y el *build* de la raíz usa su propio `index.html` | El subproyecto no interfiere con el *build* ni con el despliegue existentes (verificado en FND-01) |
| Node 22.22, npm 10.9; 4 vCPU, 15 GiB de RAM, **sin GPU** | Vitest 5 exige Node ≥ 22.12: se cumple. Las medidas de FPS no son representativas aquí (VALIDATION §6) |
| Chromium 1194 (Playwright 1.56.1) preinstalado; **WebGL2 disponible por software** (ANGLE + SwiftShader) | Las capturas automáticas de la escena 3D son viables en este entorno |
| `ALIASED_LINE_WIDTH_RANGE = [1, 1]` | WebGL no dibuja líneas de más de 1 px: las líneas de corriente usan `Line2`/`LineMaterial` (cuadriláteros en pantalla) |
| La red permite el registro npm y `raw.githubusercontent.com`; **bloquea** threejs.org, vite.dev, MDN, w3.org y playwright.dev | La documentación oficial se consultó en los **repositorios fuente** de cada proyecto (§1.4) |
| Existe un proyecto 2D previo (Linear Transformation Lab) con React + Canvas 2D + KaTeX + Vitest y capas `math/ rendering/ state/` | Se reutiliza el **patrón** de capas, ya probado en el repositorio; no se reutiliza código (otro dominio y otra paleta) |

### 1.2 Tecnologías (versiones comprobadas en el registro npm)

| Pieza | Versión | Por qué |
| --- | --- | --- |
| **Vite** | 8.3.x | Servidor de desarrollo y *build*; *workers* como módulos ES con `new Worker(new URL(...), { type: 'module' })`, la forma recomendada por su guía. Solo transpila: el tipado lo comprueba `tsc` aparte |
| **TypeScript** | **6.0.x** (no 7.x) | `typescript-eslint` 8.71 declara `typescript >=4.8.4 <6.1.0`. TS 7 (nativo) se adoptará cuando el ecosistema lo soporte (STATUS D-05) |
| **React** + react-dom | 19.3.x | Interfaz de formularios, secciones y estados: unos 30 componentes. Proporcionado, conocido y con buen soporte de accesibilidad |
| `@vitejs/plugin-react` | 6.1.x | Requiere Vite 8 |
| **three.js** | 0.186.x (r186) | WebGL2 maduro: `InstancedMesh` (miles de flechas en una llamada, con `instanceId` en el *raycast*), `Line2`/`LineMaterial` (grosor en px y discontinuas), `OrbitControls` (`saveState`/`reset`). `WebGLRenderer` por defecto con `NoToneMapping` y salida sRGB: los grises se ven exactamente como se definen |
| **KaTeX** | 0.19.x | Fórmulas sin dependencias de red; `trust: false` por defecto; `errorColor` configurable (se fija en gris) |
| **lucide-react** | 1.49.x (ISC) | Un único conjunto de iconos de trazo coherente |
| `@fontsource-variable/inter`, `@fontsource/jetbrains-mono` | 5.3.x (OFL) | Fuentes empaquetadas localmente |
| **Vitest** | 5.0.x | Pruebas unitarias de `math/`, `numerics/`, `state/` y `export/` en Node |
| **@playwright/test** | **1.56.1** (fijada) | Coincide con el Chromium preinstalado (revisión 1194): las capturas de referencia se reproducen aquí. En local: `npx playwright install chromium` |
| `@axe-core/playwright` | 4.13.x | Auditoría automática de accesibilidad |
| ESLint 10 + `typescript-eslint` 8.71 + `eslint-plugin-react-hooks` 7.1 | — | Calidad y **fronteras entre capas** (`no-restricted-imports`) |
| Prettier 3 | — | Formato uniforme |

Sin dependencias de ejecución adicionales: el almacén de estado, el analizador, el
validador del JSON y el formato numérico son código propio y pequeño.

### 1.3 Alternativas descartadas

| Alternativa | Motivo del descarte |
| --- | --- |
| `expr-eval` | Sin publicaciones desde 2022 y con avisos de seguridad **sin corregir** en ≤ 2.0.2, uno crítico (GHSA-q9v2-7m5w-4693, ejecución de código) y dos altos (GHSA-8gw3-rxh4-v6jx, GHSA-jc85-fpwf-qm7x) |
| `mathjs` 15 | Mantenido y con derivación simbólica, pero ~9.4 MB desempaquetado; ámbito con evaluación por objetos (más lento en bucles de millones de evaluaciones); mensajes en inglés; lista blanca más difícil de cerrar. **Queda como plan B** si el analizador propio no supera V-MAT-02…09 (STATUS R-02) |
| Analizador propio (**elegido**, D-03) | Lista blanca exacta, sin superficie de ataque (no hay acceso a propiedades, cadenas ni asignación), compilación a cierres con argumentos posicionales (rápida), derivación simbólica, TeX y Unicode desde el mismo árbol, errores en español con posición. Coste: ~800 líneas con pruebas, mitigado por oráculos nativos y pruebas basadas en propiedades |
| react-three-fiber | Acopla la escena al reconciliador de React; la escena es imperativa (instancias, actualizaciones por fotograma) y se quiere probar y aislar sin React |
| `WebGPURenderer` | No disponible de forma uniforme en todos los navegadores objetivo; `Line2` tiene otra implementación para WebGPU. WebGL2 es universal |
| Plotly (conos, *streamtubes*) | ~3 MB, control limitado del estilo y las codificaciones monocromas |
| Etiquetas con `CSS2DRenderer` | No forman parte del lienzo WebGL y no saldrían en la exportación PNG; se usan *sprites* de texto |

### 1.4 Documentación oficial consultada

| Fuente (repositorio oficial) | Decisión que respalda |
| --- | --- |
| three.js r186: `src/objects/InstancedMesh.js` | `setMatrixAt`/`setColorAt` + `needsUpdate`; `raycast` devuelve `instanceId`; `computeBoundingSphere`; `dispose` |
| three.js r186: `examples/jsm/lines/LineMaterial.js`, `LineSegments2.js` | `linewidth` en píxeles CSS (`worldUnits: false`); `dashed`, `dashSize`, `gapSize`; **`resolution` debe actualizarse** (también al exportar); solo con `WebGLRenderer`; `computeLineDistances` para discontinuas |
| three.js r186: `src/renderers/WebGLRenderer.js` | `preserveDrawingBuffer = false` por defecto → la exportación dibuja y copia el lienzo en la misma tarea; `toneMapping = NoToneMapping`; `outputColorSpace = SRGBColorSpace` |
| three.js r186: `examples/jsm/controls/OrbitControls.js` | `saveState()`/`reset()` para restablecer la cámara; las flechas del teclado **desplazan** por defecto (`listenToKeyEvents`), así que el teclado se gestiona aparte |
| three.js r186: `examples/jsm/renderers/CSS2DRenderer.js` | Etiquetas en DOM: descartadas para la exportación |
| Vite (`docs/guide/features.md`, rama principal) | *Workers* con `new URL(..., import.meta.url)` y `type: 'module'`; transpilación sin comprobación de tipos; `isolatedModules: true` |
| KaTeX (`docs/options.md`) | `throwOnError`, `errorColor` (#cc0000 por defecto → se cambia), `trust` (false por defecto), `strict`, `maxExpand` |
| Playwright (`docs/src/test-snapshots-js.md`, `api/class-page.md`) | `toHaveScreenshot` con `threshold` y `maxDiffPixels`; las referencias dependen del sistema y del navegador; `emulateMedia({ reducedMotion })` y `forcedColors` |
| Registro npm | Versiones, `engines`, `peerDependencies`, licencias y avisos de seguridad (API *bulk advisories*) |

### 1.5 Capas y fronteras

```
            ┌────────────────────────── hilo principal ──────────────────────────┐
  usuario ─▶│ ui/ (React) ──acciones──▶ state/ (almacén del experimento)          │
            │    ▲                         │ suscripción                          │
            │    │ datos derivados         ▼                                      │
            │    └──────────────── app/orquestador ──▶ render/SceneController ──▶ WebGL2
            │                         │      ▲              (three.js, sin React)  │
            │        math/ compilado ◀┘      │ resultados (Float32Array transferibles)
            │  (inspector, partículas)       │                                    │
            └────────────────────────────────┼────────────────────────────────────┘
                                compute/client│ mensajes tipados, cancelación por generación
            ┌──────────────────── worker ─────▼──────────────────────────────────┐
            │ compute/worker ──▶ math/ (analizar, compilar, derivar)              │
            │                └─▶ numerics/ (malla, corte, RK4, semillas, parada)  │
            └─────────────────────────────────────────────────────────────────────┘
```

Reglas de importación (comprobadas por ESLint en `npm run lint`):

| Capa | Puede importar | No puede importar |
| --- | --- | --- |
| `math/` | `math/` | DOM, `three`, `react`, cualquier otra capa |
| `numerics/` | `math/`, `numerics/` | DOM, `three`, `react` |
| `state/` | `math/` (tipos), `numerics/format` | DOM (salvo `persist.ts`, que recibe un adaptador de almacenamiento), `three`, `react` |
| `geometria/` | `math/` (tipos), `numerics/`, `design/` (color y tokens) | DOM, `three`, `react`, `state/`, `compute/`, `render/`, `ui/` (D-29) |
| `compute/` | `math/`, `numerics/`, `geometria/`, `state/` (tipos) | `three`, `react`, `render/`, `ui/`, `app/` |
| `render/` | `three`, `math/` (tipos), `numerics/format`, `geometria/`, `design/tokens` | `react`, `state/store`, `ui/` |
| `export/` | `render/` (API pública), `state/`, `i18n/`, `numerics/format` | `react` |
| `ui/`, `app/` | Todo lo anterior | — |

Consecuencias: el núcleo matemático se prueba en Node sin navegador. La escena recibe datos
planos y es sustituible. El *worker* reutiliza exactamente el mismo código que las pruebas.

### 1.6 Flujo de datos y cálculo

| Cambio en el estado | Trabajo | Dónde | Política |
| --- | --- | --- | --- |
| Ecuaciones o parámetros | Compilar el campo | Hilo principal y *worker* | Inmediato, porque compilar cuesta menos de 1 ms |
| Ecuaciones, parámetros, dominio o N | Malla de flechas | *Worker* | Coalescido por fotograma durante el arrastre |
| Ídem + corte | Malla del corte y escalar | *Worker* | Ídem |
| Ídem + semillas | Líneas de corriente | *Worker* | Rebote de 120 ms; cancelable; progreso si dura > 300 ms |
| Cámara, capas visibles, leyenda | Solo dibujar | Hilo principal | Render bajo demanda |
| Animación activa | Partículas y rueda | Hilo principal | Bucle `requestAnimationFrame` solo mientras haya animación |

**Cancelación**: cada tipo de trabajo tiene un número de generación. Una petición nueva deja
obsoletas las anteriores del mismo tipo. El *worker* trocea los bucles largos en lotes de
≈ 8 ms y cede el turno para leer mensajes, y descarta los trabajos obsoletos. Los resultados
llegan como `Float32Array` transferibles, sin copia.

### 1.7 Estado

- `ExperimentState` (serializable): equivale al JSON v1 de SPEC §7.2 sin `formato` ni
  `version`. Es inmutable y cada acción devuelve un estado nuevo.
- `UiState` (no se guarda): secciones abiertas, ayuda, punto en *hover*, trabajos en curso,
  notificaciones, deshacer temporal.
- Derivados (memorizados): campo compilado, $F_{\text{ref}}$, resultados del *worker*.
- Almacén propio con `getState`/`setState`/`subscribe` (≈ 60 líneas), conectado a React con
  `useSyncExternalStore` y al orquestador con suscripción directa.

### 1.8 Estructura de archivos

```
campos-vectoriales/
├── README.md                      índice y arranque rápido
├── SPEC.md  DESIGN.md  PLAN.md  VALIDATION.md  STATUS.md
├── package.json  package-lock.json
├── index.html                     CSP, raíz, metadatos, color-scheme
├── vite.config.ts                 base './', workers ES, pruebas
├── playwright.config.ts           proyectos por tamaño de pantalla V1–V5
├── tsconfig.json  eslint.config.js  .prettierrc  .gitignore
├── scripts/
│   ├── capturas.ts                capturas C1–C12 × V1–V5
│   ├── auditar-paleta.ts          comprueba R = G = B en PNG
│   ├── contraste.ts               tabla de contrastes de los tokens
│   └── perf.ts                    escenas PERF-A/B y métricas
├── src/
│   ├── main.tsx
│   ├── app/                       App.tsx, orquestador.ts, atajos.ts
│   ├── design/                    tokens.ts (fuente única), base.css, fuentes.ts
│   ├── i18n/es.ts                 todos los textos de la interfaz
│   ├── math/                      ── PURO ──
│   │   ├── tipos.ts               Vec3, Dominio, semillas (vec3.ts se retiró en VAL-01: sin uso)
│   │   ├── expr/                  lexer, parser, ast, compile, diff, simplify, tex, unicode, errors
│   │   ├── field.ts               especificación → campo compilado (F, J, div, rot)
│   │   └── catalog/               6 campos: expresiones + oráculo nativo + ficha
│   ├── numerics/                  ── PURO ──
│   │   ├── grid.ts  finiteDiff.ts  streamlines.ts (RK4 en σ)  seeds.ts
│   │   ├── particles.ts (RK4 en t)  slice.ts  stats.ts  format.ts
│   ├── geometria/                 ── PURO ── flechas.ts: instancias de flechas (render/ y compute/)
│   ├── state/                     schema, store, actions, selectors, persist
│   ├── compute/                   protocol, client, worker, trabajos, peticiones, huella
│   ├── render/
│   │   ├── SceneController.ts  camera.ts  palette.ts  picking.ts
│   │   ├── layers/                axes, box, arrows, streamlines, particles,
│   │   │                          slice, scalarOverlay, curlGlyphs, selection, markers
│   │   └── text/spriteText.ts
│   ├── ui/
│   │   ├── controls/              Button, IconButton, ExpressionField, NumberField, Slider,
│   │   │                          Switch, Segmented, Listbox, Disclosure, Tooltip, Alert, Toast
│   │   ├── topbar/  panel/  scene/  help/
│   │   └── gallery/               página ?muestras con todos los estados de los controles
│   └── export/                    png.ts, json.ts, download.ts
├── tests/
│   ├── e2e/                       flujos funcionales (Playwright)
│   ├── visual/                    capturas de referencia
│   └── fixtures/                  configuraciones JSON válidas e inválidas
└── evidencia/                     resultados de verificación por tarea (VALIDATION §9)
```

Las pruebas unitarias van junto a su módulo (`*.test.ts`).

---

## 2. Ejecución local y conexión

```bash
cd campos-vectoriales
npm ci                             # requiere conexión (registro npm), una sola vez
npm run dev                        # http://localhost:5173
npm test                           # pruebas unitarias (Vitest)
npx playwright install chromium    # una vez, ~150 MB, para las pruebas de navegador
npm run test:e2e                   # pruebas funcionales y de accesibilidad
npm run capturas                   # capturas de revisión visual → evidencia/
npm run check                      # lint + tipos + unitarias (antes de cada commit)
npm run build                      # → dist/campos-vectoriales.html (archivo único)
```

- **Requisitos**: Node ≥ 22.12 (lo exige Vitest 5) y npm ≥ 10. Navegador con WebGL2.
- **Conexión**: solo para instalar dependencias y el navegador de pruebas. En ejecución,
  **ninguna** (fuentes empaquetadas, sin CDN ni telemetría).
- **Entrega**: `npm run build` produce `dist/campos-vectoriales.html`, un **único archivo**
  con el código, los estilos, las fuentes (`woff2` en base64) y el *worker* (como `Blob`)
  incrustados, y una CSP con huella SHA-256. Se abre con doble clic (`file://`), sin
  servidor ni red. La copia publicada en el repositorio está en `entrega/`.
- **En este entorno en la nube**: Playwright usa el Chromium preinstalado en
  `/opt/pw-browsers` (no se descarga).

---

## 3. Flujos de uso

Cada flujo indica pasos, estados intermedios y teclado.

**F1 · Elegir un campo**
1. En «Ejemplos», clic o Intro sobre una tarjeta (las flechas ←→↑↓ se mueven por la
   rejilla; patrón *radiogroup*).
2. Se cargan expresiones, parámetros, semillas recomendadas y el nombre. La cámara **no**
   cambia, para poder comparar.
3. Si había ediciones sin exportar: notificación «Se ha sustituido tu campo · Deshacer» (8 s).
4. Estados: calculando (líneas) → listo.

**F2 · Editar ecuaciones**
1. Foco en P, Q o R. Se escribe; la vista previa se actualiza al instante.
2. Mientras se escribe, «incompleta» es informativo. Tras 800 ms sin teclear o al salir del
   campo, se convierte en error si sigue sin cerrarse.
3. Con las tres válidas, se aplican 300 ms después de la última tecla. La tarjeta de
   ejemplo pasa a «modificado» y el nombre a «Personalizado (desde Helicoidal)».
4. Con alguna inválida: se mantiene el último campo válido y aparece el aviso de escena;
   Esc devuelve el campo a su último valor válido.
5. Identificador desconocido: el botón del mensaje añade el parámetro (F3).

**F3 · Modificar parámetros**
1. Deslizador (arrastre o ←→, RePág/AvPág ×10) o número (↑↓, Mayús ×10, Intro aplica).
2. Las flechas y el corte se actualizan en vivo; las líneas, 120 ms después de soltar.
3. Menú ⋯: rango y paso, «Restablecer valor», «Eliminar» (solo si no se usa).

**F4 · Cambiar dominio y densidad**
1. «Dominio y muestreo»: límites (enlazados como cubo por defecto), N y nodos/centros.
2. Validación en línea (mín < máx; lados entre 0.1 y 1000). Un valor inválido no se aplica.
3. Al cambiar el dominio, la cámara **se reencuadra** (con transición, salvo movimiento
   reducido) y el corte se recoloca dentro.

**F5 · Activar capas**
1. Interruptores (F, L, P como atajos) y «Glifos: F · rot F» (G).
2. La leyenda añade o quita entradas en el acto.

**F6 · Explorar cortes**
1. Interruptor de «Corte» (C) → aparece el plano XY en $z=0$ o en el centro de Ω.
2. Plano (segmentado), posición (deslizador con el rango de Ω), «Flechas: todas · solo
   corte», «Vector: completo · tangencial», «Escalar: ninguno · |F| · div F · rot F·n · F·n».
3. Al elegir «tangencial», nota fija: «Las curvas de este campo plano no son líneas de
   corriente 3D salvo que F·n = 0».

**F7 · Inspeccionar un punto**
1. Clic sobre una flecha (selecciona su nodo) o sobre el plano de corte (punto exacto del
   plano); o botón «Inspeccionar…» / tecla I para escribir coordenadas.
2. Aparece el inspector con la flecha exacta, el aro, la cruz y la rueda de paletas.
3. Con la escena enfocada: Alt+flechas mueve P en x/y y Alt+RePág/AvPág en z, en pasos de Δ.
4. Los valores se actualizan en vivo con los parámetros. «Copiar valores» copia texto
   tabulado. Esc o × cierra el inspector.
5. Si P está fuera de $D$: «F no está definido en P» y sin flecha.

**F8 · Restablecer**
- Menú «Restablecer»: cámara (R), parámetros, experimento (todo a los valores del ejemplo
  base). Sin diálogo de confirmación: notificación con «Deshacer» durante 8 s (Ctrl+Z).

**F9 · Exportar y recuperar**
- «Exportar ▾ → Imagen PNG…»: diálogo con contenido y tamaño, vista previa y botón primario
  «Exportar». Progreso si tarda > 300 ms.
- «Exportar ▾ → Configuración (.json)»: descarga directa y notificación de éxito con el
  nombre del archivo.
- «Abrir» (o arrastrar un `.json` a la ventana): validación. Si es válida, se aplica y se
  ofrece «Deshacer»; si no, se muestra un diálogo con la lista de errores y el estado actual
  no cambia.
- Al arrancar con autoguardado: notificación «Se ha recuperado tu último experimento ·
  Empezar de cero».

**F10 · Consultar la ayuda**
- «Ayuda» (o ?) abre el cajón en «Conceptos». Los «?» contextuales abren el apartado
  correspondiente (p. ej. «Divergencia»). Esc lo cierra y el foco vuelve al origen.

### 3.1 Teclado

| Contexto | Tecla | Acción |
| --- | --- | --- |
| Global (fuera de campos de texto) | `?` · `F1` | Ayuda |
| | `Espacio` | Pausar / reanudar la animación |
| | `R` | Encuadrar y restablecer la cámara |
| | `1` `2` `3` `4` | Vistas XY · XZ · YZ · isométrica |
| | `5` | Perspectiva / ortográfica |
| | `F` `L` `P` `C` `G` | Flechas · líneas · partículas · corte · glifos F/rot F |
| | `I` | Inspeccionar punto por coordenadas |
| | `Esc` | Cierra lo último abierto (menú → diálogo → cajón → inspector) |
| | `Ctrl+Z` | Deshacer el último restablecimiento o importación (mientras dure la notificación) |
| Escena enfocada | `←` `→` `↑` `↓` | Orbitar 5° |
| | `Mayús` + flechas | Desplazar |
| | `+` · `−` | Acercar · alejar |
| | `Intro` | Seleccionar el nodo más cercano al centro de la vista |
| | `Alt` + flechas · `Alt` + `RePág`/`AvPág` | Mover P por x/y · por z |

- Primer elemento enfocable: enlace oculto «Saltar a la escena».
- Orden del tabulador: barra superior → panel → escena → inspector → leyenda → barra de la
  escena.
- La escena es un elemento enfocable con `role="application"`,
  `aria-roledescription="escena 3D"` y `aria-describedby` hacia un resumen vivo.
- Los atajos de una letra no se activan dentro de campos de texto y pueden desactivarse en
  Avanzado (WCAG 2.1.4).

---

## 4. Hitos

```
H0 Fundaciones ─┬─▶ H1 Primera entrega ───────────────────────────┐
                │                                                 ▼
                └─▶ H2 Lenguaje ─▶ H3 Numérico y cómputo ─▶ H4 Edición y controles
                                                                  │
          H9 Validación ◀─ H8 Transversal ◀─ H7 Exportación ◀─ H6 Inspección ◀─ H5 Capas científicas
```

| Hito | Resultado observable | Tareas |
| --- | --- | --- |
| **H0** Fundaciones | Proyecto vacío que compila, arnés de pruebas y capturas, tokens visuales | FND-01, FND-02, VIS-01 |
| **H1** Primera entrega | **Un campo predefinido en una escena 3D real**, con la estructura visual básica (barra, panel con ejemplos, leyenda) y revisión de capturas | MAT-01, NUM-01, REN-01, REN-02, VIS-03, UI-01, VIS-04, REV-01 |
| **H2** Lenguaje | Expresiones analizadas, compiladas, derivadas y tipografiadas; catálogo contrastado | MAT-02 … MAT-05 |
| **H3** Numérico y cómputo | Diferencias finitas, RK4, semillas, partículas, cortes; *worker* con cancelación | NUM-02 … NUM-06, CMP-01, CMP-02 |
| **H4** Edición y controles | Editor de ecuaciones, parámetros, dominio, restablecer, mensajes | VIS-02, UI-07, UI-02 … UI-05, REV-02 |
| **H5** Capas científicas | Líneas, magnitud, cortes, mapa escalar, rotacional, partículas, leyenda completa | REN-03 … REN-08, UI-08, VIS-05, REV-03 |
| **H6** Inspección | Selección, inspector, coherencia comprobada | INS-01 … INS-03 |
| **H7** Exportación | JSON, autoguardado, PNG | EXP-01 … EXP-03 |
| **H8** Transversal | Teclado, accesibilidad, ayuda, adaptación a pantallas | A11Y-01, A11Y-02, UI-06, VIS-06 |
| **H9** Validación y entrega | Baterías completas, rendimiento medido, revisión visual final, HTML autocontenido, documentación | VAL-01 … VAL-03, REV-04, ENT-01, DOC-01 |

H2 puede avanzar en paralelo a H1, porque solo depende de FND-01.

**Criterio de cierre de un hito**: todas sus tareas en «Completada y verificada», con la
evidencia enlazada en STATUS.md y `npm run check` en verde.

---

## 5. Checklist de tareas

Estados permitidos: **Pendiente** · **Completada y verificada**. Una tarea en curso o
bloqueada sigue en «Pendiente» y lleva una nota (`En curso:` / `Bloqueada:` + motivo y
fecha). **Que el código exista no completa una tarea**: hace falta cumplir el criterio de
aceptación con la evidencia indicada.

### 5.1 Resumen

| ID | Tarea | Hito | Depende de | Estado |
| --- | --- | --- | --- | --- |
| PLN-01 | Especificación y plan | — | — | Completada y verificada |
| FND-01 | Andamiaje del subproyecto | H0 | PLN-01 | Completada y verificada |
| FND-02 | Arnés de pruebas, capturas y auditorías | H0 | FND-01 | Completada y verificada |
| VIS-01 | Sistema visual: tokens y estilos base | H0 | FND-01 | Completada y verificada |
| MAT-01 | Vec3 y catálogo nativo (oráculos) | H1 | FND-01 | Completada y verificada |
| NUM-01 | Malla de muestreo y escala de referencia | H1 | MAT-01 | Completada y verificada |
| REN-01 | Escena base | H1 | VIS-01 | Completada y verificada |
| REN-02 | Capa de flechas | H1 | REN-01, NUM-01 | Completada y verificada |
| VIS-03 | Composición: regiones de la pantalla | H1 | VIS-01 | Completada y verificada |
| UI-01 | Selección de campo predefinido | H1 | VIS-03, MAT-01, REN-02 | Completada y verificada |
| VIS-04 | Leyenda inicial | H1 | REN-02, VIS-03 | Completada y verificada |
| REV-01 | Revisión de capturas de la primera entrega | H1 | FND-02, UI-01, VIS-04 | Completada y verificada |
| MAT-02 | Analizador léxico y sintáctico | H2 | FND-01 | Completada y verificada |
| MAT-03 | Compilador y evaluación | H2 | MAT-02 | Completada y verificada |
| MAT-04 | Derivación simbólica, TeX y Unicode | H2 | MAT-03 | Completada y verificada |
| MAT-05 | Catálogo como expresiones + contraste con oráculos | H2 | MAT-01, MAT-04 | Completada y verificada |
| NUM-02 | Diferencias finitas | H3 | MAT-03 | Completada y verificada |
| NUM-03 | Líneas de corriente: RK4 en σ y parada | H3 | NUM-01, MAT-03 | Completada y verificada |
| NUM-04 | Semillas | H3 | NUM-03 | Completada y verificada |
| NUM-05 | Integrador de partículas | H3 | MAT-03 | Completada y verificada |
| NUM-06 | Muestreo en el corte | H3 | NUM-01, NUM-02 | Completada y verificada |
| CMP-01 | *Worker* y protocolo | H3 | MAT-05, NUM-01 | Completada y verificada |
| CMP-02 | Orquestación, cancelación y presupuestos | H3 | CMP-01, NUM-03, NUM-06 | Completada y verificada |
| VIS-02 | Biblioteca de controles y galería de estados | H4 | VIS-01 | Completada y verificada |
| UI-07 | Sistema de mensajes y estados de pantalla | H4 | VIS-02 | Completada y verificada |
| UI-02 | Editor de ecuaciones | H4 | MAT-04, VIS-02, UI-07, CMP-02 | Completada y verificada |
| UI-03 | Parámetros | H4 | UI-02 | Completada y verificada |
| UI-04 | Dominio y muestreo | H4 | VIS-02, CMP-02 | Completada y verificada |
| UI-05 | Restablecer y deshacer | H4 | UI-03, UI-04 | Completada y verificada |
| REV-02 | Revisión de capturas de controles y estados | H4 | UI-02 … UI-05 | Completada y verificada |
| REN-03 | Capa de líneas de corriente | H5 | NUM-04, CMP-02, REN-01 | Completada y verificada |
| REN-04 | Modos de magnitud y escala | H5 | REN-02 | Completada y verificada |
| REN-05 | Cortes | H5 | REN-02, NUM-06 | Completada y verificada |
| REN-06 | Mapa escalar del corte | H5 | REN-05 | Completada y verificada |
| REN-07 | Glifos de rotacional y rueda de paletas | H5 | REN-02, NUM-02 | Completada y verificada |
| REN-08 | Partículas y control de animación | H5 | NUM-05, REN-01 | Completada y verificada |
| UI-08 | Secciones de líneas, corte y derivadas | H5 | REN-03, REN-05, REN-06, MAT-04 | Completada y verificada |
| VIS-05 | Legibilidad científica: leyenda completa y auditoría de codificación | H5 | REN-03 … REN-08, VIS-04 | Completada y verificada |
| REV-03 | Revisión de capturas de la escena | H5 | VIS-05 | Completada y verificada |
| INS-01 | Selección de puntos | H6 | REN-02, REN-05 | Completada y verificada |
| INS-02 | Tarjeta del inspector | H6 | INS-01, NUM-02, MAT-04 | Completada y verificada |
| INS-03 | Coherencia entre ecuaciones, geometría, leyenda e inspector | H6 | INS-02, VIS-05 | Completada y verificada |
| EXP-01 | Configuración JSON v1 | H7 | UI-05 | Completada y verificada |
| EXP-02 | Autoguardado y recuperación | H7 | EXP-01 | Completada y verificada |
| EXP-03 | Exportación PNG compuesta | H7 | VIS-05 | Completada y verificada |
| A11Y-01 | Teclado, foco y atajos | H8 | INS-01, UI-08 | Completada y verificada |
| A11Y-02 | ARIA, lector de pantalla y movimiento reducido | H8 | REN-08, A11Y-01 | Parcial: falta V-A11Y-04 (sesión con lector del usuario, Q-04) |
| UI-06 | Cajón de ayuda y ayuda contextual | H8 | VIS-02, MAT-04 | Completada y verificada |
| VIS-06 | Adaptación a pantallas | H8 | INS-02, UI-08 | Completada y verificada |
| VAL-01 | Batería matemática y numérica completa | H9 | MAT-05, NUM-02 … NUM-06 | Completada y verificada |
| VAL-02 | Batería funcional de extremo a extremo | H9 | H4 … H8 | Parcial: falta la prueba de humo manual en Firefox y Safari (Q-05) |
| VAL-03 | Medición de rendimiento | H9 | CMP-02, H5 | Parcial: medida en C0; falta la medición en R1 (Q-06) |
| REV-04 | Revisión visual final | H9 | VIS-06, A11Y-02, EXP-03 | Completada y verificada |
| ENT-01 | HTML autocontenido final | H9 | VAL-02, REV-04 | Completada y verificada |
| DOC-01 | Documentación final | H9 | VAL-01 … REV-04 | Pendiente |

### 5.2 Detalle de las tareas

Formato: **Objetivo** · **Dependencias** · **Componentes** · **Procedimiento** ·
**Aceptación** (observable) · **Verificación** · **Evidencia** (en `evidencia/<ID>/`).

#### PLN-01 · Especificación y plan — Completada y verificada
- *Nota (2026-10-02)*: aprobado por el usuario («Con esto definido, comienza a trabajar en el proyecto»).
- **Objetivo**: SPEC, DESIGN, PLAN, VALIDATION y STATUS coherentes entre sí.
- **Dependencias**: —
- **Componentes**: `*.md`, `evidencia/PLN-01/`.
- **Procedimiento**: inspeccionar el entorno, consultar documentación oficial, calibrar
  tolerancias, redactar y hacer una revisión cruzada de identificadores.
- **Aceptación**: el usuario aprueba el plan o pide cambios concretos.
- **Verificación**: respuesta del usuario.
- **Evidencia**: `contraste.py`, `calibrar.py` y sus salidas; referencia del commit.

#### FND-01 · Andamiaje del subproyecto — Completada y verificada
- **Objetivo**: proyecto Vite + React + TS en `campos-vectoriales/`, aislado del resto.
- **Dependencias**: PLN-01.
- **Componentes**: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` (CSP),
  `eslint.config.js`, `.prettierrc`, `.gitignore`, `README.md`.
- **Procedimiento**: instalar las versiones de §1.2; definir los *scripts* de §2;
  configurar ESLint con las fronteras de §1.5; `strict` y `noUncheckedIndexedAccess` en TS.
- **Aceptación**: (1) `npm ci && npm run check` sin errores; (2) `npm run dev` muestra una
  página `#101010` sin errores de consola; (3) el *build* de la raíz del repositorio sigue
  funcionando; (4) un `import 'three'` en `math/` hace fallar `npm run lint`.
- **Verificación**: ejecutar los comandos; prueba negativa con un archivo temporal.
- **Evidencia**: `registro.txt` con las salidas; resultado de la prueba negativa.

#### FND-02 · Arnés de pruebas, capturas y auditorías — Completada y verificada
- **Objetivo**: poder demostrar los criterios funcionales y visuales desde el primer hito.
- **Dependencias**: FND-01.
- **Componentes**: `playwright.config.ts`, `scripts/capturas.ts`,
  `scripts/auditar-paleta.ts`, `tests/e2e/humo.spec.ts`, utilidades de geometría DOM y
  axe-core.
- **Procedimiento**: proyectos por tamaño V1–V5 (VALIDATION §7.1); modo `?captura=1`
  (animaciones congeladas, semillas fijas, reloj determinista); auditoría de paleta
  (píxeles con max(|R−G|, |G−B|, |R−B|) > 3); detector de solapamientos y desbordamientos;
  registro de peticiones de red externas.
- **Aceptación**: (1) la prueba de humo pasa; (2) `npm run capturas` genera PNG para V1–V5;
  (3) la auditoría **rechaza** una página con un píxel `#FF0000` inyectado y **acepta** la
  página gris; (4) el detector señala dos cajas solapadas de prueba.
- **Verificación**: ejecución y pruebas negativas.
- **Evidencia**: PNG, informes JSON de auditoría y salidas de las pruebas negativas.

#### VIS-01 · Sistema visual: tokens y estilos base — Completada y verificada
- **Objetivo**: una única fuente de tokens (color, tipografía, espacio, radios, sombras,
  movimiento) para el CSS y la escena.
- **Dependencias**: FND-01.
- **Componentes**: `src/design/tokens.ts`, `base.css`, `fuentes.ts`, `scripts/contraste.ts`.
- **Procedimiento**: codificar DESIGN §2–4 y §8.2; inyectar variables CSS; aplicar las
  contramedidas de fugas de color (DESIGN §2.4); empaquetar las fuentes; el *script* de
  contraste calcula todos los pares texto/superficie y control/superficie y falla por debajo
  del umbral.
- **Aceptación**: (1) la tabla generada coincide con DESIGN §2.1 (±0.01); (2) todo texto ≥
  4.5:1 y todo control ≥ 3:1; (3) 0 peticiones a dominios externos al cargar; (4) todos los
  colores de los tokens cumplen R = G = B.
- **Verificación**: `npm run lint` incluye el *script* de contraste; Playwright cuenta las
  peticiones.
- **Evidencia**: tabla de contraste generada; registro de red.

#### MAT-01 · Vec3 y catálogo nativo (oráculos) — Completada y verificada
- **Objetivo**: los seis campos como funciones nativas con J, div y rot analíticos, más sus
  metadatos (parámetros, semillas, ficha, equilibrios).
- **Dependencias**: FND-01.
- **Componentes**: `src/math/catalog/` (`src/math/vec3.ts` se retiró en VAL-01: nadie lo usaba).
- **Procedimiento**: implementar SPEC §4.1–4.6 y los campos auxiliares T1–T6 (§4.7).
- **Aceptación**: V-MAT-01 pasa.
- **Verificación**: `npm test`.
- **Evidencia**: salida de Vitest.

#### NUM-01 · Malla de muestreo y escala de referencia — Completada y verificada
- **Objetivo**: muestrear F en Ω, clasificar nodos (válido, ≈ 0, no definido, singular) y
  calcular $F_{\text{ref}}$.
- **Dependencias**: MAT-01.
- **Componentes**: `numerics/grid.ts`, `stats.ts`, `format.ts`.
- **Procedimiento**: SPEC §5.1 y §3.8; formato numérico de DESIGN §3.3.
- **Aceptación**: V-NUM-10, V-NUM-11, V-NUM-15 (clasificación) y V-MAT-10 pasan.
- **Verificación**: `npm test`.
- **Evidencia**: salida de Vitest.

#### REN-01 · Escena base — Completada y verificada
- **Objetivo**: lienzo WebGL2 con cámara $z$ arriba, órbita, ejes etiquetados dentro del
  lienzo, caja del dominio, redimensionado, render bajo demanda y detección de WebGL2.
- **Dependencias**: VIS-01.
- **Componentes**: `render/SceneController.ts`, `camera.ts`, `palette.ts`,
  `layers/axes.ts`, `layers/box.ts`, `text/spriteText.ts`.
- **Procedimiento**: `WebGLRenderer` (antialias, `devicePixelRatio` ≤ 2, `NoToneMapping`,
  sRGB); materiales sin iluminación; contador de fotogramas expuesto en modo prueba.
- **Aceptación**: (1) ejes x/y/z con letras y marcas visibles; (2) se orbita con el ratón;
  (3) 0 fotogramas dibujados en 2 s de reposo; (4) sin WebGL2 → estado vacío explicativo.
- **Verificación**: e2e (contador, captura); ejecución con WebGL desactivado.
- **Evidencia**: capturas y registro de la prueba.

#### REN-02 · Capa de flechas — Completada y verificada
- **Objetivo**: flechas instanciadas con dirección, longitud y luminancia según DESIGN
  §9.2–9.3, halo, doble punta, rombos y aspas.
- **Dependencias**: REN-01, NUM-01.
- **Componentes**: `render/layers/arrows.ts`, `markers.ts`; función pura
  `arrowInstances(grid, escala) → {matrices, colores, marcas}`.
- **Procedimiento**: calcular las instancias en una función pura (probable sin GPU) y
  volcarlas al `InstancedMesh`; dibujar el halo con un casco invertido que comparte las
  matrices.
- **Aceptación**: (1) en 5 nodos de prueba, dirección (error < 10⁻⁶ rad), longitud (< 10⁻⁶
  relativo) y color (±1/255) coinciden con F y la rampa; (2) 21³ flechas sin errores; (3)
  nodos ≈ 0 y no definidos con su marca.
- **Verificación**: Vitest sobre la función pura; e2e leyendo los atributos de instancia.
- **Evidencia**: salidas de las pruebas; captura del radial con el origen marcado.

#### VIS-03 · Composición: regiones de la pantalla — Completada y verificada
- **Objetivo**: barra superior, panel lateral, escena y zonas de inspector, leyenda, barra
  de la escena y triedro, con las medidas de DESIGN §5.
- **Dependencias**: VIS-01.
- **Componentes**: `app/App.tsx`, `ui/topbar/`, `ui/panel/` (estructura), `ui/scene/` (marco).
- **Procedimiento**: CSS Grid; regiones flotantes posicionadas dentro de la escena.
- **Aceptación**: a 1440×900 y 1920×1080: barra de 48 px, panel de 320 px (±1); escena ≥ 73 %
  y ≥ 79 % del área respectivamente; sin desplazamiento horizontal; regiones sin solapamiento.
- **Verificación**: e2e de geometría DOM.
- **Evidencia**: capturas y JSON de medidas.

#### UI-01 · Selección de campo predefinido — Completada y verificada
- **Objetivo**: rejilla de ejemplos conectada al almacén y a la escena; fórmula en KaTeX.
- **Dependencias**: VIS-03, MAT-01, REN-02.
- **Componentes**: `ui/panel/Examples.tsx`, `FieldSection.tsx`, `state/store.ts` (mínimo).
- **Procedimiento**: patrón *radiogroup*; en H1 la fórmula TeX procede del catálogo; desde
  MAT-04, del árbol.
- **Aceptación**: clic o Intro en cada tarjeta cambia flechas, fórmula y leyenda; la activa
  muestra borde de 2 px + ✓ y `aria-checked="true"`.
- **Verificación**: e2e V-FUN-01 (parcial, sin ecuaciones editables).
- **Evidencia**: capturas de los 6 campos.

#### VIS-04 · Leyenda inicial — Completada y verificada
- **Objetivo**: barra de magnitud con marcas numéricas, $F_{\text{ref}}$ y entradas de
  flecha, ≈ 0 y no definido.
- **Dependencias**: REN-02, VIS-03.
- **Componentes**: `ui/scene/Legend.tsx`.
- **Procedimiento**: DESIGN §9.3 y §9.12.
- **Aceptación**: (1) las marcas coinciden con la $F_{\text{ref}}$ calculada; (2) el píxel
  central de la barra tiene L\* = 70.85 ± 1; (3) solo aparecen entradas de capas visibles.
- **Verificación**: e2e + muestreo de píxeles.
- **Evidencia**: captura y valores medidos.

#### REV-01 · Revisión de capturas de la primera entrega — Completada y verificada
- **Objetivo**: validar pronto la paleta, la jerarquía y la composición.
- **Dependencias**: FND-02, UI-01, VIS-04.
- **Componentes**: `evidencia/REV-01/`.
- **Procedimiento**: capturas C1 y C2 en V1–V3; auditoría de paleta; checklist VV-01…VV-08
  en lo aplicable; registrar incidencias y corregirlas.
- **Aceptación**: auditoría con 0 píxeles fuera de tolerancia; checklist superada o con
  todas sus incidencias resueltas y recapturadas.
- **Verificación**: automática + revisión manual con la plantilla de VALIDATION §7.4.
- **Evidencia**: PNG + `informe.md`.

#### MAT-02 · Analizador léxico y sintáctico — Completada y verificada
- **Objetivo**: gramática de SPEC §5.2 con errores en español y posición.
- **Dependencias**: FND-01.
- **Componentes**: `math/expr/lexer.ts`, `parser.ts`, `ast.ts`, `errors.ts`.
- **Procedimiento**: descenso recursivo; límites de longitud, nodos y profundidad;
  distinguir «incompleta» (fin de entrada) del resto de errores.
- **Aceptación**: V-MAT-02, V-MAT-03 y V-MAT-04 pasan.
- **Verificación**: `npm test`.
- **Evidencia**: salida de Vitest con el recuento de casos.

#### MAT-03 · Compilador y evaluación — Completada y verificada
- **Objetivo**: árbol → cierres `(x, y, z, p) => número`, sin `eval`.
- **Dependencias**: MAT-02.
- **Componentes**: `math/expr/compile.ts`, `math/field.ts`.
- **Procedimiento**: plegado de constantes; parámetros por índice en un `Float64Array`;
  expansión de `r` y `rho`.
- **Aceptación**: V-MAT-05 pasa; V-PERF-05 informa del rendimiento frente al nativo.
- **Verificación**: `npm test`; *benchmark*.
- **Evidencia**: salidas de las pruebas y del *benchmark*.

#### MAT-04 · Derivación simbólica, TeX y Unicode — Completada y verificada
- **Objetivo**: J, div y rot simbólicos; simplificación mínima; TeX y texto Unicode lineal.
- **Dependencias**: MAT-03.
- **Componentes**: `math/expr/diff.ts`, `simplify.ts`, `tex.ts`, `unicode.ts`.
- **Procedimiento**: reglas de la tabla de SPEC §5.2; detección de puntos no diferenciables;
  límite de 5000 nodos con respaldo numérico.
- **Aceptación**: V-MAT-06, V-MAT-07, V-MAT-08 y V-MAT-09 pasan.
- **Verificación**: `npm test`.
- **Evidencia**: salida de Vitest.

#### MAT-05 · Catálogo como expresiones + contraste con oráculos — Completada y verificada
- **Objetivo**: cada campo del catálogo se define por expresiones y se contrasta con su
  oráculo nativo.
- **Dependencias**: MAT-01, MAT-04.
- **Componentes**: `math/catalog/`.
- **Procedimiento**: sustituir la entrada TeX fija de H1 por la generada desde el árbol.
- **Aceptación**: V-MAT-05 y V-MAT-07 pasan para los 6 campos y T1–T6.
- **Verificación**: `npm test`; e2e de UI-01 sin cambios visibles.
- **Evidencia**: salidas.

#### NUM-02 · Diferencias finitas — Completada y verificada
- **Objetivo**: J por diferencias centradas con paso de SPEC §5.4 y respaldo unilateral.
- **Dependencias**: MAT-03.
- **Componentes**: `numerics/finiteDiff.ts`.
- **Procedimiento**: paso redondeado a potencia de 2; 3 puntos unilaterales; «no definida».
- **Aceptación**: V-NUM-01, V-NUM-02 y V-NUM-16 pasan.
- **Verificación**: `npm test`.
- **Evidencia**: salida con errores máximos medidos.

#### NUM-03 · Líneas de corriente: RK4 en σ y parada — Completada y verificada
- **Objetivo**: integración normalizada en ambos sentidos con todos los motivos de parada.
- **Dependencias**: NUM-01, MAT-03.
- **Componentes**: `numerics/streamlines.ts` (el paso RK4 en σ es la clase `PasoRK4`; las
  partículas tienen el suyo en $t$ en `particles.ts`, así que no hace falta un `rk4.ts` aparte).
- **Procedimiento**: SPEC §5.5 y §5.7; recorte por bisección; cierre de órbitas; reducción
  del paso.
- **Aceptación**: V-NUM-03 … V-NUM-09 pasan.
- **Verificación**: `npm test`.
- **Evidencia**: salida con errores medidos frente a la calibración (VALIDATION §2).

#### NUM-04 · Semillas — Completada y verificada
- **Objetivo**: tres estrategias reproducibles con descarte y límites.
- **Dependencias**: NUM-03.
- **Componentes**: `numerics/seeds.ts`.
- **Procedimiento**: *mulberry32*; rejilla en un rectángulo del plano; anillo alrededor de P.
- **Aceptación**: V-NUM-12 pasa.
- **Verificación**: `npm test`.
- **Evidencia**: salida.

#### NUM-05 · Integrador de partículas — Completada y verificada
- **Objetivo**: RK4 en $t$ con subpasos, ciclo de vida y estela.
- **Dependencias**: MAT-03.
- **Componentes**: `numerics/particles.ts`.
- **Procedimiento**: SPEC §3.6 y §5.8.
- **Aceptación**: V-NUM-13 pasa.
- **Verificación**: `npm test`.
- **Evidencia**: salida.

#### NUM-06 · Muestreo en el corte — Completada y verificada
- **Objetivo**: malla del plano, proyección tangencial, $F_n$, div, rot·n y |F|, y $V_{\text{ref}}$.
- **Dependencias**: NUM-01, NUM-02.
- **Componentes**: `numerics/slice.ts`.
- **Procedimiento**: SPEC §3.7.
- **Aceptación**: V-NUM-14 pasa.
- **Verificación**: `npm test`.
- **Evidencia**: salida.

#### CMP-01 · *Worker* y protocolo — Completada y verificada
- **Objetivo**: cálculo pesado fuera del hilo principal con mensajes tipados.
- **Dependencias**: MAT-05, NUM-01.
- **Componentes**: `compute/protocol.ts`, `client.ts`, `worker.ts`, `trabajos.ts` (mismo código
  en el worker y en el hilo principal), `peticiones.ts`, `huella.ts`.
- **Procedimiento**: compilar el campo en el *worker*; malla con resultados transferibles;
  errores del *worker* convertidos en mensajes de interfaz.
- **Aceptación**: (1) la malla del *worker* coincide bit a bit con la calculada en Node para
  el mismo campo; (2) un error dentro del *worker* no rompe la interfaz y se muestra.
- **Verificación**: e2e que compara sumas de control; inyección de fallo.
- **Evidencia**: registro de la prueba.

#### CMP-02 · Orquestación, cancelación y presupuestos — Completada y verificada
- **Objetivo**: decidir qué recalcular, coalescer, cancelar trabajos obsoletos e informar
  del progreso.
- **Dependencias**: CMP-01, NUM-03, NUM-06.
- **Componentes**: `app/orquestador.ts`, `compute/client.ts`.
- **Procedimiento**: tabla de §1.6; lotes de ≈ 8 ms; generación por tipo; límites de SPEC
  §5.9 con aviso.
- **Aceptación**: (1) 60 cambios de parámetro en 3 s → solo se pinta el último resultado de
  líneas; (2) V-PERF-04 (0 tareas largas > 50 ms en el hilo principal) en el entorno de
  integración; (3) «Cancelar» detiene el trabajo en < 100 ms.
- **Verificación**: e2e con `PerformanceObserver('longtask')`.
- **Evidencia**: informe de tareas largas y de tiempos.

#### VIS-02 · Biblioteca de controles y galería de estados — Completada y verificada
- *Nota (H4)*: componentes en `ui/controls/` con nombres en español (`Boton`, `Descripcion`,
  `Interruptor`, `Segmentado`, `Deslizador`, `CampoNumerico`, `CampoExpresion`,
  `ListaDesplegable`, `Menu`, `Seccion`, `Aviso`, `Notificaciones`) y `controles.css`; galería en
  `ui/gallery/Galeria.tsx`.
- **Objetivo**: los controles de DESIGN §6 con todos sus estados (§7), en una galería
  capturable.
- **Dependencias**: VIS-01.
- **Componentes**: `ui/controls/*`, `ui/gallery/` (`?muestras`).
- **Procedimiento**: patrones ARIA (*switch*, *radiogroup*, *listbox*, *disclosure*,
  *slider*); forzar estados en la galería (*hover*, foco, pulsado, deshabilitado, error).
- **Aceptación**: (1) cada estado se distingue por una señal no tonal (DESIGN §7), comprobado
  en la captura C8; (2) axe-core sin violaciones en la galería; (3) todos los controles son
  operables solo con el teclado.
- **Verificación**: e2e + revisión manual de C8.
- **Evidencia**: captura C8 y salida de axe.

#### UI-07 · Sistema de mensajes y estados de pantalla — Completada y verificada
- *Nota (H4)*: `Alert` → `ui/controls/Aviso.tsx`; `Toast` → `ui/controls/Notificaciones.tsx`;
  `SceneBanner` y `EmptyState` → `ui/scene/Mensajes.tsx` (`AvisoEscena`, `EstadoVacio`, `Carga`).
- **Objetivo**: avisos en línea, avisos de escena, notificaciones, estados vacíos, carga y
  cálculo (DESIGN §2.3 y §6.2).
- **Dependencias**: VIS-02.
- **Componentes**: `ui/controls/Alert.tsx`, `Toast.tsx`, `ui/scene/SceneBanner.tsx`,
  `EmptyState.tsx`.
- **Procedimiento**: centralizar textos en `i18n/es.ts`.
- **Aceptación**: cada estado muestra icono + palabra + texto; las notificaciones usan
  `role="status"` y los errores, `role="alert"`; las notificaciones se pausan con *hover* y
  con foco.
- **Verificación**: e2e de cada estado; captura C5 y C10.
- **Evidencia**: capturas y salida.

#### UI-02 · Editor de ecuaciones — Completada y verificada
- *Nota (H4)*: `ExpressionField` → `ui/controls/CampoExpresion.tsx`; `Equations` →
  `ui/panel/Ecuaciones.tsx`.
- **Objetivo**: P, Q, R con vista previa, validación en vivo, estado «incompleta» y
  aplicación con rebote.
- **Dependencias**: MAT-04, VIS-02, UI-07, CMP-02.
- **Componentes**: `ui/controls/ExpressionField.tsx`, `ui/panel/Equations.tsx`.
- **Procedimiento**: SPEC §5.3; flujo F2; subrayado de la posición del error.
- **Aceptación**: V-FUN-02 pasa.
- **Verificación**: e2e.
- **Evidencia**: salida y captura C5.

#### UI-03 · Parámetros — Completada y verificada
- *Nota (H4)*: `ui/panel/Parametros.tsx`; valores de un parámetro nuevo en D-32.
- **Objetivo**: añadir, editar, restablecer y eliminar parámetros; deslizador y número
  sincronizados.
- **Dependencias**: UI-02.
- **Componentes**: `ui/panel/Parameters.tsx`.
- **Procedimiento**: flujo F3; máximo de 8 parámetros.
- **Aceptación**: V-FUN-03 pasa.
- **Verificación**: e2e.
- **Evidencia**: salida.

#### UI-04 · Dominio y muestreo — Completada y verificada
- *Nota (H4)*: `ui/panel/Dominio.tsx`; reencuadre con `ControladorEscena.reencuadrar` (conserva la
  orientación).
- **Objetivo**: límites de Ω, N, nodos/centros y resolución del corte, con validación.
- **Dependencias**: VIS-02, CMP-02.
- **Componentes**: `ui/panel/DomainSection.tsx`, `render/camera.ts` (reencuadre).
- **Procedimiento**: flujo F4.
- **Aceptación**: V-FUN-14 pasa.
- **Verificación**: e2e.
- **Evidencia**: salida.

#### UI-05 · Restablecer y deshacer — Completada y verificada
- *Nota (H4)*: acciones en `state/actions.ts`; menú y «Deshacer» en `app/edicion.ts`.
- **Objetivo**: restablecer cámara, parámetros y experimento, con «Deshacer» temporal.
- **Dependencias**: UI-03, UI-04.
- **Componentes**: `state/actions.ts`, menú de la barra superior.
- **Procedimiento**: flujo F8; instantánea previa del estado durante 8 s.
- **Aceptación**: V-FUN-09 pasa.
- **Verificación**: e2e.
- **Evidencia**: salida.

#### REV-02 · Revisión de capturas de controles y estados — Completada y verificada
- *Nota (H4)*: VV-06 revisado tras medirlo (D-33).
- **Objetivo**: revisar los estados de interacción, la densidad del panel y los mensajes.
- **Dependencias**: UI-02 … UI-05.
- **Componentes**: `evidencia/REV-02/`.
- **Procedimiento**: capturas C1, C5, C8 y C10 en V1–V3; VV-02, VV-04, VV-06, VV-07 y VV-08.
- **Aceptación**: checklist superada; incidencias resueltas y recapturadas.
- **Verificación**: automática + manual.
- **Evidencia**: PNG + `informe.md`.

#### REN-03 · Capa de líneas de corriente — Completada y verificada
- **Objetivo**: líneas con `Line2` (1.5 px + halo), cheurones de sentido, semillas y marcas
  finales.
- **Dependencias**: NUM-04, CMP-02, REN-01.
- **Componentes**: `render/layers/streamlines.ts`.
- **Procedimiento**: actualizar `LineMaterial.resolution` al redimensionar y al exportar;
  cheurones cada 1.5 Δ de longitud de arco.
- **Aceptación**: (1) helicoidal con a = 0.25: las 4 hélices se ven, con cheurones en el
  sentido de +F; (2) las marcas finales coinciden con los motivos de parada; (3) 1 000 000 de
  vértices sin errores.
- **Verificación**: e2e + captura C2.
- **Evidencia**: captura y recuento de motivos.

#### REN-04 · Modos de magnitud y escala — Completada y verificada
- **Objetivo**: proporcional/normalizada, auto/fija, lineal/logarítmica.
- **Dependencias**: REN-02.
- **Componentes**: `render/layers/arrows.ts`, sección Avanzado, leyenda.
- **Procedimiento**: DESIGN §9.3 y §9.10.
- **Aceptación**: (1) con la escala fija, al cambiar de campo, las flechas con igual |F|
  tienen igual longitud y color; (2) en modo normalizado todas las longitudes son iguales y
  la leyenda lo dice; (3) en modo logarítmico las marcas se recalculan.
- **Verificación**: Vitest sobre la función pura + e2e.
- **Evidencia**: salida y capturas comparativas.

#### REN-05 · Cortes — Completada y verificada
- **Objetivo**: plano XY/XZ/YZ con contorno, velo y etiqueta; flechas del corte (completas
  o tangenciales); «solo en el corte».
- **Dependencias**: REN-02, NUM-06.
- **Componentes**: `render/layers/slice.ts`.
- **Procedimiento**: DESIGN §9.5; flujo F6.
- **Aceptación**: V-FUN-07 (parte geométrica) pasa.
- **Verificación**: e2e.
- **Evidencia**: capturas de los tres planos.

#### REN-06 · Mapa escalar del corte — Completada y verificada
- **Objetivo**: *shader* con banda oscura, puntos y rayado por signo, nivel cero discontinuo
  y glifos dispersos (+/−, ⊙/⊗, ↺/↻).
- **Dependencias**: REN-05.
- **Componentes**: `render/layers/scalarOverlay.ts`.
- **Procedimiento**: DESIGN §9.6–9.8; patrones en coordenadas del plano.
- **Aceptación**: V-FUN-07 (signos con T6) pasa; la captura C3 muestra los dos patrones y el
  contorno en $x=-0.5$.
- **Verificación**: e2e con muestreo de píxeles (frecuencia del patrón a cada lado).
- **Evidencia**: captura C3 y análisis de píxeles.

#### REN-07 · Glifos de rotacional y rueda de paletas — Completada y verificada
- **Objetivo**: glifo con anillo orientado por la regla de la mano derecha; rueda en P.
- **Dependencias**: REN-02, NUM-02.
- **Componentes**: `render/layers/curlGlyphs.ts`, `selection.ts`.
- **Procedimiento**: DESIGN §9.7.
- **Aceptación**: (1) rotacional con ω = 1: los glifos apuntan a +z con el anillo
  antihorario visto desde arriba; con ω = −1, al revés; (2) V-FUN-08 pasa.
- **Verificación**: Vitest sobre la orientación + e2e.
- **Evidencia**: capturas con ω = ±1.

#### REN-08 · Partículas y control de animación — Completada y verificada
- **Objetivo**: partículas con estela que se estrecha, pausa/reanudar, escala τ y
  movimiento reducido.
- **Dependencias**: NUM-05, REN-01.
- **Componentes**: `render/layers/particles.ts`, barra de la escena.
- **Procedimiento**: reloj determinista en modo prueba.
- **Aceptación**: (1) Espacio pausa y reanuda; (2) con `reducedMotion: 'reduce'` arrancan en
  pausa; (3) la leyenda muestra τ.
- **Verificación**: e2e con emulación de movimiento reducido.
- **Evidencia**: salida y capturas.

#### UI-08 · Secciones de líneas, corte y derivadas — Completada y verificada
- **Objetivo**: controles del panel para semillas y opciones de integración, para el corte y
  para las expresiones de div F y rot F con sus accesos directos.
- **Dependencias**: REN-03, REN-05, REN-06, MAT-04.
- **Componentes**: `ui/panel/StreamlinesSection.tsx`, `SliceSection.tsx`,
  `DerivativesSection.tsx`.
- **Procedimiento**: flujos F5 y F6.
- **Aceptación**: cada opción cambia la escena según F5 y F6; «Detalles del cálculo» muestra
  el recuento por motivo de parada; div F del campo T6 se muestra como $2x+1$.
- **Verificación**: e2e.
- **Evidencia**: salida y capturas.

#### VIS-05 · Legibilidad científica: leyenda completa y auditoría de codificación — Completada y verificada
- **Objetivo**: leyenda con todas las entradas (DESIGN §9.12) y comprobación de que la escena
  respeta la tabla de codificación.
- **Dependencias**: REN-03 … REN-08, VIS-04.
- **Componentes**: `ui/scene/Legend.tsx`; `evidencia/VIS-05/matriz.md`.
- **Procedimiento**: para cada fila de DESIGN §9.1, una escena de prueba y una comprobación;
  estrés con 21³ (C7).
- **Aceptación**: VV-09 superada: cada significado esencial tiene una señal no tonal; ninguna
  variable visual tiene dos significados simultáneos sin explicación en la leyenda; en C7 las
  puntas siguen identificables en la mitad delantera de la escena.
- **Verificación**: matriz rellenada + capturas + revisión manual.
- **Evidencia**: `matriz.md` y capturas.

#### REV-03 · Revisión de capturas de la escena — Completada y verificada
- **Objetivo**: revisar la claridad de la escena y la paleta con todas las capas.
- **Dependencias**: VIS-05.
- **Componentes**: `evidencia/REV-03/`.
- **Procedimiento**: capturas C2, C3, C4, C7 y C11 en V1–V3; VV-01, VV-03, VV-05, VV-09 y VV-10.
- **Aceptación**: checklist superada; incidencias resueltas.
- **Verificación**: automática + manual.
- **Evidencia**: PNG + `informe.md`.

#### INS-01 · Selección de puntos — Completada y verificada
- **Objetivo**: seleccionar P con clic (flecha o corte), coordenadas o teclado.
- **Dependencias**: REN-02, REN-05.
- **Componentes**: `render/picking.ts`, `ui/scene/Inspector.tsx` (coordenadas).
- **Procedimiento**: *raycast* con `instanceId`; intersección con el plano.
- **Aceptación**: (1) clic sobre una flecha conocida → P = su nodo exacto; (2) clic sobre el
  corte → P en el plano (|error| < Δ/100); (3) Alt+flechas mueve P en Δ.
- **Verificación**: e2e con clics en coordenadas de pantalla calculadas.
- **Evidencia**: salida.

#### INS-02 · Tarjeta del inspector — Completada y verificada
- **Objetivo**: F, |F|, F̂, div, rot, J, método e interpretación, con «Copiar valores».
- **Dependencias**: INS-01, NUM-02, MAT-04.
- **Componentes**: `ui/scene/Inspector.tsx`.
- **Procedimiento**: DESIGN §6; formato §3.3.
- **Aceptación**: V-FUN-06 pasa; P fuera de D → «F no está definido en P».
- **Verificación**: e2e.
- **Evidencia**: captura C4.

#### INS-03 · Coherencia entre ecuaciones, geometría, leyenda e inspector — Completada y verificada
- **Objetivo**: demostrar que las cuatro vistas del mismo dato coinciden.
- **Dependencias**: INS-02, VIS-05.
- **Componentes**: `tests/e2e/coherencia.spec.ts`.
- **Procedimiento**: VALIDATION §5.
- **Aceptación**: V-FUN-05 y V-FUN-06 pasan para los 6 campos y para T6.
- **Verificación**: e2e.
- **Evidencia**: salida.

#### EXP-01 · Configuración JSON v1 — Completada y verificada
- **Objetivo**: exportar, importar, validar y migrar la configuración.
- **Dependencias**: UI-05.
- **Componentes**: `state/persist.ts`, `export/json.ts`, `tests/fixtures/`.
- **Procedimiento**: SPEC §7.2; flujo F9.
- **Aceptación**: V-FUN-10 pasa.
- **Verificación**: Vitest (validador) + e2e (ida y vuelta).
- **Evidencia**: salida.

#### EXP-02 · Autoguardado y recuperación — Completada y verificada
- **Objetivo**: guardar en `localStorage` y recuperar al arrancar, tolerando fallos.
- **Dependencias**: EXP-01.
- **Componentes**: `state/persist.ts`.
- **Procedimiento**: rebote de 1 s; `try/catch`; aviso con «Empezar de cero».
- **Aceptación**: V-FUN-11 pasa.
- **Verificación**: e2e con almacenamiento bloqueado.
- **Evidencia**: salida.

#### EXP-03 · Exportación PNG compuesta — Completada y verificada
- **Objetivo**: imagen de la escena ± leyenda ± ecuaciones en tres tamaños.
- **Dependencias**: VIS-05.
- **Componentes**: `export/png.ts`.
- **Procedimiento**: redibujar al tamaño pedido (y actualizar `LineMaterial.resolution`),
  copiar el lienzo en la misma tarea, componer con Canvas 2D y restaurar el tamaño.
- **Aceptación**: V-FUN-12 pasa (dimensiones, monocromía, leyenda presente, imagen no vacía).
- **Verificación**: e2e que lee el archivo descargado.
- **Evidencia**: PNG exportados + auditoría.

#### A11Y-01 · Teclado, foco y atajos — Completada y verificada
- **Objetivo**: §3.1 completo; foco visible y nunca tapado.
- **Dependencias**: INS-01, UI-08.
- **Componentes**: `app/atajos.ts`, todos los componentes.
- **Procedimiento**: guion de recorrido completo por teclado.
- **Aceptación**: V-A11Y-02 y V-A11Y-03 pasan.
- **Verificación**: e2e + manual.
- **Evidencia**: guion, salida y vídeo o capturas del recorrido.

#### A11Y-02 · ARIA, lector de pantalla y movimiento reducido — Parcial (falta V-A11Y-04)
- **Objetivo**: nombres accesibles, regiones vivas, resumen de la escena y movimiento reducido.
- **Dependencias**: REN-08, A11Y-01.
- **Componentes**: transversal.
- **Procedimiento**: revisión con NVDA o VoiceOver en el equipo del usuario.
- **Aceptación**: V-A11Y-01, V-A11Y-04 y VV-10 pasan.
- **Verificación**: axe + manual.
- **Evidencia**: salida de axe; notas de la sesión con el lector.

#### UI-06 · Cajón de ayuda y ayuda contextual — Completada y verificada
- **Objetivo**: Conceptos, Sintaxis, Atajos y Supuestos, con accesos «?».
- **Dependencias**: VIS-02, MAT-04.
- **Componentes**: `ui/help/`.
- **Procedimiento**: contenidos de SPEC §3 y §5.2.
- **Aceptación**: (1) cada «?» abre su apartado; (2) la lista de funciones de Sintaxis se
  genera desde la lista blanca, sin duplicarla; (3) Esc devuelve el foco al origen.
- **Verificación**: e2e + revisión de contenido.
- **Evidencia**: captura C6.

#### VIS-06 · Adaptación a pantallas — Completada y verificada
- **Objetivo**: puntos de ruptura de DESIGN §5.4 y niveles de SPEC §9.
- **Dependencias**: INS-02, UI-08.
- **Componentes**: CSS de la composición, cajón y hoja inferior.
- **Procedimiento**: capturas por tamaño.
- **Aceptación**: VV-08 pasa en V1–V5; VV-06 en V3; las funciones siguen accesibles en V4.
- **Verificación**: automática + manual.
- **Evidencia**: capturas.

#### VAL-01 · Batería matemática y numérica completa — Completada y verificada
- **Objetivo**: todas las V-MAT y V-NUM en verde, con los errores medidos registrados.
- **Dependencias**: MAT-05, NUM-02 … NUM-06.
- **Componentes**: pruebas.
- **Procedimiento**: `npm test -- --coverage`.
- **Aceptación**: 100 % en verde; cobertura ≥ 90 % de líneas en `math/` y `numerics/`.
- **Verificación**: CI local.
- **Evidencia**: informe de cobertura y tabla de errores medidos frente a las tolerancias.

#### VAL-02 · Batería funcional de extremo a extremo — Parcial (falta la prueba de humo manual, Q-05)
- **Objetivo**: todas las V-FUN en verde.
- **Dependencias**: H4 … H8.
- **Componentes**: `tests/e2e/`.
- **Procedimiento**: `npm run test:e2e`.
- **Aceptación**: 100 % en verde en Chromium; prueba de humo manual en Firefox y Safari.
- **Verificación**: ejecución.
- **Evidencia**: informe HTML de Playwright.

#### VAL-03 · Medición de rendimiento — Parcial (medida en C0; falta R1, Q-06)
- **Objetivo**: medir PERF-A y PERF-B en el equipo de referencia R1 y en el entorno C0.
- **Dependencias**: CMP-02, H5.
- **Componentes**: `src/app/rendimiento.ts` y `PanelRendimiento.tsx` (modo `?perf=`), `scripts/perf.mjs` (`npm run perf`), `tests/fixtures/perf-*.json`.
- **Procedimiento**: VALIDATION §6.
- **Aceptación**: objetivos de VALIDATION §6 cumplidos, o desviaciones documentadas en
  STATUS con su plan.
- **Verificación**: ejecución en R1 (por el usuario) y en C0.
- **Evidencia**: JSON de resultados por equipo.

#### REV-04 · Revisión visual final — Completada y verificada
- **Objetivo**: matriz completa de capturas y checklist VV-01…VV-10.
- **Dependencias**: VIS-06, A11Y-02, EXP-03.
- **Componentes**: `evidencia/REV-04/`, `tests/visual/`.
- **Procedimiento**: VALIDATION §7.
- **Aceptación**: todas las VV superadas; capturas de referencia guardadas.
- **Verificación**: automática + manual.
- **Evidencia**: PNG + `informe.md`.

#### ENT-01 · HTML autocontenido final — Completada y verificada
- **Objetivo**: entregar `campos-vectoriales.html` operativo desde disco y sin red (RNF-14).
- **Dependencias**: VAL-02, REV-04.
- **Componentes**: `scripts/autocontenido.mjs`, `entrega/campos-vectoriales.html`.
- **Procedimiento**: compilar; incrustar JS, CSS, fuentes y *worker*; escribir la CSP con la
  huella del script; abrirlo con `file://` en Chromium con la red cortada y recorrer los
  flujos principales.
- **Aceptación**: V-FUN-17 pasa; tamaño ≤ 3 MB; el archivo de `entrega/` coincide byte a byte
  con la compilación del commit indicado.
- **Verificación**: e2e sobre `file://` con `context.setOffline(true)`.
- **Evidencia**: registro de la prueba, tamaño y SHA-256 del archivo.

#### DOC-01 · Documentación final — Pendiente
- **Objetivo**: README de uso, ayuda revisada y STATUS final.
- **Dependencias**: VAL-01 … REV-04.
- **Componentes**: `README.md`, `STATUS.md`, `ui/help/`.
- **Procedimiento**: revisión cruzada de identificadores y enlaces.
- **Aceptación**: un tercero ejecuta el proyecto siguiendo solo el README; STATUS refleja el
  estado real con enlaces a la evidencia.
- **Verificación**: lectura guiada.
- **Evidencia**: lista de comprobación firmada en STATUS.
