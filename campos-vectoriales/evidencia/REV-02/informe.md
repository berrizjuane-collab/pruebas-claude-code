# REV-02 · Revisión de capturas de controles y estados

Fecha: 2026-10-02 · Chromium 1194 (SwiftShader, texto en gris), movimiento reducido · servidor de desarrollo.

## Capturas (V1 1920×1080, V2 1440×900 @2x, V3 1280×720)

| Captura | Contenido |
| --- | --- |
| C1 | Estado inicial: Helicoidal con el panel completo |
| C5 | Error en ecuación: `Q = x*(` tras salir del campo + aviso de escena |
| C8 | Galería de controles (`?muestras`) con todos los estados, a toda su altura |
| C10 | Estado vacío: `P = sqrt(-1-x^2)` |

## Auditorías automáticas

| Captura | Tamaño | Paleta | Maquetación (VV-08) | Alineación (VV-04) | Tamaños de letra (VV-02) | Panel (VV-06) |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | V1 | OK | 0 | 0/13 | 11, 12, 13, 14 | 1032 / 1032 · 5 secc. · 23 interactivos |
| C5 | V1 | OK | 0 | 0/13 | 11, 12, 13, 14 | 1032 / 1032 · 5 secc. · 23 interactivos |
| C8 | V1 | OK | 0 | 0/0 | 11, 12, 13, 14, 16 | — |
| C10 | V1 | OK | 0 | 0/13 | 11, 12, 13, 14, 16 | 1032 / 1032 · 5 secc. · 24 interactivos |
| C1 | V2 | OK | 0 | 0/13 | 11, 12, 13, 14 | 852 / 852 · 5 secc. · 23 interactivos |
| C5 | V2 | OK | 0 | 0/13 | 11, 12, 13, 14 | 852 / 852 · 5 secc. · 23 interactivos |
| C8 | V2 | OK | 0 | 0/0 | 11, 12, 13, 14, 16 | — |
| C10 | V2 | OK | 0 | 0/13 | 11, 12, 13, 14, 16 | 852 / 852 · 5 secc. · 24 interactivos |
| C1 | V3 | OK | 0 | 0/13 | 11, 12, 13, 14 | 756 / 672 · 4 secc. · 22 interactivos |
| C5 | V3 | OK | 0 | 0/13 | 11, 12, 13, 14 | 755 / 672 · 4 secc. · 22 interactivos |
| C8 | V3 | OK | 0 | 0/0 | 11, 12, 13, 14, 16 | — |
| C10 | V3 | OK | 0 | 0/13 | 11, 12, 13, 14, 16 | 761 / 672 · 3 secc. · 23 interactivos |

- **VV-02**: tamaños ∈ {11, 12, 13, 14, 16} px, pesos ∈ {400, 500, 600}, familias Inter Variable y
  JetBrains Mono (KaTeX aparte). Superado.
- **VV-04**: 13 anclajes del panel a 16 px (±0.5) y huecos entre secciones múltiplos de 4. Superado
  tras corregir el icono de «Añadir parámetro» (17 → 16 px).
- **VV-06** (revisado, D-33): con el experimento inicial, en V3 caben enteras las secciones 1–4 y en V1
  y V2 todo el panel; con tres parámetros (Uniforme), todo el panel en V2. 22–24 elementos
  interactivos visibles (≤ 25). Superado.
- **VV-07**: en C8, contornos de foco de 2 px con contraste ≥ 3:1 y deshabilitados con motivo
  (prueba automática de VIS-02). Superado.
- **VV-08**: 0 solapamientos, 0 textos recortados, sin desplazamiento horizontal. Superado.

## Revisión manual (lista de comprobación)

| # | Comprobación | Resultado |
| --- | --- | --- |
| 1 | Cada estado de C8 se distingue sin depender del gris (contorno, inversión, ✓, mando desplazado, palabra) | Sí |
| 2 | Los mensajes llevan icono + palabra + forma (error 2 px continuo, aviso discontinuo) | Sí |
| 3 | El error de C5 señala la posición con el subrayado ondulado y la escena conserva el último campo válido | Sí |
| 4 | El estado vacío de C10 se lee sobre la escena y ofrece una acción | Sí, tras corregirlo (incidencia 2) |
| 5 | La leyenda solo muestra lo que hay en la escena | Sí, tras corregirlo (incidencia 3) |
| 6 | Densidad del panel en V3 | Sí, con el criterio revisado (incidencia 1) |
| 7 | Alineación a 16 px y ritmo de 4 px | Sí, tras corregirlo (incidencia 4) |

## Incidencias y resolución (recapturadas)

1. **Densidad (VV-06)**: a 1280×720 las secciones 1–4 medían 816 px de 672. Tarjetas de ejemplo a 56 px
   con nombres cortos, «Sobre este campo» en la cabecera de «Campo» y 4 px entre ecuaciones; criterio
   revisado y medido (D-33, D-36).
2. **Estado vacío ilegible** sobre 729 aspas: tarjeta opaca de nivel 1.
3. **Leyenda con rampa, «sentido» y escala sin flechas** en la escena: entradas condicionadas a que
   haya flechas.
4. **Icono de «Añadir parámetro» a 17 px**: compensación del borde del botón.

Archivos: `capturas/*.png`, `capturas.json`.
