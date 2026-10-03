# REV-04 · Revisión visual final

- Fecha: 2026-10-03 · commit: el de esta evidencia (sobre `ea239dd`) · navegador: Chromium 1194
  (Playwright 1.56.1, SwiftShader) · HTML autocontenido de `dist/` abierto con `file://`.
- Tamaños: matriz obligatoria C1–C12 × V1–V3; V4: C1, C2, C4, C6; V5: C1, C4 (42 capturas en
  `capturas/`, auditorías en `capturas.json`). Movimiento reducido emulado y reloj determinista.
- Comando: `node scripts/capturas.mjs --tarea=REV-04 --capturas=… --tamanos=… --objetivo=archivo`.

## Resultados

| VV | Captura | Resultado | Nota |
| --- | --- | --- | --- |
| VV-01 Paleta monocroma | 42/42 | OK | 0 píxeles con max(\|R−G\|, \|G−B\|, \|R−B\|) > 3 en las 42; exportaciones PNG auditadas en V-FUN-12 (h7) |
| VV-02 Tipografía | 42/42 | OK | Tamaños {11, 12, 13, 14, 16} px, pesos {400, 500, 600}, familias Inter Variable y JetBrains Mono (+ KaTeX). Orden de lectura del panel Campo → Ejemplos → Ecuaciones → Parámetros, títulos distinguibles sin color |
| VV-03 Contraste | todas | OK | axe sin infracciones (incluida `color-contrast`) en C1, C4, C6, C8, C9, panel desplegado, diálogos y V5 (h8-a11y, h5). Escena: la flecha más débil (L* 45.2) cumple 3.57:1 frente a su halo (VIS-01, tokens); sin luces ni *tone mapping*, el píxel interior es el color del token |
| VV-04 Alineación y ritmo | 36 con anclajes | OK | 0 desviaciones (19–24 anclajes por captura); C8, C6-V4 y V5 no tienen panel lateral que anclar |
| VV-05 Claridad de la escena | C1, C7 | OK | e2e VV-05 (h5): conos ≥ 6 px en el 95 % de la mitad delantera legible. A ojo: sentido identificable en las flechas de C1, líneas (trazo fino con cheurones) distintas de flechas, corte y P identificables con la leyenda; en C7 (21³) se leen las puntas de la mitad delantera |
| VV-06 Densidad del panel | C1 | OK | Secciones 1–4 enteras en V3 y V2. Interactivos visibles en el panel: 22 (V2), 16 (V3), 17 (V4) ≤ 25; en V1, 29, porque la altura extra enseña cuatro secciones plegadas más (misma densidad por área). En toda la página: 37 (V2), 31 (V3). Criterio aclarado en D-61 |
| VV-07 Estados de interacción | C8 | OK | Cada estado de la galería se distingue sin color (borde, inversión, marca, palabra); foco ≥ 2 px y ≥ 3:1, deshabilitados con motivo (h4 VV-07) |
| VV-08 Recortes y solapamientos | 42/42 | OK | 0 incidencias automáticas. En V5 el inspector es una hoja que se desplaza dentro de sí (aceptado en VIS-06: modo consulta) |
| VV-09 Codificación científica | todas | OK | Entradas de la leyenda = capas visibles en todas las combinaciones (h5 VV-09); matriz de VIS-05 |
| VV-10 Movimiento reducido | C12 y e2e | OK | Sin animaciones en curso, partículas en pausa al empezar, la cámara salta (h5, h8-a11y); C12 con el foco visible en la escena |

## Incidencias

| # | Descripción | Captura y zona | Severidad | Acción | Recapturada |
| --- | --- | --- | --- | --- | --- |
| 1 | El anillo de foco de la escena no se veía: era una sombra interior en el `<canvas>`, que se pinta debajo del dibujo WebGL opaco. La auditoría de foco de A11Y-01 leía estilos calculados y lo daba por bueno | C12 (idéntica a C1 salvo 4 píxeles en la referencia de `tests/visual`) | Bloquea (V-A11Y-03) | `outline` de 2 px con desplazamiento −2 px (se pinta encima); la auditoría descarta ahora las sombras interiores en canvas, img y video y falla con el estilo anterior (D-60) | Sí: C12 en V1–V3 y su referencia |
| 2 | El recuento de interactivos de VV-06 mide toda la página: desde H5 incluye la barra de la escena (8 botones), la leyenda y la propia escena, y supera 25 (31 en V3) sin que VIS-06 lo juzgara | C1, todos los tamaños | Mejora (criterio) | La auditoría da también el recuento dentro del panel; VV-06 se juzga en el panel en V2 y V3 (D-61) | Sí: C1 en V1–V5 |

## Capturas de referencia (VALIDATION §7.5)

`tests/visual/referencias.spec.ts` (proyecto `visual`): C1–C12 a 1280 × 720 con las mismas
escenas que `scripts/capturas.mjs` (compartidas en `scripts/lib/escenas.mjs`), umbral 0.1 por
píxel, 0.5 % de píxeles con escena y 0.1 % en la galería. Válidas solo en Linux con Chromium
1194; se regeneran con `npx playwright test --project=visual --update-snapshots` tras un
cambio visual intencionado.

## Conclusión

**Superada.** Las diez comprobaciones VV pasan en la matriz completa, con dos incidencias
resueltas (una de accesibilidad real, el foco invisible en la escena, y una aclaración del
criterio de densidad). Depende de A11Y-02: si la sesión con lector de pantalla del usuario
(Q-04) obliga a cambiar la interfaz, se repiten las capturas con el mismo comando y se
regeneran las referencias.
