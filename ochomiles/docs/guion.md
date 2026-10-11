# Guion final y desglose del montaje

**14 cumbres. Un horizonte extraordinario.** Película promocional de 180 s para
«[NOMBRE DE LA EMPRESA]».

| Ficha | |
|---|---|
| Duración | 180,000 s · 4.320 fotogramas |
| Imagen | 3840 × 2160 (16:9), 24 fps, BT.709 |
| Música | original, 80 BPM en 4/4, 60 compases (un compás = 3 s = 72 fotogramas) |
| Locución | ninguna: la película se sostiene con frases editoriales en pantalla (sin locución no hay SRT) |
| Orden de las cumbres | ascendente de altitud, de Shishapangma (8.027 m) a Everest (8.848,86 m) |

Este guion describe el corte final tal como lo genera `src/edit/edl.py`: cada tiempo de
abajo sale de ese archivo, no de una estimación. **TC** = minutos:segundos+fotograma;
**f** = número de fotograma (desde 0); **c.** = compás de la música (desde 1).

---

## 1. Apertura sensorial y concepto · 00:00–00:12 · f 0–287 · c. 1–4

| TC | f | Imagen | Texto en pantalla | Sonido |
|---|---|---|---|---|
| 00:00+00 | 0–96 | **Macro.** Noche cerrada. Se enciende una frontal y su haz, rasante, descubre una costra de nieve dura con la huella de una bota con crampón de 12 puntas. El vaho de la respiración y la nieve en suspensión cruzan la luz; el foco se desplaza y la frontal se aleja. | — | Viento contenido, chasquido de la frontal (f 5), paso de crampón, inspiración y espiración, siseo de nieve. Dron grave y aire. |
| 00:04+00 | 96–312 | **Subida al Collado Sur del Everest** (7.861 m en el modelo de elevación) desde el Cwm Occidental. En hora azul, la cámara sube junto a la ladera, corona la arista entre las paredes del Everest y el Lhotse, y se abre el horizonte oriental. El sol asoma por el este (azimut 98°). | f 108–176: *«Hay lugares que cambian nuestra forma de mirar.»* | Cristal agudo al coronar; subida y platillo invertido hacia el golpe. |
| 00:07+12 | 180 | El sol toca el horizonte. | **«14 cumbres.»** (f 180–286) | **Golpe grave** sincronizado con el sol (c. 3, tiempo 3). |
| 00:08+22 | 214 | Luz rasante sobre las aristas cercanas. | ***«Un horizonte extraordinario.»*** (f 214–286) | Entra la armonía (re menor). |

## 2. Mapa regional · 00:11+12–00:24+22 · f 276–598 · c. 5–8

Fundido desde el amanecer al mapa de Asia (proyección cónica conforme de Lambert,
relieve de Terrain Tiles, cartografía Natural Earth).

| TC | f | Imagen | Texto | Sonido |
|---|---|---|---|---|
| 00:11+12 | 276–383 | Asia oscura con relieve sombreado; topónimos de países, mesetas y cuencas. | Topónimos | Aparece el pulso. |
| 00:16+00 | 384–403 | Un recuadro marca el arco del Himalaya y el Karakórum. | «HIMALAYA Y KARAKÓRUM» | |
| 00:15+18 | 378–417 | **Los 14 marcadores** se encienden uno a uno, del más bajo al más alto, cada 3 fotogramas. Cada uno se coloca proyectando sus coordenadas WGS84 verificadas. | Nombre y altitud de cada cumbre | **Arpegio de 14 notas** (c. 6, tiempo 2), una por cumbre. |
| 00:16+20 | 404–452 | Zoom al arco; los rótulos curvos HIMALAYA y KARAKÓRUM recorren el eje de cada cordillera. | | |
| 00:19+18 | 474– | Recuadros ampliados del **grupo del Baltoro** (K2, Broad Peak, Gasherbrum I y II) y del **Mahalangur** (Cho Oyu, Everest, Lhotse, Makalu), con escala de 10 km. Leyenda: «LOS 14 OCHOMILES · Todos por encima de los 8.000 metros», marcador y límites. | Leyenda | |
| | 417–556 | **Los 14 puntos están visibles a la vez durante 5,8 s.** | | |
| 00:23+04 | 556–598 | La cámara del mapa baja hacia Shishapangma; el relieve gana detalle y las curvas de nivel se funden con el plano 3D. | | |

## 3. Las 14 cumbres · 00:24–02:30 · f 576–3599 · c. 9–50

Cada capítulo dura 216 fotogramas (9 s, tres compases) y empieza en una barra de compás.
El bloque de datos aparece abajo a la izquierda: contador (01 / 14), **nombre**,
**altitud** (cifras tabulares) sobre una regla 8.000–8.850 m con las 14 marcas,
**ubicación · cordillera** y el **dato verificado**. Arriba a la derecha, un mapa en
miniatura del arco sitúa la cumbre: el punto ámbar viaja desde la cumbre anterior.

| # | TC | Cumbre · cámara y luz | Datos en pantalla (TC) | Entrada / salida |
|---|---|---|---|---|
| 01 | 00:24+00 | **Shishapangma**, 8.027 m · TÍBET, CHINA · HIMALAYA. Contemplativo, desde la meseta tibetana al norte; sol del este-sudeste muy bajo (6°). | 00:25+22–00:31+00 · *El único ochomil enteramente en China y el último en ascenderse (1964).* | curvas de nivel / salto por el mapa |
| 02 | 00:33+00 | **Gasherbrum II**, 8.034 m · FRONTERA PAKISTÁN–CHINA · KARAKÓRUM. Picado sobre el glaciar; la cámara alza la vista y revela la pirámide. | 00:34+22–00:40+12 · *Una expedición austriaca lo ascendió por primera vez en julio de 1956.* | salto por el mapa / cortinilla de nube |
| 03 | 00:42+00 | **Broad Peak**, 8.051 m · FRONTERA PAKISTÁN–CHINA · KARAKÓRUM. Travelling lateral a lo largo de la cresta cimera. | 00:42+16–00:49+18 · *Debe su nombre a una cumbre de más de kilómetro y medio.* | cortinilla de nube / corte en movimiento |
| 04 | 00:51+00 | **Gasherbrum I**, 8.080 m · FRONTERA PAKISTÁN–CHINA · KARAKÓRUM. Revelación progresiva tras las cumbres del Baltoro. | 00:51+16–00:58+00 · *También llamado Hidden Peak: se oculta tras otras cumbres desde el Baltoro.* | corte en movimiento / salto por el mapa |
| 05 | 01:00+00 | **Annapurna I**, 8.091 m · NEPAL · HIMALAYA. Gran pared sur con luz rasante de primera hora (sol a 84°, 9°). | 01:01+22–01:07+14 · *El primer ochomil ascendido: Herzog y Lachenal, 3 de junio de 1950.* | salto por el mapa / barrido |
| 06 | 01:09+00 | **Nanga Parbat**, 8.125 m · PAKISTÁN · HIMALAYA. Cara Rupal: panorámica vertical de la base a la cima. | 01:09+16–01:16+12 · *Su cara Rupal se eleva unos 4.600 metros sobre su base.* | barrido / paso por nube |
| 07 | 01:18+00 | **Manaslu**, 8.163 m · NEPAL · HIMALAYA. Contraluz sobre un mar de nubes. | 01:18+16–01:25+18 · *Su nombre suele traducirse como «montaña del espíritu».* | paso por nube / fundido |
| 08 | 01:27+00 | **Dhaulagiri I**, 8.167 m · NEPAL · HIMALAYA. Presencia monumental en órbita lenta; luz lateral del sudoeste. | 01:27+16–01:34+14 · *En 1808 pasó a considerarse la montaña más alta del mundo.* | fundido / ventisca |
| 09 | 01:36+00 | **Cho Oyu**, 8.188 m · FRONTERA NEPAL–CHINA · HIMALAYA. Encuadre amplio desde el sur: el respiro del ritmo. | 01:36+16–01:43+18 · *Vecino del Nangpa La, histórico paso comercial entre Nepal y el Tíbet.* | ventisca / corte por cumbres alineadas |
| 10 | 01:45+00 | **Makalu**, 8.485 m · FRONTERA NEPAL–CHINA · HIMALAYA. Pirámide simétrica: una cara en luz, otra en sombra. | 01:45+16–01:51+14 · *Pirámide aislada de cuatro caras, a 19 km al sureste del Everest.* | corte por cumbres / panorámica que revela |
| 11 | 01:54+00 | **Lhotse**, 8.516 m · FRONTERA NEPAL–CHINA · HIMALAYA. Desde el este: Lhotse delante, Everest detrás y el Collado Sur entre ambos. | 01:54+16–02:01+04 · *«Pico sur» en tibetano: el Collado Sur lo une al Everest.* | panorámica / fundido luminoso |
| 12 | 02:03+00 | **Kangchenjunga**, 8.586 m · FRONTERA NEPAL–INDIA · HIMALAYA. Gran macizo con luz dorada y nieblas en los valles. | 02:03+16–02:10+08 · *En 1955 sus primeros escaladores se detuvieron bajo la cima, por respeto.* | fundido luminoso / negro |
| 13 | 02:12+00 | **K2**, 8.611 m · FRONTERA PAKISTÁN–CHINA · KARAKÓRUM. Tensión: sale del negro tras un repliegue de la música; acercamiento preciso con luz de ocaso. | 02:13+06–02:18+16 · *Su nombre procede de la notación topográfica de 1856: Karakórum 2.* | negro / gran salto por el mapa |
| 14 | 02:21+00 | **Everest**, 8.848,86 m (medición Nepal-China, 2020) · FRONTERA NEPAL–CHINA · HIMALAYA. Gran salto sobre el mapa del Karakórum al Khumbu; la cámara cae sobre el Everest en alpenglow, sube y revela. | 02:23+02–02:28+08 · *Sagarmatha y Chomolungma: el punto más alto de la Tierra.* | gran salto / subida al mapa |

**Ritmo de la música.** Golpe de membrana en el primer tiempo de cada capítulo salvo en
Cho Oyu (el respiro) y en el K2 (tiene su propio golpe). Del capítulo 1 al 6 la música
descubre (motivo principal: quinta ascendente y descenso por grados). Del 7 al 12 crecen
la densidad y la energía. En el último tiempo del compás 44 la música se retira: sin
colchón armónico y con el viento cortado, el nivel baja unos 4 dB. El K2 entra con un golpe
en el c. 45, sobre un fondo de tensión que va de re menor a A7b9. En el Everest la música
resuelve en **re mayor** (c. 48), con subida, platillo invertido y golpe.

## 4. Síntesis y dimensión humana · 02:29+18–02:48 · f 3570–4031 · c. 50–56

| TC | f | Imagen | Texto en pantalla |
|---|---|---|---|
| 02:29+18 | 3570–3600 | Desde el Everest la cámara sube hasta el mapa. | |
| 02:29+18 | 3594–3822 | **Mapa final del arco.** Los 14 puntos se encienden en ámbar (desde f 3618, cada 3 fotogramas) y una línea discontinua los une por orden de altitud (f 3622–3690). Recuadros del Baltoro y del Mahalangur con sus puntos encendidos. | Leyenda: **«Recorrido editorial — orden ascendente de altitud, no una ruta»** · f 3690–3802: *«Cada una exige preparación, paciencia y respeto.»* |
| 02:37+02 | 3770–3830 | El mapa se acerca al Khumbu y baja al terreno. | |
| 02:38+14 | 3806–4319 | **Campo base sur del Everest al atardecer** (5.290 m en el modelo). Último sol en las paredes, alpenglow y estrellas. Desde f 3888 se encienden 64 luces de tienda, ilustrativas. | f 3852–4000: *«La ambición nos lleva arriba.»* · f 3888–4000: *«El criterio nos trae de vuelta.»* |

## 5. Firma y llamada a la acción · 02:48–03:00 · f 4032–4319 · c. 57–60

Sobre el campo base ya de noche, el alpenglow se apaga en el Everest.

| TC | f | Elemento |
|---|---|---|
| 02:48+00 | 4032–4072 | Marca provisional: se dibuja una arista y tras ella sale un sol ámbar. Golpe grave (c. 57). |
| 02:49+06 | 4062– | **NOMBRE DE LA EMPRESA** (campo pendiente en `config/brand.json`). |
| 02:50+14 | 4094– | *«Tu próxima expedición empieza mucho antes de la cumbre.»* |
| 02:52+16 | 4144– | **PLANIFICA TU PRÓXIMA EXPEDICIÓN**, subrayado en ámbar (f 4150–4180). Sin web ni teléfono, porque no se han facilitado. |
| 02:54+06 | 4182– | Créditos de datos obligatorios por licencia (Copernicus DEM y Sentinel-2, Natural Earth, Terrain Tiles, convención de altitudes). |
| 02:59+04 | 4300–4319 | Fundido a negro; la música termina en re mayor. |

---

## Texto íntegro en pantalla, por orden

1. *Hay lugares que cambian nuestra forma de mirar.*
2. **14 cumbres.** *Un horizonte extraordinario.*
3. Mapa: topónimos, HIMALAYA Y KARAKÓRUM, nombres y altitudes de las 14 cumbres, «LOS 14
   OCHOMILES · Todos por encima de los 8.000 metros», leyenda de marcador y límites.
4. Catorce bloques de datos (nombre, altitud, ubicación · cordillera, dato verificado),
   como en la tabla del apartado 3.
5. «Recorrido editorial · orden ascendente de altitud, no una ruta».
6. *Cada una exige preparación, paciencia y respeto.*
7. *La ambición nos lleva arriba.* / *El criterio nos trae de vuelta.*
8. NOMBRE DE LA EMPRESA · *Tu próxima expedición empieza mucho antes de la cumbre.* ·
   PLANIFICA TU PRÓXIMA EXPEDICIÓN · créditos de datos.

Ninguna cifra en pantalla está fuera de `config/peaks.json`, y las fuentes de cada dato
están en `docs/fuentes_y_licencias.md`.

## Por qué no hay locución

El encargo dejaba la locución como opcional. Se descartó para que la música y el repliegue
antes del K2 llevaran el arco y para que la pieza funcione igual sin sonido (redes, pantallas en
tiendas o ferias). Las frases editoriales en pantalla hacen de voz. Como no hay locución,
no se entrega archivo SRT.
