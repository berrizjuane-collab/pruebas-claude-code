# STATUS — Estado, decisiones y riesgos

> Documento vivo. Se actualiza al cerrar cada tarea con su evidencia.
> Última actualización: **2026-10-02**.

---

## 1. Estado actual

| | |
| --- | --- |
| **Fase** | Implementación — H0 Fundaciones |
| **Situación** | Plan aprobado por el usuario el 2026-10-02, con tres respuestas que se incorporan como D-15, D-20 y S-01 |
| **Siguiente paso** | H0 (FND-01, FND-02, VIS-01) y H1, la primera entrega (§7) |
| **Bloqueos** | Ninguno |

### 1.1 Estado por hito

| Hito | Tareas | Completadas y verificadas | Nota |
| --- | --- | --- | --- |
| Planificación | PLN-01 | 0/1 | En curso: falta aprobación |
| H0 Fundaciones | 3 | 0/3 | — |
| H1 Primera entrega | 8 | 0/8 | — |
| H2 Lenguaje | 4 | 0/4 | Puede ir en paralelo a H1 |
| H3 Numérico y cómputo | 7 | 0/7 | — |
| H4 Edición y controles | 7 | 0/7 | — |
| H5 Capas científicas | 9 | 0/9 | — |
| H6 Inspección | 3 | 0/3 | — |
| H7 Exportación | 3 | 0/3 | — |
| H8 Transversal | 4 | 0/4 | — |
| H9 Validación | 6 | 0/6 | Incluye ENT-01 (HTML autocontenido) |

### 1.2 Tareas completadas y verificadas

*(Ninguna todavía.)* Formato: `ID · fecha · commit · enlace a evidencia/ID/`.

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

---

## 7. Siguiente paso propuesto: primera entrega (H1)

**Objetivo**: comprobar pronto, juntas, la arquitectura y la dirección visual con un caso
real.

- **Incluye**: andamiaje y arnés (H0); seis campos nativos; malla y $F_{\text{ref}}$; escena
  WebGL2 con ejes, caja, órbita y flechas instanciadas (longitud, luminancia, halo, marcas);
  barra superior, panel con «Campo» y «Ejemplos», leyenda de magnitud; capturas en V1–V3 con
  auditoría de paleta.
- **No incluye**: editor de ecuaciones, líneas de corriente, cortes, inspector ni exportación.
- **Demostración**: abrir la aplicación → Helicoidal en 3D → cambiar a Radial entrante,
  Rotacional y Silla → la leyenda y las marcas ≈ 0 cambian con coherencia → informe REV-01.

---

## 8. Preguntas abiertas

Ninguna bloquea H0 ni H1. Cada una tiene un valor por defecto:

| ID | Pregunta | Por defecto |
| --- | --- | --- |
| Q-01 | ¿Cuál es tu equipo? | **Respondida**: i9, RTX 4060, 144 Hz (D-20) |
| Q-02 | ¿Nivel del público? | **Respondida**: universitarios superiores y expertos (S-01, D-21) |
| Q-03 | ¿Publicación web? | **Respondida**: basta un HTML autocontenido y funcional (D-15) |

---

## 9. Registro de cambios

| Fecha | Cambio |
| --- | --- |
| 2026-10-02 | Planificación inicial: SPEC, DESIGN, PLAN, VALIDATION y STATUS; evidencia de calibración y de entorno en `evidencia/PLN-01/` |
| 2026-10-02 | Plan aprobado. Incorporadas las respuestas: R1 = i9 + RTX 4060 + 144 Hz; público experto; entrega como HTML autocontenido (RNF-14, D-15, D-20 … D-22, ENT-01) |

---

## Anexo A · Herramientas de planificación

En `evidencia/PLN-01/`:

- `entorno.txt`: inspección del entorno (versiones, WebGL2, grosor de línea, avisos de
  seguridad del registro npm).
- `contraste.py` → `contraste.txt`: contrastes WCAG y L\* de la paleta.
- `calibrar.py`, `calibrar_arco.py` → `calibracion.txt`: experimento numérico que justifica
  las tolerancias de VALIDATION §2.
