// El escenario: una escena fija por capítulo. Cada cuadro decide qué escenas se ven,
// cuánto ha entrado la siguiente (--w) y dónde mira la cámara de cada lámina.

import { estado, cadaCuadro, alMedir } from './reloj.js';
import { acotar, mezclar, suave, entraYSale, sale, rampa, $$ } from './util.js';

/** Capítulos en orden de lectura; el resto de módulos los consulta. */
export const capitulos = [];
export const escenario = { actual: 0 };

const camaras = new Map();
/** Un módulo puede tomar la cámara de su capítulo: fn(capitulo, estado) → { x, y, s }. */
export const fijarCamara = (id, fn) => camaras.set(id, fn);
export const capitulo = (id) => capitulos.find((c) => c.id === id);

// Cámara por defecto de cada capítulo: fotogramas clave [avance, foco x, foco y, escala].
// El avance va de 0 (el capítulo asoma por abajo) a 1 (ha salido por arriba); el foco es la
// fracción de la lámina que queda en el centro de la pantalla. `estrecha` es para pantallas
// verticales, donde la lámina es mucho más ancha que la ventana y la cámara la recorre.
const CAMARAS = {
  portada:   { ancha: [[0.43, 0.5, 0.36, 1.14], [1, 0.5, 0.52, 1.02]],
               estrecha: [[0.43, 0.5, 0.4, 1.1], [1, 0.5, 0.5, 1.02]] },
  nombre:    { ancha: [[0, 0.45, 0.5, 1.1], [0.2, 0.5, 0.3, 1.02], [0.36, 0.5, 0.3, 1.02], [1, 0.52, 0.42, 1.06]],
               estrecha: [[0, 0.2, 0.5, 1.04], [0.19, 0.23, 0.5, 1.02], [0.25, 0.335, 0.5, 1.02], [0.3, 0.335, 0.5, 1.02],
                          [0.36, 0.612, 0.5, 1.02], [0.5, 0.612, 0.5, 1.02], [1, 0.63, 0.5, 1.06]] },
  baltistan: { ancha: [[0, 0.42, 0.6, 1.12], [1, 0.58, 0.46, 1.02]],
               estrecha: [[0, 0.3, 0.5, 1.02], [0.6, 0.42, 0.5, 1.02], [1, 0.585, 0.5, 1.04]] },
  macizo:    { ancha: [[0, 0.17, 0.5, 1], [1, 0.93, 0.5, 1]], estrecha: [[0, 0.17, 0.5, 1], [1, 0.93, 0.5, 1]] },
  piramide:  { ancha: [[0, 0.5, 0.72, 1.14], [0.34, 0.5, 0.2, 1.02], [0.52, 0.5, 0.2, 1.02], [1, 0.5, 0.32, 1.1]],
               estrecha: [[0, 0.5, 0.5, 1.04], [0.34, 0.6, 0.5, 1.02], [0.52, 0.6, 0.5, 1.02], [1, 0.5, 0.5, 1.06]] },
  ruta:      { ancha: [[0, 0.5, 0.5, 1.02], [1, 0.5, 0.5, 1.02]], estrecha: [[0, 0.6, 0.5, 1.02], [1, 0.6, 0.5, 1.02]] },
  noche:     { ancha: [[0, 0.3, 0.72, 1.2], [0.6, 0.5, 0.5, 1.03], [1, 0.56, 0.4, 1.08]],
               estrecha: [[0, 0.24, 0.5, 1.02], [0.5, 0.45, 0.5, 1.02], [1, 0.62, 0.5, 1.04]] },
  cuello:    { ancha: [[0, 0.36, 0.55, 1.14], [1, 0.56, 0.58, 1.02]],
               estrecha: [[0, 0.22, 0.5, 1.02], [1, 0.68, 0.5, 1.04]] },
  cumbre:    { ancha: [[0, 0.44, 0.7, 1.3], [0.3, 0.47, 0.6, 1.12], [1, 0.435, 0.55, 1.15]],
               estrecha: [[0, 0.39, 0.5, 1.08], [0.5, 0.47, 0.5, 1.02], [1, 0.6, 0.5, 1.04]] },
  memoria:   { ancha: [[0, 0.44, 0.32, 1.14], [1, 0.46, 0.6, 1.1]],
               estrecha: [[0, 0.37, 0.5, 1.04], [0.45, 0.6, 0.5, 1.02], [1, 0.82, 0.5, 1.04]] },
  epilogo:   { ancha: [[0, 0.5, 0.5, 1.02], [1, 0.5, 0.4, 1.12]],
               estrecha: [[0, 0.5, 0.5, 1.02], [1, 0.5, 0.5, 1.1]] },
};

/** ¿La ventana es más alta que ancha (o casi)? Entonces la cámara recorre la lámina. */
export const esVertical = (e) => e.sw / e.sh < 1.15;

export function camaraPorDefecto(c, e) {
  const cfg = CAMARAS[c.id];
  const k = esVertical(e) ? cfg.estrecha : cfg.ancha;
  const p = c.p;
  if (p <= k[0][0]) return { x: k[0][1], y: k[0][2], s: k[0][3] };
  const n = k.length - 1;
  if (p >= k[n][0]) return { x: k[n][1], y: k[n][2], s: k[n][3] };
  let i = 1;
  while (k[i][0] < p) i++;
  const a = k[i - 1], b = k[i];
  const t = suave((p - a[0]) / (b[0] - a[0]));
  return { x: mezclar(a[1], b[1], t), y: mezclar(a[2], b[2], t), s: mezclar(a[3], b[3], t) };
}

// ── medidas ──────────────────────────────────────────────────────────────────
function medir(e) {
  const base = window.scrollY;
  for (const c of capitulos) {
    const r = c.el.getBoundingClientRect();
    c.top = r.top + base;
    c.alto = r.height;
    c.pw = Math.max(e.sw, e.sh * c.ar);
    c.ph = c.pw / c.ar;
    c.lamina.style.width = `${c.pw.toFixed(1)}px`;
    c.lamina.style.height = `${c.ph.toFixed(1)}px`;
    c.lamina.style.setProperty('--ph', `${c.ph.toFixed(1)}px`);
  }
}

// ── carga diferida de las ilustraciones ──────────────────────────────────────
function cargar(c, e) {
  if (c.pedida) return;
  c.pedida = true;
  const img = c.img;
  const anchos = img.dataset.anchos.split(',').map(Number);
  const dpr = e.estrecha ? Math.min(e.dpr, 1.5) : e.dpr;
  const necesario = c.pw * dpr * (c.id === 'ruta' ? 1.5 : 1.1) * 0.85;
  const ancho = anchos.find((a) => a >= necesario) || anchos[anchos.length - 1];
  const url = `${img.dataset.base}-${ancho}.webp`;
  const lista = () => { c.cargada = true; img.classList.add('cargada'); };

  if (img.getAttribute('src')) {
    // La portada ya viene con una versión ligera en el HTML: se muestra en cuanto llega
    // y, si hace falta más resolución, se cambia cuando la grande esté descargada.
    if (img.complete && img.naturalWidth) lista(); else img.addEventListener('load', lista, { once: true });
    if (!img.getAttribute('src').endsWith(`-${ancho}.webp`) && ancho > 1600) {
      const grande = new Image();
      grande.onload = () => { img.src = url; };
      grande.src = url;
    }
    return;
  }
  img.addEventListener('load', lista, { once: true });
  img.addEventListener('error', () => { c.cargada = true; }, { once: true });
  img.src = url;
}

// ── cuadro ───────────────────────────────────────────────────────────────────
function aplicarCamara(c, cam, e) {
  const s = cam.s;
  const ancho = c.pw * s, alto = c.ph * s;
  const mx = (ancho - e.sw) / 2, my = (alto - e.sh) / 2;
  let tx = (0.5 - cam.x) * ancho;
  let ty = (0.5 - cam.y) * alto;
  if (e.puntero.fino && !e.quieto) {           // paralaje leve con el ratón
    tx -= e.puntero.x * Math.min(mx, e.sw * 0.007);
    ty -= e.puntero.y * Math.min(my, e.sh * 0.007);
  }
  tx = acotar(tx, -mx, mx);
  ty = acotar(ty, -my, my);
  c.tx = tx; c.ty = ty; c.s = s;
  const tr = `translate3d(${(tx - c.pw / 2).toFixed(2)}px,${(ty - c.ph / 2).toFixed(2)}px,0) scale(${s.toFixed(4)})`;
  if (tr !== c.tr) { c.tr = tr; c.lamina.style.transform = tr; }
}

function cuadro(e) {
  const zona = e.sh * 0.9;
  let actual = 0;
  for (const c of capitulos) {
    c.w = c.i === 0 ? 0 : 1 - acotar((e.y + e.sh - c.top) / zona);
    c.p = acotar((e.y + e.sh - c.top) / (c.alto + e.sh));
    if (c.w < 1) actual = c.i;
  }
  escenario.actual = actual;

  for (const c of capitulos) {
    const sig = capitulos[c.i + 1];
    const visible = c.w < 1 && (!sig || sig.w > 0);
    if (visible !== c.visible) {
      c.visible = visible;
      c.esc.classList.toggle('visible', visible);
    }
    // Se piden las ilustraciones del capítulo actual y de los dos siguientes.
    if (c.i <= actual + 1 || (c.i === actual + 2 && capitulos[actual + 1].cargada)) cargar(c, e);
    if (!visible) continue;

    const w = e.quieto ? (c.w > 0.5 ? 1 : 0) : 1 - entraYSale(1 - c.w);
    const ws = w.toFixed(4);
    if (ws !== c.ws) {
      c.ws = ws;
      c.esc.style.setProperty('--w', ws);
      c.esc.classList.toggle('plena', w === 0);
    }

    const fn = camaras.get(c.id);
    const cam = (fn && fn(c, e)) || camaraPorDefecto(c, e);
    if (sig && sig.w < 1) cam.s *= 1 + 0.05 * suave(1 - sig.w);                    // empuje de salida
    if (c.i === 0 && !e.quieto) cam.s *= 1 + 0.09 * (1 - sale(rampa(0.1, 3.4, e.t))); // asentamiento inicial
    aplicarCamara(c, cam, e);
  }
}

export function iniciarEscenario() {
  const escenas = new Map($$('.escena').map((el) => [el.dataset.escena, el]));
  $$('.capitulo').forEach((el, i) => {
    const esc = escenas.get(el.dataset.escena);
    const lamina = esc.querySelector('.lamina');
    capitulos.push({
      i, id: el.id, el, esc, lamina,
      img: lamina.querySelector('img'),
      ar: parseFloat(lamina.dataset.ar),
      top: 0, alto: 0, pw: 0, ph: 0,
      w: i ? 1 : 0, p: 0, visible: false, pedida: false, cargada: false,
      alt: Number(el.dataset.alt), altFin: el.dataset.altFin ? Number(el.dataset.altFin) : null,
      lugar: el.dataset.lugar, nieve: Number(el.dataset.nieve || 0), viento: Number(el.dataset.viento || 0),
    });
  });
  alMedir(medir);
  cadaCuadro(cuadro);
}
