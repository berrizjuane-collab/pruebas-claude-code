/* =====================================================================
   NIGHTFALL · compositor del vídeo promocional
   Cada fotograma se dibuja en función del tiempo (render(f)), sin animaciones en tiempo real:
   el mismo fotograma sale siempre igual. Dos formatos: ?formato=9x16 (1080×1920) y 16x9.
   Rejilla musical: 128 BPM, 16 compases = 30 s (la música está en musica.mjs).
   ===================================================================== */
'use strict';

const PARAM = new URLSearchParams(location.search);
const FORMATO = PARAM.get('formato') === '16x9' ? '16x9' : '9x16';
const HOR = FORMATO === '16x9';
const W = HOR ? 1920 : 1080, H = HOR ? 1080 : 1920;
const FPS = 60, DUR = 30, BPM = 128, BEAT = 60 / BPM, BAR = BEAT * 4, S16 = BEAT / 4;
const T = (c, b = 1, s = 0) => ((c - 1) * 4 + (b - 1)) * BEAT + s * S16;
/** Los cortes caen en la rejilla de 30 fps (fotograma par a 60) y un pelo antes del golpe. */
const Q = (t) => Math.floor(t * 30 + 1e-6) / 30;
const ACIDO = '#CCFF00', ROSA = '#FF3399', VIOLETA = '#6600FF', MAGENTA = '#FF0099', CREMA = '#F6F3EC';
const M = HOR ? 96 : 72;
/** Zona segura vertical (Reels/TikTok): el texto importante va entre estas alturas. */
const SUP = HOR ? H * 0.08 : H * 0.14, INF = HOR ? H * 0.92 : H * 0.79;

// ------------------------------------------------------------------ utilidades
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, u) => a + (b - a) * u;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  outCubic: (u) => 1 - (1 - u) ** 3,
  outQuint: (u) => 1 - (1 - u) ** 5,
  outExpo: (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u)),
  inExpo: (u) => (u <= 0 ? 0 : 2 ** (10 * u - 10)),
  inCubic: (u) => u * u * u,
  inOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  inOutExpo: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2),
  outBack: (u) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2; },
  suave: (u) => u * u * (3 - 2 * u),
};
function azar(semilla) {
  let a = (semilla * 2654435761) >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

function el(tag, cls, padre, css) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (css) Object.assign(e.style, css);
  if (padre) padre.appendChild(e);
  return e;
}
const px = (v) => `${v}px`;

const escenario = document.getElementById('escenario');
Object.assign(escenario.style, { width: px(W), height: px(H) });
const medidor = el('div', '', document.body, { position: 'absolute', left: '-99999px', top: '0', whiteSpace: 'nowrap' });
function anchoTexto(txt, clase, tam) { medidor.className = clase; medidor.style.fontSize = px(tam); medidor.textContent = txt; return medidor.getBoundingClientRect().width; }
const ctxMedida = document.createElement('canvas').getContext('2d');
/** Alto real de los glifos dentro de una caja de line-height 1: desde el borde superior de la caja. */
function glifos(txt, fuente, tam) {
  ctxMedida.font = `${fuente.replace('{t}', tam)}`;
  const m = ctxMedida.measureText(txt);
  const base = (tam - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
  return { arriba: base - m.actualBoundingBoxAscent, abajo: base + m.actualBoundingBoxDescent };
}
/** Tamaño de letra para que `txt` ocupe `ancho` px (con tope). */
function ajustar(txt, clase, ancho, max = 9999) { return Math.min(max, (100 * ancho) / anchoTexto(txt, clase, 100)); }

// ------------------------------------------------------------------ recursos
const IMG = {};
const TOMAS = {};
async function cargarRecursos() {
  const cat = await (await fetch('recursos/catalogo.json')).json();
  await Promise.all(Object.keys(cat).filter((n) => !n.startsWith('mapa_caja')).map(async (n) => {
    const im = new Image(); im.src = `recursos/${n}.webp`; await im.decode(); IMG[n] = im;
  }));
  const nombres = HOR
    ? ['escritorio_portada', 'escritorio_scroll', 'escritorio_mapa', 'escritorio_mezclador', 'escritorio_polaroids', 'escritorio_agenda', 'escritorio_carta', 'movil_portada', 'movil_scroll']
    : ['movil_portada', 'movil_scroll', 'movil_mapa', 'movil_mezclador', 'movil_polaroids', 'movil_agenda', 'movil_carta', 'escritorio_mezclador'];
  await Promise.all(nombres.map(async (n) => { TOMAS[n] = new Toma(n, await (await fetch(`/tomas/${n}/meta.json`)).json()); }));
  await document.fonts.load('900 100px "NF Cabinet"');
  await document.fonts.load('800 100px Montserrat');
  await document.fonts.load('400 100px "NF Anton"');
}

class Toma {
  constructor(nombre, meta) { this.nombre = nombre; this.meta = meta; this.n = meta.fotogramas; this.vw = meta.viewport.width; this.vh = meta.viewport.height; }
  url(ft) { return `/tomas/${this.nombre}/${String(clamp(Math.round(ft * 60), 0, this.n - 1)).padStart(4, '0')}.jpg`; }
  caja(sel) { return (this.meta.cajas || {})[sel]; }
}
const pendientes = [];
function fijarImagen(img, url) {
  if (img.dataset.url === url) return;
  img.dataset.url = url;
  img.src = url;
  pendientes.push(img.decode().catch(() => {}));
}

/** Una toma recortada a `fuente` (px CSS del viewport grabado) dentro de `caja` (px del vídeo). */
class Vista {
  constructor(padre, toma, caja, fuente = null, estilo = {}) {
    this.toma = toma; this.caja = caja; this.fuente = fuente || { x: 0, y: 0, w: toma.vw, h: toma.vh };
    this.div = el('div', 'toma', padre, { left: px(caja.x), top: px(caja.y), width: px(caja.w), height: px(caja.h), ...estilo });
    this.img = el('img', '', this.div);
    this.k = 1; this.x0 = 0; this.y0 = 0;
  }
  /** ft: segundos de la toma; zoom alrededor de `foco` (fracción de la fuente). */
  pintar(ft, zoom = 1, foco = [0.5, 0.5]) {
    const { x: sx, y: sy, w: sw, h: sh } = this.fuente, { w: dw, h: dh } = this.caja;
    const k = Math.max(dw / sw, dh / sh) * zoom;
    const fx = sx + sw * foco[0], fy = sy + sh * foco[1];
    this.k = k; this.x0 = dw * foco[0] - fx * k; this.y0 = dh * foco[1] - fy * k;
    Object.assign(this.img.style, { width: px(this.toma.vw * k), height: px(this.toma.vh * k), left: px(this.x0), top: px(this.y0) });
    fijarImagen(this.img, this.toma.url(ft));
  }
  /** Punto del viewport grabado → px dentro de la caja. */
  punto(x, y) { return [this.x0 + x * this.k, this.y0 + y * this.k]; }
}

// ------------------------------------------------------------------ semitono (como la web, a 45°)
class Trama {
  constructor(im, { ganancia = 1.15, gamma = 1 } = {}) {
    this.im = im;
    // las fotos del PDF ya vienen tramadas: se reducen y difuminan para quitar esa trama (y el moaré)
    const esc = Math.min(1, 420 / Math.max(im.naturalWidth, im.naturalHeight));
    const w = (this.w = Math.max(1, Math.round(im.naturalWidth * esc))), h = (this.h = Math.max(1, Math.round(im.naturalHeight * esc)));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.filter = `blur(${Math.max(0.6, 1.1 * esc * 2)}px)`;
    x.drawImage(im, 0, 0, w, h);
    x.filter = 'none';
    const d = x.getImageData(0, 0, w, h).data;
    this.L = new Float32Array(w * h); this.A = new Uint8Array(w * h);
    const hist = new Uint32Array(256);
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      const l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      this.A[i] = d[i * 4 + 3]; this.L[i] = l / 255;
      if (this.A[i] > 128) { hist[l | 0]++; n++; }
    }
    let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc < n * 0.02) lo = v; if (acc < n * 0.985) hi = v; }
    lo /= 255; hi = Math.max(lo + 0.2, hi / 255);
    for (let i = 0; i < w * h; i++) this.L[i] = clamp((clamp((this.L[i] - lo) / (hi - lo)) ** gamma - 0.5) * ganancia + 0.5);
    // silueta negra para recortes
    const s = document.createElement('canvas'); s.width = im.naturalWidth; s.height = im.naturalHeight;
    const sx = s.getContext('2d'); sx.drawImage(im, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#000'; sx.fillRect(0, 0, s.width, s.height);
    this.silueta = s;
  }
  /** Caja de la imagen para cubrir (o contener) un rectángulo, con zoom alrededor de un foco. */
  encuadre(x, y, w, h, { cubrir = true, zoom = 1, foco = [0.5, 0.5] } = {}) {
    const ar = this.w / this.h;
    let bw = cubrir ? Math.max(w, h * ar) : Math.min(w, h * ar);
    let bh = bw / ar;
    bw *= zoom; bh *= zoom;
    return { x: x + w * foco[0] - bw * foco[0], y: y + h * foco[1] - bh * foco[1], w: bw, h: bh };
  }
  pintar(ctx, caja, o = {}) {
    const { paso = 10, color = '#fff', progreso = 1, centro = [0.5, 0.5], escala = 1, invertir = false, silueta = false, minR = 0.4 } = o;
    const { x: bx, y: by, w: bw, h: bh } = caja;
    if (silueta) ctx.drawImage(this.silueta, bx, by, bw, bh);
    const cw = ctx.canvas.width, ch = ctx.canvas.height, ca = Math.SQRT1_2, sa = Math.SQRT1_2;
    const x0 = Math.max(0, bx), y0 = Math.max(0, by), x1 = Math.min(cw, bx + bw), y1 = Math.min(ch, by + bh);
    if (x1 <= x0 || y1 <= y0) return;
    const cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2 / paso) + 1;
    const base = paso * 0.72 * escala;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const pxx = cx0 + (i * ca - j * sa) * paso, pyy = cy0 + (i * sa + j * ca) * paso;
      if (pxx < x0 - paso || pyy < y0 - paso || pxx > x1 + paso || pyy > y1 + paso) continue;
      const u = (pxx - bx) / bw, v = (pyy - by) / bh;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      const k = ((v * this.h) | 0) * this.w + ((u * this.w) | 0);
      if (this.A[k] < 128) continue;
      let l = this.L[k];
      if (invertir) l = 1 - l;
      let r = base * Math.sqrt(l);
      if (progreso < 1) {
        const dd = Math.hypot(u - centro[0], ((v - centro[1]) * bh) / bw) / 0.75;
        let q = clamp(progreso * 1.7 - dd * 0.7);
        r *= q * q * (3 - 2 * q);
      }
      if (r < minR) continue;
      ctx.moveTo(pxx + r, pyy);
      ctx.arc(pxx, pyy, r, 0, 6.2832);
    }
    ctx.fill();
  }
}
const TRAMAS = {};
const trama = (n, o) => TRAMAS[n] || (TRAMAS[n] = new Trama(IMG[n], o));

// ------------------------------------------------------------------ tiza (trazos generados, como en la web)
const f1 = (v) => Math.round(v * 10) / 10;
function curva(pts) {
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}
const poli = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])}`).join('');
const FORMAS = {
  elipse(w, h, r) {
    const pts = [], a0 = -Math.PI * 0.62 + r() * 0.5, n = 64;
    for (let i = 0; i <= n; i++) { const u = i / n, a = a0 + u * 1.85 * Math.PI * 2, wob = 1 + 0.045 * Math.sin(a * 3 + 2) + (r() - 0.5) * 0.025; pts.push([w / 2 + Math.cos(a) * w * 0.47 * wob + u * w * 0.03, h / 2 + Math.sin(a) * h * 0.44 * wob - u * h * 0.04]); }
    return [curva(pts)];
  },
  subrayado(w, h, r) {
    const a = [], b = [];
    for (let i = 0; i <= 9; i++) a.push([w * 0.01 + (i / 9) * w * 0.98, h * 0.5 + (r() - 0.5) * h * 0.5 - (i / 9) * h * 0.18]);
    for (let i = 0; i <= 6; i++) b.push([w * 0.92 - (i / 6) * w * 0.78, h * 0.75 + (r() - 0.5) * h * 0.35]);
    return [curva(a), curva(b)];
  },
  zigzag(w, h, r) { const a = [], n = 7; for (let i = 0; i <= n; i++) a.push([(i / n) * w, (i % 2 ? h * 0.88 : h * 0.12) + (r() - 0.5) * h * 0.16]); return [poli(a)]; },
  flecha(w, h, r) { const a = [[w * 0.04, h * 0.86], [w * 0.26, h * 0.42], [w * 0.56, h * 0.2], [w * 0.9, h * 0.18]], t = a[3]; return [curva(a), poli([[t[0] - w * 0.2, t[1] - h * 0.18], t, [t[0] - w * 0.17, t[1] + h * 0.22]])]; },
  estrella(w, h, r) {
    const cx = w / 2, cy = h / 2 + h * 0.03, R = Math.min(w, h) * 0.47, ri = R * 0.42, a = [];
    for (let k = 0; k <= 10; k++) { const ang = -Math.PI / 2 + (k * Math.PI) / 5, rr = (k % 2 ? ri : R) * (1 + (r() - 0.5) * 0.12); a.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]); }
    return [poli(a)];
  },
  rayas(w, h, r) { const a = []; for (let i = 0; i <= 8; i++) { const x = w * 0.08 + (i / 8) * w * 0.84; a.push([x, h * (0.04 + r() * 0.1)], [x + w * 0.05, h * (0.86 + r() * 0.12)]); } return [poli(a)]; },
  garabato(w, h, r) { const a = [], n = 22; for (let i = 0; i <= n; i++) { const u = i / n; a.push([u * w + (i % 2 ? -w * 0.02 : w * 0.02), i % 2 ? h * (0.1 + r() * 0.2) : h * (0.75 + r() * 0.2)]); } return [curva(a)]; },
};
class Tiza {
  constructor(padre, forma, caja, { color = ACIDO, grosor = 6, semilla = 1 } = {}) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'chalk');
    Object.assign(this.svg.style, { left: px(caja.x), top: px(caja.y), width: px(caja.w), height: px(caja.h) });
    this.svg.setAttribute('viewBox', `0 0 ${caja.w} ${caja.h}`);
    padre.appendChild(this.svg);
    this.trazos = FORMAS[forma](caja.w, caja.h, azar(semilla)).map((d) => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      Object.assign(p.style, { stroke: color, strokeWidth: grosor });
      this.svg.appendChild(p);
      p.largo = p.getTotalLength() + 2;
      p.style.strokeDasharray = `${p.largo} ${p.largo}`;
      return p;
    });
  }
  /** dibujado de 0 a 1 (los trazos van uno detrás de otro) */
  pintar(u) {
    const n = this.trazos.length;
    this.trazos.forEach((p, i) => { const q = clamp(u * n - i); p.style.strokeDashoffset = p.largo * (1 - E.outCubic(q)); });
    this.svg.style.display = u <= 0 ? 'none' : '';
  }
}

// ------------------------------------------------------------------ piezas de la marca
function sticker(padre, nombre, ancho, x, y, rot = 0, z = 5) {
  const im = IMG['s_' + nombre] || IMG[nombre];
  const h = (ancho * im.naturalHeight) / im.naturalWidth;
  const e = el('div', 'stk', padre, { width: px(ancho), height: px(h), left: px(x - ancho / 2), top: px(y - h / 2), backgroundImage: `url(${im.src})`, zIndex: z });
  e.rot = rot;
  return e;
}
function imagen(padre, nombre, ancho, x, y, z = 4) {
  const im = IMG[nombre];
  const h = (ancho * im.naturalHeight) / im.naturalWidth;
  const e = el('img', 'abs', padre, { width: px(ancho), height: px(h), left: px(x - ancho / 2), top: px(y - h / 2), zIndex: z, transformOrigin: '50% 50%' });
  e.src = im.src;
  e.rot = 0;
  return e;
}
const MODO_SVG = '<svg viewBox="0 0 300 72" style="width:100%;height:100%;display:block"><rect x="0" y="2" width="88" height="68" rx="3"/><circle cx="131" cy="36" r="34"/><path d="M176 2h28a34 34 0 0 1 0 68h-28z"/><circle cx="264" cy="36" r="34"/></svg>';
function logo(padre, nombre, ancho, x, y, color = '#fff') {
  if (nombre === 'modo') {
    const h = (ancho * 72) / 300;
    const e = el('div', 'abs', padre, { width: px(ancho), height: px(h), left: px(x - ancho / 2), top: px(y - h / 2), fill: color });
    e.innerHTML = MODO_SVG;
    return e;
  }
  const im = IMG['logo_' + nombre];
  const h = (ancho * im.naturalHeight) / im.naturalWidth;
  return el('div', 'logo', padre, { width: px(ancho), height: px(h), left: px(x - ancho / 2), top: px(y - h / 2), background: color, WebkitMaskImage: `url(${im.src})`, maskImage: `url(${im.src})` });
}
/** Golpe de sticker: entra grande y girado, rebota y se asienta. */
function golpe(e, dt, { rot = e.rot || 0, escala = 1, dur = 0.26, desde = 1.6, giro = 16 } = {}) {
  if (dt < 0) { e.style.opacity = 0; return; }
  const u = clamp(dt / dur);
  e.style.opacity = clamp(dt / 0.03);
  e.style.transform = `rotate(${rot + giro * (1 - E.outCubic(u))}deg) scale(${lerp(desde, 1, E.outBack(u)) * escala})`;
}
const PARPADEO = [[0, 0], [0.1, 0.9], [0.14, 0.1], [0.24, 1], [0.3, 0.25], [0.38, 1], [0.56, 0.55], [0.62, 1]];
function parpadeo(dt, dur = 0.5) { if (dt < 0) return 0; if (dt >= dur) return 1; const u = dt / dur; let v = 0; for (const [a, o] of PARPADEO) if (u >= a) v = o; return v; }
/** Pulso del bombo (1 en el golpe y cae rápido) en las secciones con four-on-the-floor. */
function pulso(t, desde = T(5), hasta = T(16, 2)) {
  if (t < desde || t >= hasta) return 0;
  const fr = ((t - desde) / BEAT) % 1;
  return Math.exp((-fr * BEAT) / 0.07);
}
/** Línea de texto (por letras o por palabras con máscara), alineada en x. */
function linea(padre, txt, clase, tam, x, y, { alinear = 'center', color = '#fff', por = 'letra', z = 6 } = {}) {
  const d = el('div', 'abs ' + clase, padre, { fontSize: px(tam), color, top: px(y), zIndex: z });
  const w = anchoTexto(txt, clase, tam);
  d.style.left = px(alinear === 'center' ? x - w / 2 : alinear === 'right' ? x - w : x);
  d.ancho = w; d.tam = tam;
  if (por === 'palabra') {
    d.piezas = txt.split(' ').map((p, i, arr) => {
      const m = el('span', 'mascara', d);
      const k = el('span', '', m); k.textContent = p;
      if (i < arr.length - 1) d.appendChild(document.createTextNode(' '));
      m.k = k;
      return m;
    });
  } else if (por === 'letra') {
    d.piezas = [...txt].map((ch) => { const s = el('span', 'letra', d); s.textContent = ch === ' ' ? ' ' : ch; return s; });
  } else d.textContent = txt;
  return d;
}
/** Texto con barra de resaltado detrás (como los titulares de la revista). */
function resaltado(padre, txt, clase, tam, x, y, { fondo = VIOLETA, color = '#fff', alinear = 'left', z = 6 } = {}) {
  const d = el('div', 'abs hl ' + clase, padre, { position: 'absolute', fontSize: px(tam), color, top: px(y), zIndex: z });
  d.barra = el('span', 'barra', d, { background: fondo });
  d.txt = el('span', 'txt', d); d.txt.textContent = txt;
  const w = anchoTexto(txt, clase, tam) + tam * 0.28;
  d.ancho = w;
  d.style.left = px(alinear === 'center' ? x - w / 2 : alinear === 'right' ? x - w : x);
  return d;
}
function pintarResaltado(d, dt, dur = 0.2) {
  const u = E.outExpo(clamp(dt / dur));
  d.style.opacity = dt < 0 ? 0 : 1;
  d.barra.style.transform = `scaleX(${u})`;
  d.txt.style.clipPath = `inset(0 ${100 - clamp((dt - dur * 0.25) / (dur * 0.9)) * 100}% 0 0)`;
}
function subirPalabras(d, dt, { escalon = 0.06, dur = 0.28 } = {}) {
  d.piezas.forEach((m, i) => { const u = E.outExpo(clamp((dt - i * escalon) / dur)); m.k.style.transform = `translateY(${(1 - u) * 110}%)`; });
}

// ------------------------------------------------------------------ escenas
class Escena {
  constructor(ini, fin, { antes = 0, despues = 0, fondo = '#000' } = {}) {
    this.ini = ini; this.fin = fin; this.antes = antes; this.despues = despues;
    this.raiz = el('div', 'escena', escenario, { display: 'none', background: fondo });
    this.cam = el('div', 'camara', this.raiz);
  }
  visible(t) { return t >= this.ini - this.antes && t < this.fin + this.despues; }
  lienzo(padre = this.cam, z = 1) { const c = el('canvas', 'capa', padre, { zIndex: z }); c.width = W; c.height = H; return c; }
}

/* ---------------- 1 · CAMBIA DE FRECUENCIA (c. 1–2) */
class Frecuencia extends Escena {
  constructor() {
    super(0, Q(T(3)));
    this.fondo = this.lienzo(this.cam, 0).getContext('2d');
    this.onda = this.lienzo(this.cam, 2).getContext('2d');
    this.yOnda = HOR ? H * 0.7 : H * 0.6;
    const c = this.cam, cx = W / 2;
    const tA = ajustar('CARACAS', 'cab', HOR ? W * 0.56 : W - 2 * M, HOR ? 270 : 999);
    const tB = ajustar('NUNCA DUERME', 'cab', HOR ? W * 0.62 : W - 2 * M, tA * 0.82);
    const tC = HOR ? tB * 0.86 : ajustar('DEL TODO.', 'cab', W * 0.66);
    const y0 = HOR ? H * 0.14 : H * 0.2;
    this.b1 = el('div', 'abs', c, { inset: '0', zIndex: 5 });
    this.lA = linea(this.b1, 'CARACAS', 'cab', tA, cx, y0, { por: 'letra' });
    this.lB = linea(this.b1, 'NUNCA DUERME', 'cab', tB, cx, y0 + tA * 0.92, { por: 'palabra' });
    this.lC = linea(this.b1, 'DEL TODO.', 'cab', tC, cx, y0 + tA * 0.92 + tB * 0.92, { por: 'palabra', color: ACIDO });
    this.ordenA = [...this.lA.piezas.keys()].map((i) => hash(i + 3) * 0.16);
    this.b2 = el('div', 'abs', c, { inset: '0', zIndex: 5 });
    const tS = HOR ? 34 : 38;
    const tF = ajustar('FRECUENCIA', 'cab', HOR ? W * 0.7 : W - 2 * M, HOR ? 250 : 999);
    const tCa = HOR ? tF * 0.72 : ajustar('CAMBIA DE', 'cab', W * 0.74);
    const y2 = HOR ? H * 0.14 : H * 0.2;
    this.lS = linea(this.b2, 'SIMPLEMENTE', 'mont', tS, cx, y2, { color: ACIDO, por: 'letra' });
    this.lS.style.letterSpacing = '.42em';
    this.lS.style.left = px(cx - (anchoTexto('SIMPLEMENTE', 'mont', tS) * 1.4) / 2);
    this.lCa = linea(this.b2, 'CAMBIA DE', 'cab', tCa, cx, y2 + tS * 1.9, { por: 'palabra' });
    this.lF = resaltado(this.b2, 'FRECUENCIA', 'cab', tF, cx, y2 + tS * 1.9 + tCa * 0.95, { alinear: 'center' });
    this.glitch = [ROSA, ACIDO].map((col) => {
      const g = el('div', 'abs', c, { inset: '0', zIndex: 4, mixBlendMode: 'screen', opacity: 0 });
      linea(g, 'CAMBIA DE', 'cab', tCa, cx, y2 + tS * 1.9, { color: col, por: 'nada' });
      linea(g, 'FRECUENCIA', 'cab', tF, cx, y2 + tS * 1.9 + tCa * 0.95 + tF * 0.05, { color: col, por: 'nada' });
      return g;
    });
    // dial de radio: regla de frecuencias y aguja rosa que busca la emisora
    const dw = HOR ? W * 0.56 : W - 2 * M, dx = (W - dw) / 2, dy = this.yOnda + (HOR ? H * 0.12 : H * 0.1);
    this.dial = el('div', 'abs', c, { left: px(dx), top: px(dy), width: px(dw), height: px(HOR ? 70 : 80), zIndex: 3 });
    let marcas = '';
    for (let i = 0; i <= 80; i++) {
      const x = (i / 80) * 100, alto = i % 10 === 0 ? 34 : i % 5 === 0 ? 22 : 12;
      marcas += `<i style="position:absolute;left:${x}%;bottom:0;width:2px;height:${alto}px;background:rgba(255,255,255,${i % 10 === 0 ? 0.8 : 0.35})"></i>`;
      if (i % 10 === 0) marcas += `<b class="mont" style="position:absolute;left:${x}%;bottom:42px;transform:translateX(-50%);font-size:${HOR ? 16 : 19}px;letter-spacing:.06em;color:rgba(255,255,255,.7)">${88 + i / 4}</b>`;
    }
    this.dial.innerHTML = marcas + `<span class="mont" style="position:absolute;right:0;top:-${HOR ? 46 : 54}px;font-size:${HOR ? 16 : 19}px;letter-spacing:.2em;color:${ACIDO}">FM · CARACAS</span>`;
    this.aguja = el('div', 'abs', this.dial, { top: '-10px', bottom: '-6px', width: '4px', marginLeft: '-2px', background: ROSA, boxShadow: `0 0 14px ${ROSA}`, left: '30%' });
  }
  pintarOnda(t) {
    const x = this.onda;
    x.clearRect(0, 0, W, H);
    const x0 = M * 1.1, x1 = W - M * 1.1, L = x1 - x0, y0 = this.yOnda;
    const abre = E.outExpo(prog(t, 0.03, 0.5));
    const xa = W / 2 - (L / 2) * abre, xb = W / 2 + (L / 2) * abre;
    const sint = t >= Q(T(2, 3));
    const glitch = t >= Q(T(2, 4));
    const fin = prog(t, Q(T(3)) - 0.13, Q(T(3)));
    let lat = 0;
    for (const tb of [T(1, 1), T(1, 3), T(2, 1)]) for (const d of [0, 0.19]) if (t >= tb + d) lat = Math.max(lat, Math.exp(-(t - tb - d) / 0.08) * (d ? 0.6 : 1));
    const fr = Math.floor(t * 60);
    const capas = glitch ? [[ROSA, -7], [VIOLETA, 7], [ACIDO, 0]] : [[ACIDO, 0]];
    for (const [col, dx] of capas) {
      x.strokeStyle = col; x.lineWidth = HOR ? 4 : 5; x.shadowColor = col; x.shadowBlur = sint ? 26 : 12;
      x.globalAlpha = col === ACIDO ? 1 : 0.8;
      x.beginPath();
      for (let p = xa; p <= xb; p += 3) {
        const u = (p - x0) / L, ven = Math.sin(Math.PI * clamp(u)) ** 0.8;
        let y;
        if (!sint) {
          const rafaga = 0.5 + 0.5 * Math.sin(t * 5.3 + Math.sin(t * 2.1) * 2);
          const n = Math.sin(p * 0.021 + t * 13) * 0.5 + Math.sin(p * 0.057 - t * 21) * 0.3 + (hash(Math.floor(p / 3) * 0.37 + fr * 13.1) - 0.5) * 1.1 * rafaga;
          y = y0 + n * H * (0.018 + 0.05 * lat + 0.012 * rafaga) * ven * (HOR ? 1 : 0.7);
        } else {
          let a = H * (HOR ? 0.07 : 0.04) * E.outExpo(prog(t, Q(T(2, 3)), Q(T(2, 3)) + 0.12));
          let off = 0;
          if (glitch) { const seg = Math.floor(p / 90); if (hash(seg * 7.7 + fr * 0.31) > 0.72) off = (hash(seg + fr) - 0.5) * 60; a *= 1 + 0.6 * hash(fr * 3.3); }
          y = y0 + off * 0.4 + Math.sin(p * 0.016 - t * 26) * a * ven;
        }
        if (p === xa) x.moveTo(p + dx, y); else x.lineTo(p + dx, y);
      }
      x.stroke();
    }
    x.globalAlpha = 1; x.shadowBlur = 0;
    if (fin > 0) { this.cam.style.transform = `scaleY(${lerp(1, 0.004, E.inExpo(fin))}) scaleX(${lerp(1, 1.15, fin)})`; this.cam.style.filter = `brightness(${1 + fin * 2.5})`; }
    else { this.cam.style.transform = ''; this.cam.style.filter = ''; }
  }
  pintar(t) {
    // fondo: luces de escenario en trama violeta, muy tenues, que se acercan
    const f = this.fondo;
    f.clearRect(0, 0, W, H);
    const tr = trama('ht_luces_escenario');
    f.globalAlpha = 0.32 * E.outCubic(prog(t, 0, 1.2));
    tr.pintar(f, tr.encuadre(0, 0, W, H, { zoom: 1.25 + 0.12 * (t / 3.75), foco: [0.5, 0.35] }), { paso: HOR ? 12 : 12, color: VIOLETA });
    f.globalAlpha = 1;
    this.pintarOnda(t);
    // la aguja busca (con la estática) y se clava en la emisora cuando entra la música
    const busca = 0.3 + 0.18 * Math.sin(t * 1.7) + 0.1 * Math.sin(t * 4.3 + 1) + 0.04 * Math.sin(t * 17);
    const fija = E.outBack(prog(t, Q(T(2, 3)) - 0.1, Q(T(2, 3)) + 0.12));
    this.aguja.style.left = `${lerp(busca, 0.5, fija) * 100}%`;
    this.dial.style.opacity = E.outCubic(prog(t, 0.15, 0.6)) * (1 - prog(t, Q(T(3)) - 0.2, Q(T(3)) - 0.05));
    const sale = prog(t, Q(T(2, 1)) - 0.1, Q(T(2, 1)));
    this.b1.style.opacity = 1 - sale;
    this.b1.style.transform = `translateY(${-60 * E.inCubic(sale)}px)`;
    this.b1.style.display = t >= Q(T(2, 1)) ? 'none' : '';
    this.lA.piezas.forEach((sp, i) => { sp.style.opacity = parpadeo(t - Q(T(1, 2)) - this.ordenA[i], 0.42); });
    this.lA.style.textShadow = t > Q(T(1, 2)) + 0.4 ? '0 0 30px rgba(255,255,255,.35)' : 'none';
    subirPalabras(this.lB, t - Q(T(1, 3)));
    const dc = t - Q(T(1, 4));
    subirPalabras(this.lC, dc, { escalon: 0.08 });
    this.lC.style.transform = dc < 0 ? '' : `scale(${lerp(1.18, 1, E.outBack(clamp(dc / 0.22)))})`;
    this.lC.style.transformOrigin = '50% 50%';
    const d2 = t - Q(T(2, 1));
    this.b2.style.display = d2 < 0 ? 'none' : '';
    this.lS.piezas.forEach((sp, i) => { const u = clamp((d2 - i * 0.016) / 0.12); sp.style.opacity = u; sp.style.transform = `translateY(${(1 - E.outCubic(u)) * 18}px)`; });
    subirPalabras(this.lCa, t - Q(T(2, 2)));
    pintarResaltado(this.lF, t - Q(T(2, 3)), 0.17);
    const g = t - Q(T(2, 4));
    const fr = Math.floor(t * 60);
    this.glitch.forEach((e, i) => {
      if (g < 0) { e.style.opacity = 0; return; }
      e.style.opacity = 0.85;
      e.style.transform = `translate(${(hash(fr * 1.7 + i * 9) - 0.5) * 34 + (i ? 9 : -9)}px, ${(hash(fr * 2.3 + i) - 0.5) * 8}px)`;
      const a = hash(fr * 0.7 + i) * 100, b = a + 6 + hash(fr + i) * 14;
      e.style.clipPath = hash(fr * 0.9 + i) > 0.35 ? `polygon(0 ${a}%, 100% ${a}%, 100% ${b}%, 0 ${b}%)` : 'none';
    });
    this.b2.style.transform = g >= 0 ? `translateX(${(hash(fr * 4.1) - 0.5) * 22}px)` : '';
  }
}

/* ---------------- 2 · ROSA · VERDE · VIOLETA · NEÓN (c. 3) */
class Colores extends Escena {
  constructor() {
    super(Q(T(3)), Q(T(4)));
    this.trama = this.lienzo(this.cam, 1);
    this.ctx = this.trama.getContext('2d');
    this.golpes = [0, 1, 2, 3].map((k) => Q(T(3, k + 1)));
    const D = [
      { txt: 'ROSA', fondo: ROSA, color: '#fff', foto: 'ht_manos_arriba', punto: '#b8005a', stk: ['estrellas', 0.22, 0.2, -12] },
      { txt: 'VERDE', fondo: ACIDO, color: '#000', foto: 'ht_amigas_monaco', punto: '#253300', stk: ['exclam_doble', 0.8, 0.8, 10] },
      { txt: 'VIOLETA', fondo: VIOLETA, color: ACIDO, foto: 'ht_multitud_violeta', punto: '#2c0090', stk: ['chispa', 0.8, 0.2, 8] },
      { txt: 'NEÓN', fondo: '#000', color: 'transparent', foto: 'ht_dj_cabina', punto: '#4d0a2c', stk: ['rayos_bolt', 0.24, 0.8, -8] },
    ];
    this.D = D;
    D.forEach((d) => {
      const tam = ajustar(d.txt, 'cab', HOR ? W * 0.7 : W - M * 2.6, HOR ? 440 : 360);
      d.el = linea(this.cam, d.txt, 'cab', tam, W / 2, H / 2 - tam * 0.46, { color: d.color, por: 'nada', z: 6 });
      d.el.style.transformOrigin = '50% 50%';
      if (d.txt === 'NEÓN') {
        Object.assign(d.el.style, { WebkitTextStroke: `${HOR ? 7 : 6}px ${ROSA}`, textShadow: `0 0 26px ${ROSA}, 0 0 70px ${MAGENTA}` });
        d.copias = [ACIDO, VIOLETA].map((col) => { const c = linea(this.cam, d.txt, 'cab', tam, W / 2, H / 2 - tam * 0.46, { color: 'transparent', por: 'nada', z: 5 }); Object.assign(c.style, { WebkitTextStroke: `${HOR ? 5 : 4}px ${col}`, opacity: 0.8, transformOrigin: '50% 50%' }); return c; });
      }
      const [n, fx, fy, rot] = d.stk;
      d.sticker = sticker(this.cam, n, HOR ? 230 : 250, W * fx, H * fy, rot, 7);
    });
  }
  pintar(t) {
    let k = 0;
    for (let i = 0; i < 4; i++) if (t >= this.golpes[i]) k = i;
    const d = this.D[k], dt = t - this.golpes[k];
    this.raiz.style.background = d.fondo;
    const x = this.ctx;
    x.clearRect(0, 0, W, H);
    const tr = trama(d.foto);
    tr.pintar(x, tr.encuadre(0, 0, W, H, { zoom: 1.2 - 0.1 * E.outCubic(clamp(dt / BEAT)), foco: [0.5, 0.45] }), { paso: HOR ? 13 : 12, color: d.punto, progreso: E.outExpo(clamp(dt / 0.14)), escala: 1.05 });
    this.D.forEach((o, i) => {
      const vis = i === k;
      o.el.style.display = vis ? '' : 'none';
      o.sticker.style.display = vis ? '' : 'none';
      if (o.copias) o.copias.forEach((c) => { c.style.display = vis ? '' : 'none'; });
    });
    const s = lerp(1.55, 1, E.outBack(clamp(dt / 0.16))) * (1 + 0.05 * clamp(dt / BEAT));
    const rot = lerp(-8, -2.5, E.outCubic(clamp(dt / 0.2)));
    d.el.style.transform = `rotate(${rot}deg) scale(${s})`;
    if (d.copias) {
      const on = parpadeo(dt, 0.34);
      d.el.style.opacity = on;
      d.copias.forEach((c, i) => { c.style.opacity = on * 0.8; c.style.transform = `translate(${(i ? 1 : -1) * (8 + 6 * Math.sin(dt * 40))}px, ${(i ? -1 : 1) * 4}px) rotate(${rot}deg) scale(${s})`; });
    }
    golpe(d.sticker, dt - 0.06, { dur: 0.2 });
    const sh = Math.exp(-dt / 0.06);
    this.cam.style.transform = `translate(${(hash(k * 7 + 1) - 0.5) * 34 * sh}px, ${(hash(k * 3 + 2) - 0.5) * 34 * sh}px)`;
  }
}

/* ---------------- 3 · TOMAN EL ASFALTO (build, c. 4) */
class Asfalto extends Escena {
  constructor() {
    super(Q(T(4)), Q(T(5)));
    this.ctx = this.lienzo(this.cam, 1).getContext('2d');
    this.fotos = ['ht_gafas', 'ht_achante', 'ht_multitud_contra', 'ht_luces_escenario', 'ht_zoe_laser', 'ht_chica_pinta', 'ht_multitud_beat', 'ht_manos_arriba'];
    const c = this.cam;
    if (HOR) {
      const tam = ajustar('TOMAN EL ASFALTO', 'cab', W * 0.8, 220);
      const y = H / 2 - tam * 0.5;
      const wT = anchoTexto('TOMAN', 'cab', tam) + tam * 0.28, wE = anchoTexto('EL', 'cab', tam) + tam * 0.28, wA = anchoTexto('ASFALTO', 'cab', tam) + tam * 0.28;
      const hueco = tam * 0.14, x0 = W / 2 - (wT + wE + wA + 2 * hueco) / 2;
      this.p1 = resaltado(c, 'TOMAN', 'cab', tam, x0, y, { fondo: '#000' });
      this.p2 = resaltado(c, 'EL', 'cab', tam, x0 + wT + hueco, y, { fondo: '#000' });
      this.p3 = resaltado(c, 'ASFALTO', 'cab', tam, x0 + wT + wE + 2 * hueco, y, { fondo: ACIDO, color: '#000' });
      this.zz = new Tiza(c, 'zigzag', { x: W * 0.2, y: H * 0.68, w: W * 0.6, h: 70 }, { color: ROSA, grosor: 9, semilla: 21 });
    } else {
      const tamA = ajustar('ASFALTO', 'cab', W - 2 * M - 40);
      const tam1 = ajustar('TOMAN', 'cab', W * 0.6);
      const y = H * 0.3;
      this.p1 = resaltado(c, 'TOMAN', 'cab', tam1, W / 2, y, { fondo: '#000', alinear: 'center' });
      this.p2 = resaltado(c, 'EL', 'cab', tam1 * 0.8, W / 2, y + tam1 * 1.02, { fondo: '#000', alinear: 'center' });
      this.p3 = resaltado(c, 'ASFALTO', 'cab', tamA, W / 2, y + tam1 * 1.02 + tam1 * 0.86, { fondo: ACIDO, color: '#000', alinear: 'center' });
      this.zz = new Tiza(c, 'zigzag', { x: W * 0.14, y: H * 0.7, w: W * 0.72, h: 80 }, { color: ROSA, grosor: 9, semilla: 21 });
    }
    this.exc = sticker(c, 'exclam', HOR ? 170 : 190, HOR ? W * 0.9 : W * 0.84, HOR ? H * 0.22 : H * 0.2, 12, 8);
    this.punto = el('div', 'abs', c, { left: '0', top: px(H / 2 - 3), width: px(W), height: '6px', background: ACIDO, boxShadow: `0 0 24px ${ACIDO}`, zIndex: 9 });
  }
  pintar(t) {
    const lt = t - this.ini, e = Math.floor(lt / (BEAT / 2)), s = Math.floor(lt / (BEAT / 4));
    const hueco = t >= Q(T(4, 4, 2));
    const strobe = e >= 3 && !hueco;
    const COL = [ROSA, '#000', ACIDO, '#000', VIOLETA, '#000', '#fff', '#000'];
    const fondo = hueco ? '#000' : strobe ? COL[(s - 6) % 8] : '#000';
    this.raiz.style.background = fondo;
    const claro = fondo === ACIDO || fondo === '#fff';
    const x = this.ctx;
    x.clearRect(0, 0, W, H);
    if (!hueco) {
      const tr = trama(this.fotos[strobe ? 3 + (s % 5) : e]);
      const de = lt - (strobe ? s * (BEAT / 4) : e * (BEAT / 2));
      const punto = claro ? '#000' : fondo === '#000' ? (strobe ? '#fff' : ['rgba(255,51,153,.85)', 'rgba(204,255,0,.8)', 'rgba(140,90,255,.9)'][e % 3]) : 'rgba(0,0,0,.55)';
      tr.pintar(x, tr.encuadre(0, 0, W, H, { zoom: 1.06 + (0.08 * de) / (BEAT / 2), foco: [0.5, 0.42] }), { paso: HOR ? 12 : 11, color: punto, escala: 1 });
    }
    [this.p1, this.p2, this.p3].forEach((p) => { p.style.display = hueco ? 'none' : ''; });
    pintarResaltado(this.p1, lt, 0.12);
    pintarResaltado(this.p2, lt - BEAT / 2, 0.1);
    pintarResaltado(this.p3, lt - BEAT, 0.15);
    const inv = fondo === ACIDO;
    this.p3.barra.style.background = inv ? '#000' : ACIDO;
    this.p3.txt.style.color = inv ? ACIDO : '#000';
    const bTxt = fondo === '#fff' || fondo === ACIDO ? '#000' : '#000';
    this.p1.barra.style.background = this.p2.barra.style.background = bTxt;
    golpe(this.exc, lt - BEAT * 1.5, { dur: 0.2 });
    this.exc.style.display = hueco ? 'none' : '';
    this.zz.pintar(hueco ? 0 : prog(lt, BEAT * 1.5, BEAT * 3.3));
    const h = prog(t, Q(T(4, 4, 2)), Q(T(5)));
    this.punto.style.display = hueco ? '' : 'none';
    this.punto.style.transform = `scaleX(${lerp(1, 0.004, E.outExpo(clamp(h * 1.6)))}) scaleY(${1 + 2.5 * E.inExpo(clamp(h * 1.2 - 0.2))})`;
    this.punto.style.opacity = 0.5 + 0.5 * Math.sin(h * 30);
    const sh = strobe ? Math.exp(-((lt % (BEAT / 4)) / 0.04)) : 0;
    this.cam.style.transform = `translate(${(hash(s * 1.3) - 0.5) * 26 * sh}px, ${(hash(s * 2.1) - 0.5) * 26 * sh}px) scale(${1 + 0.03 * sh})`;
  }
}

/* ---------------- 4 · DROP: NIGHTFALL (c. 5–6) */
class Drop extends Escena {
  constructor() {
    super(Q(T(5)), Q(T(7)), { despues: 0.2 });
    const c = this.cam;
    el('div', 'capa', c, { zIndex: 0, background: `radial-gradient(38% 30% at 28% 16%,rgba(204,255,0,.5),rgba(204,255,0,0) 72%),radial-gradient(34% 28% at 72% 12%,rgba(214,255,60,.34),rgba(204,255,0,0) 72%),radial-gradient(26% 30% at 6% 50%,rgba(255,51,153,.66),rgba(255,51,153,0) 72%),radial-gradient(30% 40% at 97% 74%,rgba(255,0,153,.46),rgba(255,0,153,0) 72%),radial-gradient(70% 34% at 48% 104%,rgba(102,0,255,.34),rgba(102,0,255,0) 72%),linear-gradient(180deg,#141a02 0%,#070707 46%,#050505 100%)` });
    const pap = el('img', 'capa', c, { zIndex: 0, width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'screen', opacity: 0.16 });
    pap.src = IMG.papel.src;
    // logotipo
    const ancho = W - (HOR ? 64 : 36);
    const tam = ajustar('NIGHTFALL', 'anton', ancho);
    this.esy = HOR ? 1.28 : 1.86;
    const gD = glifos('NIGHTFALL', '400 {t}px "NF Anton"', tam);
    const y = (HOR ? H * 0.05 : H * 0.085) - gD.arriba * this.esy;
    this.baseLogo = y + gD.abajo * this.esy;
    this.logo = el('div', 'abs anton', c, { left: '0', right: '0', top: px(y), textAlign: 'center', fontSize: px(tam), zIndex: 3, transformOrigin: '50% 0' });
    this.brillo = el('div', 'abs anton', c, { left: '0', right: '0', top: px(y), textAlign: 'center', fontSize: px(tam), zIndex: 2, color: '#dcff4a', filter: 'blur(16px)', transformOrigin: '50% 0', WebkitMaskImage: 'linear-gradient(180deg,#000 0%,#000 32%,transparent 72%)' });
    this.brillo.textContent = 'NIGHTFALL';
    this.letras = [...'NIGHTFALL'].map((ch) => { const s = el('span', 'letra', this.logo, { padding: '.12em 0', margin: '-.12em 0', background: 'linear-gradient(180deg,#f3ffbf 0%,#e2ff58 26%,#ccff00 52%,#b2df00 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }); s.textContent = ch; return s; });
    this.orden = this.letras.map((_, i) => hash(i * 2.7 + 1) * 0.22);
    // foto de portada en semitono
    this.ctx = this.lienzo(c, 4).getContext('2d');
    this.tr = trama('ht_portada_pareja', { ganancia: 1.12 });
    const fh = HOR ? H * 0.86 : H * 0.6, fw = (fh * this.tr.w) / this.tr.h;
    this.cajaFoto = { x: (HOR ? W * 0.43 : W * 0.46) - fw / 2, y: H - fh - (HOR ? 0 : H * 0.07), w: fw, h: fh };
    // stickers
    this.st = HOR
      ? [sticker(c, 'S', 270, W * 0.17, H * 0.47, -7, 6), sticker(c, 'estallido', 125, W * 0.6, H * 0.3, 12, 6), sticker(c, 'rayos', 140, W * 0.65, H * 0.84, -12, 7), sticker(c, 'clip', 105, W * 0.86, H * 0.55, -18, 9)]
      : [sticker(c, 'S', 300, W * 0.18, H * 0.47, -7, 6), sticker(c, 'estallido', 140, W * 0.66, H * 0.36, 12, 6), sticker(c, 'rayos', 150, W * 0.36, H * 0.82, -12, 7), sticker(c, 'clip', 110, W * 0.74, H * 0.6, -18, 9)];
    // ruta nocturna
    const rw = HOR ? W * 0.135 : W * 0.24, rx = W - rw - (HOR ? 40 : 0), ry = HOR ? H * 0.27 : H * 0.37;
    this.ruta = el('div', 'abs', c, { left: px(rx), top: px(ry), width: px(rw), height: px(H - ry), zIndex: 8, background: 'linear-gradient(180deg,rgba(150,18,90,0) 0%,#8f1257 9%,#d8257f 40%,#ff3399 70%,#ff128f 100%)' });
    const et = el('div', 'abs mont', this.ruta, { left: '50%', top: px((H - ry) * 0.045), transform: 'translateX(-50%)', fontSize: px(HOR ? 15 : 17), lineHeight: '1.02', textAlign: 'center', background: ROSA, padding: '3px 7px' });
    et.innerHTML = `Ruta<br><span style="color:${ACIDO}">Nocturna</span>`;
    const LOGOS = [['zoe', 0.62], ['modo', 0.6], ['kabal', 0.62], ['monaco', 0.84], ['quinta', 0.66], ['blu', 0.62], ['velvet', 0.6], ['achant', 0.7]];
    this.logos = LOGOS.map(([n, a], i) => logo(this.ruta, n, rw * a, rw / 2, (H - ry) * (0.17 + i * 0.105)));
    // tagline
    const tt = HOR ? 56 : 58;
    const yTag = HOR ? H * 0.8 : H * 0.72;
    this.tag = resaltado(c, 'EL ECO NOCTURNO DE CARACAS', 'cab', tt, M * (HOR ? 0.5 : 0.5), yTag, { z: 12 });
    this.num = linea(c, 'N.º 01 · EDICIÓN ESPECIAL DE COLECCIÓN', 'mont', HOR ? 22 : 24, M * (HOR ? 0.5 : 0.5) + 4, yTag + tt * 1.12, { alinear: 'left', color: ACIDO, por: 'nada', z: 12 });
    this.num.style.textShadow = '0 2px 10px #000, 0 0 2px #000';
    this.num.style.letterSpacing = '.16em';
  }
  pintar(t) {
    const lt = t - this.ini;
    const pz = pulso(t);
    this.cam.style.transform = `scale(${1 + 0.06 * E.outCubic(clamp(lt / (BAR * 2))) + 0.014 * pz})`;
    this.letras.forEach((s, i) => { s.style.opacity = parpadeo(lt - this.orden[i], 0.42); });
    this.logo.style.transform = this.brillo.style.transform = `scaleY(${this.esy}) scale(${lerp(1.06, 1, E.outCubic(clamp(lt / 0.3)))})`;
    this.brillo.style.opacity = clamp((lt - 0.25) / 0.4) * (0.55 + 0.35 * pz);
    const x = this.ctx;
    x.clearRect(0, 0, W, H);
    this.tr.pintar(x, this.cajaFoto, { paso: HOR ? 9 : 10, color: '#fff', progreso: E.outCubic(clamp((lt - 0.05) / 0.9)), escala: 1 + 0.08 * pz, silueta: lt > 0.02 });
    this.st.forEach((s, i) => golpe(s, lt - BEAT * (i + 1)));
    const dr = lt - BAR;
    this.ruta.style.clipPath = `inset(${(1 - E.inOutCubic(clamp(dr / 0.42))) * 100}% 0 0 0)`;
    this.logos.forEach((l, i) => { const u = clamp((dr - 0.2 - i * 0.045) / 0.25); l.style.opacity = u; l.style.transform = `translateY(${(1 - E.outCubic(u)) * 16}px)`; });
    pintarResaltado(this.tag, lt - BAR - BEAT, 0.22);
    const dn = lt - BAR - BEAT * 2;
    this.num.style.opacity = clamp(dn / 0.15);
    this.num.style.transform = `translateX(${(1 - E.outCubic(clamp(dn / 0.3))) * -30}px)`;
  }
}

/* ---------------- dispositivos */
function portatil(padre, x, y, w) {
  const h = w * 0.625 + w * 0.048;
  const d = el('div', 'portatil', padre, { left: px(x), top: px(y), width: px(w), height: px(h - w * 0.042) });
  el('div', 'tapa', d);
  d.pantalla = el('div', 'pantalla', d);
  d.img = el('img', '', d.pantalla);
  el('div', 'base', d);
  return d;
}
function movil(padre, x, y, w) {
  const d = el('div', 'movil', padre, { left: px(x), top: px(y), width: px(w), height: px((w * 0.916 * 844) / 390 / 0.96) });
  d.pantalla = el('div', 'pantalla', d);
  d.img = el('img', '', d.pantalla);
  el('div', 'isla', d);
  return d;
}

/* ---------------- 5 · LA REVISTA AHORA SE MUEVE (c. 7–8) */
class Web extends Escena {
  constructor() {
    super(Q(T(7)), Q(T(9)), { fondo: VIOLETA });
    const c = this.cam;
    this.puntos = el('div', 'capa', c, { inset: '-40px', background: 'radial-gradient(circle,rgba(35,0,110,.7) 34%,transparent 37%) 0 0/14px 14px', opacity: 0.85 });
    el('div', 'capa', c, { background: 'radial-gradient(70% 60% at 70% 55%,rgba(255,51,153,.35),rgba(255,51,153,0) 70%),radial-gradient(60% 50% at 10% 10%,rgba(204,255,0,.12),rgba(204,255,0,0) 70%)' });
    const tk = HOR ? 30 : 32;
    const tH = HOR ? ajustar('AHORA SE MUEVE', 'cab', W * 0.33) : ajustar('AHORA SE MUEVE', 'cab', W - 2 * M);
    const x0 = HOR ? M : W / 2, al = HOR ? 'left' : 'center';
    const y0 = HOR ? H * 0.2 : SUP;
    this.kick = linea(c, 'NIGHTFALL N.º 01 · EDICIÓN WEB', 'mont', tk, x0, y0, { alinear: al, color: ACIDO, por: 'nada' });
    this.kick.style.letterSpacing = '.14em';
    if (!HOR) this.kick.style.left = px(W / 2 - (anchoTexto('NIGHTFALL N.º 01 · EDICIÓN WEB', 'mont', tk) * 1.14) / 2);
    this.h1 = linea(c, 'LA REVISTA', 'cab', tH, x0, y0 + tk * 1.7, { alinear: al, por: 'palabra' });
    const wA = anchoTexto('AHORA ', 'cab', tH);
    const wTot = anchoTexto('AHORA SE MUEVE', 'cab', tH);
    const xh2 = HOR ? x0 : W / 2 - wTot / 2;
    this.h2a = linea(c, 'AHORA', 'cab', tH, xh2, y0 + tk * 1.7 + tH * 0.92, { alinear: 'left', por: 'palabra' });
    this.h2b = linea(c, 'SE MUEVE', 'cab', tH, xh2 + wA, y0 + tk * 1.7 + tH * 0.92, { alinear: 'left', por: 'letra', color: ACIDO });
    if (HOR) {
      this.pc = portatil(c, W * 0.45, H * 0.17, W * 0.52);
      this.tel = movil(c, W * 0.37, H * 0.42, W * 0.14);
    } else {
      const tw = W * 0.64;
      this.tel = movil(c, (W - tw) / 2, H * 0.37, tw);
    }
    const ET = HOR
      ? [['INTERACTIVA', W * 0.84, H * 0.13, -4], ['EN VIVO', W * 0.24, H * 0.62, 3], ['CON MÚSICA', W * 0.9, H * 0.82, -3]]
      : [['INTERACTIVA', W * 0.74, H * 0.4, -5], ['EN VIVO', W * 0.22, H * 0.58, 4], ['CON MÚSICA', W * 0.76, H * 0.74, -3]];
    this.etiquetas = ET.map(([txt, x, y, r]) => {
      const t = el('div', 'abs cab', c, { left: px(x), top: px(y), fontSize: px(HOR ? 40 : 44), color: '#000', background: CREMA, padding: '.22em .42em .12em', zIndex: 9, boxShadow: '0 12px 26px rgba(30,0,90,.45)', transformOrigin: '50% 50%', translate: '-50% -50%' });
      t.textContent = txt; t.rot = r;
      return t;
    });
    this.estrella = sticker(c, 'estrella_rosa', HOR ? 90 : 96, HOR ? W * 0.07 : W * 0.14, HOR ? H * 0.5 : H * 0.42, 8, 10);
  }
  pintar(t) {
    const lt = t - this.ini;
    const pz = pulso(t);
    this.puntos.style.transform = `translate(${-lt * 18}px, ${-lt * 9}px)`;
    this.cam.style.transform = `scale(${1 + 0.012 * pz})`;
    this.kick.style.opacity = clamp(lt / 0.2);
    subirPalabras(this.h1, lt - 0.05);
    subirPalabras(this.h2a, lt - BEAT * 0.5);
    this.h2b.piezas.forEach((s, i) => {
      const d = lt - BEAT - i * 0.03;
      const u = E.outBack(clamp(d / 0.22));
      const salto = d > 0.25 ? Math.abs(Math.sin(((t / BEAT) * Math.PI) + i * 0.6)) * 10 * pulso(t) : 0;
      s.style.opacity = clamp(d / 0.05);
      s.style.transform = `translateY(${(1 - u) * 60 - salto}px) rotate(${(1 - u) * (i % 2 ? 12 : -12)}deg)`;
    });
    // dispositivos
    const entra = E.outExpo(clamp((lt - 0.1) / 0.6));
    const tomaPc = lt < BAR ? ['escritorio_portada', lt - 0.2] : ['escritorio_scroll', (lt - BAR) * 1.15];
    const tomaTel = lt < BAR ? ['movil_portada', lt - 0.1] : ['movil_scroll', (lt - BAR) * 1.15];
    if (this.pc) {
      this.pc.style.transform = `perspective(1600px) translateY(${(1 - entra) * 380}px) rotateX(${(1 - entra) * 24}deg) rotateY(${-10 + 6 * clamp(lt / (BAR * 2))}deg)`;
      fijarImagen(this.pc.img, TOMAS[tomaPc[0]].url(Math.max(0, tomaPc[1])));
    }
    const et = E.outExpo(clamp((lt - (HOR ? BEAT : 0.15)) / 0.5));
    this.tel.style.transform = `perspective(1600px) translateY(${(1 - et) * 420}px) rotate(${(1 - et) * -8 + (HOR ? -4 : 0)}deg) rotateY(${HOR ? 8 : 0}deg)`;
    fijarImagen(this.tel.img, TOMAS[tomaTel[0]].url(Math.max(0, tomaTel[1])));
    this.etiquetas.forEach((e, i) => golpe(e, lt - BAR - i * BEAT, { rot: e.rot, dur: 0.22 }));
    golpe(this.estrella, lt - BEAT * 2);
  }
}

/* ---------------- 6 · EL MAPA DE LA RUMBA (c. 9) */
class Mapa extends Escena {
  constructor() {
    super(Q(T(9)), Q(T(10)));
    const c = this.cam;
    this.toma = TOMAS[HOR ? 'escritorio_mapa' : 'movil_mapa'];
    this.vista = HOR ? new Vista(c, this.toma, { x: 0, y: 0, w: W, h: H }) : new Vista(c, this.toma, { x: 0, y: H * 0.1, w: W, h: H * 0.9 }, { x: 0, y: 250, w: 390, h: 594 });
    el('div', 'capa', c, { zIndex: 2, background: HOR ? 'linear-gradient(90deg,rgba(0,0,0,.7) 0%,rgba(0,0,0,0) 45%)' : 'linear-gradient(180deg,rgba(0,0,0,.85) 0%,rgba(0,0,0,0) 26%,rgba(0,0,0,0) 74%,rgba(0,0,0,.85) 100%)' });
    const tt = HOR ? 120 : 128;
    const x0 = HOR ? M : W / 2, al = HOR ? 'left' : 'center';
    const y0 = HOR ? H * 0.12 : SUP;
    this.t1 = linea(c, 'EL MAPA', 'cab', tt, x0, y0, { alinear: al, por: 'palabra', z: 5 });
    this.t2 = resaltado(c, 'DE LA RUMBA', 'cab', tt * 0.82, x0, y0 + tt * 0.95, { alinear: al, z: 5 });
    this.k = linea(c, '9 PINES · 8 LOCALES · EN VIVO', 'mont', HOR ? 28 : 30, HOR ? M : W / 2, HOR ? H * 0.86 : INF - 40, { alinear: al, color: ACIDO, por: 'nada', z: 5 });
    this.k.style.textShadow = '0 2px 12px #000';
    if (!HOR) this.k.style.display = 'none';
    this.k.style.letterSpacing = '.1em';
  }
  pintar(t) {
    const lt = t - this.ini;
    const ft = HOR ? 0.25 + lt * 1.6 : 0.3 + lt * 1.25;
    this.vista.pintar(ft, HOR ? 1.0 + 0.1 * E.outCubic(clamp(lt / BAR)) : 1.0 + 0.06 * clamp(lt / BAR), HOR ? [0.58, 0.55] : [0.5, 0.5]);
    subirPalabras(this.t1, lt - 0.03);
    pintarResaltado(this.t2, lt - BEAT * 0.5, 0.2);
    this.k.style.opacity = clamp((lt - BEAT * 1.5) / 0.12);
    this.cam.style.transform = `scale(${1 + 0.01 * pulso(t)})`;
  }
}

/* ---------------- 7 · ¡PÁRATE AHÍ! LOS LOCALES (c. 10) */
class Locales extends Escena {
  constructor() {
    super(Q(T(10)), Q(T(11)), { fondo: '#000' });
    const c = this.cam;
    this.fotos = ['foto_zoe_dj', 'foto_modo_verde', 'kabal_fachada', 'ht_amigas_monaco', 'foto_quinta_cupula', 'foto_blu_laser', 'foto_velvet_escenario', 'ht_achante'].map((n) => {
      const im = el('img', 'capa', c, { width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1) contrast(1.15) brightness(.55)', opacity: 0.5, zIndex: 0 });
      im.src = IMG[n].src;
      return im;
    });
    el('div', 'capa', c, { zIndex: 1, background: 'linear-gradient(162deg,rgba(0,0,0,.92) 0%,rgba(0,0,0,.6) 40%,rgba(184,31,108,.75) 82%,rgba(255,51,153,.9) 100%)', mixBlendMode: 'normal' });
    const tS = HOR ? 150 : ajustar('¡PÁRATE AHÍ!', 'cab', W - 2 * M - 40);
    this.stamp = el('div', 'abs cab', c, { left: '50%', top: px(HOR ? H * 0.07 : SUP), fontSize: px(tS), background: ROSA, padding: '.06em .16em .01em', zIndex: 6, transformOrigin: '50% 50%', translate: '-50% 0' });
    this.stamp.textContent = '¡PÁRATE AHÍ!';
    const tL = HOR ? 50 : 52;
    this.sub = el('div', 'abs cab', c, { left: '50%', top: px((HOR ? H * 0.07 : SUP) + tS * 1.02), fontSize: px(tL), textAlign: 'center', lineHeight: '.92', zIndex: 6, translate: '-50% 0' });
    this.sub.innerHTML = HOR ? `LOS <span style="color:${ACIDO}">LOCALES TOP</span> PARA TRIPEAR EN LA CAPITAL` : `LOS <span style="color:${ACIDO}">LOCALES TOP</span><br>PARA TRIPEAR EN LA CAPITAL`;
    const LOC = [['zoe', 'LAS MERCEDES', '5:00 AM', 0.5], ['modo', 'CHACAO', '3:00 AM', 0.6], ['kabal', 'ALTAMIRA · LAS MERCEDES', '4:00 AM', 0.52], ['monaco', 'LAS MERCEDES', '5:00 AM', 0.78], ['quinta', 'LAS MERCEDES', '5:00 AM', 0.55], ['blu', 'CHUAO · C.C.C.T.', '2:00 AM', 0.5], ['velvet', 'CHACAO · ALTAMIRA', '4:00 AM', 0.48], ['achant', 'CENTRO · AV. ESTE', '2:00 AM', 0.6]];
    const lw = HOR ? W * 0.4 : W * 0.9;
    const ly = HOR ? H * 0.58 : H * 0.5;
    this.items = LOC.map(([n, zona, hasta, a]) => {
      const g = el('div', 'abs', c, { inset: '0', zIndex: 7 });
      const lg = logo(g, n, lw * a * (HOR ? 1.25 : 1.15), W / 2, ly);
      const chip = el('div', 'abs mont', g, { left: '50%', top: px(ly + (HOR ? 120 : 150)), translate: '-50% 0', fontSize: px(HOR ? 26 : 30), letterSpacing: '.06em', color: ACIDO, display: 'flex', alignItems: 'center', gap: '14px' });
      chip.innerHTML = `<span style="width:18px;height:18px;border-radius:50%;background:${ACIDO};box-shadow:0 0 0 6px rgba(204,255,0,.25),0 0 18px ${ACIDO}"></span>ABIERTO · HASTA ${hasta}`;
      const z = el('div', 'abs mont', g, { left: '50%', top: px(ly + (HOR ? 170 : 205)), translate: '-50% 0', fontSize: px(HOR ? 20 : 24), letterSpacing: '.18em', color: 'rgba(255,255,255,.75)' });
      z.textContent = zona;
      g.lg = lg;
      return g;
    });
    this.cont = el('div', 'abs mont', c, { right: px(HOR ? M : W / 2 - 150), top: px(HOR ? H * 0.9 : INF - 60), fontSize: px(HOR ? 24 : 28), letterSpacing: '.12em', color: '#fff', zIndex: 8 });
    if (!HOR) { this.cont.style.right = ''; this.cont.style.left = '50%'; this.cont.style.translate = '-50% 0'; }
  }
  pintar(t) {
    const lt = t - this.ini;
    const k = clamp(Math.floor(lt / (BEAT / 2)), 0, 7);
    const dk = lt - k * (BEAT / 2);
    this.fotos.forEach((f, i) => { f.style.display = i === k ? '' : 'none'; f.style.transform = `scale(${1.08 - 0.05 * clamp(dk / (BEAT / 2))})`; });
    const ds = lt;
    this.stamp.style.opacity = clamp(ds / 0.03);
    const us = clamp(ds / 0.3);
    this.stamp.style.transform = `rotate(${lerp(7, -4, E.outBack(us))}deg) scale(${lerp(1.9, 1, E.outBack(us))})`;
    this.sub.style.opacity = clamp((lt - 0.18) / 0.12);
    this.sub.style.transform = `rotate(-4deg) translateY(${(1 - E.outCubic(clamp((lt - 0.18) / 0.25))) * 26}px)`;
    this.items.forEach((g, i) => {
      g.style.display = i === k ? '' : 'none';
      if (i === k) g.lg.style.transform = `scale(${lerp(1.18, 1, E.outCubic(clamp(dk / 0.08)))})`;
    });
    this.cont.innerHTML = `<span style="color:${ACIDO}">${String(k + 1).padStart(2, '0')}</span> / 08 · LOS LOCALES TOP`;
    this.cam.style.transform = `scale(${1 + 0.012 * pulso(t)})`;
  }
}

/* ---------------- 8 · MEZCLA COMO DJ VICTORI (c. 11) */
class Mezcla extends Escena {
  constructor() {
    super(Q(T(11)), Q(T(12)), { fondo: '#000' });
    const c = this.cam;
    el('div', 'capa', c, { zIndex: 0, background: 'linear-gradient(180deg,#5f7d10 0%,#3b4f07 24%,#141c01 52%,#050600 76%,#000 100%)' });
    this.luces = this.lienzo(c, 0).getContext('2d');
    this.toma = TOMAS[HOR ? 'escritorio_mezclador' : 'movil_mezclador'];
    const cuerpo = this.toma.caja('.mx-body');
    const fuente = { x: cuerpo.x - 14, y: cuerpo.y - 14, w: cuerpo.w + 28, h: cuerpo.h + 28 };
    const dw = HOR ? W * 0.56 : W * 0.6, dh = (dw * fuente.h) / fuente.w;
    this.caja = HOR ? { x: W * 0.39, y: H * 0.5, w: dw, h: dh } : { x: W * 0.36, y: H * 0.39, w: dw, h: dh };
    this.vista = new Vista(c, this.toma, this.caja, fuente, { zIndex: 3, borderRadius: '22px', boxShadow: '0 40px 90px rgba(0,0,0,.7)' });
    this.dj = imagen(c, 'dj_victori', HOR ? 560 : 520, HOR ? W * 0.2 : W * 0.24, HOR ? H * 0.56 : H * 0.6, 5);
    this.dj.style.transformOrigin = '50% 100%';
    const tt = HOR ? 104 : 112;
    const x0 = HOR ? W * 0.39 : W / 2, al = HOR ? 'left' : 'center';
    const y0 = HOR ? H * 0.12 : SUP;
    this.t1 = linea(c, 'MEZCLA COMO', 'cab', tt, x0, y0, { alinear: al, por: 'palabra', z: 6 });
    this.t2 = linea(c, 'DJ VICTORI', 'cab', tt, x0, y0 + tt * 0.92, { alinear: al, por: 'palabra', z: 6, color: ACIDO });
    this.k = linea(c, 'DE LO LATINO A LO ELECTRÓNICO, EN TUS MANOS', 'mont', HOR ? 22 : 24, x0, y0 + tt * 1.98, { alinear: al, por: 'nada', z: 6, color: 'rgba(255,255,255,.85)' });
    this.k.style.letterSpacing = '.06em';
    this.chispa = sticker(c, 'chispa', HOR ? 130 : 140, HOR ? W * 0.32 : W * 0.86, HOR ? H * 0.16 : H * 0.72, 10, 7);
    this.carita = sticker(c, 'carita', HOR ? 150 : 150, HOR ? W * 0.07 : W * 0.1, HOR ? H * 0.42 : H * 0.36, -12, 7);
  }
  pintar(t) {
    const lt = t - this.ini;
    const x = this.luces;
    x.clearRect(0, 0, W, H);
    const tr = trama('ht_luces_escenario');
    x.globalAlpha = 0.5;
    tr.pintar(x, tr.encuadre(0, 0, W, H * 0.7, { zoom: 1.1 - 0.05 * lt }), { paso: 12, color: 'rgba(214,255,90,.55)' });
    x.globalAlpha = 1;
    this.vista.pintar(0.05 + lt * 1.15, 1.0, [0.5, 0.5]);
    const v = E.outExpo(clamp((lt - 0.05) / 0.45));
    this.vista.div.style.transform = `perspective(1400px) translateY(${(1 - v) * 260}px) rotateX(${(1 - v) * 18 + 4}deg)`;
    golpe(this.dj, lt, { giro: -12, desde: 1.35, dur: 0.3 });
    subirPalabras(this.t1, lt - 0.05);
    subirPalabras(this.t2, lt - BEAT * 0.5);
    this.k.style.opacity = clamp((lt - BEAT) / 0.15);
    golpe(this.chispa, lt - BEAT * 1.5);
    golpe(this.carita, lt - BEAT * 2.5);
    this.cam.style.transform = `scale(${1 + 0.012 * pulso(t)})`;
  }
}

/* ---------------- 9 · FLASH NOCTURNO (c. 12) */
class Flash extends Escena {
  constructor() {
    super(Q(T(12)), Q(T(13)), { despues: 0.12 });
    const c = this.cam;
    this.toma = TOMAS[HOR ? 'escritorio_polaroids' : 'movil_polaroids'];
    if (HOR) this.vista = new Vista(c, this.toma, { x: 0, y: 0, w: W, h: H }, { x: 0, y: 132, w: 1440, h: 712 });
    else {
      el('div', 'capa', c, { zIndex: 0, background: '#120c0f' });
      const m = this.toma.caja('#flash-2');
      this.vista = new Vista(c, this.toma, { x: 0, y: H * 0.3, w: W, h: H * 0.7 }, { x: m.x, y: m.y + 66, w: m.w, h: m.h - 66 });
    }
    el('div', 'capa', c, { zIndex: 2, background: HOR ? 'linear-gradient(160deg,rgba(0,0,0,.85) 0%,rgba(0,0,0,0) 34%)' : 'linear-gradient(180deg,#120c0f 0%,#120c0f 29%,rgba(18,12,15,0) 36%)' });
    const tt = HOR ? 150 : 150;
    const x0 = HOR ? M : W / 2, al = HOR ? 'left' : 'center';
    const y0 = HOR ? H * 0.06 : SUP;
    this.t1 = resaltado(c, 'FLASH', 'cab', tt, x0, y0, { alinear: al, z: 6 });
    this.t2 = linea(c, 'NOCTURNO', 'cab', tt, x0, y0 + tt * 0.98, { alinear: al, por: 'palabra', z: 6, color: ACIDO });
    this.blanco = el('div', 'capa', c, { zIndex: 9, background: '#fff', opacity: 0 });
  }
  pintar(t) {
    const lt = t - this.ini;
    this.vista.pintar(HOR ? lt * 1.25 : lt * 1.2, HOR ? 1.04 + 0.07 * clamp(lt / BAR) : 1.0 + 0.05 * clamp(lt / BAR), HOR ? [0.62, 0.6] : [0.5, 0.45]);
    pintarResaltado(this.t1, lt - 0.05, 0.18);
    subirPalabras(this.t2, lt - BEAT * 0.5);
    const db = (lt % BEAT);
    this.blanco.style.opacity = lt < 0.02 ? 0 : 0.42 * Math.exp(-db / 0.06);
  }
}

/* ---------------- 10 · EN EL RADAR · AGENDA (c. 13) */
class Agenda extends Escena {
  constructor() {
    super(Q(T(13)), Q(T(14)), { antes: 0.12 });
    const c = this.cam;
    this.toma = TOMAS[HOR ? 'escritorio_agenda' : 'movil_agenda'];
    if (HOR) this.vista = new Vista(c, this.toma, { x: 0, y: 0, w: W, h: H }, { x: 40, y: 150, w: 1360, h: 720 });
    else {
      const live = this.toma.caja('[data-ag-live]');
      this.vista = new Vista(c, this.toma, { x: 0, y: H * 0.29, w: W, h: H * 0.71 }, { x: 0, y: live.y - 20, w: 390, h: 844 - live.y + 20 });
    }
    el('div', 'capa', c, { zIndex: 2, background: HOR ? 'linear-gradient(20deg,rgba(0,0,0,.92) 0%,rgba(0,0,0,.6) 30%,rgba(0,0,0,0) 52%)' : 'linear-gradient(180deg,#05010d 0%,#05010d 27%,rgba(5,1,13,0) 33%)' });
    const tt = HOR ? 118 : 132;
    const x0 = HOR ? M : W / 2;
    const y0 = HOR ? H * 0.66 : SUP;
    const wE = anchoTexto('EN EL ', 'cab', tt), wR = anchoTexto('EN EL RADAR', 'cab', tt);
    const xa = HOR ? x0 : W / 2 - wR / 2;
    this.t1 = linea(c, 'EN EL', 'cab', tt, xa, y0, { alinear: 'left', por: 'palabra', z: 6 });
    this.t1b = linea(c, 'RADAR', 'cab', tt, xa + wE, y0, { alinear: 'left', por: 'palabra', z: 6, color: ROSA });
    this.t2 = linea(c, 'AGENDA OCTUBRE 2026', 'cab', tt * 0.5, HOR ? x0 : W / 2, y0 + tt * 0.95, { alinear: HOR ? 'left' : 'center', por: 'palabra', z: 6, color: ACIDO });
    this.tag = el('div', 'abs cab', c, { left: px(HOR ? W * 0.5 : W * 0.7), top: px(HOR ? H * 0.04 : H * 0.6), fontSize: px(HOR ? 46 : 50), background: ACIDO, color: '#000', padding: '.18em .32em .08em', zIndex: 7, transformOrigin: '50% 50%', translate: '-50% 0', boxShadow: `10px 10px 0 ${VIOLETA}` });
    this.tag.textContent = 'FALTAN 3 DÍAS';
    this.tag.rot = -5;
  }
  pintar(t) {
    const lt = t - this.ini;
    this.vista.pintar(0.35 + Math.max(0, lt) * (HOR ? 1.05 : 0.6), HOR ? 1.0 + 0.08 * clamp(lt / BAR) : 1.0 + 0.05 * clamp(lt / BAR), HOR ? [0.62, 0.55] : [0.5, 0.2]);
    subirPalabras(this.t1, lt - 0.03);
    subirPalabras(this.t1b, lt - 0.12);
    subirPalabras(this.t2, lt - BEAT * 0.6);
    golpe(this.tag, lt - BEAT * 2, { rot: -5 });
  }
}

/* ---------------- 11 · ARMA TU MESA (c. 14) */
class Carta extends Escena {
  constructor() {
    super(Q(T(14)), Q(T(15)));
    const c = this.cam;
    this.toma = TOMAS[HOR ? 'escritorio_carta' : 'movil_carta'];
    this.vista = new Vista(c, this.toma, { x: 0, y: 0, w: W, h: H });
    this.ondas = [0, 1, 2, 3, 4, 5, 6].map(() => el('div', 'onda', c, { zIndex: 4, opacity: 0 }));
    el('div', 'capa', c, { zIndex: 2, background: HOR ? 'linear-gradient(90deg,rgba(40,0,110,.0) 50%,rgba(20,0,60,.0) 100%)' : 'linear-gradient(180deg,rgba(30,0,90,.85) 0%,rgba(30,0,90,0) 22%)' });
    const tt = HOR ? 132 : 128;
    const x0 = HOR ? M : W / 2, al = HOR ? 'left' : 'center';
    const y0 = HOR ? H * 0.68 : SUP;
    this.t1 = linea(c, 'ARMA TU MESA', 'cab', tt, x0, y0, { alinear: al, por: 'palabra', z: 6 });
    this.t2 = resaltado(c, 'Y DIVIDE ENTRE LOS PANAS', 'cab', tt * 0.42, x0, y0 + tt * 0.98, { alinear: al, fondo: ACIDO, color: '#000', z: 6 });
    this.fondoTxt = el('div', 'abs', c, { zIndex: 5, left: px(HOR ? M - 36 : 40), top: px(y0 - 34), width: px(HOR ? anchoTexto('ARMA TU MESA', 'cab', tt) + 72 : W - 80), height: px(tt * 1.6 + 60), background: 'rgba(10,0,35,.82)', transformOrigin: '0 50%' });
    this.negro = el('div', 'capa', c, { zIndex: 20, background: '#000', opacity: 0 });
    this.punto = el('div', 'abs', this.negro, { left: px(W / 2 - 9), top: px(H / 2 - 9), width: '18px', height: '18px', borderRadius: '50%', background: ACIDO, boxShadow: `0 0 30px ${ACIDO}` });
  }
  pintar(t) {
    const lt = t - this.ini;
    const ft = lt + 0.083;
    const zoom = HOR ? 1.03 + 0.12 * E.inOutCubic(clamp(lt / BAR)) : 1.02 + 0.06 * clamp(lt / BAR);
    this.vista.pintar(ft, zoom, HOR ? [0.7, 0.4] : [0.5, 0.6]);
    (this.toma.meta.toques || []).forEach((q, i) => {
      const o = this.ondas[i];
      if (!o) return;
      const d = ft - q.t;
      if (d < 0 || d > 0.45) { o.style.opacity = 0; return; }
      const [xx, yy] = this.vista.punto(q.x, q.y);
      const r = 14 + 90 * E.outCubic(d / 0.45);
      Object.assign(o.style, { left: px(xx - r), top: px(yy - r), width: px(2 * r), height: px(2 * r), opacity: 1 - d / 0.45 });
    });
    this.fondoTxt.style.transform = `scaleX(${E.outExpo(clamp((lt - 0.02) / 0.25))})`;
    subirPalabras(this.t1, lt - 0.06);
    pintarResaltado(this.t2, lt - BEAT, 0.2);
    const h = prog(t, Q(T(14, 4, 2)), Q(T(15)));
    this.negro.style.opacity = t >= Q(T(14, 4, 2)) ? 1 : 0;
    this.punto.style.transform = `scale(${1 + 1.2 * h})`;
    this.punto.style.opacity = 0.6 + 0.4 * Math.sin(h * 20);
  }
}

/* ---------------- 12 · CIERRE (c. 15–16) */
class Cierre extends Escena {
  constructor() {
    super(Q(T(15)), DUR + 1, { fondo: ACIDO });
    const c = this.cam;
    this.ctx = this.lienzo(c, 1).getContext('2d');
    this.tr = trama('ht_multitud_contra', { ganancia: 1.25 });
    // la trama de la multitud se funde hacia arriba: el logotipo queda sobre ácido limpio
    this.ctx.canvas.style.WebkitMaskImage = this.ctx.canvas.style.maskImage = `linear-gradient(180deg,transparent ${HOR ? 30 : 26}%,#000 ${HOR ? 58 : 50}%)`;
    const tam = ajustar('NIGHTFALL', 'anton', W - (HOR ? 70 : 40));
    this.esy = HOR ? 1.22 : 1.75;
    const gL = glifos('NIGHTFALL', '400 {t}px "NF Anton"', tam);
    const yL = (HOR ? H * 0.045 : SUP + 10) - gL.arriba * this.esy;
    this.sombra = el('div', 'abs anton', c, { left: '0', right: '0', top: px(yL), textAlign: 'center', fontSize: px(tam), zIndex: 3, color: VIOLETA, transformOrigin: '50% 0' });
    this.sombra.textContent = 'NIGHTFALL';
    this.logo = el('div', 'abs anton', c, { left: '0', right: '0', top: px(yL), textAlign: 'center', fontSize: px(tam), zIndex: 4, color: '#000', transformOrigin: '50% 0' });
    this.letras = [...'NIGHTFALL'].map((ch) => { const sp = el('span', 'letra', this.logo); sp.textContent = ch; return sp; });
    this.orden = this.letras.map((_, i) => hash(i * 5.1 + 2) * 0.2);
    const g = glifos('NIGHTFALL', '400 {t}px "NF Anton"', tam);
    const tg = HOR ? 66 : 58;
    const yTag = yL + g.abajo * this.esy + (HOR ? 34 : 46);
    this.tag = resaltado(c, 'EL ECO NOCTURNO DE CARACAS', 'cab', tg, W / 2, yTag, { alinear: 'center', z: 6 });
    const bw = HOR ? W * 0.5 : W - 2 * M;
    const yC = yTag + tg * (HOR ? 1.5 : 1.7);
    this.cta = el('div', 'abs', c, { left: px((W - bw) / 2), top: px(yC), width: px(bw), background: '#000', padding: HOR ? '30px 40px 28px' : '38px 40px 34px', zIndex: 7, transformOrigin: '50% 0', boxShadow: `14px 14px 0 ${VIOLETA}` });
    const a = el('div', 'cab', this.cta, { fontSize: px(HOR ? 40 : 44), color: ACIDO, textAlign: 'center' });
    a.textContent = 'LA REVISTA, AHORA EN LA WEB';
    const u = ajustar('NIGHTFALLMAG.COM', 'cab', bw - 80, HOR ? 104 : 999);
    this.url = el('div', 'cab', this.cta, { fontSize: px(u), color: '#fff', textAlign: 'center', marginTop: '14px' });
    this.url.textContent = 'NIGHTFALLMAG.COM';
    const r = el('div', 'mont', this.cta, { fontSize: px(HOR ? 28 : 32), color: ROSA, textAlign: 'center', marginTop: '14px', textTransform: 'none', letterSpacing: '.04em' });
    r.textContent = '@nightfall_mag';
    this.piezasCta = [a, this.url, r];
    this.pie = el('div', 'abs mont', c, { left: '0', right: '0', top: px(HOR ? H * 0.93 : INF - 10), textAlign: 'center', fontSize: px(HOR ? 18 : 22), color: '#fff', letterSpacing: '.16em', zIndex: 6, textShadow: '0 2px 10px #000' });
    this.pie.textContent = 'N.º 01 · EDICIÓN ESPECIAL DE COLECCIÓN · CARACAS 2026';
    this.st = HOR
      ? [sticker(c, 'clip', 110, W * 0.07, H * 0.62, -26, 8), sticker(c, 'estallido', 190, W * 0.8, yC + 150, 12, 8), sticker(c, 'rayos_bolt', 220, W * 0.17, H * 0.84, -8, 8)]
      : [sticker(c, 'clip', 104, W * 0.065, yC + 90, -26, 8), sticker(c, 'estallido', 180, W * 0.86, yC + 300, 12, 8), sticker(c, 'rayos_bolt', 230, W * 0.72, INF + 120, -8, 8)];
    this.sub = new Tiza(c, 'subrayado', { x: (W - bw) / 2 + bw * 0.14, y: yC + (HOR ? 186 : 214), w: bw * 0.72, h: 28 }, { color: ROSA, grosor: 6, semilla: 7 });
    this.sub.svg.style.zIndex = 8;
  }
  pintar(t) {
    const lt = t - this.ini;
    const x = this.ctx;
    x.clearRect(0, 0, W, H);
    const z = 1.16 - 0.1 * E.outCubic(clamp(lt / 3.6));
    this.tr.pintar(x, this.tr.encuadre(0, 0, W, H, { zoom: z, foco: [0.5, 0.62] }), { paso: HOR ? 10 : 10, color: '#000', invertir: true, escala: 0.9 });
    const pz = pulso(t, Q(T(15)), T(16, 2));
    this.cam.style.transform = `scale(${1 + 0.012 * pz})`;
    this.letras.forEach((sp, i) => { sp.style.opacity = parpadeo(lt - this.orden[i], 0.36); });
    const esc = lerp(1.08, 1, E.outCubic(clamp(lt / 0.35)));
    this.logo.style.transform = `scaleY(${this.esy}) scale(${esc})`;
    const off = 10 * clamp((lt - 0.3) / 0.3);
    this.sombra.style.transform = `translate(${off}px, ${off}px) scaleY(${this.esy}) scale(${esc})`;
    this.sombra.style.opacity = clamp((lt - 0.3) / 0.2);
    const fr = t - T(16, 2);
    this.logo.style.opacity = fr > 0 && fr < 0.75 ? (hash(Math.floor(fr * 30)) > 0.3 ? 1 : 0.25) : 1;
    pintarResaltado(this.tag, lt - BEAT, 0.22);
    const dc = lt - BEAT * 2;
    const uc = E.outExpo(clamp(dc / 0.4));
    this.cta.style.opacity = clamp(dc / 0.05);
    this.cta.style.transform = `translateY(${(1 - uc) * 80}px) rotate(${lerp(-6, -1.5, uc)}deg)`;
    this.piezasCta.forEach((p, i) => { const u = clamp((dc - 0.12 - i * 0.12) / 0.2); p.style.opacity = u; p.style.transform = `translateY(${(1 - E.outCubic(u)) * 14}px)`; });
    this.sub.pintar(prog(lt, BEAT * 4, BEAT * 5.2));
    this.pie.style.opacity = clamp((lt - BEAT * 4) / 0.3);
    this.st.forEach((st, i) => golpe(st, lt - BEAT * (i + 1) - 0.05));
  }
}

// ------------------------------------------------------------------ transiciones
const capaT = el('div', 'transicion', escenario);
const lienzoT = el('canvas', 'capa', capaT); lienzoT.width = W; lienzoT.height = H;
const ctxT = lienzoT.getContext('2d');
const blancoT = el('div', 'capa', capaT, { background: '#fff', opacity: 0 });
/** Bordes rotos del papel (precalculados) */
const bordePapel = (() => { const r = azar(77), a = [], b = []; for (let y = -20; y <= H + 20; y += 12) { a.push([(r() - 0.5) * 30 + Math.sin(y * 0.011) * 26, y]); b.push([(r() - 0.5) * 30 + Math.sin(y * 0.013 + 2) * 26, y]); } return [a, b]; })();
const TRANS = [
  { t: Q(T(5)), tipo: 'flash', dur: 0.3 },
  { t: Q(T(7)), tipo: 'puntos', color: VIOLETA, dur: 0.44 },
  { t: Q(T(9)), tipo: 'papel', dur: 0.34 },
  { t: Q(T(10)), tipo: 'color', color: ROSA },
  { t: Q(T(11)), tipo: 'puntos', color: ACIDO, dur: 0.4 },
  { t: Q(T(12)), tipo: 'flash', dur: 0.26 },
  { t: Q(T(13)), tipo: 'latigo', dur: 0.24 },
  { t: Q(T(14)), tipo: 'barra', color: VIOLETA, dur: 0.34 },
  { t: Q(T(15)), tipo: 'flash', dur: 0.2, color: '#fff' },
];
function pintarTransiciones(t, escenas) {
  ctxT.clearRect(0, 0, W, H);
  blancoT.style.opacity = 0;
  for (const tr of TRANS) {
    const d = t - tr.t;
    if (tr.tipo === 'flash' && d >= 0 && d < tr.dur) { blancoT.style.background = tr.color || '#fff'; blancoT.style.opacity = Math.exp(-d / (tr.dur * 0.35)); }
    if (tr.tipo === 'color' && d >= 0 && d < 2 / 30) { ctxT.fillStyle = tr.color; ctxT.fillRect(0, 0, W, H); }
    if (tr.tipo === 'puntos' && Math.abs(d) < tr.dur / 2) {
      const paso = 64, cubre = d < 0, u = cubre ? 1 + d / (tr.dur / 2) : d / (tr.dur / 2);
      ctxT.fillStyle = tr.color;
      ctxT.beginPath();
      for (let y = -paso; y < H + paso; y += paso) for (let x = -paso; x < W + paso; x += paso) {
        const xx = x + ((y / paso) % 2 ? paso / 2 : 0);
        const p = (xx / W) * 0.6 + (1 - y / H) * 0.4;
        let q = cubre ? clamp(u * 1.8 - p * 0.8) : 1 - clamp(u * 1.8 - p * 0.8);
        q = E.suave(q);
        const r = paso * 0.78 * q;
        if (r > 0.5) { ctxT.moveTo(xx + r, y); ctxT.arc(xx, y, r, 0, 6.2832); }
      }
      ctxT.fill();
    }
    if (tr.tipo === 'papel' && Math.abs(d) < tr.dur / 2) {
      const u = (d + tr.dur / 2) / tr.dur;
      const ancho = W * 1.25, x0 = lerp(-ancho - 60, W + 60, E.inOutCubic(u));
      ctxT.save();
      ctxT.shadowColor = 'rgba(0,0,0,.45)'; ctxT.shadowBlur = 40;
      ctxT.fillStyle = CREMA;
      ctxT.beginPath();
      bordePapel[0].forEach(([dx, y], i) => (i ? ctxT.lineTo(x0 + dx, y) : ctxT.moveTo(x0 + dx, y)));
      [...bordePapel[1]].reverse().forEach(([dx, y]) => ctxT.lineTo(x0 + ancho + dx, y));
      ctxT.closePath();
      ctxT.fill();
      ctxT.restore();
      ctxT.save();
      ctxT.globalCompositeOperation = 'multiply'; ctxT.globalAlpha = 0.55;
      ctxT.beginPath();
      bordePapel[0].forEach(([dx, y], i) => (i ? ctxT.lineTo(x0 + dx, y) : ctxT.moveTo(x0 + dx, y)));
      [...bordePapel[1]].reverse().forEach(([dx, y]) => ctxT.lineTo(x0 + ancho + dx, y));
      ctxT.closePath(); ctxT.clip();
      ctxT.drawImage(IMG.papel, x0, 0, ancho, H);
      ctxT.restore();
    }
    if (tr.tipo === 'barra' && Math.abs(d) < tr.dur / 2) {
      const u = (d + tr.dur / 2) / tr.dur;
      const x0 = lerp(-W * 1.1, W * 1.1, E.inOutCubic(u));
      ctxT.fillStyle = tr.color; ctxT.fillRect(x0, 0, W, H);
      ctxT.fillStyle = ACIDO; ctxT.fillRect(x0 + W - 14, 0, 14, H); ctxT.fillRect(x0, 0, 14, H);
    }
    if (tr.tipo === 'latigo') {
      const a = escenas.find((e) => Math.abs(e.fin - tr.t) < 1e-6), b = escenas.find((e) => Math.abs(e.ini - tr.t) < 1e-6);
      if (Math.abs(d) < tr.dur / 2) {
        const u = E.inOutExpo((d + tr.dur / 2) / tr.dur);
        const v = Math.sin(Math.PI * ((d + tr.dur / 2) / tr.dur));
        if (a) { a.raiz.style.transform = `translateY(${-u * H}px)`; a.raiz.style.filter = `blur(${v * 18}px)`; }
        if (b) { b.raiz.style.transform = `translateY(${(1 - u) * H}px)`; b.raiz.style.filter = `blur(${v * 18}px)`; }
      } else {
        if (a && d < 0) { a.raiz.style.transform = ''; a.raiz.style.filter = ''; }
        if (b && d > 0) { b.raiz.style.transform = ''; b.raiz.style.filter = ''; }
      }
    }
  }
}

// ------------------------------------------------------------------ grano de fotocopia
const grano = el('div', 'grano', escenario);
const TEXTURAS = [];
function prepararGrano() {
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), d = x.createImageData(256, 256), r = azar(900 + k);
    for (let i = 0; i < d.data.length; i += 4) { const v = r() < 0.5 ? 0 : 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = (r() * 110) | 0; }
    x.putImageData(d, 0, 0);
    TEXTURAS.push(c.toDataURL());
  }
}

// ------------------------------------------------------------------ API para el renderizador
let ESCENAS = [];
window.preparar = async () => {
  await cargarRecursos();
  prepararGrano();
  ESCENAS = [new Frecuencia(), new Colores(), new Asfalto(), new Drop(), new Web(), new Mapa(), new Locales(), new Mezcla(), new Flash(), new Agenda(), new Carta(), new Cierre()];
  escenario.appendChild(capaT);
  escenario.appendChild(grano);
  return { fotogramas: FPS * DUR, fps: FPS, ancho: W, alto: H, formato: FORMATO };
};
window.render = async (f) => {
  const t = f / FPS;
  pendientes.length = 0;
  for (const e of ESCENAS) {
    const v = e.visible(t);
    e.raiz.style.display = v ? '' : 'none';
    if (v) e.pintar(t);
  }
  pintarTransiciones(t, ESCENAS);
  const r = azar(f * 31 + 7);
  grano.style.backgroundImage = `url(${TEXTURAS[Math.floor(f / 2) % 4]})`;
  grano.style.backgroundPosition = `${(r() * 256) | 0}px ${(r() * 256) | 0}px`;
  const claro = ESCENAS.some((e) => e.visible(t) && (e instanceof Cierre || (e instanceof Colores && t < Q(T(3, 3)) && t >= Q(T(3, 2)))));
  grano.style.opacity = claro ? 0.06 : 0.09;
  await Promise.all(pendientes);
  await new Promise((r) => requestAnimationFrame(() => r()));
};
