# Arquitectura

El observatorio está dividido en capas con dependencias en un solo sentido. **La física no depende
de nada gráfico**: es TypeScript puro, se prueba con Vitest en Node y es la referencia con la que se
valida el trazador de la GPU.

```
src/
├── physics/        Núcleo relativista puro (sin DOM, sin Three.js) — probado en Node
│   ├── constants.ts, sgra.ts        constantes CGS/SI, parámetros de Sgr A* con fuentes, escalas
│   ├── metrics/                     Kerr (BL, fórmulas cerradas), Kerr–Schild, transformaciones
│   ├── integrators/dopri5.ts        Dormand–Prince 5(4) con salida densa + RK4
│   ├── geodesics/                   integrador geodésico con eventos, constantes, órbitas
│   ├── observers/                   estático, ZAMO, en órbita, lluvia; tétradas
│   ├── tidal/riemann.ts             Riemann numérico, marea, Kretschmann
│   ├── emission/                    sincrotrón térmico y modelo RIAF
│   └── optics/cpuTracer.ts          trazador de referencia (doble precisión)
├── simulation/     Experimentos (se ejecutan en un Web Worker)
│   ├── types.ts, catalog.ts         tipos, diez objetos, materiales y modelos de rotura
│   ├── initial.ts                   condiciones iniciales de los seis escenarios
│   ├── runner.ts                    integración, muestreo, marea, fragmentación, eventos
│   ├── geodesicFamilies.ts          familias de geodésicas para SPACE-TIME GEOMETRY
│   ├── signalTracker.ts             problema emisor–observador (señal recibida)
│   ├── physicsWorker.ts             trabajador: calcula por delante del reloj
│   └── client.ts                    lado principal: almacena muestras e interpola estados
├── rendering/      GPU (Three.js + GLSL ES 3.00)
│   ├── raytracer/                   trazador relativista (shader), ajustes de calidad
│   ├── markers/                     líneas de universo de los objetos → textura del trazador
│   ├── overlay/                     diagramas en coordenadas KS (trayectorias, conos…)
│   ├── objects/                     modelos 3D, vista previa giratoria, vista B
│   ├── postprocessing/Post.ts       acumulación, exposición, mapas de color, bloom, haz EHT
│   └── color/blackbody.ts           tabla de cuerpo negro CIE 1931
├── camera/         Navegación (software) y cámara relativista (observadores, caída libre)
├── app/            Motor (bucle de render), Observatory (orquestador), estado, entrada, audio
├── ui/             React: HUD, paneles, Research Mode, gráficos, diagramas
└── validation/     Validación GPU ↔ CPU que se ejecuta en un navegador real
```

## Flujo de un fotograma

```
                ┌──────────────── hilo principal ────────────────┐        ┌──── Web Worker ────┐
 entrada ──► CameraController (pose, software)                           │  ExperimentRunner  │
                │                                                         │  Dormand–Prince    │
                ▼                                                         │  eventos, marea,   │
 Engine.frame ─► reloj t (multiplicador; o τ del objeto en la vista B) ──► │  fragmentos        │
                │   RelativisticCamera: u y tétrada del observador        │  (calcula por      │
                │   (o la cámara comóvil del objeto, o la caída libre)    │   delante de t)    │
                ▼                                                         └─────────┬──────────┘
            MarkerManager: líneas de universo → textura de balizas            muestras cada 0,25 M
                ▼                                                         (buffers transferidos)
            RayTracer (GPU): una geodésica nula por píxel ──► HDR                   │
                ▼                                                                   ▼
            Post: acumulación progresiva → exposición / mapa de color      PhysicsClient (muestras,
                ▼                                                          eventos, interpolación)
            Overlay (diagramas) o LocalView (objeto 3D en su marco)                │
                ▼                                                                   ▼
            pantalla                                  Observatory → store → React (telemetría)
```

- **Motor** (`app/Engine.ts`): avanza el tiempo, pide el marco de la cámara, construye los ajustes del
  trazador, detecta cambios (cámara, ajustes, tiempo) para reiniciar la acumulación, adapta la
  resolución de render al tiempo de fotograma y compone las capas. Expone `capture()` y `benchmark()`.
- **Orquestador** (`app/Observatory.ts`): conecta motor, trabajador, balizas, diagramas y vista B;
  gobierna el reloj de la vista B (tiempo propio del objeto) y publica la telemetría.
- **Estado** (`app/store.ts`): almacén mínimo con `useSyncExternalStore` y selectores con
  comparación superficial. El estado de alta frecuencia (pose, t) vive en el motor y se publica a
  ~8 Hz.

## Hilos y datos

- El trabajador integra todos los experimentos con presupuesto de ~14 ms por experimento y vuelta,
  hasta un objetivo `t_target = t + adelanto` que fija el hilo principal. Las muestras viajan en
  `Float64Array`/`Float32Array` transferidos (sin copia).
- Muestra de un cuerpo (40 dobles): `t, x, y, z, uᵘ, τ, p_μ, e₁ᵘ, e₂ᵘ, e₃ᵘ, E_ij (6), K, derivas (4), r,
  tensión, banderas`. Las piezas, partículas y fotones tienen sus propios bloques.
- `PhysicsClient.bodyAt(t)` interpola linealmente entre muestras (para dibujar); los eventos tienen su
  instante exacto.
- Las familias de geodésicas y el rastreo de la señal se piden al trabajador como tareas puntuales.

## Determinismo y reinicio exacto

Cada experimento guarda su configuración completa (objeto, escenario, posición, velocidad local,
observador del marco, actitud, semilla, espín). «Reiniciar» vuelve a lanzar con la misma
configuración en el mismo `t`: el integrador es determinista y las nubes usan `mulberry32(seed)`.
La configuración se exporta e importa en JSON.

## Trazador en la GPU

- Un único *fragment shader* (`rendering/raytracer/mainShader.ts`) a pantalla completa; uniformes
  para la cámara (posición, tétrada, FOV), el espín, el plasma y el cielo; texturas para las
  balizas (líneas de universo) y la tabla de cuerpo negro.
- Objetivo `RGBA32F` (o `HalfFloat`) a escala de render variable; acumulación con fluctuación
  subpíxel de Halton (2, 3) cuando la imagen es estática, media móvil cuando cambia con el tiempo.
- Tres perfiles (cinematográfico, EHT, espacio-tiempo) comparten la propagación de la luz y solo
  difieren en emisión, frecuencias y presentación.

## Pruebas

- `npm test`: 67 pruebas de Vitest (física, integradores, observadores, marea, sincrotrón, trazador
  de referencia, experimentos y señal recibida).
- `npm run validar`: informe cuantitativo de la física (`docs/validacion/fisica.json` y `.md`).
- `npm run validar:gpu`: GPU frente a CPU en Chromium (`docs/validacion/gpu.json`).
- `node scripts/recorrido.mjs`: recorrido automático de la aplicación real (lanzar, perspectivas,
  paneles) con capturas y detección de errores de página.
- `npm run capturas` y `npm run rendimiento`: capturas reales y medición de rendimiento.

## Compilación

`npm run build` = comprobación de tipos + `vite build` + `scripts/autocontenido.mjs`, que incrusta
el JavaScript, el CSS, las fuentes y el trabajador en **un único HTML** (`dist/sagittarius-a.html`)
con una política de seguridad de contenidos que bloquea cualquier petición de red.
