// Cabecera: marca el capítulo en curso, se esconde al bajar y vuelve al subir.
// Los enlaces internos no recorren diez pantallas de golpe: si el destino está lejos,
// la página funde a Noche, salta y vuelve a abrir.

import { estado, cadaCuadro } from './reloj.js';
import { capitulos } from './escenario.js';
import { $, $$ } from './util.js';

// Capítulos sin entrada propia en el menú se agrupan bajo la más cercana.
const GRUPO = { noche: 'ruta', cuello: 'ruta', epilogo: 'memoria' };

export function iniciarCabecera() {
  const cabecera = $('.cabecera');
  const enlaces = new Map($$('.cabecera__nav a').map((a) => [a.getAttribute('href').slice(1), a]));
  const corte = $('#corte');
  let marcado = null, oculta = false, yPrevio = 0, saltando = false;

  cadaCuadro((e) => {
    // capítulo cuyo arranque ya pasó la mitad de la pantalla
    let id = null;
    for (const c of capitulos) if (c.top <= e.crudo + e.vh * 0.5) id = c.id;
    id = GRUPO[id] || id;
    if (id !== marcado) {
      marcado = id;
      for (const [clave, a] of enlaces) {
        const actual = clave === id;
        a.classList.toggle('actual', actual);
        if (actual) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      }
    }
    const dy = e.crudo - yPrevio;
    yPrevio = e.crudo;
    let nueva = oculta;
    if (e.crudo < e.vh * 0.4 || dy < -3) nueva = false; else if (dy > 3 && !saltando) nueva = true;
    if (cabecera.contains(document.activeElement)) nueva = false;
    if (nueva !== oculta) {
      oculta = nueva;
      cabecera.classList.toggle('oculta', oculta);
    }
  });

  const irA = (destino) => {
    const y = destino.getBoundingClientRect().top + window.scrollY;
    const lejos = Math.abs(y - window.scrollY) > estado.vh * 2.4;
    if (!lejos || estado.quieto) {
      window.scrollTo({ top: y, behavior: estado.quieto ? 'auto' : 'smooth' });
      return;
    }
    saltando = true;
    corte.classList.add('cerrado');
    setTimeout(() => {
      window.scrollTo({ top: y, behavior: 'auto' });
      estado.y = y;                       // sin inercia: se abre ya en el sitio
      setTimeout(() => { corte.classList.remove('cerrado'); saltando = false; }, 180);
    }, 340);
  };

  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href^="#"]');
    if (!a) return;
    const destino = document.getElementById(a.getAttribute('href').slice(1));
    if (!destino) return;
    ev.preventDefault();
    irA(destino);
    try { history.replaceState(null, '', a.getAttribute('href')); } catch (_) { /* sin historial en este marco */ }
    if (destino.id !== 'portada') destino.setAttribute('tabindex', '-1');
    destino.focus({ preventScroll: true });
  });

}
