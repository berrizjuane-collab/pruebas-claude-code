// Entradas del contenido: títulos que suben palabra a palabra, bloques y papeles que
// aparecen al entrar en pantalla, cifras que cuentan y anotaciones que se dibujan.

import { estado, cadaCuadro, alMedir } from './reloj.js';
import { miles, sale, $, $$ } from './util.js';

/** Parte un título en palabras enmascaradas. El texto accesible se conserva en aria-label. */
function partirTitulos() {
  for (const h of $$('[data-titulo]')) {
    const texto = h.textContent.trim().replace(/\s+/g, ' ');
    h.setAttribute('aria-label', texto);
    h.textContent = '';
    texto.split(' ').forEach((palabra, i) => {
      const caja = document.createElement('span');
      caja.className = 'pal';
      caja.setAttribute('aria-hidden', 'true');
      const dentro = document.createElement('span');
      dentro.style.setProperty('--i', i);
      dentro.textContent = palabra;
      caja.append(dentro);
      h.append(caja, ' ');
    });
  }
  for (const el of $$('.letras')) {
    const texto = el.textContent;
    el.textContent = '';
    [...texto].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'letra';
      s.style.setProperty('--i', i);
      s.textContent = ch;
      el.append(s);
    });
  }
}

function contar(el) {
  const hasta = Number(el.dataset.cuenta);
  const desde = Number(el.dataset.desde || 0);
  if (estado.quieto) { el.textContent = miles(hasta); return; }
  const dur = 1700 + Math.min(900, Math.abs(hasta - desde) * 0.12);
  const t0 = performance.now();
  const paso = (ahora) => {
    const t = Math.min(1, (ahora - t0) / dur);
    el.textContent = miles(desde + (hasta - desde) * sale(t));
    if (t < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/** Dibuja en cadena las anotaciones de una lámina («hitos»), con un pequeño retardo entre ellas. */
function dibujarHitos(nombre) {
  const svgs = $$(`.escena[data-escena="${nombre}"] .anot`);
  for (const svg of svgs) {
    const visual = $('.anot__visual', svg);
    let i = 0;
    if (visual) { visual.classList.add('visto'); i = 3; }
    for (const g of $$('.anot__hito', svg)) setTimeout(() => g.classList.add('visto'), 380 * i++);
  }
}

export function iniciarTexto() {
  partirTitulos();

  const entrar = new IntersectionObserver((entradas) => {
    for (const en of entradas) {
      if (!en.isIntersecting) continue;
      en.target.classList.add('dentro');
      for (const n of $$('[data-cuenta]', en.target)) contar(n);
      if (en.target.matches('[data-cuenta]')) contar(en.target);
      entrar.unobserve(en.target);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
  for (const el of $$('[data-entra], [data-titulo]')) entrar.observe(el);

  // Las anotaciones se dibujan cuando su plano alcanza el centro de la pantalla. Se comprueba
  // con la posición (y no con un observador) para que también salten si el lector llega más
  // abajo de un salto, sin haber pasado por ese plano.
  let pendientes = $$('[data-hitos]').map((el) => ({ el, y: 0 }));
  alMedir(() => {
    for (const h of pendientes) h.y = h.el.getBoundingClientRect().top + window.scrollY;
  });
  cadaCuadro((e) => {
    if (!pendientes.length) return;
    const linea = e.crudo + e.vh * 0.55;
    pendientes = pendientes.filter((h) => {
      if (h.y > linea) return true;
      dibujarHitos(h.el.dataset.hitos);
      return false;
    });
  });
}
