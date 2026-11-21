// Perfil de la ruta Kinshofer: altitud frente a distancia desde el campo base,
// muestreado sobre el relieve real.  Una sola serie: el título la nombra.
// Cruceta + tooltip al pasar (y con el teclado), escalador que sigue al scroll.

import { COTA_CAMPO, NOMBRES_CAMPO } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const fmtKm = (d) => d.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const CORTO = { bc: 'CB', c1: 'C1', c2: 'C2', c3: 'C3', c4: 'C4', cumbre: 'Cumbre' };

export class Perfil {
  constructor(fig, geo) {
    this.fig = fig;
    this.svg = fig.querySelector('.perfil__svg');
    this.tip = fig.querySelector('.perfil__tip');
    this.box = fig.querySelector('.perfil__lienzo');
    this.data = geo.profile;
    this.camps = geo.camps;
    this.maxD = this.data[this.data.length - 1].d;
    this.climbD = 0;
    this._table(fig.querySelector('tbody'));
    this._events();
    this.render();
    new ResizeObserver(() => this.render()).observe(this.box);
  }

  _table(tbody) {
    if (!tbody) return;
    for (const c of this.camps) {
      const tr = document.createElement('tr');
      for (const v of [NOMBRES_CAMPO[c.id] || c.nombre, `${COTA_CAMPO[c.id]} m`, `${fmtKm(c.d)} km`]) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  render() {
    const W = this.box.clientWidth, H = this.box.clientHeight;
    if (!W || !H) return;
    this.W = W; this.H = H;
    const m = this.m = { l: 44, r: W < 400 ? 22 : 30, t: 26, b: 22 };
    const y0 = 3800, y1 = 8400;
    this.sx = (d) => m.l + (d / this.maxD) * (W - m.l - m.r);
    this.sy = (z) => m.t + (1 - (z - y0) / (y1 - y0)) * (H - m.t - m.b);
    const s = this.svg;
    s.textContent = '';
    s.setAttribute('viewBox', `0 0 ${W} ${H}`);
    s.setAttribute('tabindex', '0');
    const defs = el('defs', {}, s);
    const clip = el('clipPath', { id: 'pf-clip' }, defs);
    this.clipRect = el('rect', { x: 0, y: 0, height: H, width: this.sx(this.climbD) }, clip);
    // rejilla y ejes (finos, recesivos)
    for (let z = 4000; z <= 8000; z += 1000) {
      el('line', { class: 'pf-grid', x1: m.l, x2: W - m.r, y1: this.sy(z), y2: this.sy(z) }, s);
      const t = el('text', { class: 'pf-eje', x: m.l - 8, y: this.sy(z) + 4, 'text-anchor': 'end' }, s);
      t.textContent = z;
    }
    for (let d = 0; d <= this.maxD; d += 2) {
      const t = el('text', { class: 'pf-eje', x: this.sx(d), y: H - 4, 'text-anchor': d === 0 ? 'start' : 'middle' }, s);
      t.textContent = d === 0 ? '0 km' : String(d);
    }
    // serie
    const pts = this.data.map((p) => [this.sx(p.d), this.sy(p.z)]);
    const line = 'M' + pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' L');
    el('path', { class: 'pf-area', d: `${line} L${pts[pts.length - 1][0].toFixed(1)},${this.sy(y0)} L${pts[0][0].toFixed(1)},${this.sy(y0)} Z` }, s);
    el('path', { class: 'pf-linea-base', d: line }, s);
    el('path', { class: 'pf-linea', d: line, 'clip-path': 'url(#pf-clip)' }, s);
    // campos: marcador + etiqueta corta (selectiva: son la historia del perfil)
    for (const c of this.camps) {
      const x = this.sx(c.d), y = this.sy(c.z);
      el('circle', { class: 'pf-campo', cx: x, cy: y, r: 4 }, s);
      const a = c.id === 'bc' ? 'start' : c.id === 'cumbre' ? 'end' : 'middle';
      const t = el('text', { class: 'pf-campo-txt', x: c.id === 'cumbre' ? x + 4 : x, y: y - 11, 'text-anchor': a }, s);
      t.textContent = CORTO[c.id];
    }
    // cruceta
    this.cruz = el('line', { class: 'pf-cruz', y1: m.t - 6, y2: H - m.b }, s);
    this.cruzP = el('circle', { class: 'pf-cruz-punto', r: 4.5 }, s);
    // escalador
    this.esc = el('circle', { class: 'pf-escalador', r: 5.5 }, s);
    this.setClimber(this.climbD, true);
  }

  zAt(d) {
    const a = this.data;
    let i = 1;
    while (i < a.length - 1 && a[i].d < d) i++;
    const p = a[i - 1], q = a[i];
    const t = q.d === p.d ? 0 : Math.min(1, Math.max(0, (d - p.d) / (q.d - p.d)));
    return p.z + (q.z - p.z) * t;
  }

  setClimber(d, force = false) {
    d = Math.max(0, Math.min(this.maxD, d));
    if (!force && Math.abs(d - this.climbD) < 1e-4) return;
    this.climbD = d;
    if (!this.sx) return;
    this.clipRect.setAttribute('width', this.sx(d));
    this.esc.setAttribute('cx', this.sx(d));
    this.esc.setAttribute('cy', this.sy(this.zAt(d)));
  }

  _tramo(d) {
    const cs = this.camps;
    for (let i = 0; i < cs.length; i++) {
      if (Math.abs(cs[i].d - d) < this.maxD * 0.02) return NOMBRES_CAMPO[cs[i].id];
      if (i < cs.length - 1 && d > cs[i].d && d < cs[i + 1].d) return `entre ${CORTO[cs[i].id]} y ${CORTO[cs[i + 1].id]}`;
    }
    return '';
  }

  _show(d) {
    const x = this.sx(d), z = this.zAt(d), y = this.sy(z);
    this.cruz.setAttribute('x1', x); this.cruz.setAttribute('x2', x); this.cruz.style.opacity = 1;
    this.cruzP.setAttribute('cx', x); this.cruzP.setAttribute('cy', y); this.cruzP.style.opacity = 1;
    this.tip.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = `${Math.round(z)} m`;
    const span = document.createElement('span');
    const key = document.createElement('i');
    span.append(key, document.createTextNode(`km ${fmtKm(d)} · ${this._tramo(d)}`));
    this.tip.append(strong, span);
    const left = Math.min(Math.max(x, 70), this.W - 70);
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${y}px`;
    this.tip.style.opacity = 1;
  }

  _hide() {
    if (!this.cruz) return;
    this.cruz.style.opacity = 0; this.cruzP.style.opacity = 0; this.tip.style.opacity = 0;
  }

  _events() {
    const s = this.svg;
    s.addEventListener('pointermove', (e) => {
      const r = s.getBoundingClientRect();
      const x = e.clientX - r.left;
      const d = ((x - this.m.l) / (this.W - this.m.l - this.m.r)) * this.maxD;
      if (d < -0.2 || d > this.maxD + 0.2) return this._hide();
      this._show(Math.max(0, Math.min(this.maxD, d)));
    });
    s.addEventListener('pointerleave', () => this._hide());
    // teclado: flechas recorren el perfil, Inicio/Fin a los extremos
    let kd = 0;
    s.addEventListener('keydown', (e) => {
      const step = this.maxD / 40;
      if (e.key === 'ArrowRight') kd = Math.min(this.maxD, kd + step);
      else if (e.key === 'ArrowLeft') kd = Math.max(0, kd - step);
      else if (e.key === 'Home') kd = 0;
      else if (e.key === 'End') kd = this.maxD;
      else return;
      e.preventDefault();
      this._show(kd);
    });
    s.addEventListener('focus', () => this._show(kd));
    s.addEventListener('blur', () => this._hide());
  }
}
