# Un área, dos mundos

Video didáctico (1920×1080, 60 fps, ~1:46, sin audio) sobre cómo un cambio de variable
traslada el cálculo de un área del **mundo exponencial** al **mundo circular**:

$$\int_{-\infty}^{0} e^{x}\sqrt{1+e^{x}}\,dx \;=\; \int_{0}^{\pi/4} 2\tan\theta\,\sec^{3}\theta\,d\theta \;=\; \tfrac{2}{3}\left(2\sqrt{2}-1\right)\approx 1.21895$$

- **`un-area-dos-mundos.mp4`** — el video final.
- **`index.html`** — la misma animación en vivo, con pausa y barra de avance
  (espacio = reproducir/pausar, ←/→ = ±2 s). No necesita red: KaTeX y las tipografías van en `vendor/`.
- **`anim.js`** — toda la animación. Cada cuadro es función pura del tiempo `t`.
- **`render.mjs`** — convierte la animación en MP4 (Chromium + ffmpeg).

## La idea, en una frase

Bajo la raíz hay una suma de cuadrados, `1 + eˣ = 1² + (e^{x/2})²`, y donde hay suma de
cuadrados hay un triángulo rectángulo. Si el cateto `1` es el radio de un círculo, el otro
cateto es una tangente y la hipotenusa una secante:

| mundo exponencial | mundo circular |
| --- | --- |
| `√(1 + eˣ)` | `sec θ` |
| `eˣ` | `tan² θ` |
| `eˣ dx` | `2 tan θ sec² θ dθ` |
| `x: −∞ → 0` | `θ: 0 → π/4` |

La semirrecta infinita queda enrollada en un octavo de vuelta, y la integral se vuelve
inmediata: `∫ 2 tanθ sec³θ dθ = ⅔ sec³θ`.

## Guion

| tiempo | escena |
| --- | --- |
| 0:00 | Gancho y título |
| 0:09 | **01 · Mundo exponencial** — la curva, su cola infinita y un área que converge |
| 0:23 | **02 · La pista** — la suma de cuadrados y el triángulo |
| 0:35 | **03 · El puente** — el círculo: `x` recorre una semirrecta, `θ` apenas abre 45° |
| 0:52 | **04 · El diccionario** — la traducción pieza a pieza |
| 1:06 | **05 · La mudanza** — el área, rebanada, cruza de un gráfico al otro |
| 1:23 | **06 · La resolución** — barrido simultáneo en ambos mundos y valor exacto |
| 1:37 | Epílogo |

En la escena 05 los dos gráficos comparten escala de área (150·240 = 480·75 píxeles por
unidad²), así que cada tira conserva literalmente su área en pantalla mientras cambia de forma.

## Volver a renderizar

Requiere Node, Playwright (con Chromium) y ffmpeg.

```bash
node render.mjs                    # → un-area-dos-mundos.mp4
FPS=30 WORKERS=2 node render.mjs   # más rápido / menos núcleos
node render.mjs --shots 12.5,45    # cuadros sueltos en ./shots para revisar
```
