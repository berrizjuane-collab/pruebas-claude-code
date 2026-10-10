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
| Tests unitarios | `npm test` | ✓ **75/75** en 13 archivos (Vitest 5) |
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
| Vista general | 34 · 227 k | 55 · 483 k | 73 · 947 k |
| Abruzzi | 35 · 228 k | 50 · 488 k | 60 · 719 k |
| Hombro y Campo IV | 31 · 237 k | 43 · 463 k | 43 · 463 k |
| Bottleneck y serac | 25 · 226 k | 33 · 400 k | 33 · 400 k |
| Cumbre | 25 · 226 k | 33 · 400 k | 33 · 400 k |
| Cara norte | 34 · 240 k | 55 · 452 k | 73 · 930 k |
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
- **Nubes**: un draw call instanciado (30 / 56 / 97 copos en Baja / Media / Alta).

**Peor caso**: se evaluaron 23 512 poses alcanzables (25 objetivos repartidos por
el núcleo, distancias de 1 a 24 km, inclinaciones de 4° a 87° y orientaciones
cada 10°). En Baja el terreno necesita como máximo **42 mallas**,
52 draw calls en total con las nubes. Sin el quadtree el máximo era 71 mallas (80 draw calls);
ese análisis es el que motivó añadirlo.

**Memoria de texturas (estimación)**: 27 MiB de texturas de terreno (albedo,
máscaras, normales, procedencia y microdetalle en RGBA8 con mipmaps) más el mapa
de sombras (Media 16 MiB, Alta 64 MiB): Baja 27/48, Media 43/80 y Alta 91/160 MiB.
Es una estimación por formato y dimensiones: no una medida de memoria de GPU.

## 4. Tirones: dónde estaban y qué se hizo

Perfil por fases de cada fotograma (cámara, LOD, render, pase de sombras, etiquetas)
durante el mismo guion de interacción (tres arrastres de órbita, seis pasos de rueda y
dos cambios de vista), perfil Media, lienzo 640×400, SwiftShader. Los tiempos
absolutos son de la GPU emulada; lo que importa es dónde aparecen los picos:

| Medida en la interacción | Antes | Después |
| --- | ---: | ---: |
| Fotogramas completados en el mismo guion | 1 883 | **4 862** |
| Coste por fotograma en el hilo principal, p95 | 521 ms | **1,4 ms** |
| Pase de sombras rehecho en movimiento | 144 veces | **0** |
| Geometrías subidas a la GPU a mitad de un gesto | 178 | **0** |
| Programas de shader compilados a mitad de un gesto | 0 | 0 |
| Cámara, LOD y etiquetas (máx. por fotograma) | ≤ 4 ms | ≤ 4 ms |

Causas encontradas y arreglos:

1. **Sombras**: cada cambio de nivel de detalle marcaba el mapa de sombras como sucio
   y se rehacía cada ~260 ms mientras la cámara se movía (hasta 4096² y ~1 M de
   triángulos). Ahora proyecta las sombras una copia estática del relieve que solo se
   dibuja en el pase de sombras: se rehace al cambiar la luz o la calidad, nunca al
   moverse.
2. **Subidas a la GPU**: cada nivel de LOD se subía la primera vez que se veía. Ahora
   las 380 geometrías y todas las texturas se suben tras la pantalla de carga
   (dibujándolas una vez en un destino de 1×1 píxel).
3. **Cambios de calidad**: Auto cambiaba de perfil a mitad del gesto y, al cambiar la
   anisotropía, volvía a subir todas las texturas. Ahora el cambio espera a que la
   cámara esté quieta y la anisotropía queda fija desde la carga. En escritorio se
   arranca en Media salvo GPU dedicada reconocible; Auto sube a Alta si hay margen.
4. **Picos pequeños**: la oclusión de etiquetas lanzaba todos los rayos en el mismo
   fotograma (ahora 4 por fotograma, en turno); la selección de LOD creaba arrays en
   cada fotograma (ahora búferes reutilizados); Auto ordenaba 90 muestras en cada
   fotograma (ahora cada 10).

Pulido relacionado: las etiquetas conservan su posición del fotograma anterior si
sigue libre (no saltan de lado mientras se gira) y en móvil se colocan por encima de
la ficha abierta.

## 5. Rendimiento (3 escenarios × 30 s)

`npm run perf` contra la build de producción (`vite preview`). La cámara recorre
una órbita determinista (0,6° por fotograma) y los intervalos se toman con
`requestAnimationFrame`. Lienzo 1440×900, DPR 1, antialiasing por defecto.

| Perfil | Escenario | Mediana | p95 | Fotogramas | Máx. draw calls · triángulos | CPU hilo principal (med / p95) | Lienzo |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Baja | Órbita general | 1 117 ms | 2 900 ms | 20 | 35 · 234 k | 1,3 / 1,6 ms | 1440×900 |
| Baja | Enfoque del Bottleneck | 900 ms | 2 550 ms | 29 | 29 · 242 k | 1,2 / 2,4 ms | 1440×900 |
| Baja | Todas las capas activas | 1 033 ms | 2 366 ms | 25 | 35 · 249 k | 1,2 / 3,2 ms | 1440×900 |
| Media | Órbita general | 1 900 ms | 3 950 ms | 17 | 58 · 491 k | 1,7 / 3,4 ms | 1440×900 |
| Media | Enfoque del Bottleneck | 3 117 ms | 3 950 ms | 11 | 34 · 412 k | 1,2 / 1,7 ms | 1440×900 |
| Media | Todas las capas activas | 1 883 ms | 4 450 ms | 12 | 58 · 500 k | 1,6 / 4,7 ms | 1440×900 |
| Alta | Órbita general | 3 550 ms | 7 150 ms | 9 | 74 · 950 k | 1,8 / 2,1 ms | 1440×900 |
| Alta | Enfoque del Bottleneck | 3 833 ms | 8 083 ms | 4 | 33 · 400 k | 1,3 / 1,5 ms | 1440×900 |
| Alta | Todas las capas activas | 4 000 ms | 4 966 ms | 9 | 73 · 947 k | 2,4 / 7,2 ms | 1440×900 |

Entorno registrado por el script: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`, 4 núcleos, DPR 1. Los máximos de draw calls y triángulos son los de toda la ventana de 30 s, no solo del último fotograma.

**Lectura**: el intervalo entre fotogramas (de 1 a 9 s) es el coste de rasterizar en la CPU con SwiftShader y no predice los FPS en una GPU. Lo transferible es: (1) el coste del hilo principal, de 1 a 3 ms por fotograma, lejos de los 16,7 ms de un objetivo de 60 FPS; (2) los recuentos de geometría, idénticos en cualquier GPU y dentro del presupuesto durante toda la órbita.

## 6. Recursos en ciclos repetidos

Prueba e2e «20 ciclos…» (dos tandas de 20: rutas, destacado, zona de la muerte, procedencia, vista y enfoque de un punto en cada ciclo):

| Medida | Inicio | Tras 20 ciclos | Tras 40 ciclos |
| --- | ---: | ---: | ---: |
| Geometrías subidas a la GPU (existen 380) | 380 | 380 | 380 |
| Texturas | 15 | 15 | 15 |
| Objetos en la escena | 209 | 209 | 209 |
| Marcadores en el DOM | 19 | 19 | 19 |
| Montón de JavaScript | 54,5 MiB | 52,9 MiB | 52,9 MiB |

Todas las geometrías (cada nivel de LOD, cada padre 2×2 y los proyectores de sombra) se suben a la GPU tras la pantalla de carga, así que el recuento queda fijo durante los ciclos: ninguna se crea ni se sube después. Texturas, objetos y marcadores no cambian. El montón de JavaScript se lee tras forzar la recolección de basura (`gc()` expuesto y memoria precisa en la configuración de Playwright) y se mantiene estable; es un indicio de que no hay fugas en JavaScript, no una medida de memoria de GPU. Cambiar de calidad cuatro veces tampoco duplica objetos ni pierde la selección (prueba aparte).

## 7. Carga

| Medida | Valor |
| --- | --- |
| Datos descargados para la escena | 2,3 MiB (alturas 0,8 · imagen y máscaras 1,3 · procedencia 0,2 · JSON 0,1) |
| Código | 174 kB gzip (+ worker 5 kB) |
| Total inicial | ≈ 2,5 MiB (presupuesto ≤ 20 MB) |
| Tiempos en este entorno | descarga 140 ms · relieve en el worker 408 ms · escena 424 ms · total 977 ms (servidor local) |

La preparación pesada (decodificar PNG, construir mallas y normales, rejilla de
holgura) ocurre en un Web Worker; si el navegador no permite workers, se hace en
el hilo principal.

## 8. Lo que no se pudo verificar

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
