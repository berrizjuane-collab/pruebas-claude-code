# K2 — Atlas interactivo

Representación geográfica 3D del **K2** (8 611 m, Karakórum, frontera entre
Pakistán y China) construida a partir de datos reales: el modelo de elevación
**Copernicus DEM GLO-30** y una escena **Sentinel-2** de agosto de 2024. Permite
orbitar el monte con una cámara limitada que no atraviesa el relieve, identificar
caras, aristas y glaciares, activar las rutas del **Espolón de los Abruzzos** y del
**espolón Česen** (con su tramo compartido), y consultar campamentos, Bottleneck,
serac, travesía, zona de la muerte y cumbre, cada uno con su grado de certeza.

> Atlas divulgativo: no simula meteorología, avalanchas ni fisiología, y no sirve
> para navegar ni planificar una ascensión.

## Uso rápido

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # comprobación de tipos + build de producción en dist/
npm run preview    # sirve dist/
```

Requiere Node ≥ 22.12 y un navegador con **WebGL 2**. La build usa rutas
relativas (`base: './'`), así que `dist/` funciona desde cualquier subruta.

| Script | Qué hace |
| --- | --- |
| `npm run check` | ESLint + `tsc` + tests unitarios (Vitest) |
| `npm test` | 68 tests unitarios: proyección frente a pyproj, alturas, PNG, LOD (incluido el intercambio exacto de los grupos 2×2), cámara, transiciones, etiquetas, datos, vistas contra el DEM real |
| `npm run test:e2e` | 16 pruebas Playwright en Chromium (carga, capas, cámara, presupuesto de draw calls, 40 ciclos de recursos, calidad, móvil, accesibilidad, sin WebGL, fallo de red y pérdida del contexto WebGL) |
| `npm run perf` | 3 escenarios × 30 s por perfil de calidad → `docs/rendimiento.json` (`PERF_GPU=1` para usar la GPU) |
| `npm run capturas` | Regenera `docs/capturas/` |
| `bash pipeline/run_all.sh` | Regenera todos los datos desde las fuentes (Python, ver `pipeline/README.md`) |

## Controles

| Acción | Ratón / táctil | Teclado (con el foco en la vista) |
| --- | --- | --- |
| Girar | arrastrar · un dedo | flechas |
| Acercar / alejar | rueda · pellizco · botones + y − | `+` y `−` |
| Desplazar | botón derecho o Mayús + arrastrar · dos dedos | — |
| Vista general | botón ⟲ | `R` |
| Norte arriba | brújula | — |
| Cerrar ficha | × | `Esc` |
| Diagnóstico | — | `D` (o `?diag=1`) |

El panel (en móvil, la hoja inferior «Rutas, capas y vistas») incluye:

- **Rutas**: interruptor maestro, cada vía (color + patrón: Abruzzi continuo azul,
  Česen discontinuo ámbar, tramo compartido bicolor) y «Destacar», que deja ver
  solo los campamentos de esa vía.
- **Capas**: etiquetas, campamentos, zona de la muerte (máscara altimétrica e
  isolínea de 8 000 m), procedencia del relieve (qué parte del DEM es medida
  TanDEM-X y qué parte relleno) y luz (mañana/tarde).
- **Vistas**: general, Abruzzi, Hombro y Campo IV, Bottleneck y serac, cumbre y cara norte.
- **Puntos de interés**: lista HTML completa (accesible aunque falle WebGL).
- **Calidad**: Auto, Alta, Media o Baja.
- **Fuentes y método** y **Ayuda**.

Parámetros de URL: `?q=baja|media|alta` fija el perfil, `?diag=1` muestra el
diagnóstico y `?lod=1` colorea los bloques por nivel de detalle.

## Datos

| Recurso | Origen | Peso |
| --- | --- | ---: |
| Alturas (PNG 16 bits): núcleo 14,4 km a 25 m, contexto 43,2 km a 100 m, horizonte 72 km a 400 m | Copernicus DEM GLO-30 | 0,8 MB |
| Albedo (WebP) a 10/40/160 m y máscaras de nieve | Sentinel-2 L2A 2024-08-14 | 1,3 MB |
| Procedencia por píxel + cielo visible (PNG) | máscara FLM del DEM | 0,2 MB |
| Rutas, puntos, serac, manifiesto (JSON) | pipeline + datos curados | 0,1 MB |

Descarga total para la escena interactiva: **≈ 2,3 MB** (presupuesto: ≤ 20 MB).
Detalles, licencias y límites en [`docs/FUENTES.md`](docs/FUENTES.md); medición y
verificación en [`docs/VERIFICACION.md`](docs/VERIFICACION.md).

Sistema espacial: transversa de Mercator local centrada en la coordenada
publicada de la cumbre (x este, y norte, metros; WGS84), alturas EGM2008, escala
1:1 sin exageración. En la escena: X = este, Y = altitud − 6 000 m, Z = sur.

## Rendimiento

Cada perfil tiene un presupuesto explícito para el pase principal (las sombras se
miden aparte), definido en `src/config/quality.ts`:

| Perfil | Triángulos | Draw calls | DPR máx. | Sombras |
| --- | ---: | ---: | ---: | --- |
| Baja | 250 k | 70 | 1,0 | no |
| Media | 500 k | 100 | 1,5 | mapa de 2048 |
| Alta | 1,2 M | 150 | 2,0 | mapa de 4096 |

**Auto** parte de las capacidades detectadas y ajusta el perfil con el tiempo de
fotograma medido (mediana y p95, con histéresis para no oscilar). Render bajo
demanda; LOD por error en pantalla con geomorphing; grupos de 2×2 bloques que se
dibujan como uno cuando están lejos; recorte por caja; sombras solo al cambiar la
luz o la geometría; mallas construidas en un Web Worker. Las cifras medidas (por
vista, peor caso, 3 escenarios × 30 s y ciclos de recursos) están en
[`docs/VERIFICACION.md`](docs/VERIFICACION.md).

## Estructura

```
index.html                 interfaz semántica (español)
src/
  main.ts                  arranque: WebGL, carga con progreso, worker, errores y reintento
  app.ts                   orquestación, render bajo demanda, calidad, diagnóstico
  config/                  presupuestos de calidad, límites de cámara, vistas
  data/                    tipos, carga, lector PNG, validación de datos
  geo/                     proyección (Krüger), marco de escena, campos de altura
  terrain/                 worker de mallas, LOD con geomorphing y grupos 2×2, material, serac
  scene/                   cielo, niebla, luces y sombras
  routes/                  rutas con Line2 (grosor en píxeles, tramo común bicolor)
  poi/                     marcadores HTML, oclusión y colocación sin solapes
  camera/                  OrbitControls + restricciones + transiciones planificadas
  quality/                 calidad automática por tiempo de fotograma
  ui/                      panel, ficha, diálogos, formato numérico
public/data/               datos generados por el pipeline (versionados)
pipeline/                  scripts Python reproducibles + datos curados
tests/unit, tests/e2e      Vitest y Playwright
scripts/                   rendimiento y capturas
docs/                      fuentes, verificación, capturas
```

Para mejorar el terreno basta con regenerar `public/data` (otro DEM u otra escena)
con el pipeline: la aplicación no tiene alturas, rutas ni marcadores en el código.

## Licencias de los datos

Relieve: *produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus
Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and
ESA; all rights reserved.* *The organisations in charge of the Copernicus programme
by law or by delegation do not incur any liability for any use of the Copernicus
WorldDEM-30.* Imagen: contiene datos Copernicus Sentinel modificados (2024).
