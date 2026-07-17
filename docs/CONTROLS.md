# Controles

La UI acepta ratón y teclado. Los botones del pie de batalla reflejan los
atajos principales y se deshabilitan mientras un diálogo requiere una decisión.

## Global

| Acción | Control |
| --- | --- |
| Alternar pantalla completa | `F11` |
| Activar un campo | Clic izquierdo |
| Escribir / borrar | Teclado / `Backspace` |
| Salir de la edición del campo | `Enter`, `Tab` o `Esc` |
| Cambiar una opción | Botones `<` y `>` |

En **Cómo jugar**, **Arsenal**, **Configuración** y otros paneles, use los
botones visibles; `Esc` vuelve cuando la pantalla lo indica. La rueda desplaza
los paneles largos bajo el puntero.

## Configuración de partida

Escriba los turnos y la semilla directamente o ajuste los turnos pares con
`-`/`+`. **Copiar** envía la semilla visible al portapapeles. Los botones de
velocidad y efectos recorren sus opciones. **Iniciar operación** exige los
catálogos y la confirmación de reglas; al comenzar, los turnos se limitan a
2–60 y se redondean al siguiente par, y un campo vacío usa su valor
predeterminado reproducible.

## Batalla

| Acción | Ratón o botón | Teclado |
| --- | --- | --- |
| Seleccionar un operativo | Clic en su slot | — |
| Seleccionar un nodo | Clic en el fondo de la estación | — |
| Zoom | Rueda | `+` / `-` |
| Desplazar cámara | Arrastrar con botón medio o derecho | `A/D/W/S` o flechas |
| Ajustar todo el árbol a la vista | **Centrar** | `C` |
| Pausar o reanudar | **Pausa / Play** | `P` |
| Consumir un evento o pulso del motor | **Evento** | `E` |
| Continuar / terminar la fase Taller Manual | **Continuar / LISTO** | `Espacio` |
| Avanzar hasta el turno siguiente (sólo IA) | **Turno** | `T` |
| Cambiar ritmo | **0.5x / 1x / 2x / 4x / Rápido** | — |
| Mostrar u ocultar inspector | **Inspector / Ocultar** | `I` |
| Abrir taller preturno (sólo fase Taller Manual) | **Taller** en el inspector | `W` |
| Abrir ayuda | **Ayuda** | `H` |
| Abandonar la batalla actual | **Menú** | — |

`Espacio` adelanta inmediatamente el siguiente paso si la reproducción está
activa; si está pausada, avanza una sola unidad. Durante la fase Taller Manual,
cuando ya no quedan eventos por mostrar, el mismo control cambia a **LISTO**:
cierra la fase y permite que el motor haga el rearme canónico y solicite el
reclutamiento. `E` siempre solicita una sola unidad. `T` sólo aparece en IA vs
IA y vuelve a pausar al comenzar el siguiente turno.

`W` abre el taller únicamente en Manual, durante la fase Taller dedicada y con
un operativo seleccionado. **Cerrar** o `Esc` oculta el modal, pero no finaliza
la fase: para eso use **LISTO**/`Espacio`. Fuera de ese contexto, `W` forma parte
de `WASD` y desplaza la cámara hacia arriba.

La rueda actúa sobre el elemento bajo el puntero: hace zoom en el tablero y
desplaza el inspector, el registro o el arsenal cuando está sobre esos paneles.

## Decisiones Manual

- **Reclutamiento:** cambie entre Catálogo, Clase rápida y Personalizado;
  seleccione plantilla/equipo con `<` y `>`, escriba un ID libre y confirme.
  **Inspeccionar tablero** permite revisar el árbol antes de decidir.
- **Troyano:** recorra los objetivos enemigos válidos y confirme uno.
- **Disrupción:** recorra el objetivo, escriba un ID de destino libre y
  confirme. La reubicación ocurre en limpieza.
- **Taller — Operativo:** edite nombre, HP, ataque, rapidez o ID; alterne
  facción y condición de héroe; o copie un molde de especie/personaje
  conservando ID, facción, estatus de héroe y estructuras de equipo.
- **Taller — Armas FIFO:** recorra cualquier posición y edite nombre, ID
  interno, daño, munición o costo de uso. Puede encolar un arma de catálogo,
  eliminar la seleccionada sin reordenar las demás o hacer pop del frente
  activo.
- **Taller — Escudos LIFO:** recorra cualquier posición y edite nombre, ID
  interno, absorción, durabilidad o peso. Puede apilar un escudo de catálogo,
  eliminar el seleccionado sin reordenar los demás o hacer pop del tope activo.
- **Taller — Borrado:** eliminar el operativo exige una segunda confirmación y
  puede reequilibrar el Árbol B-4.

Los diálogos muestran el error del motor cuando un comando no es legal y
permanecen abiertos; no aplican cambios parciales.

## Final de partida

- **Misma semilla:** reinicia el mismo modo y configuración con una repetición
  determinista.
- **Nueva semilla:** genera una semilla nueva y comienza otra partida.
- **Menú:** regresa al menú principal.
