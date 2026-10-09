# Pruebas con Claude Code

Colección de proyectos independientes hechos con Claude Code. Ninguno depende de
otro: cada uno tiene su propia carpeta (y, si lo necesita, su propio
`package.json`), y además su propia rama con solo sus archivos y su historia.

## Proyectos en `main`

Cada carpeta es un proyecto completo; entra en ella para instalarlo y ejecutarlo.

| Carpeta | Proyecto | Tecnología | Rama propia |
|---|---|---|---|
| [`neon-wraiths/`](neon-wraiths/) | **NEON WRAITHS**, juego de acción y aventura 2D cenital en la megaciudad cyberpunk Nexus-9 | TypeScript + Vite, Canvas 2D, WebAudio | `juego/neon-wraiths` |
| [`fable-5-1/`](fable-5-1/) | **Fable 5.1**, autorretrato en siete capítulos con constelación en canvas | HTML autocontenido | `web/fable-5-1` |
| [`traza/`](traza/) | **VÉRTICE** (antes TRAZA), calculadora visual de préstamos por el sistema francés para Ingeniería Económica | HTML autocontenido | `web/vertice-calculadora-prestamos` |
| [`traza-promo/`](traza-promo/) | **Spot de TRAZA**, animación promocional de 15 s (MP4 y HTML) | HTML, Playwright, Python y ffmpeg | `web/traza-spot-promocional` |
| [`campos-vectoriales/`](campos-vectoriales/) | **Campos**, laboratorio de campos vectoriales 3D (y dependientes del tiempo desde la 1.1) | TypeScript + Vite + Three.js | `viz/campos-vectoriales-3d-v1.0`, `viz/campos-vectoriales-3d-v1.1` |
| [`nightfall/`](nightfall/) | **NIGHTFALL**, la revista de la noche caraqueña hecha web: mapa neón, locales abiertos en vivo, mezclador y carta para armar la cuenta | HTML autocontenido | `claude/webpage-from-pdf-hbv1pk` |

NEON WRAITHS se publica en GitHub Pages junto con la página de Fable 5.1
(`.github/workflows/deploy.yml`); Pages debe estar activado en
*Settings → Pages → Source: GitHub Actions*.

## Proyectos que viven solo en su rama

Las ramas siguen el esquema `categoría/proyecto`: `juego/`, `viz/` (visualizaciones
y simulaciones) y `web/`.

| Rama | Proyecto |
|---|---|
| `juego/operacion-yggdrasil` | **Operación Yggdrasil**, juego táctico en C++20 + raylib donde el tablero es un Árbol B-4 real |
| `viz/transformaciones-lineales-2d` | **Linear Transformation Lab**, matrices 2×2 deformando el plano, al estilo de 3Blue1Brown |
| `viz/agujero-negro-gargantua-v1` | **Gargantua**, agujero negro interactivo (primera versión) |
| `viz/agujero-negro-gargantua-v2` | **Gargantua**, reconstrucción con geodésicas de Schwarzschild y sistema planetario |
| `viz/jardin-senderos-borges` | **El jardín de senderos que se bifurcan**, el cuento de Borges como DAG hiperbólico |
| `viz/beneath-tierra-reconstruccion` | **BENEATH**, disección cinematográfica de la Tierra (variante: renderer reconstruido) |
| `viz/beneath-tierra-calidad-imagen` | **BENEATH**, la misma pieza (variante: calidad de imagen) |
| `viz/estrella-neutrones-observatorio` | **Neutron Star Observatory**, púlsar 3D con física y panel de instrumentos |
| `viz/estrella-neutrones-cinematica` | **Neutron Star**, versión cinemática construida sobre la anterior |
| `viz/metro-tokio-grafos-3d` | **Tokyo Metro — Graph Control**, la red completa en 3D con Dijkstra, Prim y Kruskal paso a paso |
| `viz/biblioteca-teseracto-4d` | **Biblioteca Tesseráctica**, el teseracto de *Interstellar* con proyección 4D real |
| `web/invar-ciberseguridad` | **INVAR**, sitio one-page de ciberseguridad con scroll narrativo |
| `web/moises-carrero-landing` | **Moisés Carrero**, landing de powerlifting y coaching online |
| `web/moises-carrero-standalone` | **Moisés Carrero**, rediseño en un único archivo |
