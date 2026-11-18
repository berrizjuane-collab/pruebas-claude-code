# Manaslu, la montaña del espíritu

Web *scrollytelling* sobre el Manaslu (8 163 m) con la identidad «Mani»: el scroll es
un ascenso de Samagaon (3 520 m) a la cumbre, con un altímetro que sube contigo.

Abre `index.html` con un servidor local (las pinturas se cargan como texturas WebGL):

```bash
cd manaslu && python3 -m http.server 8000   # y visita http://localhost:8000
```

## Qué hay dentro

- **Fondo pintado en WebGL.** Ocho ilustraciones «pincel seco» en orden de ascenso
  (Samagaon, Campo Base, el macizo, Campos 1–4, Cumbre). Una cámara recorre cada pintura
  según el scroll (zoom y encuadre por *beat*) y las transiciones son una disolución en
  trazos de pincel con borde de tiza, más dos bancos de jirones de la identidad que cruzan
  la pantalla. Nieve procedural en los campos altos y ventisca en la cumbre. Sin WebGL,
  respaldo con dos `<img>` y fundido.
- **Nubes a medida del texto.** Una familia de 36 nubes volumétricas con acabado de tiza
  (`nubes2/`, generada con `nubes-realistas/familia.py`), cada una construida alrededor de un
  área de texto de proporción distinta (de 0,5 a 7,8). La web mide cada texto con la tipografía
  ya cargada, elige la nube de proporción más parecida y la escala para que su área densa
  coincida con la caja del texto: el texto queda centrado y la nube no sobra ni falta. La luz de
  las nubes sigue a la pintura (cálida al alba, azulada de noche) y las etiquetas de los picos
  solo aparecen si no pisan una nube de texto.
- **Anclajes reales.** Picos y campos están proyectados con la misma cámara que pintó cada
  escena sobre el DEM ASTER, así que las etiquetas caen sobre la cima correcta y la ruta
  normal se dibuja siguiendo el relieve.
- **Dos escenas nuevas** creadas con el mismo motor: `samagaon` (pueblo nubri con chorten,
  muro mani, yaks y terrazas de cebada; portada y cultura) y `macizo` (vista aérea desde el
  NE a 7 000 m con mar de nubes en los valles; picos y ruta).

Motor de scroll propio, sin librerías: secciones fijadas con `position: sticky`, una lista
de anclas (`.beat` con `data-shot`, `data-alt`, `data-pins`, `data-route`) e interpolación
suavizada en `requestAnimationFrame`. Respeta `prefers-reduced-motion`.

## Regenerar las ilustraciones

`ilustraciones/codigo/` es la tubería original del paquete de identidad
(ver `ilustraciones/README_reconstruccion.md`) más `extra_scenes.py`, que añade las dos
escenas nuevas y exporta los puntos proyectados.

```bash
cd ilustraciones/codigo && pip install numpy scipy pillow
python3 dem_build.py
python3 scenes.py all 3840 2160 salida/
python3 extra_scenes.py samagaon 3840 2160 salida/00_samagaon.png
python3 extra_scenes.py macizo 3840 2160 salida/00_macizo.png
python3 extra_scenes.py poi 3840 2160 poi.json
```

Cada render 4K tarda en torno a 2 minutos y usa unos 4,5 GB de RAM. Las WebP de `img/` son
derivados a 2560 px (calidad 84) y 1600 px (calidad 82).

## Fuentes de los datos históricos

Himalayan Journal («The Ascent of Manaslu»), Himalayan Database, American Alpine Journal,
The Japan Times (2016), Abenteuer Berg, Andrzej Bargiel, Explorersweb, Mark Horrell y NTNC.
Los enlaces están al pie de la propia web.
