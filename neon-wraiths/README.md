# NEON WRAITHS

**Acción y aventura 2D cenital en Nexus-9**, una megaciudad vertical donde una IA
corporativa llamada **AURELION** está "optimizando" a la población: borra el dolor,
y con él los recuerdos, los vínculos y la voluntad propia.

Eres **Vanta**, recuperadora de tecnología ilegal. Una señal imposible aparece en
los barrios bajos —viene de gente que oficialmente ya no existe—. Cruza cuatro
estratos de la ciudad, reúne los cuatro fragmentos del **Protocolo Fantasma** y
llega al núcleo antes de que Nexus-9 se convierta en una sociedad perfectamente
obediente.

Todo el juego corre en el navegador con **Canvas 2D + WebAudio**. Sin motor, sin
assets externos, sin dependencias en tiempo de ejecución: el arte se dibuja por
código y el sonido se sintetiza en vivo.

---

## Cómo jugar

### En línea

La versión publicada se despliega automáticamente en GitHub Pages desde `main`
(ver *Despliegue* más abajo).

### En local

```bash
npm install
npm run dev        # servidor de desarrollo en http://localhost:5173
```

### Compilar

```bash
npm run build      # comprueba tipos, compila a dist/ y genera el HTML autocontenido
npm run preview    # sirve dist/ en http://localhost:4173
```

`npm run build` produce dos cosas:

- `dist/` — el sitio estático que se publica en GitHub Pages.
- `dist/neon-wraiths-standalone.html` — **el juego completo en un único archivo
  HTML** (~234 KB, con todo el JS y el CSS en línea). Se puede abrir con doble
  clic, pegar como Artifact de Claude o enviar por correo. No usa `localStorage`
  ni ningún recurso externo.

---

## Controles

| Acción | Teclado | Mando | Móvil |
| --- | --- | --- | --- |
| Mover | `WASD` / flechas | Stick izq. / cruceta | Stick táctil (mitad izquierda) |
| Atacar | `Espacio` · `J` | A | ⚔ |
| Esquivar | `Mayús` · `K` | B / RT | » |
| Especial del arma | `F` · `L` | X | ✦ |
| Interactuar / hablar | `E` · `Enter` | Y | E |
| Cambiar de arma | `Q` · `Tab` | RB | ⇄ |
| Curar | `H` · `R` | LB / LT | ✚ |
| Pausa | `Esc` · `P` | Start | ⏸ |

En móvil los controles táctiles aparecen solos: stick flotante a la izquierda
(surge donde pongas el dedo) y botones a la derecha. El lienzo mantiene siempre
la proporción 16:9 y se escala al tamaño de la pantalla, así que se juega igual
en un monitor que en un teléfono en horizontal.

---

## Qué hay dentro

### Estructura

Prólogo + cuatro niveles + enfrentamiento final, **41 salas** conectadas por
puertas con rutas secundarias opcionales en cada zona.

| Zona | Ambiente | Enemigos propios | Jefe |
| --- | --- | --- | --- |
| **Prólogo · El Callejón de la Señal** | Barrios bajos, lluvia, neón magenta | ratas mecánicas, drones de vigilancia, civiles aumentados | **EL RECOLECTOR** (miniboss) |
| **1 · Distrito de la Lluvia Ácida** | Industrial, vapor, charcos corrosivos | drones cosecha, chatarreros, arañas de cable, técnicos poseídos | **MADRIGAL-7**, la Fundidora Ciega (3 fases) |
| **2 · Mercado de los Recuerdos** | Puestos, hologramas, memorias en venta | mercenarios de espejo, contrabandistas de pulso, monjes de datos, drones camaleón | **Las Gemelas Sutura** (miniboss) y **MADAME MNEMOSYNE** (3 fases) |
| **3 · Jardines de Cromo** | Invernaderos, flora bioluminiscente | orquídeas centinela, ciervos de fibra óptica, enredaderas de choque, guardianes botánicos | **VERDANT**, el Jardinero sin Rostro (3 fases) |
| **4 · La Catedral de la Red** | Templo tecnológico, servidores suspendidos | paladines de firewall, serafines de datos, inquisidores de código, Ecos de Vanta | **ARQUIVISTA NULL** (3 fases) |
| **Final · Núcleo** | Cámara suspendida sobre toda la ciudad | — | **AURELION**, el Santo de las Máquinas (4 fases) |

19 tipos de enemigo regular, cada uno con su propia máquina de estados: unos
guardan distancia, otros se cubren, otros emboscan, saltan, se teletransportan o
copian tus habilidades.

### Combate

- Movimiento en ocho direcciones, ataque con combo de tres golpes, esquiva con
  invulnerabilidad e enfriamiento, especial por arma, curación e interacción.
- **Buffer de entrada**: si pulsas atacar durante la recuperación, el golpe sale
  igualmente. Ninguna pulsación se pierde entre fotogramas.
- **Esquiva perfecta**: esquivar justo cuando un ataque iba a alcanzarte abre una
  ventana de contragolpe (visible como un anillo blanco).
- **Telegrafiado consistente en todo el juego**: ámbar = viene un ataque,
  rojo = esa zona te va a doler, blanco = enemigo aturdido (ventana libre).
- Retroceso, invulnerabilidad tras el golpe, congelación de fotogramas en los
  impactos fuertes y sacudida de cámara proporcional al golpe.
- Los enemigos menores no llevan barra de vida: se oscurecen y se agrietan según
  pierden salud. Élites y jefes sí la llevan, con nombre y fase.

### Armas (dos equipadas a la vez)

| Arma | Tipo | Especial |
| --- | --- | --- |
| Katana de Plasma «Kairo» | Filo corto, combo de 3 | Contragolpe tras esquiva perfecta (daño triple) |
| Látigo de Arco Voltáico | Cadena eléctrica de alcance medio | Sobrecarga en anillo que salta entre enemigos |
| Pistola de Resonancia | Energía a distancia | Disparo cargado que atraviesa y activa nodos |
| Guantelete de Gravedad Local | Impacto pesado y lento | Pozo gravitatorio: atrae y desvía proyectiles |
| Cuchillas de Fase | Filos gemelos rapidísimos | Desfase: desplazamiento que atraviesa enemigos |
| Lanza Vectorial | Asta larga lineal | Lanzamiento que clava a los enemigos ligeros |

Al encontrar un arma se abre una comparativa con nombre, tipo, daño, alcance,
velocidad y habilidad especial, indicando **qué arma sustituirá**. Nunca se
reemplaza nada sin confirmación, y siempre puedes rechazarla.

### Progresión

Mejoras permanentes repartidas por los niveles y a la venta en el mercado:
vida máxima, cargas de curación, enfriamiento de esquiva, daño y regeneración de
carga. Los créditos caen de los enemigos y se gastan con Kesh, el mercader del
Nivel 3.

### Accesibilidad y comodidad

- Anclajes (checkpoints) antes de cada jefe y en las zonas largas; reaparecer
  restaura vida y curas completas, y nunca pierdes fragmentos, armas ni mejoras.
- **Las arenas de jefe se sellan** mientras el jefe vive y hasta que la recompensa
  se ha entregado: es imposible salirte de la pelea o perderte un fragmento.
- Todos los diálogos se aceleran con `E` y se omiten con `Esc`.
- Opciones de música, efectos, resplandor y sacudida de cámara, desde el título y
  desde la pausa.
- **Calidad adaptativa**: si el dispositivo no sostiene 60 fps, el resplandor a
  pantalla completa se desactiva solo y avisa.
- Soporte de mando estándar (se detecta al pulsar cualquier botón).

---

## Arquitectura

Vite + TypeScript estricto, sin dependencias de ejecución. ~7.500 líneas.

```
src/
  main.ts              arranque: canvas, bucle de paso fijo, controles táctiles
  core/
    util.ts            matemáticas, colisiones (círculo/rect/arco/segmento), RNG
    input.ts           teclado + mando + táctil unificados, con buffer de pulsación
    audio.ts           WebAudio: SFX sintetizados y banda sonora generativa por zona
    render.ts          lienzo lógico 960x540, pase de bloom, primitivas de neón
    camera.ts          seguimiento suave, sacudida, límites de sala
    particles.ts       una única reserva de 900 partículas para todo el juego
  art/
    palette.ts         paleta compartida + tema visual y musical de cada zona
    backdrop.ts        skyline con parallax, lluvia, motas, viñeta, glitch
  world/
    tiles.ts           rejilla de tiles, colisión, capa estática pre-renderizada, props
    room.ts            construcción de la sala, puertas, objetos interactivos
    levels.ts          TODO el mundo como datos: 41 salas, 6 niveles, mejoras
  game/
    api.ts             el contrato `World` entre entidades y juego
    game.ts            máquina de estados, simulación, colisiones, render
    player.ts          Vanta: movimiento, combo, esquiva, dibujo
    weapons.ts         las seis armas (datos + comportamiento)
    enemies.ts         19 enemigos: estadísticas, IA y dibujo
    bosses.ts          7 jefes como máquinas de fases con ataques con nombre
    story.ts           todos los diálogos y el lore
    hud.ts / menus.ts  HUD, diálogo, pausa, muerte, tienda, final y créditos
  ui/touch.ts          stick virtual y botones de acción
scripts/
  build-standalone.mjs  incrusta el build en un único HTML
```

Tres decisiones que sostienen el resto:

1. **Las entidades sólo hablan con `World`** (`game/api.ts`), nunca con `Game`.
   Eso evita importaciones circulares y deja los enemigos y jefes como módulos
   independientes y legibles.
2. **El mundo es dato, no código.** Una sala se declara con tamaño + rectángulos
   ("stamps") y una lista de puertas; los huecos de las puertas se perforan
   automáticamente y cada puerta sólo nombra la sala destino: el motor busca la
   puerta de vuelta para colocarte. Una sala no puede quedar incomunicada por un
   error de coordenadas.
3. **Todo lo caro se cachea.** La capa estática de cada sala, los degradados
   radiales de los resplandores (un sprite por color) y la viñeta con scanlines se
   generan una vez, no por fotograma. La simulación cuesta ~0,1 ms por fotograma.

### Pruebas realizadas

Recorrido automatizado con Playwright sobre el build de producción, verificando:
las 41 salas alcanzables y sin errores, los 7 jefes con todas sus fases, la
entrega de los 4 fragmentos y de las armas, el final y los créditos, muerte y
reaparición en anclaje, pausa, comparativa de armas, tienda, controles táctiles
en viewport móvil y ausencia total de errores de consola.

---

## Despliegue

El juego vive en la carpeta `neon-wraiths/` del repositorio. El workflow
`.github/workflows/deploy.yml` (en la raíz) compila esta carpeta y publica su
`dist/` en GitHub Pages en cada push a `main` que toque `neon-wraiths/` o
`fable-5-1/`; la página de Fable 5.1 se sirve junto al juego.

El workflow intenta activar Pages por sí solo (`configure-pages` con
`enablement: true`), pero el token automático de Actions no tiene permiso de
administración para hacerlo: hay que activarlo a mano una vez en
*Settings → Pages → Source: GitHub Actions*. Hasta entonces la compilación pasa
y solo falla el paso final de publicación (`deploy-pages` responde 404).
