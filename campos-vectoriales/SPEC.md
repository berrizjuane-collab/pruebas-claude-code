# SPEC — Laboratorio de campos vectoriales 3D

> Especificación funcional, matemática y computacional.
> Documentos hermanos: [DESIGN.md](DESIGN.md) (dirección visual) · [PLAN.md](PLAN.md)
> (arquitectura, hitos y checklist) · [VALIDATION.md](VALIDATION.md) (pruebas) ·
> [STATUS.md](STATUS.md) (estado, decisiones y riesgos).
>
> Estado del documento: **aprobado** (1.0, 2026-10-02) · **versión 1.1 en curso** (H10,
> 2026-10-04): vista libre inmersiva, alcance y dilatación del espacio y campos dependientes
> del tiempo (§2.5, §3.10, §3.11, §4.9, §5.11, §7.2).

---

## 1. Visión

Un **laboratorio virtual en el navegador** para explorar campos vectoriales

$$\mathbf F(x,y,z) = \big(P(x,y,z),\; Q(x,y,z),\; R(x,y,z)\big)$$

y comprender cómo cambian su **dirección**, su **magnitud** y su **estructura espacial**
(fuentes, sumideros, giros, ejes de equilibrio, sillas) al modificar las ecuaciones y los
parámetros.

Tres compromisos guían todas las decisiones:

1. **Rigor matemático.** Lo que se dibuja se deriva de definiciones explícitas, con errores
   numéricos acotados y comprobados frente a resultados analíticos. Cuando la imagen
   simplifica (escalado de flechas, saturación, muestreo), la interfaz lo dice.
2. **Utilidad educativa.** Cada capa responde a una pregunta concreta («¿hacia dónde?»,
   «¿cuánto?», «¿sale o entra?», «¿gira?») y la ayuda explica qué significa y qué *no*
   significa.
3. **Calidad de diseño.** Interfaz minimalista y **estrictamente monocromática** (negros,
   blancos y grises neutros), donde el campo es el protagonista.

Idioma: **español** en interfaz, mensajes, ayuda y documentación.

### 1.1 Público y contexto de uso (supuestos)

- **Público principal:** estudiantes universitarios de cursos superiores y **expertos**
  (docentes, investigadores, ingenieros) que dominan el cálculo vectorial. La ayuda es
  concisa y rigurosa; la interfaz expone detalles técnicos (jacobiana y sus autovalores,
  método numérico, pasos y tolerancias). Decisión del usuario, 2026-10-02 (S-01).
- **Plataforma:** navegador de escritorio moderno, ratón o panel táctil, teclado. Pantallas
  de 1280×720 o más. Las pantallas pequeñas se tratan en §9.
- **Sin servidor:** todo se calcula en el navegador. No hay cuentas ni datos personales.

### 1.2 Notación

| Símbolo | Significado |
| --- | --- |
| $\mathbf r = (x,y,z)$ | punto del espacio, coordenadas cartesianas |
| $\mathbf F = (P,Q,R)$ | campo vectorial |
| $\lVert\mathbf F\rVert$ | norma euclídea (magnitud) |
| $\hat{\mathbf F} = \mathbf F/\lVert\mathbf F\rVert$ | dirección unitaria (si $\mathbf F\neq\mathbf 0$) |
| $J = D\mathbf F$ | matriz jacobiana, $J_{ij} = \partial F_i/\partial x_j$ |
| $\nabla\cdot\mathbf F$, div | divergencia |
| $\nabla\times\mathbf F$, rot | rotacional |
| $\Omega$ | dominio de visualización (caja) |
| $D$ | dominio de definición del campo |
| $\Delta$ | separación de la malla de muestreo |
| $F_{\text{ref}}$ | magnitud de referencia de la escala visual |
| $\rho = \sqrt{x^2+y^2}$ | distancia al eje $z$ |

Separador decimal: **punto** (`1.5`), coherente con la entrada de expresiones, donde la coma
separa argumentos (`atan2(y, x)`). La Ortografía de la RAE (2010) admite el punto decimal.
Decisión D-09.

---

## 2. Alcance y prioridades

Prioridades: **P0** = imprescindible para la versión 1.0. **P1** = incluido en la 1.0, pero
recortable si compromete la solidez del resto (se documentaría en STATUS.md).

### 2.1 Versión inicial obligatoria (v1.0)

| ID | Requisito | Prior. |
| --- | --- | --- |
| RF-01 | **Catálogo** de seis campos predefinidos (§4), con parámetros, ficha educativa y semillas recomendadas. | P0 |
| RF-02 | **Edición de P, Q, R** mediante expresiones con gramática y lista blanca de funciones (§5.2). | P0 |
| RF-03 | **Validación en vivo** en español: posición del error, sugerencias, vista previa tipográfica de la expresión interpretada, estado «incompleta» mientras se escribe. | P0 |
| RF-04 | **Parámetros** con nombre: deslizador y entrada numérica, rango y paso editables, valor por defecto restaurable. Máximo 8. | P0 |
| RF-05 | **Dominio y densidad**: caja $\Omega$ configurable y número de nodos por eje (3–21). | P0 |
| RF-06 | **Flechas**: sentido, magnitud por longitud y luminancia, modo proporcional o normalizado, escala automática o fija, marcas de saturación, de $\mathbf F\approx\mathbf 0$ y de punto no definido. | P0 |
| RF-07 | **Líneas de corriente**: RK4, integración en ambos sentidos, tres estrategias de semillas, criterios de parada explícitos, marcas de sentido. | P0 |
| RF-08 | **Inspector de punto**: $\mathbf F$, $\lVert\mathbf F\rVert$, $\hat{\mathbf F}$, $J$ y sus autovalores, div, rot, helicidad $\mathbf F\cdot(\nabla\times\mathbf F)$, método de derivación e interpretación textual. Selección con clic o por coordenadas. | P0 |
| RF-09 | **Visualización de magnitud** con leyenda numérica siempre visible y $F_{\text{ref}}$ explícita. | P0 |
| RF-10 | **Cortes** en planos XY, XZ e YZ con posición ajustable: flechas del corte, proyección tangencial y componente normal. | P0 |
| RF-11 | **Divergencia y rotacional**: expresiones simbólicas, valores en el inspector, mapa escalar sobre el corte (div, $(\nabla\times\mathbf F)\cdot\mathbf n$, $\mathbf F\cdot\mathbf n$, $\lVert\mathbf F\rVert$), capa de glifos de rotacional y rueda de paletas en el punto inspeccionado. | P0 |
| RF-12 | **Partículas trazadoras** animadas ($\dot{\mathbf r}=\mathbf F$), con pausa. | P1 |
| RF-13 | **Cámara**: órbita, zoom, desplazamiento, vistas XY/XZ/YZ/isométrica, perspectiva u ortográfica, restablecer. | P0 |
| RF-14 | **Exportar imagen PNG**: escena sola o con leyenda y ecuaciones; tamaño de pantalla, 1920×1080 o 3840×2160. | P0 |
| RF-15 | **Exportar e importar configuración** JSON versionada; recuperación automática de la última sesión. | P0 |
| RF-16 | **Restablecer** cámara, parámetros o experimento completo, con «Deshacer» temporal. | P0 |
| RF-17 | **Ayuda matemática** en panel desplegable: conceptos, sintaxis, atajos; accesos contextuales «?». | P0 |
| RF-18 | **Estados**: carga, cálculo en curso, error, aviso, éxito, ausencia de datos. | P0 |
| RF-19 | **Teclado**: toda función accesible sin ratón; atajos documentados. | P0 |

Requisitos no funcionales:

| ID | Requisito |
| --- | --- |
| RNF-01 | **Monocromo estricto**: todo píxel de la interfaz, la escena y las exportaciones cumple R = G = B (tolerancia de ±3/255 por suavizado). |
| RNF-02 | **Contraste WCAG 2.2 AA**: texto ≥ 4.5:1 (≥ 3:1 si es grande); componentes y gráficos esenciales ≥ 3:1. |
| RNF-03 | **Rendimiento** en el equipo de referencia: ver objetivos en VALIDATION.md §6. |
| RNF-04 | **Fluidez**: el cálculo pesado se hace en un *Web Worker*; ninguna tarea del hilo principal supera 50 ms durante la interacción. |
| RNF-05 | **Sin conexión en ejecución**: sin CDN, sin fuentes remotas, sin telemetría. |
| RNF-06 | **Seguridad**: nunca `eval`/`new Function`; límites de longitud y profundidad; CSP restrictiva. |
| RNF-07 | **Idioma**: todo en español; textos centralizados en un único módulo. |
| RNF-08 | **Navegadores**: Chrome/Edge y Firefox (dos últimas versiones), Safari ≥ 17. Requiere WebGL2. |
| RNF-09 | **Movimiento reducido**: se respeta `prefers-reduced-motion`; toda animación puede pausarse. |
| RNF-10 | **Robustez**: ninguna entrada provoca una excepción no controlada ni bloquea la interfaz más de 1 s. |
| RNF-11 | **Precisión**: cálculo en coma flotante de 64 bits; la GPU solo recibe datos ya calculados (32 bits). |
| RNF-12 | **Mantenibilidad**: capas con fronteras comprobadas automáticamente; cobertura ≥ 90 % de líneas en `math/` y `numerics/`. |
| RNF-13 | **Pantallas**: soporte completo ≥ 1280×720; degradado entre 768 y 1279 px de ancho; modo consulta por debajo (§9). |
| RNF-14 | **Entrega autocontenida**: un único archivo `campos-vectoriales.html` con todo incrustado (código, estilos, fuentes y *worker*), que funciona al abrirlo desde disco (`file://`) en Chrome, Edge y Firefox, sin servidor ni red. Decisión del usuario, 2026-10-02. |

### 2.2 Ampliaciones posteriores

Se posponen para que la 1.0 sea completa y sólida. Cada una indica qué deja preparado la 1.0.

| ID | Ampliación | Por qué se pospone | Qué deja preparado la 1.0 |
| --- | --- | --- | --- |
| AMP-01 | **Campos dependientes del tiempo** $\mathbf F(x,y,z,t)$ | Duplica la semántica: líneas de corriente (instantáneas), trayectorias y líneas de traza dejan de coincidir; exige controles de tiempo y otra pedagogía. | **Incorporada en la 1.1** (RF-24 … RF-26, §3.10, §4.9, §5.11). |
| AMP-02 | **Flujo a través de superficies** $\iint_S \mathbf F\cdot d\mathbf S$ | Requiere superficies parametrizadas, orientación, cuadratura y su propia interfaz; verificación con el teorema de Gauss. | Evaluador vectorizado, derivadas, mapa $\mathbf F\cdot\mathbf n$ sobre planos (caso particular). |
| AMP-03 | **Circulación por curvas** $\oint_C \mathbf F\cdot d\mathbf r$ | Requiere curvas parametrizadas e integración de línea; verificación con Stokes. | Mapa $(\nabla\times\mathbf F)\cdot\mathbf n$ y rueda de paletas (versión local). |
| AMP-04 | Detección numérica y clasificación de **equilibrios** (Newton + autovalores de $J$) | Robustez delicada (equilibrios no aislados, como el eje $z$ del campo rotacional). | Jacobiana en el inspector; marcas $\mathbf F\approx\mathbf 0$ en la malla. |
| AMP-05 | Líneas de corriente **2D sobre cortes** del campo proyectado; texturas LIC | Fácil de malinterpretar como líneas 3D (§3.7); requiere advertencias propias. | Proyección tangencial sobre el corte. |
| AMP-06 | **Isosuperficies** de $\lVert\mathbf F\rVert$, div o $\lVert\nabla\times\mathbf F\rVert$ | Coste de render y de diseño monocromo en volumen. | Muestreo escalar por malla. |
| AMP-07 | Componentes en coordenadas **cilíndricas o esféricas** | Conversión de bases y nueva validación. | Variables derivadas `r` y `rho`. |
| AMP-08 | Exportar **vídeo o GIF**; PNG con la configuración incrustada | Codificación y tamaño. | Exportación PNG compuesta. |
| AMP-09 | **Enlace compartible** (configuración en la URL) | Límites de longitud y compresión. | Serialización JSON versionada. |
| AMP-10 | **Deshacer/rehacer** general | Historial de estado completo. | Estado serializable e inmutable. |
| AMP-11 | Aviso de **muestreo insuficiente** (aliasing) | Heurística a calibrar. | Malla y estadísticas por nodo. |
| AMP-12 | Arrastrar el plano de corte o el punto en la escena | Manipuladores 3D accesibles. | Deslizadores y teclado. |
| AMP-13 | Despliegue público en la web | El usuario se conforma con el HTML autocontenido (RNF-14). | El propio HTML se puede alojar tal cual en cualquier servidor estático. |

### 2.3 Fuera de alcance

- **FA-01** Simulación física: Navier–Stokes, electromagnetismo, dinámica de Newton
  $m\ddot{\mathbf r}=\mathbf F$. Las partículas siguen $\dot{\mathbf r}=\mathbf F$ (§3.6).
- **FA-02** Unidades físicas y análisis dimensional (§3.9).
- **FA-03** Cálculo simbólico general: simplificación completa, integrales y ecuaciones.
- **FA-04** Campos definidos por datos (CSV o mallas importadas).
- **FA-05** Cuentas, servidor, colaboración en tiempo real, analítica de uso.
- **FA-06** Realidad virtual o aumentada.
- **FA-07** Experiencia táctil completa en móviles (solo «modo consulta», §9).
- **FA-08** Otros idiomas.
- **FA-09** Tema claro o de color. El monocromo oscuro es la identidad del producto.

### 2.4 Evaluación del núcleo propuesto

| Función del núcleo | Valor educativo | Coste | Riesgo | Decisión |
| --- | --- | --- | --- | --- |
| Campos predefinidos | Alto: punto de partida y referencia analítica | Bajo | Bajo | v1 P0 |
| Expresiones P, Q, R | Alto: convierte el visor en laboratorio | Medio (analizador propio) | Medio: corrección del analizador → pruebas con oráculos | v1 P0 |
| Parámetros | Alto: muestra la dependencia continua | Bajo | Bajo | v1 P0 |
| Flechas | Esencial | Medio | Saturación visual en 3D → densidad baja por defecto y halo | v1 P0 |
| Líneas de corriente | Alto: estructura global | Medio | Integración cerca de ceros y singularidades → criterios de parada | v1 P0 |
| Inspector | Alto: conecta imagen y números | Bajo | Bajo | v1 P0 |
| Magnitud | Esencial | Bajo | Escoger escalas comparables → $F_{\text{ref}}$ explícita y fijable | v1 P0 |
| Cortes XY/XZ/YZ | Alto: reduce la ambigüedad 3D | Medio | Malinterpretar la proyección → avisos y $\mathbf F\cdot\mathbf n$ | v1 P0 |
| Div y rot | Alto: objetivo del curso | Medio | Representar signos en monocromo → patrones y glifos | v1 P0 |
| Exportación | Medio: informes y apuntes | Bajo | Etiquetas fuera del lienzo WebGL → composición propia | v1 P0 |
| Partículas | Medio-alto: distingue *velocidad* de *dirección* | Bajo (reutiliza RK4) | Animación y movimiento reducido | v1 **P1** |
| Dependencia temporal, flujo, circulación | Alto, pero de un segundo nivel | Alto | Alto | **Ampliación** |

### 2.5 Versión 1.1: exploración inmersiva y campos dependientes del tiempo

Petición del usuario del 2026-10-04: (1) un **modo de vista libre** sin botones, paneles ni
herramientas, para explorar el espacio de forma inmersiva; (2) poder **estrechar y ampliar
el alcance** del espacio, que no sea un único cubo compacto, y **dilatar las unidades** para
agrandarlo o empequeñecerlo; (3) si es matemáticamente riguroso, una **dimensión de tiempo**
en la que se vea cómo cambian los vectores y cómo se desplaza lo que el campo arrastra,
«como gotas de lluvia». Respuestas del usuario a las dos preguntas abiertas: alcance con caja
ampliable **y** espacio sin límites en la vista libre; dilatación **uniforme** (STATUS D-62).

**Juicio sobre el rigor del tiempo**: los campos vectoriales dependientes del tiempo son
objetos matemáticos estándar (sistemas dinámicos no autónomos, flujos no estacionarios,
campos electromagnéticos $\mathbf E(\mathbf r,t)$ con $\nabla\times\mathbf E=-\partial\mathbf B/\partial t$,
ecuación de continuidad $\partial_t\rho+\nabla\cdot(\rho\mathbf v)=0$). El cálculo vectorial
trata cada instante con los mismos operadores espaciales; el tiempo añade la derivada local
$\partial\mathbf F/\partial t$ y separa tres familias de curvas que en los campos
estacionarios coinciden. Se incorpora (AMP-01), con las distinciones de §3.10. Lo que la
aplicación **no** hace es mover las flechas: una flecha está anclada a su punto y lo que
cambia es el vector en ese punto; lo que se desplaza son las partículas (las «gotas»).

| ID | Requisito | Prior. |
| --- | --- | --- |
| RF-20 | **Vista libre inmersiva**: botón en la barra de la escena y tecla V. Oculta **toda** la interfaz (barra superior, panel, leyenda, inspector, barra de la escena, triedro, notificaciones y mensajes) y pide pantalla completa si el navegador lo permite. Vuelo en primera persona: mirar arrastrando o con las flechas; W A S D avanzar, retroceder y desplazarse; E y Q subir y bajar según $+z$; Mayús ×4; rueda = velocidad. Siguen activos los atajos de capas (F L P C G) y la pausa (Espacio). Una pista de controles aparece 5 s al entrar y con H. Esc o V salen y restauran cámara, proyección, interfaz y foco. | P0 |
| RF-21 | **Alcance**: «Ampliar ×2» y «Estrechar ÷2» escalan Ω alrededor de su centro conservando $\Delta$ mientras $N$ lo permita (3–21); las cajas no cúbicas por eje siguen disponibles. | P0 |
| RF-22 | **Espacio sin límites** (vista libre, tecla U): la ventana de muestreo acompaña a la cámara anclada a la red de Ω; $F_{\text{ref}}$ y $C_{\text{ref}}$ se congelan al activarlo; semillas ancladas a la red; ejes por el origen sin caja (§3.11). | P0 |
| RF-23 | **Dilatación uniforme** $\lambda\in[1/8,\,64]$ del espacio en la vista libre (teclas + y −, y en el panel), alrededor del centro de Ω o, sin límites, del explorador (§3.11). | P0 |
| RF-24 | **Campos dependientes del tiempo**: variable `t` en P, Q y R; reloj del experimento con $t$, ventana $[t_0,t_1]$, bucle y velocidad; flechas, corte, mapas, div y rot **en el instante $t$**; líneas de corriente instantáneas; partículas como trayectorias de $\dot{\mathbf r}=\mathbf F(\mathbf r,t)$; $F_{\text{ref}}$ común a toda la ventana; $\partial\mathbf F/\partial t$ y $D\mathbf F/Dt$ en el inspector. | P0 |
| RF-25 | **Líneas de traza**: partículas emitidas de forma continua desde las semillas («Nacen en: todo Ω · las semillas»). | P1 |
| RF-26 | **Catálogo temporal**: viento giratorio, lluvia con ráfagas y silla giratoria (§4.9), con oráculo nativo, solución exacta de las trayectorias y ficha. | P0 |
| RF-27 | **Configuración JSON v2** (`tiempo`, `exploracion`, `particulas.nacimiento`) con migración automática desde v1 (§7.2). | P0 |

---

## 3. Fundamentos matemáticos

### 3.1 Dominio y sistema de coordenadas

- **Coordenadas cartesianas** $(x,y,z)$, base ortonormal **dextrógira**
  ($\hat x\times\hat y=\hat z$).
- **Eje $z$ hacia arriba** en la escena: la cámara usa `up = (0,0,1)`. Las coordenadas
  matemáticas se pasan a la escena sin permutar ejes.
- **Dominio de visualización** $\Omega = [x_{\min},x_{\max}]\times[y_{\min},y_{\max}]\times[z_{\min},z_{\max}]$,
  por defecto $[-2,2]^3$. Cada lado mide entre 0.1 y 1000; la proporción entre lados no supera 100.
- **Dominio de definición** $D\subseteq\mathbb R^3$: puntos donde las tres expresiones se
  evalúan a números reales finitos. En general $D$ no se conoce analíticamente; la
  aplicación lo **observa** en los puntos que evalúa (§3.8).
- **Unidades**: las coordenadas y el campo son **adimensionales** (§3.9). Los ejes muestran
  números, no metros.

### 3.2 Componentes, norma y dirección

- Componentes: $P,Q,R:D\to\mathbb R$.
- Norma: $\lVert\mathbf F\rVert = \sqrt{P^2+Q^2+R^2}$, calculada con `Math.hypot` para evitar
  desbordamientos intermedios.
- Dirección: $\hat{\mathbf F} = \mathbf F/\lVert\mathbf F\rVert$, **definida solo si**
  $\mathbf F\neq\mathbf 0$. En un cero del campo la dirección no existe: la interfaz no
  inventa una flecha (§3.3).

### 3.3 Puntos donde el vector es nulo (equilibrios)

- **Equilibrio**: punto $\mathbf p$ con $\mathbf F(\mathbf p)=\mathbf 0$. Puede ser aislado
  (el origen en el campo radial) o formar curvas o superficies (el eje $z$ del campo
  rotacional).
- **Cero numérico** en un nodo: $\lVert\mathbf F\rVert \le \varepsilon_0 = \max(10^{-12},\,10^{-9}F_{\text{ref}})$.
- **Cero visual**: $\lVert\mathbf F\rVert < 0.02\,F_{\text{ref}}$. Es un umbral de
  *representación*: la flecha sería ilegible y se sustituye por un rombo hueco. La leyenda lo
  dice explícitamente: «$\lVert\mathbf F\rVert$ < 2 % de $F_{\text{ref}}$». No afirma que
  el campo sea exactamente nulo.
- Los equilibrios **analíticos** del catálogo se dibujan como marcas etiquetadas (punto o
  línea discontinua). En campos escritos por el usuario, la 1.0 solo marca ceros *en los
  nodos* evaluados; buscar equilibrios entre nodos es la ampliación AMP-04.

### 3.4 Jacobiana, divergencia y rotacional

Con $J_{ij}=\partial F_i/\partial x_j$:

$$\nabla\cdot\mathbf F = \operatorname{tr}J = \frac{\partial P}{\partial x}+\frac{\partial Q}{\partial y}+\frac{\partial R}{\partial z}$$

$$\nabla\times\mathbf F = \left(\frac{\partial R}{\partial y}-\frac{\partial Q}{\partial z},\;
\frac{\partial P}{\partial z}-\frac{\partial R}{\partial x},\;
\frac{\partial Q}{\partial x}-\frac{\partial P}{\partial y}\right)$$

**Lectura geométrica**, que la ayuda presenta como definición intrínseca:

- **Divergencia**: flujo saliente por unidad de volumen,
  $\nabla\cdot\mathbf F(\mathbf p)=\lim_{V\to 0}\frac{1}{|V|}\oint_{\partial V}\mathbf F\cdot d\mathbf S$.
  Positiva: **fuente local**, sale más de lo que entra. Negativa: **sumidero local**. Nula:
  lo que entra sale (solenoidal en ese punto).
- **Rotacional**: circulación por unidad de área. Para un disco pequeño de normal unitaria
  $\mathbf n$,
  $(\nabla\times\mathbf F)\cdot\mathbf n=\lim_{A\to 0}\frac{1}{A}\oint_{\partial A}\mathbf F\cdot d\mathbf r$,
  con el borde orientado por la regla de la mano derecha. Es un **vector axial**: su
  dirección es el eje de giro y su sentido, el de la mano derecha.
- **Descomposición de $J$**: $J = S + A$ con $S=\tfrac12(J+J^\top)$ (deformación) y
  $A=\tfrac12(J-J^\top)$ (giro). Se cumple $\operatorname{tr}S = \nabla\cdot\mathbf F$ y
  $A\mathbf v = \tfrac12(\nabla\times\mathbf F)\times\mathbf v$. La ayuda lo usa para explicar
  por qué un campo puede «curvarse» sin rotacional (silla) o girar sin curvarse a lo lejos
  (vórtice irrotacional).
- **Rueda de paletas** (interpretación con supuestos): *si* $\mathbf F$ es el campo de
  velocidades de un fluido y una rueda de paletas es pequeña, rígida, sin masa y no perturba
  el flujo, entonces su velocidad angular alrededor de un eje $\mathbf n$ es
  $\omega_{\mathbf n}=\tfrac12(\nabla\times\mathbf F)\cdot\mathbf n$. Es máxima, con valor
  $\tfrac12\lVert\nabla\times\mathbf F\rVert$, cuando el eje apunta como el rotacional. La
  aplicación la orienta así y muestra los supuestos junto a ella.

### 3.5 Líneas de corriente

Una **línea de corriente** es una curva tangente al campo en cada uno de sus puntos:

$$\frac{d\mathbf r}{ds} = \mathbf F(\mathbf r(s)),\qquad \mathbf r(0)=\mathbf r_0 .$$

- El parámetro $s$ es un **parámetro de flujo** («tiempo» del campo estacionario).
- **Reparametrización por longitud de arco.** Donde $\mathbf F\neq\mathbf 0$ se define
  $\sigma(s)=\int_0^s\lVert\mathbf F(\mathbf r(u))\rVert\,du$, estrictamente creciente. La
  curva satisface entonces
  $$\frac{d\mathbf r}{d\sigma} = \hat{\mathbf F}(\mathbf r) = \frac{\mathbf F(\mathbf r)}{\lVert\mathbf F(\mathbf r)\rVert}.$$
  El **conjunto imagen y el sentido** de la curva no cambian (porque $d\sigma/ds>0$); cambia
  solo el ritmo con que se recorre. Integrar el campo normalizado da pasos de **longitud
  espacial uniforme** $h$, independientes de la magnitud: la resolución geométrica es la
  misma en regiones rápidas y lentas. Por eso la aplicación integra en $\sigma$ (§5.5).
- **Ceros con el campo normalizado.** $\hat{\mathbf F}$ no está definido donde
  $\mathbf F=\mathbf 0$ y varía bruscamente cerca de un equilibrio. Hacia un equilibrio
  hiperbólico, $s\to\infty$ y la curva *se aproxima* sin llegar, mientras que en $\sigma$
  puede alcanzarse a longitud finita. Tratamiento: la integración **se detiene** cuando
  $\lVert\mathbf F\rVert<\varepsilon_{\text{stop}}F_{\text{ref}}$ ($\varepsilon_{\text{stop}}=10^{-3}$)
  y marca el final con «≈ 0». Ninguna curva atraviesa ni «rebota» en un cero.
- **Integración en ambos sentidos.** Desde cada semilla se integra $+\hat{\mathbf F}$ (hacia
  delante) y $-\hat{\mathbf F}$ (hacia atrás). Las dos ramas se unen en una sola polilínea, con
  la semilla en su interior y marcas de sentido a favor de $+\mathbf F$.

### 3.6 Trayectorias de partículas

Las **partículas trazadoras** (RF-12) resuelven el problema de valor inicial **con el campo
sin normalizar**:

$$\frac{d\mathbf r}{dt} = \mathbf F(\mathbf r(t)),\qquad \mathbf r(t_0)=\mathbf r_0 .$$

- **Significado de la velocidad**: el vector velocidad de la partícula es exactamente
  $\mathbf F$ en su posición. Su rapidez es $\lVert\mathbf F\rVert$, en unidades de longitud
  por unidad de tiempo del experimento ($t$ adimensional).
- **Escala temporal de la animación**: 1 s real equivale a $\tau$ unidades de $t$. El valor
  por defecto es $\tau = \Delta / F_{\text{ref}}$: una partícula con $\lVert\mathbf F\rVert=F_{\text{ref}}$
  recorre una celda por segundo. La leyenda muestra «1 s ≙ τ = … unidades de t».
- **Campos estacionarios**: las trayectorias recorren las mismas curvas que las líneas de
  corriente; difieren solo en el ritmo. Las partículas hacen visible la *magnitud como
  rapidez*: en el campo radial saliente aceleran al alejarse. En campos dependientes del
  tiempo dejan de coincidir (§3.10).
- **No es dinámica de Newton**: si $\mathbf F$ se interpreta como **fuerza**, el movimiento
  físico obedece $m\ddot{\mathbf r}=\mathbf F$ y es distinto. La aplicación interpreta $\mathbf F$
  como **campo de velocidades** y la ayuda lo advierte.
- **Ciclo de vida**: cada partícula renace en una posición aleatoria reproducible (generador
  con semilla) cuando sale de $\Omega$, llega a un cero visual, encuentra un punto no definido
  o supera su vida máxima (8 s reales). Así la densidad se mantiene estable.

### 3.7 Interpretación de los cortes planos

Un corte es un plano $\Pi$ con normal unitaria $\mathbf n$:

| Corte | Plano | Normal $\mathbf n$ |
| --- | --- | --- |
| XY | $z=c$ | $\hat z$ |
| XZ | $y=c$ | $\hat y$ |
| YZ | $x=c$ | $\hat x$ |

Sobre $\Pi$ se ofrecen dos lecturas, que la interfaz nombra de forma explícita:

1. **Vector completo**: $\mathbf F$ evaluado en puntos de $\Pi$. Las flechas pueden salir
   del plano.
2. **Proyección tangencial**: $\mathbf F_\parallel = \mathbf F-(\mathbf F\cdot\mathbf n)\mathbf n$
   como flechas dentro del plano, más la **componente normal** $F_n=\mathbf F\cdot\mathbf n$ como
   mapa escalar con signo: ⊙ sale hacia $+\mathbf n$, ⊗ entra.

Advertencia que la ayuda hace explícita: las curvas integrales de $\mathbf F_\parallel$
**no son** líneas de corriente 3D salvo que $F_n=0$ en todo el plano. Por eso las líneas
2D sobre cortes son una ampliación (AMP-05) y no se dibujan en la 1.0.

Escalares disponibles sobre el corte: $\lVert\mathbf F\rVert$, $\nabla\cdot\mathbf F$,
$(\nabla\times\mathbf F)\cdot\mathbf n$ (componente del rotacional perpendicular al plano, el
«giro visto desde $+\mathbf n$») y $F_n$.

### 3.8 Singularidades y regiones sin definir

Una evaluación puede fallar por razones distintas, y la aplicación las distingue:

| Clase | Ejemplo | Resultado de la evaluación | Tratamiento |
| --- | --- | --- | --- |
| Fuera del dominio real | `sqrt(x)` con x < 0; `ln(x)` con x ≤ 0; `asin(2)` | `NaN` | Nodo **no definido** (aspa ×) |
| División por cero | `1/x` con x = 0 | `±Infinity` o `NaN` | No definido |
| Magnitud excesiva | `1/x^2` con x = 10⁻⁹ | finito, pero > $F_{\max}=10^{12}$ | **Singular** (aspa ×); se excluye de la escala |
| Potencia ambigua | `x^(1/3)` con x < 0 | `NaN` (potencia real) | No definido; la ayuda sugiere `cbrt(x)` |
| Punto no diferenciable | `abs(x)` en x = 0 | $\mathbf F$ finito, derivada sin sentido | Derivadas «no definidas en este punto» |

Reglas:

- Un nodo con **cualquier** componente no finita se marca como no definido. Nunca se dibuja
  una flecha parcial.
- Los nodos no definidos o singulares **se excluyen** del cálculo automático de $F_{\text{ref}}$.
- Las líneas de corriente se detienen antes de entrar en una región no definida (§5.7).
- La barra de estado informa del recuento («12 de 729 nodos sin definir»). Si son todos, se
  muestra el estado vacío (DESIGN.md §6.2).

### 3.9 Distinciones conceptuales que la aplicación mantiene

1. **El campo frente a su representación.** $\mathbf F$ es una función definida en un
   continuo. La escena muestra una **muestra finita** (nodos, semillas, píxeles) con
   decisiones de escala. Toda decisión de representación tiene su entrada en la leyenda.
2. **Escalado visual frente a normalización matemática.** Escalar flechas (longitud
   $\ell=\ell_{\max}\min(\lVert\mathbf F\rVert/F_{\text{ref}},1)$) es una **transformación
   gráfica** que no altera los datos: el inspector siempre muestra $\mathbf F$ sin escalar.
   Normalizar ($\hat{\mathbf F}$) es una **operación matemática** que descarta la magnitud y
   solo existe donde $\mathbf F\neq\mathbf 0$. El modo «Normalizado» de las flechas iguala las
   longitudes, pero la magnitud sigue codificada por la luminancia.
3. **Líneas de corriente frente a trayectorias.** Las líneas de corriente son la geometría
   (curvas tangentes en un instante). Las trayectorias son el movimiento en el tiempo. En
   campos estacionarios coinciden como conjuntos; las partículas añaden la rapidez.
4. **Campos matemáticos frente a magnitudes físicas.** La aplicación trata funciones
   adimensionales. Asignarles un significado físico (velocidad de un fluido, fuerza, campo
   eléctrico) exige supuestos: unidades, naturaleza del campo y ecuación de movimiento. Las
   fichas del catálogo los declaran. Ejemplo: $\mathbf F=(x,y,z)$ **no** es el campo de una
   carga puntual, que es $\propto \mathbf r/\lVert\mathbf r\rVert^3$ y tiene divergencia nula
   fuera del origen.

### 3.10 Campos dependientes del tiempo (1.1)

Un campo **no estacionario** es una función $\mathbf F: D\times I\to\mathbb R^3$,
$(\mathbf r,t)\mapsto\mathbf F(\mathbf r,t)$, con $I\subseteq\mathbb R$ un intervalo de tiempo
adimensional (§3.9). Si $\mathbf F$ no depende de $t$ es **estacionario** y todo lo anterior
se aplica sin cambios.

**Operadores en un instante.** $J$, div y rot son operadores **espaciales**: se calculan con
$t$ fijo, $J(\mathbf r,t)=D_{\mathbf r}\mathbf F$, $\nabla\cdot\mathbf F(\mathbf r,t)=\operatorname{tr}J$,
etc. Las derivadas parciales respecto de $x,y,z$ tratan $t$ como constante. Sus lecturas
geométricas (§3.4) valen instante a instante.

**Derivadas temporales.**

- **Derivada local** $\partial\mathbf F/\partial t$: cómo cambia el vector **en un punto fijo**.
- **Derivada material** (aceleración de la partícula que pasa por $\mathbf r$ en $t$):
  $$\frac{D\mathbf F}{Dt}=\frac{\partial\mathbf F}{\partial t}+J\,\mathbf F .$$
  Se obtiene derivando $\dot{\mathbf r}(t)=\mathbf F(\mathbf r(t),t)$ con la regla de la
  cadena. En un campo estacionario $D\mathbf F/Dt=J\mathbf F$, que en general **no** es nula:
  en la silla las partículas aceleran aunque el campo no cambie.

**Tres familias de curvas** (en los campos estacionarios coinciden como conjuntos; en los no
estacionarios, en general, no):

| Curva | Definición | Imagen |
| --- | --- | --- |
| **Línea de corriente instantánea** en $t^*$ | $\dfrac{d\mathbf r}{ds}=\mathbf F(\mathbf r(s),t^*)$, con $t^*$ **fijo** | Fotografía de las direcciones en un instante |
| **Trayectoria** desde $(\mathbf r_0,t_0)$ | $\dfrac{d\mathbf r}{dt}=\mathbf F(\mathbf r(t),t)$, $\mathbf r(t_0)=\mathbf r_0$ | Película de una gota |
| **Línea de traza** desde $\mathbf p$ en el instante $t$ | $\{\varphi_{\tau\to t}(\mathbf p):\ \tau\in[t-T,\,t]\}$, posiciones en $t$ de las partículas que pasaron por $\mathbf p$ | El humo de una chimenea; la cortina de gotas que deja una nube |

Aquí $\varphi_{\tau\to t}$ es el flujo de $\dot{\mathbf r}=\mathbf F(\mathbf r,t)$: lleva la
posición en el instante $\tau$ a la posición en $t$.

- **Coincidencia en el caso estacionario.** Si $\mathbf F$ no depende de $t$, el flujo solo
  depende del tiempo transcurrido, $\varphi_{\tau\to t}=\varphi_{t-\tau}$, y las tres curvas
  que pasan por un punto son la misma órbita (unicidad de las soluciones). Por eso la 1.0 no
  necesitaba distinguirlas (§3.9, punto 3).
- **Contraejemplo mínimo** (viento giratorio, §4.9): $\mathbf F=V(\cos\omega t,\sin\omega t,0)$.
  En cada instante las líneas de corriente son **rectas** paralelas; las trayectorias son
  **circunferencias** de radio $V/\omega$; las líneas de traza, **arcos** de esas
  circunferencias.
- **Qué se dibuja.** Las flechas, el corte, los mapas escalares, los glifos de rot F y el
  inspector muestran el campo en el instante $t$ del reloj. Las líneas de corriente son las
  **instantáneas** en el $t$ con que se calcularon, que la leyenda indica. Las partículas
  siguen **trayectorias** con el mismo reloj; emitidas desde las semillas (RF-25) dibujan
  **líneas de traza**.
- **Escala común en la ventana.** Con $F_{\text{ref}}$ automática calculada en cada instante,
  un campo que crece se vería siempre igual. Con un campo dependiente del tiempo,
  $F_{\text{ref}}$ (y $C_{\text{ref}}$) es el P95 de las magnitudes en los nodos en **9
  instantes equiespaciados** de la ventana $[t_0,t_1]$, redondeado como en §5.1. Así el
  crecimiento, el decrecimiento y la oscilación se leen en la longitud y la luminancia.
- **Ventana y bucle.** Al llegar a $t_1$, con bucle, el reloj vuelve a $t_0$ y las partículas
  **renacen** (su historia no es continua a través del salto); sin bucle, se detiene. Mover
  $t$ a mano también hace renacer las partículas: una trayectoria integrada hasta otro
  instante no es una trayectoria del instante elegido.
- **Lo que no cambia**: la interpretación cinemática (§3.6). Las partículas siguen
  $\dot{\mathbf r}=\mathbf F(\mathbf r,t)$, no $m\ddot{\mathbf r}=\mathbf F$.

### 3.11 Escala del espacio: alcance, espacio sin límites y dilatación (1.1)

**Alcance.** Es la caja Ω, la región de $\mathbb R^3$ que se muestrea. «Ampliar ×2»
transforma $[a_k,b_k]$ en $[c_k-(b_k-a_k),\,c_k+(b_k-a_k)]$ con $c_k$ el centro; «Estrechar
÷2», en $[c_k-\tfrac14(b_k-a_k),\,c_k+\tfrac14(b_k-a_k)]$. Para que se vea **más espacio** y no
el mismo con flechas más grandes, $N_k$ pasa a $\operatorname{round}((N_k-1)f)+1$ («en
nodos») o $\operatorname{round}(N_kf)$ («centros»), acotado a $[3,21]$, lo que conserva
$\Delta$ mientras el límite lo permite; si no, $\Delta$ cambia y el aviso lo dice.

**Espacio sin límites (vista libre).** Sea la red infinita de Ω,
$\mathcal L=\{(a_x+i\Delta_x,\ a_y+j\Delta_y,\ a_z+k\Delta_z):\ i,j,k\in\mathbb Z\}$. La ventana
que se muestrea es $\Omega_{\mathbf m}=\Omega+(m_x\Delta_x,\,m_y\Delta_y,\,m_z\Delta_z)$, con
$m_k=\operatorname{round}\big((c^{\text{cám}}_k-c_k)/\Delta_k\big)$. Propiedades:

1. Los nodos de cualquier ventana pertenecen a $\mathcal L$: al moverse, la flecha de un punto
   **no cambia** (solo aparecen y desaparecen flechas en los bordes). Nada «nada».
2. $F_{\text{ref}}$ y $C_{\text{ref}}$ se **congelan** al activar el modo: con la escala
   automática, el P95 de cada ventana reescalaría las flechas al moverse y sugeriría un
   cambio del campo que no existe.
3. Semillas **ancladas a la red** (§5.11): una por celda de una red gruesa, en una posición
   pseudoaleatoria que solo depende de la celda; el conjunto de semillas de dos ventanas
   coincide en su intersección.
4. Las partículas que quedan fuera de la ventana nueva renacen en la parte nueva (muestreo
   por rechazo), de modo que la densidad sigue siendo uniforme.
5. Los ejes se dibujan como **las rectas coordenadas por el origen** en la parte que cruza la
   ventana, sin caja: la caja de una ventana móvil no tiene significado.

**Dilatación uniforme $\lambda$.** Es un cambio de la escala de **presentación**, no del
campo: un punto $\mathbf r$ se presenta en $\mathbf u=\mathbf c+\lambda(\mathbf r-\mathbf c)$.
Hecho geométrico que la gobierna: **una proyección central es invariante bajo las homotecias
centradas en el ojo** (el rayo de $\mathbf e$ a $\mathbf e+\lambda(\mathbf r-\mathbf e)$ es el
mismo que el de $\mathbf e$ a $\mathbf r$). Consecuencias:

- Dilatar alrededor del **explorador** no cambia la imagen en ese instante; cambia el
  **recorrido**: a la misma velocidad de vuelo (en unidades de la escena), cruzar una unidad
  del campo cuesta $\lambda$ veces más. Con $\lambda$ grande uno es pequeño entre flechas
  enormes. Es el centro en el espacio sin límites.
- Dilatar alrededor del **centro de Ω** sí cambia la imagen: el espacio crece hacia el
  explorador, que puede quedar dentro de él. Es el centro con la caja.
- **Implementación exacta sin escalar la escena**: posición de la cámara en coordenadas del
  campo $\mathbf r_{\text{cám}}\leftarrow\mathbf c+(\mathbf r_{\text{cám}}-\mathbf c)\,\lambda_{\text{antes}}/\lambda_{\text{después}}$,
  velocidad de vuelo $v/\lambda$ y plano cercano $n/\lambda$. Los elementos de tamaño fijo en
  píxeles (rótulos, grosores, puntos) son invariantes en las dos descripciones. Ángulos,
  magnitudes, luminancias y valores del inspector no cambian: $\lambda$ es la escala del
  observador, no una transformación del campo.
- Por la misma invariancia, en la vista orbital la dilatación equivaldría a acercarse y no
  aporta nada: solo actúa en la vista libre.

---

## 4. Catálogo inicial

Experimento inicial al abrir por primera vez: **Helicoidal** (a = 0.25) con flechas y líneas
de corriente (STATUS D-14).

Cada campo se define con expresiones del propio lenguaje (§5.2) **y** con una
implementación nativa independiente en TypeScript. Esa implementación es el **oráculo** de
las pruebas (§4.8). Los parámetros tienen espacio de nombres propio en cada campo.

### 4.1 Uniforme — $\mathbf F=(a,\,b,\,c)$, por defecto $(1,0,0)$

| Aspecto | Contenido |
| --- | --- |
| Expresiones | `P = a`, `Q = b`, `R = c` |
| Parámetros | a, b, c ∈ [−3, 3], paso 0.1; por defecto 1, 0, 0 |
| Dominio | $\mathbb R^3$ |
| Geometría | Flechas idénticas en dirección, longitud y luminancia. $\lVert\mathbf F\rVert=\sqrt{a^2+b^2+c^2}$ constante. |
| Jacobiana | $J=0$ |
| div / rot | $0$ / $\mathbf 0$ |
| Equilibrios | Ninguno si $(a,b,c)\neq\mathbf 0$; todo el espacio si $(a,b,c)=\mathbf 0$ (estado «campo nulo») |
| Líneas de corriente | Rectas $\mathbf r(s)=\mathbf r_0+s\,(a,b,c)$ |
| Potencial | $\varphi=ax+by+cz$ (conservativo) |
| Semillas por defecto | Rejilla 5×5 en el plano YZ, $x=x_{\min}$ |
| Interpretación educativa | Referencia cero: un campo «que no hace nada» salvo trasladar. Sirve para calibrar la lectura de longitud y luminancia. |
| Lectura física (con supuestos) | Velocidad de una traslación uniforme de un fluido; o fuerza constante (p. ej. peso cerca del suelo con $(0,0,-g)$), recordando que las partículas no siguen la dinámica de Newton (§3.6). |

### 4.2 Radial saliente — $\mathbf F=k\,(x,\,y,\,z)$, $k>0$

| Aspecto | Contenido |
| --- | --- |
| Expresiones | `P = k*x`, `Q = k*y`, `R = k*z` |
| Parámetros | k ∈ [0.1, 3], paso 0.05; por defecto 1 |
| Dominio | $\mathbb R^3$ |
| Geometría | Flechas que apuntan alejándose del origen; $\lVert\mathbf F\rVert=k\lVert\mathbf r\rVert$ crece linealmente con la distancia. |
| Jacobiana | $J=kI$ |
| div / rot | $3k$ (constante en todo punto) / $\mathbf 0$ |
| Equilibrios | Origen: nodo inestable (fuente), autovalores $k,k,k>0$ |
| Líneas de corriente | Semirrectas desde el origen; $\mathbf r(s)=\mathbf r_0e^{ks}$ |
| Potencial | $\varphi=\tfrac k2\lVert\mathbf r\rVert^2$ |
| Semillas por defecto | 32 aleatorias en $\Omega$ (semilla fija 1) |
| Interpretación educativa | La divergencia es **la misma en todas partes**: no es «una fuente en el origen», sino una fuente distribuida. Comprobación de Gauss: el flujo por una esfera de radio $R$ vale $4\pi R^3k = 3k\cdot\tfrac43\pi R^3$. |
| Lectura física (con supuestos) | Velocidad de una expansión uniforme con tasa $k$ (descripción cinemática). **No** es el campo de una carga puntual (§3.9). |

### 4.3 Radial entrante — $\mathbf F=-k\,(x,\,y,\,z)$, $k>0$

| Aspecto | Contenido |
| --- | --- |
| Expresiones | `P = -k*x`, `Q = -k*y`, `R = -k*z` |
| Parámetros | k ∈ [0.1, 3], paso 0.05; por defecto 1 |
| Dominio | $\mathbb R^3$ |
| Geometría | Flechas hacia el origen, cada vez más cortas al acercarse. |
| Jacobiana | $J=-kI$ |
| div / rot | $-3k$ / $\mathbf 0$ |
| Equilibrios | Origen: nodo estable (sumidero) |
| Líneas de corriente | Semirrectas hacia el origen. En $s$ lo alcanzan asintóticamente; en longitud de arco, a distancia finita. Es la **prueba natural del criterio de parada en ceros**. |
| Potencial | $\varphi=-\tfrac k2\lVert\mathbf r\rVert^2$ |
| Semillas por defecto | 32 aleatorias en $\Omega$ (semilla fija 1) |
| Interpretación educativa | Simétrico del anterior: el signo de la divergencia se invierte y la geometría también. |
| Lectura física (con supuestos) | Compresión uniforme. Como fuerza sería una fuerza restauradora isótropa ($-k\mathbf r$, ley de Hooke en 3D), pero entonces el movimiento real sería oscilatorio ($m\ddot{\mathbf r}=-k\mathbf r$) y no el que muestran las partículas. |

### 4.4 Rotacional — $\mathbf F=\omega\,(-y,\,x,\,0)$

| Aspecto | Contenido |
| --- | --- |
| Expresiones | `P = -w*y`, `Q = w*x`, `R = 0` (el parámetro `w` se muestra como ω) |
| Parámetros | ω ∈ [−3, 3], paso 0.05; por defecto 1 (con ω = 1 coincide con el $(-y,x,0)$ pedido) |
| Dominio | $\mathbb R^3$ |
| Geometría | $\mathbf F=\omega\,\hat z\times\mathbf r$. Flechas horizontales tangentes a circunferencias centradas en el eje $z$; $\lVert\mathbf F\rVert=\lvert\omega\rvert\rho$. |
| Jacobiana | $\begin{pmatrix}0&-\omega&0\\ \omega&0&0\\0&0&0\end{pmatrix}$ |
| div / rot | $0$ / $(0,0,2\omega)$, constante |
| Equilibrios | **Recta** de equilibrios: el eje $z$ ($x=y=0$), no aislados |
| Líneas de corriente | Circunferencias horizontales $x^2+y^2=\rho_0^2$, $z=z_0$; giro antihorario visto desde $+z$ si ω > 0; periodo $2\pi/\lvert\omega\rvert$ |
| Potencial | No existe (rot ≠ 0) |
| Semillas por defecto | Rejilla 6×3 en el plano XZ ($y=0$), $x\in(0,x_{\max}]$ |
| Interpretación educativa | El rotacional es **igual en todas partes**, también lejos del eje. Contraste en la ayuda con el vórtice irrotacional $(-y,x,0)/(x^2+y^2)$, de líneas también circulares pero con rot = 0 fuera del eje. |
| Lectura física (con supuestos) | Velocidad de un sólido rígido que gira alrededor de $z$ con velocidad angular ω. La rueda de paletas gira a $\tfrac12\cdot 2\omega=\omega$, igual que el fluido: **comprobación cruzada** entre rueda y partículas. |

### 4.5 Helicoidal — $\mathbf F=(-y,\,x,\,a)$

| Aspecto | Contenido |
| --- | --- |
| Expresiones | `P = -y`, `Q = x`, `R = a` |
| Parámetros | a ∈ [−1, 1], paso 0.05; por defecto 0.25 (paso de hélice $2\pi a\approx1.57$: unas 2.5 vueltas visibles en $[-2,2]$) |
| Dominio | $\mathbb R^3$ |
| Geometría | Rotación alrededor de $z$ más traslación vertical uniforme. $\lVert\mathbf F\rVert=\sqrt{\rho^2+a^2}\ge\lvert a\rvert$. |
| Jacobiana | La misma que el rotacional con ω = 1 |
| div / rot | $0$ / $(0,0,2)$ |
| Equilibrios | Ninguno si a ≠ 0. Si a = 0 se reduce al rotacional (eje $z$ de equilibrios) |
| Líneas de corriente | Hélices $\big(\rho_0\cos(s+\theta_0),\ \rho_0\sin(s+\theta_0),\ z_0+as\big)$ sobre cilindros $\rho=\rho_0$. Paso $2\pi a$; **dextrógiras** si a > 0, levógiras si a < 0. En el eje, rectas verticales. Longitud por vuelta: $2\pi\sqrt{\rho_0^2+a^2}$. |
| Potencial | No existe |
| Semillas por defecto | 4 semillas en $y=0,\ z=0$, $x\in\{0.5,1,1.5,2\}$ |
| Interpretación educativa | Sumar un campo constante **no cambia** div ni rot (son derivadas), pero transforma circunferencias en hélices. Las derivadas son locales; la estructura global, no. |
| Lectura física (con supuestos) | Movimiento helicoidal (de tornillo) de un sólido rígido: giro más avance a lo largo del eje. |

### 4.6 Tipo silla — $\mathbf F=k\,(x,\,-y,\,0)$

| Aspecto | Contenido |
| --- | --- |
| Expresiones | `P = k*x`, `Q = -k*y`, `R = 0` |
| Parámetros | k ∈ [0.1, 3], paso 0.05; por defecto 1 (con k = 1 coincide con el $(x,-y,0)$ pedido) |
| Dominio | $\mathbb R^3$ |
| Geometría | Expansión en $x$, compresión en $y$, nada en $z$. $\lVert\mathbf F\rVert=k\rho$. |
| Jacobiana | $\operatorname{diag}(k,-k,0)$ |
| div / rot | $0$ / $\mathbf 0$ |
| Equilibrios | **Recta**: el eje $z$. En cada plano horizontal, punto de silla (autovalores $\pm k$) |
| Líneas de corriente | Hipérbolas $xy=C$ en planos $z=z_0$ (invariante: $\tfrac{d}{ds}(xy)=0$). Separatrices: semiplanos $y=0$ (inestable) y $x=0$ (estable). En $s$: $x=x_0e^{ks}$, $y=y_0e^{-ks}$. |
| Potencial | $\varphi=\tfrac k2(x^2-y^2)$, armónico ($\Delta\varphi=0$) |
| Semillas por defecto | Rejilla 7×7 en el plano XY, $z=0$ |
| Interpretación educativa | Divergencia nula aunque las flechas «convergen» en $y$ y «divergen» en $x$: una compensa a la otra. Irrotacional aunque las líneas se curvan. |
| Lectura física (con supuestos) | Flujo potencial ideal (incompresible, no viscoso, estacionario) cerca de un punto de estancamiento: deformación pura extendida uniformemente en $z$. |

### 4.7 Campos auxiliares (solo pruebas y ayuda, no en el catálogo visible)

| ID | Campo | Uso |
| --- | --- | --- |
| T1 | $(\sin(yz),\ x^2e^{z},\ y^3\cos x)$ | Derivadas no triviales; orden de convergencia de diferencias finitas |
| T2 | $\mathbf r/\lVert\mathbf r\rVert^3$ | Singularidad puntual; div = 0 fuera del origen |
| T3 | $(\sqrt{x},\,0,\,0)$ | Dominio de definición parcial; derivada infinita en $x=0$ |
| T4 | $(-y,\,x,\,0)/(x^2+y^2)$ | Vórtice irrotacional: líneas circulares con rot = 0; eje singular |
| T5 | $(\lvert x\rvert,\,0,\,0)$ | Punto no diferenciable |
| T6 | $(x^2,\ y,\ 0)$ | div $=2x+1$ cambia de signo en $x=-\tfrac12$ (mapa con signos) |

### 4.8 Uso de los resultados analíticos para comprobar la implementación

1. **Analizador frente a oráculo**: las expresiones de cada campo, compiladas, coinciden con
   la implementación nativa en 1000 puntos aleatorios reproducibles (V-MAT-05).
2. **Derivadas simbólicas** frente a las tablas: $J$, div y rot coinciden en puntos
   aleatorios (V-MAT-07).
3. **Diferencias finitas** frente a las tablas: error dentro de la tolerancia (V-NUM-01). Los
   seis campos son **afines**, así que las diferencias centradas son exactas salvo redondeo.
   Por eso T1 es imprescindible para medir el error de truncamiento y su orden.
4. **Invariantes de las líneas de corriente**: rectitud (4.1), alineación radial
   $\mathbf r\times\mathbf r_0=\mathbf 0$ (4.2, 4.3), radio constante (4.4), paso de hélice
   (4.5), $xy$ constante (4.6) (V-NUM-03 a V-NUM-07).
5. **Equilibrios**: marcas «≈ 0» exactamente en los nodos del eje $z$ (4.4 con ω ≠ 0, 4.6) o
   en el origen (4.2, 4.3); ninguna en 4.5 con a ≠ 0 (V-FUN-04).
6. **Coherencia del inspector** en puntos de tabla. Ejemplo: rotacional, ω = 1, en $(1,0,0)$
   → $\mathbf F=(0,1,0)$, $\lVert\mathbf F\rVert=1$, div = 0, rot = $(0,0,2)$ (V-FUN-06).
7. **Rueda frente a partículas** en el campo rotacional: misma velocidad angular ω (V-FUN-08).

### 4.9 Catálogo temporal (1.1)

Tres campos elegidos porque cada uno separa líneas de corriente, trayectorias y líneas de
traza de una manera distinta y tiene **solución exacta** de las trayectorias: son los
oráculos de las pruebas del integrador no autónomo (V-NUM-17). Al elegir uno se activan las
partículas, porque las trayectorias son su razón de ser (D-68). Dominio $[-2,2]^3$; ventana
$[0,4\pi]$ con bucle.

#### 4.9.1 Viento giratorio — $\mathbf F=V\,(\cos\omega t,\ \sin\omega t,\ 0)$

| Aspecto | Contenido |
| --- | --- |
| Expresiones | `P = V*cos(omega*t)`, `Q = V*sin(omega*t)`, `R = 0` (el parámetro `omega` se muestra como ω) |
| Parámetros | V ∈ [0.1, 3], paso 0.05, por defecto 1; ω ∈ [0.1, 3], paso 0.05, por defecto 1 |
| Geometría | Uniforme en el espacio en cada instante; la dirección gira con velocidad angular ω. $\lVert\mathbf F\rVert=V$ siempre |
| $J$, div, rot | $J=0$, div $=0$, rot $=\mathbf 0$ en todo instante |
| $\partial_t\mathbf F$, $D\mathbf F/Dt$ | $V\omega(-\sin\omega t,\cos\omega t,0)$; como $J=0$, $D\mathbf F/Dt=\partial_t\mathbf F$, de módulo $V\omega=V^2/(V/\omega)$: la aceleración centrípeta de una circunferencia de radio $V/\omega$ |
| Líneas de corriente en $t^*$ | Rectas paralelas a $(\cos\omega t^*,\sin\omega t^*,0)$ |
| Trayectorias | $x=x_0+\tfrac V\omega(\sin\omega t-\sin\omega t_0)$, $y=y_0-\tfrac V\omega(\cos\omega t-\cos\omega t_0)$, $z=z_0$: **circunferencias** de radio $V/\omega$, antihorarias vistas desde $+z$ si ω > 0, periodo $2\pi/\omega$ |
| Líneas de traza desde $\mathbf p$ | Arcos de la circunferencia de radio $V/\omega$ centrada en $\mathbf p+\tfrac V\omega(\sin\omega t,-\cos\omega t,0)$ |
| Semillas | Rejilla 5×5 en el plano XY, $z=0$ |
| Interpretación | En ningún instante una línea de corriente se curva y, sin embargo, cada gota describe una circunferencia: **el contraejemplo mínimo** de §3.10 |
| Supuestos | Viento horizontal uniforme que rola a ritmo constante; las gotas siguen el viento sin inercia |

#### 4.9.2 Lluvia con ráfagas — $\mathbf F=\big(A\sin(\omega t-kz),\ 0,\ -v\big)$

| Aspecto | Contenido |
| --- | --- |
| Expresiones | `P = A*sin(omega*t - k*z)`, `Q = 0`, `R = -v` |
| Parámetros | A ∈ [0, 2], paso 0.05, por defecto 0.8; ω ∈ [0.1, 3], paso 0.05, por defecto 1; k ∈ [0, 3], paso 0.05, por defecto 1.5; v ∈ [0.1, 3], paso 0.05, por defecto 1 |
| Geometría | Caída uniforme con rapidez $v$ y viento horizontal en ondas que suben con velocidad de fase $\omega/k$ |
| $J$, div, rot | $J_{13}=-Ak\cos(\omega t-kz)$ y el resto 0; div $=0$; rot $=(0,\,-Ak\cos(\omega t-kz),\,0)$ |
| $\partial_t\mathbf F$, $D\mathbf F/Dt$ | $(A\omega\cos(\omega t-kz),0,0)$; $D\mathbf F/Dt=\big(A(\omega+kv)\cos(\omega t-kz),\,0,\,0\big)$ |
| Líneas de corriente en $t^*$ | $\dfrac{dx}{dz}=-\dfrac Av\sin(\omega t^*-kz)$: curvas onduladas en planos $y=$ cte |
| Trayectorias | $z=z_0-v(t-t_0)$; $x=x_0-\dfrac A\Omega\big[\cos(\Omega t-\phi_0)-\cos(\Omega t_0-\phi_0)\big]$ con $\Omega=\omega+kv$ y $\phi_0=kz_0+kvt_0$ |
| Semillas | Rejilla 5×5 en el plano XY, $z=1.9$ (la «nube») |
| Interpretación | La gota cruza las ráfagas y las siente con frecuencia $\omega+kv$, no $\omega$ (efecto Doppler): por eso su zigzag no tiene la forma de las líneas de corriente. Con «Nacen en: las semillas» se ve la cortina de gotas (líneas de traza) |
| Supuestos | Gotas sin inercia que caen a velocidad terminal $v$ y siguen el viento horizontal |

#### 4.9.3 Silla giratoria — $\mathbf F=k\,\big(x\cos2\omega t+y\sin2\omega t,\ x\sin2\omega t-y\cos2\omega t,\ 0\big)$

| Aspecto | Contenido |
| --- | --- |
| Expresiones | `P = k*(x*cos(2*omega*t) + y*sin(2*omega*t))`, `Q = k*(x*sin(2*omega*t) - y*cos(2*omega*t))`, `R = 0` |
| Parámetros | k ∈ [0.1, 3], paso 0.05, por defecto 1; ω ∈ [0, 3], paso 0.05, por defecto 1.5 |
| Geometría | En cada instante es la silla de §4.6 girada un ángulo $\omega t$: $\mathbf F=R(\omega t)\,\mathrm{diag}(k,-k,0)\,R(\omega t)^{\top}\mathbf r$ |
| $J$, div, rot | $J$ simétrica sin traza, autovalores $\pm k$ y 0 en todo instante: div $=0$, rot $=\mathbf 0$ |
| Equilibrios | El eje $z$, en todo instante |
| Trayectorias | En el sistema que gira, $\mathbf q=R(-\omega t)(x,y)$ cumple $\dot{\mathbf q}=M\mathbf q$ con $M=\begin{pmatrix}k&\omega\\-\omega&-k\end{pmatrix}$ y $M^2=(k^2-\omega^2)I$. Si $\omega>k$: $\mathbf q(t)=\big[\cos\nu\tau\,I+\tfrac{\sin\nu\tau}{\nu}M\big]\mathbf q_0$, $\nu=\sqrt{\omega^2-k^2}$, $\tau=t-t_0$: **acotadas** (elipses en el sistema que gira). Si $\omega<k$: lo mismo con $\cosh$ y $\sinh$ de $\mu=\sqrt{k^2-\omega^2}$: **escapan**. Si $\omega=k$: $\mathbf q=(I+\tau M)\mathbf q_0$ |
| Semillas | Rejilla 7×7 en el plano XY, $z=0$ |
| Interpretación | En cada instante es un punto de silla, irrotacional y sin divergencia: las líneas de corriente prometen que todo escapa. Si gira deprisa ($\omega>k$), las partículas quedan **atrapadas**. Ninguna fotografía instantánea del campo lo deja adivinar |
| Supuestos | Recuerda a la trampa de Paul (una silla de potencial que gira atrapa partículas), pero aquí la ecuación es de primer orden, $\dot{\mathbf r}=\mathbf F$, no la de Newton |

---

## 5. Métodos computacionales

### 5.1 Muestreo espacial y densidad de malla

- **Malla de flechas**: $N_x\times N_y\times N_z$ nodos, $N\in[3,21]$ por eje, por defecto
  $9^3=729$. Un único $N$ salvo que se active «por eje» (Avanzado).
- **Posición de los nodos**: «en nodos» (por defecto)
  $x_i=x_{\min}+i\,\Delta_x$, $\Delta_x=(x_{\max}-x_{\min})/(N_x-1)$. Con $N$ impar y dominio
  simétrico, el origen es un nodo y los equilibrios del catálogo se ven. Alternativa
  «centros de celda» $x_i=x_{\min}+(i+\tfrac12)\Delta_x$, $\Delta_x=(x_{\max}-x_{\min})/N_x$:
  evita muestrear exactamente sobre singularidades centradas (T2).
- **Separación de referencia**: $\Delta=\min(\Delta_x,\Delta_y,\Delta_z)$; fija el tamaño
  máximo de las flechas $\ell_{\max}=0.9\,\Delta$.
- **Malla de corte**: $M\times M$ nodos sobre el plano, $M\in[5,61]$, por defecto 21. El mapa
  escalar usa una textura de $(4M)\times(4M)$ con interpolación bilineal entre muestras
  evaluadas en una malla de $2M\times 2M$.
- **Escala de magnitud automática**: $F_{\text{ref}}$ = percentil 95 de $\lVert\mathbf F\rVert$
  en los nodos definidos, redondeado hacia arriba a $\{1,1.5,2,2.5,3,4,5,6,8\}\times10^k$
  (D-26). Si todos son
  ≈ 0, $F_{\text{ref}}=1$ y se muestra «campo nulo». El P95 resiste los picos de las
  singularidades; el redondeo produce marcas de leyenda legibles. La escala puede **fijarse**
  para comparar experimentos (DESIGN.md §9.10).

### 5.2 Lenguaje de expresiones

**Decisión D-03**: analizador propio y pequeño, en lugar de una biblioteca. Justificación en
PLAN.md §1.3. Se compila a **funciones de cierre** sin `eval` ni `new Function`.

Gramática (EBNF; espacios ignorados):

```
expresion   = suma ;
suma        = producto , { ("+" | "-") , producto } ;
producto    = unario , { ("*" | "/" | multiplicacion_implicita) , unario } ;
unario      = ("+" | "-") , unario | potencia ;
potencia    = primario , [ ("^" | "**") , unario ] ;      (* asociativa a la derecha *)
primario    = numero | identificador | llamada | "(" , expresion , ")" ;
llamada     = funcion , "(" , expresion , { "," , expresion } , ")" ;
numero      = digitos , [ "." , digitos ] , [ ("e" | "E") , [ "+" | "-" ] , digitos ]
            | "." , digitos , [ exponente ] ;
```

- **Precedencia**: `^` > unario > `* /` (incluida la implícita) > `+ -`. Así,
  `-x^2 = -(x^2)` y `2^3^2 = 2^9`.
- **Multiplicación implícita**, solo en casos inequívocos: número seguido de identificador o
  de `(` (`2x`, `3(x+1)`), y `)(`. Nunca entre identificadores: `xy` da el error «¿Querías
  escribir x*y?». Tras `/`, `1/2x` se interpreta como `(1/2)·x` y la vista previa tipográfica
  lo hace visible; se añade además un aviso.
- **Unicode tolerado**: `−` (U+2212) como `-`; `·` y `×` como `*`; `π`; letras griegas como
  identificadores de parámetro.
- **Variables**: `x`, `y`, `z`.
- **Variables derivadas** (se expanden en el árbol, así que se derivan correctamente):
  `r` = $\sqrt{x^2+y^2+z^2}$, `rho` o `ρ` = $\sqrt{x^2+y^2}$.
- **Constantes**: `pi` / `π`, `e`.
- **Tiempo** (1.1): `t` es la variable temporal (§3.10). Las derivadas respecto de $x,y,z$
  la tratan como constante; $\partial/\partial t$ se deriva con las mismas reglas. Se evalúa
  en una ranura más del vector de parámetros (D-63). Sigue siendo un nombre reservado: no
  puede ser un parámetro.
- **Parámetros**: cualquier otro identificador debe estar **declarado**. Si no lo está, el
  mensaje ofrece «Añadir “k” como parámetro». Un parámetro no puede llamarse como una
  variable, constante o función. Los nombres griegos ASCII (`alpha`…`omega`, `w` en el
  catálogo) se muestran con su letra.
- **Funciones permitidas (lista blanca)**:

| Función | Aridad | Derivada usada | Notas de dominio |
| --- | --- | --- | --- |
| `sin`, `cos`, `tan` | 1 | $\cos u$, $-\sin u$, $1+\tan^2u$ | `tan` se dispara cerca de $\pi/2+k\pi$ → magnitud excesiva |
| `asin`, `acos` | 1 | $\pm1/\sqrt{1-u^2}$ | $\lvert u\rvert\le1$; derivada infinita en ±1 |
| `asinh`, `acosh`, `atanh` | 1 | $1/\sqrt{u^2+1}$, $1/\sqrt{u^2-1}$, $1/(1-u^2)$ | `acosh`: $u\ge1$; `atanh`: $\lvert u\rvert<1$ |
| `atan` | 1 | $1/(1+u^2)$ | — |
| `atan2(y, x)` | 2 | $(x\,dy-y\,dx)/(x^2+y^2)$ | no diferenciable en el origen |
| `sinh`, `cosh`, `tanh` | 1 | $\cosh$, $\sinh$, $1-\tanh^2$ | desbordamiento → magnitud excesiva |
| `exp` | 1 | $e^u$ | — |
| `ln`, `log` (natural) | 1 | $1/u$ | $u>0$ |
| `log10` | 1 | $1/(u\ln10)$ | $u>0$ |
| `sqrt` | 1 | $1/(2\sqrt u)$ | $u\ge0$; derivada infinita en 0 |
| `cbrt` | 1 | $1/(3\sqrt[3]{u^2})$ | todo ℝ; derivada infinita en 0 |
| `abs` | 1 | $\operatorname{sgn}(u)$ | no diferenciable en 0 (§5.4) |
| `min`, `max` | 2 | rama activa | no diferenciable donde los argumentos coinciden |
| `hypot` | 2–3 | $\sum u_i\,du_i/\text{hypot}$ | no diferenciable en el origen |
| `pow(a, b)` | 2 | igual que `^` | — |

- **Potencias**: con exponente constante, $d(u^c)=c\,u^{c-1}du$, válida también con base
  negativa si $c$ es entero. Con exponente variable,
  $d(u^v)=u^v(v'\ln u+v\,u'/u)$, que exige $u>0$. Potencia real: base negativa con
  exponente no entero da `NaN` (no definido).
- **Límites**: 500 caracteres por componente; 1000 nodos de árbol; profundidad 64. El
  árbol de cada derivada se limita a 5000 nodos; por encima se usan diferencias finitas
  (§5.4).
- **Salidas del compilador**: (1) evaluador `(x, y, z, p: Float64Array) => number` por
  componente; (2) árbol simplificado; (3) TeX para la vista previa (KaTeX); (4) texto Unicode
  lineal para exportar; (5) lista de identificadores usados.
- **Simplificación mínima** (solo para la legibilidad de las derivadas mostradas):
  plegado de constantes, `0·u→0`, `1·u→u`, `u+0→u`, `u^1→u`, `−(−u)→u`. No es un sistema de
  álgebra computacional (FA-03).

### 5.3 Errores, expresiones incompletas y valores no finitos

| Situación | Detección | Mensaje (ejemplo) | Efecto |
| --- | --- | --- | --- |
| Incompleta mientras se escribe | Fin de entrada inesperado (`x*(`), con el foco en el campo y < 800 ms sin teclear | «Expresión incompleta: falta “)”» (informativo, sin tono de error) | Se mantiene el último campo válido |
| Sintaxis | El analizador falla en la posición *i* | «Símbolo inesperado “*” en la posición 4» + subrayado en el texto | Último campo válido + aviso en la escena |
| Identificador desconocido | Fuera de variables, constantes, funciones y parámetros | «“k” no es una variable ni un parámetro. [Añadir como parámetro]» | Ídem |
| Función no permitida | Llamada fuera de la lista blanca | «“gamma” no está disponible. Funciones: …» | Ídem |
| Aridad | Número de argumentos | «atan2 necesita 2 argumentos (y, x)» | Ídem |
| Límite superado | Longitud, nodos o profundidad | «La expresión es demasiado larga (máx. 500 caracteres)» | Ídem |
| Evaluación no finita | Comprobación por nodo | Recuento en la barra de estado; aspas en la escena | Nodo no definido |
| Todo indefinido | 0 nodos válidos | Estado vacío con sugerencias | Sin flechas ni líneas |

Las tres componentes se validan por separado; el campo solo se aplica cuando **las tres**
son válidas. Al aplicar se usa un retardo de 300 ms tras la última tecla.

### 5.4 Derivadas: analíticas y numéricas

- **Por defecto, analíticas**: derivación simbólica del árbol con las reglas de la tabla de
  §5.2. Ofrece exactitud hasta el redondeo y expresiones legibles (panel «Divergencia y
  rotacional»).
- **Numéricas (diferencias finitas)** cuando son necesarias:
  1. el árbol de la derivada supera el límite de nodos;
  2. la derivada simbólica da `NaN` (forma indeterminada como $0\cdot\infty$) mientras
     $\mathbf F$ está definido en un entorno: p. ej. $(\sqrt x)^2$ en $x=0$, cuya derivada
     unilateral es 1; el inspector indica «numérica»;
  3. como **oráculo cruzado** en las pruebas.
- **Derivada no acotada**: si la derivada simbólica es $\pm\infty$ (p. ej. `sqrt(x)` en
  $x=0$), se informa «no acotada (∞)». No se sustituye por un cociente incremental, que
  daría un número finito sin significado.
- **Puntos no diferenciables**: si el argumento de `abs`, `min`, `max`, `atan2` o `hypot` está a
  menos de $10^{-9}(1+\lvert\cdot\rvert)$ de su punto anguloso, la derivada se declara **no
  definida** en ese punto. No se informa del valor de la rama.
- **Paso de las diferencias centradas**, componente a componente:
  $$h_j = \varepsilon_{\text{mach}}^{1/3}\max(\lvert x_j\rvert,\,L),\qquad
  \varepsilon_{\text{mach}}=2^{-52}\Rightarrow\varepsilon_{\text{mach}}^{1/3}\approx6.06\times10^{-6},$$
  con $L$ igual a la mitad del lado menor de $\Omega$. Equilibra el error de truncamiento
  $O(h^2f''')$ con el de redondeo $O(\varepsilon f/h)$. El error esperado es del orden de
  $\varepsilon^{2/3}\approx4\times10^{-11}$ relativo a la escala de $f$. Como $x\pm h$ no
  siempre es representable exactamente, el cociente usa los **pasos efectivos**
  $h^+=(x+h)-x$ y $h^-=x-(x-h)$, con denominador $h^++h^-$. Así se divide por el incremento
  realmente aplicado.
- **Respaldo unilateral**: si una de las dos evaluaciones centradas no es finita, se usa la
  fórmula de 3 puntos de segundo orden hacia el lado válido; si tampoco es posible, la
  derivada es «no definida».
- **Tolerancias de verificación**: VALIDATION.md §2.

### 5.5 Integración de líneas de corriente (RK4 en longitud de arco)

Se integra $\dot{\mathbf r}=\mathbf G(\mathbf r)$ con $\mathbf G=\pm\hat{\mathbf F}$ mediante
Runge–Kutta clásico de cuarto orden y paso espacial $h$:

```
k1 = G(r)
k2 = G(r + h/2·k1)
k3 = G(r + h/2·k2)
k4 = G(r + h·k3)
r' = r + h/6·(k1 + 2k2 + 2k3 + k4)
```

- **Paso**: por defecto $h=\Delta/8$ (con Ω = [−2,2]³ y N = 9: $h=0.0625$). Rango
  $[\Delta/64,\ \Delta/2]$. El error global es $O(h^4)$.
- **Evaluación protegida**: si alguna etapa $k_i$ no es finita o cae en un cero visual, el
  paso se **reduce a la mitad**, hasta 4 veces. Si sigue fallando, la rama termina con el
  motivo correspondiente (§5.7).
- **Salida del dominio**: el último paso que sale de $\Omega$ se recorta por bisección (30
  iteraciones, precisión $h/2^{30}$) hasta el borde, y la curva termina exactamente en él.
- **Paso adaptativo** (RK45): descartado en la 1.0 por simplicidad y por la verificación
  directa de orden. El paso fijo en longitud de arco ya adapta el «tiempo».

### 5.6 Semillas

| Estrategia | Descripción | Por defecto |
| --- | --- | --- |
| Rejilla en plano | $n_u\times n_v$ puntos uniformes en un rectángulo de un plano XY/XZ/YZ a la altura $c$ (por defecto, toda la sección de $\Omega$; puede ser el plano de corte activo) | La del campo (§4) |
| Aleatoria | $n$ puntos uniformes en $\Omega$ con generador reproducible *mulberry32* y semilla visible | n = 32, semilla 1 |
| Desde el punto inspeccionado | El punto P más un anillo de 6 puntos a distancia $\Delta/4$ en el plano normal a $\mathbf F(P)$ | — |

- Las semillas en nodos no definidos o en ceros visuales se **descartan** y se cuentan.
- Máximo de 256 semillas.

### 5.7 Criterios de parada

Cada rama (delante o atrás) termina con **un** motivo registrado, que se resume en
«Detalles del cálculo» y se marca en la escena:

| Código | Condición | Marca final |
| --- | --- | --- |
| `SALE_DOMINIO` | Sale de $\Omega$ (recortado al borde) | ninguna (la línea toca la caja) |
| `CERO` | $\lVert\mathbf F\rVert<\varepsilon_{\text{stop}}F_{\text{ref}}$, $\varepsilon_{\text{stop}}=10^{-3}$ | rombo hueco «≈ 0» |
| `NO_DEFINIDO` | Evaluación no finita o magnitud > $F_{\max}$ tras reducir el paso | aspa × |
| `ORBITA_CERRADA` | Un paso pasa a menos de $h/2$ de la semilla tras recorrer más de $8h$: la línea termina exactamente en la semilla, sin sobrepasarla (el paso se sustituye por el tramo hasta ella), y la rama hacia atrás ya no se integra | ninguna |
| `LONGITUD_MAX` | Longitud > $L_{\max}$ (por defecto 4 × diagonal de $\Omega$) | ninguna |
| `PASOS_MAX` | Más de 4000 pasos por rama | ninguna |
| `ESTANCADA` | El desplazamiento neto en las últimas 50 iteraciones es < $h$, o la dirección gira más de 90° dentro de un paso incluso tras reducirlo 4 veces (discontinuidad de dirección). Si en ese punto $\lVert\mathbf F\rVert<0.05\,F_{\text{ref}}$, se clasifica como `CERO`: al cruzar un sumidero el campo normalizado cambia de sentido y RK4 suma etapas opuestas (hallazgo de NUM-03) | ninguna |

### 5.8 Partículas

- Integración RK4 en tiempo $t$ con el campo **sin normalizar**. Paso por fotograma
  $\delta t=\tau\cdot\Delta t_{\text{real}}$, dividido en subpasos tales que
  $\lVert\mathbf F\rVert\,\delta t_{\text{sub}}\le\Delta/4$, con un máximo de 8 subpasos
  (si no basta, el paso es mayor pero RK4 sigue siendo estable para los campos del catálogo;
  la partícula no renace por ello).
- Por defecto 400 partículas; máximo 2000. Estela de las últimas 12 posiciones.
- Se ejecuta en el hilo principal: 2000 × 4 etapas × 3 componentes ≈ 24 000 evaluaciones
  por fotograma, del orden de 1 ms. Si la medición lo desmiente, pasa al *worker*
  (riesgo R-04).
- Con **movimiento reducido**, las partículas empiezan en pausa y la estela muestra el
  sentido con la animación detenida.

### 5.9 Límites de recursos

| Recurso | Por defecto | Máximo | Motivo |
| --- | --- | --- | --- |
| Nodos de flechas | 9³ = 729 | 21³ = 9261 | Legibilidad 3D antes que capacidad de la GPU |
| Malla de corte | 21² | 61² | Textura y flechas del plano |
| Semillas | según el campo | 256 | Tiempo de integración |
| Pasos por rama | — | 4000 | Memoria y tiempo |
| Vértices totales de líneas | — | 1 000 000 | Memoria de la GPU |
| Partículas | 400 | 2000 | Coste por fotograma |
| Parámetros | — | 8 | Densidad del panel |
| Tiempo por trabajo del *worker* | — | troceado en lotes de ≈ 8 ms; cancelable | Respuesta |
| Resolución de render | `devicePixelRatio` hasta 2 | 2 | Relleno de píxeles |

Al tocar un límite, la interfaz lo muestra («Límite de 256 semillas alcanzado»). Nunca falla
en silencio.

### 5.10 Precisión numérica, resolución de muestreo y calidad de renderizado

Tres conceptos distintos, con controles distintos:

| Concepto | Pregunta | Controlado por | Se verifica con |
| --- | --- | --- | --- |
| **Precisión numérica** | ¿Cuánto se parecen los números calculados a los exactos? | float64, $h$ de RK4, $h_j$ de diferencias finitas | Tolerancias frente a soluciones analíticas (VALIDATION.md §3–4) |
| **Resolución de muestreo** | ¿Qué detalles del campo llegan a verse? | $N$, $M$, número de semillas | Revisión visual; un detalle menor que $\Delta$ puede no verse (*aliasing*) |
| **Calidad de renderizado** | ¿Con qué fidelidad se pintan los datos en píxeles? | Antialiasing (MSAA), `devicePixelRatio`, teselado de los conos, grosor de línea | Capturas y auditoría de píxeles |

Ejemplo pedagógico para la ayuda: con $N=9$, el campo $(\sin 10y,0,0)$ se ve engañosamente
suave, aunque los números del inspector son exactos. Es un problema de **muestreo**, no de
precisión.

---

### 5.11 Métodos de la versión 1.1

**Integración no autónoma (partículas).** RK4 clásico con el tiempo en las etapas:

```
k1 = F(r,            t)
k2 = F(r + h/2·k1,   t + h/2)
k3 = F(r + h/2·k2,   t + h/2)
k4 = F(r + h·k3,     t + h)
r' = r + h/6·(k1 + 2k2 + 2k3 + k4)
```

Error global $O(h^4)$ también en el caso no autónomo; se verifica el orden frente a las
soluciones exactas de §4.9 (V-NUM-17). Subpasos como en §5.8.

**Reloj.** Un único reloj avanza $t$ a razón de $\tau$ unidades por segundo real
($\tau=\Delta/F_{\text{ref}}$ por defecto, §3.6), mueve las partículas y fija el instante de
todo lo demás. En marcha, la malla, el corte y las líneas se recalculan para el $t$ vigente
con **una petición en curso por tipo**: si $t$ avanza mientras se calcula, al terminar se pide
el $t$ más reciente (sin el retardo de 120 ms de las líneas). Cada resultado guarda el $t$
con que se calculó y la leyenda lo muestra cuando difiere del reloj.

**Escala en la ventana.** $F_{\text{ref}}=$ P95 de $\{\lVert\mathbf F(\mathbf r_i,t_j)\rVert\}$
con $t_j=t_0+j\,(t_1-t_0)/8$, $j=0,\dots,8$ (§3.10), con el mismo redondeo legible; el
*worker* la guarda en caché mientras no cambien campo, parámetros, malla ni ventana.

**Líneas de traza (RF-25).** Con «Nacen en: las semillas», las $n$ partículas se reparten por
turnos entre las $S$ semillas. La partícula $j$ de una semilla espera
$j\cdot T_v/\lceil n/S\rceil$ segundos reales antes de salir ($T_v$: vida) y, al morir, renace
en su semilla. En cada instante las partículas de una semilla son, por construcción, una
muestra de la línea de traza de esa semilla (§3.10). Las que esperan no se dibujan.

**Semillas ancladas a la red** (espacio sin límites). Celdas de lado
$D=(\operatorname{vol}\Omega/n)^{1/3}$ alineadas con el origen de Ω; en la celda $(i,j,k)$, la
semilla $\mathbf a+D\big((i,j,k)+\mathbf h(i,j,k)\big)$ con $\mathbf h\in[0,1)^3$ un *hash*
entero de la celda y de la semilla visible. Solo se usan las celdas cuya semilla cae en la
ventana. Dos ventanas comparten exactamente las semillas de su intersección (V-NUM-21).

**Vuelo (vista libre).** La cámara se describe por su posición y dos ángulos: azimut $\psi$
(alrededor de $+z$) y elevación $\theta\in[-89°,89°]$, con dirección
$(\cos\theta\cos\psi,\ \cos\theta\sin\psi,\ \sin\theta)$; nunca se alcanza el polo, así que
«arriba» ($+z$) siempre está definido. La velocidad objetivo es
$v=v_0\cdot m\cdot(4\text{ con Mayús})/\lambda$ con $v_0=0.4\,r_\Omega$ por segundo
($r_\Omega$: radio de Ω) y $m$ el multiplicador de la rueda ($\times1.25$ por paso, entre
$1/16$ y 16). La velocidad real se acerca a la objetivo con una constante de tiempo de
0.12 s (sin inercia con movimiento reducido).

## 6. Experiencia de uso

Los flujos detallados, estados y navegación por teclado están en PLAN.md §4. Los
componentes y sus estados visuales están en DESIGN.md §6–7.

## 7. Exportación y persistencia

### 7.1 Imagen PNG

- Opciones: **contenido** (escena sola · escena + leyenda · escena + leyenda + ecuaciones) y
  **tamaño** (como en pantalla · 1920×1080 · 3840×2160).
- La escena se vuelve a dibujar al tamaño pedido. La leyenda y las ecuaciones se componen con
  Canvas 2D, porque el HTML de la interfaz no forma parte del lienzo WebGL. Las ecuaciones se
  escriben en notación Unicode lineal a partir del árbol.
- Nombre del archivo: `campo-<nombre>-AAAAMMDD-HHMM.png`.
- La exportación también es **monocroma** (RNF-01) y se audita.

### 7.2 Configuración JSON

```json
{
  "formato": "campos-vectoriales",
  "version": 1,
  "nombre": "Helicoidal",
  "campo": { "P": "-y", "Q": "x", "R": "a", "base": "helicoidal" },
  "parametros": [{ "nombre": "a", "valor": 0.25, "min": -1, "max": 1, "paso": 0.05, "porDefecto": 0.25 }],
  "dominio": { "min": [-2, -2, -2], "max": [2, 2, 2] },
  "muestreo": { "n": [9, 9, 9], "posicion": "nodos", "corteResolucion": 21 },
  "capas": { "flechas": true, "lineas": true, "particulas": false, "glifos": "campo" },
  "flechas": { "modo": "proporcional", "escala": { "tipo": "auto" }, "escalaRot": { "tipo": "auto" }, "luminancia": "lineal", "grosor": "finas" },
  "lineas": { "semillas": { "tipo": "rejilla", "plano": "XZ", "c": 0, "u": [0.5, 2], "v": [0, 0], "nu": 4, "nv": 1 }, "paso": 0.0625, "longitudMax": 27.7 },
  "particulas": { "n": 400, "tau": null, "semilla": 1 },
  "corte": { "activo": false, "plano": "XY", "c": 0, "flechas": "todas", "vector": "completo", "escalar": "ninguno", "escala": { "tipo": "auto" } },
  "camara": { "tipo": "perspectiva", "posicion": [5.2, -6.8, 4.1], "objetivo": [0, 0, 0] },
  "punto": null
}
```

- Claves opcionales además del ejemplo: `campo.modificado` (si falta, se deduce comparando las
  ecuaciones con las del ejemplo base) y `cifras` (2–8, por defecto 4). Si falta otra clave que
  no sea `formato`, `version` o `campo`, se toma la del ejemplo base y se avisa (D-49).
- **Validación estricta al importar**: tipos, rangos y longitudes; los errores se listan por
  campo («dominio.min[2] debe ser menor que dominio.max[2]»). El estado actual no cambia
  si la importación falla.
- **Versiones**: `version` superior a la soportada → error claro. Versión inferior → función
  de migración. Claves desconocidas → se ignoran con aviso.
- **Versión 2 (1.1)**: añade tres claves y la aplicación escribe siempre `"version": 2`.

  ```json
  "tiempo": { "t": 0, "inicio": 0, "fin": 12.566370614359172, "bucle": true },
  "exploracion": { "escala": 1, "velocidad": 1, "ilimitado": false },
  "particulas": { "n": 400, "tau": null, "semilla": 1, "nacimiento": "dominio" }
  ```

  `tiempo.t` es el instante mostrado (inicio ≤ t ≤ fin, inicio < fin); `exploracion.escala`
  es $\lambda\in[1/8,64]$; `velocidad`, el multiplicador $m\in[1/16,16]$; `ilimitado`, el
  espacio sin límites al entrar en la vista libre; `nacimiento` ∈ {`dominio`, `semillas`}.
  **Migración 1 → 2**: añade esas claves con sus valores por defecto sin avisos de «falta»
  (no son omisiones del usuario); solo queda la nota «Convertido de la versión 1 a la 2». Un archivo v2 en la 1.0 da el error de versión posterior, como prevé
  esta misma sección.
  `flechas.grosor` ∈ {`finas`, `gruesas`} (D-80) es solo apariencia: si falta, vale `finas`
  sin aviso.
- Tamaño máximo del archivo: 256 KB.
- **Recuperación automática**: el estado se guarda en `localStorage` 1 s después de cada
  cambio, siempre dentro de `try/catch`. Al abrir, se restaura con un aviso «Se ha recuperado
  tu último experimento · Empezar de cero».

---

## 8. Seguridad y privacidad

- Las expresiones **nunca** se ejecutan como código JavaScript: se analizan con una
  gramática cerrada y se compilan a cierres sobre operaciones de `Math`. No hay acceso a
  propiedades, asignaciones, cadenas ni llamadas fuera de la lista blanca.
- El JSON importado se valida campo a campo antes de tocar el estado; las expresiones
  importadas pasan por el mismo analizador.
- Política de seguridad de contenidos del HTML autocontenido (la escribe el empaquetador):
  `default-src 'none'`; `script-src 'sha256-…'` (huella del único script incrustado);
  `worker-src blob: data:`; `style-src 'unsafe-inline'` (KaTeX y React usan atributos
  `style`); `img-src data: blob:`; `font-src data:`; **`connect-src 'none'`**. El propio
  navegador impide así cualquier petición de red.
- Ninguna petición de red en ejecución. Ningún dato sale del navegador.

## 9. Pantallas pequeñas: adaptación y límites

| Nivel | Ancho | Experiencia | Compromiso |
| --- | --- | --- | --- |
| **Completo** | ≥ 1280 px | Composición de referencia (DESIGN.md §5) | Criterios de aceptación completos |
| **Degradado** | 768–1279 px | Panel lateral como cajón superpuesto, abierto con un botón; inspector y leyenda compactos | Funciones completas; capturas revisadas |
| **Consulta** | < 768 px | Escena a pantalla completa; panel como hoja inferior; leyenda como botón «Leyenda»; densidad por defecto reducida (7³) | Sin roturas de maquetación; edición posible pero incómoda; sin objetivo de rendimiento |

**Límites explícitos en pantallas pequeñas y táctiles:**

1. **Lectura 3D**: con menos píxeles, las flechas de 9³ se solapan; la densidad baja reduce
   información.
2. **Selección precisa**: tocar una flecha concreta en 3D es impreciso. Se recomienda
   introducir coordenadas.
3. **Edición de expresiones**: los teclados virtuales esconden `^`, `*` y los paréntesis, y
   ocupan media pantalla.
4. **Sin atajos ni *hover***: la ayuda contextual depende de toques.
5. **Rendimiento**: las GPU móviles y el calor limitan la densidad y las partículas.
6. **Exportación 4K**: puede superar la memoria de la GPU; se ofrece solo «como en pantalla».

Conclusión: la 1.0 es una aplicación de **escritorio**. En pantallas pequeñas permite
consultar y hacer demostraciones, pero no es un entorno de trabajo completo (FA-07).

## 10. Supuestos y decisiones

Se registran en STATUS.md (§3 Decisiones, §4 Supuestos). Las decisiones reversibles tienen
un valor por defecto y no bloquean la implementación.
