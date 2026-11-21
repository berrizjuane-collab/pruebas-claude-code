// Lo que se dibuja encima de las láminas: etiquetas de cumbres ancladas a la
// imagen (siguen al encuadre), la ruta Kinshofer vista desde el campo base,
// la cota de la pared Rupal y el minimapa con el cono de visión de la cámara.

import { ETIQUETAS, LAMINAS, NOMBRES_CAMPO } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const APROX = new Set(['plateau', 'sattel', 'antecima', 'bazhin', 'hombro']);   // cotas de la literatura, no del DEM

export class Overlays {
  constructor(svg, stage, geo) {
    this.svg = svg;
    this.stage = stage;
    this.geo = geo;
    this.peaks = Object.fromEntries(geo.peaks.map((p) => [p.id, p]));
    this.sets = {};
    for (const [lam, ids] of Object.entries(ETIQUETAS)) this.sets[lam] = this._buildLabels(lam, ids);
    this._buildRoute();
    this._buildBracket();
    this.active = null;
  }

  _buildLabels(lam, ids) {
    const g = el('g', { class: 'et-set' }, this.svg);
    const proj = this.geo.proj[lam].peaks;
    const items = [];
    ids.forEach((id, n) => {
      const p = proj.find((q) => q.id === id);
      const meta = this.peaks[id];
      if (!p || !meta || !p.vis) return;
      const grp = el('g', { class: 'et' }, g);
      const line = el('line', { class: 'et__linea' }, grp);
      const dot = el('circle', { class: 'et__punto', r: 4.5 }, grp);
      const name = el('text', { class: 'et__nombre' }, grp);
      name.textContent = meta.nombre;
      const alt = el('text', { class: 'et__alt' }, grp);
      alt.textContent = (APROX.has(id) ? '≈' : '') + meta.alt + ' m';
      items.push({ grp, line, dot, name, alt, u: p.u, v: p.v, L: 56 + (n % 2) * 40 });
    });
    return { lam, g, items };
  }

  _buildRoute() {
    const g = el('g', { class: 'ruta-ov', opacity: 0 }, this.svg);
    this.route = {
      g,
      hidden: el('path', { class: 'ruta-ov__oculta' }, g),
      casing: el('path', { class: 'ruta-ov__casing' }, g),
      line: el('path', { class: 'ruta-ov__linea' }, g),
      camps: [],
    };
    const pts = this.geo.proj.diamir.routes.kinshofer.filter(([u, v]) => u > -0.05 && u < 1.05 && v > -0.05 && v < 1.05);
    this.route.pts = pts;
    for (const c of this.geo.proj.diamir.camps) {
      if (!c.vis || c.u < 0 || c.u > 1) continue;
      const cg = el('g', { class: 'ruta-ov__c' }, g);
      const dot = el('circle', { class: 'ruta-ov__campo', r: c.id === 'cumbre' ? 6 : 5 }, cg);
      const tx = el('text', { class: 'ruta-ov__txt' }, cg);
      tx.textContent = c.id === 'cumbre' ? 'Cumbre' : (NOMBRES_CAMPO[c.id] || c.id).replace('Campo ', 'C');
      // posición del campo a lo largo de la ruta (para que aparezca cuando la línea llega)
      let best = 0, bd = 1e9;
      pts.forEach(([u, v], i) => { const d = (u - c.u) ** 2 + (v - c.v) ** 2; if (d < bd) { bd = d; best = i; } });
      this.route.camps.push({ g: cg, dot, tx, u: c.u, v: c.v, at: best / Math.max(1, pts.length - 1), id: c.id });
    }
  }

  _buildBracket() {
    const g = el('g', { class: 'cota-g', opacity: 0 }, this.svg);
    const nanga = this.geo.proj.rupal.peaks.find((p) => p.id === 'nanga');
    const m = this.geo.proj.rupal.routes.messner;
    const base = m.find((q) => q[2] && q[0] > 0 && q[0] < 1) || [nanga.u, 0.6];
    this.bracket = {
      g, top: [nanga.u, nanga.v], bottom: [nanga.u, Math.max(base[1], 0.55)],
      line: el('line', { class: 'cota__linea' }, g),
      t1: el('line', { class: 'cota__linea' }, g),
      t2: el('line', { class: 'cota__linea' }, g),
      txt: el('text', { class: 'cota' }, g),
      sub: el('text', { class: 'et__alt' }, g),
    };
    this.bracket.txt.textContent = '4600 m';
    this.bracket.sub.textContent = 'DE PARED';
  }

  /** info del director en cada fotograma */
  update(info) {
    const { shot, settled, frame, k } = info;
    const lam = settled && shot.labels ? shot.labels : null;
    const W = window.innerWidth;
    // etiquetas
    for (const set of Object.values(this.sets)) {
      const on = lam === set.lam;
      if (on) {
        for (const it of set.items) {
          const [x, y] = this.stage.toScreen(set.lam, frame, it.u, it.v);
          const L = it.L * (W < 700 ? 0.75 : 1);
          // hacia arriba si cabe bajo la cabecera; si no, hacia abajo
          const up = y - L - 40 > 84;
          const s = up ? -1 : 1;
          it.line.setAttribute('x1', x); it.line.setAttribute('y1', y + s * 6);
          it.line.setAttribute('x2', x); it.line.setAttribute('y2', y + s * L);
          it.dot.setAttribute('cx', x); it.dot.setAttribute('cy', y);
          const anchor = x < 110 ? 'start' : x > W - 110 ? 'end' : 'middle';
          const tx = anchor === 'start' ? x - 4 : anchor === 'end' ? x + 4 : x;
          for (const t of [it.name, it.alt]) { t.setAttribute('text-anchor', anchor); t.setAttribute('x', tx); }
          it.name.setAttribute('y', up ? y - L - 22 : y + L + 18);
          it.alt.setAttribute('y', up ? y - L - 6 : y + L + 34);
          // fuera de la pantalla (encuadres estrechos), la etiqueta no se muestra
          const fits = x > 12 && x < W - 12 && y > 70 && y < window.innerHeight - 20;
          it.grp.style.display = fits ? '' : 'none';
        }
      }
      if (set._on !== on) {
        set._on = on;
        set.items.forEach((it, n) => {
          clearTimeout(it._t);
          if (on) it._t = setTimeout(() => it.grp.classList.add('is-on'), 120 + n * 140);
          else it.grp.classList.remove('is-on');
        });
      }
    }
    // cota de la Rupal
    const bOn = lam === 'rupal';
    if (bOn) {
      const b = this.bracket;
      const [x0, y0] = this.stage.toScreen('rupal', frame, b.top[0], b.top[1]);
      const [, y1] = this.stage.toScreen('rupal', frame, b.bottom[0], b.bottom[1]);
      const x = Math.min(x0 + Math.max(70, W * 0.06), W - 90);
      const yt = Math.max(y0, 80);
      b.line.setAttribute('x1', x); b.line.setAttribute('x2', x); b.line.setAttribute('y1', yt); b.line.setAttribute('y2', y1);
      b.t1.setAttribute('x1', x - 7); b.t1.setAttribute('x2', x + 7); b.t1.setAttribute('y1', yt); b.t1.setAttribute('y2', yt);
      b.t2.setAttribute('x1', x - 7); b.t2.setAttribute('x2', x + 7); b.t2.setAttribute('y1', y1); b.t2.setAttribute('y2', y1);
      b.txt.setAttribute('x', x + 12); b.txt.setAttribute('y', (yt + y1) / 2);
      b.sub.setAttribute('x', x + 12); b.sub.setAttribute('y', (yt + y1) / 2 + 17);
    }
    if (this._bOn !== bOn) {
      this._bOn = bOn;
      this.bracket.g.style.transition = 'opacity .7s ease';
      this.bracket.g.setAttribute('opacity', bOn ? 1 : 0);
    }
    // ruta sobre la lámina 3
    const rOn = settled && shot.route === 'diamir';
    if (rOn) this._drawRoute(frame, clamp(k / 0.5));
    if (this._rOn !== rOn) {
      this._rOn = rOn;
      this.route.g.style.transition = 'opacity .6s ease';
      this.route.g.setAttribute('opacity', rOn ? 1 : 0);
    }
  }

  _drawRoute(frame, prog) {
    const r = this.route;
    const n = r.pts.length;
    const upto = prog * (n - 1);
    let dVis = '', dHid = '', penVis = false, penHid = false;
    for (let i = 0; i < n; i++) {
      if (i > Math.ceil(upto)) break;
      let [u, v, vis] = r.pts[i];
      if (i === Math.ceil(upto) && i > 0) {            // tramo parcial
        const f = upto - Math.floor(upto);
        const [pu, pv] = r.pts[i - 1];
        u = pu + (u - pu) * f; v = pv + (v - pv) * f;
      }
      const [x, y] = this.stage.toScreen('diamir', frame, u, v);
      const p = `${x.toFixed(1)},${y.toFixed(1)}`;
      if (vis) { dVis += (penVis ? ' L' : ' M') + p; penVis = true; } else penVis = false;
      if (!vis) { dHid += (penHid ? ' L' : ' M') + p; penHid = true; } else { if (penHid) dHid += ' L' + p; penHid = false; }
    }
    r.line.setAttribute('d', dVis);
    r.casing.setAttribute('d', dVis);
    r.hidden.setAttribute('d', dHid);
    for (const c of r.camps) {
      const [x, y] = this.stage.toScreen('diamir', frame, c.u, c.v);
      c.dot.setAttribute('cx', x); c.dot.setAttribute('cy', y);
      c.tx.setAttribute('x', x + 11); c.tx.setAttribute('y', y + 4);
      const on = prog >= c.at - 0.01;
      if (c._on !== on) { c._on = on; c.g.style.transition = 'opacity .4s ease'; c.g.setAttribute('opacity', on ? 1 : 0); }
    }
  }
}

// ─────────────────────────────────────────────── minimapa
export class Minimap {
  constructor(root, geo) {
    this.root = root;
    this.svg = root.querySelector('svg');
    this.lugar = root.querySelector('.minimapa__lugar');
    this.dato = root.querySelector('.minimapa__dato');
    this.b = geo.bounds;
    this.W = 2000; this.H = 2121;
    this.svg.setAttribute('viewBox', `0 ${(this.H - this.W) / 2} ${this.W} ${this.W}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    const [sx, sy] = this.px(-0.023, 0.207);
    this.cone = el('path', { class: 'mm__cono' }, this.svg);
    el('path', { class: 'mm__cima', d: `M ${sx} ${sy - 44} L ${sx + 40} ${sy + 28} L ${sx - 40} ${sy + 28} Z` }, this.svg);
    this.cam = el('circle', { class: 'mm__cam', r: 44 }, this.svg);
    this.cur = null;
    this.state = null;
  }

  px(x, y) {
    const b = this.b;
    return [(x - b.x0) / (b.x1 - b.x0) * this.W, (b.y1 - y) / (b.y1 - b.y0) * this.H];
  }

  _draw(s) {
    const [cx, cy] = this.px(s.x, s.y);
    const R = 620;
    const a0 = (s.az - s.fov / 2) * Math.PI / 180, a1 = (s.az + s.fov / 2) * Math.PI / 180;
    const p0 = [cx + Math.sin(a0) * R, cy - Math.cos(a0) * R];
    const p1 = [cx + Math.sin(a1) * R, cy - Math.cos(a1) * R];
    this.cone.setAttribute('d', `M ${cx} ${cy} L ${p0[0]} ${p0[1]} A ${R} ${R} 0 0 1 ${p1[0]} ${p1[1]} Z`);
    this.cam.setAttribute('cx', cx); this.cam.setAttribute('cy', cy);
  }

  set(id) {
    const on = !!(id && LAMINAS[id]?.cam);
    if (on !== this._on) { this._on = on; this.root.classList.toggle('is-on', on); }
    if (!on || id === this.cur) return;
    this.cur = id;
    const L = LAMINAS[id];
    const target = { ...L.cam };
    this.lugar.textContent = L.titulo;
    this.dato.textContent = `mira al ${String(L.cam.az).padStart(3, '0')}° · ${L.cam.alt} m`;
    if (!this.state) { this.state = { ...target }; this._draw(this.state); return; }
    // giro por el camino corto
    let da = ((target.az - this.state.az + 540) % 360) - 180;
    target.az = this.state.az + da;
    const g = window.gsap;
    if (g) g.to(this.state, { ...target, duration: 1.1, ease: 'power3.inOut', overwrite: true, onUpdate: () => this._draw(this.state) });
    else { Object.assign(this.state, target); this._draw(this.state); }
  }
}
