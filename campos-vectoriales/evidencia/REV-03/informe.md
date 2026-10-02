# REV-03 · Revisión de capturas de la escena

Fecha: 2026-10-02 · Chromium 1194 (SwiftShader, texto en gris), movimiento reducido · servidor de
desarrollo. Las mismas pruebas pasan contra el HTML autocontenido (`OBJETIVO=archivo`).

## Capturas (V1 1920×1080, V2 1440×900 @2x, V3 1280×720)

| Captura | Contenido |
| --- | --- |
| C1 | Estado inicial: Helicoidal, flechas + líneas (para VV-05) |
| C2 | Helicoidal con líneas y partículas, en pausa y con el reloj determinista |
| C3 | T6 `(x², y, 0)` con corte XY y «Escalar: div F» |
| C4 | Rotacional con la rueda de paletas en P = (1, 0, 0). La tarjeta del inspector llega con INS-02 (H6): C4 se repetirá completa en REV-04 |
| C7 | Radial saliente con la densidad máxima 21³ (9261 flechas) |
| C11 | Rotacional con «Glifos: rot F» y corte con «rot F · n» |

## Auditorías automáticas

| Comprobación | Resultado |
| --- | --- |
| **VV-01** Paleta monocroma (18 capturas: 6 escenas × 3 tamaños) | 18/18: 0 píxeles con max(\|R−G\|, \|G−B\|, \|R−B\|) > 3 |
| **VV-08** Maquetación (solapamientos, recortes, desplazamiento horizontal) | 0 incidencias en las 18 |
| **VV-04** Alineación del panel a 16 px y ritmo de 4 px | 0 desviaciones (22–27 anclajes por captura) |
| **VV-02** Tamaños de letra | {11, 12, 13, 14} px (+ KaTeX) en todas |
| Errores de consola | 0 |
| **VV-03** Contraste | axe: 0 infracciones con «Líneas de corriente», «Corte», «Divergencia y rotacional», «Avanzado» y «Detalles del cálculo» abiertos y la leyenda completa (45 reglas superadas). Escena: el gris más débil de la banda clara (`#6B6B6B`) frente al halo `#101010` da 3.57:1 (≥ 3:1) |
| **VV-05** Conos de la mitad delantera de C1 a 1440×900 | 229 de 234 flechas legibles por su geometría (‖F‖ ≥ 20 % F_ref y a más de 30° del rayo de vista) con cono ≥ 6 px: 97.9 % (criterio revisado, D-37). De las 93 con cono < 6 px, 26 son débiles (se escalan enteras, DESIGN §9.2) y 62 apuntan casi hacia la cámara (se leen por la base oscura y el degradado) |
| **VV-09** Codificación científica | Matriz de VIS-05: 18/19 filas superadas; la fila del punto P es de H6. Leyenda = capas visibles en las 16 combinaciones |
| **VV-10** Movimiento reducido | 0 animaciones en curso tras interactuar (secciones, leyenda, menú, botones); partículas en pausa al inicio; la cámara salta a la vista pedida |

## Revisión manual (lista de comprobación)

| # | Comprobación | Resultado |
| --- | --- | --- |
| 1 | C1: muestra de 20 flechas de la mitad delantera con el sentido identificable | 20/20 (también las escorzadas, por la forma del cono y su base) |
| 2 | Líneas distinguibles de flechas | Sí: trazo fino de gris constante con cheurones frente a glifos con cono y halo |
| 3 | El corte se identifica tras leer la leyenda una vez | Sí: contorno discontinuo, rótulo «z = 0.00» y bloque propio en la leyenda con el título del escalar |
| 4 | C3: signos de div F legibles | Sí: rayado y «−» a la izquierda de x = −0.5, puntos y «+» a la derecha, curva discontinua en x = −0.5 |
| 5 | C7: puntas identificables en la mitad delantera | Sí en V1 y V2; en V3, en el límite (≈ 5–7 px), identificables en la esquina delantera. El interior es denso por diseño (DESIGN §9.11: «solo corte» y vistas XY/XZ/YZ) |
| 6 | C11: glifos de rot F y corte con (rot F)·n sin ambigüedad | Sí: la leyenda nombra ‖rot F‖ con C_ref en la banda clara y \|(rot F)·n\| con V_ref en la oscura |
| 7 | C2: partículas y estela legibles junto a flechas y líneas | Sí: punto claro con halo y estela que se estrecha; la leyenda dice «animación en pausa» y τ |
| 8 | C4: rueda de paletas en P con su rótulo | Sí: cuatro palas sobre el eje +z, flecha curva de sentido en pausa y «ω = 1.000 rad/t» |

## Incidencias encontradas durante H5 y resolución

1. **Semillas leídas como «C»**: el glifo quedaba cortado por su propia línea. Primer arreglo: sesgo de
   profundidad en NDC. Ese sesgo resultó excesivo (≈ 10 unidades a la distancia de encuadre: los
   cheurones pasaban por delante de las flechas cercanas). Ahora el glifo se adelanta un 2 % de su
   distancia a lo largo del rayo de vista (misma posición en pantalla) (D-38).
2. **Rótulos amontonados en el origen** en las vistas XY/XZ/YZ («0−2»): el eje que apunta a la cámara
   oculta su letra y sus marcas; el triedro sigue indicando su sentido.
3. **Giro ↺/↻ ilegible a 13 px** (aro completo con punta): ahora es un arco de 300° con el hueco por
   delante de la punta, como el signo tipográfico.
4. **Puntas del anillo de rot F ocultas tras el eje** en la vista inicial: dos puntas opuestas
   orientadas hacia la cámara en cada fotograma (D-40).
5. **Estela casi invisible** (12 posiciones por fotograma = 0.2 s, ≈ 10 px tapados por el punto): una
   posición cada 3 fotogramas (≈ 0.6 s) (D-39).
6. **Leyenda del corte con signos que no aparecen** y con «V_ref = 1» para un escalar nulo: solo los
   signos presentes y la curva si existe; si el escalar es nulo en todo el corte, se dice.
7. **Divergencia y rotacional sin agrupar** («ω + ω», «y − y»): simplificación para mostrar con
   términos semejantes agrupados (2ω, 0); los árboles que se evalúan no cambian.

Todas las capturas se repitieron tras los arreglos y superan las auditorías automáticas.
