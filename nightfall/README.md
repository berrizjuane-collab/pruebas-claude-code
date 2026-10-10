# NIGHTFALL — edición web

La revista **NIGHTFALL N.º 01** (*El eco nocturno de Caracas*) convertida en una
página web interactiva. Es un único archivo, `index.html` (~3 MB), con todo
incrustado: tipografías, fotos, stickers y código. No necesita servidor ni
conexión; basta con abrirlo en el navegador.

## Identidad

Textos, fotos, logos, stickers y colores salen del PDF de la revista; lo único
que viene de fuera son los archivos de Montserrat y Anton (Google Fonts).

- **Tipografías**: Cabinet Grotesk Black, reconstruida uniendo los subconjuntos
  incrustados en el PDF (52 caracteres: A–Z, 0–9, acentos, ¡!, &, comillas);
  Montserrat 400–900 para el texto, y Anton estirada en vertical para recrear el
  logotipo de la portada (que en el PDF es una imagen).
- **Paleta**, tomada de los rellenos vectoriales del PDF: verde ácido `#CCFF00`,
  rosa `#FF3399`, violeta `#6600FF`, negro y blanco.
- **Material gráfico**: las fotos, los logos de los locales, los stickers de
  papel recortado y el mapa neón se extrajeron del PDF con sus máscaras de
  transparencia. Los trazos de tiza se generan como SVG con un filtro de grano.
- **Retícula** de 5 columnas, la del colofón. En los créditos hay un botón
  (o la tecla `G`) para verla superpuesta.

## Secciones e interacción

| Sección | Qué hace |
|---|---|
| Portada | Logotipo neón que parpadea al encenderse, foto en semitono que se revela punto a punto, parallax con el ratón y la *ruta nocturna* con los logos de los locales |
| Editorial · Contenido | Línea de tiza que se dibuja con el scroll; índice que también sirve de menú (botón *Contenido*) |
| Beat y Asfalto · Cita | La cita se ilumina palabra a palabra mientras bajas |
| Mapa de discotecas | El mapa del pliego central: las capas neón se encienden, aparecen los 9 pines y las líneas guía, y los locales abiertos *ahora* (hora de Caracas) llevan un anillo. En móvil el mapa se desliza y cada pin abre una ficha |
| Artistas | Lineup desplegable, marquesina que acelera con el scroll y fichas de Los Chamitos Locos, Neutro Shorty y Lebriah |
| Esa historia me la sé yo | Recorrido horizontal por la historia de los locales, con el año como fondo |
| Flash nocturno (×3) | Mesas de polaroids: se arrastran con el ratón y se abren a pantalla completa (con flechas, teclado o deslizando el dedo) |
| ¡Párate ahí! | Radar en vivo con el estado *abierto / cerrado* de cada local según su horario y filtros por zona; luego las 8 fichas, cada una con su botón *Ver en el mapa* |
| Entrevista DJ Victori | Mezclador con música sintetizada en el navegador: el crossfader pasa de percusión latina (tumbao, clave, campana) a electrónica (bombo, hats, bajo). Los platos y el vinilo hacen scratch |
| La pinta de la semana | Looks con inclinación 3D y vista ampliada |
| Agenda octubre 2026 | Calendario con el día de hoy marcado, cuenta atrás hasta el próximo evento y descarga `.ics` para tu calendario |
| Escanea & Escucha | Los códigos de Spotify de la revista y un vinilo que pone o quita la música |
| Carta | Cada precio es un botón: arma la cuenta de la mesa, aplica la promo *frozen 2×REF5* y divide entre los panas. La cuenta se guarda en el navegador |
| Contraportada · Créditos | Créditos, derechos y colofón de la edición |

Se adapta a móvil (diseño propio, no solo encogido) y respeta
`prefers-reduced-motion`. El sonido nunca arranca solo; hay que pulsar
*Pon la rumba* o el botón de reproducir.

## Vídeo promocional

En [`promo/`](promo/) están los dos cortes de 30 s para lanzar la web
(`nightfall-promo-9x16.mp4` para Reels y TikTok, `nightfall-promo-16x9.mp4` para YouTube),
con música original y metraje real de la página, y el código para regenerarlos.

## Notas sobre el contenido

- Los textos son los de la revista; solo se corrigieron erratas evidentes
  (por ejemplo, «La Rebollon» → «La Rebelión»).
- La carta reproduce los precios tal como están impresos, incluido el vodka
  Smirnoff (servicio REF3.0, trago REF60), que en el PDF parece tener las
  columnas invertidas.
- El estado *abierto ahora* se calcula con los horarios publicados en la
  guía de locales y la hora de Caracas (UTC−4).
