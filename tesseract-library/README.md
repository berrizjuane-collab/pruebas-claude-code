# Biblioteca Tesseráctica — Interstellar 4D

Simulación interactiva de la escena del teseracto de *Interstellar*: la habitación
de Murph repetida a lo largo del eje temporal W, navegable, con matemática real de
proyección 4D y recursión genuina de generación de escena. Un único artifact HTML
autocontenido (React + Three.js empaquetados inline, cero peticiones externas).

![vista por defecto](shots/01-default.png)

## Qué hay de real acá adentro

**Geometría N-dimensional** (`src/math.js`)
- `generateHypercube(n)` construye el n-cubo por recursión estructural: dos
  (n−1)-cubos unidos vértice a vértice; caso base el 0-cubo. Validado en vivo
  para n = 0…5 (2ⁿ vértices, n·2ⁿ⁻¹ aristas).
- Las 6 matrices de rotación de R⁴ (XY, XZ, XW, YZ, YW, ZW), todas expuestas al
  usuario como diales de velocidad angular; ortogonalidad y det = +1 verificados.
- Pipeline de proyección en dos etapas puras y testeables: perspectiva 4D→3D con
  focal d₄ ajustable (escala = d₄/(d₄−w)) y pinhole 3D→2D — esta última se usa en
  producción para anclar el marcador del HUD a la habitación seleccionada.

**Recursión escénica** (`src/corridor.js`)
- `renderRoom(depth, transform)` emite una habitación y se llama a sí misma para
  la siguiente a lo largo de W. Doble caso base explícito: profundidad máxima y
  umbral de escala proyectada (= distancia 4D), lo que ocurra primero.
- El encogimiento Droste del pasillo **no es un factor artístico**: es la
  perspectiva 4D real aplicada al ancla [0,0,0,w] de cada habitación. Colapsá los
  ángulos y las habitaciones se anidan concéntricas; girá XW y el tiempo se
  despliega como eje espacial.
- Entrar en una habitación re-ancla el árbol recursivo en ese nodo (la época se
  acumula; los libros de cada instante persisten porque se siembran por índice
  temporal absoluto).
- LOD por profundidad: 4 niveles (libros instanciados + mobiliario en aristas →
  estanterías → jaula → aristas mínimas) con materiales cada vez más simples.

**Polvo gravitacional** (`src/dust.js`, `src/noise.js`)
- Campo pseudo-curl de ruido de gradiente propio (divergencia ~0) + pozos de
  gravedad del puntero (atracción + remolino) + amortiguación.
- Al acumular suficiente energía de perturbación, las partículas de la habitación
  ancla reciben blancos con resorte crítico y forman barras Morse en el piso —
  **S T A Y** con timing Morse real (raya = 3 puntos) — y se dispersan. Los
  resortes conviven con el resto de las fuerzas: se puede seguir perturbando
  durante la formación.

**Validaciones automáticas** (`src/validate.js`) — 40 checks con `console.assert`
al arrancar: conteos de hipercubos, ortogonalidad, proyecciones, terminación de la
recursión por ambos casos base (incluida una corrida de 3000 niveles por rama sin
desbordar la pila) y cero geometría huérfana tras 3 re-anclajes. El resultado se
muestra en el panel «LA MATEMÁTICA» del HUD.

**Capa visual** (`src/engine.js`)
- Paleta fiel: negros profundos, ámbar/dorado Hoytema, acento acero mínimo.
- Bloom controlado (UnrealBloomPass a media resolución) + grano y viñeta fílmicos
  en un ShaderPass propio; niebla exponencial.
- Cámara no-euclidiana: resortes críticos con inercia, acople de alabeo al giro,
  balanceo por ruido, fov respirando; deriva cinematográfica en reposo.
- Governor de calidad: si el fps sostenido baja de ~34, reduce polvo, resolución
  de bloom, pixel ratio y profundidad de recursión (y vuelve a subir si sobra).

## Interacción

| Gesto | Efecto |
| --- | --- |
| arrastrar | orbitar (con inercia y alabeo) |
| rueda / pinza | acercarse |
| clic en habitación | seleccionar instante · segundo clic o ⏎ entra |
| ← → / [ ] | recorrer instantes · Esc deselecciona |
| mantener presionado | pozo de gravedad concentrado sobre el polvo |
| agitar el polvo con energía | …algo del otro lado responde |
| espacio | pausar la deriva 4D |
| diales XY…ZW, d₄ | velocidades de los 6 planos y focal 4D |

## Desarrollo

```bash
npm install
npm run build    # → dist/index.html (artifact único autocontenido)
npm run verify   # Chromium headless: validaciones + picking + re-anclaje + capturas
```

`verify.mjs` carga el artifact real, espera el primer frame, lee las 40
validaciones, ejercita picking sintético, re-anclaje a T−2 y la señal Morse, y
deja capturas en `shots/`.
