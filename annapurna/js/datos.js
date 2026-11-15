/* Annapurna — datos de la puesta en escena.
   Qué pintura va en cada bloque, cómo se mueve la cámara sobre ella y la
   geografía del mapa de la ruta. Sin lógica: solo lo que se puede retocar. */
window.Annapurna = (function () {
  'use strict';

  /* Cada pintura en sus dos formatos; de menor a mayor resolución. */
  var PINTURAS = {
    hero:      { ancha: ['img/santuario-hero-1280.webp', 'img/santuario-hero-2560.webp'], alta: ['img/santuario-movil-1080.webp'], aire: 'polen' },
    santuario: { ancha: ['img/santuario-1280.webp', 'img/santuario-2560.webp'],           alta: ['img/santuario-movil-1080.webp'], aire: 'polen' },
    aerial:    { ancha: ['img/aerial-1280.webp', 'img/aerial-2560.webp'],                 alta: ['img/aerial-movil-1080.webp'],    aire: 'ventisca' },
    north:     { ancha: ['img/north-1280.webp', 'img/north-2560.webp'],                   alta: ['img/north-movil-1080.webp'],     aire: 'nieve' },
    ridge:     { ancha: ['img/ridge-1280.webp', 'img/ridge-2560.webp'],                   alta: ['img/ridge-movil-1080.webp'],     aire: 'ventisca' },
    kali:      { ancha: ['img/kali-1280.webp', 'img/kali-2560.webp'],                     alta: ['img/kali-movil-1080.webp'],      aire: 'polen' },
    poon:      { ancha: ['img/poon-1280.webp', 'img/poon-2560.webp'],                     alta: ['img/poon-movil-1080.webp'],      aire: 'petalos' },
    mapa:      { ancha: ['img/mapa-1280.webp', 'img/mapa-2560.webp', 'img/mapa-3840.webp'], alta: ['img/mapa-movil-1080.webp', 'img/mapa-movil-1620.webp'], aire: null },
    night:     { ancha: ['img/night-1280.webp', 'img/night-2560.webp'],                   alta: ['img/night-movil-1080.webp'],     aire: 'copos' }
  };

  /* Cámaras: fotogramas clave [avance del bloque, centro x, centro y, zoom].
     x e y son fracciones de la pintura (0,0 arriba a la izquierda); zoom 1 = la
     pintura cubre la pantalla. Al abrir cada capítulo la cámara mira al cielo,
     porque ahí vive el texto; luego baja hacia el primer plano. Con
     `titulo: true` el primer fotograma se mantiene mientras el título del
     capítulo está en pantalla, y el avance empieza a contar después. */
  var CAMARAS = {
    'b-portada': {
      ancha: [[.5, .5, 0, 1.18], [1, .5, .14, 1.24]],
      alta:  [[.5, .5, 0, 1], [1, .5, .06, 1.12]]
    },
    'b-etimo': {
      ancha: [[0, .5, .14, 1.24], [.2, .5, .12, 1.4], [.84, .5, .12, 1.4], [1, .5, .4, 1.1]],
      alta:  [[0, .5, .06, 1.12], [.2, .5, .1, 1.42], [.84, .5, .1, 1.42], [1, .5, .22, 1.16]]
    },
    'b-diosa': {
      ancha: [[0, .5, .36, 1.04], [.5, .6, .55, 1.14], [1, .64, .74, 1.34]],
      alta:  [[0, .5, .22, 1.16], [.4, .5, .5, 1.06], [1, .6, .86, 1.5]]
    },
    'b-macizo': {
      titulo: true,
      ancha: [[0, .5, .2, 1.14], [.22, .46, .5, 1.02], [.45, .5, .5, 1], [1, .5, .56, 1.08]],
      alta:  [[0, .5, .1, 1.16], [.22, .5, .45, 1.02], [.45, .5, .2, 1], [1, .56, .36, 1.08]]
    },
    'b-cumbre': {
      titulo: true,
      ancha: [[0, .38, .2, 1.2], [.3, .42, .5, 1.04], [1, .4, .72, 1.22]],
      alta:  [[0, .5, .1, 1.2], [.3, .5, .46, 1.02], [1, .44, .8, 1.34]]
    },
    'b-pared': {
      titulo: true,
      ancha: [[0, .3, .1, 1.46], [.3, .5, .5, 1.04], [1, .6, .66, 1.26]],
      alta:  [[0, .46, .08, 1.2], [.35, .5, .46, 1.02], [1, .56, .74, 1.36]]
    },
    'b-cultura': {
      titulo: true,
      ancha: [[0, .3, .1, 1.42], [.3, .42, .5, 1.04], [1, .36, .68, 1.24]],
      alta:  [[0, .5, .1, 1.2], [.3, .5, .46, 1.02], [1, .42, .76, 1.3]]
    },
    'b-ruta': {
      titulo: true,
      ancha: [[0, .5, .2, 1.14], [.4, .44, .5, 1.04], [1, .36, .6, 1.2]],
      alta:  [[0, .5, .1, 1.2], [.4, .5, .46, 1.02], [1, .64, .62, 1.24]]
    },
    'b-noche': {
      titulo: true,
      ancha: [[0, .3, .1, 1.36], [.6, .5, .5, 1.02], [1, .5, .5, 1]],
      alta:  [[0, .5, .1, 1.2], [.55, .5, .46, 1.02], [1, .5, .5, 1]]
    }
  };

  /* El mapa pintado (tools/pintar_mapa.py). Mismos encuadres que allí. */
  var MAPA = {
    marco: {
      ancha: { lon: [83.50, 84.36], lat: [28.2700, 28.6970] },
      alta:  { lon: [83.665, 83.971], lat: [28.1770, 28.7640] }
    },
    /* El sendero, de Nayapul al campo base (longitud, latitud). */
    traza: [
      [83.775, 28.305], [83.768, 28.314], [83.757, 28.330], [83.745, 28.345], [83.735, 28.358],
      [83.722, 28.375], [83.710, 28.390], [83.700, 28.400], [83.690, 28.400], [83.701, 28.402],
      [83.722, 28.405], [83.745, 28.407], [83.770, 28.400], [83.786, 28.411], [83.800, 28.409],
      [83.817, 28.415], [83.829, 28.428], [83.850, 28.445], [83.860, 28.458], [83.873, 28.476],
      [83.888, 28.495], [83.896, 28.510], [83.900, 28.523], [83.890, 28.528], [83.878, 28.530]
    ],
    /* Rótulos: [nombre, altitud, longitud, latitud, dónde: 'todo' | 'ancha' | 'alta', lado del texto] */
    rotulos: [
      ['Annapurna I', 8091, 83.820, 28.596, 'todo', 'arriba'],
      ['Annapurna Sur', 7219, 83.806, 28.518, 'todo', 'izq'],
      ['Hiunchuli', 6441, 83.850, 28.511, 'todo', 'abajo'],
      ['Machapuchare', 6993, 83.949, 28.495, 'todo', 'der'],
      ['Gangapurna', 7455, 83.963, 28.605, 'todo', 'arriba'],
      ['Pico Tilicho', 7134, 83.805, 28.685, 'todo', 'arriba'],
      ['Annapurna III', 7555, 83.990, 28.585, 'ancha', 'der'],
      ['Annapurna II', 7937, 84.122, 28.536, 'ancha', 'arriba'],
      ['Dhaulagiri', 8167, 83.515, 28.690, 'ancha', 'abajo']
    ],
    lugares: [
      ['Lago Phewa · Pokhara', 83.925, 28.196, 'alta'],
      ['Lago Tilicho', 83.857, 28.716, 'alta'],
      ['Kali Gandaki', 83.628, 28.470, 'ancha'],
      ['Manang', 84.022, 28.682, 'ancha']
    ]
  };

  /* Banderas de oración: azul, blanco, rojo, verde, amarillo. Siempre en ese orden. */
  var BANDERAS = ['#3F5F9E', '#F0ECE0', '#B8343F', '#4E8055', '#E2B13C'];

  var NEPALI = '०१२३४५६७८९';
  function enNepali(n) {
    return String(n).replace(/\d/g, function (d) { return NEPALI[+d]; });
  }

  return { PINTURAS: PINTURAS, CAMARAS: CAMARAS, MAPA: MAPA, BANDERAS: BANDERAS, enNepali: enNepali };
})();
