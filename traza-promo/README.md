# TRAZA · Spot de 15 segundos

Animación promocional de **TRAZA**, la calculadora visual de préstamos (sistema francés)
de Ingeniería Económica. *Las finanzas con claridad.*

| Archivo | Qué es |
|---|---|
| `traza-promo.mp4` | El spot final: 1920×1080, 60 fps, H.264 + AAC, con diseño sonoro. |
| `traza-promo.html` | La misma animación en un único HTML autocontenido (abre en cualquier navegador, con botón «Ver con sonido»). |
| `poster.png` | Fotograma final, útil como miniatura. |
| `src/promo.html` | Fuente de la animación (determinista: todo sale de `render(t)`). |
| `tools/` | Renderizador, sintetizador de audio y empaquetador. |

## La idea: «la traza»

El logotipo de TRAZA **es** un diagrama de flujo de efectivo: una línea de tiempo con
flujos hacia arriba y hacia abajo, y un punto. El spot se apoya en esa verdad:

1. **Gancho (0–3,3 s).** Un punto cae, rebota y abre la línea de tiempo. Aparece el
   diagrama real del préstamo por defecto de la app: entrada de **+$ 12.000,00** y una
   lluvia de **24 cuotas de −$ 564,88**. Pregunta: *¿Cuánto te cuesta realmente?*
2. **Configura (3,3–5,2 s).** El eje se convierte en el deslizador del monto; el panel se
   despliega desde esa línea. Monto, tasa y plazo se ajustan con rebote; clic en «Calcular».
3. **Calcula (5,2–7,1 s).** La cámara viaja a los resultados, que pasan del estado vacío
   real de la app («—», «Pulsa «Calcular»…») a las cifras, que ruedan como un contador
   mecánico: cuota **$ 564,88**, interés total **$ 1.557,16** (resaltado en cobre).
4. **Entiende (7,1–10,7 s).** Anillo de composición y evolución de la deuda. Giro didáctico:
   el plazo pasa de 24 a **60 meses**; la cuota baja a **$ 266,93** (▼ $ 297,95 al mes)…
   pero los intereses suben a **$ 4.016,00** (▲ $ 2.458,84). *Cuota más baja ≠ costo más bajo*,
   la misma lección que da el análisis de sensibilidad de TRAZA.
5. **Exporta (10,7–12 s).** El tablero se convierte en el informe PDF y salen los tres CSV
   para Power BI (con 60 y 61 filas, coherentes con el escenario vigente).
6. **Cierre (12–15 s).** Todo se pliega en una línea que se abre en tinta; la línea traza el
   símbolo, el punto del inicio cae en su sitio y aparece *TRAZA · Las finanzas con claridad.*

Todas las cifras salen del mismo motor que usa la app (fórmula estable del sistema francés) y
se muestran con su formato: punto de miles, coma decimal y signo menos tipográfico.

**Identidad respetada:** solo la paleta de TRAZA (tinta #142D34, petróleo #2C6266, marfil
#F5F2EA, salvia #A7C8B9, cobre #B86A45, niebla #E4E8E4), tipografía Inter y la regla de marca
«sin brillos, iconos de monedas ni degradados dominantes». La diversión viene del movimiento:
aplastar y estirar, anticipación, rebotes, contadores rodantes y el guiño del «uh-oh».

## Sonido

Sintetizado desde cero con `numpy`/`scipy` (sin muestras de terceros, sin licencias):
marimba modal, bombo, palmas, shaker, bajo, pads y *whooshes*, con reverberación por
convolución. La música va a 120 BPM y sigue el arco del spot: **si menor** en la pregunta,
**re mayor** cuando entra el producto, tensión en el giro y resolución en re mayor con el logo.
Cada efecto está sincronizado con el fotograma que lo provoca (las 24 cuotas bajan una escala
y se desplazan de izquierda a derecha en el estéreo, como las flechas). Máster a −15 LUFS
integrados, pico verdadero −1 dBFS.

## Reconstruir

Requisitos: Node 18+ con Playwright (Chromium), Python 3 con `numpy` y `scipy`, y `ffmpeg`
con `libx264` y `libmp3lame` (el HTML lleva el audio en MP3, que reproduce cualquier navegador).

```bash
./tools/make.sh            # marcas → audio → fotogramas → MP4 → HTML autocontenido
JOBS=4 ./tools/make.sh     # más páginas de Chromium en paralelo
```

El render promedia submuestras dentro de un obturador de 180° (8 por fotograma y 16 en los
tramos rápidos): desenfoque de movimiento real, como en un programa de animación.

Para revisar fotogramas sueltos: `node tools/render.mjs --stills 2.9,6.5,10.2 --out .stills`.
Para ver la animación en vivo: abre `src/promo.html` (clic para pausar, ← → para buscar,
`?t=9.5` para empezar en un instante).

## Ajustar

- **Tiempos:** la tabla `T` al principio del guion en `src/promo.html`. El audio se regenera a
  partir de las marcas que exporta la propia animación, así que se mantiene sincronizado.
- **Cifras:** `loan(12000, 12, 24)` y `loan(12000, 12, 60)` en el mismo archivo.
- **Sonido:** `tools/audio.py` (instrumentos, niveles y progresión de acordes).

## Créditos

TRAZA · Herramienta académica de Ingeniería Económica · 2026. Tipografía Inter 4.1
© The Inter Project Authors, SIL Open Font License 1.1 (el mismo subconjunto que incorpora TRAZA).
