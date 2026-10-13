# Rendimiento

## Coste del trazado

Cada píxel integra una geodésica nula de Kerr con RK4: en la calidad interactiva, entre ~100 y ~170
pasos de media por rayo (máximo 700), cada uno con cuatro evaluaciones de las ecuaciones de Hamilton
en Kerr–Schild; con plasma se añade la transferencia radiativa en tres frecuencias. El coste por
fotograma es proporcional al número de píxeles trazados, por eso el motor gestiona la resolución.

## Estrategia

| Mecanismo | Qué hace |
|---|---|
| Resolución dinámica | Se traza a una fracción de la ventana (30–85 % del lado en calidad interactiva, hasta 100 % en alta fidelidad) y se reescala. El motor mide el tiempo de fotograma: si supera 1,25 × el objetivo (30 ms con la cámara o la escena en movimiento, 45 ms en reposo) reduce la escala un 8 %; si baja de 0,7 × el objetivo la sube un 4 %. |
| Acumulación progresiva | Con la cámara quieta, cada fotograma añade una muestra con fluctuación subpíxel (Halton 2, 3): hasta 48 muestras en calidad interactiva y 256 en alta fidelidad. La imagen se afina sola y la GPU descansa al terminar. |
| Escenas que cambian | Con plasma turbulento u objetos en movimiento la acumulación pasa a media móvil exponencial (peso 0,3–0,6): suaviza el ruido sin dejar estelas largas. |
| Dos calidades | Interactiva (η = 0,07, paso máximo 0,35 M en el plasma) y alta fidelidad (η = 0,025, 0,12 M, 3000 pasos). Ambas validadas frente a la referencia en CPU (docs/VALIDACION.md). |
| Física fuera del hilo de render | Las geodésicas de los objetos se integran en un Web Worker por delante del reloj; el hilo principal solo interpola muestras. |
| Capturas | `Ajustes → Capturas` acumula 16 o 128 muestras a resolución completa, independientemente de la escala interactiva. |
| Escala fija | `Ajustes → Rendimiento` permite fijar 35/50/75/100 % o volver a la escala dinámica. |

## Banco de pruebas integrado

`Ajustes → Rendimiento → Banco de pruebas` traza **un fotograma completo en cada vuelta** durante 5 s
a escala 100 % (sin reutilizar la acumulación), con el perfil y la calidad actuales, y muestra FPS,
ms por fotograma, rayos por segundo y el nombre de la GPU. Es la medida honesta para un equipo
concreto: el rendimiento de un trazador de geodésicas depende muchísimo de la GPU.

`npm run rendimiento` ejecuta ese mismo banco en Chromium (Playwright) para varios perfiles y escalas
y guarda `docs/validacion/rendimiento.json`. Con `GPU=1` intenta usar la GPU del sistema en lugar de
SwiftShader.

## Medidas en el entorno de desarrollo

> **Advertencia:** el entorno donde se desarrolló y validó el observatorio **no tiene GPU**. Chromium
> usa SwiftShader, que ejecuta los shaders en la CPU. Las cifras siguientes sirven para documentar el
> coste relativo de cada perfil y comprobar que la aplicación funciona sin GPU, **no** para predecir el
> rendimiento en una GPU real, que es de dos a cuatro órdenes de magnitud superior.

Medido con `ESCALAS=0.15,0.3 SEGUNDOS=20 npm run rendimiento` en una ventana de 1280 × 720
(renderizador: *ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)*,
4 núcleos de CPU), calidad interactiva, un fotograma completo por vuelta:

| Perfil | Escala | Resolución trazada | ms / fotograma | Rayos / s |
|---|---|---|---|---|
| Cinematográfico (plasma, 3 frecuencias) | 15 % | 192 × 108 | 1549 | 1,3 · 10⁴ |
| Cinematográfico | 30 % | 384 × 216 | 5356 | 1,5 · 10⁴ |
| Científico EHT (230 GHz, cámara a 10⁴ M) | 15 % | 192 × 108 | 2102 | 0,99 · 10⁴ |
| Científico EHT | 30 % | 384 × 216 | 7289 | 1,1 · 10⁴ |
| Espacio-tiempo (sin plasma) | 15 % | 192 × 108 | 447 | 4,6 · 10⁴ |
| Espacio-tiempo | 30 % | 384 × 216 | 1535 | 5,4 · 10⁴ |

Lecturas útiles aunque el valor absoluto no represente una GPU:

- La transferencia radiativa en tres frecuencias cuesta unas **3,5 veces** el trazado puro
  (espacio-tiempo frente a cinematográfico).
- El perfil EHT es el más caro por rayo: la cámara está a 10⁴ M y los rayos recorren más camino.
- El coste es lineal en el número de píxeles: lo que justifica la resolución dinámica.
- En software la aplicación funciona de extremo a extremo (interfaz, física en el trabajador,
  capturas: ≈ 1–1,5 min cada una), pero a ~1 fotograma por segundo incluso a escala baja: no es
  fluida. Se necesita una GPU para usarla de forma interactiva.

## Qué esperar en una GPU

No se ha podido medir en hardware gráfico real desde este entorno, así que no se dan cifras
inventadas. Como orientación de órdenes de magnitud: una GPU integrada moderna ejecuta del orden de
10¹² operaciones en coma flotante por segundo; un rayo interactivo cuesta del orden de 10⁴–10⁵
operaciones, lo que sitúa el presupuesto en decenas de millones de rayos por segundo, es decir,
varios fotogramas por segundo a resolución completa 1080p y fluidez a la escala reducida que elige la
resolución dinámica. El banco de pruebas integrado da la cifra real de cada equipo.
