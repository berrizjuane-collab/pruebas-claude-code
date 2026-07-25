# INVAR — sitio one-page

Pieza de diseño para una empresa **ficticia** de ciberseguridad. Abre
`index.html` en un navegador: no necesita servidor, ni build, ni red.

```
invar/
├── index.html                 # todo el marcado, una sola página
├── assets/
│   ├── css/site.css           # sistema completo (custom properties + capas)
│   ├── js/
│   │   ├── field.js           # malla de nodos del héroe (canvas 2D)
│   │   ├── sequence.js        # simulación narrativa de la intrusión
│   │   └── app.js             # arranque: Lenis, ScrollTrigger, cromo
│   ├── vendor/                # gsap, ScrollTrigger, lenis (locales, sin CDN)
│   └── img/                   # 10 visuales en WebP, dos tamaños cada uno
└── tools/                     # generación de imagen y control de calidad
```

---

## La marca

**INVAR** es la aleación hierro-níquel al 36 % cuyo coeficiente de dilatación
térmica es prácticamente nulo: no cambia de forma cuando sube la temperatura.
De ahí sale todo lo demás —el claim («estabilidad dimensional bajo
temperatura»), la paleta y el criterio visual.

| | |
|---|---|
| **Base** | grafito frío `#06080A` → `#131A20` |
| **Texto** | `#E4E8EB` / `#8A9EAD` / `#6B7F90` |
| **Firma** | ámbar incandescente `#FF5B2E` |
| **Tipografía** | grotesca del sistema para titulares, monoespaciada para toda etiqueta, cifra y dato |

Regla de disciplina que gobierna la página entera y también las imágenes: **una
sola fuente cálida por encuadre**. El ámbar marca lo que arde, lo que se mide o
lo que hay que pulsar. Nunca es ambiente. Si aparece en dos sitios de la misma
pantalla compitiendo entre sí, uno de los dos sobra.

Se evitó a propósito el imaginario habitual del sector: nada de verde fósforo,
candados, escudos ni figuras encapuchadas. La referencia es la instrumentación
industrial —mapas de isotermas, topografías de exposición, salas de control—
porque el cliente que se retrata opera infraestructura crítica, no una película.

---

## Las imágenes

**No se usó ningún generador de imagen**: el entorno no tenía ninguno
disponible. En su lugar hay un motor de render procedural propio: cada visual se
dibuja con canvas 2D dentro de Chromium headless y se exporta a WebP.

```bash
npm i playwright            # o usa el Chromium ya presente en el entorno
node tools/render.mjs       # regenera las 10 escenas (~1 min)
node tools/render.mjs fiber # o solo una
node tools/contact.mjs      # lámina de contacto para revisarlas de un vistazo
```

`tools/gen/core.js` contiene el sistema óptico compartido —ruido de valor y fbm,
profundidad de campo por capas, *bloom* con umbral, halación cálida limitada a
las altas luces, viñeta y grano— y `tools/gen/scenes.js` las nueve escenas. Todo
está parametrizado por `S = ancho / 2400`, así que la misma escena se renderiza a
640 px o a 2560 px sin cambiar de aire.

| Archivo | Escena |
|---|---|
| `substrate` · `og` | campo de isotermas con un núcleo incandescente (héroe) |
| `surface` | relieve de exposición con oclusión por pintor |
| `topology` | grafo 3D con propagación de compromiso y DOF por bandas |
| `flow` | líneas de corriente atravesando una garganta |
| `layers` | estratos translúcidos que fragmentan una señal |
| `fiber` | macro de haz de fibra: bokeh con conservación de energía |
| `ops` · `console` | sala de operaciones y sala de briefing |
| `veil` | textura de transición |

Las dos escenas con personas son deliberadamente lejanas y a contraluz: las
siluetas leen bien a tamaño pequeño y se vuelven un icono si se agrandan. Se
probó un plano medio de un analista y se descartó por eso.

Cada imagen se sirve en dos tamaños con `srcset` + `sizes`, con `width`/`height`
declarados (CLS 0), `loading="lazy"` salvo el héroe —que va con `preload` y
`fetchpriority="high"`— y texto alternativo descriptivo.

---

## El scroll

| Recurso | Dónde | Cómo |
|---|---|---|
| Scroll suave con inercia | toda la página | Lenis (`duration 1.05`), desactivado en táctil y con movimiento reducido |
| Entrada por capas | héroe | línea de tiempo GSAP; el titular se revela palabra a palabra |
| Reveals al entrar | todas las secciones | `fade + translateY` con `power3.out`, nunca lineal |
| Paralaje | 6 planos de profundidad | `yPercent` sobre la imagen dentro de su marco |
| Sección pegada | 02 Secuencia | `position: sticky` en CSS; GSAP solo lee el progreso |
| Scroll horizontal con pinning | 04 Arquitectura | pin + `x` en escritorio; carrusel nativo con anclaje por debajo de 1080 px |
| Transición de color de fondo | entre secciones | cuatro capas fijas que se cruzan por opacidad |
| Cursor con estados | escritorio con puntero fino | dos cuerpos con inercias distintas y etiqueta en los CTA |
| Indicador de progreso | raíl derecho | `scaleY` + índice de sección |
| Contadores | 01 y 05 | animados al entrar en viewport, formato español |

**La secuencia narrativa (02) es el centro del proyecto.** El scroll no desplaza
elementos: **adelanta el reloj de un incidente**. La posición dentro de la
sección se convierte en tiempo, y de ese tiempo se derivan tres frentes sobre un
grafo de cuatro anillos concéntricos (perímetro → identidad → estaciones →
núcleo):

1. **compromiso** — recorrido en anchura desde el nodo de entrada; solo alcanza
   un sector, nunca la red entera;
2. **detección** — barrido y anillos de vigilancia sobre lo comprometido;
3. **contención** — corta las aristas que cruzan la frontera (marca de corte
   visible) y enfría por orden inverso al de caída.

El paciente cero se queda en cuarentena hasta el final y el núcleo no cae nunca:
ese es el argumento de la sección y lo sostiene la simulación, no el texto. El
reloj (`t+00:00` → `t+18:04`) interpola entre los seis momentos reales de la
línea temporal.

Todo lo animado son `transform` y `opacity`. Nada dispara recálculo de layout.

---

## Responsive

Mobile-first real, con cuatro decisiones deliberadas por tramo:

- **375 px** — columna única, tipografía fluida con `clamp()`, áreas táctiles de
  44 px como mínimo, menos nodos en los canvas y cero scroll horizontal
  accidental (verificado: `scrollWidth === clientWidth` en los cinco anchos).
- **768 px** — dos columnas donde el contenido lo pide; en la secuencia el grafo
  ocupa el tercio superior y el relato la mitad inferior, en lugar de superponerse.
- **1024 px** — tres y cuatro columnas en métricas, casos y doctrina; la ficha
  técnica se separa del titular.
- **1080 px y más** — retícula editorial asimétrica de 12 columnas en
  capacidades, secuencia a dos zonas (relato a la izquierda, simulación a la
  derecha) y pinning horizontal en arquitectura.
- **Alto, no solo ancho** — hay un tramo `max-height: 940px` que compacta el
  héroe en portátiles de 13″, y la pista de bajada se ancla al pliegue
  (`top: 100svh`) en vez de al final del bloque.

`prefers-reduced-motion` entrega una versión estática digna: sin scroll suave,
sin paralaje, sin cursor, contadores en su valor final, todos los tramos del
relato al 100 % de opacidad y la simulación congelada en el estado ya contenido.

---

## Calidad

Medido en Chromium headless sobre `file://` (`node tools/perf.mjs`):

| | móvil 390 px | escritorio 1440 px |
|---|---|---|
| Peticiones | 12 | 11 |
| Transferido en la primera vista | ~160 kB | ~270 kB |
| FCP / LCP | 156 ms | 192 ms |
| CLS | 0 | 0 |
| Fotogramas durante scroll continuo | ~60 fps | ~60 fps |

Sin dependencias de UI: solo GSAP + ScrollTrigger + Lenis, servidos en local
(140 kB) para que la página funcione sin red. El total de imagen son 975 kB en
WebP repartidos en 20 archivos, casi todos diferidos.

Una nota de rendimiento que costó encontrar y está comentada en el CSS: la capa
de grano usaba `mix-blend-mode: overlay` a pantalla completa y eso obligaba al
compositor a releer el fondo en cada fotograma —39 fps en escritorio—. Sobre un
fondo casi negro, ruido claro al 5,5 % sin blend da la misma textura por nada.

### Accesibilidad

`node tools/a11y.mjs` ejecuta axe-core a 375 y 1440 px. Está limpio salvo un
punto, que es una decisión consciente: los tramos del relato **inactivos** se
atenúan al 40 % mientras no son el tramo activo. Es un estado transitorio de una
narración por scroll —cada tramo llega a opacidad plena cuando le toca— y con
`prefers-reduced-motion` se muestran todos al 100 %. Todo lo demás cumple AA:

- contraste AA en todo el texto (el gris secundario se subió a `#6B7F90`, 4,8:1);
- HTML semántico, `<dl>` bien formados, un solo `<h1>`, jerarquía de encabezados
  correcta y enlace para saltar al contenido;
- foco visible en todo elemento interactivo y orden de tabulación coherente
  (`node tools/kbd.mjs`);
- el carrusel horizontal es enfocable y tiene nombre accesible;
- los canvas son `aria-hidden`: toda la información que muestran está también
  como texto real en el documento.

---

## Instrumental

```bash
node tools/render.mjs [escena…]   # genera las imágenes
node tools/contact.mjs [salida]   # lámina de contacto de las imágenes
node tools/shots.mjs <dir> <anchos>   # capturas por ancho + control de desbordes
node tools/sec.mjs <selector> <w> <h> <salida> [offset]   # captura una sección
node tools/perf.mjs               # peso, FCP/LCP/CLS y fotogramas
node tools/a11y.mjs [ruta/axe.min.js]  # auditoría axe-core
node tools/kbd.mjs <dir>          # menú móvil y recorrido con tabulador
```

Necesitan Playwright con Chromium. No forman parte del sitio publicado.

---

INVAR no existe. La marca, las cifras, los clientes y los incidentes son
inventados para esta pieza; las tecnologías, marcos y técnicas que se citan
(MITRE ATT&CK, OCSF, Sigma, IEC 62443, TIBER-EU, NIS2, DORA) sí son reales.
