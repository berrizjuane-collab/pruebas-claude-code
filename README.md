# Operación Yggdrasil

Videojuego táctico 2D de escritorio en el que NEON y OMEGA disputan una red
orbital con forma de Árbol B-4. Cada estación, conexión y operativo que aparece
en pantalla pertenece al árbol real del motor: los splits, préstamos, merges,
reducciones de raíz, ataques y bajas no son una simulación visual paralela.

El juego incluye dos modos completos:

- **Manual local (hot-seat):** dos jugadores comparten pantalla y resuelven el
  taller preturno, el reclutamiento y las decisiones tácticas de su facción.
- **IA vs IA:** una simulación automática, pausable y determinista, animada con
  las mismas reglas y el mismo motor.

La interfaz ofrece árbol navegable, inspector de unidades y nodos, taller
preturno, historial de eventos, velocidades de reproducción y resumen final.
Todo el arte del tablero y de la interfaz se dibuja proceduralmente con una
identidad de ciencia ficción cian/magenta; no se usan sprites de Terraria ni
recursos artísticos externos.

## Tecnología y plataformas

El proyecto usa C++20, CMake y
[`raylib 6.0`](https://github.com/raysan5/raylib/releases/tag/6.0). raylib encaja
con el núcleo C++ porque aporta ventana, entrada y dibujo 2D nativos con una API
pequeña, sin introducir un navegador ni un segundo modelo de estado. CMake la
compila estáticamente desde su repositorio oficial.

La dependencia está fijada al commit inmutable
`dbc56a87da87d973a9c5baa4e7438a9d20121d28`, el commit publicado para raylib
6.0. Esto evita que una etiqueta móvil cambie la compilación. La primera
configuración necesita Git y acceso a GitHub; después `FetchContent` reutiliza
la copia del árbol de build.

Requisitos:

- CMake 3.25 o posterior;
- Git;
- compilador con C++20 (MinGW-w64 GCC en Windows; GCC o Clang en Linux);
- entorno gráfico con OpenGL; en Linux, los encabezados de escritorio/X11 que
  necesita raylib.

Las rutas documentadas y mantenidas son Windows 10/11 con MSYS2 MinGW-w64
UCRT64 y Linux de escritorio x86-64. El núcleo y el simulador también pueden
compilarse sin GUI con `-DYGGDRASIL_BUILD_GUI=OFF`.

## Compilar, probar y ejecutar

Ejecute todos los comandos desde la raíz de este repositorio. Los ejecutables
quedan en `bin/` dentro del directorio de build.

### Windows — MSYS2 MinGW-w64 UCRT64

Abra la terminal **MSYS2 UCRT64** e instale el toolchain:

```bash
pacman -S --needed git mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-cmake mingw-w64-ucrt-x86_64-make
```

Configure, compile, pruebe y abra el juego:

```bash
cmake -S . -B build-mingw -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=ON
cmake --build build-mingw --parallel
ctest --test-dir build-mingw --output-on-failure
./build-mingw/bin/yggdrasil_game.exe
```

Desde PowerShell, el último comando equivalente es:

```powershell
.\build-mingw\bin\yggdrasil_game.exe
```

### Linux — GCC/Clang

En Debian o Ubuntu, instale las dependencias de compilación de raylib/X11
(use paquetes equivalentes en otra distribución):

```bash
sudo apt update
sudo apt install build-essential cmake git libasound2-dev libx11-dev libxrandr-dev libxi-dev libgl1-mesa-dev libglu1-mesa-dev libxcursor-dev libxinerama-dev
```

Confirme que `cmake --version` informa 3.25 o posterior. Después:

```bash
cmake -S . -B build-linux -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=ON
cmake --build build-linux --parallel
ctest --test-dir build-linux --output-on-failure
./build-linux/bin/yggdrasil_game
```

Para compilar sólo el motor, el simulador y las pruebas, sin raylib ni un
servidor gráfico:

```bash
cmake -S . -B build-headless -DCMAKE_BUILD_TYPE=Release -DYGGDRASIL_BUILD_GUI=OFF -DBUILD_TESTING=ON
cmake --build build-headless --parallel
ctest --test-dir build-headless --output-on-failure
./build-headless/bin/yggdrasil_sim --seed 12345 --turns 10 --games 100
```

## Catálogos y `data/`

La aplicación necesita los cinco catálogos canónicos:

```text
data/armas.txt
data/escudos.txt
data/especie.txt
data/personajes.txt
data/heroes.txt
```

El target `yggdrasil_runtime_data`, incluido en la compilación normal, copia el
directorio completo a `<build>/bin/data`. Al arrancar, el cargador busca en este
orden:

1. el directorio explícito de `--data-dir`;
2. `data/` junto al ejecutable;
3. `../data` respecto del ejecutable;
4. `data/` respecto del directorio de trabajo.

Por ello los comandos anteriores funcionan tanto desde la raíz como desde el
árbol de build. Para usar otra copia:

```bash
./build-linux/bin/yggdrasil_game --data-dir /ruta/a/data
./build-linux/bin/yggdrasil_sim --data-dir /ruta/a/data --seed 7 --turns 12
```

Si falta o está dañado un catálogo, la UI avisa que la carga está incompleta y
no habilita el inicio de una partida; el simulador imprime los diagnósticos y
termina con error. `--help` muestra las opciones de cada ejecutable.
`yggdrasil_game` también ofrece `--smoke-test` y
`--screenshot archivo.png` para verificación gráfica automatizada.

## Cómo jugar Manual (hot-seat)

1. En el menú, elija **Jugar Manual**. Fije una cantidad de turnos entre 2 y
   60, una semilla decimal, la velocidad visual y la duración de efectos. El
   motor redondea hacia arriba una cantidad impar para mantener la alternancia.
   Lea y confirme las reglas antes de iniciar.
2. Una moneda elige qué facción ocupa los turnos impares. El encabezado siempre
   muestra turno, facción activa, fase, inserciones, semilla y velocidad. Cambie
   de jugador cuando cambie la facción activa.
3. Cada turno Manual se detiene en una fase **Taller** dedicada, antes de todo
   rearme y reclutamiento. Seleccione un operativo y abra **Taller** (`W`):
   - **Operativo:** cambie nombre, HP, ataque, rapidez, ID, facción o condición
     de héroe, o copie un molde de especie/personaje sin reemplazar ID ni equipo.
   - **Armas FIFO:** edite nombre, ID interno, daño, munición y costo de uso de
     cualquier posición; encole un arma de catálogo, elimine una posición o
     retire el frente activo.
   - **Escudos LIFO:** edite nombre, ID interno, absorción, durabilidad y peso de
     cualquier posición; apile un escudo de catálogo, elimine una posición o
     retire el tope activo.
   También puede eliminar el operativo con doble confirmación. Los IDs internos
   de equipo no se duplican dentro de su estructura y todo cambio de ID del
   operativo borra y reinserta la clave. Un comando ilegal se rechaza sin dejar
   cambios parciales. **Cerrar** sólo oculta el modal: pulse **LISTO** o
   `Espacio` en el pie de batalla para terminar la fase. Entonces, y sólo
   entonces, el motor aplica el rearme canónico de los turnos pares desde el 4
   y abre el reclutamiento.
4. En un turno normal, el dado concede de una a tres inserciones. Resuelva cada
   diálogo de reclutamiento con un ID libre entre 1 y 999:
   - **Catálogo:** especies en los turnos 1–2; personajes desde el turno 3.
   - **Clase rápida:** Hacker/Espectro usa IDs 1–499, Ejecutor 500–799 y
     Juggernaut 800–999; sus stats y equipo se generan con las reglas del motor.
   - **Personalizado:** escriba nombre, HP, ataque y rapidez, y elija arma y
     escudo de catálogo.
5. Haga clic en un operativo para abrir el inspector: muestra HP, ataque,
   rapidez, facción, héroe/conversión, la cola FIFO completa de armas y la pila
   LIFO completa de escudos. Haga clic en el fondo de un nodo para inspeccionar
   su clave, padre e hijos.
6. En los turnos especiales sólo se admite exactamente un héroe de catálogo.
   Los turnos son **3, 4, 6, 7, 9, 10, 12, 13, 15 y 16**. Cuando un héroe usa
   Troyano, elija un enemigo vivo; para Disrupción elija además un ID libre. El
   motor valida la decisión y difiere la reubicación hasta la limpieza.
7. Después del reclutamiento el combate avanza por eventos. Los primeros cuatro
   turnos son precombate sin ataques; en partidas de 2 o 4 turnos, el
   precombate ocupa sólo la primera mitad. Desde entonces atacan operativos de
   ambas facciones: rapidez descendente y menor ID al empatar. Los jugadores no
   eligen blancos de ataques normales; el motor aplica alcance y objetivos
   canónicos.
8. Use el registro y los efectos para seguir daño, escudos, consumo, Troyano,
   Disrupción y cambios del árbol. Pause o avance un evento cuando necesite
   inspeccionar el estado. La pantalla final conserva el árbol y resume causa,
   supervivientes, bajas, conversiones, disrupciones, turnos, inserciones y
   semilla.

La facción activa controla el reclutamiento, no monopoliza el combate: una vez
terminado el precombate, ambos bandos pueden actuar en cada resolución según su
posición e iniciativa.

## IA vs IA

Elija **IA vs IA**, configure turnos y semilla, confirme las reglas e inicie.
La IA resuelve los mismos `PendingDecision` que la UI Manual: selecciona una
plantilla legal, predice el destino real de IDs, prioriza objetivos de impacto,
evita Cortafuegos para Troyano cuando puede y usa Disrupción para romper grupos
favorables. No tiene una API privilegiada.

Durante la simulación:

- `P` pausa/reanuda;
- `E` muestra el siguiente evento;
- `T` avanza hasta el siguiente turno y vuelve a pausar;
- el botón de velocidad recorre **0.5x, 1x, 2x, 4x y RÁPIDO**;
- `Espacio` fuerza el próximo paso visible; si está pausado, avanza uno;
- el historial y el inspector siguen disponibles durante la pausa.

Al terminar puede reiniciar con la misma semilla para repetir exactamente la
guerra o iniciar otra con una semilla nueva. La semilla usada permanece visible
en el encabezado y en el resumen final.

## Fases y victoria

El ciclo Manual real es moneda → taller dedicado → **LISTO** → rearme cuando
corresponda → reclutamiento → precombate o combate → limpieza →
dominio/victoria. IA vs IA atraviesa la fase de taller automáticamente, sin
editar unidades, y continúa por el mismo rearme y reclutamiento. Las muertes se
retiran antes de las Disrupciones para que ninguna modificación estructural
invalide el recorrido de combate.

La victoria no se evalúa antes de terminar el turno 2. Su precedencia es:

1. árbol vacío: aniquilación mutua;
2. una facción ocupa por sí sola la raíz durante tres turnos de combate;
3. al llegar al último turno, conteo de operativos vivos;
4. aniquilación o conversión total de una facción;
5. al llegar al límite global de 60 inserciones, conteo final.

Si un conteo empata, decide la facción de la clave de mayor ID de la raíz. La
descripción completa de combate, equipo y habilidades está en
[`docs/CANONICAL_ENGINE.md`](docs/CANONICAL_ENGINE.md).

## Controles

| Acción | Ratón | Teclado |
| --- | --- | --- |
| Seleccionar operativo/nodo | Clic izquierdo | — |
| Zoom del árbol | Rueda | `+` / `-` |
| Desplazar cámara | Arrastrar con botón medio o derecho | `A/D/W/S` o flechas |
| Centrar árbol | Botón **Centrar** | `C` |
| Pausa/reanudar | Botón **Pausa/Play** | `P` |
| Siguiente evento/paso | Botón **Evento** | `E` |
| Continuar; terminar Taller Manual | Botón **Continuar/LISTO** | `Espacio` |
| Avanzar un turno de IA | Botón **Turno** | `T` |
| Mostrar/ocultar inspector | Botón **Inspector/Ocultar** | `I` |
| Taller contextual (sólo fase Taller Manual) | Botón del inspector | `W` |
| Ayuda en batalla | Botón **Ayuda** | `H` |
| Pantalla completa | Configuración | `F11` |

Los botones `<` y `>` cambian opciones en selectores; los campos se editan con
clic, escritura y `Backspace`. Consulte la guía corta
[`docs/CONTROLS.md`](docs/CONTROLS.md) para los controles por pantalla.

## Simulador headless

`yggdrasil_sim` ejecuta IA vs IA sin ventana y comprueba el estado final. Cada
partida se repite inmediatamente con la misma semilla y se comparan digest del
historial, victoria, altura y contenido final del árbol. Con `--games N`, la
partida `i` usa `seed + i`; el rango admitido es 1–1000 partidas y 2–60 turnos.

```bash
./build-linux/bin/yggdrasil_sim --seed 12648430 --turns 10 --games 100
./build-linux/bin/yggdrasil_sim --help
```

En Windows:

```powershell
.\build-mingw\bin\yggdrasil_sim.exe --seed 12648430 --turns 10 --games 100
```

Cada línea de salida contiene partida, semilla, turnos, ganador, causa,
supervivientes y digest. El proceso devuelve un código distinto de cero si no
puede cargar datos, terminar, validar invariantes o reproducir el resultado.

## Pruebas y sanitizers

`ctest` ejecuta siete binarios contra el mismo `yggdrasil_core`:

- `test_btree`: tipos canónicos y secuencias aleatorias de inserción/borrado,
  split, borrow, merge y reducción de raíz;
- `test_catalog`: formato, UTF-8, diagnósticos, carga transaccional y búsqueda
  robusta de `data/`;
- `test_ai`: decisiones legales, contrato Manual compartido, CRUD completo del
  taller, habilidades y repetición por semilla;
- `test_engine`: moneda, alternancia, taller Manual, los tres modos de
  reclutamiento, decisiones tácticas, precombate, héroes, fases y digest;
- `test_manual`: partida hot-seat completa sin usar `AIController`, con Taller,
  los tres modos de reclutamiento, Troyano, Disrupción, victoria e invariantes;
- `test_combat`: iniciativa y fórmulas exactas de armas, escudos, Troyano y
  Disrupción;
- `test_simulation`: 24 semillas completas, invariantes, historial y replay
  exacto de una semilla adicional.

Para ASan y UBSan con GCC o Clang, se recomienda un build separado sin GUI:

```bash
cmake -S . -B build-asan -DCMAKE_BUILD_TYPE=Debug -DYGGDRASIL_BUILD_GUI=OFF -DYGGDRASIL_ENABLE_SANITIZERS=ON -DBUILD_TESTING=ON
cmake --build build-asan --parallel
ctest --test-dir build-asan --output-on-failure
./build-asan/bin/yggdrasil_sim --seed 1 --turns 10 --games 100
```

La opción agrega `-fsanitize=address,undefined` y
`-fno-omit-frame-pointer` a compilación y enlace. CMake muestra una advertencia
si el compilador no es GNU/Clang.

En esta entrega se verificó localmente el build headless Debug con CMake 4.3.1,
`MinGW Makefiles` y GCC 15.2.0: las siete pruebas pasaron (7/7). La instalación
MinGW disponible no incluye `libasan`/`libubsan`, por lo que el enlace
sanitizado no puede validarse allí. El workflow
[`C++ CI`](.github/workflows/ci.yml) ejecuta tres comprobaciones independientes
en Ubuntu: build Release del juego nativo con raylib, build headless Release
con las siete pruebas y un smoke test del simulador, y build headless Debug con
ASan/UBSan y las mismas pruebas.

## Estructura del proyecto

```text
CMakeLists.txt                 configuración, targets y raylib fijada
cmake/                         warnings y sanitizers compartidos
include/yggdrasil/core/        entidades, catálogos, árbol, eventos y motor
include/yggdrasil/ai/          contrato de la IA
include/yggdrasil/ui/          contrato de la aplicación raylib
src/core/                      única implementación de reglas
src/ai/                        heurística del controlador automático
src/ui/                        ventana, cámara, paneles, modales y efectos
src/main.cpp                   entrada de yggdrasil_game
tools/yggdrasil_sim.cpp        runner determinista sin ventana
tests/                         pruebas del núcleo, combate e integración
data/                          cinco catálogos canónicos
docs/                          procedencia, arquitectura y controles
```

`yggdrasil_core` contiene el Árbol B-4, reglas e IA y no depende de raylib.
`yggdrasil_game` añade solamente presentación; `yggdrasil_sim` enlaza el mismo
núcleo para ejecutar partidas sin ventana. Véase
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para el flujo
comando–decisión–evento–snapshot.

## Fuente canónica y refactor

La autoridad de reglas fue el repositorio de sólo lectura
[`berrizjuane-collab/pulido-proyecto-YGGDRASIL`](https://github.com/berrizjuane-collab/pulido-proyecto-YGGDRASIL),
`main` en el commit `ade6ad9b67b5776c9f27901002fd5727b643d273`.
El archivo fuente canónico de ese estado es `version_principal.cpp.cpp`:

- SHA-256:
  `440E44D8607CB8B683DDD7803709506633578A5FBE15EE51933F34B5FF633761`;
- tamaño auditado: 170.362 bytes.

Ese repositorio no se modificó ni se utilizó como directorio de build. Los
catálogos se copiaron byte por byte; sus hashes están en
[`data/SOURCE.md`](data/SOURCE.md).

El monolito original mezclaba reglas, globals y `cin/cout`. La refactorización
separó:

- un núcleo sin entrada bloqueante, gobernado por `GameEngine`;
- comandos validados y decisiones pendientes para Manual e IA;
- eventos estructurados y snapshots de sólo lectura para la UI;
- un `BTree` real con eventos estructurales;
- un RNG único `std::mt19937_64` con semilla de 64 bits;
- carga robusta de catálogos y runner headless.

No existe un motor de consola y otro gráfico: UI, IA, pruebas y simulador enlazan
la misma implementación. Las equivalencias exactas y los endurecimientos de
frontera están auditados en
[`docs/CANONICAL_ENGINE.md`](docs/CANONICAL_ENGINE.md).

## Arte y licencias

El espacio, estaciones, ramas, slots, unidades, escudos y efectos se construyen
en tiempo de ejecución con primitivas de raylib y su fuente integrada. No se
distribuyen sprites, música ni audio de terceros; la aplicación actualmente no
reproduce audio. raylib se obtiene desde su repositorio oficial bajo licencia
zlib/libpng. Esa licencia cubre raylib, no concede por sí misma derechos sobre
el código ni los catálogos heredados de Yggdrasil; su procedencia se conserva en
la documentación citada arriba.
