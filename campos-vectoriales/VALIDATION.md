# VALIDATION — Pruebas y criterios

> Cómo se demuestra que la aplicación cumple [SPEC.md](SPEC.md) y [DESIGN.md](DESIGN.md).
> Cada tarea de [PLAN.md](PLAN.md) cita aquí sus criterios por identificador.
>
> Estado del documento: **aprobado** (1.0, 2026-10-02) · **ampliado para la 1.1** (H10,
> 2026-10-04): T-20 … T-26, V-MAT-11, V-NUM-17 … V-NUM-22, V-FUN-18 … V-FUN-23, C13–C15.

---

## 1. Estrategia

| Nivel | Qué cubre | Herramienta | Dónde se ejecuta |
| --- | --- | --- | --- |
| Unitario | `math/`, `numerics/`, `state/`, `export/` (funciones puras) | Vitest 5 (Node) | Local y entorno de integración |
| Propiedades | Analizador, derivadas y evaluación con entradas generadas | Vitest + generador propio con semilla | Ídem |
| Integración | *Worker* frente a Node; orquestación | Playwright | Ídem |
| Extremo a extremo | Flujos F1–F10, coherencia, exportación | Playwright 1.56.1 (Chromium) | Ídem; humo manual en Firefox y Safari |
| Visual | Capturas en tamaños definidos y auditorías automáticas | Playwright + *scripts* propios | Entorno Linux (referencias) + revisión manual |
| Accesibilidad | axe-core, teclado, lector de pantalla | `@axe-core/playwright` + manual | Ídem; lector en el equipo del usuario |
| Rendimiento | FPS, latencias de cálculo, tareas largas | `scripts/perf.ts` | R1 (equipo del usuario) y C0 (este entorno) |

Reglas generales:

- Los números aleatorios de las pruebas vienen de *mulberry32* con semilla fija y registrada.
- Las pruebas de navegador usan `?captura=1`: animaciones congeladas, reloj determinista y
  semillas fijas.
- Una prueba que falla nunca se desactiva ni se le amplía la tolerancia sin una entrada en
  STATUS.md que lo justifique.

---

## 2. Tolerancias numéricas justificadas

**Calibración**: el 2026-10-02 se implementó un prototipo desechable en Python (float64,
idéntico en aritmética a JavaScript) de RK4 normalizado, RK4 temporal y diferencias
centradas. Sus resultados están en `evidencia/PLN-01/calibracion.txt`. Cada tolerancia deja
un **margen de al menos ~10×** sobre el error observado y, en lo geométrico, queda muy por
debajo de un píxel (≈ 5 × 10⁻³ unidades en Ω = [−2,2]³ a 1440×900).

| # | Magnitud comprobada | Tolerancia | Observado en la calibración | Justificación |
| --- | --- | --- | --- | --- |
| T-01 | Evaluación compilada frente al oráculo nativo | $\lvert a-b\rvert\le10^{-14}\max(1,\lvert a\rvert,\lvert b\rvert)$ | — | ≈ 45 ulp: solo cambia el orden de las operaciones (`x*x` frente a `pow`) |
| T-02 | Derivada simbólica frente a la analítica | $\le10^{-12}(1+\lvert v\rvert)$ | — | Expresiones equivalentes con pocas operaciones |
| T-03 | Diferencias finitas frente a la analítica, T1 en Ω = [−2,2]³ | $\le10^{-7}(1+\lvert v\rvert)$ | máx. $1.5\times10^{-10}$ | Paso $h_j\approx\varepsilon^{1/3}\max(\lvert x_j\rvert,L)$ con pasos efectivos (SPEC §5.4); margen ≈ 700× |
| T-04 | Diferencias finitas en campos afines (catálogo) | $\le10^{-8}(1+\lvert v\rvert)$ | exactas salvo redondeo | Truncamiento nulo en campos lineales |
| T-05 | Orden de las diferencias centradas, T1, $h=0.1\to0.0125$ | $p\in[1.9,\,2.1]$ | 2.000 | Teoría: $p=2$ |
| T-06 | Rectitud, campo uniforme | desviación $\le10^{-12}L$ | 0 | RK4 es exacto para un campo constante |
| T-07 | Radio de la circunferencia, rotacional, $h=\Delta/8\approx0.0625$, una vuelta | $\lvert\rho-\rho_0\rvert/\rho_0\le10\cdot\tfrac{2\pi}{144}(h/\rho_0)^5$ (amplificación de RK4 por vuelta; para $\rho_0=1$: $4.1\times10^{-7}$) | $2.5\times10^{-8}$ ($\rho_0=1$) | La tolerancia fija de $10^{-6}$ no servía para $\rho_0=0.25$ (θ = h/ρ₀ cuatro veces mayor, error ∝ θ⁵); hallazgo de NUM-03 |
| T-08 | Cierre de órbita | motivo `ORBITA_CERRADA`; la línea termina exactamente en la semilla sin retroceder; longitud $=2\pi\rho_0$ (relativo $\le10^{-3}$) | error de posición $2.2\times10^{-7}$ | Umbral de cierre $h/2\approx0.03$, cinco órdenes por encima del error. La tolerancia era $\pm h$ hasta que NUM-03 midió un sobrepaso de la semilla (véase §2.1) |
| T-09 | Paso de hélice $\Delta z=2\pi a$ por vuelta, $a=\pm0.25$, $h\approx0.0625$ | relativo $\le10^{-5}$ | $8.0\times10^{-8}$ | Margen 125× |
| T-10 | Radio de la hélice | $\le10^{-6}$ | $2.3\times10^{-8}$ | Margen 40× |
| T-11 | Invariante $xy$ del campo silla, $h=0.0625$ | relativo $\le10^{-5}$ | $2.2\times10^{-7}$ | Margen 45× |
| T-12 | Orden de RK4 normalizado: arco $\sigma=1.5$ de la circunferencia, $h=0.3\to0.0375$ | $p\in[3.7,\,4.3]$ | 3.92 – 3.95 | Teoría: $p=4$. La **vuelta completa no sirve**: da 5.5 / 3.1 / 3.5 por cancelaciones entre fase y radio |
| T-13 | Orden de RK4 temporal: partículas en la silla, $t=1$, $\delta t=0.1\to0.025$ | $p\in[3.8,\,4.2]$ | 3.97 – 3.99 | Solución exacta $x_0e^t$, $y_0e^{-t}$ |
| T-14 | Partículas en la silla, $\delta t=0.01$, $t=1$ | relativo $\le10^{-8}$ | $8.3\times10^{-11}$ | Margen 120× |
| T-15 | Alineación radial, $\lvert\mathbf r\times\mathbf r_0\rvert/(\lvert\mathbf r\rvert\lvert\mathbf r_0\rvert)$ | $\le10^{-12}$ | — | La simetría la conserva salvo redondeo |
| T-16 | Recorte al borde de Ω (30 bisecciones) | distancia a la cara $\le10^{-9}\cdot$lado | — | $h/2^{30}\approx6\times10^{-11}$ |
| T-17 | Coherencia de flechas en la GPU (float32): dirección, longitud, color | $10^{-6}$ rad · $10^{-6}$ relativo · ±1/255 | — | $\varepsilon_{32}\approx1.2\times10^{-7}$; redondeo a 8 bits |
| T-18 | Rueda de paletas frente a partículas, rotacional ω = 1, 2 s simulados | $\lvert\Delta\theta\rvert\le10^{-3}$ rad | — | La rueda es analítica; las partículas, RK4 con $\delta t$ de fotograma |
| T-19 | Proyección tangencial, $\mathbf F_\parallel\cdot\mathbf n$ | $=0$ exacto | — | La normal es un eje coordenado: basta anular una componente |
| T-20 | Evaluación con `t` frente al oráculo (catálogo temporal, $t$ aleatorio en $[-10,10]$) | T-01 | — | Mismas operaciones; `t` se lee de una ranura |
| T-21 | $\partial\mathbf F/\partial t$ simbólica frente a la analítica | T-02 | — | Como T-02 |
| T-22 | Trayectorias no autónomas frente a la solución exacta (viento giratorio, lluvia, silla giratoria con ω > k, ω < k y ω = k), $\delta t=0.01$, $t\in[0,2\pi]$ | relativo $\le10^{-7}$ | medido en TMP-02 (§2.2) | Error global de RK4 $\propto\delta t^4$; margen ≥ 10× sobre lo medido |
| T-23 | Orden de RK4 no autónomo, $\delta t=0.1\to0.025$ | $p\in[3.8,\,4.2]$ | medido en TMP-02 | Teoría: $p=4$ |
| T-24 | Dilatación alrededor del ojo: posición en pantalla de 1000 puntos antes y después | $\le10^{-9}$ px | — | Invariancia proyectiva exacta (SPEC §3.11); solo redondeo |
| T-25 | Nodos de una ventana sin límites sobre la red de Ω | $\lvert x-(a+i\Delta)\rvert\le10^{-12}\,L$ | — | Desplazamientos por múltiplos enteros de $\Delta$ |
| T-26 | Línea de traza: partículas de una semilla sobre la línea de traza exacta (viento giratorio) | distancia $\le10^{-6}$ | — | Cada partícula es una trayectoria (T-22) |

> Los valores observados vienen del prototipo, no de la implementación. Al completar NUM-02,
> NUM-03 y NUM-05 se registran los errores **medidos en TypeScript** junto a estos. Una
> discrepancia de más de un orden de magnitud se investiga aunque la prueba pase.

### 2.1 Errores medidos en TypeScript (H3, 2026-10-02)

Salida `MEDIDA` de `npm test` (registro completo en `evidencia/NUM-02/` y `evidencia/NUM-03/`).
Ninguna medida se aparta más de un orden de magnitud de la calibración.

| # | Caso | Calibración (Python) | Medido (TypeScript) | Comentario |
| --- | --- | --- | --- | --- |
| T-03 | T1, 2000 puntos | $1.5\times10^{-10}$ | $1.45\times10^{-10}$ | Coincide |
| T-04 | Catálogo afín | exactas salvo redondeo | 0 | — |
| T-05 | Orden de las diferencias centradas | 2.000 | 2.000 / 2.000 / 2.000 | — |
| T-06 | Rectitud (3 direcciones) | 0 | ≤ $4.7\times10^{-16}$ | Redondeo |
| T-07 | Radio, $\rho_0=1$ | $2.5\times10^{-8}$ | $2.6\times10^{-8}$ | $\rho_0=0.25$: $2.5\times10^{-5}$ (tolerancia $4.3\times10^{-4}$) |
| T-08 | Cierre, $\rho_0=1$ | posición $2.2\times10^{-7}$ | posición $2.2\times10^{-7}$; longitud relativa $2.1\times10^{-7}$ | **Hallazgo**: antes del arreglo la línea sobrepasaba la semilla y volvía (retroceso de hasta $h/2$, longitud $+5.9\times10^{-2}$ con $\rho_0=1$). Ahora el paso que pasa junto a la semilla se sustituye por el tramo hasta ella (SPEC §5.7) |
| T-09 | Paso de hélice, $\rho_0=1$ | $8.0\times10^{-8}$ | $1.1\times10^{-7}$ | — |
| T-10 | Radio de hélice, $\rho_0=1$ | $2.3\times10^{-8}$ | $1.0\times10^{-7}$ | 4.4×: la prueba toma el máximo sobre ≈ 4 vueltas (el error crece por vuelta) y la calibración, una vuelta |
| T-11 | Invariante $xy$ | $2.2\times10^{-7}$ | $2.2\times10^{-7}$ | Coincide |
| T-12 | Orden de RK4 normalizado | 3.92 – 3.95 | 3.925 / 3.916 / 3.950 | Coincide |
| T-13 | Orden de RK4 en $t$ | 3.97 – 3.99 | 3.973 / 3.985 | Coincide |
| T-14 | Partículas, $\delta t=0.01$ | $8.3\times10^{-11}$ | $8.30\times10^{-11}$ | Coincide |
| T-15 | Alineación radial | — | $4.2\times10^{-16}$ | Redondeo |
| T-16 | Recorte al borde | $h/2^{30}\approx6\times10^{-11}$ | ≤ $4.7\times10^{-11}$ | — |

### 2.2 Errores medidos de la 1.1 (TMP-02, VAL-04, 2026-10-04)

Salida `MEDIDA` de `npx vitest run --silent=false` (registros en `evidencia/TMP-02/` y
`evidencia/VAL-04/`). Partida $\mathbf r_0=(0.6,-0.4,0.3)$, $t_0=0.3$, parámetros por defecto
salvo en la silla giratoria ($k=1$ y ω indicada).

| # | Caso | Tolerancia | Medido | Comentario |
| --- | --- | --- | --- | --- |
| T-22 | Viento giratorio, $\delta t=0.01$, hasta $t_0+2\pi$ | $10^{-7}$ | $1.0\times10^{-14}$ | $\mathbf F$ no depende de $\mathbf r$: RK4 se reduce a la regla de Simpson en $t$ |
| T-22 | Lluvia con ráfagas | $10^{-7}$ | $1.4\times10^{-11}$ | — |
| T-22 | Silla giratoria, ω = 1.5 > k (atrapada) | $10^{-7}$ | $1.8\times10^{-9}$ | El peor caso: margen 54× |
| T-22 | Silla giratoria, ω = 0.6 < k (escapa) | $10^{-7}$ | $9.2\times10^{-10}$ | Error relativo a la posición, que crece como $e^{\mu t}$ |
| T-22 | Silla giratoria, ω = k | $10^{-7}$ | $7.5\times10^{-10}$ | Caso degenerado $\mathbf q=(I+\tau M)\mathbf q_0$ |
| T-23 | Orden de RK4 no autónomo, $\delta t=0.1\to0.025$ | $p\in[3.8,4.2]$ | 3.96 – 4.00 en los cinco casos | Teoría: $p=4$ |
| T-24 | Dilatación alrededor del ojo, 1000 puntos, $\lambda\in[1/8,64]$ (`src/render/vuelo.test.ts`) | $10^{-9}$ px | $6.7\times10^{-13}$ px | Solo redondeo: la proyección no cambia (VL-01) |
| T-25 | Nodos de ventanas desplazadas hasta $10^3\,\Delta$ (`src/numerics/ventana.test.ts`) | $10^{-12}\,L$ | 0 | Exacto: los extremos se desplazan por múltiplos enteros de $\Delta$ (ALC-02) |
| T-26 | Línea de traza del viento giratorio, 6 partículas en vuelo (`src/numerics/tiempo.test.ts`) | $10^{-6}$ | $5.0\times10^{-11}$ | Cada partícula es una trayectoria (TMP-06) |

---

## 3. Pruebas matemáticas (V-MAT)

| ID | Prueba | Criterio |
| --- | --- | --- |
| V-MAT-01 | Catálogo nativo: J, div y rot analíticos; div = tr J; rot coherente con la parte antisimétrica de J; 1000 puntos por campo | T-02 |
| V-MAT-02 | Analizador, casos válidos (≥ 60): precedencia (`-x^2`, `2^3^2`), multiplicación implícita (`2x`, `3(x+1)`, `)(`), Unicode (`−`, `·`, `π`, griegas), `**`, decimales `.5`, exponentes `1e-3`, `r`, `rho` | Árbol igual al esperado (comparación estructural) |
| V-MAT-03 | Analizador, casos inválidos (≥ 40): sintaxis, desconocidos, aridad, función no permitida, `t` como nombre de parámetro, `xy`, vacío, incompletos (`x*(`, `sin(`, `2^`) | Código de error, posición y mensaje en español esperados; los incompletos se clasifican como `INCOMPLETA` |
| V-MAT-04 | Seguridad y límites: `constructor`, `__proto__`, `toString`, cadenas, corchetes, punto y coma, 501 caracteres, profundidad 65; *fuzzing* de 10 000 entradas aleatorias | Errores controlados; ninguna excepción no capturada; < 5 ms por entrada; ningún acceso a propiedades de objetos JS |
| V-MAT-05 | Evaluación compilada frente al oráculo: 6 campos del catálogo + T1–T6, 1000 puntos en Ω (y parámetros aleatorios en su rango) | T-01; mismo patrón de no finitos (NaN/±∞) en T2, T3 y T4 |
| V-MAT-06 | Ida y vuelta: `analizar(unicode(árbol)) ≡ árbol`; el TeX de todos los casos válidos se renderiza con KaTeX sin error | 100 % |
| V-MAT-07 | Derivadas simbólicas frente a las analíticas: catálogo, T1, T4 y T6 | T-02 |
| V-MAT-08 | Derivadas simbólicas frente a diferencias finitas en 500 expresiones aleatorias × 20 puntos (solo donde ambas son finitas y lejos de puntos angulosos) | T-03 |
| V-MAT-09 | Puntos no diferenciables: `abs(x)` en 0, `min(x,y)` con x = y, `atan2(y,x)` y `hypot(x,y)` en el origen | La derivada se declara «no definida»; nunca un valor de rama |
| V-MAT-10 | Formato numérico: cifras significativas, notación científica, «−», `0`, `≈ 0` | Tabla de casos con salida exacta |
| V-MAT-11 | **Tiempo en el lenguaje**: `t` se analiza como variable (también en `sin(w*t)`, `2t`, `t^2`); no puede declararse como parámetro; $\partial/\partial x_j$ de `t` es 0; $\partial/\partial t$ simbólica frente a diferencias finitas en $t$ en 300 expresiones aleatorias con `t` × 10 puntos; `x^t` (exponente temporal) se deriva con la regla general; TeX y Unicode escriben `t`; un campo sin `t` no depende del tiempo | Árbol esperado; T-02/T-03; `dependeDelTiempo` correcto |

## 4. Pruebas numéricas (V-NUM)

| ID | Prueba | Criterio |
| --- | --- | --- |
| V-NUM-01 | Diferencias finitas frente a valores analíticos: catálogo (T-04) y T1 en 2000 puntos (T-03) | T-03, T-04 |
| V-NUM-02 | Orden de convergencia de las diferencias centradas (T1, punto (0.7, −1.1, 0.4)) | T-05 |
| V-NUM-03 | **Uniforme**: líneas rectas paralelas a (a, b, c) para 3 valores de (a, b, c); terminan en `SALE_DOMINIO` | T-06, T-16 |
| V-NUM-04 | **Radiales**: semirrectas alineadas con la semilla. En el entrante, motivo `CERO` con distancia al origen $\le\varepsilon_{\text{stop}}F_{\text{ref}}/k+h$ | T-15 |
| V-NUM-05 | **Circunferencias** (rotacional, ω = 1 y ω = −1; ρ₀ ∈ {0.25, 1, 1.9}): radio conservado, $z$ constante ($\le10^{-12}$), sentido antihorario visto desde +z si ω > 0, cierre. Semillas sobre el eje → descartadas como ≈ 0 | T-07, T-08 |
| V-NUM-06 | **Hélices** (a = ±0.25; ρ₀ ∈ {0.5, 1, 2}): paso, radio, quiralidad (signo de $\dot\theta\,\dot z$ igual al de a), longitud por vuelta $2\pi\sqrt{\rho_0^2+a^2}$ (relativo $\le10^{-5}$) | T-09, T-10 |
| V-NUM-07 | **Silla**: invariante $xy$ a lo largo de cada línea; las líneas sobre $y=0$ y $x=0$ siguen las separatrices | T-11 |
| V-NUM-08 | **Convergencia RK4**: orden observado en σ (circunferencia, arco 1.5) y en $t$ (silla) | T-12, T-13 |
| V-NUM-09 | **Criterios de parada**: un caso diseñado por motivo: `SALE_DOMINIO` (uniforme), `CERO` (radial entrante), `NO_DEFINIDO` (T3 integrando hacia $x<0$), `ORBITA_CERRADA` (rotacional), `LONGITUD_MAX` (helicoidal con dominio alto en $z$), `PASOS_MAX` ($L_{\max}$ enorme), `ESTANCADA` ($(-x/\lvert x\rvert,\,0,\,0)$, discontinuidad de dirección con ‖F‖ = 1); y un zigzag donde el campo es casi nulo ($(-\tanh(1000x),\,10^{-3},\,0)$) se clasifica como `CERO` | Motivo esperado en el 100 % de los casos; ninguna línea atraviesa un nodo no definido |
| V-NUM-10 | Malla: coordenadas exactas de los nodos; el origen es nodo con N impar y Ω simétrico; centros de celda correctos; N por eje | Igualdad exacta |
| V-NUM-11 | $F_{\text{ref}}$: P95 y redondeo a {1, 1.5, 2, 2.5, 3, 4, 5, 6, 8} × 10ᵏ en 10 casos calculados a mano; exclusión de no definidos; campo nulo → 1 con aviso | Igualdad exacta |
| V-NUM-12 | Semillas: misma semilla → mismos puntos (bit a bit); descarte y recuento en nodos ≈ 0 o no definidos; límite de 256 | Igualdad exacta y recuentos |
| V-NUM-13 | Partículas: frente a la solución exacta en la silla; rapidez $=\lVert\mathbf F\rVert$ (relativo $\le10^{-12}$ en la primera etapa); renacen al salir, al llegar a ≈ 0 o a un punto no definido | T-13, T-14 |
| V-NUM-14 | Corte: $\mathbf F_\parallel\cdot\mathbf n=0$; $F_n$, div, rot·n y \|F\| en el plano iguales a la evaluación directa; $V_{\text{ref}}$ simétrico | T-19, T-01 |
| V-NUM-15 | Singularidades: T2 con un nodo en el origen → no definido y excluido de $F_{\text{ref}}$; líneas que se acercan al origen se detienen con `NO_DEFINIDO`; `tan` cerca de $\pi/2$ → singular por magnitud > $F_{\max}$ | Clasificación correcta |
| V-NUM-17 | **Trayectorias no autónomas** frente a las soluciones exactas de SPEC §4.9 y orden de convergencia | T-22, T-23 |
| V-NUM-18 | **Líneas de corriente instantáneas**: con $t=t^*$, iguales bit a bit a las del campo «congelado» (las expresiones con `t` sustituido por el número $t^*$); en el viento giratorio, rectas de dirección $(\cos\omega t^*,\sin\omega t^*,0)$ | Igualdad exacta; T-06 |
| V-NUM-19 | **$F_{\text{ref}}$ en la ventana**: P95 de los 9 instantes; independiente del $t$ mostrado; un campo $t\,(x,y,z)$ en $[0,2]$ conserva su escala y sus flechas crecen con $t$ | Igualdad exacta |
| V-NUM-20 | **Líneas de traza**: partículas emitidas desde una semilla del viento giratorio sobre el arco exacto; espera escalonada; las que esperan no se dibujan | T-26 |
| V-NUM-21 | **Semillas ancladas** y ventanas: dos ventanas desplazadas por $\mathbf m\Delta$ comparten exactamente las semillas de su intersección; nodos sobre la red; `m` = redondeo de $(c^{\text{cám}}-c)/\Delta$ | Igualdad exacta; T-25 |
| V-NUM-22 | **Vuelo y dilatación**: dirección desde azimut y elevación (y vuelta); elevación acotada a ±89°; W avanza según la dirección horizontal y vertical de la vista; dilatación alrededor del ojo invariante en pantalla; alrededor de $\mathbf c$, homotecia exacta; velocidad $v/\lambda$ | T-24; igualdad a $10^{-12}$ |
| V-NUM-16 | Derivadas no finitas: `sqrt(x)` en $x=0$ → «no acotada (∞)»; `sqrt(x)^2` en $x=0$ (forma $0\cdot\infty$) → diferencia unilateral = 1 (±10⁻⁶) con método «numérica»; sin lado válido → «no definida» | Valor y método informados correctos |

## 5. Pruebas funcionales y de coherencia (V-FUN)

| ID | Prueba | Criterio de aceptación |
| --- | --- | --- |
| V-FUN-01 | **Elegir campo**: las 6 tarjetas | Fórmula, flechas, leyenda y semillas del campo; tarjeta marcada con borde + ✓ + `aria-checked`; cámara sin cambios |
| V-FUN-02 | **Editar ecuaciones** | Válida → aplicada ≤ 300 ms tras la última tecla. `x*(` con foco → «Incompleta» sin error. Tras salir del campo → error con posición y aviso «Mostrando el último campo válido». `k*x` sin declarar → botón «Añadir como parámetro» que lo crea. Esc → último valor válido |
| V-FUN-03 | **Parámetros**: rotacional, ω → 2 | Inspector en (1, 0, 0) muestra F = (0, 2, 0) y \|F\| = 2; la leyenda actualiza $F_{\text{ref}}$ (auto); «Restablecer valor» → ω = 1 y valores originales; rango y paso editables; «Eliminar» deshabilitado (con motivo) mientras se usa |
| V-FUN-04 | **Equilibrios** | Marcas ≈ 0 exactamente en los nodos del eje z (rotacional, silla), en el origen (radiales) y en ninguno (helicoidal, a = 0.25); con a = 0 aparecen en el eje |
| V-FUN-05 | **Coherencia flecha–leyenda** en 20 nodos por campo | Dirección, longitud y color de instancia = F y la rampa según la leyenda (T-17); la marca máxima de la leyenda = $F_{\text{ref}}$ calculada |
| V-FUN-06 | **Coherencia del inspector** en puntos de tabla (SPEC §4.8): p. ej. rotacional ω = 1 en (1, 0, 0) → F = (0, 1, 0), \|F\| = 1, div = 0, rot = (0, 0, 2); radial saliente k = 1 en (1, 2, 2) → \|F\| = 3, div = 3 | Valores mostrados = valores de tabla formateados; método «analíticas» |
| V-FUN-07 | **Cortes**: XY, XZ e YZ; posición; etiqueta; T6 con «Escalar: div F» | Plano en la posición indicada; etiqueta «x = −0.50» correcta; a la izquierda de $x=-0.5$, patrón de **rayado** y glifos «−»; a la derecha, **puntos** y «+»; contorno discontinuo en $x=-0.5$ (±1 celda de la textura) |
| V-FUN-08 | **Rueda frente a partículas**: rotacional ω = 1, reloj determinista, 2 s | Ángulo de la rueda = ángulo recorrido por una partícula (T-18); rótulo «ω = 1.000 rad/t» |
| V-FUN-09 | **Restablecer** cámara, parámetros y experimento; **Deshacer** | Cada acción produce su estado esperado; «Deshacer» restaura exactamente el estado previo (igualdad profunda) |
| V-FUN-10 | **JSON**: exportar → importar | Igualdad profunda del estado y captura de la escena idéntica píxel a píxel. Casos inválidos (malformado, `formato` ajeno, versión futura, rango fuera de límites, expresión de 501 caracteres, archivo de 300 KB) → errores listados por campo y **estado intacto** |
| V-FUN-11 | **Autoguardado** | Recargar recupera el experimento y muestra el aviso; «Empezar de cero» lo descarta; con `localStorage` bloqueado la aplicación funciona y no muestra errores técnicos |
| V-FUN-12 | **PNG** en los 3 tamaños y 3 contenidos | Dimensiones exactas; auditoría de paleta superada; leyenda presente cuando se pide; desviación típica de luminancia > 0 (no vacía); nombre de archivo según SPEC §7.1 |
| V-FUN-13 | **Capas** con interruptores y atajos | Capa visible ↔ entrada de la leyenda; atajos inactivos dentro de campos de texto |
| V-FUN-14 | **Dominio y densidad** | N = 21 → 9261 instancias; límites inválidos rechazados con mensaje; la caja, los ejes y el corte se adaptan; la cámara se reencuadra |
| V-FUN-15 | **Estados de pantalla** | Sin WebGL2 → estado vacío explicativo; todo indefinido → estado vacío con sugerencias; campo nulo → aviso; cálculo de > 300 ms → progreso y «Cancelar» que funciona |
| V-FUN-16 | **Robustez**: 200 ediciones aleatorias rápidas (expresiones, parámetros, dominio); en el proyecto «rendimiento» por su medida de tiempo (D-79) | 0 errores en consola; 0 excepciones no capturadas; la interfaz responde al final (< 1 s) |
| V-FUN-18 | **Vista libre**: entrar con el botón y con V | Barra superior, panel, leyenda, inspector, barra de la escena, triedro, notificaciones y mensajes **no visibles** (ni enfocables); el lienzo ocupa toda la ventana; W/S/A/D/E/Q, flechas y arrastre mueven la cámara en el sentido esperado; F/L/P/C/G y Espacio funcionan; Esc y V salen y restauran exactamente la pose, la proyección (también si era ortográfica) y la interfaz, con el foco en el botón de origen; axe sin infracciones al salir |
| V-FUN-19 | **Dilatación**: + y − en la vista libre | λ ×1.25 / ÷1.25 dentro de [1/8, 64]; con la caja, la imagen crece alrededor del centro de Ω; sin límites, la imagen no cambia y la velocidad en unidades del campo se divide por λ; indicador transitorio con λ |
| V-FUN-20 | **Espacio sin límites**: U en la vista libre y avanzar 10 Δ | La ventana cambia por múltiplos de Δ; $F_{\text{ref}}$ no cambia; la flecha de un nodo común es idéntica antes y después; sin caja; partículas sin recrear (las que siguen dentro conservan su posición) |
| V-FUN-21 | **Ampliar y estrechar** Ω | [−2, 2]³, N = 9 → «Ampliar» → [−4, 4]³, N = 17, Δ = 0.5; otra vez → [−8, 8]³, N = 21, Δ = 0.8 con aviso; «Estrechar» deshace; límites de lado (0.1–1000) respetados con motivo |
| V-FUN-22 | **Tiempo**: viento giratorio y `P = t*x` | Sección «Tiempo» habilitada; mover $t$ cambia las flechas y la lectura; Espacio avanza $t$ con el reloj determinista; una partícula recorre una circunferencia de radio $V/\omega$ (±10⁻³ con el reloj de fotogramas) mientras las líneas de corriente son rectas; inspector con $t$, $\partial\mathbf F/\partial t$ y $D\mathbf F/Dt$ correctos; leyenda con el $t$ de las líneas; campo sin `t` → sección informativa |
| V-FUN-23 | **JSON v2**: exportar → importar; abrir un v1 | Igualdad profunda; un v1 se abre con los valores por defecto de la 1.1 y solo el aviso «Convertido de la versión 1 a la 2»; `tiempo.inicio ≥ fin` o `exploracion.escala` fuera de rango → errores listados y estado intacto |
| V-FUN-17 | **HTML autocontenido** abierto con `file://` en Chromium con la red cortada | 0 peticiones de red; 0 errores en consola; *worker* activo (o respaldo anunciado); escena, edición, inspector y exportaciones operativos; tamaño ≤ 3 MB |

---

## 6. Rendimiento (V-PERF)

### 6.1 Equipos

| Equipo | Descripción | Qué se mide |
| --- | --- | --- |
| **R1** (referencia) | El equipo del usuario: **Intel Core i9, NVIDIA RTX 4060, monitor de 144 Hz** (D-20). Se registran además RAM, sistema operativo, navegador y versión, resolución y `devicePixelRatio` | FPS y latencias |
| **C0** (integración) | Este contenedor: 4 vCPU, 15 GiB, **sin GPU**, Chromium 1194 sin interfaz con SwiftShader | Solo métricas de CPU: tiempos de cálculo y tareas largas. **Los FPS de C0 no cuentan** |

### 6.2 Escenas reproducibles

| Escena | Configuración (archivo en `tests/fixtures/perf-*.json`) |
| --- | --- |
| **PERF-A** (típica) | Helicoidal, a = 0.25; Ω = [−2,2]³; N = 15 (3375 flechas); 128 semillas en rejilla XZ 16 × 8; $h=\Delta/8$; corte XY en z = 0 con M = 41 y «Escalar: div F»; 1000 partículas; ventana de 1920×1080; órbita guionizada de 360° en 10 s |
| **PERF-B** (máxima) | Igual con N = 21 (9261), 256 semillas, M = 61, 2000 partículas |
| **PERF-C** (interacción) | Rotacional; arrastre guionizado de ω con 60 valores en 3 s; flechas + líneas (48 semillas) |

### 6.3 Método

```bash
npm run build
npm run perf -- --escena=PERF-A --equipo=C0     # en este entorno (solo CPU)
```

En R1 no hace falta Node: se abre `campos-vectoriales.html?perf=PERF-A` en Chrome, se pulsa
«Iniciar medición» y se descarga el JSON del informe.

1. La aplicación carga la escena reproducible indicada en `?perf=`.
2. Calentamiento de 2 s; después se miden **600 fotogramas** con los intervalos de
   `requestAnimationFrame`: p50, p95, p99 y % de fotogramas > 33 ms.
3. Tiempos de cálculo con `performance.now()` dentro del *worker*: mediana de 10 repeticiones
   por trabajo (malla, corte, líneas).
4. `PerformanceObserver('longtask')` en el hilo principal durante PERF-C.
5. Se guarda `evidencia/VAL-03/<fecha>-<equipo>-<escena>.json` con los metadatos del equipo
   (`userAgent`, `hardwareConcurrency`, `WEBGL_debug_renderer_info`, DPR, tamaño).
6. Condiciones en R1: con ventana, sin otras pestañas pesadas, conectado a la corriente, tres
   ejecuciones; se informa la **mediana** de las tres.

### 6.4 Objetivos

| ID | Métrica | Objetivo |
| --- | --- | --- |
| V-PERF-01 | PERF-A en R1, p95 del intervalo entre fotogramas | ≤ 7.5 ms (cadencia de 144 Hz sostenida) |
| V-PERF-02 | PERF-B en R1, p95 del intervalo entre fotogramas | ≤ 10 ms (≥ 100 fps) |
| V-PERF-03 | Cálculo (R1 y C0): malla 15³ · corte 41² con derivadas · líneas PERF-A · líneas PERF-B | ≤ 30 ms · ≤ 40 ms · ≤ 250 ms · ≤ 1 s (con progreso) |
| V-PERF-04 | PERF-C: tareas largas en el hilo principal; latencia de actualización de flechas | 0 tareas > 50 ms; p95 ≤ 50 ms |
| V-PERF-05 | *Benchmark* de evaluación (Node, C0): cierres compilados frente a funciones nativas | Se registra la proporción (objetivo ≤ 3×); es informativo |
| V-PERF-06 | Arranque hasta interfaz interactiva (HTML autocontenido desde disco, R1) | ≤ 1.5 s |
| V-PERF-07 | Regresión en C0 | Ningún tiempo de cálculo empeora > 30 % respecto al último registro |

Si R1 no alcanza un objetivo, la primera medida es **ajustar los valores por defecto**
(densidad, partículas, DPR) y documentarlo en STATUS. Las optimizaciones de código vienen
después.

---

## 7. Revisión visual

### 7.1 Tamaños de pantalla

| ID | Tamaño (CSS px) | DPR | Papel |
| --- | --- | --- | --- |
| V1 | 1920 × 1080 | 1 | Escritorio grande |
| V2 | 1440 × 900 | 2 | Portátil de alta densidad; **referencia de composición** |
| V3 | 1280 × 720 | 1 | Mínimo de soporte completo |
| V4 | 1024 × 768 | 1 | Degradado |
| V5 | 390 × 844 | 3 | Consulta (móvil) |

### 7.2 Capturas

| ID | Escena |
| --- | --- |
| C1 | Estado inicial: Helicoidal, flechas + líneas |
| C2 | Helicoidal con líneas y partículas (pausadas, reloj fijo) |
| C3 | T6 `(x^2, y, 0)` con corte XY y «Escalar: div F» |
| C4 | Rotacional con inspector en (1, 0, 0) y rueda de paletas |
| C5 | Error en ecuación (`Q = x*(` tras salir del campo) + aviso de escena |
| C6 | Cajón de ayuda abierto en «Divergencia» |
| C7 | Radial saliente con densidad máxima 21³ |
| C8 | Galería de controles (`?muestras`) con todos los estados |
| C9 | Diálogo de exportación PNG |
| C10 | Estado vacío: `P = sqrt(-1-x^2)` |
| C11 | Rotacional con «Glifos: rot F» y corte con «rot F · n» |
| C12 | Movimiento reducido + foco visible en la escena |
| C13 | Lluvia con ráfagas: flechas, líneas instantáneas y partículas (reloj fijo, t = 2) |
| C14 | Vista libre dentro del helicoidal (sin interfaz) |
| C15 | Viento giratorio con la sección «Tiempo» abierta, líneas rectas y partículas en circunferencias |

Matriz obligatoria: **C1–C15 × V1–V3**. Además, V4: C1, C2, C4, C6. V5: C1, C4.

### 7.3 Comprobaciones (VV)

| ID | Aspecto | Comprobación automática | Comprobación manual | Criterio |
| --- | --- | --- | --- | --- |
| VV-01 | **Paleta monocroma** | Auditoría de cada PNG y de cada exportación | Ningún gris «tintado» por el monitor (contraste con la auditoría) | 100 % de píxeles con max(\|R−G\|, \|G−B\|, \|R−B\|) ≤ 3 |
| VV-02 | **Jerarquía tipográfica** | Recorrido del DOM: tamaños calculados ∈ {11, 12, 13, 14, 16} px (+ KaTeX); pesos ∈ {400, 500, 600}; familias ∈ {Inter, JetBrains Mono, KaTeX_*} | Orden de lectura del panel: Campo → Ejemplos → Ecuaciones → Parámetros; títulos distinguibles sin color | Sin valores fuera de la escala; revisión superada |
| VV-03 | **Contraste y legibilidad** | axe `color-contrast`; *script* de tokens; píxel central de la flecha más débil frente a su halo | Lectura a 60 cm en V3 | 0 violaciones; ≥ 3:1 en la escena |
| VV-04 | **Alineación y espaciado** | Bordes izquierdos de las etiquetas del panel a 16 px (±0.5); separaciones verticales múltiplos de 4 | Retícula de 4 px superpuesta (`?reticula=1`) | Sin desviaciones |
| VV-05 | **Claridad de la escena** | Longitud proyectada del cono ≥ 6 px en ≥ 95 % de las flechas de la mitad delantera legibles por su geometría: ‖F‖ ≥ 20 % F_ref y a más de 30° del rayo de vista (C1, V2; revisado, D-37) | Muestra de 20 flechas en C1: sentido identificable en ≥ 19; líneas distinguibles de flechas; corte y P identificables tras leer la leyenda una vez; en C7, puntas identificables en la mitad delantera | Todos los puntos superados |
| VV-06 | **Densidad de los paneles** (revisado en REV-02, D-33, y en REV-05, D-78) | Con el experimento inicial: secciones 1–4 enteras sin desplazar en V2 (con ≤ 3 parámetros; desde la 1.1 también «Tiempo»); en V3, secciones 1–3 enteras y el título de «Parámetros» visible (en la 1.0, 1–4 enteras) (`auditarDensidad`) | ≤ 25 elementos interactivos visibles en reposo en el panel, en V2 y V3 (D-61); cada uno con una función clara | Ambos superados |
| VV-07 | **Estados de interacción** | En C8: anillo de foco ≥ 2 px y ≥ 3:1; deshabilitados con motivo en la descripción emergente | Cada estado se distingue por una señal no tonal (DESIGN §7) | Todos superados |
| VV-08 | **Sin recortes, solapamientos ni desplazamientos innecesarios** | `scrollWidth ≤ innerWidth`; cajas de leyenda, inspector, barra de escena, triedro, avisos y notificaciones sin intersección; ningún texto desbordado sin descripción emergente; solo el panel y la ayuda pueden desplazarse | Revisión de los bordes de cada región | 0 incidencias |
| VV-09 | **Codificación científica** | Entradas de la leyenda = capas visibles | Matriz de VIS-05 (cada fila de DESIGN §9.1) | 100 % de filas superadas |
| VV-10 | **Movimiento reducido** | Con `reducedMotion: 'reduce'`: `document.getAnimations()` vacío tras interactuar; partículas en pausa al inicio; la cámara salta | — | Superado |

### 7.4 Plantilla de informe manual (`evidencia/REV-xx/informe.md`)

```markdown
# REV-xx · <título>
- Fecha · commit · navegador · tamaño(s)
## Resultados
| VV | Captura | Resultado (OK / Incidencia) | Nota |
## Incidencias
| # | Descripción | Captura y zona | Severidad (bloquea / mejora) | Acción | Recapturada |
## Conclusión
Superada / no superada, y motivo.
```

### 7.5 Capturas de referencia

- `toHaveScreenshot` con `threshold: 0.1` y `maxDiffPixelRatio: 0.001` para la interfaz;
  0.005 para regiones con escena (antialiasing por software).
- Las referencias **solo son válidas en Linux con Chromium 1194** (la documentación de
  Playwright advierte que el renderizado depende del sistema y del navegador). En otros
  equipos, la revisión visual es la manual de §7.3.

---

## 8. Accesibilidad (V-A11Y)

| ID | Prueba | Criterio |
| --- | --- | --- |
| V-A11Y-01 | axe-core en C1, C4, C6, C8 y con la ayuda y los diálogos abiertos | 0 violaciones de impacto *serious* o *critical* |
| V-A11Y-02 | Guion de teclado: cada RF se completa sin ratón (elegir campo, editar, parámetro, capa, corte, inspeccionar por coordenadas, restablecer, exportar, abrir, ayuda) | 100 % de pasos completados |
| V-A11Y-03 | Foco visible en cada elemento enfocable | Contorno ≥ 2 px, contraste ≥ 3:1, nunca tapado por una tarjeta flotante |
| V-A11Y-04 | Lector de pantalla (NVDA + Firefox o VoiceOver + Safari, en el equipo del usuario) | Nombres, roles y estados correctos; resultados de cálculo y errores anunciados |
| V-A11Y-05 | Zoom al 200 % en V3 | Sin pérdida de funciones; cambia al punto de ruptura inferior |
| V-A11Y-06 | Tamaño de los objetivos de puntero | ≥ 24 × 24 px en todos |

---

## 9. Evidencia

- Ruta: `evidencia/<ID-de-tarea>/`.
- Contenido según la tarea: `registro.txt` (comandos y salidas, con fecha y commit), PNG,
  JSON de auditorías y rendimiento, `informe.md` de revisión manual.
- Una tarea pasa a **«Completada y verificada»** solo cuando STATUS.md enlaza su evidencia y
  el commit verificado.
- Las capturas de evidencia se guardan en PNG optimizado; si el volumen crece, se conservan
  las de la última revisión de cada hito.

## 10. Trazabilidad

| Requisito | Validación | Tareas |
| --- | --- | --- |
| RF-01 Catálogo | V-MAT-01, V-MAT-05, V-FUN-01, V-FUN-04 | MAT-01, MAT-05, UI-01 |
| RF-02 Expresiones | V-MAT-02…06 | MAT-02, MAT-03, UI-02 |
| RF-03 Validación en vivo | V-MAT-03, V-FUN-02 | MAT-02, UI-02, UI-07 |
| RF-04 Parámetros | V-FUN-03 | UI-03 |
| RF-05 Dominio y densidad | V-NUM-10, V-FUN-14 | NUM-01, UI-04 |
| RF-06 Flechas | V-FUN-05, VV-05, VV-09 | REN-02, REN-04 |
| RF-07 Líneas de corriente | V-NUM-03…09, V-NUM-12 | NUM-03, NUM-04, REN-03 |
| RF-08 Inspector | V-FUN-06 | INS-01, INS-02, INS-03 |
| RF-09 Magnitud | V-NUM-11, V-FUN-05 | NUM-01, VIS-04, REN-04 |
| RF-10 Cortes | V-NUM-14, V-FUN-07 | NUM-06, REN-05 |
| RF-11 Div y rot | V-MAT-07, V-NUM-01, V-FUN-07, V-FUN-08 | MAT-04, NUM-02, REN-06, REN-07, UI-08 |
| RF-12 Partículas | V-NUM-13, V-FUN-08, VV-10 | NUM-05, REN-08 |
| RF-13 Cámara | V-FUN-09, V-A11Y-02 | REN-01, UI-05 |
| RF-14 PNG | V-FUN-12 | EXP-03 |
| RF-15 JSON y recuperación | V-FUN-10, V-FUN-11 | EXP-01, EXP-02 |
| RF-16 Restablecer | V-FUN-09 | UI-05 |
| RF-17 Ayuda | V-A11Y-02, captura C6 | UI-06 |
| RF-18 Estados | V-FUN-15, capturas C5 y C10 | UI-07 |
| RF-19 Teclado | V-A11Y-02, V-A11Y-03 | A11Y-01 |
| RNF-01 Monocromo | VV-01 | VIS-01, FND-02, REV-01…04 |
| RNF-02 Contraste | VV-03, V-A11Y-01 | VIS-01 |
| RNF-03/04 Rendimiento y fluidez | V-PERF-01…07 | CMP-02, VAL-03 |
| RNF-05 Sin conexión | VIS-01 (registro de red) | VIS-01 |
| RNF-06 Seguridad | V-MAT-04, V-FUN-10 | MAT-02, EXP-01 |
| RNF-09 Movimiento reducido | VV-10 | A11Y-02, REN-08 |
| RNF-10 Robustez | V-FUN-16, V-MAT-04 | VAL-02 |
| RNF-12 Mantenibilidad | Lint de fronteras, cobertura | FND-01, VAL-01 |
| RNF-13 Pantallas | VV-06, VV-08 (V1–V5) | VIS-06 |
| RF-20 Vista libre | V-FUN-18, V-NUM-22, C14 | VL-01, VL-02 |
| RF-21 Alcance | V-FUN-21 | ALC-01 |
| RF-22 Espacio sin límites | V-NUM-21, V-FUN-20 | ALC-02 |
| RF-23 Dilatación | V-NUM-22, V-FUN-19 | VL-01, VL-02 |
| RF-24 Tiempo | V-MAT-11, V-NUM-17 … V-NUM-19, V-FUN-22, C13, C15 | TMP-01 … TMP-05 |
| RF-25 Líneas de traza | V-NUM-20 | TMP-06 |
| RF-26 Catálogo temporal | V-MAT-05, V-MAT-07, V-NUM-17 | TMP-03 |
| RF-27 JSON v2 | V-FUN-23 | TMP-04 |
