# Fuentes, licencias y límites de precisión

Este documento acompaña a `public/data/manifest.json`, que guarda los mismos
datos en forma legible por máquina (URL, SHA-256, transformaciones y
estadísticas). Cada elemento del atlas declara su certeza:

| Estado | Significado |
| --- | --- |
| **Documentado** | Valor publicado por una fuente identificable (p. ej. altitud convencional de la cumbre, umbral de 8 000 m). |
| **Aproximado** | Posición o altitud tomada de fuentes, pero que varía entre expediciones/años o se sitúa con incertidumbre de decenas a cientos de metros. |
| **Reconstruido** | Forma o trazado inferido a partir de descripciones y del relieve; no existe medición pública que lo fije. |

## 1. Relieve: Copernicus DEM GLO-30

| Campo | Valor |
| --- | --- |
| Producto | Copernicus DEM GLO-30 (instancia pública COP-DEM-GLO-30-F), formato COG |
| Distribución | AWS Open Data, `https://copernicus-dem-30m.s3.amazonaws.com/` |
| Teselas | `Copernicus_DSM_COG_10_N35_00_E076_00_DEM`, `Copernicus_DSM_COG_10_N36_00_E076_00_DEM` (+ máscaras FLM, EDM, HEM, WBM) |
| Fecha en el bucket | 2022-05-09 (cabecera `Last-Modified`); SHA-256 en `manifest.json → fuentesTerreno` |
| Resolución nativa | 1″ × 1″ (≈ 30,9 m N–S × 25,0 m E–O a 35,9° N) |
| Sistema horizontal | WGS 84 geográficas (EPSG:4326), píxel como punto |
| Referencia vertical | EGM2008 (alturas ortométricas) |
| Licencia | Licencia Copernicus WorldDEM-30: uso gratuito con derecho de reproducción, distribución, comunicación pública y modificación (EULA `INFO/eula_F.pdf` del propio bucket). |

Avisos obligatorios (art. 6 de la licencia), reproducidos en la aplicación:

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

> The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30

Este atlas no está respaldado por las entidades del programa Copernicus ni por
Airbus.

### Transformaciones aplicadas

1. Mosaico de las dos teselas.
2. Reproyección a una **transversa de Mercator local** (`+proj=tmerc +lat_0=35.8825 +lon_0=76.5133 +k=1 +ellps=WGS84`):
   - análisis y núcleo: 25 m, convolución cúbica (el núcleo es un recorte exacto de la rejilla de análisis);
   - contexto (43,2 km): 100 m, promedio; horizonte (72 km): 400 m, promedio.
3. Ninguna celda sin dato (0 rellenos en todas las rejillas).
4. **Corrección local de la cumbre** (reconstrucción, ver §3).
5. Costura de anillos: el borde interior de cada anillo copia las alturas del anillo más fino.
6. Exportación a PNG gris de 16 bits (`H = 3000 + 0,1·v`).

El remuestreo a 25 m no añade información: la resolución efectiva sigue siendo la
de la fuente (y la del relleno, peor, en la parte alta; ver abajo).

### Procedencia por píxel (máscara FLM del propio DEM)

TanDEM-X no ve bien las paredes muy empinadas (sombra y *layover* del radar);
Copernicus rellenó esos huecos con otros modelos. En el núcleo de 14,4 km:

| Origen | Núcleo | Por encima de 7 000 m |
| --- | ---: | ---: |
| TanDEM-X sin editar (medido) | 41,2 % | **0 %** |
| Relleno AW3D30 (ALOS, estéreo óptico) | 36,7 % | 60,8 % |
| Relleno SRTM30 | 10,6 % | 9,7 % |
| Relleno ASTER | 8,2 % | 14,1 % |
| Relleno SRTM90 | 2,2 % | 7,1 % |
| Editado | 1,2 % | 8,3 % |

Consecuencia: **toda la pirámide cimera es relleno**. La capa «Procedencia del
relieve» de la aplicación muestra estas clases sobre el terreno.

## 2. Imagen: Sentinel-2 L2A

| Campo | Valor |
| --- | --- |
| Escena | `S2A_MSIL2A_20240814T053641_N0511_R005_T43SFV_20240814T112150` (y la tesela 43SFA de la misma pasada para el horizonte) |
| Fecha y hora | 2024-08-14 05:49 UTC; sol a 63,6° de elevación y 140° de acimut |
| Nubosidad | 1,1 % en la tesela; 0,38 % en el núcleo (máscara SCL) |
| Distribución | Element 84 / AWS Open Data, `https://sentinel-cogs.s3.us-west-2.amazonaws.com/` |
| Bandas | B02, B03, B04 (10 m), B11 (20 m), SCL (20 m) |
| Licencia | Datos Copernicus Sentinel: acceso libre, completo y gratuito. Aviso: «Contiene datos Copernicus Sentinel modificados (2024)». |

Método: la reflectancia L2A ya está corregida topográficamente por ESA (se
comprobó que la mediana de la nieve en verde es 0,60–0,66 para cos(i) entre 0,3 y
1,0). No se vuelve a dividir por la iluminación; solo se sustituyen los píxeles
poco fiables (cos(i) < 0,3, sombra proyectada calculada con el DEM, nube) por la
media local de su clase (nieve/no nieve según NDSI). La máscara de nieve es
`smoothstep(0,2; 0,5; NDSI)`. Resoluciones finales: núcleo 10 m, contexto 40 m,
horizonte 160 m.

La textura muestra el estado de **agosto de 2024**; el hielo y la nieve cambian
cada temporada.

## 3. Cumbre y altitud

| Dato | Valor |
| --- | --- |
| Altitud convencional | 8 611 m (documentado) |
| Medición GNSS ítalo-pakistaní de 2014 | 8 609,02 m (contraste) |
| Coordenada publicada | 35°52′57″ N 76°30′48″ E = 35,8825° N 76,5133° E (Wikipedia/GeoNames) — origen del sistema local |
| Píxel más alto del DEM | 8 570,6 m en 35,880833° N 76,512500° E |
| Cumbre del modelo (rejilla de 25 m) | 35,880697° N 76,512469° E, a **213,6 m** de la coordenada publicada |
| Corrección local | +39,4 m en el ápice, perfil (1 − (r/R)²)², R = 250 m; fuera de ese radio el relieve no cambia |

La aplicación ancla la cumbre al máximo del modelo, como pide el encargo, y
explica la discrepancia horizontal en su ficha. No se reescaló el DEM.

## 4. Rutas, campamentos y sectores

No existen GPX públicos y fiables de estas vías. Todo trazado es una
**reconstrucción** sobre el DEM:

| Tramo | Método | Certeza | Longitud |
| --- | --- | --- | ---: |
| Aproximación por el glaciar | mínimo coste por pendiente suave | aproximado | 1,2 km |
| Glaciar hasta el campo base avanzado | idem | aproximado | 3,9 km |
| Espolón de los Abruzzos | mínimo coste que favorece la cresta (curvatura convexa del DEM) entre puntos de control | reconstruido | 2,6 km |
| Espolón Česen (SSE) | idem; se une a la línea del Abruzzi bajo el Hombro (≈ 7 760 m) | reconstruido | 4,4 km |
| Hombro → Bottleneck → travesía → cumbre (común) | polilínea guiada por las descripciones | reconstruido | 1,2 km |

Validación incluida en el pipeline y en los tests: todos los puntos dentro del
núcleo, sobre el relieve (< 1 m frente al DEM), campamentos a < 60 m de su ruta,
el tramo común almacenado una sola vez.

| Punto | Altitud de referencia | Modelo | Certeza | Fuentes |
| --- | --- | ---: | --- | --- |
| Campo base | ≈ 5 000 m (4 990–5 150) | 5 008 m | aproximado | Madison 2019 (4 990 m), Gatta |
| Campo base avanzado (Abruzzi) | ≈ 5 350 m (5 300–5 400) | 5 371 m | aproximado | Gatta; Arnette da 5 650 m |
| C1 Abruzzi | 6 050–6 100 m | 6 050 m | aproximado | Gatta, Arnette, Madison 2019 (6 065 m) |
| Chimenea House | ≈ 6 600 m | 6 600 m | reconstruido | Gatta |
| C2 Abruzzi | ≈ 6 700 m | 6 700 m | aproximado | Madison 2023, Arnette |
| Pirámide Negra | 6 750–7 200 m | 6 950 m (centro) | reconstruido | Gatta |
| C3 Abruzzi | 7 200–7 400 m | 7 250 m | aproximado | Madison 2023, Arnette, Gatta |
| C2 Česen | 6 311–6 327 m | 6 325 m | aproximado | Madison 2019 |
| C3 Česen | ≈ 7 013 m | 7 013 m | aproximado | Madison 2019 |
| Hombro | 7 700–8 000 m | 7 891 m | aproximado | Gatta, AAJ 1995; en el DEM la pendiente baja a ≈ 27° entre 7 760 y 7 960 m |
| C4 (común) | 7 600–8 000 m | 7 800 m | aproximado | Madison 2023 (7 681 m), Gatta (~7 950 m), AAJ 1995 (7 800 m) |
| Zona de la muerte | 8 000 m | 8 000 m | documentado | umbral convencional |
| Bottleneck | ≈ 8 200 m (8 150–8 300) | 8 200 m | reconstruido | AAJ 1987, AAJ 2005, Wikipedia |
| Travesía bajo el serac | ≈ 8 300 m | 8 289 m | reconstruido | Wikipedia, AAJ 2005 |
| Serac superior | 8 350–8 450 m | 8 413 m | reconstruido | AAJ 2005, Wikipedia |
| Cumbre | 8 611 m | 8 611 m | documentado | ver §3 |

**Česen**: solo hay altitudes verificables de su C2 y C3 (Madison 2019, que subió
del campo base al C2 directamente). No se muestra un C1 propio ni se reutilizan los
campos del Abruzzi; el C4 del Hombro es común a ambas vías.

**Arista Norte**: omitida por falta de datos verificables de su trazado y campos.

**Serac**: malla 3D local independiente (no se tocó el mapa de alturas), frente de
35–70 m con ligero desplome a lo largo de la curva de 8 360 m por encima de la
travesía. Es esquemática: su forma real cambia cada temporada.

### Nubes

Capa **ilustrativa**, no una observación ni una previsión. Representa dos fenómenos
habituales en el K2: el mar de nubes convectivas de tarde, entre 6 300 y 7 300 m,
que envuelve las laderas medias (los copos se funden con el relieve donde lo tocan), y
la nube de bandera que el viento dominante del oeste forma a sotavento (al este) de la
cumbre, entre unos 8 150 y 8 450 m. La colocación es determinista (`src/scene/cloudLayout.ts`)
y los tests comprueban franjas de altitud, posición a sotavento y que el centro de cada
copo queda sobre el terreno.

## 5. Referencias consultadas

Algunas páginas (AAC, Madison Mountaineering, Philippe Gatta, Alan Arnette,
Wikipedia) estaban bloqueadas para descarga directa desde el entorno de trabajo
por la política de red; su contenido se consultó a través de extractos de un
buscador y se usaron solo los valores citados arriba.

- American Alpine Journal (1987): *Asia, Pakistan, Broad Peak and K2* — Bottleneck a 8 200 m. <https://publications.americanalpineclub.org/articles/12198727400>
- American Alpine Journal (1995): *K2, Attempt from the West and Ascent from the South* — la vía Česen se une al Abruzzi bajo el Hombro; campo a 7 800 m. <https://publications.americanalpineclub.org/articles/12199528100/Asia-Pakistan-K2-Attempt-from-the-West-and-Ascent-from-the-South>
- American Alpine Journal (2005): *K2, Various Ascents and Records in the Anniversary Year* — rampa del Bottleneck entre la barrera de seracs y las rocas de la cara sur. <https://publications.americanalpineclub.org/articles/12200535103/>
- Wikipedia: *K2* y *Bottleneck (K2)*. <https://en.wikipedia.org/wiki/K2>, <https://en.wikipedia.org/wiki/Bottleneck_(K2)>
- Madison Mountaineering: despachos 2019 (vía Česen) y 2023 (*Summit push called off*); ficha de la expedición. <https://madisonmountaineering.com/tag/cesen/>, <https://madisonmountaineering.com/summit-push-called-off/>, <https://madisonmountaineering.com/expedition/k2/>
- Alan Arnette (2020): *K2 Winter on the Abruzzi*. <https://www.alanarnette.com/2020/12/23/k2-winter-on-the-abruzzi/>
- Philippe Gatta: *K2 Expedition (8 611 m)*. <https://www.philippegatta.fr/k2-8611-m-pakistan>
- GPS World (resumen de la medición de 2014). <https://www.gpsworld.com/steep-questions-how-tall-is-k2/>
- Copernicus Data Space: descripción del COP-DEM. <https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM>
- SummitClimb (citada en el encargo): no se pudo consultar ni obtener cifras fiables, no se usó.

## 6. Límites de precisión

- **Vertical**: el DEM cumple ~4 m de exactitud absoluta en zonas TanDEM-X, pero
  en la pirámide cimera manda el relleno (AW3D30, ASTER, SRTM) y en pendientes de
  40–60° los errores pueden ser de decenas de metros.
- **Horizontal**: los sectores reconstruidos (Bottleneck, travesía, serac) pueden
  estar desplazados del orden de 50–200 m; la cumbre del modelo dista 214 m de la
  coordenada publicada.
- **Campamentos**: se sitúan donde el modelo alcanza la altitud documentada sobre
  una ruta reconstruida; el error en su posición hereda los dos anteriores.
- **Escala**: 1:1 en horizontal y vertical, sin exageración. Se ignora la
  curvatura terrestre (≤ 4 m en el núcleo; ~100 m en el borde del horizonte a 36 km).
- **Uso**: atlas divulgativo; no sirve para navegar ni planificar una ascensión.
