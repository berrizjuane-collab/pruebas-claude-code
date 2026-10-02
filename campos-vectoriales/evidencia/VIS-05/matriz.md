# VIS-05 · Matriz de codificación científica (VV-09)

Fecha: 2026-10-02 · Chromium 1194 (SwiftShader) · servidor de desarrollo y HTML autocontenido.

Para cada fila de la tabla de codificación (DESIGN §9.1) se indica qué la comprueba y qué señal no
tonal la identifica. Las pruebas citadas están en `tests/e2e/h1.spec.ts` (H1), `h4.spec.ts` (H4) y
`h5.spec.ts` (H5), y en las pruebas unitarias de `src/` (Vitest). «Superada» significa que la prueba
automática pasa y que la revisión de las capturas de REV-03 lo confirma.

| # | Variable visual · marca | Significado | Señal no tonal | Escena de prueba | Comprobación | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Orientación del glifo · flecha | Dirección de F (o de ∇×F con «Glifos: rot F») | Forma (eje de la flecha) | Helicoidal; campo con ∇×F = (2x, 0, −2z) | V-FUN-05 (H1): dirección = F/‖F‖ (10⁻⁶ rad); `rotacional.test.ts`: dirección = ∇×F/‖∇×F‖ | Superada |
| 2 | Punta cónica · flecha | Sentido | Forma (cono) + base oscura y degradado al apuntar a la cámara | C1 | VV-05: cono ≥ 6 px en el 97.9 % de las flechas delanteras legibles por su geometría; muestra manual de 20 flechas: 20 identificables | Superada (criterio revisado, D-37) |
| 3 | Longitud · flecha | ‖F‖ (proporcional, saturada en F_ref) | Longitud | Escala fija entre campos | REN-04: ℓ = ℓmax·min(‖F‖/F_ref, 1) con error < 10⁻⁶; normalizada: 0.75 ℓmax constante | Superada |
| 4 | Luminancia, banda clara · flechas y glifos | ‖F‖ o ‖∇×F‖, según el modo | Texto de la leyenda («‖F‖» o «‖rot F‖», F_ref o C_ref) | Helicoidal y rotacional con «Glifos: rot F» | REN-04 (gris = rampa ± 1/255, lineal y log); REN-07 (leyenda con ‖rot F‖ y C_ref = 2); los dos modos son excluyentes | Superada |
| 5 | Doble punta · flecha | ‖F‖ ≥ F_ref (saturada) | Forma (dos conos) | Uniforme | VIS-04 (H1): todas saturadas y entrada «longitud saturada» en la leyenda | Superada |
| 6 | Rombo hueco ◇ · nodo, final de línea | ‖F‖ < 2 % F_ref | Forma | Rotacional (eje z), radial entrante | VIS-04; REN-03: rombos = motivos `CERO` | Superada |
| 7 | Aspa × · nodo, final de línea, mapa del corte | No definido o singular | Forma | √x; T5 con «Glifos: rot F»; √x con div F en el corte | REN-03: aspas = motivos `NO_DEFINIDO`; `rotacional.test.ts` (T5: × en x = 0); REN-06 (× en x < 0) | Superada |
| 8 | Trazo continuo fino · línea | Línea de corriente (luminancia constante) | Forma (curva continua) | Helicoidal | REN-03: 4 hélices, segmentos = vértices − líneas; material de gris único `#A0A0A0` | Superada |
| 9 | Cheurón › · línea | Sentido de F a lo largo de la línea | Forma (orientación) | Helicoidal | REN-03: coseno mínimo con F = 0.9997 (> 0.99), 109 cheurones | Superada |
| 10 | Círculo hueco ○ · semilla | Origen de la integración | Forma | Helicoidal, rejilla 3 × 3 | REN-03; UI-08 (semillas en el plano pedido) | Superada |
| 11 | Punto + estela que se estrecha · partícula | Posición actual y recientes | Forma (anchura decreciente con la antigüedad) | Helicoidal con partículas | REN-08: estela llena también en pausa (> 3200 tramos); anchura 2.5 → 0.5 px | Superada |
| 12 | Rectángulo discontinuo + etiqueta · plano | Plano de corte | Forma (discontinuo 6-4 px) + texto «x = −0.50» | XY, XZ e YZ | REN-05: esquinas en la posición pedida y rótulo en la esquina más cercana | Superada |
| 13 | Luminancia, banda oscura · superficie del corte | Valor absoluto del escalar | Texto de la leyenda («\|div F\| en z = 0.00») | T6 con div F | REN-06: banda ≤ L* 42 (sRGB ≤ 104) con patrón; disjunta de la banda clara | Superada |
| 14 | Patrón de puntos / rayado a 45° · corte | Signo + / − del escalar | Textura (puntos frente a rayas) | T6 con div F, vista XY | V-FUN-07 por píxeles: rayado con periodo √2·P (27 px frente a 26.6) y coherencia «/» 0.98; puntos con periodo P (19 frente a 18.8) e isótropos | Superada |
| 15 | Curva discontinua · corte | Nivel cero del escalar | Forma (discontinua) | T6 | V-FUN-07: todos los puntos en x = −0.5 ± 1 celda; trazo en el 60 % de las filas (6-4) | Superada |
| 16 | Glifos +/−, ⊙/⊗, ↺/↻ · corte | Signo de div, de F·n y de (∇×F)·n | Forma | T6, (0, 0, x), rotacional ω = ±1 | REN-06: formas por signo en las tres magnitudes; ‖F‖ sin signos | Superada |
| 17 | Anillo con flecha · glifo de rot F | Sentido de giro (mano derecha) | Forma (puntas en el anillo) | Rotacional ω = ±1 | REN-07 (Vitest y e2e): antihorario visto desde +z con ω = 1, horario con ω = −1; puntas delanteras hacia la cámara | Superada |
| 18 | Aro + cruz + etiqueta «P» · punto | Punto inspeccionado | Forma + texto | — | Pertenece a INS-01/INS-02 (H6). La rueda de paletas en P ya se dibuja (V-FUN-08) | Pendiente de H6 |
| 19 | Letra + estilo de línea · ejes | x continuo · y discontinuo · z punteado | Forma (estilo) + texto | Escena inicial | REN-01 (H1); REV-03: los rótulos de un eje que apunta a la cámara se ocultan | Superada |

## «Nunca significa» y «prohibido en la escena»

| Comprobación | Resultado |
| --- | --- |
| Sin luces, sin niebla, sin materiales iluminados (`auditarEscena`) | 0 luces, sin niebla, solo `MeshBasicMaterial`, `LineMaterial`, `ShaderMaterial` sin luz y `SpriteMaterial` |
| Flechas opacas | Solo son transparentes los glifos en pantalla (borde suavizado) y las etiquetas |
| La luminancia de las líneas no codifica magnitud | Gris único `#A0A0A0` |
| Banda clara y banda oscura disjuntas | L* 45.2–96.5 frente a 6–32 (42 con patrón): ningún glifo se confunde con el mapa |
| Una variable visual, un significado en cada momento | «Glifos: F · rot F» excluyentes; la leyenda nombra la banda clara («‖F‖» o «‖rot F‖») |

## Leyenda (DESIGN §9.12)

- **VV-09 automática**: en las 16 combinaciones de flechas, líneas, partículas y corte con escalar,
  los bloques de la leyenda son exactamente los de las capas visibles y en el orden magnitud → líneas →
  partículas → corte. 0 fallos.
- Las entradas dependen de lo que hay en la escena: saturadas, ◇ y × solo si aparecen; en el corte,
  solo los signos presentes y la curva de nivel si existe. Si el escalar es nulo en todo el corte, se
  dice («= 0 en todo el corte») en vez de mostrar una escala ficticia. «× no definido» aparece una sola
  vez.

## Estrés con 21³ (C7)

- Radial saliente con N = 21 (9261 flechas, ℓmax = 0.18): en la mitad delantera el cono completo mide
  ≈ 7.6 px a 1440×900 (≈ 9 px a 1920×1080).
- Revisión de C7 en V1–V3: en la mitad delantera las puntas se identifican (V1 y V2 con claridad; V3,
  en el límite, en la esquina delantera). En el interior la escena es densa por diseño: el modo «Flechas:
  solo corte» y las vistas XY/XZ/YZ son las herramientas previstas (DESIGN §9.11).

## Resumen

18 de 19 filas superadas; la fila 18 (punto P) corresponde a H6 y se comprobará en INS-01, INS-03 y
REV-04. Ninguna variable visual tiene dos significados simultáneos sin explicación en la leyenda.
