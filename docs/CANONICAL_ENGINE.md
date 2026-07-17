# Fuente canónica y reglas preservadas

Este juego fue extraído y refactorizado desde el repositorio de solo lectura
[`berrizjuane-collab/pulido-proyecto-YGGDRASIL`](https://github.com/berrizjuane-collab/pulido-proyecto-YGGDRASIL),
commit `ade6ad9b67b5776c9f27901002fd5727b643d273` (`main`). El único archivo C++
canónico de ese estado es `version_principal.cpp.cpp`:

- SHA-256: `440E44D8607CB8B683DDD7803709506633578A5FBE15EE51933F34B5FF633761`.
- Tamaño auditado: 170.362 bytes.
- `version_principal.cpp`, `file1`, `yggdrasil_normal` y `yggdrasil_asan` son
  binarios ELF, no fuentes alternativos.

El repositorio fuente no se modificó, compiló ni usó como directorio de build.
Los cinco catálogos de `data/` se copiaron byte por byte al repositorio de
trabajo; sus hashes están documentados en `data/SOURCE.md`.

## Qué se extrajo

La refactorización conserva una sola fuente de verdad:

- `Operative` retiene ID, nombre, facción, clase, fortaleza/daño de origen,
  salud estampada, HP efectivo, ataque colapsado, rapidez, héroe y conversión.
- La defensa sigue siendo una pila LIFO; `shields.back()` es el tope activo.
- El arsenal sigue siendo una cola FIFO; `weapons.front()` es el frente activo.
- `BTree` es un Árbol B-4 real de 1–3 claves por nodo. La inserción admite un
  rebose temporal de cuatro claves, promueve el índice 2 y deja dos claves a la
  izquierda y una a la derecha, igual que `split()` en la fuente.
- Borrado interno por predecesor, préstamo derecho antes que izquierdo, merge y
  reducción de raíz son operaciones estructurales reales y emiten eventos.
- El cargador conserva el formato de bloques, los comentarios `#`, el XOR
  fortaleza/daño y el significado de `-`.
- Taller, rearme, reclutamiento, combate, limpieza, Disrupción diferida y
  victoria viven en la misma máquina de estados usada por UI e IA.

La UI nunca calcula daño, altera claves ni decide resultados. Envía comandos
validados y representa snapshots/eventos del núcleo.

## Reglas de flujo caracterizadas

- Los turnos se normalizan a un número par, mínimo 2. La interfaz limita el
  valor a 60 para evitar overflow y mantenerlo alineado con el cupo global.
- Una moneda determina la facción de los turnos impares; luego hay alternancia
  estricta.
- Cada turno Manual abre una fase Taller exclusiva antes del rearme y del
  reclutamiento. El jugador puede inspeccionar y editar hasta confirmar
  **LISTO**/`Espacio`; IA vs IA continúa esa fase automáticamente, sin editar.
- Precombate: cuatro turnos, salvo partidas de 2 o 4 turnos, donde ocupa la
  primera mitad.
- Turnos normales: dado uniforme de 1–3 inserciones.
- Turnos de héroe reales: `3, 4, 6, 7, 9, 10, 12, 13, 15, 16`. En ellos entra
  exactamente un héroe, sin dado ni tropa normal.
- Catálogo normal: turnos 1–2 sólo especies; desde el 3 se agregan personajes.
  Clase rápida y personalizado conservan la excepción de la fuente.
- En cada turno par desde el 4, después de cerrar el Taller y antes de calcular
  el reclutamiento, un operativo vivo con cola vacía recibe un arma de catálogo
  por hash de ID.
- Tras el precombate, ambos bandos atacan una vez por turno. La facción activa
  sólo controla el reclutamiento.
- El combate visita nodos en el orden de la fuente: hijo 0, nodo, hijos 1..N.
  La iniciativa se calcula al visitar cada nodo: rapidez descendente y menor ID
  al empatar.
- Un nodo mixto fija esa condición al comenzar su resolución. Una unidad busca
  primero el enemigo vivo de mayor ID del mismo nodo. Desde un nodo monobando
  sólo alcanza hijos inmediatos y usa el primer hijo, de izquierda a derecha,
  que contenga un enemigo; no alcanza nietos.
- Muertes y cambios de clave nunca reestructuran el árbol durante el recorrido.
  Primero se purgan muertos y luego se aplican Disrupciones vivas.

## Equipo y habilidades

El equipo de catálogo conserva `índice = ID % 5`. Por ello el ID 1 obtiene el
segundo elemento y el ID 5 obtiene el primero.

- Plasma: daño normal.
- Gauss: 10 % adicional de `arma + ataque`, agregado después de resistencia.
- Espada: 20 % adicional sólo ante Barrera Cinética.
- Granada EMP: afecta a todos los enemigos del nodo y consume una sola carga.
- Malware: daño normal y −20 rapidez, con mínimo 0.
- Resistencia del escudo: `clamp(durabilidad / 10, 0, 100)` por ciento.
- Un escudo con absorción `<= 0` se rompe. El excedente pasa a HP, no al escudo
  siguiente. Si sobrevive, pierde 50 de durabilidad.
- Camuflaje evita otro 30 % después de resistencia.
- Reactivo refleja la cantidad absorbida por resistencia, sin ejecutar la
  habilidad del escudo del atacante.
- Una Granada sin Deflector resuelve cada objetivo individualmente. Con un
  Deflector, calcula un solo golpe usando la resistencia de ese Deflector y lo
  aplica completo a todos, omitiendo habilidades de sus otros escudos.
- El héroe nace con cola `[TROYANO, DISRUPCION]`. Troyano es global, se consume
  incluso si el Cortafuegos activo lo bloquea y una conversión impide actuar
  ese mismo turno. Disrupción elige enemigo global e ID libre y se ejecuta en
  limpieza conservando HP, stats, pila y cola.

## Victoria y precedencia

No se evalúa antes de terminar el turno 2. La precedencia preservada es:

1. árbol vacío: empate por aniquilación mutua;
2. dominio monobando de la raíz durante tres turnos de combate;
3. en el último turno: conteo de vivos;
4. aniquilación o conversión total;
5. al llegar a 60 inserciones: conteo de vivos.

Un empate de conteo se decide por la facción de la clave de mayor ID dentro de
la raíz. La racha de dominio no acumula durante precombate.

## Endurecimientos deliberados

Se corrigieron fronteras que no constituyen balance nuevo:

- RNG único `std::mt19937_64`, semilla visible y repetible; se eliminó `rand()`.
- Catálogos abiertos en modo lectura y localizados junto al ejecutable, no sólo
  respecto del directorio actual.
- HP/ataque/rapidez personalizados tienen rangos seguros para evitar overflow,
  curación por daño negativo y unidades inválidas.
- Troyano y Disrupción sólo muestran objetivos enemigos vivos.
- La UI deshabilita IDs duplicados y comandos fuera de fase en lugar de crear
  estados inválidos.
- El CRUD sólo se acepta en la fase Taller Manual y conserva las estructuras
  canónicas: puede editar identidad, estadísticas, facción, estatus de héroe o
  aplicar un molde; editar o borrar cualquier entrada de la cola FIFO y la pila
  LIFO; agregar equipo de catálogo sin duplicar su ID interno; y eliminar una
  unidad. Cambiar el ID de la unidad borra/reinserta la clave, por lo que todo
  rebalanceo del B-4 es real.

No se rebalancearon armas, escudos, turnos de héroe, alcance, daño, munición,
dominio ni desempates por conveniencia gráfica.
