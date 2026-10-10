# Vídeo promocional · NIGHTFALL edición web

Dos cortes de 30 s, listos para publicar:

| Archivo | Formato | Para |
| --- | --- | --- |
| `nightfall-promo-9x16.mp4` | 1080 × 1920, vertical | Reels, TikTok, Shorts, historias |
| `nightfall-promo-16x9.mp4` | 1920 × 1080, horizontal | YouTube, web, pantallas |

Los dos van a 30 fps en H.264 + AAC 320 kb/s, con el audio a −14 LUFS (lo que piden las
plataformas). En el vertical, todo el texto cae dentro de la zona segura de Reels y TikTok
(entre el 14 % y el 79 % de la altura). `portada-9x16.jpg` y `portada-16x9.jpg` son los
fotogramas de portada, por si la plataforma pide una imagen de miniatura.

## Identidad

Todo sale de la revista: las tipografías (Cabinet Grotesk reconstruida desde el PDF, Montserrat
y la Anton estirada del logotipo), la paleta ácido `#CCFF00` / rosa `#FF3399` / violeta
`#6600FF`, y los stickers, logos, fotos y mapa neón extraídos del PDF con su transparencia.
Las fotos se traman en semitono a 45° fotograma a fotograma, como en la web. El metraje es la
web real (`nightfall/index.html`) grabada en escritorio y en móvil.

## Guion (128 BPM: un compás = 1,875 s)

| Compás | Tiempo | Escena | Sonido |
| --- | --- | --- | --- |
| 1–2 | 0–3,75 s | «Caracas nunca duerme del todo. Simplemente cambia de frecuencia.» Onda de radio, dial que busca la emisora y la palabra FRECUENCIA con glitch RGB | Radio buscando emisora, latidos; la emisora entra filtrada y tartamudea |
| 3 | 3,75–5,6 s | ROSA · VERDE · VIOLETA · NEÓN: un color de la marca por golpe, con trama de fotos de la revista | Cuatro golpes de acorde (la–fa–do–mi) |
| 4 | 5,6–7,5 s | «Toman el asfalto»: estrobo de colores y fotos; la línea ácida se recoge en un punto | Redoble que acelera, riser, silencio |
| 5–6 | 7,5–11,25 s | DROP: el logotipo NIGHTFALL se enciende como un neón, la portada en semitono, stickers y la ruta nocturna con los ocho locales | Impacto y groove completo |
| 7–8 | 11,25–15 s | «La revista ahora se mueve»: la web en portátil y móvil (portada y scroll reales) | Groove |
| 9 | 15–16,9 s | «El mapa de la rumba»: el mapa neón de la web encendiéndose | Zumbido de neón y blips de pines |
| 10 | 16,9–18,75 s | «¡Párate ahí!»: los ocho locales, uno por corchea, con su estado | Un blip por logo |
| 11 | 18,75–20,6 s | «Mezcla como DJ Victori»: el mezclador real sonando | Scratch y crossfader |
| 12 | 20,6–22,5 s | «Flash nocturno»: las polaroids caen sobre la mesa | Obturador y flash en cada tiempo |
| 13 | 22,5–24,4 s | «En el radar»: la agenda con su ficha de evento | Tiza |
| 14 | 24,4–26,25 s | «Arma tu mesa»: la carta sumando la cuenta | Toques y caja registradora |
| 15–16 | 26,25–30 s | Cierre: NIGHTFALL, «El eco nocturno de Caracas», nightfallmag.com y @nightfall_mag | Impacto final, cadencia y la cinta que frena |

Las transiciones también son de la marca: destello de flash, barrido de puntos de semitono,
papel arrugado, golpe de color, latigazo con desenfoque y barra violeta.

## Regenerarlo

Desde la raíz del repositorio. Hacen falta Node con Playwright (global o local), ffmpeg y,
para los recursos, Python con PyMuPDF y Pillow.

```bash
# 1. recursos desde el PDF (ya están en promo/recursos; solo si cambia el PDF)
python3 -I nightfall/promo/recursos.py Revista_NIGHTFALL.pdf <carpeta con las .woff2 de la web>
# 2. música original (unos segundos)
node nightfall/promo/musica.mjs /tmp/promo/musica.wav
# 3. metraje real de la web con reloj virtual (~10 min)
node nightfall/promo/capturar.mjs /tmp/promo/tomas
# 4. montaje y codificación (~10 min por formato)
node nightfall/promo/renderizar.mjs --formato=9x16 --tomas=/tmp/promo/tomas \
  --fotogramas=/tmp/promo/fotogramas --musica=/tmp/promo/musica.wav
node nightfall/promo/renderizar.mjs --formato=16x9 --tomas=/tmp/promo/tomas \
  --fotogramas=/tmp/promo/fotogramas --musica=/tmp/promo/musica.wav
```

Con `--solo=0,120,…`, `renderizar.mjs` dibuja solo esos fotogramas, para revisar el montaje;
con `--codificar`, vuelve a montar el MP4 desde los fotogramas ya dibujados.
`capturar.mjs` acepta nombres de toma para regrabar solo esas.

## Cómo funciona

- **`capturar.mjs`** sustituye el reloj de la página antes de que arranque (`performance.now`,
  `Date`, temporizadores, `requestAnimationFrame` y animaciones CSS) y avanza 1/60 s por
  fotograma. Así cada toma es fluida aunque capturar un fotograma tarde medio segundo, y la
  web marca la hora de un viernes a las 11:47 p. m. en Caracas, con todos los locales abiertos.
- **`compositor.html` / `compositor.js`** dibujan cada fotograma en función del tiempo
  (`render(f)`), sin animaciones en tiempo real, en 1080 × 1920 o 1920 × 1080.
- **`renderizar.mjs`** captura los 1800 fotogramas a 60 fps y los convierte a 30 fps
  promediando cada par, lo que da un desenfoque de movimiento de obturador a 180°. Los cortes
  caen en fotogramas pares para que no se mezclen planos. Después codifica a dos pasadas.
- **`musica.mjs`** sintetiza la música muestra a muestra con semilla fija: bombo, palmas,
  charles, clave 3-2, campana, congas en tumbao, bajo con sidechain, montuno de piano,
  acordes de supersierra, efectos de cada escena, reverb y delay, todo en código.
