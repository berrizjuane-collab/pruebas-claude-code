// Ficha de cada lámina y su cámara real (scenes.py del manual: km al este /
// norte de la cumbre, acimut desde el norte, campo de visión horizontal).

export const LAMINAS = {
  fairy:  { n: 1, titulo: 'Fairy Meadows', dato: '3300 m · cara Rakhiot (norte)',
            texto: 'Luz de la mañana. A la derecha, el Pico Ganalo se ve casi tan alto como la cumbre por estar 5 km más cerca.',
            cam: { x: -0.9, y: 16.6, az: 177, fov: 46, lat: '35.3871° N', lon: '74.5793° E', alt: 3319 } },
  rupal:  { n: 2, titulo: 'Campo base, valle de Rupal', dato: '3520 m · cara Rupal (sur)',
            texto: 'Pradera del lado Rupal, zona del campo base Herrligkoffer. 4600 m de pared hasta la cumbre.',
            cam: { x: 4.0, y: -4.95, az: 314, fov: 70, lat: '35.1929° N', lon: '74.6332° E', alt: 3515 } },
  diamir: { n: 3, titulo: 'Campo base del Diamir', dato: '4175 m · cara Diamir (oeste)',
            texto: 'Tarde. Morrena del glaciar Diamir; la cumbre principal al centro y un espolón de la arista Mazeno a la derecha.',
            cam: { x: -7.1, y: 2.2, az: 104, fov: 62, lat: '35.2573° N', lon: '74.5111° E', alt: 4188 } },
  camp1:  { n: 4, titulo: 'Campo 1', dato: '4900 m · ruta Kinshofer',
            texto: 'Al pie del muro Kinshofer, mirando al sur-suroeste: mitad sur de la cara Diamir y arista Mazeno.',
            cam: { x: -3.85, y: 1.8, az: 214, fov: 80, lat: '35.2537° N', lon: '74.5469° E', alt: 4900 } },
  camp2:  { n: 5, titulo: 'Campo 2', dato: '6050 m · ruta Kinshofer',
            texto: 'Puesta de sol sobre el valle del Diamir, con mar de nubes a 4150 m.',
            cam: { x: -2.62, y: 1.8, az: 268, fov: 84, lat: '35.2537° N', lon: '74.5604° E', alt: 6057 } },
  camp3:  { n: 6, titulo: 'Campo 3', dato: '6800 m · ruta Kinshofer',
            texto: 'Noche de luna: la pared norte de la arista Mazeno.',
            cam: { x: -1.95, y: 1.8, az: 214, fov: 80, lat: '35.2537° N', lon: '74.5678° E', alt: 6824 } },
  summit: { n: 7, titulo: 'Cumbre', dato: '8126 m · hacia el noreste',
            texto: 'Meseta de Plata, Silbersattel y Pico Rakhiot bajo la cumbre; mar de nubes a 4100 m.',
            cam: { x: -0.023, y: 0.207, az: 52, fov: 88, lat: '35.2394° N', lon: '74.5889° E', alt: 8128 } },
  mapa:   { n: 8, titulo: 'El macizo', dato: '24 × 25 km · vista cenital',
            texto: 'Lámina nueva para esta web: el mismo pincel sobre el relieve real, visto desde arriba con luz del noroeste.',
            cam: null, ar: 2000 / 2121 },
};

export const ORDEN = ['fairy', 'rupal', 'diamir', 'camp1', 'camp2', 'camp3', 'summit', 'mapa'];

export const lamSrc = (id, w) => id === 'mapa'
  ? `assets/mapa/mapa-${w >= 1600 ? 2000 : 1100}.webp`
  : `assets/laminas/${id}-${w >= 1600 ? 2400 : 1280}.webp`;

// lugares para las etiquetas que el capítulo de las caras pinta sobre cada lámina
export const ETIQUETAS = {
  fairy: ['nanga', 'rakhiot', 'ganalo'],
  diamir: ['nanga', 'norte'],
  rupal: ['nanga'],
  summit: ['plateau', 'sattel', 'rakhiot', 'chongra'],
};

export const NOMBRES_CAMPO = { bc: 'Campo base', c1: 'Campo 1', c2: 'Campo 2', c3: 'Campo 3', c4: 'Campo 4', cumbre: 'Cumbre' };

// cotas de referencia del texto (las de las láminas); el perfil usa las del DEM
export const COTA_CAMPO = { bc: 4175, c1: 4900, muro: 5500, c2: 6050, c3: 6800, c4: 7200, cumbre: 8126 };
