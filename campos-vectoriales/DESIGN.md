# DESIGN — Dirección visual y reglas de representación

> Requisitos de diseño de la interfaz **y** de la escena científica. Los criterios de
> verificación están en [VALIDATION.md](VALIDATION.md) §7; las tareas, en [PLAN.md](PLAN.md)
> (prefijos `VIS-` y `REV-`).
>
> Estado del documento: **aprobado** (1.0, 2026-10-02) · **ampliado para la 1.1** (H10,
> 2026-10-04): §5.5 vista libre, §6.3 componentes nuevos, §9.13 tiempo en la escena.

---

## 1. Principios

1. **El campo es el protagonista.** La escena ocupa al menos el 73 % del área a 1440×900 y
   el 78 % a 1920×1080 (con el panel de 320 px —336 px a partir de 1600, §5.4— y la barra de
   48 px no puede ser más: 78.8 %; la cifra inicial del 75 % era incoherente y la detectó la
   prueba de VIS-03, y la de 79 % se corrigió al ensanchar el panel en VIS-06, D-54). La interfaz se retira: superficies oscuras, pocos elementos visibles, controles avanzados
   plegados.
2. **Monocromo estricto.** Solo negros, blancos y grises neutros (R = G = B), en la
   interfaz, la escena y las exportaciones. Ningún color del navegador se cuela (§2.4).
3. **Una variable visual, un significado.** Cada canal (luminancia, longitud, forma, estilo
   de línea, patrón) tiene un significado declarado en la tabla de codificación (§9.1). Si un
   canal se reutiliza, es en otra marca y otra banda, y la leyenda lo explica.
4. **Nada esencial depende solo del gris.** Signos, selección, errores y estados llevan
   siempre forma, texto, icono o patrón además del tono.
5. **Redundancia útil.** En 3D la longitud aparente de una flecha depende del ángulo de
   visión (escorzo). Por eso la magnitud se codifica también con luminancia, que no depende
   de la vista.
6. **Calma.** Animaciones breves y sutiles, sin elementos decorativos. Toda animación se
   puede pausar y se respeta el movimiento reducido.
7. **Explicar la representación.** Cada simplificación gráfica (escala, saturación, umbral
   de cero, muestreo) tiene una entrada visible en la leyenda o en la ayuda.

---

## 2. Color

### 2.1 Paleta de la interfaz (ajustada)

La paleta inicial se conserva y se añaden **tres grises** justificados por contraste. Todos
los valores son neutros. L\* = luminosidad CIELAB; los contrastes siguen la fórmula WCAG,
calculados con `contrast.py` (STATUS.md, anexo A).

| Token | Valor | L\* | Contraste sobre #101010 / #181818 / #242424 | Uso |
| --- | --- | --- | --- | --- |
| `--fondo-0` | `#101010` | 4.7 | — | Escena, fondo de la aplicación, interior de campos de entrada («pozo») |
| `--fondo-1` | `#181818` | 8.2 | — | Barra superior y panel lateral |
| `--fondo-2` | `#242424` | 14.2 | — | Superficies elevadas: inspector, leyenda, menús, descripciones emergentes, diálogos |
| `--fondo-3` | `#2E2E2E` | 18.9 | — | **Nuevo.** *Hover* de filas y botones; separadores internos suaves |
| `--borde` | `#404040` | 27.1 | 1.84 / 1.71 / 1.50 | Separadores entre regiones, borde de tarjetas (decorativo) |
| `--control` | `#757575` | 49.2 | **4.13 / 3.85 / 3.37** | **Nuevo.** Contorno de controles interactivos (entradas, casillas, interruptores, pista del deslizador) |
| `--texto-3` | `#8C8C8C` | 58.3 | **5.66 / 5.28 / 4.62** | **Nuevo.** Texto terciario: unidades, marcas de ejes, pistas |
| `--texto-2` | `#B0B0B0` | 71.8 | 8.77 / 8.19 / 7.16 | Texto secundario, etiquetas |
| `--texto-1` | `#F5F5F5` | 96.5 | 17.45 / 16.29 / 14.24 | Texto principal, elementos destacados, foco, selección |

Por qué los ajustes:

- `#404040` da solo **1.84:1** sobre el fondo. Vale para separadores decorativos, pero no
  para delimitar un control: WCAG 2.2, criterio 1.4.11, pide ≥ 3:1 para la información
  visual necesaria para identificar un componente. De ahí `--control` (#757575), que supera
  3:1 sobre las tres superficies.
- Hacía falta un gris de texto terciario que cumpliera 4.5:1 en todas las superficies:
  `#8C8C8C`. El siguiente gris más oscuro de la escala, `#808080`, queda en 3.93:1 sobre
  `#242424`.
- `--fondo-3` da un paso de *hover* perceptible (ΔL\* ≈ 5) sin introducir bordes.

### 2.2 Paleta de la escena

| Token | Valor | Uso |
| --- | --- | --- |
| `escena.fondo` | `#101010` | Fondo del lienzo, el mismo que la interfaz |
| `escena.caja` | `#404040` | Aristas de la caja del dominio (decorativas) |
| `escena.eje` | `#8C8C8C` | Ejes coordenados |
| `escena.etiqueta` | `#B0B0B0` | Letras de los ejes y números de las marcas |
| `escena.halo` | `#101010` | Contorno oscuro de flechas, líneas y marcas (§9.2) |
| `rampa.magnitud` | L\* 45.2 → 96.5 (`#6B6B6B` → `#F5F5F5`) | Luminancia de los glifos según la magnitud (banda **clara**) |
| `escena.linea` | `#A0A0A0` | Líneas de corriente, luminancia constante |
| `escena.semilla` | `#B0B0B0` | Círculo hueco de las semillas |
| `escena.particula` | `#F5F5F5` | Punto de la partícula |
| `escena.estela` | `#8C8C8C` | Estela de la partícula (se estrecha con la antigüedad) |
| `escena.corte` | `#8C8C8C` discontinuo; relleno `#F5F5F5` al 3 % | Contorno y velo del plano de corte |
| `rampa.escalar` | L\* 6 → 32 (`#131313` → `#4B4B4B`) | Valor absoluto del escalar sobre el corte (banda **oscura**) |
| `escena.patron` | +10 L\* sobre la base local | Puntos (signo +) y rayado (signo −) |
| `escena.cero` | `#B0B0B0` discontinuo | Curva de nivel cero del escalar |
| `escena.seleccion` | `#F5F5F5` | Aro, cruz y etiqueta del punto seleccionado |

**Rampas uniformes en L\***: la luminancia percibida crece de forma proporcional al valor,
sin saltos. El gris más oscuro de la rampa de magnitud (`#6B6B6B`) tiene un contraste de
**3.57:1** con el fondo, así que incluso las flechas más débiles cumplen 3:1. Las dos rampas
**no se solapan**: 6–32 (hasta 42 con los patrones) frente a 45.2–96.5: un glifo nunca se confunde con el mapa del corte.

### 2.3 Colores de estado

No hay rojo, ámbar ni verde. El estado se comunica con **icono + palabra + forma**:

| Estado | Icono (Lucide) | Palabra inicial | Forma del contenedor |
| --- | --- | --- | --- |
| Error | `octagon-alert` | «Error:» | Borde continuo de 2 px `--texto-1` |
| Aviso | `triangle-alert` | «Aviso:» | Borde **discontinuo** de 1 px `--texto-2` |
| Éxito | `circle-check` | «Listo:» | Sin borde; icono relleno |
| Información | `info` | — | Sin borde |

### 2.4 Fugas de color del navegador (prohibidas y auditadas)

| Origen | Contramedida |
| --- | --- |
| Anillo de foco por defecto (azul) | `outline` propio en `:focus-visible` |
| Selección de texto (azul) | `::selection { background: #F5F5F5; color: #101010 }` |
| Color de acento de formularios (`accent-color`) | Controles personalizados y `accent-color: #F5F5F5` |
| Subrayado ortográfico rojo | `spellcheck="false"` en las expresiones |
| Fondo amarillo de autocompletado | `autocomplete="off"` y estilos `:autofill` |
| Desplegable nativo de `<select>` (colores del sistema) | Lista desplegable propia (patrón ARIA *listbox*) |
| Descripciones emergentes nativas (`title`) | Componente `Tooltip` propio |
| `errorColor` de KaTeX (`#cc0000`) | `errorColor: '#F5F5F5'`, `throwOnError: false`; además, el TeX lo genera el árbol propio |
| Barras de desplazamiento | `scrollbar-color: #404040 transparent` |
| Esquema de color | `color-scheme: dark` en `:root` |
| Iconos de emoji en color | Prohibidos; solo SVG monocromos |
| Botón de selección de archivo | Oculto; se activa con un botón propio |
| Suavizado subpíxel del texto (ClearType/LCD): franjas de color en los bordes de las letras | Es una técnica del sistema y del monitor, no un color del diseño, y no se controla desde CSS en Windows o Linux. Las capturas de auditoría usan suavizado en escala de grises (`--disable-lcd-text`); los textos que la aplicación rasteriza (etiquetas de la escena, exportación PNG) se dibujan en lienzos con transparencia, que Chromium suaviza en gris. Hallazgo de FND-02 |

---

## 3. Tipografía

### 3.1 Familias

| Rol | Familia | Motivo |
| --- | --- | --- |
| Interfaz y números | **Inter** (variable, `@fontsource-variable/inter`, OFL) | Sans serif muy legible en tamaños pequeños; cifras **tabulares** (`font-variant-numeric: tabular-nums`) para que las columnas del inspector no bailen |
| Entrada de expresiones | **JetBrains Mono** (`@fontsource/jetbrains-mono`, OFL) | Sans serif monoespaciada: el subrayado de errores por posición coincide con los caracteres; `*`, `^` y `()` se distinguen bien |
| Fórmulas mostradas | **KaTeX** (fuentes incluidas en el paquete) | Notación matemática estándar (fracciones, raíces, índices). Se limita a las zonas de fórmula, en tamaño ≥ 13 px |

Todas se **empaquetan localmente**; no se pide nada a la red (RNF-05). No hay fuentes con
serifa en la interfaz. Las fórmulas siguen la convención tipográfica matemática.

### 3.2 Escala y jerarquía

| Token | Tamaño / interlínea | Peso | Uso |
| --- | --- | --- | --- |
| `--t-micro` | 11 / 16 px | 500 | Marcas de la leyenda, atajos `kbd`, etiquetas de ejes en DOM. **Tamaño mínimo** |
| `--t-pie` | 12 / 16 px | 400 | Pistas, mensajes de validación, barra de estado |
| `--t-control` | 13 / 20 px | 400 / 500 | Controles, listas, valores del inspector (base de la interfaz) |
| `--t-cuerpo` | 14 / 22 px | 400 | Texto de la ayuda |
| `--t-seccion` | 13 / 20 px | 600 | Títulos de sección del panel (minúscula inicial, sin versalitas) |
| `--t-titulo` | 14 / 20 px | 600 | Nombre de la aplicación, título del inspector y de los diálogos |
| `--t-formula` | KaTeX a 17 px | — | Fórmula principal del campo |
| `--t-vacio` | 16 / 24 px | 500 | Mensaje de estado vacío en la escena |

Reglas:

- Solo tres pesos: 400, 500 y 600. Sin cursivas en la interfaz; las variables matemáticas van
  en cursiva **dentro** de KaTeX.
- Los títulos se distinguen por **peso y espacio**, no por tamaño ni color: la interfaz es
  compacta y la jerarquía principal la marca la propia escena.
- Texto principal en `--texto-1`, secundario en `--texto-2` y unidades o pistas en `--texto-3`.
- Mayúsculas solo en siglas (XY, PNG, JSON).

### 3.3 Ecuaciones y valores numéricos

- **Formato numérico**: 4 cifras significativas por defecto (configurable de 2 a 8 en
  Avanzado), punto decimal y signo menos tipográfico «−» (U+2212). Notación científica si
  |v| < 10⁻³ o |v| ≥ 10⁵, escrita como `1.234 × 10⁻⁴`. Si |v| < 10⁻¹² × escala, se escribe
  `0`. Bajo el umbral de cero visual se escribe `≈ 0`, con el valor exacto en la
  descripción emergente.
- **Vectores**: `(0.000, 1.000, 0.2500)` en cifras tabulares, componentes alineadas por el
  punto decimal en el inspector, una fila por componente.
- **Fórmula del campo**: KaTeX en modo *display*, con los parámetros sustituidos por su
  **nombre** (`a`), nunca por su valor, y una línea inferior con los valores
  («a = 0.25»).
- **Vista previa de expresiones**: KaTeX en línea, bajo cada campo, mostrando cómo se ha
  interpretado lo escrito (`1/2x` → $\tfrac12 x$).

---

## 4. Espacio, dimensiones y forma

### 4.1 Sistema de espaciado (base 4 px)

`--e-1` 4 · `--e-2` 8 · `--e-3` 12 · `--e-4` 16 · `--e-5` 24 · `--e-6` 32 · `--e-7` 48.

- Margen interior del panel lateral: 16 px. Separación entre secciones: 24 px. Entre
  controles de una sección: 12 px. Entre una etiqueta y su control: 4 px.
- Tarjetas flotantes: margen interior de 12 px; 16 px de separación con los bordes de la
  escena.
- Todo ajuste no múltiplo de 4 px se considera defecto (VV-04).

### 4.2 Dimensiones de controles

| Elemento | Medida |
| --- | --- |
| Altura de control estándar | 32 px (40 px con `pointer: coarse`) |
| Botón solo icono | 32 × 32 px (objetivo ≥ 24 × 24, WCAG 2.5.8) |
| Icono | 16 px en controles; 18 px en la barra de la escena; trazo de 1.5 px |
| Entrada de expresión | Ancho completo del panel, 32 px de alto, JetBrains Mono 13 px |
| Entrada numérica | 64 px de ancho, alineada a la derecha, cifras tabulares |
| Deslizador | Pista de 2 px, mando de 14 px, zona activa de 32 px de alto |
| Interruptor | 28 × 16 px dentro de una fila de 32 px |
| Barra superior | 48 px de alto |
| Panel lateral | 320 px de ancho fijo |
| Inspector | 288 px de ancho |
| Leyenda | 240 px de ancho máximo |
| Cajón de ayuda | 400 px de ancho |

Alineación: las etiquetas del panel se alinean a la izquierda con el margen de 16 px. Los
valores numéricos se alinean a la derecha en una columna común. Los iconos se centran en su
caja de 32 px.

### 4.3 Bordes, radios y sombras

- **Bordes**: 1 px. Solo hay bordes donde separan regiones (`--borde`) o identifican controles
  (`--control`).
- **Radios**: `--r-1` 4 px (chips, `kbd`) · `--r-2` 6 px (controles) · `--r-3` 8 px
  (tarjetas, menús, diálogos) · completo en interruptores y mandos.
- **Elevación** (las sombras son negras con transparencia, por tanto neutras):
  - Nivel 0, planos de la interfaz: sin sombra.
  - Nivel 1, tarjetas sobre la escena: borde `--borde` y `0 4px 16px rgba(0,0,0,.5)`.
  - Nivel 2, menús y diálogos: borde `--borde` y `0 12px 32px rgba(0,0,0,.6)`.

---

## 5. Composición

### 5.1 Pantalla principal a 1440×900 (referencia)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Campos │ Helicoidal ✎            ✓ Listo · 729 nodos      ↺ Restablecer▾ ⤓ Exportar▾ ⇪ Abrir  ? Ayuda │ 48
├──────────────────────────┬─────────────────────────────────────────────────────────────────┤
│ Campo                    │                                         ┌─────────────────────┐ │
│  F = (−y, x, a)          │                                         │ Punto P           × │ │
│  a = 0.25                │                                         │ x  1.000  y 0.000   │ │
│                          │            z                            │ z  0.000            │ │
│ Ejemplos                 │            │   ↗ ↗ ↗                    │ F   (0.000, 1.000,  │ │
│ ┌──────┐┌──────┐┌──────┐ │            │ ↗ ↗ ↗ ↗                    │      0.2500)        │ │
│ │Unifor││Radial││Radial│ │            ●──── y                      │ |F|  1.031          │ │
│ │ me   ││ +    ││ −    │ │           ╱                             │ div  0  (≈ conserva)│ │
│ └──────┘└──────┘└──────┘ │          x                              │ rot  (0, 0, 2.000)  │ │
│ ┌──────┐┌──────┐┌──────┐ │                                         │ ▸ Jacobiana         │ │
│ │Rotac.││Hélice││Silla │ │                                         └─────────────────────┘ │
│ └──────┘└──────┘└──────┘ │                                                                 │
│                          │                                                                 │
│ Ecuaciones               │                                                                 │
│ P │ -y                 │ │                                                                 │
│ Q │ x                  │ │                                                                 │
│ R │ a                  │ │                                                                 │
│                          │ ┌──────────────────────────┐                                    │
│ Parámetros               │ │ Leyenda                ▾ │                    ┌────────────┐  │
│ a ───●──────── [0.25] ⋯  │ │ |F|  ▕▒▒▓▓██▏ 0  1.25  2.5│                    │ ⌂ XY XZ YZ │  │
│                          │ │ ➤ sentido  ➤➤ ≥ F_ref    │                    │ ◇ Persp.   │  │
│ Visualización            │ │ ◇ ≈ 0      × no definido │                    │ ⏸ Pausa    │  │
│ ● Flechas   ● Líneas     │ │ ── línea   › sentido     │                    └────────────┘  │
│ ○ Partículas             │ │ escala auto (P95) [fijar]│                       z            │
│ Glifos [ F | rot F ]     │ └──────────────────────────┘                     y ┘ x  (triedro)│
│ ▸ Líneas de corriente    │                                                                 │
│ ▸ Corte                  │                                                                 │
│ ▸ Divergencia y rot.     │                                                                 │
│ ▸ Dominio y muestreo     │                                                                 │
│ ▸ Avanzado               │                                                                 │
└──────────────────────────┴─────────────────────────────────────────────────────────────────┘
          320 px                                   1120 px
```

### 5.2 Regiones

| Región | Posición | Contenido | Comportamiento |
| --- | --- | --- | --- |
| **Barra superior** | Arriba, 48 px, `--fondo-1`, borde inferior `--borde` | Marca «Campos»; nombre del experimento editable; estado del cálculo; acciones principales: Restablecer ▾, Exportar ▾, Abrir, Ayuda | Siempre visible. Las acciones llevan icono **y** texto (a < 1280 px, solo icono con descripción emergente) |
| **Panel lateral** | Izquierda, 320 px, `--fondo-1`, borde derecho `--borde` | Secciones en orden de uso (§5.3) | Desplazamiento vertical propio; la escena no se desplaza nunca |
| **Escena** | Resto del área, `--fondo-0` | Lienzo WebGL a sangre | Recibe el foco (anillo interior); órbita con ratón o teclado |
| **Inspector** | Esquina superior derecha de la escena, flotante, nivel 1 | Valores en el punto P | Aparece al seleccionar; se cierra con × o Esc; no tapa la leyenda |
| **Leyenda** | Esquina inferior izquierda, flotante, nivel 1 | Solo las entradas de las capas visibles | Siempre visible si hay capas; se puede plegar a una cabecera de una línea |
| **Barra de la escena** | Esquina inferior derecha | Encuadrar, vistas XY/XZ/YZ/iso, perspectiva/ortográfica, pausa | Iconos con descripción emergente y atajo |
| **Triedro** | Bajo la barra de la escena, 64 px | Ejes x, y, z con letras | Gira con la cámara; no es interactivo |
| **Avisos de escena** | Arriba al centro de la escena | «Mostrando el último campo válido», límites alcanzados | Uno a la vez; no tapan el inspector |
| **Notificaciones** | Abajo al centro | «Configuración exportada» | 4 s; se pausan con *hover* o foco; `role="status"` |
| **Cajón de ayuda** | Derecha, 400 px, nivel 2 | Conceptos · Sintaxis · Atajos · Supuestos | Se superpone a la escena sin redimensionarla; Esc lo cierra |

### 5.3 Panel lateral: orden y plegado

| # | Sección | Estado inicial | Contenido |
| --- | --- | --- | --- |
| 1 | Campo | Fija | Fórmula KaTeX y valores de los parámetros; «Sobre este campo ›» (ficha desplegable) a la derecha del título, en la misma fila (REV-02) |
| 2 | Ejemplos | Fija | Rejilla 3 × 3 (1.1: tres campos temporales en la tercera fila) de tarjetas compactas (miniatura monocroma de 24 px + nombre corto de una línea). La activa lleva borde de 2 px `--texto-1` y marca ✓; si se ha editado, «•» (modificado) |
| 3 | Ecuaciones | Fija | P, Q, R con vista previa y validación |
| 4 | Parámetros | Fija si hay alguno | Deslizador + número + menú ⋯ (rango, paso, restablecer, eliminar); «+ Añadir parámetro» |
| 4b | Tiempo (1.1) | Abierta si el campo depende de $t$; si no, plegada con la nota «El campo no depende de t» | Deslizador de $t$ y valor exacto; reproducir/pausar; inicio, fin, bucle; «1 s ≙ τ» |
| 5 | Visualización | Abierta | Interruptores: Flechas, Líneas de corriente, Partículas. Segmentado «Glifos: F · rot F» |
| 6 | Líneas de corriente | Plegada | Estrategia de semillas, plano, número, paso $h$, longitud máxima, «Detalles del cálculo» |
| 7 | Corte | Plegada (interruptor en la cabecera) | Plano XY/XZ/YZ, posición, flechas todas/solo corte, vector completo/tangencial, escalar |
| 8 | Divergencia y rotacional | Plegada | Expresiones simbólicas de div F y rot F; accesos «Ver div en el corte», «Ver rot · n en el corte», «Glifos de rot F» |
| 9 | Dominio y muestreo | Plegada | Límites de la caja (cubo enlazado), «Ampliar ×2» / «Estrechar ÷2» (1.1), N, nodos/centros, resolución del corte |
| 9b | Vista libre (1.1) | Plegada | Botón «Entrar en la vista libre», λ, velocidad, «Espacio sin límites», resumen de las teclas |
| 10 | Avanzado | Plegada | Flechas: proporcional/normalizada, escala auto/fija, luminancia lineal/log. Partículas: número, τ, semilla, «Nacen en: todo Ω · las semillas» (1.1). Cifras significativas |

Objetivo de densidad (VV-06, revisado en REV-02, D-33): a 1280×720 y con el experimento
inicial (un parámetro), las secciones 1–4 (Campo, Ejemplos, Ecuaciones y Parámetros) caben
enteras **sin desplazamiento**; a 1440×900, también con ≤ 3 parámetros. El resto del panel se
desplaza; la escena, nunca. El objetivo original (secciones 1–5 a 1280×720) era imposible con
las medidas de §4.2 y §6.1: medido, las secciones 1–4 ocupaban 816 px de 672 disponibles.
En la 1.1 (D-78) la tercera fila de tarjetas (64 px) deja «Parámetros» 60 px por debajo del
borde a 1280×720: ahí caben enteras las secciones 1–3 y se ve el título de «Parámetros»; a
1440×900 caben enteras las secciones 1–4 y «Tiempo». Se conservan las tarjetas de 88 × 56 px:
a 32–40 px de alto la miniatura y «Rotacional» o «Helicoidal» no caben juntas en 90 px.

### 5.4 Puntos de ruptura

| Ancho | Cambios |
| --- | --- |
| ≥ 1600 | Panel de 336 px; el inspector puede mostrar la jacobiana desplegada |
| 1280–1599 | Referencia |
| 1024–1279 | Acciones de la barra solo con icono; panel como **cajón** superpuesto de 320 px (abierto por defecto, botón «Panel») |
| 768–1023 | Ídem; inspector compacto de 256 px; leyenda plegada por defecto |
| < 768 | Modo consulta: barra con menú; panel como **hoja inferior** (cabecera de 64 px con la fórmula, desplegable al 60 % de la altura); inspector en hoja inferior; leyenda como botón |

### 5.5 Vista libre (1.1)

La vista libre es la escena **sola**: ninguna región de §5.2 es visible ni enfocable; el
lienzo ocupa toda la ventana (y toda la pantalla si el navegador concede la pantalla
completa). Es la única excepción al principio «la leyenda no se oculta sola» (§9.12), y es
deliberada y reversible con una tecla. Lo único que puede aparecer, siempre por iniciativa
del usuario y sin capturar el puntero ni el foco:

| Elemento | Posición | Contenido | Comportamiento |
| --- | --- | --- | --- |
| **Pista de controles** | Abajo al centro, 24 px del borde | Una línea con `kbd`: «Arrastrar · flechas mirar · W A S D Q E moverse · Mayús rápido · rueda velocidad · + − escala · U sin límites · H pista · Esc salir» | Aparece 5 s al entrar y luego se desvanece (200 ms); H la muestra u oculta. Tarjeta de nivel 1, texto 12 px |
| **Indicador transitorio** | Arriba al centro | Una palabra y un valor: «Velocidad ×2», «Escala λ = 1.95», «Sin límites», «Con límites», «Pausa» | 1.5 s y se desvanece; `role="status"` |

Con movimiento reducido, sin desvanecimientos (aparecen y desaparecen de golpe) y sin
inercia del vuelo. La lectura «t = …» no se muestra en la vista libre; T la muestra en el
indicador transitorio.

---

## 6. Componentes

### 6.1 Inventario

| Componente | Especificación |
| --- | --- |
| **Botón secundario** | 32 px; `--fondo-2`; borde `--borde`; texto 13/500 `--texto-1`; icono opcional a la izquierda |
| **Botón primario** | Uno por contexto («Importar», «Exportar» en diálogos); fondo `--texto-1`, texto `#101010` |
| **Botón fantasma** | Sin fondo ni borde; texto `--texto-2`; para acciones terciarias («Restablecer valor») |
| **Botón icono** | 32 × 32; `aria-label` obligatorio; descripción emergente con nombre y atajo |
| **Entrada de expresión** | Etiqueta lateral (`P`, `Q`, `R`) de 24 px; pozo `--fondo-0`; borde `--control`; monoespaciada; debajo, una línea de 16 px con la vista previa KaTeX o el mensaje de validación; error con subrayado ondulado en la posición |
| **Entrada numérica** | Acepta `-`, `−`, `.` y expresiones constantes (`pi/2`); ↑/↓ cambian en un paso, Mayús ×10 |
| **Deslizador** | Pista `--control`; tramo recorrido `--texto-2`; mando `--texto-1` con halo `#101010` de 2 px; `aria-valuetext` con nombre y valor |
| **Interruptor** | Apagado: contorno `--control` y mando hueco. Encendido: relleno `--texto-1` y mando `#101010`. Además, la etiqueta dice «Flechas» y el lector de pantalla anuncia «activado» |
| **Control segmentado** | 32 px; opción seleccionada **invertida** (fondo `--texto-1`, texto `#101010`) y `aria-pressed` |
| **Lista desplegable** | Botón de 32 px con ▾; lista en nivel 2; opción activa con ✓ |
| **Sección desplegable** | Cabecera de 32 px con chevrón (▸ / ▾, que gira 90°), título 13/600 y control opcional a la derecha; `<button aria-expanded>` |
| **Tarjeta de ejemplo** | 88 × 56 px; miniatura monocroma del campo y nombre corto de 12 px en una línea («Radial +», «Radial −»); el nombre accesible añade el completo («Radial + (Radial saliente)», WCAG 2.5.3); seleccionada: borde 2 px `--texto-1` + ✓ |
| **Descripción emergente** | Nivel 2, `--fondo-2`, 12 px, retardo de 400 ms, también con el foco; muestra el atajo en `kbd` |
| **Aviso en línea** | Icono de 16 px + palabra de estado + texto 12 px (§2.3) |
| **Notificación** | Tarjeta de nivel 2 con icono, texto y acción opcional («Deshacer»). Dura 4 s (8 s con «Deshacer»), se pausa con el puntero o el foco encima, y su acción funciona mientras está visible |
| **Tarjeta del inspector** | Cabecera «Punto P» + ×; filas etiqueta/valor; secciones «Derivadas» y «Jacobiana» plegables; nota del método («Derivadas analíticas» o «numéricas, h = 6.1 × 10⁻⁶»); botón «Copiar valores» |
| **Leyenda** | Cabecera «Leyenda» plegable; barras de rampa de 160 × 8 px con marcas; filas glifo (16 px) + texto 11–12 px |
| **Cajón de ayuda** | Pestañas; texto 14/22; fórmulas KaTeX; enlaces internos; botón × y Esc |
| **Estado vacío** | Centrado en la escena, sobre una tarjeta opaca de nivel 1 (debe leerse sobre las aspas y los ejes): icono de 24 px, título 16/500, explicación 13 px, una o dos acciones |
| **Teclas (`kbd`)** | 11/500 monoespaciada, borde `--borde`, radio 4 px |

### 6.2 Estados de pantalla

| Estado | Presentación |
| --- | --- |
| **Carga inicial** | Interfaz visible al instante; en la escena, «Preparando la escena…» con barra indeterminada de 2 px (estática con movimiento reducido) |
| **Sin WebGL2** | Estado vacío: «Este navegador no ofrece WebGL2, necesario para la escena 3D» + qué hacer; el panel y la ayuda siguen operativos |
| **Calculando** | Barra superior: indicador + «Calculando líneas… 45 %» + «Cancelar» si dura > 300 ms. Las líneas antiguas se mantienen hasta que llegan las nuevas y la leyenda dice «líneas en actualización» (no se atenúan, para no alterar la luminancia) |
| **Expresión incompleta** | Bajo el campo: icono `info` + «Incompleta: falta “)”», en `--texto-2`; sin borde de error |
| **Expresión con error** | Icono `octagon-alert` + «Error: …» + subrayado en la posición; borde del campo a 2 px; aviso en la escena «Mostrando el último campo válido» |
| **Sin datos** | Todo indefinido o campo nulo: estado vacío con causa y sugerencias («Prueba con un dominio con x > 0», «Restablecer ejemplo») |
| **Éxito** | Notificación breve («Configuración exportada: campo-helicoidal-20261002-1530.json») |

### 6.3 Componentes de la 1.1

| Componente | Especificación |
| --- | --- |
| **Lectura de tiempo** | Chip flotante de 32 px junto a la barra de la escena: «t = 1.234» en cifras tabulares 13 px; solo si el campo depende de $t$; `aria-live="off"` (el valor cambia en cada fotograma; el lector lo lee al enfocar la sección «Tiempo») |
| **Sección Tiempo** | Deslizador de $t$ con la ventana como rango; entrada numérica; botón reproducir/pausar (el mismo estado que la barra de la escena); inicio y fin; interruptor «Bucle»; pista «1 s ≙ τ = …» |
| **Botón «Vista libre»** | Botón icono de la barra de la escena (icono de expansión), atajo V |
| **Ampliar / Estrechar** | Dos botones secundarios de 32 px en «Dominio y muestreo»; el resultado se anuncia en la pista de la fila |

---

## 7. Estados de interacción

| Estado | Señal principal | Señal no tonal (redundante) |
| --- | --- | --- |
| Reposo | Según el componente | — |
| *Hover* | Fondo un paso más claro (`--fondo-3`) | Cursor de mano; descripción emergente tras 400 ms |
| Foco visible | Contorno de 2 px `--texto-1` con 2 px de separación (≥ 14:1 sobre cualquier superficie) | Es un contorno, una forma nueva. En la escena, anillo interior de 2 px |
| Pulsado | Fondo `#333333` | Desplazamiento de 0 px (sin saltos); `aria-pressed` cuando corresponde |
| Seleccionado / activo | Inversión o borde de 2 px `--texto-1` | Marca ✓ o mando desplazado; estado anunciado |
| Deshabilitado | Texto `#6B6B6B`, borde `--fondo-3` | Cursor `not-allowed`; descripción emergente con el **motivo** («Activa las líneas de corriente para editar las semillas») |
| Cargando | Indicador de progreso | Texto «Calculando…»; `aria-busy` |
| Error | Borde de 2 px | Icono + «Error:» + mensaje; `aria-invalid` y `aria-describedby` |

---

## 8. Iconografía y movimiento

### 8.1 Iconos

- Conjunto **Lucide** (`lucide-react`, licencia ISC): trazo de 1.5 px, retícula de 24 px
  escalada a 16 o 18 px y color `currentColor`. Coherencia garantizada al usar un solo
  conjunto.
- Iconos propios para lo que Lucide no cubre (⊙, ⊗, ↺/↻ del rotacional, miniaturas de los
  campos), dibujados con el mismo trazo y la misma retícula.
- **Regla de etiquetas**: las acciones de la barra superior llevan siempre texto a ≥ 1280 px.
  Los botones solo icono (barra de la escena, cerrar, menú ⋯) llevan `aria-label` y
  descripción emergente con el atajo. Ningún icono transmite por sí solo un estado sin
  palabra asociada.

| Acción | Icono |
| --- | --- |
| Restablecer | `rotate-ccw` |
| Exportar | `download` |
| Abrir configuración | `folder-open` |
| Ayuda | `circle-help` |
| Encuadrar / restablecer cámara | `scan` |
| Vista isométrica | `box` |
| Perspectiva / ortográfica | `cone` / `square` |
| Pausar / reanudar | `pause` / `play` |
| Fijar / liberar escala | `lock` / `lock-open` |
| Copiar | `copy` |
| Añadir / eliminar parámetro | `plus` / `trash-2` |

### 8.2 Movimiento

| Tipo | Duración | Curva |
| --- | --- | --- |
| Cambios de color o fondo (*hover*, foco) | 100 ms | `cubic-bezier(.2,0,0,1)` |
| Despliegues, menús, descripciones emergentes | 160 ms | ídem (entrada); `cubic-bezier(.4,0,1,1)` (salida) |
| Cajón de ayuda | 200 ms | ídem |
| Transición de cámara entre vistas | 400 ms | `ease-in-out` |

- **Movimiento reducido** (`prefers-reduced-motion: reduce`): sin desplazamientos (solo
  opacidad en ≤ 1 fotograma); la cámara salta; sin amortiguación de la órbita; partículas y
  rueda en pausa al inicio; indicadores de progreso estáticos.
- **Animación del campo** (partículas y rueda de paletas): botón Pausa/Reanudar siempre
  visible en la barra de la escena, con la tecla Espacio. El estado se anuncia («Animación
  en pausa»).
- Nada parpadea más de 3 veces por segundo.

---

## 9. Legibilidad científica en monocromo

### 9.1 Tabla de codificación (contrato)

| Variable visual | Marca | Significado | Nunca significa |
| --- | --- | --- | --- |
| Orientación del glifo | Flecha | Dirección de $\mathbf F$ (o de $\nabla\times\mathbf F$ con «Glifos: rot F») | — |
| Punta cónica | Flecha | **Sentido** | — |
| Longitud | Flecha | $\lVert\mathbf F\rVert$ (modo proporcional; saturada en $F_{\text{ref}}$) | Profundidad |
| Luminancia, **banda clara** (L\* 45.2–96.5) | Flechas y glifos | $\lVert\mathbf F\rVert$ o $\lVert\nabla\times\mathbf F\rVert$, según el modo de glifos | Profundidad, iluminación, selección |
| Doble punta | Flecha | $\lVert\mathbf F\rVert\ge F_{\text{ref}}$ (saturada) | — |
| Rombo hueco ◇ | Nodo, final de línea | $\lVert\mathbf F\rVert < 2\%\,F_{\text{ref}}$ | Equilibrio exacto |
| Aspa × | Nodo, final de línea | No definido o singular | — |
| Trazo continuo fino | Línea | Línea de corriente (luminancia constante) | Magnitud |
| Cheurón › sobre la línea | Línea | Sentido de $\mathbf F$ a lo largo de la línea | — |
| Círculo hueco ○ | Semilla | Origen de la integración | — |
| Punto + estela que se estrecha | Partícula | Posición actual + recientes (más fina = más antigua) | Magnitud |
| Rectángulo discontinuo + etiqueta | Plano | Plano de corte («z = 0.00») | — |
| Luminancia, **banda oscura** (L\* 6–32; patrones hasta 42) | Superficie del corte | Valor absoluto del escalar elegido | Magnitud de flechas |
| Patrón de puntos / rayado a 45° | Superficie del corte | Signo **+** / **−** del escalar | — |
| Curva discontinua | Superficie del corte | Nivel cero del escalar | — |
| Glifos +/−, ⊙/⊗, ↺/↻ dispersos | Superficie del corte | Signo de div, de $F_n$ y de $(\nabla\times\mathbf F)\cdot\mathbf n$ | — |
| Anillo con flecha alrededor del eje | Glifo de rotacional | Sentido de giro (regla de la mano derecha) | — |
| Aro + cruz + etiqueta «P» | Punto | Punto inspeccionado | — |
| Letra + estilo de línea | Ejes | x continuo · y discontinuo · z punteado | — |

**Reutilizaciones explicadas**: la luminancia aparece en dos bandas disjuntas y sobre marcas
diferentes (glifos frente a superficie del corte). La leyenda muestra dos barras con títulos
distintos («|F|» y, por ejemplo, «div F en z = 0.00»). Los glifos de F y de rot F son
**excluyentes** («Glifos: F · rot F»), de modo que la banda clara siempre tiene un único
significado en cada momento, nombrado en la leyenda.

**Prohibido en la escena**: iluminación que sombree los glifos (materiales sin iluminación,
`MeshBasicMaterial`), niebla por profundidad y transparencia en flechas. Las tres alterarían
la luminancia, que ya codifica la magnitud. La profundidad se percibe por perspectiva,
oclusión, halo y paralaje al orbitar.

### 9.2 Sentido de cada vector

- Flecha = cilindro + **cono** en el extremo de llegada, **centrada en su nodo**. El cono mide
  el 30 % de $\ell_{\max}$ y su radio, el 9 %. Si la flecha es más corta que 1.5 conos, se
  escala entera para conservar la forma de flecha.
- **Pistas de forma sin iluminación** (añadidas en REV-01): (1) la **base del cono**, que solo
  se ve cuando la flecha se aleja de la cámara, se dibuja más oscura (≈ 55 %); (2) el cono
  lleva un **degradado fijo** del vértice (gris exacto de la rampa) al borde de la base (80 %).
  No dependen de la luz ni de la vista, así que el gris del cilindro y del vértice sigue siendo
  exactamente el de la magnitud. Sin ellas, «hacia mí» y «lejos de mí» se veían como el mismo
  disco plano.
- **Halo**: cada flecha se dibuja con un contorno oscuro de ≈ 1.5 px (casco invertido en
  `#101010`). Separa las flechas que se cruzan en escenas densas y garantiza 3.57:1 frente a
  cualquier fondo, incluido el mapa del corte.

### 9.3 Magnitud

- **Proporcional** (por defecto): $\ell=\ell_{\max}\min(\lVert\mathbf F\rVert/F_{\text{ref}},1)$
  y luminancia $L^*=45.2+51.3\,u$ con $u=\min(\lVert\mathbf F\rVert/F_{\text{ref}},1)$.
- **Normalizada**: longitud constante $0.75\,\ell_{\max}$; la magnitud **solo** por
  luminancia. La leyenda lo dice: «longitud constante: solo dirección».
- **Luminancia logarítmica** (Avanzado), para campos con singularidades:
  $u=\log_{10}(1+9\,\lVert\mathbf F\rVert/F_{\text{ref}})$; las marcas de la leyenda se
  recalculan.
- **Saturación**: $\lVert\mathbf F\rVert\ge F_{\text{ref}}$ → doble punta y luminancia máxima.
- La leyenda muestra la barra de luminancia con marcas numéricas (0, $F_{\text{ref}}/2$,
  $F_{\text{ref}}$ ≥) y una **flecha de referencia** de longitud $\ell_{\max}$ rotulada
  «= F_ref = 2.5».

### 9.4 Campo frente a líneas de corriente

| | Flechas | Líneas de corriente |
| --- | --- | --- |
| Geometría | Glifos discretos con cono, en nodos | Curvas continuas de 1.5 px |
| Sentido | Cono | Cheurones › cada 1.5 Δ de longitud de arco |
| Luminancia | Rampa de magnitud | Constante `#A0A0A0` |
| Origen | Malla | Semilla ○ |
| Final | — | Borde de la caja, ◇ o × |

Con ambas capas activas, las líneas se dibujan **detrás** (con su halo) y las flechas
encima. El interruptor «Flechas: solo en el corte» permite ver las líneas sin oclusión.

### 9.5 Plano de corte y punto seleccionado

- **Corte**: contorno discontinuo (6-4 px) `#8C8C8C`, velo `#F5F5F5` al 3 % y etiqueta
  «z = 0.00» en la esquina más cercana a la cámara. Las flechas de fuera del corte pueden
  ocultarse («solo en el corte»), nunca atenuarse.
- **Punto P**: aro en pantalla de 14 px (trazo de 2 px `#F5F5F5` + halo), cruz de líneas
  discontinuas `#B0B0B0` paralelas a los ejes hasta las caras de la caja y etiqueta «P».
  En P se dibuja la flecha **exacta** de $\mathbf F(P)$, aunque P no sea un nodo. Su
  identificación no depende del tono: es una forma (aro), una geometría (cruz) y un texto.

### 9.6 Divergencia: positiva, negativa y nula

Sobre el corte, con «Escalar: div F»:

| Valor | Luminancia (banda oscura) | Patrón | Glifo disperso | Contorno |
| --- | --- | --- | --- | --- |
| div > 0 | ∝ \|div\|/V_ref | **Puntos** | **+** | — |
| div < 0 | ∝ \|div\|/V_ref | **Rayado** a 45° | **−** | — |
| \|div\| < 2 % V_ref | Fondo | Ninguno | Ninguno | Curva discontinua en div = 0 |

- $V_{\text{ref}}$: P95 de |escalar| en el corte (simétrico), redondeado como $F_{\text{ref}}$;
  se puede fijar.
- Los patrones se generan en el *shader* en coordenadas del plano (no de la pantalla), así
  que acompañan al plano al orbitar.
- El inspector traduce el signo en palabras: «div F(P) = +3.000 · fuente local: sale más de
  lo que entra».

### 9.7 Rotacional

1. **Glifos de rot F** («Glifos: rot F»): cilindro + cono, más un **anillo** alrededor del
   eje con dos puntas de flecha opuestas, orientadas hacia la cámara, que marcan el sentido de
   giro por la regla de la mano derecha (D-40).
   La banda clara pasa a significar $\lVert\nabla\times\mathbf F\rVert$, con su propia
   $C_{\text{ref}}$ en la leyenda.
2. **Sobre el corte** («Escalar: rot F · n»): misma codificación que la divergencia, con
   glifos dispersos **↺** (positivo, antihorario visto desde $+\mathbf n$) y **↻** (negativo).
3. **Rueda de paletas** en P: cuatro palas orientadas según $\nabla\times\mathbf F(P)$ que
   giran a $\tfrac12\lVert\nabla\times\mathbf F\rVert$ en la escala temporal τ de las
   partículas, con el rótulo «ω = 1.000 rad/t». Con movimiento reducido o en pausa, queda
   estática con una flecha curva de sentido. Junto a ella, «Supuestos» enlaza a la ayuda
   (SPEC §3.4).

### 9.8 Componente normal $F_n$ sobre el corte

Banda oscura ∝ $\lvert F_n\rvert$, puntos para $F_n>0$ y rayado para $F_n<0$, con glifos
dispersos **⊙** (sale hacia $+\mathbf n$) y **⊗** (entra). Es la convención habitual de los
textos de física para vectores perpendiculares al papel.

### 9.9 Ejes, caja y etiquetas

- Ejes por el origen si está dentro de Ω; si no, en la esquina $(x_{\min},y_{\min},z_{\min})$.
  Punta en el extremo positivo, letra x/y/z y estilo de línea propio (continuo, discontinuo,
  punteado).
- Marcas numéricas en valores «redondos» (1, 2, 2.5, 5 × 10ᵏ), 11 px `#B0B0B0`, dibujadas
  como *sprites* de texto **dentro del lienzo WebGL**, para que se exporten con la imagen.
- Caja del dominio: aristas de 1 px `#404040`.

### 9.10 Escalas comparables entre experimentos

- $F_{\text{ref}}$, $V_{\text{ref}}$ y $C_{\text{ref}}$ siempre visibles con su origen:
  «auto (P95)» o «fija».
- **Fijar escala** (icono `lock`) congela el valor actual. Al cambiar de campo o de parámetro, longitudes
  y luminancias siguen siendo comparables. La escala fija se guarda en la configuración
  exportada.
- La leyenda muestra también $\ell_{\max}$ en unidades del dominio. Comparar experimentos
  exige el mismo dominio y la misma $N$; si difieren con escala fija, la leyenda lo avisa
  («Δ distinto: longitudes no comparables»).

### 9.11 Claridad al aumentar la densidad

1. Densidad por defecto moderada (9³); máximo 21³.
2. Halo oscuro en todas las marcas.
3. «Flechas: solo en el corte» para leer en 2D dentro del 3D.
4. Vistas ortográficas XY/XZ/YZ.
5. Tamaño de flecha ligado a Δ: al aumentar N, las flechas se acortan y no se invaden.
6. Prueba de estrés visual con 21³ (captura C7, VV-05).

### 9.12 Leyenda: reglas

- Visible siempre que haya una capa activa; plegable, pero **no se oculta** sola.
- Solo muestra entradas de las capas visibles, en este orden: magnitud → glifos especiales →
  líneas → partículas → corte.
- Cada entrada combina muestra gráfica y texto (≥ 11 px). Ninguna entrada depende solo del
  gris.
- Se incluye en la exportación PNG cuando se elige «con leyenda».

### 9.13 Tiempo en la escena (1.1)

- Las flechas están **ancladas a sus nodos**: con $t$ cambia el vector de cada nodo (dirección,
  longitud y luminancia), nunca su posición. Lo que se desplaza son las partículas.
- La escala es común a toda la ventana temporal (SPEC §3.10): la leyenda dice
  «F_ref = … (P95 en t ∈ [t₀, t₁])».
- Las líneas de corriente llevan en la leyenda «instantáneas en t = …» con el $t$ con que se
  calcularon; si el reloj va por delante, ese valor lo dice.
- Partículas: «trayectorias ṙ = F(r, t)» o, emitidas desde las semillas, «líneas de traza».
- Sin $t$ en las ecuaciones nada de esto aparece: la leyenda es la de la 1.0.

---

## 10. Accesibilidad visual

- Contrastes de §2 (RNF-02), verificados con axe-core y con la auditoría de píxeles.
- Foco siempre visible y nunca tapado por tarjetas flotantes (WCAG 2.4.11).
- Funciona con el zoom del navegador al 200 % en 1280×720 (cambia al punto de ruptura
  inferior).
- `forced-colors: active` (contraste alto de Windows): la interfaz conserva bordes del
  sistema; la escena no cambia (es contenido gráfico) y se ofrece su descripción textual.
- La escena tiene `aria-describedby` con un resumen vivo («Campo helicoidal, 729 flechas, 4
  líneas de corriente, corte XY en z = 0»).

> **Nota sobre las fuentes normativas**: los criterios WCAG 2.2 citados (1.4.3, 1.4.11, 2.4.11,
> 2.5.8) se han tomado del conocimiento previo. La política de red de este entorno bloquea
> w3.org; deben contrastarse con el texto oficial al implementar (STATUS.md R-12).
