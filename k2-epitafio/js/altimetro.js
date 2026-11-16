// El altímetro del margen: traduce el avance de la lectura a metros sobre el nivel del mar.
// Cada capítulo declara su altitud (data-alt, y data-alt-fin si se sube durante el capítulo);
// entre capítulos se interpola con la misma transición que las escenas.

import { cadaCuadro } from './reloj.js';
import { capitulos, escenario } from './escenario.js';
import { acotar, mezclar, suave, rampa, miles, $ } from './util.js';

const SUELO = 3000, TECHO = 8611;
const propias = new Map();
/** Un módulo puede dictar la altitud de su capítulo (la ruta la calcula a partir de la línea). */
export const fijarAltitud = (id, fn) => propias.set(id, fn);

function altitudDe(c) {
  const fn = propias.get(c.id);
  if (fn) return fn(c);
  if (c.altFin == null) return c.alt;
  return mezclar(c.alt, c.altFin, suave(rampa(0.18, 0.86, c.p)));
}

export function iniciarAltimetro() {
  const cifra = $('#alt-cifra'), lugar = $('#alt-lugar'), cursor = $('#alt-cursor');
  let textoCifra = '', textoLugar = '', pos = '';

  cadaCuadro(() => {
    const c = capitulos[escenario.actual];
    const previo = capitulos[c.i - 1];
    let alt = altitudDe(c);
    let nombre = c.lugar;
    if (previo && c.w > 0) {
      alt = mezclar(altitudDe(previo), alt, suave(1 - c.w));
      if (c.w > 0.5) nombre = previo.lugar;
    }
    const t = miles(alt);
    if (t !== textoCifra) { textoCifra = t; cifra.textContent = t; }
    if (nombre !== textoLugar) { textoLugar = nombre; lugar.textContent = nombre; }
    const p = acotar((alt - SUELO) / (TECHO - SUELO)).toFixed(4);
    if (p !== pos) { pos = p; cursor.style.setProperty('--p', p); }
  });
}
