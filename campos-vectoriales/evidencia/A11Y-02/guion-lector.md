# A11Y-02 · Guion para la sesión con lector de pantalla (V-A11Y-04)

**Quién**: el usuario, en su equipo. **Duración**: unos 15 minutos.
**Entorno**: NVDA + Firefox (Windows) o VoiceOver + Safari (macOS), con
`entrega/campos-vectoriales.html` abierto con doble clic.

Para cada paso, anota «sí / no / parcial» y lo que se oyó si no coincide con lo esperado.

| # | Acción | Qué debería anunciarse |
| --- | --- | --- |
| 1 | Cargar la página y pulsar Tab una vez | «Saltar a la escena, enlace» |
| 2 | Intro sobre ese enlace | El foco pasa a la escena: «escena 3D» y el resumen «Campo Helicoidal: 729 flechas.» |
| 3 | Desde la escena, flechas ← → | Nada nuevo salvo, si el lector lo hace, el resumen; la vista gira 5° (no debe leer números sin sentido) |
| 4 | Tab hasta los ejemplos; flecha ← | «Rotacional», marcado/seleccionado; poco después el estado: «Listo · 729 nodos» |
| 5 | Tab hasta la ecuación R; escribir `z*(` y salir con Tab | Primero «Incompleta…» (sin error); al salir, «Error: …» como alerta y el aviso «Mostrando el último campo válido» |
| 6 | Volver a R, borrar y escribir `0` | El error desaparece; estado «Listo» |
| 7 | Tab hasta el deslizador de ω; flecha → | Deslizador con su valor como texto: «ω = 1.05» |
| 8 | Tab hasta «Partículas»; Espacio | «Partículas, interruptor, activado» |
| 9 | Pulsar `i` | Se abre «Punto P» y el foco va a la coordenada x: «Coordenada x de P, 0» |
| 10 | Escribir `1` e Intro; recorrer la tarjeta con las flechas del lector | F, ‖F‖, div F con su lectura («lo que entra sale»), rot F y «Derivadas analíticas» |
| 11 | Esc | Se cierra el inspector; el foco vuelve a la página |
| 12 | F1 | «Ayuda», pestaña «Conceptos, seleccionada, 1 de 4» |
| 13 | → dentro de las pestañas | «Sintaxis, seleccionada, 2 de 4»; la tabla de funciones se puede recorrer por filas y columnas |
| 14 | Esc | Se cierra la ayuda y el foco vuelve a donde estaba |
| 15 | Menú «Exportar» → «Configuración (.json)» | «Listo: Configuración exportada: campo-…json» (notificación de estado, sin mover el foco) |
| 16 | «Abrir» con un .json con errores (p. ej. `tests/fixtures/configuracion/fuera-de-rango.json`) | Diálogo «No se pudo abrir la configuración», con la lista de errores; foco en «Cerrar»; Esc lo cierra y vuelve a «Abrir» |

**Criterio de aceptación**: nombres, roles y estados correctos en todos los pasos; los
resultados del cálculo y los errores se anuncian (pasos 2, 4, 5, 15 y 16).

## Notas de la sesión

(Pendiente: rellenar el usuario.)
