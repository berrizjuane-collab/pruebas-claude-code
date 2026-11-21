// La panorámica de Concordia: mientras el lector baja, la cámara gira de norte a sur
// deteniéndose en cada pico. El marco (brújula y ficha) queda fijo; los rótulos van
// pegados a la lámina.

import { alMedir } from './reloj.js';
import { capitulo, fijarCamara } from './escenario.js';
import { acotar, mezclar, suave, rampa, porTramos, $, $$ } from './util.js';

// Picos de izquierda a derecha: clave, posición horizontal de la cumbre en la lámina y
// rumbo aproximado desde Concordia, en pasos de la cinta de la brújula (0 = N, 1 = NE, 2 = E…).
const PICOS = [
  ['k2', 0.17, 0],
  ['broad', 0.365, 1],
  ['g2', 0.468, 1.7],
  ['g4', 0.582, 2],
  ['bkangri', 0.702, 3],
  ['chogolisa', 0.7752, 4],
  ['mitre', 0.928, 5],
];
const PAUSA = 0.56;   // fracción de cada tramo en que la cámara se queda quieta sobre el pico

export function iniciarPanoramica() {
  const cap = capitulo('macizo');
  const pano = $('#pano');
  const marco = $('.pano__marco', pano);
  const fichas = new Map($$('.picos__ficha').map((el) => [el.dataset.pico, el]));
  const rotulos = new Map($$('.pico', cap.esc).map((el) => [el.dataset.pico, el]));
  const velo = $('.velo--pie', cap.esc);
  const us = PICOS.map((p) => p[1]);
  const rumbos = PICOS.map((p) => p[2]);
  const n = PICOS.length;

  let top = 0, alto = 1, activo = -1, q = 0, x = us[0];

  alMedir(() => {
    const r = pano.getBoundingClientRect();
    top = r.top + window.scrollY;
    alto = r.height;
  });

  fijarCamara('macizo', (c, e) => {
    const crudo = (e.y - top) / Math.max(1, alto - e.sh);
    q = acotar(crudo);
    // de pico en pico: pausa, giro, pausa…
    const f = q * n;
    const k = Math.min(n - 1, Math.floor(f));
    const local = f - k;
    const sig = Math.min(n - 1, k + 1);
    x = mezclar(us[k], us[sig], suave(rampa(PAUSA, 1, local)));
    const nuevo = local > 0.5 + PAUSA / 2 ? sig : k;

    // el marco solo se enciende mientras la panorámica está anclada
    const hud = suave(rampa(-0.035, 0.01, crudo)) * (1 - suave(rampa(1.0, 1.04, crudo)));
    marco.style.setProperty('--hud', hud.toFixed(3));
    marco.style.setProperty('--q', q.toFixed(4));
    velo.style.setProperty('--velo', hud.toFixed(3));
    c.esc.classList.toggle('rotulada', hud > 0.5);

    const mostrado = hud > 0.5 ? nuevo : -1;
    if (mostrado !== activo) {
      activo = mostrado;
      PICOS.forEach(([clave], i) => {
        fichas.get(clave).classList.toggle('activa', i === activo);
        rotulos.get(clave).classList.toggle('activo', i === activo);
      });
    }
    // brújula: el rumbo sigue al centro real de la pantalla
    const medio = e.sw / (2 * c.pw);
    const centro = acotar(x, medio, 1 - medio);
    marco.style.setProperty('--bx', (porTramos(us, rumbos, centro) * 33.3333).toFixed(2));

    return { x, y: 0.5, s: 1 };
  });
}
