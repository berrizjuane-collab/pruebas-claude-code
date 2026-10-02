# Entrega: `campos-vectoriales.html`

Archivo **único y autocontenido** (RNF-14): ábrelo con doble clic en Chrome, Edge o Firefox.
No necesita servidor ni conexión; todo (código, estilos, fuentes y worker de cálculo) va dentro.

| Versión | Hito | Contenido |
| --- | --- | --- |
| provisional | H1 | Catálogo de seis campos en escena 3D: flechas con magnitud por longitud y luminancia, ejes, leyenda, vistas y órbita |
| provisional | H3 | Además: el cálculo va en un *worker* incrustado, con resultados idénticos bit a bit a los de las pruebas. Los errores aparecen en la barra superior conservando el último campo válido. Las líneas de corriente se calculan en segundo plano y se pueden cancelar (aún no se dibujan: llegan en H5) |
| provisional | H4 | Además: editor de ecuaciones con vista previa y validación en vivo, parámetros (deslizador, número, rango y paso, añadir y eliminar), dominio y muestreo, menú «Restablecer» con «Deshacer» (8 s o Ctrl+Z), avisos, notificaciones y estados vacíos. Galería de controles en `campos-vectoriales.html?muestras` |

Para regenerarlo: `npm ci && npm run build` → `dist/campos-vectoriales.html`.
