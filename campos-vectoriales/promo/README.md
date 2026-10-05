# Vídeo promocional · `campos-promo.mp4`

20 s, 1920 × 1080, 30 fps, H.264 + AAC. Música original sintetizada (120 BPM, re menor); el
metraje del producto es el laboratorio real (`entrega/campos-vectoriales.html`) grabado
fotograma a fotograma con sus ganchos de prueba, sin edición ajena.

| Tiempo | Escena |
| --- | --- |
| 0–4 s | Un punto de luz; una onda de partículas recorre un campo de flujo. «Cada punto del espacio / tiene una dirección.» Las estelas se congelan en una rejilla de flechas finas y la cámara se lanza dentro |
| 4–8 s | El laboratorio con su interfaz (helicoidal, partículas, órbita lenta). «Explora el espacio.» Smash zoom a la escena en 6 s: «Flechas. Corriente. Partículas. En 3D.» con **F** = (−y, x, a) |
| 8–12 s | Whip pan a la lluvia con ráfagas desde dentro (vista libre): **F**(x, y, z, t), «El campo cambia con el tiempo. Cada gota sigue ṙ = **F**(**r**, t)», con el t real de cada fotograma |
| 12–14 s | «Entra en el campo.»: vuelo por una hélice del campo helicoidal |
| 14–16 s | Cortes al tiempo: silla giratoria (ω > k), viento giratorio (corriente ≠ trayectoria), rotacional con la rueda de paletas, divergencia (∇·**F** > 0) |
| 16–20 s | Silencio de un cuarto de tiempo, estallido radial (una fuente) y la marca |

## Regenerarlo

Desde `campos-vectoriales/`, con `npm ci` hecho y el HTML de `entrega/` al día:

```bash
node promo/capturar.mjs /tmp/promo/tomas        # metraje real (~40 min con WebGL por software)
node promo/musica.mjs /tmp/promo/musica.wav     # música (unos segundos)
node promo/renderizar.mjs --tomas=/tmp/promo/tomas --fotogramas=/tmp/promo/fotogramas \
  --musica=/tmp/promo/musica.wav --salida=promo/campos-promo.mp4
```

`MUESTRA=1 node promo/capturar.mjs …` graba solo tres fotogramas por toma para revisar
encuadres, y `renderizar.mjs --solo=0,120,…` dibuja fotogramas sueltos del montaje.
