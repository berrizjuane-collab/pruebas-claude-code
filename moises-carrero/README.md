# Moisés Carrero — landing promocional

Landing page de una sola página para **Moisés Carrero**, atleta de powerlifting
(WRPF, Mérida, Venezuela) y entrenador online 1:1. El objetivo del sitio es
presentar su palmarés y llevar visitas a su Instagram, que es su único canal de
contacto.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | El sitio completo: HTML, CSS, JS y tipografías, todo en un archivo. |
| `og.jpg` | Imagen 1200×630 para compartir en WhatsApp/Instagram/X. |
| `img/hero.jpg` | Foto de fondo del hero (competencia, Power Cartel Meet). |
| `img/moises-podium.jpg` | Foto de podio con medalla y certificado (Iberoamericano, Medellín). |

No hay build, no hay dependencias, no hay peticiones de red. Es una carpeta
estática que se abre con doble clic.

## Previsualizar

```bash
# basta con abrirlo
xdg-open index.html          # o: open index.html   (macOS)

# o servirlo, si prefieres una URL
python3 -m http.server 8000 --directory .
# → http://localhost:8000
```

## Desplegar

Sirve la carpeta tal cual en cualquier hosting estático (GitHub Pages, Netlify,
Vercel, Cloudflare Pages). Sube `index.html`, `og.jpg` y la carpeta `img/`
juntos, manteniendo esta misma estructura relativa.

### Antes de publicar

1. **Confirmar la edad con Moisés.** El sitio dice *18 años* en dos lugares —
   el párrafo del hero y la ficha del atleta. Sus registros de competencia más
   recientes en OpenPowerlifting lo ubican con 19 desde septiembre de 2025.
   Busca `18 años` en `index.html` y ajústalo si hace falta.
2. **Poner la URL absoluta en `og:image`.** Ahora es relativa (`og.jpg`), que
   funciona en local pero no todos los scrapers la resuelven. Cámbiala por la
   definitiva en las cuatro etiquetas del `<head>`:
   ```html
   <meta property="og:image" content="https://tu-dominio.com/og.jpg">
   <meta name="twitter:image" content="https://tu-dominio.com/og.jpg">
   ```
   Conviene añadir también `<meta property="og:url" content="https://tu-dominio.com/">`.
3. **Revisar los testimonios.** Los de la sección *Resultados* están
   parafraseados a partir de su contenido de Instagram, no son citas
   literales. Vale la pena que él los valide.
4. **Confirmar que Moisés está de acuerdo con las dos fotos usadas.** Son
   suyas, publicadas por él, pero al ser su propia landing vale la pena que
   las apruebe antes de publicar — sobre todo la del hero, que ahora es la
   primera imagen que ve cualquiera que entre al sitio.

## De dónde salen los datos

Los tres resultados de competencia (555 → 645.5 → 657.5 kg) y los récords
personales vienen de sus registros en OpenPowerlifting bajo la federación WRPF.
Están además en una tabla accesible dentro de la propia página: el botón
*«Ver los datos en tabla»* bajo el gráfico de progresión.

## De dónde salen las fotos

`img/hero.jpg` y `img/moises-podium.jpg` son recortes de fotos reales de
competencia que Moisés publicó en su propio Instagram (@moises.coaching) — no
son fotografía profesional ni imágenes generadas. Se extrajeron a resolución
completa (1496×3256, la de la cámara del teléfono, no la de una captura de
pantalla) desde el PDF de referencia del proyecto, se recortaron para quitar
la interfaz de Instagram y se les quitó el indicador de carrusel ("1/8",
"1/5") que quedaba visible en la esquina. También se les quitaron los
metadatos EXIF al guardarlas. El resto de lo visual —iconos, texturas,
gráficos— sigue siendo SVG y CSS escritos a mano.

- **Tipografías incrustadas** en base64 (subconjunto latino): *Anton* y
  *Barlow Condensed*, ambas bajo [SIL Open Font License 1.1](https://scripts.sil.org/OFL).
  Se incrustaron en vez de enlazar Google Fonts para que no haya peticiones
  bloqueantes ni dependencia de terceros. El texto corrido usa la tipografía del
  sistema.
- **Paleta del gráfico** (oro / azul / rojo, que son a la vez los colores de los
  discos reglamentarios y los de la bandera): validada para daltonismo,
  contraste y separación entre series antes de fijarla.
- **Movimiento.** Contadores, revelados, parallax del hero y el gráfico ligado
  al scroll se desactivan por completo con `prefers-reduced-motion: reduce`, y
  todo queda en su estado final.
- **Sin JavaScript** la página se ve entera: los revelados y el gráfico caen a su
  estado final en vez de quedarse en blanco.

### Regenerar `og.jpg`

Se generó renderizando una plantilla HTML con Chromium headless a 1200×630. Si
cambian los números, lo más rápido es rehacerla con el mismo método (Playwright
o `chromium --headless --screenshot`), o editar directamente la imagen.
