// La noche del Hombro: visión en túnel. A medida que avanza el capítulo, la oscuridad se
// cierra alrededor de un círculo de luz que sigue al puntero, como el haz de un frontal.
// En pantallas táctiles el haz deambula solo.

import { capitulo } from './escenario.js';
import { cadaCuadro } from './reloj.js';
import { mezclar, suave, rampa, $ } from './util.js';

export function iniciarNoche() {
  const cap = capitulo('noche');
  const tunel = $('#tunel');
  let ultimo = '';

  cadaCuadro((e) => {
    if (!cap.visible) return;
    const cierre = suave(rampa(0.22, 0.52, cap.p)) * (1 - suave(rampa(0.8, 0.97, cap.p)));
    if (e.quieto || cierre < 0.004) {
      if (ultimo !== '0') { ultimo = '0'; tunel.style.setProperty('--o', '0'); }
      return;
    }
    let mx, my;
    if (e.puntero.fino) {
      mx = 50 + e.puntero.x * 50;
      my = 50 + e.puntero.y * 50;
    } else {
      mx = 50 + Math.sin(e.t * 0.31) * 22;
      my = 46 + Math.sin(e.t * 0.23 + 1.3) * 14;
    }
    const clave = cierre.toFixed(3) + '|' + mx.toFixed(1) + '|' + my.toFixed(1);
    if (clave === ultimo) return;
    ultimo = clave;
    tunel.style.setProperty('--o', cierre.toFixed(3));
    tunel.style.setProperty('--r', mezclar(46, 13, cierre).toFixed(1));
    tunel.style.setProperty('--mx', mx.toFixed(1) + '%');
    tunel.style.setProperty('--my', my.toFixed(1) + '%');
  });
}
