# Los 14 ochomiles · la antesala de la serie

Web que reúne la serie de los ochomiles. La portada es un mapa del Himalaya y el
Karakórum, pintado a pincel seco y de noche, con las catorce cumbres de más de ocho mil
metros. Al pulsar una sale, al lado de su nombre, una tarjeta: «¿Desea explorar el
Lhotse?». Con **Sí**, el mapa se acerca a la cumbre y entra en la web de ese pico.
Las cumbres que aún no tienen web aparecen como círculos punteados («sin levantar»).

```
ochomiles-web/
├── index.html              la antesala (HTML + CSS + JS en un archivo, sin dependencias)
├── assets/                 el mapa en 1600, 2560 y 3840 px (webp) y mapa.json
├── annapurna/  k2/  nanga-parbat/  manaslu/  makalu/  kangchenjunga/  lhotse/  broad-peak/
│                           las ocho webs ya hechas, tal como se sirven
├── herramientas/
│   └── pintar_mapa.py      el pintor del mapa (no se despliega)
├── vercel.json             caché de imágenes y barra final en las rutas
└── .vercelignore           deja fuera herramientas/ y este README
```

## Verla en local

Las webs cargan texturas y módulos, así que hace falta un servidor:

```bash
cd ochomiles-web && python3 -m http.server 8000     # http://localhost:8000
```

## La identidad: «el mapa del cartógrafo»

La antesala toma la metáfora del Gran Levantamiento Trigonométrico de la India, que midió
el Himalaya a teodolito en el siglo XIX: las cumbres exploradas son **vértices** (el
triángulo con punto del vértice geodésico) y las pendientes son territorio sin levantar.

| Uso | Fuente |
|---|---|
| Título, nombres de cumbres y ríos (en cursiva, como en los atlas) | Bodoni Moda |
| Rótulos de cordillera, texto | Archivo (ancho 112–125 % en mayúsculas espaciadas) |
| Altitudes y coordenadas | IBM Plex Mono |

| Token | Color | Uso |
|---|---|---|
| Noche de campo | `#0E1020` | fondo |
| Tiza | `#F0ECE0` | texto principal |
| Bruma | `#C4D0E4` | texto secundario |
| Hielo en sombra | `#8298C8` | rótulos de cordillera |
| Velo | `#606476` | cumbres pendientes |
| Latón de teodolito | `#D4A64A` | acento: vértices, botón «Sí» |
| Alpenglow | `#EEA48C` | solo el estado activo |

Cada web de pico conserva su propia identidad; la antesala no las toca.

## El mapa

`herramientas/pintar_mapa.py` sigue la especificación «pincel seco sobre fondo oscuro» de
la serie, etapa por etapa, en su variante de noche:

1. **Relieve real**: AWS Terrain Tiles (z8) reproyectadas a una cónica conforme de Lambert
   centrada en el arco (paralelos 27° y 37° N, meridiano 81° E), 1 950 × 1 300 km.
2. **Imagen objetivo y regiones**: pisos de color por altitud y sombra de lluvia, nieve
   decidida a escala de ladera, glaciares, ríos y lagos de Natural Earth; después la paleta
   de luna (§2.3) y el hundimiento de llanuras y meseta para que solo brille la cordillera.
3. **Campo de orientación** por tensor de estructura (§3).
4. **Cinco pasadas de pincel** a doble resolución, con filtro de error y cerdas (§4):
   unas 400 000 pinceladas.
5. **Acabado** (§7): temblor, lavado turbio, grano del papel, fondo oscuro en los valles,
   tiza fría en las crestas, borde irregular y viñeta.

```bash
pip install numpy opencv-python-headless pillow pyproj
python3 herramientas/pintar_mapa.py          # assets/mapa-{1600,2560,3840}.webp + mapa.json (≈ 1 min)
python3 herramientas/pintar_mapa.py 1600      # ensayo rápido, no toca assets/
```

Las coordenadas `u, v` de cada cumbre y de los rótulos (en `assets/mapa.json`) solo
dependen de la proyección y de la extensión, no del pincel; `index.html` las lleva
copiadas en `PICOS` y `GEO`. Si se cambia la extensión, hay que copiarlas de nuevo.

## Añadir un ochomil

1. Copiar su web, tal como se sirve, a una carpeta con su `id` (por ejemplo `everest/`).
2. En `index.html`, en su entrada de `PICOS`, poner `web:'everest/'` y su `lema`.

El círculo punteado pasa a ser un vértice, el contador sube y el índice lo enlaza.

## Procedencia de las ocho webs

| Carpeta | Rama de origen | Notas |
|---|---|---|
| `annapurna/` | `claude/affectionate-heisenberg-xpzfje` (`annapurna/`) | |
| `k2/` | `claude/magical-cori-2fhpn0` (`k2-epitafio/`) | |
| `nanga-parbat/` | `claude/jolly-gauss-lhe1zi` (`nanga-parbat/`) | |
| `manaslu/` | `claude/amazing-euler-d3lnwa` (`manaslu/`) | sin la propuesta de nubes ni la versión autocontenida |
| `makalu/` | `claude/optimistic-mccarthy-76ssx0` (`makalu/`) | |
| `kangchenjunga/` | `main` (`kangchenjunga/site/`) | se le añadió la cabecera `<!doctype>` + `charset` + `viewport` que antes ponía la plataforma de artifacts |
| `lhotse/` | `main` (`lhotse/`) | |
| `broad-peak/` | `main` (`broad-peak/`) | `index.html`, `img/` y `plantillas/`; sin `src/` ni `herramientas/` |

Solo se copian los archivos que la web necesita en el navegador; el código que genera
las láminas sigue en cada rama.

## Datos y licencias

- Relieve: [AWS Terrain Tiles](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)
  (SRTM, GMTED2010, ETOPO1 y otros).
- Ríos y lagos: [Natural Earth](https://www.naturalearthdata.com/), dominio público.
- Coordenadas de las cimas: `config/peaks.json` de la película «14 cumbres»
  (rama `claude/tender-hopper-1yq8ag`). No se dibujan fronteras.
- Fuentes: Bodoni Moda, Archivo, IBM Plex Mono (SIL Open Font License 1.1), servidas por
  Google Fonts.
