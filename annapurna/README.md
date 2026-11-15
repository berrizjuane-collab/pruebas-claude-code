# Annapurna

Web *scrollytelling* sobre el macizo del Annapurna: el nombre, las cumbres, la
primera ascensión a un ochomil, la gente que vive a su sombra y el camino al
Santuario. Sigue la identidad visual Annapurna v1.0 (paleta, Cormorant Garamond
y Tiro Devanagari Hindi, grano de papel) y usa sus ocho pinturas como fondo
permanente de la página.

No tiene dependencias ni paso de compilación: HTML, CSS y JavaScript a mano.

```bash
cd annapurna
python3 -m http.server 8000     # y abre http://localhost:8000
```

Hace falta servirla (no basta el doble clic): al abrir el archivo directamente,
el navegador no deja subir las imágenes a WebGL y la página cae a su versión
sencilla, con fundidos en lugar de pinceladas.

## Cómo está contada

| Capítulo | Pintura de fondo | Qué pasa al bajar |
|---|---|---|
| Portada | Santuario, de día | El telón se levanta y la pintura entra a pinceladas, de abajo arriba |
| El nombre | Santuario | La palabra अन्नपूर्ण se abre en *anna* y *pūrṇa* y vuelve a cerrarse; después, la diosa y los cuatro ríos |
| El macizo | Vista aérea | Un perfil de diez cumbres dibujado a escala que el scroll recorre de oeste a este |
| La cumbre | Campo base norte | 8091 m y la crónica de 1950, 1970, 1978 y 1987 |
| Las vías | La arista | Las tres vías y el riesgo en números |
| Cultura | Valle del Kali Gandaki | Pueblos, banderas de oración, el Santuario, Muktinath y el área de conservación |
| La ruta | Poon Hill al amanecer y **mapa pintado** | El sendero se dibuja de Nayapul al campo base; la cámara lo sigue etapa a etapa |
| Noche | Santuario, de noche | La cita de Herzog y el cierre |

## Cómo está hecha

- **`index.html`** — todo el contenido, legible sin JavaScript (las listas de
  cumbres y de etapas están en el HTML; el script las convierte en gráfico y mapa).
- **`marca.css`** — la hoja de la identidad visual, tal cual venía en el kit.
- **`css/annapurna.css`** — lo propio de esta página.
- **`js/datos.js`** — lo que se puede retocar sin leer código: qué pintura va en
  cada bloque, los fotogramas clave de la cámara y la geografía del mapa.
- **`js/escenario.js`** — el fondo. Un único `<canvas>` WebGL fijo dibuja la
  pintura que toca con una cámara que se desplaza sobre ella. Entre dos
  pinturas no hay fundido: la nueva entra por pasadas de brocha con el borde
  roto del pincel seco (una textura de cerdas decide qué píxeles «cubre ya» la
  pintura). Las pinturas no se filtran ni se desenfocan nunca; solo se encuadran.
- **`js/aire.js`** — motas por delante de la pintura: polen, nieve, ventisca,
  pétalos de rododendro. Pocas y pequeñas, para que parezcan grano que se mueve.
- **`js/annapurna.js`** — el guion. Un solo bucle lee la posición de la página y
  de ahí sale todo: pintura, cámara y el avance de cada pieza fijada. No se
  secuestra el scroll; se suavizan los valores que dependen de él.

Una analogía para orientarse: la página es un teatro de papel. Las pinturas son
los decorados del fondo, que un tramoyista cambia a brochazos; el texto son
cartelas que suben por delante; y el scroll es la manivela que lo mueve todo a
la vez. Si sueltas la manivela, todo se para donde está.

### Cuando algo falta

| Situación | Qué se ve |
|---|---|
| Sin WebGL, o solo por software | Las mismas pinturas como `<img>`, con la misma cámara y fundidos entre ellas |
| «Reducir movimiento» activado | Sin partículas ni entradas animadas; las transiciones son fundidos y el scroll no se suaviza |
| Sin JavaScript | Cada bloque lleva su pintura pegada detrás y todo el texto está a la vista |
| Pantalla vertical | Las versiones verticales de las pinturas y otro encuadre del mapa |

Para forzar WebGL aunque el navegador lo desaconseje (depuración): `?gl=forzar`.

## El mapa de la ruta

El kit no traía ninguna imagen para la ruta, así que el mapa se pinta por
código: `tools/pintar_mapa.py` (NumPy y Pillow).

```bash
python3 tools/pintar_mapa.py            # los dos encuadres y la textura de brocha
python3 tools/pintar_mapa.py horizontal # solo img/mapa-3840/2560/1280.webp
```

No usa datos de elevación. Parte de un esqueleto escrito a mano con las
coordenadas reales de cumbres, aristas, ríos y lagos; les hace crecer espolones,
deduce el relieve, lo ilumina desde el noroeste y lo cubre con unas ochenta mil
pinceladas orientadas ladera abajo, con el grano de papel oscuro de las
pinturas. Es un dibujo para orientarse en la página; no sirve para caminar. El
sendero, las paradas y los rótulos no están en la imagen: los dibuja la página
encima, en SVG, con el mismo encuadre (`MAPA` en `js/datos.js`).

## Datos

Alturas y fechas según la Himalayan Database, el Departamento de Parques
Nacionales y Conservación de la Vida Silvestre de Nepal y las crónicas de las
expediciones. Las cifras de riesgo son las de marzo de 2012 (191 ascensiones,
61 muertes) y las de comienzos de 2025 (559 y 75). Las altitudes de las aldeas
del trekking varían unos metros de una fuente a otra.

## Licencias

Las tipografías Cormorant Garamond y Tiro Devanagari Hindi se distribuyen bajo
SIL Open Font License 1.1 (`fonts/OFL-*.txt`). Las ilustraciones pertenecen a la
identidad visual Annapurna.
