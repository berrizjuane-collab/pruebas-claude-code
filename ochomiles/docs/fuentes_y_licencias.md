# Registro de fuentes y licencias

*14 cumbres. Un horizonte extraordinario.* · película promocional de 180 s

Todo lo que se ve y se oye en la película se ha generado por código en este repositorio a
partir de las fuentes de esta página. No hay metraje, fotografía, música ni efectos de
sonido de archivo o de terceros, ni imágenes generadas con IA.

---

## 1. Datos editoriales

### Convención de altitudes

- **Altitudes:** tabla de referencia de [8000ers.com](https://www.8000ers.com) (Eberhard
  Jurgalski), la misma del encargo.
- **Everest:** 8.848,86 m, la medición conjunta de Nepal y China anunciada el 8 de
  diciembre de 2020
  ([Al Jazeera, 8-12-2020](https://www.aljazeera.com/news/2020/12/8/mt-everest-nepal-china-announce-revised-height-at-8848-metres);
  también la recoge el Department of Tourism de Nepal en *Mountaineering in Nepal: Facts
  and Figures*, 2023, tourismdepartment.gov.np).
- **Formato en pantalla:** punto como separador de miles y coma decimal (8.848,86 m), con
  cifras tabulares.
- **Orden:** ascendente de altitud, de Shishapangma (8.027 m) a Everest (8.848,86 m).
- **Coordenadas (WGS84):** se parte de la referencia publicada (`approx_lat/lon`) y se
  afina al máximo local del Copernicus DEM GLO-30 en un radio de 300 m
  (`src/geo/refine_summits.py`; campos `dem_lat/dem_lon` de `config/peaks.json`). Los
  marcadores del mapa y las etiquetas de los planos 3D se colocan proyectando estas
  coordenadas; no se ha colocado ninguno a ojo.

### Las 14 cumbres y su dato en pantalla

| # | Cumbre | Altitud | Ubicación | Cordillera | Cima (DEM, WGS84) | Dato en pantalla | Fuentes |
|---|---|---|---|---|---|---|---|
| 1 | Shishapangma | 8.027 m | Tíbet, China | Himalaya | 28,35225 N · 85,78146 E | El único ochomil enteramente en China y el último en ascenderse (1964). | [Wikipedia](https://en.wikipedia.org/wiki/Shishapangma) · [Explorersweb](https://explorersweb.com/a-short-history-of-shisha-pangma-and-its-climbing-routes/) |
| 2 | Gasherbrum II | 8.034 m | Frontera Pakistán–China | Karakórum | 35,75753 N · 76,65261 E | Una expedición austriaca lo ascendió por primera vez en julio de 1956. | [Guinness World Records](https://www.guinnessworldrecords.com/world-records/114106-first-ascent-of-gasherbrum-ii) · [Wikipedia](https://en.wikipedia.org/wiki/Gasherbrum_II) |
| 3 | Broad Peak | 8.051 m | Frontera Pakistán–China | Karakórum | 35,81142 N · 76,56680 E | Debe su nombre a una cumbre de más de kilómetro y medio. | [Wikipedia](https://en.wikipedia.org/wiki/Broad_Peak) |
| 4 | Gasherbrum I | 8.080 m | Frontera Pakistán–China | Karakórum | 35,72497 N · 76,69837 E | También llamado Hidden Peak: se oculta tras otras cumbres desde el Baltoro. | [American Alpine Club](https://americanalpineclub.org/news/2018/6/30/happy-anniversary-gasherbrum-i-first-ascent) · [Wikipedia](https://en.wikipedia.org/wiki/Gasherbrum_I) |
| 5 | Annapurna I | 8.091 m | Nepal | Himalaya | 28,59619 N · 83,81952 E | El primer ochomil ascendido: Herzog y Lachenal, 3 de junio de 1950. | [Guinness World Records](https://www.guinnessworldrecords.com/world-records/109056-first-ascent-of-annapurna-i) · [Explorersweb](https://explorersweb.com/the-75th-anniversary-of-the-first-ascent-of-an-8000m-peak-annapurna-i/) |
| 6 | Nanga Parbat | 8.125 m | Pakistán | Himalaya | 35,23855 N · 74,58931 E | Su cara Rupal se eleva unos 4.600 metros sobre su base. | [Wikipedia](https://en.wikipedia.org/wiki/Nanga_Parbat) · [Explorersweb](https://explorersweb.com/a-history-of-climbing-on-nanga-parbats-rupal-face/) |
| 7 | Manaslu | 8.163 m | Nepal | Himalaya | 28,55070 N · 84,55921 E | Su nombre suele traducirse como «montaña del espíritu». | [Wikipedia](https://en.wikipedia.org/wiki/Manaslu) · [Nepal Traveller](https://nepaltraveller.com/sidetrack/manaslu-himal-aaarohan-diwas-commemorating-the-first-ascent-of-the-mountain-of-the-spirit) |
| 8 | Dhaulagiri I | 8.167 m | Nepal | Himalaya | 28,69792 N · 83,48948 E | En 1808 pasó a considerarse la montaña más alta del mundo. | [Wikipedia](https://en.wikipedia.org/wiki/Dhaulagiri) · [Wikipedia: cumbres consideradas las más altas](https://en.wikipedia.org/wiki/List_of_past_presumed_highest_mountains) |
| 9 | Cho Oyu | 8.188 m | Frontera Nepal–China | Himalaya | 28,09697 N · 86,66023 E | Vecino del Nangpa La, histórico paso comercial entre Nepal y el Tíbet. | [Wikipedia](https://en.wikipedia.org/wiki/Cho_Oyu) · [Britannica: Nangpa La](https://www.britannica.com/place/Nangpa-La) |
| 10 | Makalu | 8.485 m | Frontera Nepal–China | Himalaya | 27,89146 N · 87,08851 E | Pirámide aislada de cuatro caras, a 19 km al sureste del Everest. | [Wikipedia](https://en.wikipedia.org/wiki/Makalu) |
| 11 | Lhotse | 8.516 m | Frontera Nepal–China | Himalaya | 27,96178 N · 86,93243 E | «Pico sur» en tibetano: el Collado Sur lo une al Everest. | [Wikipedia](https://en.wikipedia.org/wiki/Lhotse) |
| 12 | Kangchenjunga | 8.586 m | Frontera Nepal–India | Himalaya | 27,70277 N · 88,14758 E | En 1955 sus primeros escaladores se detuvieron bajo la cima, por respeto. | [Wikipedia](https://en.wikipedia.org/wiki/Kangchenjunga) |
| 13 | K2 | 8.611 m | Frontera Pakistán–China | Karakórum | 35,88072 N · 76,51250 E | Su nombre procede de la notación topográfica de 1856: Karakórum 2. | [Wikipedia](https://en.wikipedia.org/wiki/K2) |
| 14 | Everest | 8.848,86 m | Frontera Nepal–China | Himalaya | 27,98904 N · 86,92555 E | Sagarmatha y Chomolungma: el punto más alto de la Tierra. | [Al Jazeera](https://www.aljazeera.com/news/2020/12/8/mt-everest-nepal-china-announce-revised-height-at-8848-metres) · Department of Tourism de Nepal (2023) |

**Cordillera.** La película separa el Himalaya (10 cumbres) del Karakórum (K2, Broad Peak
y los dos Gasherbrum) de dos maneras: cada capítulo rotula «ubicación · cordillera» bajo la
altitud, y los mapas trazan los nombres HIMALAYA y KARAKÓRUM a lo largo del eje de cada
cordillera, con un recuadro ampliado del grupo del Baltoro. Nanga Parbat se rotula como
Himalaya, del que es el extremo occidental.

**Lo que no se afirma.** No hay en la película tasas de éxito, rutas, récords de
velocidad, número de ascensiones, mortalidad ni credenciales de la empresa. La línea que
une los 14 puntos en la síntesis se rotula «Recorrido editorial — orden ascendente de
altitud, no una ruta».

---

## 2. Datos geoespaciales

### Copernicus DEM GLO-30 (relieve de los planos 3D)

- 29 teselas de 1°: N27 E083–E088, N28 E082–E088, N29 E082–E086, N34 E073–E075,
  N35 E073–E077, N36 E075–E077.
- Origen: bucket público `copernicus-dem-30m` (AWS Open Data).
- Licencia: licencia Copernicus DEM GLO-30 (uso libre, también comercial, con atribución).
  Atribución obligatoria, incluida en la firma de la película:
  *© DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, proporcionado en el
  marco de COPERNICUS por la Unión Europea y la ESA; todos los derechos reservados.*

### Copernicus Sentinel-2 L2A (color de la superficie)

Imágenes de reflectancia de superficie a 10 m, en Cloud-Optimized GeoTIFF del bucket
público `sentinel-cogs` (Element 84, AWS Open Data). Se eligió una sola fecha por región,
sin nubes y con poca nieve reciente, y se usa como albedo: el motor la vuelve a iluminar
con el sol de cada plano.

| Región 3D | Cumbres | Fecha | Productos |
|---|---|---|---|
| Khumbu | Cho Oyu, Everest, Lhotse, Makalu | 3-12-2023 | S2A_45RVL / 45RVM / 45RWL / 45RWM _20231203_0_L2A (línea base 05.09) |
| Karakórum | K2, Broad Peak, Gasherbrum I y II | 7-11-2025 | S2C_43SFV_20251107_0_L2A (05.11) |
| Annapurna | Annapurna I, Dhaulagiri I | 15-11-2025 | S2C_44RQS / 44RQT / 45RTM / 45RTN _20251115_0_L2A (05.11) |
| Manaslu | Manaslu | 15-11-2025 | S2C_45RTM_20251115_0_L2A (05.11) |
| Shishapangma | Shishapangma | 3-12-2022 | S2B_45RUM / 45RVM _20221203_0_L2A (04.00) |
| Nanga Parbat | Nanga Parbat | 15-11-2025 | S2B_43SDU / 43SDV _20251115_0_L2A (05.11) |
| Kangchenjunga | Kangchenjunga | 19-12-2024 | S2B_45RWL / 45RXL _20241219_0_L2A (05.11) |

- Licencia: datos Copernicus Sentinel de acceso libre, completo y abierto (también para
  uso comercial). Atribución incluida en la firma: *datos modificados de Copernicus
  Sentinel-2 (2022-2025)*.

### Terrain Tiles (relieve lejano y mapas)

- Teselas Terrarium de los niveles de zoom 6, 9 y 10 (1.927 teselas) del bucket público
  `elevation-tiles-prod` (Mapzen/Tilezen, AWS Open Data). Se usan para los horizontes
  lejanos de los planos 3D y para el relieve de los mapas, y para rellenar los huecos sin
  dato del GLO-30.
- Fuentes de esas teselas en Asia: SRTM y GMTED2010 (USGS) y ETOPO1 (NOAA). Atribución
  según [tilezen/joerd](https://github.com/tilezen/joerd/blob/master/docs/attribution.md);
  en la firma: *Terrain Tiles (Mapzen, SRTM y otras fuentes)*.

### Natural Earth (cartografía vectorial)

- Capas: `ne_50m_coastline`, `ne_50m_land`, `ne_50m_admin_0_countries`,
  `ne_10m_admin_0_countries`, `ne_10m_admin_0_boundary_lines_land`,
  `ne_10m_admin_0_boundary_lines_disputed_areas`, `ne_10m_rivers_lake_centerlines`,
  `ne_10m_lakes`, `ne_10m_glaciated_areas`, `ne_10m_geography_regions_polys`.
- Licencia: dominio público ([naturalearthdata.com](https://www.naturalearthdata.com/about/terms-of-use/)).
  El crédito no es obligatorio; se incluye igualmente.
- Las fronteras dibujadas son las de Natural Earth y se muestran solo como referencia
  geográfica, sin tomar posición sobre territorios en disputa.

### Procesado y correcciones (documentadas, no inventadas)

1. **Huecos del mosaico.** Fuera de las teselas GLO-30 el mosaico virtual devolvía 0 m.
   Ahora esas celdas se marcan como «sin dato» y se rellenan con Terrain Tiles
   (`src/geo/terrain_prep.py`, `from_cop30` y `from_terrarium`).
2. **Artefactos.** Las cotas negativas o superiores a 8.850 m pasan a «sin dato» en todos
   los niveles. En los niveles de 90 y 270 m, además, una mediana 5×5 retira los picos y
   pozos aislados que se separan más de 900 m de su entorno (anillos del remuestreo junto
   a teselas defectuosas). Los huecos que quedan se rellenan con el valor válido más
   próximo.
3. **Cimas.** El radar del GLO-30 rebaja las cimas afiladas. Para que la montaña que se ve
   tenga la altitud que se rotula, cada cima se eleva hasta la altitud de referencia con
   una cúpula suave de radio 4·Δ + 400 m. Esta corrección solo cambia la forma de la cima
   y nunca se aplica a déficits mayores de 400 m, que se tratan como huecos de datos.
   Correcciones en el nivel de 30 m (`data/work/terrain/*.json`, `summit_fix`):

   | Cumbre | Máx. DEM | Δ añadido | | Cumbre | Máx. DEM | Δ añadido |
   |---|---|---|---|---|---|---|
   | Shishapangma | 7.892,0 m | +135,0 m | | Dhaulagiri I | 8.136,7 m | +30,3 m |
   | Gasherbrum II | 7.960,3 m | +73,7 m | | Cho Oyu | 8.152,2 m | +35,8 m |
   | Broad Peak | 7.983,2 m | +67,8 m | | Makalu | 8.243,1 m | +241,9 m |
   | Gasherbrum I | 7.991,1 m | +88,9 m | | Lhotse | 8.415,9 m | +100,1 m |
   | Annapurna I | 7.919,2 m | +171,8 m | | Kangchenjunga | 8.561,4 m | +24,6 m |
   | Nanga Parbat | 8.103,0 m | +22,0 m | | K2 | 8.571,1 m | +39,9 m |
   | Manaslu | 8.042,9 m | +120,1 m | | Everest | 8.738,0 m | +110,9 m |

---

## 3. Elementos ilustrativos (no documentales)

Para no hacer pasar por real lo que no lo es, esto es lo que la película **recrea**:

- **Macro de apertura** (costra de nieve, huella de crampón de 12 puntas, vaho, luz de
  frontal): textura y luz procedurales.
- **Nubes, ventisca y bruma de las transiciones:** volúmenes procedurales.
- **Sol de cada plano:** posición elegida para cada plano. En la subida al Collado Sur
  del Everest, el amanecer sale a 98° de azimut y el atardecer del campo base a 262°,
  dentro de los márgenes reales a 28° N (orto entre unos 63° y 117°, ocaso entre 243° y
  297°).
- **Luces de tienda en el campo base sur del Everest:** 64 puntos de luz que evocan un
  campamento. No representan una ocupación ni una fecha concretas.
- **Recorrido editorial:** la línea que une las cumbres sigue el orden del montaje y no es
  una ruta.
- **Exageración vertical:** ninguna en la geometría 3D (escala 1:1). El sombreado de los
  mapas sí exagera el relieve, como es habitual en cartografía: ×2,6 en el mapa regional
  y ×9 en el continental.

---

## 4. Tipografía

| Familia | Uso | Autor | Licencia |
|---|---|---|---|
| Source Serif 4 (variable, con cursiva) | títulos, nombres, frases | Adobe / The Source Serif 4 Project Authors | SIL Open Font License 1.1 (`assets/fonts/sourceserif4/OFL.txt`) |
| Inter e Inter Display | cifras (tabulares), datos, rótulos | Rasmus Andersson / The Inter Project Authors | SIL Open Font License 1.1 (`assets/fonts/inter/LICENSE-copyright.txt`) |

La OFL permite usar las fuentes en obras comerciales e incrustarlas en vídeo.

---

## 5. Música y sonido

- **Partitura original** compuesta para la película: 60 compases a 80 BPM en 4/4, de re
  menor a re mayor (`src/audio/score.py`). Doce pistas MIDI interpretadas con
  [FluidSynth](https://www.fluidsynth.org) 2.3.4 (LGPL-2.1, usado como programa externo).
- **Instrumentos muestreados:** soundfont *MuseScore_General* (paquete Debian
  `musescore-general-soundfont` 0.2.1). Licencia MIT; partes en dominio público o CC0
  (cuerdas de Versilian Studios Chamber Orchestra, CC0; piano Splendid Grand, dominio
  público). © 2018-2021 S. Christian Collins.
- **Diseño sonoro** (viento, pasos de crampón, respiración, membranas, subidas,
  impactos) y **reverberación**: síntesis numérica propia (`src/audio/synth.py`). No se usa
  ninguna grabación de terceros.
- **Máster:** −14 LUFS integrados y pico verdadero ≤ −1 dBTP (valores medidos en
  `docs/revision.md`).

---

## 6. Software

| Componente | Uso | Licencia |
|---|---|---|
| Python 3, NumPy, SciPy, Numba | cálculo, sombreado, audio | BSD |
| ModernGL + Mesa (llvmpipe, EGL) | render 3D diferido por software | MIT |
| skia-python, uharfbuzz (HarfBuzz) | tipografía y gráficos vectoriales | BSD-3 / Apache-2.0 (HarfBuzz: MIT) |
| OpenCV, Pillow | procesado de imagen | Apache-2.0 / HPND |
| rasterio (GDAL), pyproj (PROJ), shapely, mgrs | datos geoespaciales | BSD / MIT |
| mido, soundfile, pyloudnorm | MIDI, audio, medida de sonoridad | MIT / BSD-3 / MIT |
| FFmpeg 6.1 (libx264, zscale) | codificación y medida EBU R128 | LGPL/GPL (la salida codificada no queda sujeta a esas licencias) |

---

## 7. Identidad de marca y datos pendientes

- **Nombre de la empresa:** «NOMBRE DE LA EMPRESA» es un marcador provisional
  (`config/brand.json`).
- **Logotipo:** propuesta provisional dibujada por código (sol ámbar tras una arista,
  `src/render/titles.py`, `logo_mark`). No reproduce ninguna marca existente.
- **Contacto, web y teléfono:** vacíos, porque no se ha facilitado ningún dato real.
- **Lema y llamada a la acción:** «Tu próxima expedición empieza mucho antes de la
  cumbre.» y «Planifica tu próxima expedición» (este último lo fija el encargo).
- En la película no hay premios, cifras de clientes, certificaciones ni años de
  experiencia de la empresa.
