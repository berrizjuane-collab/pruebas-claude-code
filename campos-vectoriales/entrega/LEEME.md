# Entrega: `campos-vectoriales.html`

Archivo **único y autocontenido** (RNF-14): ábrelo con doble clic en Chrome, Edge o Firefox.
No necesita servidor ni conexión; todo (código, estilos, fuentes y worker de cálculo) va dentro.

| Versión | Hito | Contenido |
| --- | --- | --- |
| provisional | H1 | Catálogo de seis campos en escena 3D: flechas con magnitud por longitud y luminancia, ejes, leyenda, vistas y órbita |
| provisional | H3 | Además: el cálculo va en un *worker* incrustado, con resultados idénticos bit a bit a los de las pruebas. Los errores aparecen en la barra superior conservando el último campo válido. Las líneas de corriente se calculan en segundo plano y se pueden cancelar (aún no se dibujan: llegan en H5) |
| provisional | H4 | Además: editor de ecuaciones con vista previa y validación en vivo, parámetros (deslizador, número, rango y paso, añadir y eliminar), dominio y muestreo, menú «Restablecer» con «Deshacer» (8 s o Ctrl+Z), avisos, notificaciones y estados vacíos. Galería de controles en `campos-vectoriales.html?muestras` |
| provisional | H5 | Además: líneas de corriente con cheurones de sentido, semillas y marcas finales; modos de magnitud (proporcional o normalizada, escala automática o fija, luminancia lineal o logarítmica); cortes XY/XZ/YZ con flechas «solo corte» y mapa escalar (‖F‖, div F, (rot F)·n, F·n) con puntos, rayado, curva de nivel cero y signos; «Glifos: rot F» con anillo de giro; partículas con estela y pausa (Espacio); rueda de paletas en un punto; secciones «Líneas de corriente», «Divergencia y rotacional» y «Avanzado»; leyenda completa. Atajos: F, L, P, G, C, Espacio, R y 1–4 |

Para regenerarlo: `npm ci && npm run build` → `dist/campos-vectoriales.html`.
