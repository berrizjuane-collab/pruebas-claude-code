# VAL-03 · Medición en tu equipo (R1: i9 + RTX 4060 + 144 Hz)

**Quién**: el usuario. **Duración**: unos 15 minutos. **Qué hace falta**: Chrome (o Edge) y
`entrega/campos-vectoriales.html`. No hace falta Node ni servidor.

## Condiciones (VALIDATION §6.3)

- Monitor de 144 Hz como pantalla principal y a 144 Hz en la configuración del sistema.
- Ventana de Chrome **maximizada** (idealmente 1920 × 1080; la tarjeta muestra el tamaño actual).
- Sin otras pestañas pesadas; portátil enchufado y en modo de alto rendimiento.
- En Chrome, `chrome://gpu` debe decir «Hardware accelerated» en WebGL2.

## Pasos

Para cada escena, **tres veces** (recarga la página entre medición y medición):

| Escena | Abrir | Duración aproximada |
| --- | --- | --- |
| PERF-A (típica: 15³ flechas, 128 líneas, corte 41² con div F, 1000 partículas) | `campos-vectoriales.html?perf=PERF-A` | unos 10 s |
| PERF-B (máxima: 21³, 256 líneas, corte 61², 2000 partículas) | `campos-vectoriales.html?perf=PERF-B` | unos 20 s |
| PERF-C (interacción: arrastre de ω con 60 valores en 3 s) | `campos-vectoriales.html?perf=PERF-C` | unos 6 s |

1. Abre el archivo con doble clic y añade a la dirección `?perf=PERF-A` (o la escena que toque).
2. Espera a que la tarjeta diga «Lista para medir» y pulsa **Iniciar medición**. No muevas el
   ratón sobre la escena mientras mide: la cámara gira sola (una vuelta cada 10 s).
3. Al terminar, pulsa **Descargar informe (.json)**. El nombre ya lleva fecha, equipo y escena.
4. Repite hasta tener 3 informes por escena (9 en total) y pásamelos (o súbelos a
   `evidencia/VAL-03/R1/`).

## Qué se comprueba con tus informes (mediana de las tres ejecuciones)

| ID | Métrica | Objetivo |
| --- | --- | --- |
| V-PERF-01 | PERF-A, p95 del intervalo entre fotogramas | ≤ 7.5 ms (144 Hz sostenidos) |
| V-PERF-02 | PERF-B, p95 del intervalo entre fotogramas | ≤ 10 ms (≥ 100 fps) |
| V-PERF-03 | Malla 15³ · corte 41² · líneas PERF-A · líneas PERF-B | ≤ 30 · ≤ 40 · ≤ 250 · ≤ 1000 ms |
| V-PERF-04 | PERF-C: tareas > 50 ms y latencia p95 de las flechas | 0 y ≤ 50 ms |
| V-PERF-06 | Arranque desde disco hasta interfaz interactiva | ≤ 1.5 s |

Si algún objetivo no se alcanza, lo primero será ajustar los valores por defecto (densidad,
partículas, resolución) y documentarlo en STATUS; las optimizaciones de código vienen después.

## Notas de la sesión

(Pendiente: rellenar el usuario. Anota también el navegador y su versión.)
