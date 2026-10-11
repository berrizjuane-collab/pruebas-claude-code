# Revisión en tres pasadas

Cada pasada se ha hecho sobre archivos exportados, no sobre el proyecto: la primera sobre
el previo completo de 180 s, y la segunda y la tercera sobre las entregas finales. Lo que
no se ha podido comprobar se dice expresamente.

---

## Pasada 1 · Narrativa y ritmo (previo completo)

**Material revisado:** `render/preview_640.mp4` (640 × 360, 4.320 fotogramas, 180,000 s,
render completo del montaje). Se revisaron hojas de contacto a 1 fotograma por segundo,
todas las transiciones fotograma a fotograma y fotogramas de control en 4K.

**Estructura comprobada**

| Bloque | Encargo | Corte | Estado |
|---|---|---|---|
| Apertura sensorial y concepto | 00:00–00:12 | 00:00–00:12 (macro 0–4 s; subida y amanecer 4–12 s; título a 7,5 s) | ✔ |
| Mapa regional con los 14 puntos | 00:12–00:24, 14 puntos a la vez ≥ 5 s | 00:11+12–00:24+22; los 14 a la vez 5,8 s (f 417–556) y otra vez en la síntesis | ✔ |
| 14 capítulos | 00:24–02:30, 14 × 216 fotogramas | 00:24–02:30, cada capítulo de 216 fotogramas empieza en barra de compás | ✔ |
| Síntesis, mapa completo, dimensión humana | 02:30–02:48 | 02:29+18–02:48 (mapa encendido, recorrido editorial, campo base) | ✔ |
| Firma y llamada a la acción | 02:48–03:00 | 02:48–03:00 (fundido final en f 4300–4319) | ✔ |

**Ritmo.** Los capítulos tienen la misma duración, pero no se sienten iguales porque cambia
la forma de entrar y salir de cada uno. Hay 15 transiciones de 14 tipos (curvas de nivel,
salto por el mapa ×2, cortinilla de nube, corte en movimiento, barrido, paso por nube,
fundido, ventisca, corte por cumbres alineadas, panorámica, fundido luminoso, negro, gran
salto y subida al mapa). La música marca cada entrada con un golpe de membrana, salvo en
Cho Oyu, que es un respiro deliberado. Antes del K2 la música se retira un instante y el
Everest resuelve en re mayor.

**Tiempo de lectura.** Cada bloque de datos queda en pantalla entre 5,1 y 7,1 s. La línea
del dato (de 8 a 12 palabras) entraba 26 fotogramas después del nombre, y en Shishapangma
eso dejaba 4,0 s para 12 palabras (3 palabras por segundo, en el límite de lo cómodo).
Ahora entra a los 20 fotogramas: queda entre 4,25 y 6,25 s en pantalla, con un máximo de
2,8 palabras por segundo.

**Problemas encontrados y corregidos**

| # | Problema | Corrección |
|---|---|---|
| 1 | El localizador de la esquina, un recorte del relieve con borde difuso, se leía como una nube más que como un mapa. | Rediseñado como mapa en miniatura enmarcado: relieve teñido por altitud (la meseta en pizarra y la cordillera en blanco), borde fino, sombra suave y rótulos KARAKÓRUM e HIMALAYA. |
| 2 | En el barrido entre Annapurna y Nanga Parbat, los 7 subfotogramas del desenfoque de movimiento dejaban copias en peine. | 10 subfotogramas y un desenfoque lineal cuya dirección y longitud se miden por correlación de fase entre el primero y el último. El peine desaparece (comprobado a 720p). |
| 3 | Con luz frontal (sol a 108°, 18°), la pared sur del Annapurna I se aplanaba en una masa blanca. | Luz rasante de primera hora (84°, 9°) y exposición algo más baja: aristas y canales vuelven a modelar la pared. |
| 4 | El primer segundo de la subida quedaba demasiado claro para la hora azul y se veía una mancha de roca ampliada. | Exposición inicial más baja (13 → 18, antes 24 → 21): la nieve queda en sombra y el horizonte se enciende. |
| 5 | En la macro, el escalón del tacón dibujaba una línea recta dentro de la huella y las paredes mostraban estrías regulares. | Escalón suavizado y paredes «desmenuzadas» con ruido fino. |
| 6 | Algunos rótulos del mapa (22–25 px a 4K) quedaban en 11–12 px en la versión 1080p. | Leyendas a 26–28 px y topónimos a 26 px. |

**Comprobado sin cambios:** sincronía del título con el sol y el golpe (f 180), arpegio de
14 notas con los 14 marcadores (cada 3 fotogramas desde f 378), fundidos a y desde negro,
legibilidad del texto sobre nieve (velo inferior y halo) y duración de los blancos en las
transiciones de nube y ventisca (0,6–0,7 s).

---

## Pasada 2 · Imagen y composición (entregas finales)

**Durante el render 4K** se revisó cada tramo en cuanto se terminaba, sobre los segmentos
intermedios de 10 bits ya codificados.

| # | Problema | Corrección |
|---|---|---|
| 7 | Las 64 luces del campo base sur del Everest se encendían en f 3888–3944, justo cuando la cámara subía hacia las cumbres. Proyectadas con la cámara del plano, en f 3944 solo quedaban 7 en cuadro y desde f 3970 ninguna, así que la dimensión humana de la síntesis no se veía. | Las luces se encienden antes (f 3856–3896) y la mirada sigue baja mientras duran las dos frases (hasta f 3990); después sube hacia el alpenglow donde entra la firma. Con la cámara nueva, las 64 luces están en cuadro de f 3860 a f 3990, a la izquierda de las frases y sin tocarlas. Además, a 4K cada luz era un punto de 1–3 px que se perdía al reducir a 1080p: el núcleo pasa a unos 3 px, con un halo más amplio, y en la versión 1080p el campamento se lee como un racimo de luces sobre el glaciar. Se rehicieron los cinco segmentos afectados (f 3810–4320). |
| 8 | En el teaser vertical, al entrar la firma, el logotipo se dibujaba sobre la montaña iluminada. | Desplazamiento óptico vertical en ese tramo, solo en la versión 9:16. |
| 9 | En el MP4 4K, revisado a tamaño real, el punto ámbar de la regla del Everest (8.848,86 m cae casi al final) tocaba el «2020» de la nota «Medición Nepal–China, 2020». | La nota se alinea con la altura de las mayúsculas de la cifra; se rehicieron los dos segmentos del Everest (f 3384–3600) y se volvieron a codificar las entregas. |

**Sobre las entregas exportadas.** Material: la película en 4K
(`14_cumbres_2160p24.mp4`), en 1080p de alta calidad (`14_cumbres_1080p24.mp4`) y en
1080p web (`14_cumbres_1080p24_web.mp4`), los teasers y los fijos. Las medidas se repiten
con `python -m src.edit.qa` y `python -m src.edit.render_film verify --ssim`. Los
resultados están en [`docs/medidas/`](medidas/): `verificacion.json`, `qa.json` y el SSIM
de cada fotograma en `ssim/`.

**Color de extremo a extremo.** Cada fijo se renderiza directamente a RGB, sin pasar por
vídeo, y se compara con el mismo fotograma de cada película. El fotograma se decodifica con
la matriz BT.709 de rango limitado escrita a mano, como haría un reproductor. Un error de
matriz (BT.601 en lugar de BT.709) o de rango (completo en lugar de limitado) aparecería
como un desplazamiento de varios niveles en los colores saturados o en negros y blancos.

| Fotograma | 4K | 1080p | 1080p web |
|---|---|---|---|
| f 240 · amanecer y título | +0,04 / −0,16 / −0,04 · 43,3 dB | +0,22 / −0,14 / +0,03 · 42,7 dB | +0,18 / −0,06 / +0,11 · 42,4 dB |
| f 520 · mapa | +0,43 / +0,14 / +0,46 · 38,5 dB | +0,42 / +0,22 / +0,49 · 36,9 dB | +0,41 / +0,22 / +0,37 · 34,8 dB |
| f 3500 · Everest | +0,10 / −0,02 / +0,25 · 41,1 dB | +0,07 / 0,00 / +0,04 · 41,9 dB | +0,15 / 0,00 / +0,27 · 38,4 dB |

*Error medio con signo en R / G / B (niveles de 0 a 255) y PSNR.*

Ningún canal se desvía más de medio nivel, así que la cadena no altera el color ni los
niveles. Lo que queda es la pérdida de la compresión (grano y bordes finos), mayor en el
mapa por sus líneas de 1–2 px.

*Nota de método.* Una primera medida, decodificando con el filtro zscale de ffmpeg a RGB de
16 bits, daba −2 niveles en todas las versiones. Una ida y vuelta sin compresión daba lo
mismo, así que el error era de esa herramienta y no de los archivos. No se recodificó nada.

**Pérdida de compresión.** Cada versión se compara, fotograma a fotograma, con el
intermedio de 10 bits convertido como en su codificación (SSIM de la luminancia):

| Versión | Media | 1 % peor | Mínimo |
|---|---|---|---|
| Máster HEVC 4:2:2 10 bits (CRF 16) | 0,986 | 0,977 | 0,970 (f 3384) |
| 4K (CRF 18) | 0,980 | 0,958 | 0,911 (f 1452) |
| 4K, ambas reducidas a 960 × 540 | 0,996 | 0,992 | 0,988 |
| 1080p (CRF 17) | 0,979 | 0,951 | 0,791 (f 1453) |
| 1080p web (4 Mbps de media) | 0,967 | 0,920 | 0,900 (f 1452) |

- **El máster es la copia más fiel.** Conserva los 10 bits y el color 4:2:2 del
  intermedio, y su peor fotograma (0,970) queda por encima de la media de la versión web.
- **La 4K pierde casi solo grano.** Al reducir ambas a 960 × 540, que promedia el grano,
  el SSIM sube a 0,996.
- **Los mínimos están en los saltos por el mapa.** Son vuelos cenitales rápidos sobre el
  relieve con grano: f 1440–1466 hacia el Annapurna, f 3384–3410 hacia el Everest y
  f 770–830 hacia el Gasherbrum II. Los topes de tasa son deliberados, para que cualquier
  reproductor lea los archivos sin cortes: 60 Mbps en la 4K y 24 Mbps en la 1080p. En el
  salto hacia el Annapurna, el más largo, el tope suaviza la textura fina del relieve
  durante medio segundo, más en la 1080p que en la 4K. Revisado a tamaño real, no aparecen
  bloques. Por debajo de 0,95 solo quedan 12 fotogramas de la 4K, y por debajo de 0,90,
  6 de la 1080p (f 1452–1458).
- **La versión web pierde más, pero de forma pareja.** Ningún fotograma baja de 0,90
  (véase el hallazgo 10). A cambio, cede algo de detalle en los planos tranquilos. Es una
  versión para verla en el repositorio; para proyectar o publicar están la 1080p de alta
  calidad y la 4K.

*Nota de método.* La primera medida (0,932 en la 4K) emparejaba uno de cada tres
fotogramas con el anterior. El intermedio .mkv guarda las marcas de tiempo en
milisegundos (0, 42, 83…) y el filtro SSIM sincroniza por tiempo. Con las marcas
renumeradas por fotograma, el patrón desaparece: la media es la misma en las tres
posiciones de cada grupo de tres fotogramas. Eso confirma además que las entregas no
pierden ni duplican fotogramas.

| # | Problema | Corrección |
|---|---|---|
| 10 | La primera versión web (dos pasadas a 4 Mbps con un tope de 8 Mbps) se quedaba sin bits en los saltos por el mapa. 152 fotogramas (6,3 s) bajaban de 0,90 y el peor caía a 0,744 (f 3385): el relieve de la meseta se emborronaba y en f 1452 aparecía una mancha de color. | Se volvió a codificar con la misma tasa media y un tope de 25 Mbps, más bits para lo complejo (qcomp 0,7), cuantización adaptada a las sombras (aq-mode 3) y el preajuste veryslow. Ahora ningún fotograma baja de 0,90 y la mancha desaparece. A cambio, la mediana pasa de 0,973 a 0,970, y el archivo crece de 97,1 a 97,7 MB. |

**Bandas y bloques.** Los degradados oscuros se revisaron a tamaño real y con el contraste
multiplicado por 6: el cielo de la firma (f 4250), la noche del campo base (f 3960) y el
cielo del amanecer (f 200). En la 4K el grano sigue entero y no hay bandas. La 1080p web
aplana el grano en bloques de ±1 nivel en los fondos más oscuros: con el contraste normal
no se ven; al exagerarlo, sí.

**Rótulos.** Todo el texto queda dentro del área segura de rótulos (90 %):

- margen lateral de 216 px en 4K (5,6 %);
- localizador a 132 px del borde superior (6,1 %);
- la línea más baja, la de los créditos, a 150 px del borde inferior (6,9 %).

Se revisó a tamaño real la 1080p web, la versión con menos tasa de bits. Todo se lee sin
problemas:

- el bloque de datos, incluida la nota «Medición Nepal–China, 2020»;
- el localizador y la leyenda del mapa;
- la llamada a la acción;
- los créditos (31 px en 4K, 15,5 px en 1080p).

**Teasers y fijos.** En los dos teasers, la marca, el lema, la llamada a la acción y los
créditos están completos antes del fundido final (f 700 de 720). Los tres fijos son
renders directos a 3840 × 2160 de los fotogramas 240, 520 y 3500: en PNG, sin compresión
de vídeo, y en JPG de calidad 95.

---

## Pasada 3 · Sonido y exportación (entregas finales)

**Medidas de cada archivo** ([`medidas/verificacion.json`](medidas/verificacion.json)). La sonoridad y el pico
verdadero se miden con el medidor EBU R128 de FFmpeg sobre el sonido decodificado.

| Archivo | Imagen | Fotogramas · duración | Sonido | Sonoridad · LRA · pico verdadero | Tamaño · tasa |
|---|---|---|---|---|---|
| Película 4K | H.264 High@5.1 · 3840 × 2160 · 4:2:0 8 bits | 4.320 · 180,000 s | AAC-LC 320 kbps · 48 kHz · estéreo | −14,2 LUFS · 9,1 LU · −1,2 dBTP | 1.122,4 MB · 49,9 Mbps |
| Película 1080p | H.264 High@4.2 · 1920 × 1080 | 4.320 · 180,000 s | ídem | −14,2 · 9,1 · −1,2 | 307,3 MB · 13,7 Mbps |
| Película 1080p web | H.264 High@4.2 · 1920 × 1080 · dos pasadas | 4.320 · 180,000 s | ídem | −14,2 · 9,1 · −1,2 | 97,7 MB · 4,3 Mbps |
| Teaser 4K | H.264 High@5.1 · 3840 × 2160 | 720 · 30,000 s | ídem | −14,2 · 10,0 · −1,5 | 164,7 MB · 43,9 Mbps |
| Teaser 1080p | H.264 High@4.2 · 1920 × 1080 | 720 · 30,000 s | ídem | −14,2 · 10,0 · −1,5 | 42,6 MB · 11,4 Mbps |
| Teaser vertical | H.264 High@4.2 · 1080 × 1920 | 720 · 30,000 s | ídem | −14,2 · 10,0 · −1,5 | 32,2 MB · 8,6 Mbps |
| Máster de archivo (.mov) | HEVC Main 4:2:2 10 bits (extensiones de rango) · 3840 × 2160 | 4.320 · 180,000 s | PCM 24 bits · 48 kHz, idéntico bit a bit al máster WAV (mismo MD5) | −14,1 · 9,1 · −1,6 | 1.142,2 MB · 50,8 Mbps |
| Máster de sonido (WAV) | — | 180,000 s (8.640.000 muestras) | PCM 24 bits · 48 kHz | −14,1 · 9,1 · −1,6 | 51,8 MB |
| Sonido del teaser (WAV) | — | 30,000 s | PCM 24 bits · 48 kHz | −14,2 · 10,0 · −1,6 | 8,6 MB |

Todas las imágenes van a 24 fps exactos, con etiquetas BT.709 (primarios, transferencia y
matriz) y rango limitado. En cada archivo, imagen y sonido empiezan en 0,000 s y duran lo
mismo.

| # | Problema | Corrección |
|---|---|---|
| 11 | La primera versión web llevaba AAC a 192 kbps. El codificador rebasaba el pico del máster: −0,9 dBTP, fuera del límite de −1 dBTP. | Se le puso la pista AAC de 320 kbps de las demás versiones sin recodificar la imagen (MD5 de la imagen igual antes y después). La versión definitiva (hallazgo 10) lleva esa misma pista, idéntica bit a bit a la de la 4K (mismo MD5): −1,2 dBTP. |

**Sincronía.** El sonido decodificado de cada entrega se correlaciona con su máster en tres
puntos: 5, 80 y 155 s en la película, y 2, 12 y 20 s en los teasers. El desfase es de
0 muestras en los seis MP4. El SSIM fotograma a fotograma muestra además que cada
fotograma coincide con el suyo del intermedio. Por tanto, imagen y sonido quedan donde los
puso el montaje: el golpe del título en f 180 y el arpegio con los 14 marcadores.

**Máster de sonido.**

| Medida | Valor |
|---|---|
| Sonoridad integrada | −14,1 LUFS |
| Rango de sonoridad | 9,1 LU |
| Pico verdadero | −1,6 dBTP |
| Máximo a corto plazo / momentáneo | −9,5 / −7,2 LUFS |
| Componente continua | −91 dBFS |
| Correlación entre canales | 0,72; nunca negativa (mínimo por segundo: 0,10) |
| Pérdida al sumar a mono | 1,1 LU: no hay cancelaciones de fase |
| Principio y final | empieza en una muestra 0 y acaba por debajo de −70 dBFS: ni clic de entrada ni corte |

**Empalmes del teaser.** Los cuatro empalmes entre compases no contiguos llevan fundidos
cruzados de 25 ms. Pasado el fundido, el teaser coincide con la película (correlación de
0,998 a 1,000). Dentro del fundido, el mayor salto entre muestras es del mismo orden que
el de la película en ese punto musical, o menor:

| Empalme del teaser | Película | Teaser |
|---|---|---|
| 0:09 · c. 4 → 6 | 0,016 | 0,017 |
| 0:12 · c. 6 → 45 | 0,042 | 0,045 |
| 0:15 · c. 45 → 48 | 0,36 | 0,24 |
| 0:21 · c. 49 → 57 | 0,23 | 0,11 |

Son los golpes de compás, no clics.

**Exportación.**

- **Reproducción inmediata.** Los seis MP4 llevan el índice (moov) antes de los datos, así
  que empiezan a reproducirse sin descargarse enteros.
- **Compatibilidad.** Perfil High, niveles 5.1 (4K) y 4.2 (1080p y vertical), GOP de 2 s
  y topes de tasa de 60 Mbps (4K), 24 Mbps (1080p) y 25 Mbps (web).
- **Sin errores de decodificación.** Se decodificaron enteros los seis MP4 y el máster, sin
  un solo error.
- **Subida comprobada.** Los cuatro archivos de más de 100 MB están en Git LFS
  (`entregables/alta_calidad/`). El servidor de GitHub confirma cada objeto con el mismo
  SHA-256 y el mismo tamaño que el archivo medido aquí.

**Lo que no se ha podido comprobar**

- **La reproducción en dispositivos concretos** (televisores, móviles, navegadores). La
  compatibilidad se deduce del perfil, el nivel y las etiquetas.
- **Una escucha humana.** La mezcla se ha revisado con medidas y espectros. Conviene
  escucharla con auriculares y en altavoces antes de publicarla.
