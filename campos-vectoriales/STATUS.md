# STATUS — Estado, decisiones y riesgos

> Documento vivo. Se actualiza al cerrar cada tarea con su evidencia.
> Última actualización: **2026-10-04**.

---

## 1. Estado actual

| | |
| --- | --- |
| **Fase** | **Versión 1.1 completada y verificada en este entorno (H10: 15 de 15)**: vista libre inmersiva, alcance de Ω, espacio sin límites, dilatación uniforme y campos dependientes del tiempo con líneas de traza y JSON v2 (SPEC §2.5). Versión 1.0: H0 a H7 completados; H8: 3 de 4 (A11Y-02 espera la sesión con lector de pantalla, Q-04); H9: 4 de 6 (VAL-02 y VAL-03 esperan Q-05 y Q-06). HTML 1.1 en `entrega/` (sha256 `47b8f541…`, ENT-02) |
| **Situación** | Plan de la 1.0 aprobado el 2026-10-02 (D-15, D-20, S-01). La 1.1 la pidió el usuario el 2026-10-04 con dos respuestas: alcance «caja + espacio sin límites» y dilatación «solo uniforme» (D-62); el tiempo se incorporó tras juzgarlo riguroso (§6, punto 25) |
| **Siguiente paso** | Las tres comprobaciones del usuario (§7), ahora con el HTML 1.1: Q-04, Q-05 y Q-06, añadiendo a esta última un campo temporal en reproducción y la vista libre (R-15) |
| **Bloqueos** | Ninguno en este entorno. Necesitan el equipo del usuario: la sesión con lector de pantalla (Q-04, A11Y-02; si obliga a cambiar la interfaz, se repiten las capturas de REV-05), la prueba de humo en Firefox y Safari (Q-05, VAL-02) y la medición en R1 (Q-06, VAL-03) |

### 1.1 Estado por hito

| Hito | Tareas | Completadas y verificadas | Nota |
| --- | --- | --- | --- |
| Planificación | 1 | 1/1 | Aprobada por el usuario |
| H0 Fundaciones | 3 | 3/3 | — |
| H1 Primera entrega | 8 | 8/8 | — |
| H2 Lenguaje | 4 | 4/4 | Puede ir en paralelo a H1 |
| H3 Numérico y cómputo | 7 | 7/7 | — |
| H4 Edición y controles | 7 | 7/7 | — |
| H5 Capas científicas | 9 | 9/9 | — |
| H6 Inspección | 3 | 3/3 | — |
| H7 Exportación | 3 | 3/3 | — |
| H8 Transversal | 4 | 3/4 | A11Y-02: falta la sesión con lector (Q-04) |
| H9 Validación | 6 | 4/6 | VAL-02: falta la prueba de humo manual (Q-05); VAL-03: falta la medición en R1 (Q-06). Incluye ENT-01 (HTML autocontenido) |
| H10 Exploración y tiempo (1.1) | 15 | 14/15 | En curso (PLAN §5.3) |

### 1.2 Tareas completadas y verificadas

- PLN-01 · 2026-10-02 · `12c0d52` · [evidencia/PLN-01/](evidencia/PLN-01/)
- FND-01 · 2026-10-02 · `c7d0f1c` · [evidencia/FND-01/](evidencia/FND-01/)
- FND-02 · 2026-10-02 · `c7d0f1c` · [evidencia/FND-02/](evidencia/FND-02/)
- VIS-01 · 2026-10-02 · `c7d0f1c` · [evidencia/VIS-01/](evidencia/VIS-01/)
- MAT-01 · 2026-10-02 · `8b7d9c1` · [evidencia/MAT-01/](evidencia/MAT-01/)
- NUM-01 · 2026-10-02 · `8b7d9c1` · [evidencia/NUM-01/](evidencia/NUM-01/)
- REN-01 · 2026-10-02 · `8b7d9c1` · [evidencia/REN-01/](evidencia/REN-01/)
- REN-02 · 2026-10-02 · `8b7d9c1` · [evidencia/REN-02/](evidencia/REN-02/)
- VIS-03 · 2026-10-02 · `8b7d9c1` · [evidencia/VIS-03/](evidencia/VIS-03/)
- UI-01 · 2026-10-02 · `8b7d9c1` · [evidencia/UI-01/](evidencia/UI-01/)
- VIS-04 · 2026-10-02 · `8b7d9c1` · [evidencia/VIS-04/](evidencia/VIS-04/)
- REV-01 · 2026-10-02 · `8b7d9c1` · [evidencia/REV-01/](evidencia/REV-01/)
- MAT-02 · 2026-10-02 · `53772df` · [evidencia/MAT-02/](evidencia/MAT-02/)
- MAT-03 · 2026-10-02 · `53772df` · [evidencia/MAT-03/](evidencia/MAT-03/)
- MAT-04 · 2026-10-02 · `53772df` · [evidencia/MAT-04/](evidencia/MAT-04/)
- MAT-05 · 2026-10-02 · `53772df` · [evidencia/MAT-05/](evidencia/MAT-05/)
- NUM-02 · 2026-10-02 · `e9bffe4` · [evidencia/NUM-02/](evidencia/NUM-02/)
- NUM-03 · 2026-10-02 · `e9bffe4` · [evidencia/NUM-03/](evidencia/NUM-03/)
- NUM-04 · 2026-10-02 · `e9bffe4` · [evidencia/NUM-04/](evidencia/NUM-04/)
- NUM-05 · 2026-10-02 · `e9bffe4` · [evidencia/NUM-05/](evidencia/NUM-05/)
- NUM-06 · 2026-10-02 · `e9bffe4` · [evidencia/NUM-06/](evidencia/NUM-06/)
- CMP-01 · 2026-10-02 · `e9bffe4` · [evidencia/CMP-01/](evidencia/CMP-01/)
- CMP-02 · 2026-10-02 · `e9bffe4` · [evidencia/CMP-02/](evidencia/CMP-02/)
- VIS-02 · 2026-10-02 · `b40d607` · [evidencia/VIS-02/](evidencia/VIS-02/)
- UI-07 · 2026-10-02 · `b40d607` · [evidencia/UI-07/](evidencia/UI-07/)
- UI-02 · 2026-10-02 · `b40d607` · [evidencia/UI-02/](evidencia/UI-02/)
- UI-03 · 2026-10-02 · `b40d607` · [evidencia/UI-03/](evidencia/UI-03/)
- UI-04 · 2026-10-02 · `b40d607` · [evidencia/UI-04/](evidencia/UI-04/)
- UI-05 · 2026-10-02 · `b40d607` · [evidencia/UI-05/](evidencia/UI-05/)
- REV-02 · 2026-10-02 · `b40d607` · [evidencia/REV-02/](evidencia/REV-02/)
- REN-03 · 2026-10-02 · `615f6d6` · [evidencia/REN-03/](evidencia/REN-03/)
- REN-04 · 2026-10-02 · `615f6d6` · [evidencia/REN-04/](evidencia/REN-04/)
- REN-05 · 2026-10-02 · `615f6d6` · [evidencia/REN-05/](evidencia/REN-05/)
- REN-06 · 2026-10-02 · `615f6d6` · [evidencia/REN-06/](evidencia/REN-06/)
- REN-07 · 2026-10-02 · `615f6d6` · [evidencia/REN-07/](evidencia/REN-07/)
- REN-08 · 2026-10-02 · `615f6d6` · [evidencia/REN-08/](evidencia/REN-08/)
- UI-08 · 2026-10-02 · `615f6d6` · [evidencia/UI-08/](evidencia/UI-08/)
- VIS-05 · 2026-10-02 · `615f6d6` · [evidencia/VIS-05/](evidencia/VIS-05/)
- REV-03 · 2026-10-02 · `615f6d6` · [evidencia/REV-03/](evidencia/REV-03/)
- INS-01 · 2026-10-02 · `4ae876b` · [evidencia/INS-01/](evidencia/INS-01/)
- INS-02 · 2026-10-02 · `4ae876b` · [evidencia/INS-02/](evidencia/INS-02/)
- INS-03 · 2026-10-02 · `4ae876b` · [evidencia/INS-03/](evidencia/INS-03/)
- EXP-01 · 2026-10-02 · `1a6c6a5` · [evidencia/EXP-01/](evidencia/EXP-01/)
- EXP-02 · 2026-10-02 · `1a6c6a5` · [evidencia/EXP-02/](evidencia/EXP-02/)
- EXP-03 · 2026-10-02 · `1a6c6a5` · [evidencia/EXP-03/](evidencia/EXP-03/)
- UI-06 · 2026-10-02 · `61c2549` · [evidencia/UI-06/](evidencia/UI-06/)
- A11Y-01 · 2026-10-02 · `61c2549` · [evidencia/A11Y-01/](evidencia/A11Y-01/)
- VIS-06 · 2026-10-02 · `61c2549` · [evidencia/VIS-06/](evidencia/VIS-06/)
- VAL-01 · 2026-10-02 · `5fa7300` · [evidencia/VAL-01/](evidencia/VAL-01/)
- REV-04 · 2026-10-03 · `72f6c36` · [evidencia/REV-04/](evidencia/REV-04/)
- ENT-01 · 2026-10-03 · `24e634b` · [evidencia/ENT-01/](evidencia/ENT-01/)
- DOC-01 · 2026-10-03 · `ac45b2e` · [evidencia/DOC-01/](evidencia/DOC-01/)
- PLN-02 · 2026-10-04 · `0f4fa0a` · [evidencia/PLN-02/](evidencia/PLN-02/)
- TMP-01 · 2026-10-04 · `50b9068` · [evidencia/TMP-01/](evidencia/TMP-01/)
- TMP-02 · 2026-10-04 · `50b9068` · [evidencia/TMP-02/](evidencia/TMP-02/)
- TMP-03 · 2026-10-04 · `50b9068` · [evidencia/TMP-03/](evidencia/TMP-03/)
- TMP-04 · 2026-10-04 · `e62621b` · [evidencia/TMP-04/](evidencia/TMP-04/)
- TMP-05 · 2026-10-04 · `e62621b` · [evidencia/TMP-05/](evidencia/TMP-05/)
- TMP-06 · 2026-10-04 · `e62621b` · [evidencia/TMP-06/](evidencia/TMP-06/)
- ALC-01 · 2026-10-04 · `e62621b` · [evidencia/ALC-01/](evidencia/ALC-01/)
- ALC-02 · 2026-10-04 · `e62621b` · [evidencia/ALC-02/](evidencia/ALC-02/)
- VL-01 · 2026-10-04 · `e62621b` · [evidencia/VL-01/](evidencia/VL-01/)
- VL-02 · 2026-10-04 · `e62621b` · [evidencia/VL-02/](evidencia/VL-02/)
- VAL-04 · 2026-10-04 · `e62621b` · [evidencia/VAL-04/](evidencia/VAL-04/)
- REV-05 · 2026-10-04 · `e62621b` · [evidencia/REV-05/](evidencia/REV-05/)
- ENT-02 · 2026-10-04 · `e62621b` · [evidencia/ENT-02/](evidencia/ENT-02/)

---

## 2. Resumen de la propuesta

Laboratorio web de escritorio, en español, para explorar campos $\mathbf F=(P,Q,R)$ en 3D.
Seis campos de catálogo con referencia analítica; ecuaciones editables con un analizador
propio, seguro y con derivación simbólica; flechas instanciadas con magnitud codificada por
longitud y luminancia; líneas de corriente RK4 en longitud de arco con criterios de parada
explícitos; cortes XY/XZ/YZ con mapas escalares de signo legible en monocromo (patrones y
glifos); divergencia y rotacional como valores, mapas, glifos y rueda de paletas; partículas
($\dot{\mathbf r}=\mathbf F$); inspector; exportación PNG y JSON. Interfaz estrictamente
monocroma, donde la escena ocupa más del 75 % de la pantalla.

Stack: Vite 8 · React 19 · three.js r186 (WebGL2) · KaTeX · TypeScript 6 · Vitest 5 ·
Playwright. Ubicación: `campos-vectoriales/` dentro de este repositorio multiproyecto.

---

## 3. Decisiones

| ID | Decisión | Alternativas | Motivo | Reversible |
| --- | --- | --- | --- | --- |
| D-01 | Subproyecto `campos-vectoriales/` en este repositorio; publicación en `main` (preferencia explícita del usuario) y en la rama de trabajo | Repositorio propio | Convención del repositorio (`traza/`); aislamiento comprobado: el `tsconfig` de la raíz solo incluye `src` | Sí |
| D-02 | Vite 8 + React 19 + three.js r186 (WebGL2) | R3F, WebGPU, Plotly | PLAN §1.2–1.3 | Parcialmente |
| D-03 | Analizador de expresiones propio | mathjs (plan B), expr-eval (descartado por seguridad) | Lista blanca, rendimiento, derivadas, TeX, errores en español | Sí (plan B) |
| D-04 | Cálculo pesado en un *Web Worker*; inspector y partículas en el hilo principal | Todo en el hilo principal | RNF-04; las partículas cuestan ~1 ms por fotograma | Sí |
| D-05 | TypeScript 6.0.x | TypeScript 7.x | `typescript-eslint` exige `<6.1.0` | Sí |
| D-06 | `@playwright/test` fijado en 1.56.1 | 1.63 | Coincide con el Chromium preinstalado: capturas reproducibles aquí | Sí |
| D-07 | Paleta con tres grises nuevos: `#2E2E2E`, `#757575`, `#8C8C8C` | Paleta original | WCAG 1.4.11 y 1.4.3 (DESIGN §2.1) | Sí |
| D-08 | Glifos sin iluminación, sin niebla y sin transparencia | Sombreado Phong y niebla | La luminancia codifica magnitud; la profundidad se percibe por perspectiva, oclusión, halo y paralaje | Sí |
| D-09 | Punto como separador decimal | Coma | Coherencia con la entrada (la coma separa argumentos); admitido por la RAE | Sí |
| D-10 | Líneas de corriente con RK4 de paso fijo en longitud de arco ($h=\Delta/8$) | RK45 adaptativo en $s$ | Resolución geométrica uniforme; orden verificable (T-12) | Sí |
| D-11 | $F_{\text{ref}}$ = P95 redondeado, fijable | Máximo; fija por defecto | Robusto ante singularidades; comparable al fijarla | Sí |
| D-12 | Glifos de F y de rot F excluyentes | Simultáneos | Un único significado para la banda clara de luminancia | Sí |
| D-13 | Etiquetas de los ejes como *sprites* dentro del lienzo | `CSS2DRenderer` | Aparecen en la exportación PNG | Sí |
| D-14 | Experimento inicial: Helicoidal, a = 0.25, flechas + líneas | Rotacional | Muestra la tridimensionalidad desde el primer instante | Sí |
| D-15 | **Entrega como un único HTML autocontenido** (`campos-vectoriales.html`) que funciona desde disco, sin servidor ni red (RNF-14) | Despliegue web | Respuesta del usuario (Q-03) | Sí |
| D-16 | Partículas con prioridad P1 | P0 o ampliación | Valor educativo alto y coste bajo, pero no imprescindibles | Sí |
| D-17 | Líneas 2D sobre cortes pospuestas | Incluidas | Riesgo de malinterpretación (SPEC §3.7) | Sí |
| D-18 | Densidad por defecto 9³ con malla en nodos | 11³; centros de celda | Legibilidad 3D; el origen visible con N impar | Sí |
| D-19 | Inter (interfaz), JetBrains Mono (expresiones), KaTeX (fórmulas), todas locales | Fuentes del sistema | Consistencia entre plataformas y capturas reproducibles | Sí |
| D-20 | Equipo de referencia R1: Intel Core i9, NVIDIA RTX 4060, monitor de 144 Hz → objetivos de rendimiento a 144 fps (VALIDATION §6.4) | Portátil con GPU integrada (S-04 original) | Respuesta del usuario (Q-01) | Sí |
| D-21 | Para un público experto, el inspector añade autovalores de $J$ y helicidad, y se aceptan `asinh`, `acosh` y `atanh` | Inspector básico | Respuesta del usuario (Q-02) | Sí |
| D-22 | El *worker* se incrusta como `Blob`; si el navegador no permite crearlo desde `file://`, el cálculo pasa al hilo principal con el mismo código (degradación controlada y anunciada) | Exigir servidor | RNF-14 sin perder robustez | Sí |
| D-23 | Auditorías visuales con suavizado de texto en escala de grises | Tolerar franjas de color | El suavizado subpíxel es del sistema, no del diseño (DESIGN §2.4); hallazgo de FND-02 | Sí |
| D-24 | Sin `noUncheckedIndexedAccess` en TypeScript (desviación de FND-01) | Activarlo | En núcleos numéricos con `Float64Array` obliga a aserciones `!` en cada acceso y reduce la legibilidad; el resto de opciones estrictas sí están activas | Sí |
| D-26 | Escala legible de $F_{\text{ref}}$ y $V_{\text{ref}}$ con pasos {1, 1.5, 2, 2.5, 3, 4, 5, 6, 8}·10ᵏ | {1, 2, 2.5, 5}·10ᵏ (SPEC §5.1 original) | Con la escala original el helicoidal (P95 ≈ 2.6) saltaba a 5 y todas las flechas se encogían a la mitad; la nueva limita la pérdida a ×1.33 | Sí |
| D-27 | Pistas de forma en el cono: base más oscura y degradado fijo vértice → base (80 %) | Conos planos (D-08 estricto) | Revisión de capturas de H1: sin ellas, flechas hacia la cámara y en sentido contrario eran indistinguibles; el gris de cilindro y vértice sigue siendo exacto (DESIGN §9.2) | Sí |
| D-28 | Fracción mínima de escena: 73 % a 1440×900 y 79 % a 1920×1080 | 75 % | La cifra original era geométricamente imposible con panel de 320 px y barra de 48 px; lo detectó la prueba de VIS-03 | Sí |
| D-29 | Capa pura `geometria/` para las instancias de flechas, compartida por `render/` (dibujo) y `compute/` (worker) | Que `compute/` importe `render/flechas` | El worker calcula las instancias sin depender de la escena; la regla de capas (PLAN §1.5) lo prohíbe y ESLint lo comprueba | Sí |
| D-30 | Las líneas de corriente ceden el turno también dentro de cada línea (generador que cede cada 256 pasos), no solo entre semillas | Ceder solo entre líneas | Con una expresión cara, una sola línea de 2 × 4000 pasos puede pasar de 100 ms; CMP-02 exige cancelar en menos de 100 ms (medido: 9.5–10.6 ms) | Sí |
| D-31 | `ORBITA_CERRADA` termina exactamente en la semilla: el paso que pasa a menos de $h/2$ se sustituye por el tramo hasta ella | Unir el punto posterior con la semilla (SPEC original) | La medida de T-08 mostró un retroceso de hasta $h/2$ (≈ 6 px) y una longitud $+5.9\times10^{-2}$; ahora el error relativo es $2.1\times10^{-7}$ | Sí |
| D-32 | Un parámetro nuevo nace con valor 1, rango [−5, 5] y paso 0.1 | Pedir el rango al crearlo | Un solo paso para crearlo; se ajusta después en «Rango y paso…» | Sí |
| D-33 | VV-06 revisado: con el experimento inicial, secciones 1–4 enteras a 1280×720; con ≤ 3 parámetros, también a 1440×900 | Secciones 1–5 a 1280×720 (original) | Medido: las secciones 1–4 ocupaban 816 px de 672 disponibles con las medidas de DESIGN §4.2 y §6.1. Se compactó lo compatible con el diseño (tarjetas de 56 px, «Sobre este campo» en la cabecera, 4 px entre ecuaciones) y se conservaron las vistas previas, que son la ayuda principal del editor | Sí |
| D-34 | Controles deshabilitados con `aria-disabled` (enfocables) y motivo en la descripción emergente | Atributo `disabled` nativo | Un control `disabled` no recibe el foco: el motivo (DESIGN §7) no llegaría al teclado ni al lector de pantalla | Sí |
| D-35 | Las pruebas de rendimiento (`@rendimiento`) se ejecutan al final, en un proyecto propio de Playwright | Junto al resto, en paralelo | Con dos navegadores con WebGL por software compitiendo por la CPU, una tarea de 52 ms en modo desarrollo medía la carga, no la aplicación; en producción, la ráfaga deja el hilo principal inactivo el 89 % del tiempo | Sí |
| D-36 | Nombres cortos en las tarjetas de ejemplo («Radial +», «Radial −») y nombre completo en el nombre accesible | Nombres completos en dos líneas (72 px) | Altura de 56 px de DESIGN §6.1 y densidad (D-33); el nombre accesible contiene el visible (WCAG 2.5.3) | Sí |
| D-37 | VV-05 revisado: cono proyectado ≥ 6 px en ≥ 95 % de las flechas de la mitad delantera legibles por su geometría (‖F‖ ≥ 20 % F_ref y a más de 30° del rayo de vista) + muestra manual de 20 | Todas las flechas de la mitad delantera | Las flechas débiles se escalan enteras por diseño (DESIGN §9.2) y las que apuntan a la cámara se leen por la base oscura y el degradado (REV-01). Medido en C1 a 1440×900: 97.9 % (229/234); muestra manual 20/20 | Sí |
| D-38 | Sesgo de profundidad de los glifos como fracción (2 %) de su distancia, a lo largo del rayo de vista | Desplazamiento constante en NDC | 0.002 en NDC equivalía a ≈ 10 unidades a la distancia de encuadre: los cheurones pasaban por delante de flechas más cercanas. Con el rayo de vista la posición en pantalla no cambia | Sí |
| D-39 | La estela de las partículas guarda una posición cada 3 fotogramas (12 posiciones ≈ 0.6 s) | Una por fotograma | Con una por fotograma la estela medía 0.2 s (≈ 10 px) y la tapaba el propio punto. SPEC §5.8 («últimas 12 posiciones») se mantiene | Sí |
| D-40 | Anillo de rot F con dos puntas opuestas, orientadas hacia la cámara | Una punta fija (DESIGN §9.7) | Con la vista inicial la punta fija quedaba detrás del eje. La delantera se ve siempre de perfil; las dos respetan la regla de la mano derecha (Vitest y e2e) | Sí |
| D-41 | C_ref y V_ref con estado propio (`flechas.escalaRot`, `corte.escala`), fijables desde la leyenda; SPEC §7.2 actualizado | Compartir F_ref | Unidades distintas (F, ∇×F, escalar del corte); cambiar de escalar libera V_ref | Sí |
| D-42 | Una sola regla para recolocar el corte: z = 0 si está dentro de Ω y, si no, el centro (al activarlo, al cambiar de plano y al cambiar el dominio) | Centro de Ω al cambiar el dominio | F6.1 y F4.3 coherentes; se actualizó la prueba de H4 que esperaba el centro | Sí |
| D-43 | Mapa escalar del corte opaco; lo apoyado en el plano (flechas, curva de nivel, contorno) se dibuja encima | Mapa semitransparente | La banda oscura y los patrones se leen sin interferencias de lo que hay detrás; DESIGN §9.2 ya prevé halos frente al mapa | Sí |
| D-44 | Glifos ↺/↻ y ⊙/⊗ fijos según el signo respecto a +n (no según el lado desde el que se mira) | Invertirlos al mirar desde −n | Coinciden siempre con el patrón (puntos/rayado) y con la leyenda, que nombra la referencia («visto desde +z», «hacia +y») | Sí |
| D-45 | div F y rot F se muestran con los términos semejantes agrupados (2ω, 2x, 0), en un paso aparte de la derivación | Simplificar en la derivación | Los árboles que se evalúan no cambian (MAT-04 intacta); solo cambia lo que se lee | Sí |
| D-46 | El clic elige el impacto más cercano entre las flechas del volumen, las del corte y el plano del corte. Sobre una flecha, P es su nodo exacto; sobre el plano sin flecha, el punto exacto del plano | Solo flechas, o redondear el plano a la rejilla | Con el corte activo se puede inspeccionar cualquier punto del plano (INS-01 (2)); el nodo exacto hace que la tarjeta y la flecha cuenten lo mismo (INS-03) | Sí |
| D-47 | Tecla I sin P: P en el origen si está en Ω (si no, en el centro de Ω), y el foco va a la coordenada x | Siempre el centro de Ω | En el dominio por defecto coinciden; el origen es la referencia natural de los campos del catálogo | Sí |
| D-48 | En el inspector, «0» se decide con una escala por magnitud: ‖F‖ para las componentes de F y max(1, máx\|J\|) para div, rot, J y autovalores | Umbral absoluto fijo | Las derivadas numéricas dejan restos de 10⁻¹⁷ que no deben leerse como «fuente» o «giro» | Sí |
| D-49 | JSON v1: solo `formato`, `version` y `campo` son obligatorias; si falta otra clave se usa la del ejemplo base y se avisa. Se añaden `campo.modificado` y `cifras` (opcionales) para que la ida y vuelta sea exacta | Todas obligatorias | El ejemplo de SPEC §7.2 se abre tal cual; un archivo escrito a mano no falla por una omisión, pero nunca en silencio | Sí |
| D-50 | El autoguardado no se recupera ni se escribe en el modo de captura (`?captura`), y `?campo=` tiene prioridad sobre él | Siempre activo | Las capturas reutilizan el contexto del navegador: con autoguardado, cada escena dependería de la anterior | Sí |
| D-51 | La imagen exportada copia la composición de la pantalla: tarjeta de ecuaciones arriba a la izquierda y leyenda abajo a la izquierda, dibujadas en Canvas 2D con los mismos textos y glifos (trazados SVG con `Path2D`). 3840 × 2160 = 1920 × 1080 a escala 2 (mismo encuadre, el doble de detalle; las tarjetas miden exactamente el doble) | Rasterizar el DOM con `foreignObject`; banda lateral | Chrome contamina el lienzo con `foreignObject` y no deja exportarlo; la leyenda impresa es la misma que se ve (prueba de igualdad de textos) | Sí |
| D-52 | Al aplicar una cámara, OrbitControls la pasa por coordenadas esféricas (restos de 10⁻¹⁵): el estado se compara exacto y la cámara del controlador con tolerancia 10⁻⁹ | Forzar la posición exacta tras cada actualización | La escena resultante es idéntica píxel a píxel (V-FUN-10); el redondeo no es observable | Sí |
| D-53 | Con el panel como cajón (768–1279 px), abrir la ayuda lo pliega | Dos cajones a la vez | En 1024 px no queda escena útil entre dos cajones de 320 y 400 px; el botón «Panel» lo vuelve a abrir | Sí |
| D-54 | Panel de 336 px a partir de 1600 px (DESIGN §5.4); la fracción mínima de escena a 1920 × 1080 pasa del 79 % al 78 % (máximo posible: 78.8 %) | Panel fijo de 320 px | DESIGN §1 y §5.4 se contradecían; la prueba de VIS-03 lo detectó y se corrigió §1 | Sí |
| D-55 | Lo que flota en la escena se reparte en el área libre cuando hay un cajón abierto: con el panel como cajón, leyenda arriba a la izquierda, inspector arriba a la derecha, barra abajo a la derecha y notificaciones abajo a la izquierda; con la ayuda abierta, la barra sube (sin triedro), el inspector queda debajo y la fila inferior es de la leyenda; en el modo consulta con la ayuda, lo flotante se oculta | Apartar solo horizontalmente | En 1024 y 1280 px no caben leyenda, notificación y barra en una fila (VV-08); nada enfocable queda tapado (V-A11Y-03) | Sí |
| D-56 | Proyección ortográfica «emparejada»: la cámara ortográfica copia posición y orientación de la de navegación y su semialto es d·tan(FOV/2) | Cámara ortográfica independiente con su propio zoom | La órbita, el zoom, la selección y la escala de la leyenda (px por unidad en el objetivo) no cambian; RF-13 (P0) no la tenía y se detectó al completar los atajos de PLAN §3.1 | Sí |
| D-57 | La capa de ejes crea una sola vez sus objetos y materiales (caja, líneas, puntas, letras y «0»); al cambiar el dominio solo cambian geometrías, posiciones y marcas numéricas | Desecharlos y recrearlos | Al desechar sus materiales, three.js liberaba 4 programas de shader que nadie más usaba y el siguiente fotograma los recompilaba: una tarea de 0.5 s en C0 (SwiftShader) y un tirón en hardware real con cada cambio de dominio o de ejemplo. Lo encontró V-FUN-16 (respuesta de 1013 ms); prueba de regresión: los ids de los programas no cambian tras tres cambios de dominio | Sí |
| D-58 | V-FUN-16 mide la respuesta de la aplicación al final de la ráfaga (clic → estado aplicado → malla calculada y entregada a la escena, < 1 s) y exige que ninguna tarea del hilo principal pase de 250 ms; el fotograma presentado se anota como dato | Exigir el fotograma presentado < 1 s | En C0 el proceso GPU (WebGL y rasterizado por software) tarda hasta ~1.5 s en ponerse al día tras la ráfaga con el hilo principal libre (traza: `RasterDecoderImpl::DoEndRasterCHROMIUM` hasta 225 ms por tarea y ninguna mutación del DOM después de 400 ms); sin ráfaga, el mismo clic se dibuja en ~100 ms. Los fotogramas se miden en R1 (VAL-03, VALIDATION §6.1: «los FPS de C0 no cuentan») | Sí |
| D-59 | En C0, `npm run perf` mide 60 fotogramas (no 600) y no juzga la latencia de PERF-C; ambas cuentan en R1 | Medir y juzgar igual en C0 | En C0 cada fotograma lo dibuja la CPU (2.6 s en PERF-A, 7 s en PERF-B) y la latencia de PERF-C termina en un fotograma; VALIDATION §6.1 ya dice que en C0 solo cuentan los tiempos de cálculo y las tareas largas | Sí |
| D-60 | El anillo de foco de la escena es un `outline` de 2 px con desplazamiento −2 px | Sombra interior (`box-shadow: inset`) | La sombra interior de un elemento reemplazado se pinta debajo de su contenido: el dibujo WebGL, opaco, la tapaba y el foco de la escena no se veía. La auditoría de foco de A11Y-01 leía estilos calculados y la daba por buena; ahora descarta las sombras interiores en canvas, img y video (falla con el estilo anterior). Lo destapó la captura de referencia C12 de REV-04, idéntica a C1 salvo 4 píxeles | Sí |
| D-61 | El recuento manual de VV-06 («≤ 25 interactivos visibles en reposo») se juzga dentro del panel, en V2 (referencia de composición) y V3; el de toda la página y el de V1 se anotan | Contar toda la página, como en REV-02 | VV-06 trata de la densidad del panel. En REV-02 la página tenía 22–24, pero desde H5 suma la barra de la escena (8 botones), la leyenda y la propia escena (31 en V3), y VIS-06 lo anotó sin juzgarlo. En el panel: 22 (V2), 16 (V3); en V1, 29 porque la altura extra enseña cuatro secciones plegadas más | Sí, revisable por el usuario |
| D-62 | **Alcance**: caja ampliable («Ampliar ×2», «Estrechar ÷2») **y** espacio sin límites en la vista libre. **Dilatación**: uniforme | Solo caja; dilatación por eje con candado | Respuestas del usuario (2026-10-04) a las dos preguntas del plan de la 1.1 | Sí |
| D-63 | `t` se evalúa en una ranura más del vector de parámetros, `p[nParámetros]` | Nueva firma `F(x, y, z, t, p)` | Los evaluadores, el *worker*, la caché del campo compilado y el protocolo no cambian; un campo sin `t` ignora la ranura | Sí |
| D-64 | $F_{\text{ref}}$ y $C_{\text{ref}}$ automáticas de un campo temporal: P95 en 9 instantes equiespaciados de la ventana | P95 en el instante mostrado | Con la escala por instante, un campo que crece se vería siempre igual (SPEC §3.10) | Sí |
| D-65 | Vista libre sin captura del puntero (arrastrar para mirar) y con pantalla completa solo si el navegador la concede; salir restaura la pose de entrada | *Pointer lock*; conservar la pose del vuelo | El arrastre funciona igual con ratón, panel táctil y pruebas automáticas, y Esc no compite con la liberación del puntero; volver al laboratorio exactamente donde se dejó es predecible | Sí |
| D-66 | Dilatación como transformación de la cámara (posición, velocidad y plano cercano), alrededor del centro de Ω o, sin límites, del explorador; solo en la vista libre | Escalar el grupo raíz de la escena | Exacta por invariancia proyectiva (SPEC §3.11) y sin tocar capas, selección ni exportación | Sí |
| D-67 | Espacio sin límites: ventana anclada a la red de Ω, escalas congeladas al activarlo, semillas ancladas a una red gruesa, ejes por el origen sin caja | Ventana centrada exactamente en la cámara; escala automática por ventana | Sin anclaje las flechas «nadarían» al moverse; con escala por ventana el campo parecería cambiar (SPEC §3.11) | Sí |
| D-68 | Catálogo de 9 campos en 3 × 3; al elegir uno temporal se activan las partículas | 8 campos; no tocar las capas | La rejilla queda completa; las trayectorias son la razón de ser de esos campos | Sí |
| D-69 | Un único reloj para $t$ y las partículas; mover $t$ a mano o cerrar el bucle hace renacer las partículas | Conservarlas | Una trayectoria integrada hasta otro instante no es una trayectoria del instante elegido (SPEC §3.10) | Sí |
| D-70 | Con el reloj en marcha y un campo temporal: una petición en curso por tipo (malla, corte, líneas), sin el retardo de 120 ms de las líneas; cada resultado guarda su $t$ | Cancelar y relanzar en cada fotograma | Cancelar en cada fotograma dejaría sin terminar los cálculos de más de un fotograma | Sí |
| D-71 | JSON v2 con migración 1 → 2 sin avisos de «falta» (solo la nota de conversión) | Seguir en v1 con claves opcionales | D-49 avisaría de la «falta» de las claves nuevas al abrir un v1; SPEC §7.2 ya preveía migraciones | Sí |
| D-72 | El vuelo integra hasta el instante de cada pulsación y suelta de tecla, en subpasos de 1/60 s (como mucho 0.25 s seguidos) | Integrar solo en los fotogramas, con el paso acotado a 0.05 s | Hallazgo de V-FUN-18: con fotogramas lentos (WebGL por software) una pulsación corta no movía la cámara y el recorrido no correspondía al tiempo pulsado; ahora sí, sea cual sea la frecuencia de fotogramas | Sí |
| D-73 | La nota «Convertido de la versión 1 a la 2» va al final de los avisos de una importación | Al principio | La notificación muestra el primer aviso: debe ser lo que el usuario tiene que revisar (claves ignoradas o ausentes), no la conversión | Sí |
| D-74 | Los campos temporales usan el parámetro `omega` (se muestra ω), como el rotacional | `w` | `w` se mostraba como «w»; SPEC §4.9 corregida | Sí |
| D-75 | La interfaz (inspector, rueda, lectura de t, deslizador) sigue al reloj como mucho 10 veces por segundo; la escena y el cálculo, en cada fotograma | Repintar React en cada fotograma | El reloj cambia ~60 veces por segundo; repintar el panel y la aplicación con esa frecuencia no aporta lectura y cuesta tiempo del hilo principal (RNF-04) | Sí |
| D-76 | Segunda etiqueta de una fila del panel («Velocidad») con clase propia; «Inicio» y «Fin» de la ventana de $t$ en filas propias con campos de 112 px | `.fila-etiqueta`; ambos extremos en una fila | La auditoría de alineación (VV-04) exige que las `.fila-etiqueta` empiecen en el margen de 16 px; con los dos extremos en una fila «Fin» saltaba de línea y 4π = 12.56637061 se recortaba (revisión de C15) | Sí |
| D-77 | La fórmula de F, si no cabe en el panel, se desplaza en horizontal y entra en el orden de tabulación como región con nombre; si cabe, no añade parada | Fórmula siempre enfocable; reducir la letra | Hallazgo de la auditoría axe de TMP-05 con la silla giratoria (`scrollable-region-focusable`, WCAG 2.1.1). Afecta también a ecuaciones largas de la 1.0; una parada de tabulación vacía cuando cabe estorbaría al teclado | Sí |
| D-78 | VV-06 en la 1.1: a 1280×720, secciones 1–3 enteras y el título de «Parámetros» visible (la 1.0 tenía 1–4); a 1440×900, secciones 1–4 y «Tiempo» enteras | Tarjetas de 32–40 px de alto (miniatura a la izquierda); pestañas «Estacionarios · Con tiempo»; quitar la miniatura o la marca ✓ | Las tres tarjetas temporales (RF-26) añaden 64 px y «Parámetros» acaba en y = 780 de 720 (REV-05). Con 32–40 px no caben la miniatura y «Rotacional» en 90 px; las pestañas ahorran 24 px y esconden los campos temporales; sin ✓ empeora VV-07. El usuario pidió conservar el aspecto del laboratorio; en V1 y V2 todo cabe | Sí |
| D-79 | V-FUN-16 (robustez, con su medida «responde en < 1 s») pasa al proyecto «rendimiento»: en serie, al final y sin otras pruebas en paralelo | Subir el umbral; repetir la prueba si falla | Hallazgo de VAL-04: en la batería completa midió 1003 ms con otra prueba en paralelo; sola, 220–520 ms, y el código de la 1.0 en las mismas condiciones da 246–562 ms (no hay regresión). Con WebGL por software el fotograma que lanza la malla depende del proceso GPU, que otra prueba satura. Es la misma regla que ya seguían las medidas @rendimiento | Sí |
| D-25 | La tabla de contrastes de VIS-01 es una prueba de Vitest (`src/design/tokens.test.ts`) en lugar de un *script* aparte | `scripts/contraste.ts` | Importa los tokens reales sin duplicarlos y se ejecuta en cada `npm test` | Sí |

---

## 4. Supuestos

| ID | Supuesto | Si resulta falso |
| --- | --- | --- |
| S-01 | Público universitario de cursos superiores y expertos (confirmado por el usuario) | — |
| S-02 | Uso principal en escritorio a ≥ 1280×720 | Reforzar VIS-06 |
| S-03 | El usuario dispone de Node ≥ 22.12 para ejecutar en local | Documentar la instalación con nvm o fnm |
| S-04 | Equipo de referencia R1: i9 + RTX 4060 + 144 Hz (confirmado por el usuario); resolución del monitor por registrar en la medición | Recalibrar los objetivos de V-PERF |
| S-05 | Navegadores modernos con WebGL2 | Estado vacío informativo; no hay respaldo en 2D |
| S-06 | Sin servidor ni cuentas | — |
| S-07 | Bastan 8 parámetros | Subir el límite (afecta a la densidad del panel) |
| S-08 | Magnitudes adimensionales | Sistema de unidades: ampliación futura |

---

## 5. Riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación |
| --- | --- | --- | --- | --- |
| R-01 | Saturación visual en 3D: muchas flechas solapadas | Alta | Alto | 9³ por defecto, halo, «solo en el corte», vistas ortográficas, prueba de estrés C7 (VV-05) |
| R-02 | Errores del analizador propio | Media | Alto | Oráculos nativos, más de 100 casos, *fuzzing*, propiedades; plan B mathjs |
| R-03 | Rendimiento en GPU integrada; FPS no medibles en C0 | Media | Medio | Medición en R1 (VAL-03); ajustar valores por defecto antes de optimizar |
| R-04 | Partículas en el hilo principal más caras de lo previsto | Baja | Medio | Pasarlas al *worker* con posiciones transferibles |
| R-05 | `LineMaterial.resolution` sin actualizar al exportar: grosores erróneos | Media | Bajo | Incluido en el procedimiento de EXP-03 y comprobado en V-FUN-12 |
| R-06 | Fugas de color (navegador, KaTeX, controles nativos) | Media | Medio | Contramedidas de DESIGN §2.4 + auditoría de paleta en todas las capturas |
| R-07 | Referencias visuales dependientes de la plataforma | Alta | Bajo | Referencias solo en Linux/Chromium 1194; revisión manual en el resto |
| R-08 | Malinterpretación pedagógica (proyección en el corte, radial ≠ Coulomb, partículas ≠ Newton, umbral ≈ 0 ≠ cero exacto) | Media | Alto | Avisos fijos en la interfaz, fichas con supuestos, ayuda «Supuestos» |
| R-09 | Alcance de la 1.0 demasiado amplio | Media | Alto | P1 recortable; ampliaciones separadas; primera entrega vertical temprana (H1) |
| R-10 | Cada push a `main` relanza el despliegue de Pages del juego de la raíz | Alta | Bajo | Inocuo: el *build* de la raíz no incluye esta carpeta; se comprueba en FND-01 |
| R-11 | Ecosistema y TypeScript 7 | Baja | Bajo | TypeScript 6 (D-05) |
| R-12 | Criterios WCAG y documentación de MDN citados sin acceso a w3.org ni a MDN (bloqueados por la red) | Media | Bajo | Contrastarlos con las fuentes oficiales al implementar VIS-01 y A11Y-01 |
| R-13 | Muestreo insuficiente engañoso (*aliasing*) en campos oscilantes | Media | Medio | Ejemplo en la ayuda (SPEC §5.10); aviso automático como AMP-11 |
| R-14 | Evaluación compilada entre 3.4× y 8× más lenta que la nativa (V-PERF-05, medido en MAT-03; objetivo orientativo ≤ 3×). Peor caso estimado de PERF-B ≈ 1.6 s si todas las líneas agotan sus pasos | Media | Medio | Hecho en CMP-02: cálculo en el worker, troceado también dentro de cada línea (D-30), cancelable en ≈ 10 ms y con progreso a partir de 300 ms. Falta medir en R1 (VAL-03). Si no basta: evaluación vectorizada por lotes o reducir semillas por defecto |
| R-15 | Con un campo temporal en reproducción, malla, corte y líneas se recalculan a cada instante: la frecuencia de fotogramas en R1 (y con N = 21 o 2000 partículas) no está medida | Media | Medio | Una petición en curso por tipo, sin cancelar en cada fotograma (D-70); la interfaz se refresca a 10 Hz (D-75); en C0, 0 tareas largas en 6 s de reproducción con los tres campos temporales. Medir en R1 con Q-06 (añadiendo un campo temporal y la vista libre) |
| R-16 | Pantalla completa no disponible o denegada (Safari en iPad, iframes, políticas del navegador) | Media | Bajo | La vista libre funciona igual en la ventana: la pantalla completa es una mejora, no un requisito (SPEC RF-20); salir siempre restaura la interfaz |
| R-17 | Confundir líneas de corriente, trayectorias y trazas cuando el campo depende del tiempo | Media | Alto | Leyenda con el $t$ de cada capa («instantáneas en t = …», «trayectorias: ṙ = F(r, t)»), ayuda «Corriente, trayectoria y traza» y ficha con las trayectorias exactas de cada campo temporal (SPEC §3.10) |

---

## 6. Revisión de inconsistencias, dependencias y alcance

Hallazgos de la revisión del encargo y de los propios documentos, y su resolución:

1. **`#404040` como borde de controles** no alcanza 3:1 (1.84:1). → `--control #757575` para
   controles; `#404040` solo para separadores (D-07).
2. **«Elementos destacados en #F5F5F5»** frente a la rampa de magnitud, que también llega a
   `#F5F5F5`: la selección no puede depender del tono. → Selección por forma, cruz y
   etiqueta (DESIGN §9.5).
3. **Luminancia = magnitud** es incompatible con la iluminación, la niebla y la
   transparencia. → Materiales sin iluminación (D-08).
4. **Longitud en 3D** sufre escorzo. → Luminancia como codificación redundante e
   independiente de la vista (DESIGN §1, principio 5).
5. **Cortes**: la proyección plana no da líneas de corriente 3D. → Advertencia explícita;
   líneas 2D pospuestas (D-17).
6. **Catálogo**: $(x,y,z)$ no es el campo de Coulomb; partículas con $\dot{\mathbf r}=\mathbf F$
   no siguen la dinámica de Newton. → Fichas con supuestos (SPEC §4) y FA-01.
7. **Exportación de imágenes** frente a etiquetas en DOM. → *Sprites* en el lienzo y
   composición propia (D-13).
8. **«Capturas en tamaños definidos»** frente a renderizado dependiente de la plataforma. →
   Referencias en Linux y revisión manual en el resto (R-07).
9. **«Indica el equipo»** frente a un entorno sin GPU. → Separación entre R1 (FPS) y C0
   (CPU) (VALIDATION §6.1).
10. **Separador decimal en español** frente a la sintaxis de expresiones. → Punto (D-09).
11. **Movimiento reducido** frente a la animación como recurso pedagógico. → Partículas en
    pausa al inicio y estelas que muestran el sentido sin moverse.
12. **Dependencia ausente detectada**: el inspector necesita las derivadas (NUM-02, MAT-04)
    y los cortes, la selección sobre el plano (REN-05 → INS-01). Incorporadas al grafo.
13. **Dependencia ausente detectada**: la exportación PNG depende de la leyenda completa
    (VIS-05), no solo de la escena. Incorporada.
14. **Orden de convergencia**: medirlo en una vuelta completa de circunferencia es frágil
    (cancelaciones). → Arco parcial (T-12), detectado en la calibración.
15. **Alcance excesivo evitado**: equilibrios numéricos, isosuperficies, líneas 2D en cortes,
    enlace compartible, deshacer general y despliegue pasan a ampliaciones (SPEC §2.2).
16. **Rama de trabajo** por detrás de `main` (era antecesora directa). → Avanzada a `main`
    por avance rápido antes de escribir; sin conflictos.
17. **Cierre de órbitas** (hallazgo de NUM-03 al registrar las medidas de T-08): la línea
    sobrepasaba la semilla y volvía hacia atrás. → SPEC §5.7, T-08 y el integrador
    corregidos (D-31).
18. **Capas**: el worker necesitaba la geometría de las flechas, que vivía en `render/`. →
    Nueva capa pura `geometria/` (D-29).
19. **«Deshacer» caducado** (hallazgo de UI-07): el plazo de 8 s corría aunque la
    notificación estuviera pausada, y un botón «Deshacer» visible no hacía nada. → Ahora
    vale mientras su notificación esté visible.
20. **Inercia de la órbita** (hallazgo de UI-05): OrbitControls seguía aplicando el giro
    pendiente sobre una pose fijada por programa, y «Deshacer» no la restauraba exacta (deriva
    medida de 0.21 unidades). → La inercia se anula al fijar o encuadrar la cámara.
21. **Re-renderizado completo** con cada parámetro (722 ms de `jsxDEV` en la ráfaga de CMP-02 y
    tareas largas de hasta 62 ms en desarrollo). → Componentes memorizados: 0 tareas largas.
22. **Densidad del panel inalcanzable** (VV-06). → D-33.
23. **Leyenda y estado vacío** (REV-02): la leyenda mostraba rampa y escala sin flechas en la
    escena y el estado vacío no se leía sobre las aspas. → Entradas condicionadas y tarjeta
    opaca.
24. **Accesibilidad** (axe-core): identificadores con espacios en la galería, `aria-label` en
    un `div` genérico y deslizador sin nombre (el nombre KaTeX es MathML). → Corregidos; axe sin
    infracciones en la galería y en la aplicación.

Versión 1.1 (H10):

25. **¿Es riguroso un campo que cambia con el tiempo?** (duda del usuario). → Sí: los campos
    $\mathbf F(\mathbf r,t)$ son el objeto de las ecuaciones de Maxwell, de la mecánica de
    fluidos y de los sistemas no autónomos $\dot{\mathbf r}=\mathbf F(\mathbf r,t)$. El rigor
    exige no confundir líneas de corriente (instantáneas), trayectorias y trazas, que solo
    coinciden si el campo es estacionario: SPEC §2.5 y §3.10, leyenda con el $t$ de cada capa
    y R-17.
26. **Vuelo con fotogramas lentos** (hallazgo de V-FUN-18): una pulsación corta no movía la
    cámara con WebGL por software. → Integración hasta cada evento de teclado (D-72).
27. **Fórmula desplazable sin teclado** (hallazgo de axe en TMP-05, también en la 1.0 con
    ecuaciones largas). → Región enfocable solo si desborda (D-77).
28. **Densidad de V3 con nueve tarjetas** (REV-05). → Criterio revisado con motivo (D-78).
29. **«Fin» recortado** en la ventana de $t$ (REV-05). → Filas propias para Inicio y Fin (D-76).

---

## 7. Siguiente paso: las tres comprobaciones del usuario

La parte de H9 que se puede hacer en este entorno está terminada. Quedan tres comprobaciones
que necesitan tu equipo, todas con `entrega/campos-vectoriales.html` y un guion:

| Pregunta | Cierra | Guion | Duración |
| --- | --- | --- | --- |
| Q-04 · sesión con lector de pantalla | A11Y-02 (y confirma REV-04) | [evidencia/A11Y-02/guion-lector.md](evidencia/A11Y-02/guion-lector.md) | ~15 min |
| Q-05 · prueba de humo en Firefox y Safari | VAL-02 | [evidencia/VAL-02/guion-humo.md](evidencia/VAL-02/guion-humo.md) | ~10 min por navegador |
| Q-06 · medición en R1 (i9 + RTX 4060 + 144 Hz) | VAL-03 | [evidencia/VAL-03/guion-R1.md](evidencia/VAL-03/guion-R1.md) | ~15 min |

Con la 1.1, haz las tres con el HTML nuevo y añade en cada guion un paso de la 1.1: en Q-04,
entrar y salir de la vista libre con V y leer la sección «Tiempo»; en Q-05, elegir «Viento»,
reproducir y entrar en la vista libre; en Q-06, unos segundos de reproducción de «Lluvia» y de
vuelo en la vista libre, mirando la fluidez (R-15).

Con tus notas (o los 9 informes JSON de Q-06) se marcan las tres tareas; si alguna obliga a
cambiar la aplicación, se corrige, se repiten las pruebas y las capturas afectadas y se
sustituye el HTML de `entrega/` con su nueva huella (ENT-01).

---

## 8. Preguntas abiertas

Ninguna bloquea H0 ni H1. Cada una tiene un valor por defecto:

| ID | Pregunta | Por defecto |
| --- | --- | --- |
| Q-01 | ¿Cuál es tu equipo? | **Respondida**: i9, RTX 4060, 144 Hz (D-20) |
| Q-02 | ¿Nivel del público? | **Respondida**: universitarios superiores y expertos (S-01, D-21) |
| Q-03 | ¿Publicación web? | **Respondida**: basta un HTML autocontenido y funcional (D-15) |
| Q-04 | Sesión con lector de pantalla (V-A11Y-04, A11Y-02): NVDA + Firefox o VoiceOver + Safari | **Pendiente del usuario**: necesita tu equipo. Guion en `evidencia/A11Y-02/guion-lector.md` (unos 15 min); con tus notas, A11Y-02 pasa a verificada. Todo lo automatizable ya pasa (axe, regiones vivas, VV-10) |
| Q-05 | Prueba de humo manual en Firefox y Safari (VAL-02) | **Pendiente del usuario**: en el contenedor solo hay Chromium (las 100 pruebas e2e pasan en él). Guion de 13 pasos en `evidencia/VAL-02/guion-humo.md` (unos 10 min por navegador); con tus notas, VAL-02 pasa a verificada |
| Q-06 | Medición de rendimiento en R1 (VAL-03): PERF-A, PERF-B y PERF-C, tres veces cada una | **Pendiente del usuario**: abrir `campos-vectoriales.html?perf=PERF-A` (B, C) en Chrome, «Iniciar medición» y «Descargar informe». Guion en `evidencia/VAL-03/guion-R1.md` (unos 15 min). C0 ya cumple todos los objetivos de cálculo con margen |

---

## 9. Registro de cambios

| Fecha | Cambio |
| --- | --- |
| 2026-10-02 | Planificación inicial: SPEC, DESIGN, PLAN, VALIDATION y STATUS; evidencia de calibración y de entorno en `evidencia/PLN-01/` |
| 2026-10-02 | Plan aprobado. Incorporadas las respuestas: R1 = i9 + RTX 4060 + 144 Hz; público experto; entrega como HTML autocontenido (RNF-14, D-15, D-20 … D-22, ENT-01) |
| 2026-10-02 | H0 y H1 completados y verificados; HTML provisional en `entrega/`; decisiones D-23 … D-28 |
| 2026-10-02 | H2, H3 y H4 completados y verificados (§1.2); decisiones D-29 … D-36 |
| 2026-10-02 | H5 completado y verificado: líneas de corriente, magnitud y escala, cortes, mapa escalar, rot F, rueda de paletas, partículas y leyenda completa; decisiones D-37 … D-45 |
| 2026-10-02 | H6 completado y verificado: selección de puntos, tarjeta del inspector y coherencia ecuaciones–geometría–leyenda–inspector en los 6 campos y T6; decisiones D-46 … D-48 |
| 2026-10-02 | H7 completado y verificado: configuración JSON v1 con validación estricta, autoguardado con recuperación y exportación PNG compuesta en tres tamaños; decisiones D-49 … D-52 |
| 2026-10-02 | H8: UI-06, A11Y-01 y VIS-06 completados y verificados; A11Y-02 con la parte automática superada (axe, regiones vivas, VV-10) y V-A11Y-04 pendiente del usuario; decisiones D-53 … D-56; RF-13 (ortográfica) completado |
| 2026-10-03 | H9: VAL-01 verificada (cobertura math 91.7 %, numerics 97.2 %; errores frente a tolerancias); VAL-02 con 101/101 e2e y trazabilidad V-FUN completa, pendiente la prueba de humo del usuario (Q-05). V-FUN-16 destapó la recompilación de shaders al cambiar el dominio (D-57); decisiones D-57 y D-58; dos fallos intermitentes del arnés corregidos (proyecto «rendimiento» en serie; selectores de archivo) |
| 2026-10-03 | H9: VAL-03 en C0. Modo de medición `?perf=` con informe JSON, `npm run perf` con comprobación de objetivos y de regresión, escenas PERF-A/B/C; en C0, malla 15³ 1.2 ms, corte 41² 4.5 ms, líneas 33.9 ms (PERF-A) y 77.1 ms (PERF-B), 0 tareas largas en PERF-C; falta R1 (Q-06); decisión D-59 |
| 2026-10-03 | H9: REV-04 verificada. Matriz completa de 42 capturas sobre el HTML autocontenido y capturas de referencia en `tests/visual`; destapó el foco invisible en la escena (D-60, corregido) y aclaró el recuento de VV-06 (D-61) |
| 2026-10-04 | **Versión 1.1 (H10)**: petición del usuario (vista libre inmersiva, alcance y dilatación, dimensión temporal si es rigurosa). Juicio: los campos dependientes del tiempo son rigurosos (SPEC §2.5) y se incorporan (AMP-01). Plan escrito en SPEC §2.5, §3.10, §3.11, §4.9, §5.11, §7.2; DESIGN §5.5, §6.3, §9.13; PLAN F11–F13, §3.2 y §5.3; VALIDATION T-20 … T-26 y pruebas nuevas; decisiones D-62 … D-71 |
| 2026-10-03 | H9: ENT-01 verificada (HTML final reproducible, 103/103 e2e sobre file://) y DOC-01 (README nuevo ejecutado desde un clon limpio, ayuda revisada frente al código, enlaces e identificadores comprobados con `scripts/revisar-docs.mjs`). Quedan Q-04, Q-05 y Q-06 |
| 2026-10-04 | **H10 completado y verificado** (1.1): TMP-01 … TMP-06, ALC-01, ALC-02, VL-01, VL-02, VAL-04 (cobertura math 93.2 %, numerics 95.3 %; e2e completas en verde), REV-05 (45 capturas C1–C15 × V1–V3; tres incidencias resueltas), ENT-02 (HTML 1.1 reproducible, `47b8f541…`, e2e sobre file://) y DOC-02; decisiones D-72 … D-79; riesgos R-15 … R-17 |

---

## 10. Lista de comprobación final (DOC-01)

| # | Comprobación | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | Un tercero ejecuta el proyecto siguiendo solo el README | ✓ Clon limpio de `main`: `npm ci`, `npm run check` (419 pruebas), `npm run build` (misma huella `c091c977…`), `npm run dev` (200) y 15/15 e2e | [evidencia/DOC-01/](evidencia/DOC-01/) |
| 2 | Enlaces relativos e identificadores de la documentación | ✓ 7 documentos, 74 enlaces, ~1000 citas: sin problemas (`node scripts/revisar-docs.mjs`) | [evidencia/DOC-01/](evidencia/DOC-01/) |
| 3 | La ayuda dice lo que hace el código | ✓ Cada cifra de «Supuestos» comprobada en el código; atajos generados de la misma tabla; funciones de la sintaxis desde el catálogo de funciones (prueba de `contenido.test.ts`) | [evidencia/DOC-01/](evidencia/DOC-01/) |
| 4 | STATUS refleja el estado real con enlaces a la evidencia | ✓ §1 (fase, siguiente paso, bloqueos), §1.2 (tareas con commit y evidencia), §7 (pendiente del usuario) y §9 (registro) al día | Este documento |
| 5 | El HTML entregado es el de la compilación del commit | ✓ `entrega/` = `dist/` del commit de ENT-01, compilación reproducible | [evidencia/ENT-01/](evidencia/ENT-01/) |
| 6 | Lo pendiente está identificado, con guion y responsable | ✓ Q-04, Q-05 y Q-06 (usuario), §7 | §7 y §8 |

Revisado por Claude Code el 2026-10-03. Pendiente: tu conformidad al leerla.

---

## Anexo A · Herramientas de planificación

En `evidencia/PLN-01/`:

- `entorno.txt`: inspección del entorno (versiones, WebGL2, grosor de línea, avisos de
  seguridad del registro npm).
- `contraste.py` → `contraste.txt`: contrastes WCAG y L\* de la paleta.
- `calibrar.py`, `calibrar_arco.py` → `calibracion.txt`: experimento numérico que justifica
  las tolerancias de VALIDATION §2.
