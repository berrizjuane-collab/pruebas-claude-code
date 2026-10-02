# REV-01 · Revisión de capturas de la primera entrega

- Fecha: 2026-10-02 · base `e609b6b` + cambios de H1 · Chromium 1194 (SwiftShader), suavizado de texto en gris (D-23)
- Tamaños: V1 1920×1080 @1, V2 1440×900 @2, V3 1280×720 @1
- Capturas: C1 (helicoidal, estado inicial) y los seis campos del catálogo (UNI, RADS, RADE, ROT, SIL; HEL = C1) → 18 PNG en `capturas/`

## Resultados

| VV | Capturas | Resultado | Nota |
| --- | --- | --- | --- |
| VV-01 Paleta | 18/18 | OK | 0 píxeles con diferencia entre canales > 3 (`capturas.json`) |
| VV-02 Jerarquía tipográfica | 18/18 | OK | Tamaños {11, 12, 13, 14} px; pesos {400, 500, 600}; familia Inter Variable (+ KaTeX en fórmulas) |
| VV-03 Contraste | — | OK | Tokens verificados en VIS-01; flechas más débiles L* 45.2 con halo (3.57:1) |
| VV-04 Alineación y espaciado | V2, V3 | OK | Panel con margen de 16 px; secciones a 24 px; tarjetas en rejilla 3 × 2 |
| VV-05 Claridad de la escena | C1, RADE, ROT, SIL | OK tras corrección | Ver incidencias 3 y 4 |
| VV-06 Densidad de paneles | V3 | OK | Secciones visibles sin desplazamiento (el panel de H1 aún tiene pocas secciones) |
| VV-08 Recortes/solapamientos | 18/18 | OK tras corrección | 0 incidencias automáticas; ver incidencias 1 y 5 |

## Incidencias

| # | Descripción | Captura y zona | Severidad | Acción | Recapturada |
| --- | --- | --- | --- | --- | --- |
| 1 | «Sobre este campo» se mostraba desplegado: `display: flex` anulaba el atributo `hidden` | C1-V2, panel | Bloquea | `[hidden] { display: none !important }` en base.css | Sí |
| 2 | El encuadre cortaba la caja por abajo (factor 0.92 sin margen para la perspectiva) | C1-V2, escena | Bloquea | Distancia = 1.04 · r / sen(fov/2) | Sí |
| 3 | Flechas hacia la cámara y en sentido contrario indistinguibles (discos planos) | C1-V2, zona izquierda | Bloquea (legibilidad 3D) | Base del cono más oscura + degradado fijo vértice → base (D-27, DESIGN §9.2) | Sí |
| 4 | Puntas de los ejes demasiado grandes, compiten con las flechas | C1-V2 | Mejora | Cono de eje 0.0075·L × 0.026·L | Sí |
| 5 | «Radial entrante» casi tocaba el borde de su tarjeta seleccionada | RADE-V1, panel | Mejora | Nombres en dos líneas; tarjetas de 72 px | Sí |
| 6 | La leyenda tapaba la esquina de la caja a 1280×720 | ROT-V3 | Mejora | Entrada de sentido acortada («centrada en el nodo» pasa a la ayuda) | Sí |
| 7 | «a = 0.2500» con 4 cifras en un parámetro | C1-V2, panel | Mejora | Parámetros con formato corto («0.25») | Sí |
| 8 | Error 504 «Outdated Optimize Dep» del servidor de desarrollo en la primera carga | C1-V2 | Entorno | `optimizeDeps.include` en vite.config.ts | Sí |
| 9 | Falso positivo del detector: el resumen para lectores de pantalla (oculto a propósito) | C1-V2 | Herramienta | El detector ignora `.solo-lector` | Sí |

## Conclusión

**Superada.** Las 18 capturas finales pasan las auditorías automáticas y la revisión manual. Las
incidencias 1–3 eran bloqueantes y están corregidas y recapturadas. Pendiente para hitos
posteriores (no bloquea H1): el panel aún tiene huecos que llenarán Ecuaciones, Parámetros y
Visualización (H4); los rótulos de las marcas de los ejes conviven con las flechas en el centro
de la escena (se revisará con los cortes en H5).
