# VAL-02 · Prueba de humo manual en Firefox y Safari

**Quién**: el usuario, en su equipo. **Duración**: unos 10 minutos por navegador.
**Entorno**: Firefox (Windows, macOS o Linux) y, si tienes un Mac, Safari, con
`entrega/campos-vectoriales.html` abierto con doble clic (sin servidor). Conviene hacerlo
una vez con la red desconectada.

En el contenedor de desarrollo solo hay Chromium (las 100 pruebas e2e pasan en él); este guion
comprueba que nada depende de Chromium. Para cada paso anota «sí / no» y, si algo falla, qué
se vio (una captura ayuda).

| # | Acción | Qué debe pasar |
| --- | --- | --- |
| 1 | Abrir el archivo | En < 2 s: escena con 729 flechas del campo helicoidal, leyenda abajo a la izquierda y «Listo · 729 nodos» en la barra de estado. Sin avisos de «sin WebGL2» |
| 2 | Arrastrar con el ratón sobre la escena; rueda | La vista gira con fluidez; la rueda acerca y aleja |
| 3 | Tarjeta «Rotacional» | Cambian fórmula, flechas y leyenda; la tarjeta queda marcada con ✓; la cámara no se mueve |
| 4 | En R escribir `0.5*z` | A los 300 ms las flechas se inclinan; la tarjeta pasa a «•» (modificado) |
| 5 | En R escribir `z*(` y salir con Tab | Error con la posición subrayada y el aviso «Mostrando el último campo válido» |
| 6 | Pulsar `i`, escribir `1` en x e Intro | Tarjeta «Punto P» con F, ‖F‖, div F y rot F; un aro marca P en la escena |
| 7 | Activar «Corte» y «Escalar: div F» | Plano con rayado / puntos y el contorno discontinuo de div F = 0 |
| 8 | Activar «Partículas» | Partículas en movimiento; Espacio las pausa |
| 9 | Exportar ▸ Imagen PNG… ▸ Exportar | Se descarga un PNG en gris con la leyenda incrustada |
| 10 | Exportar ▸ Configuración (.json); Restablecer ▸ Experimento; Abrir ese .json | Vuelve exactamente el experimento exportado, con su cámara |
| 11 | Recargar la página | Aviso «Se ha recuperado tu último experimento» con «Empezar de cero» |
| 12 | F1 | Cajón de ayuda; Esc lo cierra |
| 13 | Estrechar la ventana hasta ~800 px y luego ~400 px | El panel pasa a cajón y después a hoja inferior; nada se solapa |

**Criterio de aceptación**: los 13 pasos «sí» en Firefox (y en Safari si está disponible), sin
errores en la consola del navegador (F12 ▸ Consola).

## Notas de la sesión

(Pendiente: rellenar el usuario.)
