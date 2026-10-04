# REV-05 · Revisión visual de la 1.1

- Fecha: 2026-10-04 · navegador: Chromium 1194 (Playwright 1.56.1, SwiftShader) · HTML
  autocontenido de `dist/` (el de ENT-02) abierto con `file://`.
- Matriz: C1–C15 × V1–V3 (45 capturas en `capturas/`, auditorías en `capturas.json`).
  Movimiento reducido emulado y reloj determinista.
- Comando: `node scripts/capturas.mjs --tarea=REV-05 --capturas=C1,…,C15 --tamanos=V1,V2,V3 --objetivo=archivo`.
- Escenas nuevas (VALIDATION §7.2): C13 lluvia con ráfagas en t = 2 con partículas; C14 vista
  libre dentro del helicoidal (pose fijada con `fijarPoseVuelo`); C15 viento giratorio en
  t = 1.5 con la sección «Tiempo» abierta.

## Resultados

| VV | Capturas | Resultado | Nota |
| --- | --- | --- | --- |
| VV-01 Paleta monocroma | 45/45 | OK | 0 píxeles con max(\|R−G\|, \|G−B\|, \|R−B\|) > 3 (máximo medido: 0) |
| VV-02 Tipografía | 45/45 | OK | Tamaños {11, 12, 13, 14, 16} px, pesos {400, 500, 600}, Inter Variable y JetBrains Mono (+ KaTeX), como en REV-04 |
| VV-03 Contraste | todas | OK | axe sin infracciones graves en C1, C4, C6, C8, C9, V5 (h8-a11y), en la vista libre al salir (h10-vista-libre) y, nuevo, con un campo temporal: «Tiempo», «Vista libre», «Avanzado» e inspector temporal desplegados (h10-tiempo) |
| VV-04 Alineación y ritmo | 39 con anclajes | OK | 0 desviaciones (21–27 anclajes por captura). C8 (galería) y C14 (vista libre: sin interfaz) no tienen panel que anclar |
| VV-05 Claridad de la escena | C1, C7, C13, C14 | OK | e2e VV-05 (h5) sin cambios. A ojo: en C13 la lluvia cae inclinada según z y las líneas instantáneas se curvan con el viento; las partículas (puntos) se distinguen de las semillas (aros). En C14 el sentido de las flechas se lee desde dentro del campo y la pista de teclas es legible |
| VV-06 Densidad del panel | C1 | OK con D-78 | V2: secciones 1–4 y «Tiempo» enteras, 23 interactivos en el panel; V3: secciones 1–3 enteras y el título de «Parámetros» visible, 18 interactivos; V1: 29 (más secciones visibles). La tercera fila de tarjetas (64 px) deja «Parámetros» en y = 780 de 720 en V3: criterio revisado en D-78 (ver incidencia 2) |
| VV-07 Estados de interacción | C8 | OK | Sin cambios en la galería; las tarjetas nuevas usan los mismos estados (borde de 2 px + ✓) |
| VV-08 Recortes y solapamientos | 45/45 | OK | 0 incidencias automáticas. Revisión a ojo de C13–C15 en V1–V3: la lectura «t = …» no tapa la barra de la escena; la leyenda temporal cabe sin recortes |
| VV-09 Codificación científica | C13, C15 | OK | La leyenda dice qué instante muestra cada capa: «P95 en t ∈ [0, 12.5664]» (escala de la ventana), «instantáneas en t = 2» (líneas), «trayectorias: ṙ = F(r, t)» (partículas) y la equivalencia «1 s ≙ τ» |
| VV-10 Movimiento reducido | C12–C15 | OK | Capturas con `prefers-reduced-motion`: reloj en pausa y partículas quietas al empezar |

## Incidencias

| # | Descripción | Captura y zona | Severidad | Acción | Recapturada |
| --- | --- | --- | --- | --- | --- |
| 1 | «Fin» de la ventana de t saltaba de línea y 4π (12.56637061) se recortaba en el campo | C15, sección «Tiempo» | Mejora | Inicio y Fin en filas propias, campos de 112 px (D-76) | Sí: C13 y C15 y sus referencias |
| 2 | Con 9 tarjetas, «Parámetros» deja de caber entera a 1280 × 720 (acaba en y = 780 de 720) | C1-V3, panel | Mejora (criterio) | Se conserva el aspecto del catálogo; VV-06 revisado para V3 (D-78, DESIGN §5.3) | No hace falta |
| 3 | La fórmula de la silla giratoria no cabe en el panel y se desplaza, pero no se podía alcanzar con el teclado (axe `scrollable-region-focusable`, WCAG 2.1.1) | Campo «Silla giratoria», V3 | Bloquea (accesibilidad) | Si desborda, la fórmula es una región enfocable con nombre; si cabe, no añade parada (D-77). Prueba nueva en h10-tiempo | Sí: sin cambio visible |

## Capturas de referencia (VALIDATION §7.5)

`tests/visual/referencias.spec.ts` cubre ahora C1–C15 a 1280 × 720. Las once de la 1.0 con
escena se regeneraron (cambian la tercera fila de tarjetas y el botón «Vista libre» de la
barra; revisadas una a una: el resto es idéntico), C13–C15 son nuevas. C14 era no
determinista (la pose de vuelo dependía del tiempo de pulsación): ahora fija la pose con el
gancho `fijarPoseVuelo` y pasa en tres ejecuciones seguidas. Con el código final: 15/15.

## Conclusión

**Superada.** Las diez comprobaciones VV pasan en la matriz C1–C15 × V1–V3. Hubo tres
incidencias: una de accesibilidad real (fórmula desplazable sin teclado), un recorte en
«Tiempo» y la densidad de V3, que se revisa con un motivo documentado.
