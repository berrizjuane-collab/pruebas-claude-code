# Verificación y rendimiento

Informe de lo comprobado en esta entrega y de cómo se midió. Todo lo que aparece
aquí se ejecutó de verdad en el entorno descrito; lo que no se pudo comprobar se
dice al final.

**Entorno de medición**: contenedor Linux sin GPU, 4 núcleos; Node 22.22;
Chromium 141.0.7390.37 sin interfaz (Playwright 1.56.1) con WebGL 2 **por
software** (ANGLE → Vulkan → SwiftShader). Fecha: 7 de octubre de 2026.

> SwiftShader rasteriza en la CPU: sus tiempos de fotograma (de uno a varios
> segundos a 1440×900) no dicen nada de una GPU real. Sirve para comprobar que todo funciona, para contar
> geometría y draw calls (idénticos en cualquier GPU) y para medir el coste del
> hilo principal, que sí es representativo.

## 1. Comprobaciones automáticas

| Paso | Comando | Resultado |
| --- | --- | --- |
| Tipos | `npm run typecheck` | ✓ sin errores (TypeScript 6, `strict`) |
| Lint | `npm run lint` | ✓ sin avisos (ESLint 10 + typescript-eslint; los módulos puros no pueden usar el DOM) |
| Tests unitarios | `npm test` | ✓ **68/68** en 12 archivos (Vitest 5) |
| Build de producción | `npm run build` | ✓ JS 662 kB (174 kB gzip) + worker 12 kB + CSS 14 kB |
| Tests de navegador | `npm run test:e2e` | ✓ **17/17** en Chromium (Playwright 1.56), escritorio 1440×900 y móvil 390×844 emulado |
| Pipeline de datos | `bash pipeline/run_all.sh` | ✓ ejecutado de principio a fin en este entorno; genera `public/data` y los fixtures de los tests |

Las pruebas de navegador se reparten en dos proyectos de Playwright: el principal
(16 pruebas) y, después, la de gestos táctiles con un navegador nuevo. Motivo,
observado aquí: tras muchos minutos de render por software en el mismo
navegador, el proceso de GPU emulada (SwiftShader) se satura y la siguiente
página no llega a responder. Es una limitación del entorno sin GPU, no de la
aplicación. La prueba de gestos desactiva además la inercia de la cámara: cada
gesto se aplica en uno o dos fotogramas en vez de unos 50, y las restricciones
se aplican tras cada actualización de los controles igual que con inercia (sin
ella los saltos por fotograma son mayores, así que la prueba es más exigente).

Los tests unitarios trabajan con los datos reales (PNG de `public/data`) cuando
tiene sentido:

- **Coordenadas**: la transversa de Mercator en TypeScript (series de Krüger de
  6.º orden) coincide con pyproj a < 1 mm en 12 puntos de control (de la cumbre
  hasta 46 km); la inversa recupera lon/lat a < 1e-9°; el origen es la
  coordenada publicada de la cumbre.
- **Altitud**: el decodificador PNG de 16 bits reproduce las alturas del pipeline;
  la cumbre del modelo vale 8 611 m; la isolínea de 8 000 m está en
  `y = 8 000 − h0` pese al origen local.
- **Datos**: validación completa (campamentos a < 60 m de su ruta, rutas a < 1 m
  del DEM y ascendentes hasta la cumbre, tramo común almacenado una sola vez, los
  campamentos del Česen no reutilizan los del Abruzzi, orden altimétrico
  Bottleneck < travesía < serac < cumbre, serac sobre la travesía y a lo largo de
  una curva de nivel) y detección de datos erróneos.
- **Cámara**: nunca bajo el relieve ni dentro de la arista, objetivo dentro del
  área, distancias mínima (1 000 m; 350 m en la zona focal) y máxima, transiciones
  que cruzan la arista sin atravesarla, encuadre automático de cada punto con
  visual libre, y las seis vistas evaluadas contra el DEM real.
- **LOD**: selección por error en pantalla con histéresis (sin oscilación), cajas
  envolventes correctas (regresión), errores no decrecientes, faldones, y el
  intercambio **exacto** entre un grupo de 2×2 bloques y su padre.
- **Etiquetas, calidad automática y formato** numérico en español.

## 2. Lista de la sección 15

| # | Comprobación | Cómo se verificó | Estado |
| --- | --- | --- | --- |
| 1 | Carga sin errores ni assets ausentes | e2e: ninguna respuesta HTTP ≥ 400, ningún `console.error` ni excepción; barra de progreso al 100 % | ✓ |
| 2 | Silueta coherente desde ≥ 3 orientaciones | capturas desde el sur (Concordia), sureste (Abruzzi) y norte (China), comparadas a ojo con fotografías conocidas; durante el desarrollo, render en perspectiva del DEM desde Concordia frente a la silueta clásica | ✓ (visual) |
| 3 | Campamentos anclados a ruta y relieve, con incertidumbre visible | tests de datos (distancia a la ruta y al DEM); ficha con estado documentado/aproximado/reconstruido, rango de altitud y fuentes | ✓ |
| 4 | Bottleneck, serac, travesía y cumbre separados | test de orden altimétrico y de geometría del serac; captura 03 | ✓ |
| 5 | Máscara de 8 000 m correcta con el offset | test `y = 8 000 − h0`; el shader recibe `8 000 − h0`; isolínea visible en las capturas | ✓ |
| 6 | Rutas sin regenerar ni descargar | e2e: alternar rutas no crea geometrías ni hace peticiones | ✓ |
| 7 | Zoom, pan, presets y transiciones dentro de límites, también táctiles | e2e: holgura ≥ 30 m en cada fotograma de todas las transiciones; rueda, arrastre y botones forzados al límite; pellizco y arrastre con dos dedos (toques reales inyectados por el protocolo de Chrome en emulación móvil); tests unitarios de restricciones | ✓ (táctil en emulación) |
| 8 | Sin cámara bajo terreno, etiquetas de la cara opuesta, z-fighting ni grietas | e2e de holgura y de etiquetas ocultas desde el norte; rutas sin escritura de profundidad (sin z-fighting entre contorno y línea); faldones + test del intercambio exacto padre/hijos; capturas con el tinte de LOD | ✓ |
| 9 | UI en 390×844 y 1440×900 con safe areas | e2e móvil: sin scroll horizontal, hoja inferior, objetivos táctiles ≥ 44 px; capturas 10–12; `env(safe-area-inset-*)` en el CSS | ✓ (emulación) |
| 10 | Movimiento reducido, errores y WebGL ausente | e2e: vistas sin animación con `prefers-reduced-motion`; sin WebGL 2 la lista de puntos sigue en HTML; fallo de un recurso → error y «Reintentar»; pérdida y restauración del contexto WebGL | ✓ |

## 3. Presupuesto de geometría y draw calls

Medido con `renderer.info` tras renderizar. El pase de sombras se mide aparte
(envolviendo `shadowMap.render`) y se resta: las cifras son del **pase
principal**. Lienzo de 1440×900, cada vista asentada (LOD final).

| Vista | Baja: calls · triángulos | Media | Alta |
| --- | --- | --- | --- |
| Vista general | 33 · 227 k | 54 · 483 k | 72 · 947 k |
| Abruzzi | 34 · 228 k | 49 · 487 k | 59 · 718 k |
| Hombro y Campo IV | 30 · 237 k | 42 · 462 k | 42 · 462 k |
| Bottleneck y serac | 24 · 226 k | 32 · 400 k | 32 · 400 k |
| Cumbre | 24 · 226 k | 32 · 400 k | 32 · 400 k |
| Cara norte | 33 · 240 k | 54 · 452 k | 72 · 930 k |
| **Presupuesto** | **70 · 250 k** | **100 · 500 k** | **150 · 1,2 M** |

Cómo se cumple:

- **LOD por bloques** (núcleo 6×6 a 25 m, contexto 6×6 a 100 m, horizonte 5×5 a
  400 m) con error en pantalla τ = 5 / 2,5 / 1,25 px; si se excede el presupuesto
  de triángulos se relaja τ antes de tocar la silueta. El presupuesto del terreno
  descuenta lo que ya gastan rutas, serac y cielo.
- **Quadtree de dos niveles**: cuando los cuatro bloques de un grupo 2×2 están en
  el mismo nivel ≥ 1 se dibuja su padre (1 draw call en vez de 4). El cambio no
  produce saltos: el nivel p del padre tiene los vértices del nivel p + 1 de los
  hijos (test unitario).
- **Recorte por caja** contra el frustum (más ajustado que la esfera de three.js);
  el pase de sombras sigue viendo los bloques de fuera del encuadre.
- **Contorno de las rutas** desactivado en Baja (5 draw calls menos).

**Peor caso**: se evaluaron 23 512 poses alcanzables (25 objetivos repartidos por
el núcleo, distancias de 1 a 24 km, inclinaciones de 4° a 87° y orientaciones
cada 10°). En Baja el terreno necesita como máximo **42 mallas**,
51 draw calls en total. Sin el quadtree el máximo era 71 mallas (80 draw calls);
ese análisis es el que motivó añadirlo.

**Memoria de texturas (estimación)**: 27 MiB de texturas de terreno (albedo,
máscaras, normales, procedencia y microdetalle en RGBA8 con mipmaps) más el mapa
de sombras (Media 16 MiB, Alta 64 MiB): Baja 27/48, Media 43/80 y Alta 91/160 MiB.
Es una estimación por formato y dimensiones: no una medida de memoria de GPU.

## 4. Rendimiento (3 escenarios × 30 s)

`npm run perf` contra la build de producción (`vite preview`). La cámara recorre
una órbita determinista (0,6° por fotograma) y los intervalos se toman con
`requestAnimationFrame`. Lienzo 1440×900, DPR 1, antialiasing por defecto.

| Perfil | Escenario | Mediana | p95 | Fotogramas | Máx. draw calls · triángulos | CPU hilo principal (med / p95) | Lienzo |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Baja | Órbita general | 1 183 ms | 3 333 ms | 18 | 34 · 234 k | 1,5 / 2,7 ms | 1440×900 |
| Baja | Enfoque del Bottleneck | 1 050 ms | 2 350 ms | 24 | 28 · 242 k | 1,0 / 1,6 ms | 1440×900 |
| Baja | Todas las capas activas | 1 116 ms | 3 567 ms | 20 | 34 · 249 k | 1,0 / 2,4 ms | 1440×900 |
| Media | Órbita general | 2 533 ms | 4 466 ms | 11 | 55 · 487 k | 1,4 / 2,0 ms | 1440×900 |
| Media | Enfoque del Bottleneck | 2 600 ms | 6 233 ms | 11 | 33 · 412 k | 1,2 / 2,0 ms | 1440×900 |
| Media | Todas las capas activas | 2 200 ms | 5 666 ms | 11 | 57 · 499 k | 1,7 / 2,3 ms | 1440×900 |
| Alta | Órbita general | 4 216 ms | 5 166 ms | 7 | 72 · 947 k | 1,6 / 2,5 ms | 1440×900 |
| Alta | Enfoque del Bottleneck | 8 866 ms | 8 866 ms | 3 | 32 · 400 k | 1,3 / 1,4 ms | 1440×900 |
| Alta | Todas las capas activas | 2 700 ms | 8 450 ms | 8 | 72 · 947 k | 1,5 / 2,3 ms | 1440×900 |

Entorno registrado por el script: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`, 4 núcleos, DPR 1. Los máximos de draw calls y triángulos son los de toda la ventana de 30 s, no solo del último fotograma.

**Lectura**: el intervalo entre fotogramas (de 1 a 9 s) es el coste de rasterizar en la CPU con SwiftShader y no predice los FPS en una GPU. Lo transferible es: (1) el coste del hilo principal, de 1 a 3 ms por fotograma, lejos de los 16,7 ms de un objetivo de 60 FPS; (2) los recuentos de geometría, idénticos en cualquier GPU y dentro del presupuesto durante toda la órbita.

## 5. Recursos en ciclos repetidos

Prueba e2e «20 ciclos…» (dos tandas de 20: rutas, destacado, zona de la muerte, procedencia, vista y enfoque de un punto en cada ciclo):

| Medida | Inicio | Tras 20 ciclos | Tras 40 ciclos |
| --- | ---: | ---: | ---: |
| Geometrías subidas a la GPU (existen 379) | 62 | 127 | 127 |
| Texturas | 13 | 13 | 13 |
| Objetos en la escena | 124 | 124 | 124 |
| Marcadores en el DOM | 19 | 19 | 19 |
| Montón de JavaScript | 51,7 MiB | 50,9 MiB | 50,9 MiB |

Todas las geometrías (cada nivel de LOD y cada padre 2×2) se crean al cargar; los ciclos solo suben a la GPU niveles aún no usados y nunca superan las que existen. Texturas, objetos y marcadores no cambian. El montón de JavaScript se lee tras forzar la recolección de basura (`gc()` expuesto y memoria precisa en la configuración de Playwright) y se mantiene estable; es un indicio de que no hay fugas en JavaScript, no una medida de memoria de GPU. Cambiar de calidad cuatro veces tampoco duplica objetos ni pierde la selección (prueba aparte).

## 6. Carga

| Medida | Valor |
| --- | --- |
| Datos descargados para la escena | 2,3 MiB (alturas 0,8 · imagen y máscaras 1,3 · procedencia 0,2 · JSON 0,1) |
| Código | 174 kB gzip (+ worker 5 kB) |
| Total inicial | ≈ 2,5 MiB (presupuesto ≤ 20 MB) |
| Tiempos en este entorno | descarga 506 ms · relieve en el worker 1 168 ms · escena 280 ms · total 1 964 ms (servidor local) |

La preparación pesada (decodificar PNG, construir mallas y normales, rejilla de
holgura) ocurre en un Web Worker; si el navegador no permite workers, se hace en
el hilo principal.

## 7. Lo que no se pudo verificar

- **FPS en una GPU real**, de escritorio o de teléfono: el contenedor no tiene
  GPU. El script admite `PERF_GPU=1 npm run perf` para medirlo en un equipo real.
- **Dispositivos táctiles reales**: el pellizco y el arrastre con dos dedos se
  probaron con toques inyectados en la emulación móvil de Chromium, que verifica
  la lógica de límites, la maquetación y los objetivos táctiles, no la sensación
  ni el rendimiento en un teléfono.
- **Safari y Firefox**: solo se probó Chromium.
- **Lectores de pantalla**: se comprobaron nombres accesibles y recorrido con
  teclado, no la experiencia con un lector real.
- **Fidelidad frente a fotografías**: comparación visual, no métrica.
- **Memoria de GPU real**: solo la estimación de la sección 3.
