// Lámina 8: el mapa pintado del macizo y lo que se dibuja encima, por pasos.

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const txt = (parent, attrs, s) => { const t = el('text', attrs, parent); t.textContent = s; return t; };

const W = 2000, H = 2121;

// posición de las etiquetas de cada cumbre (dx, dy, anclaje) en px del mapa
const PICOS = {
  nanga:   { pos: null, off: [-34, 70, 'end'], main: true },
  norte:   { pos: [0.24, 1.25], off: [-30, -6, 'end'] },      // como en el mapa del manual
  plateau: { off: [-24, -58, 'end'], aprox: true },
  sattel:  { off: [22, -58, 'start'], aprox: true },
  rakhiot: { off: [34, 16, 'start'] },
  mazeno:  { off: [0, 78, 'middle'] },
  ganalo:  { off: [0, -60, 'middle'] },
  chongra: { off: [-34, 14, 'end'] },
};
const CARAS = [
  { t: 'Rakhiot', s: 'cara norte', x: 0.55, y: 3.7 },
  { t: 'Diamir', s: 'cara oeste', x: -4.3, y: 0.85 },
  { t: 'Rupal', s: 'cara sur', x: 0.95, y: -2.45 },
];
const GLACIARES = [
  { t: 'glaciar Rakhiot', x: -0.24, y: 12.6, rot: 79 },
  { t: 'glaciar Diamir', x: -9.6, y: 3.65, rot: 29 },
  { t: 'glaciar Bazhin', x: 5.0, y: -1.7, rot: 70 },
];
const LUGARES = [
  { t: 'Fairy Meadows', x: -0.9, y: 16.6, dx: 22, dy: 40, a: 'start' },
  { t: 'Campo base Diamir', x: -7.1, y: 2.2, dx: 0, dy: 48, a: 'middle' },
  { t: 'Campo base Herrligkoffer', x: 4.0, y: -4.95, dx: 0, dy: 48, a: 'middle' },
];
const RUTAS = [
  { id: 'kinshofer', at: 0.42, dx: -26, dy: -28, a: 'end' },
  { id: 'buhl', at: 0.30, dx: 26, dy: 0, a: 'start' },
  { id: 'messner', at: 0.32, dx: 28, dy: 8, a: 'start' },
  { id: 'mazeno', at: 0.22, dx: 0, dy: 52, a: 'middle' },
];

export class MacizoMap {
  constructor(section, geo, { reduced = false } = {}) {
    this.section = section;
    this.geo = geo;
    this.reduced = reduced;
    this.svg = section.querySelector('.mapa__svg');
    this.tablero = section.querySelector('.mapa__tablero');
    this.pasos = [...section.querySelectorAll('.macizo__paso')];
    this.b = geo.bounds;
    this.step = -1;
    this._build();
  }

  px(x, y) {
    const b = this.b;
    return [(x - b.x0) / (b.x1 - b.x0) * W, (b.y1 - y) / (b.y1 - b.y0) * H];
  }

  _build() {
    const s = this.svg;
    // brújula y escala, siempre
    const base = el('g', { class: 'mp-g mp-base' }, s);
    const [nx, ny] = [1880, 150];
    el('path', { d: `M ${nx} ${ny - 70} L ${nx + 24} ${ny + 8} L ${nx} ${ny - 6} L ${nx - 24} ${ny + 8} Z`, fill: '#EFE6D2', stroke: '#222430', 'stroke-width': 5 }, base);
    txt(base, { class: 'mp-norte', x: nx, y: ny + 50, 'text-anchor': 'middle' }, 'N');
    const kmpx = W / (this.b.x1 - this.b.x0);
    el('line', { class: 'mp-escala', x1: 110, y1: 2030, x2: 110 + 5 * kmpx, y2: 2030 }, base);
    el('line', { class: 'mp-escala', x1: 110, y1: 2014, x2: 110, y2: 2046 }, base);
    el('line', { class: 'mp-escala', x1: 110 + 5 * kmpx, y1: 2014, x2: 110 + 5 * kmpx, y2: 2046 }, base);
    txt(base, { class: 'mp-escala-txt', x: 110 + 2.5 * kmpx, y: 2002, 'text-anchor': 'middle' }, '5 km');

    // lugares
    const lug = el('g', { class: 'mp-g mp-lugares' }, s);
    for (const l of LUGARES) {
      const [x, y] = this.px(l.x, l.y);
      el('rect', { class: 'mp-lugar', x: x - 11, y: y - 11, width: 22, height: 22, rx: 4 }, lug);
      txt(lug, { class: 'mp-lugar-txt', x: x + l.dx, y: y + l.dy, 'text-anchor': l.a }, l.t);
    }

    // glaciares y caras
    const gl = el('g', { class: 'mp-g mp-glaciares' }, s);
    for (const g of GLACIARES) {
      const [x, y] = this.px(g.x, g.y);
      txt(gl, { class: 'mp-glaciar', x, y, 'text-anchor': 'middle', transform: `rotate(${g.rot} ${x} ${y})` }, g.t);
    }
    const ca = el('g', { class: 'mp-g mp-caras' }, s);
    for (const c of CARAS) {
      const [x, y] = this.px(c.x, c.y);
      txt(ca, { class: 'mp-cara', x, y, 'text-anchor': 'middle' }, c.t);
      txt(ca, { class: 'mp-cara-sub', x, y: y + 48, 'text-anchor': 'middle' }, c.s);
    }

    // rutas (debajo de las cumbres)
    this.rutas = [];
    const ru = el('g', { class: 'mp-g mp-rutas' }, s);
    for (const r of RUTAS) {
      const pts = this.geo.routes[r.id].pts.map(([x, y]) => this.px(x, y));
      const d = 'M' + pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' L');
      const g = el('g', {}, ru);
      const casing = el('path', { class: 'mp-ruta-casing', d, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, g);
      const line = el('path', { class: 'mp-ruta', d, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1, stroke: `var(--ruta-${r.id})` }, g);
      const k = Math.round(r.at * (pts.length - 1));
      const [lx, ly] = pts[k];
      const label = txt(g, { class: 'mp-ruta-txt', x: lx + r.dx, y: ly + r.dy, 'text-anchor': r.a, opacity: 0 }, this.geo.routes[r.id].nombre);
      this.rutas.push({ casing, line, label });
    }

    // cumbres
    const pk = el('g', { class: 'mp-g mp-picos' }, s);
    this.picos = [];
    const byId = Object.fromEntries(this.geo.peaks.map((p) => [p.id, p]));
    for (const [id, cfg] of Object.entries(PICOS)) {
      const p = byId[id];
      if (!p) continue;
      const [x, y] = this.px(...(cfg.pos || [p.x, p.y]));
      const g = el('g', { class: 'mp-pico-g', style: `transform-origin:${x}px ${y}px` }, pk);
      const r = cfg.main ? 15 : 10;
      el('path', { class: 'mp-pico' + (cfg.main ? ' mp-pico--main' : ''), d: `M ${x} ${y - r * 1.25} L ${x + r} ${y + r * 0.75} L ${x - r} ${y + r * 0.75} Z` }, g);
      const [dx, dy, a] = cfg.off;
      txt(g, { class: 'mp-pico-txt', x: x + dx, y: y + dy, 'text-anchor': a, style: cfg.main ? 'font-size:60px' : '' }, p.nombre);
      txt(g, { class: 'mp-pico-alt', x: x + dx, y: y + dy + (cfg.main ? 44 : 38), 'text-anchor': a }, (cfg.aprox ? '≈' : '') + p.alt + ' m');
      this.picos.push(g);
    }
    this.groups = {
      base: s.querySelector('.mp-base'), lugares: lug, glaciares: gl, caras: ca, rutas: ru, picos: pk,
    };
  }

  /** p: progreso del capítulo 0-1 (solo escritorio, con el mapa fijado) */
  progress(p) {
    const g = window.gsap;
    // el tablero entra inclinado como una maqueta y se asienta
    const e = Math.min(1, p / 0.16);
    const ee = 1 - Math.pow(1 - e, 3);
    if (!this.reduced) {
      this.tablero.style.transform = `rotateX(${(1 - ee) * 46 + 7}deg) rotateZ(${(1 - ee) * -8}deg) translateY(${(1 - ee) * 6}vh) scale(${0.86 + 0.14 * ee})`;
    }
    const step = p < 0.27 ? 0 : p < 0.5 ? 1 : p < 0.72 ? 2 : 3;
    this.setStep(step);
    // las rutas se dibujan una tras otra en el último paso
    const rp = Math.max(0, Math.min(1, (p - 0.74) / 0.2));
    this.rutas.forEach((r, i) => {
      const f = Math.max(0, Math.min(1, rp * this.rutas.length - i));
      r.line.setAttribute('stroke-dashoffset', 1 - f);
      r.casing.setAttribute('stroke-dashoffset', 1 - f);
      if (g && (f > 0.6) !== r._on) { r._on = f > 0.6; g.to(r.label, { opacity: r._on ? 1 : 0, duration: 0.5 }); }
    });
  }

  setStep(step) {
    if (step === this.step) return;
    const prev = this.step;
    this.step = step;
    const g = window.gsap;
    const show = (node, on, d = 0) => g ? g.to(node, { opacity: on ? 1 : 0, duration: 0.7, delay: on ? d : 0, ease: 'power2.out', overwrite: true }) : (node.style.opacity = on ? 1 : 0);
    show(this.groups.base, step >= 0);
    show(this.groups.lugares, step >= 0, 0.2);
    show(this.groups.caras, step >= 1);
    show(this.groups.glaciares, step >= 1, 0.25);
    show(this.groups.picos, step >= 2);
    show(this.groups.rutas, step >= 3);
    if (g && step === 2 && prev < 2) {
      g.fromTo(this.picos, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(2)', stagger: 0.08, overwrite: true });
    }
    // textos
    this.pasos.forEach((el, i) => {
      const on = i === step;
      if (this.mobile) return;
      el.classList.toggle('is-on', on || el.classList.contains('is-on'));
      if (g) g.to(el, { opacity: on ? 1 : 0, y: on ? 0 : (i < step ? -30 : 30), duration: on ? 0.8 : 0.45, delay: on ? 0.15 : 0, ease: on ? 'power3.out' : 'power2.in', overwrite: true,
        onComplete: () => { if (!on) el.classList.remove('is-on'); } });
      else { el.style.opacity = on ? 1 : 0; el.classList.toggle('is-on', on); }
    });
  }

  /** móvil: sin fijar; cada texto activa su paso */
  mobileMode() {
    this.mobile = true;
    this.tablero.style.transform = 'none';
    this.setStep(0);
  }

  /** móvil: al llegar al paso de las rutas, se dibujan solas */
  mobileStep(step) {
    this.setStep(step);
    const g = window.gsap;
    const target = step >= 3 ? 1 : 0;
    if (this._mobRoutes === target) return;
    this._mobRoutes = target;
    const proxy = { f: target ? 0 : 1 };
    const apply = () => this.rutas.forEach((r, i) => {
      const f = Math.max(0, Math.min(1, proxy.f * this.rutas.length - i));
      r.line.setAttribute('stroke-dashoffset', 1 - f);
      r.casing.setAttribute('stroke-dashoffset', 1 - f);
      r.label.setAttribute('opacity', f > 0.6 ? 1 : 0);
    });
    if (g) g.to(proxy, { f: target, duration: target ? 2.4 : 0.4, ease: 'power1.inOut', onUpdate: apply });
    else { proxy.f = target; apply(); }
  }
}
