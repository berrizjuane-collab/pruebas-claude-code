/* Un área, dos mundos — animación determinista: todo el cuadro es función pura de t.
   ∫_{-∞}^{0} e^x √(1+e^x) dx  ──(e^{x/2} = tan θ)──▶  ∫_{0}^{π/4} 2 tanθ sec³θ dθ = ⅔(2√2 − 1) */
(() => {
'use strict';

const W = 1920, H = 1080, DUR = 106;
const RENDER = /[?&]render/.test(location.search);
if (RENDER) document.body.classList.add('render');

const stage = document.getElementById('stage');
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const dom = document.getElementById('dom');
const fadeEl = document.getElementById('fade');

/* ───────────── utilidades de tiempo ───────────── */
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, u) => a + (b - a) * u;
const P = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  lin: u => u,
  i2: u => u * u,
  o2: u => 1 - (1 - u) * (1 - u),
  io2: u => (u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
  o3: u => 1 - Math.pow(1 - u, 3),
  io3: u => (u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  o5: u => 1 - Math.pow(1 - u, 5),
  oB: u => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },
};
const tw = (t, a, b, e = E.io3) => e(P(t, a, b));
// pista de fotogramas clave: [[tiempo, valor, ease-de-llegada], ...]
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const k0 = keys[i - 1], k1 = keys[i];
      return lerp(k0[1], k1[1], (k1[2] || E.io3)(P(t, k0[0], k1[0])));
    }
  }
  return keys[keys.length - 1][1];
}
const env = (t, a, b, di = .6, dout = .45) =>
  (t < a || t > b ? 0 : Math.min(E.o3(P(t, a, a + di)), 1 - E.i2(P(t, b - dout, b))));

/* ───────────── las matemáticas ───────────── */
const TH = Math.PI / 4;
const f = x => Math.exp(x) * Math.sqrt(1 + Math.exp(x));        // mundo exponencial
const F = x => (2 / 3) * Math.pow(1 + Math.exp(x), 1.5);         // su primitiva
const g = th => 2 * Math.tan(th) / Math.pow(Math.cos(th), 3);    // mundo circular
const G = th => (2 / 3) / Math.pow(Math.cos(th), 3);             // su primitiva
const thOf = x => Math.atan(Math.exp(x / 2));                    // el puente: tanθ = e^{x/2}
const xOf = th => 2 * Math.log(Math.tan(th));
const AREA = (2 / 3) * (2 * Math.SQRT2 - 1);                     // 1.218951…

/* ───────────── color ───────────── */
const C = { ink: '#eef1f8', dim: '#8d95ab', warm: '#ff9a3c', coral: '#ff6f91', gold: '#ffd166', cyan: '#4de3ff', silver: '#dfe5f2' };
const STOPS = [[0, [255, 209, 102]], [-1.2, [255, 154, 60]], [-2.4, [255, 111, 145]], [-4, [200, 107, 255]], [-6.5, [111, 123, 255]]];
function colAt(x) {
  if (x >= 0) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    if (x >= STOPS[i][0]) {
      const u = (x - STOPS[i][0]) / (STOPS[i - 1][0] - STOPS[i][0]);
      return STOPS[i][1].map((c, j) => lerp(c, STOPS[i - 1][1][j], u));
    }
  }
  return STOPS[STOPS.length - 1][1];
}
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/* ───────────── pistas de cámara / disposición ───────────── */
// gráfico del mundo exponencial
function p1(t) {
  if (t < 53) {
    const k = tw(t, 22.8, 24.6);
    const pan = kf(t, [[14.9, 0], [17.6, 7, E.io2], [18.5, 7], [19.8, 0, E.io3]]);
    return {
      ox: lerp(1560, 860, k) + pan * 190, oy: lerp(790, 680, k), sx: lerp(190, 115, k), sy: lerp(300, 200, k),
      a: Math.min(tw(t, 8.6, 9.4), 1 - tw(t, 52, 52.9)),
    };
  }
  return { ox: 1010, oy: 790, sx: 150, sy: 240, a: Math.min(tw(t, 66.4, 67.8), lerp(1, .13, tw(t, 97, 98.2))) };
}
// gráfico del mundo circular (misma escala de área en píxeles: 480·75 = 150·240)
const PL2 = { ox: 1330, oy: 790, sx: 480, sy: 75 };
// triángulo / círculo
function cir(t) {
  return {
    cx: kf(t, [[52, 1230], [53.6, 1540], [66, 1540], [68, 960]]),
    cy: kf(t, [[52, 680], [53.6, 450], [66, 450], [68, 262]]),
    R: kf(t, [[52, 270], [53.6, 200], [66, 200], [68, 92]]),
    a: Math.min(tw(t, 28.5, 29.1), 1 - tw(t, 97, 98)) * (t > 65.7 && t < 68.5 ? Math.max(1 - P(t, 65.8, 66.4), P(t, 67.7, 68.4)) : 1),
  };
}
function theta(t) {
  if (t < 35.2) return kf(t, [[30.4, .70], [32.6, .27, E.io2], [35.2, .62, E.io2]]);
  if (t < 52) return kf(t, [[41, .62], [43.2, .004], [43.7, .004], [48.7, TH, E.io2]]);
  if (t < 85.4) return kf(t, [[52, TH], [53.6, .6]]);
  return kf(t, [[85.4, .6], [86.6, .003], [86.9, .003], [91.9, TH, E.io2]]);
}
const worldMix = t => kf(t, [[35, 0], [37, .5], [83, .5], [85, 1], [97, 1], [99, .5]]);

/* ───────────── rebanadas ───────────── */
const NS = 64, DX = 0.125, HERO = 11;
const strips = [];
for (let i = 0; i < NS; i++) {
  const xb = -i * DX, xa = xb - DX;
  const tha = thOf(xa), thb = thOf(xb);
  const rank = i < HERO ? i : i - 1;
  strips.push({
    i, xa, xb, tha, dth: thb - tha, area: F(xb) - F(xa), col: colAt((xa + xb) / 2),
    u: i === HERO ? (t => tw(t, 70.6, 73.5)) : (t => tw(t, 75 + rank * .055, 76.5 + rank * .055)),
  });
}

/* ───────────── dibujo: primitivas ───────────── */
function glowStroke(color, lw, a = 1, glow = 1) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
  const ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = ga * a * .08 * glow; ctx.lineWidth = lw * 7; ctx.stroke();
  ctx.globalAlpha = ga * a * .18 * glow; ctx.lineWidth = lw * 3; ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = ga * a; ctx.lineWidth = lw; ctx.stroke();
  ctx.restore();
}
function seg(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
function line(x1, y1, x2, y2, color, lw = 2, a = 1, dash) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  seg(x1, y1, x2, y2); ctx.stroke(); ctx.restore();
}
function dot(x, y, r, color, a = 1, halo = 3.2) {
  ctx.save(); ctx.globalAlpha *= a;
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r * halo);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= .55; ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(x, y, r * halo, 0, 7); ctx.fill();
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha /= .55; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.fillStyle = color; ctx.globalAlpha *= .55; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.restore();
}
function txt(s, x, y, o = {}) {
  ctx.save();
  ctx.globalAlpha *= o.a ?? 1; ctx.font = o.font || '22px KaTeX_Main'; ctx.fillStyle = o.color || C.dim;
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle';
  ctx.fillText(s, x, y); ctx.restore();
}
function arrowHead(x, y, ang, size, color, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-size, -size * .42); ctx.lineTo(-size, size * .42); ctx.closePath(); ctx.fill();
  ctx.restore();
}
const fmtMinus = v => (v < 0 ? '\u2212' + Math.abs(v) : '' + v);

/* ───────────── fondo ───────────── */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let r = Math.imul(seed ^ seed >>> 15, 1 | seed); r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r; return ((r ^ r >>> 14) >>> 0) / 4294967296; }; }
const rnd = rng(7);
const motes = Array.from({ length: 80 }, () => ({ x: rnd() * W, y: rnd() * H, v: 6 + rnd() * 16, r: .6 + rnd() * 1.7, ph: rnd() * 7, w: .5 + rnd() }));
function drawBG(t) {
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#06070d'; ctx.fillRect(0, 0, W, H);
  const w = worldMix(t);
  let gr = ctx.createRadialGradient(330, 940, 0, 330, 940, 1150);
  gr.addColorStop(0, `rgba(255,128,56,${.035 + .17 * (1 - w)})`); gr.addColorStop(1, 'rgba(255,128,56,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  gr = ctx.createRadialGradient(1600, 150, 0, 1600, 150, 1150);
  gr.addColorStop(0, `rgba(54,170,255,${.035 + .18 * w})`); gr.addColorStop(1, 'rgba(54,170,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  // retícula a la deriva
  ctx.strokeStyle = 'rgba(255,255,255,.028)'; ctx.lineWidth = 1; ctx.beginPath();
  const off = (t * 5) % 96;
  for (let x = -96 + off; x < W + 96; x += 96) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 96 - off * .5; y < H + 96; y += 96) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  // polvo
  for (const m of motes) {
    const y = ((m.y - t * m.v) % H + H) % H, x = m.x + Math.sin(t * .3 * m.w + m.ph) * 18;
    ctx.fillStyle = `rgba(${lerp(255, 150, w) | 0},${lerp(200, 215, w) | 0},${lerp(160, 255, w) | 0},${.1 + .16 * (.5 + .5 * Math.sin(t * m.w + m.ph))})`;
    ctx.beginPath(); ctx.arc(x, y, m.r, 0, 7); ctx.fill();
  }
}
function drawVignette() {
  const gr = ctx.createRadialGradient(W / 2, H / 2, 520, W / 2, H / 2, 1150);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.6)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
}

/* ───────────── escena 0: gancho y título ───────────── */
function drawHook(t) {
  const a = env(t, .2, 4.5, .6, .6); if (a <= 0) return;
  const yOf = px => 830 - 540 * Math.exp((px - 1840) / 310);
  const end = lerp(1930, -60, tw(t, .3, 3.7, E.io2));
  ctx.save(); ctx.globalAlpha = a;
  line(0, 830, W, 830, '#fff', 1.5, .13);
  ctx.beginPath();
  for (let px = 1930; px >= end; px -= 4) ctx[px === 1930 ? 'moveTo' : 'lineTo'](px, yOf(px));
  glowStroke(C.warm, 4, .85);
  if (end > -40) dot(end, yOf(end), 7, C.gold);
  ctx.restore();
}
function drawTitleArt(t) {
  const a = env(t, 4.5, 8.7, .9, .6); if (a <= 0) return;
  const pr = tw(t, 4.6, 7.2, E.io2);
  ctx.save(); ctx.globalAlpha = a * .55;
  // curva exponencial a la izquierda
  ctx.beginPath();
  const x1 = lerp(-20, 760, pr);
  for (let px = -20; px <= x1; px += 4) ctx[px === -20 ? 'moveTo' : 'lineTo'](px, 880 - 620 * Math.exp((px - 760) / 190));
  glowStroke(C.warm, 3, .7);
  // arco de círculo a la derecha
  ctx.beginPath(); ctx.arc(1560, 560, 360, Math.PI * .5, Math.PI * .5 - Math.PI * 2 * pr, true);
  glowStroke(C.cyan, 3, .6);
  ctx.restore();
}

/* ───────────── mundo exponencial ───────────── */
function path1(p, xa, xb, close) {
  const n = Math.max(2, Math.ceil((xb - xa) * p.sx / 2));
  ctx.beginPath();
  for (let j = 0; j <= n; j++) {
    const x = xa + (xb - xa) * j / n;
    ctx[j ? 'lineTo' : 'moveTo'](p.ox + x * p.sx, p.oy - f(x) * p.sy);
  }
  if (close) { ctx.lineTo(p.ox + xb * p.sx, p.oy); ctx.lineTo(p.ox + xa * p.sx, p.oy); ctx.closePath(); }
}
function fill1(p, xa, xb, alpha) {
  if (xb - xa < 1e-4 || alpha <= .002) return;
  const gr = ctx.createLinearGradient(p.ox - 6.5 * p.sx, 0, p.ox, 0);
  for (const [x, c] of STOPS) gr.addColorStop(clamp((x + 6.5) / 6.5), rgb(c, 1));
  ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = gr; path1(p, xa, xb, true); ctx.fill(); ctx.restore();
}
function drawPlot1(t) {
  const p = p1(t); if (p.a <= .003) return;
  const LEFT = 64, xl = (LEFT - p.ox) / p.sx;
  const axp = t < 20 ? tw(t, 8.7, 10.3, E.io2) : 1;
  const cvp = t < 20 ? tw(t, 10.2, 12.7, E.io2) : 1;
  const xm = xOf(theta(t));
  ctx.save(); ctx.globalAlpha = p.a;

  // rellenos
  let ghost = 0, bright = null;
  const pulse = .22 * env(t, 92.2, 93.6, .15, 1.2);
  if (t < 22.8) { if (t > 12.7) bright = [lerp(0, xl, tw(t, 12.7, 14.5, E.io2)), 0, .62]; }
  else if (t < 53) { ghost = lerp(.62, .2, tw(t, 22.8, 24.2)); if (t > 43.4) bright = [xl, Math.min(0, xm), .62]; }
  else {
    ghost = .07;
    if (t < 69.7) bright = [xl, 0, .62 * (1 - tw(t, 68.7, 69.7))];
    if (t >= 86.6) bright = [xl, Math.min(0, xm), .62 + pulse];
  }
  if (ghost > 0) fill1(p, xl, 0, ghost);
  if (bright) fill1(p, Math.max(xl, bright[0]), bright[1], bright[2]);

  // ejes
  const xr = p.ox + .45 * p.sx;
  const grx = ctx.createLinearGradient(LEFT, 0, LEFT + 200, 0);
  grx.addColorStop(0, 'rgba(255,255,255,0)'); grx.addColorStop(1, 'rgba(255,255,255,.55)');
  ctx.strokeStyle = grx; ctx.lineWidth = 2; ctx.lineCap = 'round';
  seg(Math.min(xr, W + 50), p.oy, lerp(Math.min(xr, W + 50), LEFT, axp), p.oy); ctx.stroke();
  if (axp > .02 && xr < W) arrowHead(xr + 12, p.oy, 0, 13, 'rgba(255,255,255,.55)');
  const ytop = p.oy - 1.72 * p.sy * axp;
  line(p.ox, p.oy + 8, p.ox, ytop, 'rgba(255,255,255,.55)', 2);
  if (axp > .9) arrowHead(p.ox, ytop - 12, -Math.PI / 2, 13, 'rgba(255,255,255,.55)', P(axp, .9, 1));
  const fs = Math.round(lerp(19, 24, clamp((p.sx - 115) / 75)));
  for (let k = 0; -k >= xl - 1; k++) {
    const px = p.ox - k * p.sx; if (px > W + 40) continue;
    const a = clamp((px - LEFT - 20) / 110) * axp; if (a <= 0) continue;
    line(px, p.oy - 6, px, p.oy + 6, '#fff', 1.5, .5 * a);
    txt(fmtMinus(-k), px, p.oy + 30, { font: `${fs}px KaTeX_Main`, a: .85 * a });
  }
  txt('x', xr + 4, p.oy + 30, { font: `italic ${fs + 6}px KaTeX_Math`, color: C.ink, a: axp * (xr < W ? 1 : 0) });
  txt('\u2212\u221e', LEFT + 34, p.oy - 26, { font: `${fs + 4}px KaTeX_Main`, color: C.ink, a: .8 * axp });
  arrowHead(LEFT - 4, p.oy - 26, Math.PI, 10, C.ink, .7 * axp);
  if (cvp >= 1) {
    const a = t < 20 ? tw(t, 12.6, 13.2) : 1;
    for (const [v, s] of [[1, '1'], [Math.SQRT2, '\u221a2']]) {
      line(p.ox - 6, p.oy - v * p.sy, p.ox + 6, p.oy - v * p.sy, '#fff', 1.5, .5 * a);
      txt(s, p.ox + 16, p.oy - v * p.sy, { font: `${fs}px KaTeX_Main`, align: 'left', a: .85 * a });
    }
  }

  // la curva
  if (cvp > 0) {
    const xe = lerp(xl, 0, cvp);
    path1(p, xl, xe); glowStroke(C.warm, 4.5);
    if (cvp < 1) dot(p.ox + xe * p.sx, p.oy - f(xe) * p.sy, 8, C.gold);
  }

  // marcador x (ligado al triángulo)
  const mk = t < 53 ? tw(t, 29, 29.8) : (t >= 86.6 ? 1 - tw(t, 92.6, 93.4) : 0);
  const mx = p.ox + xm * p.sx;
  if (mk > 0 && mx > LEFT + 6) {
    const my = p.oy - f(xm) * p.sy, a = mk * clamp((mx - LEFT - 6) / 60);
    line(mx, p.oy, mx, my, '#fff', 1.6, .55 * a, [5, 6]);
    dot(mx, p.oy, 5, '#fff', a, 2.4);
    dot(mx, my, 7.5, C.gold, a);
    if (t < 53) txt('x', mx, p.oy + 62, { font: 'italic 30px KaTeX_Math', color: C.gold, a });
  }
  ctx.restore();
  drawLens(t, p);
}
function drawLens(t, p) {
  const a = env(t, 14.3, 18.35, .5, .35); if (a <= 0) return;
  const cx = 640, cy = 500, r = 128 * lerp(.55, 1, E.oB(P(t, 14.3, 14.95)));
  const xc = (cx - p.ox) / p.sx, zoom = Math.exp(-xc);
  ctx.save(); ctx.globalAlpha = a;
  line(cx, cy + r, cx, p.oy - 12, '#fff', 1.5, .5, [4, 7]);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, p.oy, 11, 0, 7); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
  ctx.fillStyle = 'rgba(9,11,22,.94)'; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  const y0 = cy + 58, col = colAt(xc);
  const yL = px => y0 - 66 * Math.exp((px - cx) / 105);
  ctx.beginPath(); ctx.moveTo(cx - r, y0);
  for (let px = cx - r; px <= cx + r; px += 3) ctx.lineTo(px, yL(px));
  ctx.lineTo(cx + r, y0); ctx.closePath(); ctx.fillStyle = rgb(col, .5); ctx.fill();
  line(cx - r, y0, cx + r, y0, '#fff', 1.5, .5);
  ctx.beginPath(); for (let px = cx - r; px <= cx + r; px += 3) ctx[px === cx - r ? 'moveTo' : 'lineTo'](px, yL(px));
  glowStroke(C.warm, 3.5);
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); glowStroke('#ffffff', 2.5, .9, .7);
  const z = String(Math.round(zoom)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  txt('ZOOM VERTICAL', cx, cy - r - 62, { font: '600 15px Inter', color: C.dim });
  txt('\u00d7' + z, cx, cy - r - 30, { font: '500 34px Inter', color: C.ink });
  ctx.restore();
}

/* ───────────── mundo circular ───────────── */
function path2(tha, thb, close) {
  const p = PL2, n = Math.max(2, Math.ceil((thb - tha) * p.sx / 2));
  ctx.beginPath();
  for (let j = 0; j <= n; j++) {
    const th = tha + (thb - tha) * j / n;
    ctx[j ? 'lineTo' : 'moveTo'](p.ox + th * p.sx, p.oy - g(th) * p.sy);
  }
  if (close) { ctx.lineTo(p.ox + thb * p.sx, p.oy); ctx.lineTo(p.ox + tha * p.sx, p.oy); ctx.closePath(); }
}
function fill2(tha, thb, alpha) {
  if (thb - tha < 1e-4 || alpha <= .002) return;
  const p = PL2, gr = ctx.createLinearGradient(p.ox, 0, p.ox + TH * p.sx, 0);
  for (let j = 0; j <= 14; j++) gr.addColorStop(j / 14, rgb(colAt(xOf(Math.max(.012, j / 14 * TH))), 1));
  ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = gr; path2(tha, thb, true); ctx.fill(); ctx.restore();
}
function drawPlot2(t) {
  if (t < 66.9) return;
  const p = PL2, a = Math.min(tw(t, 67, 68.4), lerp(1, .13, tw(t, 97, 98.2)));
  const axp = tw(t, 67, 68.8, E.io2), th = theta(t);
  ctx.save(); ctx.globalAlpha = a;
  const pulse = .22 * env(t, 92.2, 93.6, .15, 1.2);
  if (t >= 83.4) {
    fill2(0, TH, .07);
    if (t < 86.6) fill2(0, TH, .62 * tw(t, 83.4, 84.6) * (1 - tw(t, 85.5, 86.5)));
    else fill2(0, th, .62 + pulse);
  }
  const xr = p.ox + (TH + .12) * p.sx, ax = 'rgba(255,255,255,.55)';
  line(p.ox - 14, p.oy, lerp(p.ox - 14, xr, axp), p.oy, ax, 2);
  if (axp > .9) arrowHead(xr + 12, p.oy, 0, 13, ax, P(axp, .9, 1));
  const ytop = p.oy - 6.15 * p.sy * axp;
  line(p.ox, p.oy + 8, p.ox, ytop, ax, 2);
  if (axp > .9) arrowHead(p.ox, ytop - 12, -Math.PI / 2, 13, ax, P(axp, .9, 1));
  for (let k = 1; k <= 4; k++) line(p.ox + k * TH / 4 * p.sx, p.oy - 6, p.ox + k * TH / 4 * p.sx, p.oy + 6, '#fff', 1.5, .5 * axp);
  for (const [v, s] of [[2, '2'], [4, '4'], [4 * Math.SQRT2, '4\u221a2']]) {
    line(p.ox - 6, p.oy - v * p.sy, p.ox + 6, p.oy - v * p.sy, '#fff', 1.5, .5 * axp);
    txt(s, p.ox - 16, p.oy - v * p.sy, { font: '21px KaTeX_Main', align: 'right', a: .85 * axp });
  }
  const cvp = tw(t, 79.6, 81.3, E.io2);
  if (cvp > 0) {
    path2(0, TH * cvp); glowStroke(C.cyan, 4.5);
    if (cvp < 1) dot(p.ox + TH * cvp * p.sx, p.oy - g(TH * cvp) * p.sy, 8, C.cyan);
  }
  const mk = t >= 86.6 ? 1 - tw(t, 92.6, 93.4) : 0;
  if (mk > 0) {
    const mx = p.ox + th * p.sx, my = p.oy - g(th) * p.sy;
    line(mx, p.oy, mx, my, '#fff', 1.6, .55 * mk, [5, 6]);
    dot(mx, p.oy, 5, '#fff', mk, 2.4); dot(mx, my, 7.5, C.cyan, mk);
  }
  ctx.restore();
}

/* ───────────── rebanadas: la mudanza ───────────── */
function stripGeom(s, t, p) {
  const u = s.u(t);
  const w1 = DX * p.sx, c1 = p.ox + (s.xa + DX / 2) * p.sx;
  const w2 = s.dth * PL2.sx, c2 = PL2.ox + (s.tha + s.dth / 2) * PL2.sx;
  const w = w1 * Math.pow(w2 / w1, u);
  const h = s.area * p.sx * p.sy / w;                 // área en píxeles conservada en todo el vuelo
  const arc = Math.sin(Math.PI * u);
  const dist = c2 - c1;
  return { u, w, h, cx: lerp(c1, c2, u), by: lerp(p.oy, PL2.oy, u) - arc * (60 + .2 * dist), rot: arc * .2 * (.6 + .4 * Math.sin(s.i * 1.7)), arc };
}
function drawStrips(t) {
  if (t < 68.5 || t > 84.7) return;
  const p = p1(t);
  const aIn = tw(t, 68.6, 69.6), aOut = 1 - tw(t, 83.4, 84.6), gapP = tw(t, 68.8, 69.8);
  const focus = env(t, 70.1, 74.6, .5, .5);
  ctx.save();
  // primero las que reposan, después las que vuelan (encima)
  for (const pass of [0, 1]) for (const s of strips) {
    const q = stripGeom(s, t, p), flying = q.u > 0 && q.u < 1;
    if ((pass === 1) !== flying) continue;
    const isHero = s.i === HERO;
    let a = aIn * aOut * (isHero ? 1 : lerp(1, .32, focus));
    const gap = Math.min(2.6, q.w * .3) * gapP * aOut;
    const w = Math.max(.6, q.w - gap);
    ctx.save();
    ctx.translate(q.cx, q.by); ctx.rotate(q.rot);
    if (flying || (isHero && focus > 0)) {
      ctx.shadowColor = rgb(s.col, .9); ctx.shadowBlur = 22 * (flying ? 1 : focus);
    }
    ctx.globalAlpha = a * lerp(.72, .95, q.arc);
    ctx.fillStyle = rgb(s.col); ctx.fillRect(-w / 2, -q.h, w, q.h);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = a * .9; ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(-w / 2, -q.h, w, Math.min(2, q.h));
    ctx.restore();
  }
  ctx.restore();
}
function heroState(t) { return stripGeom(strips[HERO], t, p1(t)); }
function stripTotals(t) {
  let r = 0;
  for (const s of strips) r += s.area * s.u(t);
  if (strips[NS - 1].u(t) >= 1) r = AREA;       // la cola invisible llega con la última tira
  return { l: AREA - r, r };
}

/* ───────────── triángulo y círculo ───────────── */
function partial(x1, y1, x2, y2, u) { seg(x1, y1, lerp(x1, x2, u), lerp(y1, y2, u)); }
function drawCircle(t) {
  const c = cir(t); if (c.a <= .003) return;
  const { cx, cy, R } = c, th = theta(t), k = R / 270;
  const ring = tw(t, 35.4, 37.2, E.io2), tri = P(t, 28.6, 31.4);
  const tx = cx + R, ty = cy - R * Math.tan(th);
  const lw = Math.max(2.6, 5 * k);
  const hypPulse = env(t, 54.4, 56, .3, .7), legPulse = env(t, 55.9, 57.5, .3, .7);
  ctx.save(); ctx.globalAlpha = c.a;

  if (ring > 0) {
    line(cx - R * 1.12, cy, cx + R * 1.12, cy, '#fff', 1, .1 * ring);
    line(cx, cy - R * 1.12, cx, cy + R * 1.12, '#fff', 1, .1 * ring);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, -Math.PI * 2 * ring, true);
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = Math.max(1.5, 2 * k); ctx.stroke();
    line(tx, cy + R * .3, tx, cy - R * 1.18, '#fff', 1.4, .28 * ring, [5, 8]);
    // sector y arco recorrido
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, 0, -th, true); ctx.closePath();
    ctx.fillStyle = `rgba(77,227,255,${.09 * ring})`; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, -th, true); glowStroke(C.cyan, Math.max(2.5, 4.5 * k), ring);
    const lim = tw(t, 42.6, 43.6);
    if (lim > 0) line(cx, cy, cx + R * 1.17, cy - R * 1.17, C.cyan, 1.4, .35 * lim, [3, 9]);
  }
  // triángulo
  const u1 = E.io2(P(tri, 0, .34)), u2 = E.io2(P(tri, .33, .67)), u3 = E.io2(P(tri, .66, 1));
  if (u1 > 0) { partial(cx, cy, tx, cy, u1); glowStroke(C.silver, lw, 1, .6); }
  if (u2 > 0) { partial(tx, cy, tx, ty, u2); glowStroke(C.coral, lw * (1 + .7 * legPulse), 1, 1 + 2 * legPulse); }
  if (u3 > 0) { partial(tx, ty, cx, cy, u3); glowStroke(C.gold, lw * (1 + .7 * hypPulse), 1, 1 + 2 * hypPulse); }
  if (u2 > .5 && cy - ty > 26 * k) {
    const q = 15 * k; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx - q, cy); ctx.lineTo(tx - q, cy - q); ctx.lineTo(tx, cy - q); ctx.stroke();
  }
  // ángulo
  const an = Math.max(ring, t > 37 ? 1 : 0) * tw(t, 36.4, 37.4);
  if (an > 0 && th > .02) {
    ctx.beginPath(); ctx.arc(cx, cy, R * .27, 0, -th, true);
    ctx.strokeStyle = C.cyan; ctx.lineWidth = Math.max(1.6, 2.6 * k); ctx.globalAlpha = c.a * an; ctx.stroke();
    ctx.globalAlpha = c.a;
  }
  if (u1 > 0) dot(cx, cy, 5 * Math.max(.6, k), '#fff', u1, 2.2);
  if (u3 > 0) dot(tx, ty, 6.5 * Math.max(.6, k), C.gold, 1);

  // la semirrecta enrollada: marcas x = 0, −1, −2, … viajan al arco
  if (t > 41 && t < 52.7) {
    const p = p1(t), out = 1 - tw(t, 52, 52.6);
    for (let n = 0; n <= 10; n++) {
      const t0 = 41.3 + n * .12, u = tw(t, t0, t0 + 1.3), ap = P(t, t0 - .35, t0) * out;
      if (ap <= 0) continue;
      const thk = thOf(-n), col = rgb(colAt(-n));
      const sx = p.ox - n * p.sx, sy = p.oy, ex = cx + R * Math.cos(thk), ey = cy - R * Math.sin(thk);
      const mx = (sx + ex) / 2, my = Math.min(sy, ey) - 230 - n * 8;
      const bz = v => [(1 - v) * (1 - v) * sx + 2 * (1 - v) * v * mx + v * v * ex, (1 - v) * (1 - v) * sy + 2 * (1 - v) * v * my + v * v * ey];
      if (u > 0 && u < 1) {
        ctx.beginPath();
        for (let j = 0; j <= 14; j++) { const q = bz(Math.max(0, u - .22 * (1 - j / 14))); ctx[j ? 'lineTo' : 'moveTo'](q[0], q[1]); }
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = c.a * .5 * ap; ctx.stroke(); ctx.globalAlpha = c.a;
      }
      const q = bz(u);
      dot(q[0], q[1], n <= 4 ? 5.5 : 4, col, ap, 3);
      if (n <= 3 && u >= 1) {
        const la = P(t, t0 + 1.3, t0 + 1.7) * out, rr = R - 30, tl = thk - .1;
        txt(fmtMinus(-n), cx + rr * Math.cos(tl), cy - rr * Math.sin(tl), { font: '21px KaTeX_Main', color: col, a: la });
      }
    }
    const la = P(t, 43.2, 43.8) * out;
    txt('\u2212\u221e', cx + R + 14, cy + 26, { font: '22px KaTeX_Main', color: rgb(colAt(-9)), a: la, align: 'left' });
  }
  ctx.restore();
}

/* ───────────── anotaciones y destello final ───────────── */
function drawAnnot(t) {
  // guía de la tira protagonista
  const h1 = env(t, 70.1, 71.6, .4, .4);
  if (h1 > 0) { const q = heroState(70); line(q.cx, q.by - q.h - 10, q.cx, 668, '#fff', 1.4, .5 * h1, [4, 6]); }
  const h2 = env(t, 73.4, 74.7, .4, .4);
  if (h2 > 0) { const q = heroState(74); line(q.cx, q.by - q.h - 10, q.cx, 632, '#fff', 1.4, .5 * h2, [4, 6]); }
  // "toda la cola cabe aquí"
  const a = env(t, 80.3, 83, .5, .4);
  if (a > 0) {
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const u = tw(t, 80.4, 81.2, E.o3);
    ctx.beginPath(); ctx.moveTo(1190, 676);
    ctx.quadraticCurveTo(1215, 762, lerp(1190, 1322, u), lerp(676, 778, u)); ctx.stroke();
    if (u > .95) arrowHead(1326, 780, .25, 13, C.ink);
    ctx.beginPath(); ctx.arc(1337, 783, 18 + 4 * Math.sin(t * 5), 0, 7); ctx.strokeStyle = rgb(colAt(-6), .9); ctx.stroke();
    ctx.restore();
  }
  // destello
  const tb = 92.15;
  if (t > tb && t < tb + 2) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const u = P(t, tb + i * .12, tb + 1.5 + i * .12); if (u <= 0) continue;
      ctx.beginPath(); ctx.ellipse(960, 916, 80 + E.o3(u) * (620 + i * 140), 30 + E.o3(u) * (150 + i * 40), 0, 0, 7);
      ctx.strokeStyle = i === 1 ? C.cyan : C.gold; ctx.lineWidth = 3 * (1 - u); ctx.globalAlpha = .7 * (1 - u); ctx.stroke();
    }
    const u = P(t, tb, tb + .9), gr = ctx.createRadialGradient(960, 916, 0, 960, 916, 700);
    gr.addColorStop(0, `rgba(255,220,150,${.35 * (1 - u)})`); gr.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/* ───────────── capa DOM: fórmulas, textos, contadores ───────────── */
const K = tex => katex.renderToString(tex, { throwOnError: false, strict: false });
const KD = tex => K('\\displaystyle ' + tex);
const tc = (c, s) => `\\textcolor{${c}}{${s}}`;
const acts = [];
const ANCH = { c: '-50%,-50%', l: '0,-50%', r: '-100%,-50%', br: '-100%,-100%' };
const ORIG = { c: '50% 50%', l: '0 50%', r: '100% 50%', br: '100% 100%' };
function act(html, o, fn) {
  const el = document.createElement('div');
  el.className = 'a ' + (o.cls || ''); el.innerHTML = html;
  if (o.size) el.style.fontSize = o.size + 'px';
  if (o.color) el.style.color = o.color;
  const an = o.anchor || 'c'; el.style.transformOrigin = ORIG[an];
  dom.appendChild(el);
  const a = { el, o, fn, an, vis: false, v: el.querySelector('[data-v]'), last: null };
  acts.push(a); return a;
}
function applyActs(t) {
  for (const a of acts) {
    const s = a.fn(t, a);
    if (!s || !(s.o > .003)) { if (a.vis) { a.el.style.visibility = 'hidden'; a.vis = false; } continue; }
    if (!a.vis) { a.el.style.visibility = 'visible'; a.vis = true; }
    const x = s.x ?? a.o.x, y = (s.y ?? a.o.y) + (s.dy || 0);
    a.el.style.opacity = Math.min(1, s.o).toFixed(3);
    a.el.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) translate(${ANCH[a.an]}) scale(${(s.s ?? 1).toFixed(4)})`;
    a.el.style.filter = s.blur > .08 ? `blur(${s.blur.toFixed(2)}px)` : 'none';
    if (s.text !== undefined && s.text !== a.last) { a.v.textContent = s.text; a.last = s.text; }
  }
}
function pop(t, a, b, { di = .7, dout = .45, rise = 26, blur = 8 } = {}) {
  if (t < a || t > b) return null;
  const i = E.o3(P(t, a, a + di)), o = E.i2(P(t, b - dout, b));
  return { o: i * (1 - o), dy: (1 - i) * rise - o * rise * .5, blur: (1 - i) * blur + o * blur * .6 };
}
const MIN = '\u2212';
const fx = (v, d) => (v < 0 ? MIN : '') + Math.abs(v).toFixed(d);

function buildDOM() {
  /* gancho */
  const hookWords = ['¿Cómo', 'se', 'mide', 'algo', '<br>', 'que', 'no', 'termina', '<em class="gold">nunca</em>?'];
  const hook = act(hookWords.map(w => (w === '<br>' ? w : `<span>${w}</span>`)).join(' '), { x: 880, y: 430, cls: 'hook' }, (t, a) => {
    if (t > 4.5) return null;
    a.spans.forEach((sp, i) => {
      const u = E.o3(P(t, .45 + i * .22, 1.25 + i * .22));
      sp.style.opacity = u.toFixed(3); sp.style.transform = `translateY(${((1 - u) * 34).toFixed(1)}px)`;
      sp.style.filter = u < .98 ? `blur(${((1 - u) * 10).toFixed(1)}px)` : 'none';
    });
    const o = E.i2(P(t, 3.8, 4.4));
    return { o: 1 - o, s: lerp(1, 1.04, P(t, 0, 4.5)), blur: o * 10 };
  });
  hook.spans = [...hook.el.querySelectorAll('span')];
  hook.el.style.textAlign = 'center'; hook.el.style.lineHeight = '1.08';

  /* título */
  act('Cambio de variable en integrales', { x: 960, y: 372, cls: 'kicker' }, t => pop(t, 4.7, 8.5));
  act('Un área, dos mundos', { x: 960, y: 520, cls: 'title' }, t => {
    const s = pop(t, 4.9, 8.6, { di: 1.1, rise: 40, blur: 16 }); if (s) s.s = lerp(.96, 1.02, P(t, 4.9, 8.6)); return s;
  });
  act('del mundo <b class="warm">exponencial</b> al mundo <b class="cyan">circular</b>', { x: 960, y: 682, cls: 'sub' }, t => pop(t, 5.6, 8.5));

  /* capítulos */
  [[8.7, 22.8, '01', 'Mundo exponencial'], [23.2, 34.9, '02', 'La pista'], [35.2, 51.9, '03', 'El puente'],
   [52.6, 65.9, '04', 'El diccionario'], [66.3, 82.9, '05', 'La mudanza'], [83.3, 96.9, '06', 'La resolución']]
    .forEach(([a, b, n, s]) => act(`<b>${n}</b><i></i>${s}`, { x: 84, y: 72, cls: 'chap', anchor: 'l' }, t => pop(t, a, b, { rise: 10, blur: 4 })));

  /* subtítulos */
  const th = K('\\theta');
  [[9.1, 13.9, `Mundo exponencial: el área bajo la curva, desde ${K('-\\infty')} hasta ${K('0')}.`],
   [14.3, 19.3, 'La cola nunca toca el suelo. Acércate cuanto quieras: <em>sigue ahí</em>.'],
   [19.7, 22.8, 'Y aun así, el área es finita. ¿Cómo atraparla con exactitud?'],
   [23.6, 28.2, 'Pista: bajo la raíz se esconde una <em>suma de cuadrados</em>.'],
   [28.6, 34.8, 'Y donde hay una suma de cuadrados… vive un <em>triángulo rectángulo</em>.'],
   [35.3, 40.7, 'Si el cateto 1 es un radio, el otro es una <em>tangente</em>… y la hipotenusa, una <em>secante</em>.'],
   [41.1, 47.9, `Mientras ${K('x')} recorre una semirrecta infinita, el ángulo ${th} apenas se abre…`],
   [48.3, 51.9, 'Una carretera sin fin, enrollada en <em class="c">un octavo de vuelta</em>.'],
   [53.3, 60.8, 'Con el triángulo como puente, cada pieza encuentra su traducción.'],
   [61.2, 65.9, 'La misma integral, contada en <em class="c">otro idioma</em>.'],
   [66.7, 69.9, 'Rebanemos el área en tiras finas…'],
   [70.3, 74.6, 'Cada tira se muda de mundo: cambia su base, cambia su altura. <em>Su área, no.</em>'],
   [75, 79.8, 'Tira a tira, el área entera cruza el puente.'],
   [80.2, 83, `La cola infinita quedó plegada en un rincón, junto a ${K('\\theta=0')}.`],
   [83.5, 86.5, 'Y en el mundo circular, la integral se deja resolver.'],
   [86.9, 91.9, 'Dos mundos, un solo barrido: el área crece <em class="c">al unísono</em>.'],
   [92.3, 96.9, 'El número que intuíamos. Ahora, <em>exacto</em>.'],
  ].forEach(([a, b, h]) => act(h, { x: 960, y: 1012, cls: 'cap' }, t => pop(t, a, b, { rise: 18, blur: 6 })));

  /* integrales (viajan entre escenas) */
  const intL = `\\int_{-\\infty}^{0}${tc(C.coral, 'e^{x}')}\\,${tc(C.gold, '\\sqrt{1+e^{x}}')}\\;${tc(C.coral, 'dx')}`;
  const intRu = `\\int_{0}^{\\pi/4}${tc(C.gold, '\\sec\\theta')}\\cdot${tc(C.coral, '2\\tan\\theta\\,\\sec^{2}\\theta\\;d\\theta')}`;
  const intR = `\\int_{0}^{\\pi/4}${tc(C.cyan, '2\\tan\\theta\\,\\sec^{3}\\theta\\;d\\theta')}`;
  act(KD(intL), { size: 66 }, t => {
    if (t < 8.9 || t > 98.2) return null;
    const i = E.o3(P(t, 8.9, 9.9));
    let o = Math.min(i, 1 - P(t, 97.2, 98));
    o *= t < 57 ? 1 - P(t, 52.1, 52.8) : P(t, 61.3, 62.1);
    return {
      o, dy: (1 - i) * 26, blur: (1 - i) * 8,
      x: kf(t, [[22.8, 470], [24.4, 290], [57, 290], [57.01, 567], [66, 567], [67.8, 560]]),
      y: kf(t, [[22.8, 215], [24.4, 152], [57, 152], [57.01, 832], [66, 832], [67.8, 172]]),
      s: kf(t, [[22.8, 1], [24.4, .6], [57, .6], [57.01, .74], [66, .74], [67.8, .76]]),
    };
  });
  act(K('='), { x: 845, y: 832, size: 49 }, t => pop(t, 62.4, 66.6, { rise: 0 }));
  act(KD(intRu), { x: 1240, y: 832, size: 49 }, t => pop(t, 62.8, 64.7, { rise: 20 }));
  act(KD(intR), { size: 66 }, t => {
    if (t < 64.3 || t > 98.2) return null;
    const i = E.o3(P(t, 64.3, 65.1));
    return {
      o: Math.min(i, 1 - P(t, 97.2, 98)), blur: (1 - i) * 8, s: kf(t, [[66, .74], [67.8, .76]]) * lerp(1.06, 1, i),
      x: kf(t, [[66, 1162], [67.8, 1525]]), y: kf(t, [[66, 832], [67.8, 172]]),
    };
  });

  /* contador de área (escena 1) */
  act('<div class="counter"><span class="lbl">área acumulada</span><span class="num" data-v></span></div>', { x: 1130, y: 235 }, t => {
    const s = pop(t, 12.7, 22.8, { rise: 16 }); if (!s) return null;
    const p = p1(t), xl = (64 - p.ox) / p.sx, a = lerp(0, xl, tw(t, 12.7, 14.5, E.io2));
    s.text = (t > 19.9 ? '≈ ' : '') + (F(0) - F(a)).toFixed(5);
    s.s = 1 + .06 * env(t, 19.9, 20.9, .2, .7);
    return s;
  });

  /* la pista */
  act(K(tc(C.gold, '\\sqrt{1+e^{x}}')), { x: 1290, y: 245, size: 92 }, t => pop(t, 24, 26.2, { di: .9, dout: .5 }));
  act(K(tc(C.gold, `\\sqrt{${tc(C.silver, '1')}^{2}+\\big(${tc(C.coral, 'e^{x/2}')}\\big)^{2}}`)), { x: 1290, y: 245, size: 84 }, t => pop(t, 25.9, 35.5, { di: .9, rise: 0 }));

  /* el puente: relaciones */
  act(K(`${tc(C.coral, '\\tan\\theta')}=e^{x/2}`), { x: 1030, y: 240, size: 52 }, t => pop(t, 37.2, 52.3));
  act(K(`${tc(C.gold, '\\sec\\theta')}=\\sqrt{1+e^{x}}`), { x: 1510, y: 240, size: 52 }, t => pop(t, 38.5, 52.3));

  /* etiquetas del triángulo */
  const geo = t => { const c = cir(t), th = theta(t); return { ...c, th, k: clamp(c.R / 270, .55, 1), big: clamp((c.R - 120) / 60), leg: c.R * Math.tan(th) }; };
  act(K(tc(C.silver, '1')), { size: 46 }, t => {
    if (t < 29.3 || t > 66.4) return null; const q = geo(t);
    return { o: tw(t, 29.3, 29.9) * q.big * (1 - P(t, 65.8, 66.4)), x: q.cx + q.R / 2, y: q.cy + 40 * q.k, s: q.k };
  });
  const legA = (q) => q.big * clamp((q.leg - 46) / 50);
  act(K(tc(C.coral, 'e^{x/2}')), { size: 46, anchor: 'l' }, t => {
    if (t < 30.1 || t > 38) return null; const q = geo(t);
    return { o: tw(t, 30.1, 30.7) * (1 - tw(t, 37, 37.6)) * legA(q), x: q.cx + q.R + 24, y: q.cy - q.leg / 2, s: q.k };
  });
  act(K(tc(C.coral, '\\tan\\theta')), { size: 46, anchor: 'l' }, t => {
    if (t < 37.2 || t > 66.4) return null; const q = geo(t);
    return { o: tw(t, 37.3, 37.9) * legA(q) * (1 - P(t, 65.8, 66.4)), x: q.cx + q.R + 24 * q.k, y: q.cy - q.leg / 2, s: q.k };
  });
  const hypPos = q => ({ x: q.cx + q.R / 2 - Math.sin(q.th) * 16 * q.k, y: q.cy - q.leg / 2 - Math.cos(q.th) * 16 * q.k });
  act(K(tc(C.gold, '\\sqrt{1+e^{x}}')), { size: 46, anchor: 'br' }, t => {
    if (t < 31 || t > 39) return null; const q = geo(t);
    return { o: tw(t, 31, 31.6) * (1 - tw(t, 38.2, 38.8)) * legA(q), ...hypPos(q), s: q.k };
  });
  act(K(tc(C.gold, '\\sec\\theta')), { size: 46, anchor: 'br' }, t => {
    if (t < 38.4 || t > 66.4) return null; const q = geo(t);
    return { o: tw(t, 38.5, 39.1) * legA(q) * (1 - P(t, 65.8, 66.4)), ...hypPos(q), s: q.k };
  });
  act(K(tc(C.cyan, '\\theta')), { size: 40 }, t => {
    if (t < 36.6 || t > 98) return null; const q = geo(t), r = q.R * .27 + 30 * q.k;
    return { o: tw(t, 36.6, 37.4) * clamp((q.th - .16) / .12) * clamp((q.R - 150) / 40), x: q.cx + r * Math.cos(q.th / 2), y: q.cy - r * Math.sin(q.th / 2), s: q.k };
  });

  /* lecturas en vivo (escena 3) */
  act(`${K('x')} <span data-v></span>`, { x: 470, y: 812, cls: 'readout', color: C.gold }, t => {
    const s = pop(t, 41.2, 52.2, { rise: 12 }); if (!s) return null;
    const x = xOf(theta(t)); s.text = x < -9.5 ? '→ ' + MIN + '∞' : '= ' + fx(Math.min(0, x) - 1e-9, 2).replace(MIN + '0.00', '0.00'); return s;
  });
  act(`${K('\\theta')} <span data-v></span>`, { x: 1700, y: 812, cls: 'readout', color: C.cyan }, t => {
    const s = pop(t, 41.2, 52.2, { rise: 12 }); if (!s) return null;
    const d = theta(t) * 180 / Math.PI; s.text = d < .5 ? '→ 0°' : '= ' + d.toFixed(1) + '°'; return s;
  });

  /* diccionario */
  act('Diccionario entre mundos', { x: 150, y: 232, cls: 'lbl', anchor: 'l' }, t => pop(t, 53.4, 65.9, { rise: 10 }));
  const row = (l, r) => `<div class="row"><span class="l">${l}</span><span class="ar">${K('\\longleftrightarrow')}</span><span class="r">${r}</span></div>`;
  [[54.4, 330, K(tc(C.gold, '\\sqrt{1+e^{x}}')), K(tc(C.gold, '\\sec\\theta'))],
   [55.9, 432, K(tc(C.coral, 'e^{x}')), K(tc(C.coral, '\\tan^{2}\\theta'))],
   [57.4, 534, K(tc(C.coral, 'e^{x}\\,dx')), K(tc(C.coral, '2\\tan\\theta\\,\\sec^{2}\\theta\\,d\\theta'))],
   [59.2, 650, K('x:\\;-\\infty\\to 0'), K(tc(C.cyan, '\\theta:\\;0\\to\\tfrac{\\pi}{4}'))],
  ].forEach(([a, y, l, r]) => act(row(l, r), { x: 150, y, anchor: 'l' }, t => {
    const s = pop(t, a, 66, { rise: 22 }); if (s) s.x = 150 + (1 - E.o3(P(t, a, a + .7))) * -30; return s;
  }));
  act('(derivando la fila anterior)', { x: 708, y: 586, cls: 'note', anchor: 'l' }, t => pop(t, 58, 66, { rise: 8 }));

  /* ejes del mundo circular */
  const axA = t => (t < 67.4 || t > 98.2 ? 0 : Math.min(tw(t, 67.6, 68.8), 1 - tw(t, 97, 98)));
  [[PL2.ox, '0'], [PL2.ox + TH / 2 * PL2.sx, '\\tfrac{\\pi}{8}'], [PL2.ox + TH * PL2.sx, '\\tfrac{\\pi}{4}']]
    .forEach(([x, s]) => act(K(s), { x, y: PL2.oy + 34, size: 24, color: C.dim }, t => ({ o: .95 * axA(t) })));
  act(K('\\theta'), { x: PL2.ox + (TH + .12) * PL2.sx + 8, y: PL2.oy + 32, size: 30 }, t => ({ o: axA(t) }));

  /* la tira protagonista */
  act(K(`\\underbrace{${tc(C.gold, 'e^{x}\\sqrt{1+e^{x}}')}}_{\\text{altura}}\\cdot\\underbrace{${tc(C.gold, 'dx')}}_{\\text{base}}`), { x: 794, y: 618, size: 36 }, t => pop(t, 70.1, 71.7, { rise: 14 }));
  act(K(`\\underbrace{${tc(C.cyan, '2\\tan\\theta\\,\\sec^{3}\\theta')}}_{\\text{altura}}\\cdot\\underbrace{${tc(C.cyan, 'd\\theta')}}_{\\text{base}}`), { x: 1548, y: 580, size: 36 }, t => pop(t, 73.3, 74.8, { rise: 14 }));
  act('misma área', { cls: 'tag', color: '#fff' }, t => {
    const s = pop(t, 71.2, 73.5, { rise: 0, di: .4, dout: .3 }); if (!s) return null;
    const q = heroState(t); s.x = q.cx; s.y = q.by - q.h - 38; return s;
  });

  /* contadores de la mudanza */
  const mini = l => `<div class="counter mini"><span class="lbl">${l}</span><span class="num" data-v></span></div>`;
  act(mini('área en el mundo exponencial'), { x: 560, y: 888 }, t => { const s = pop(t, 69.9, 83.3, { rise: 12 }); if (s) s.text = fx(Math.max(0, stripTotals(t).l), 3); return s; });
  act(mini('área en el mundo circular'), { x: 1518, y: 888 }, t => { const s = pop(t, 69.9, 83.3, { rise: 12 }); if (s) s.text = fx(stripTotals(t).r, 3); return s; });
  act('<span class="lbl">suma&nbsp;&nbsp;</span><span class="num" style="font-size:46px">1.219</span><span class="lbl">&nbsp;&nbsp;· no cambia</span>', { x: 1040, y: 896 }, t => pop(t, 70.4, 83.3, { rise: 12 }));
  act(`toda la cola<br>${K('x\\to-\\infty')} cabe aquí`, { x: 1150, y: 618, cls: 'tag', size: 28 }, t => pop(t, 80.3, 83, { rise: 10 }));

  /* la resolución */
  act(K(`\\displaystyle\\int ${tc(C.cyan, '2\\tan\\theta\\,\\sec^{3}\\theta\\,d\\theta')}=\\tfrac{2}{3}\\,${tc(C.gold, '\\sec^{3}\\theta')}`), { x: 960, y: 902, size: 46 }, t => pop(t, 83.8, 86.8, { rise: 16 }));
  act(`${K(`\\tfrac{2}{3}\\big(${tc(C.gold, '\\sec^{3}\\theta')}-1\\big)=`)}<span class="num" data-v style="margin-left:.35em"></span>`, { x: 960, y: 916, size: 54 }, t => {
    const s = pop(t, 86.9, 92.2, { rise: 16, dout: .25 }); if (s) s.text = (G(theta(t)) - 2 / 3).toFixed(5); return s;
  });
  act(K(`\\tfrac{2}{3}\\big(2\\sqrt{2}-1\\big)\\;\\approx\\;${tc(C.gold, '1.21895')}`), { x: 960, y: 914, size: 64 }, t => {
    if (t < 92.1 || t > 97.5) return null;
    const i = P(t, 92.1, 92.8);
    return { o: Math.min(E.o3(i), 1 - P(t, 97, 97.5)), s: lerp(.82, 1, E.oB(i)), blur: (1 - E.o3(i)) * 6 };
  });

  /* epílogo */
  act('Cambiar de variable<br>no cambia el <em>área</em>:<br>cambia el <em class="c">idioma</em> en que la contamos.', { x: 960, y: 500, cls: 'quote' }, t => {
    const s = pop(t, 97.8, 101.7, { di: 1.1, rise: 30, blur: 14 }); if (s) s.s = lerp(.97, 1.01, P(t, 97.8, 101.7)); return s;
  });
  act('Un área · dos mundos', { x: 960, y: 348, cls: 'kicker' }, t => pop(t, 101.9, 106));
  act(K(`\\displaystyle\\int_{-\\infty}^{0}${tc(C.warm, 'e^{x}\\sqrt{1+e^{x}}\\,dx')}\\;=\\;\\int_{0}^{\\pi/4}${tc(C.cyan, '2\\tan\\theta\\,\\sec^{3}\\theta\\,d\\theta')}\\;=\\;\\tfrac{2}{3}\\big(2\\sqrt{2}-1\\big)`), { x: 960, y: 510, size: 50 }, t => pop(t, 102.1, 106, { di: 1, rise: 24 }));
  act('exponencial &nbsp;⟶&nbsp; circular', { x: 960, y: 672, cls: 'sub' }, t => pop(t, 102.7, 106));
}

/* ───────────── cuadro ───────────── */
function render(t) {
  t = clamp(t, 0, DUR);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawBG(t);
  drawHook(t);
  drawTitleArt(t);
  drawPlot1(t);
  drawPlot2(t);
  drawCircle(t);
  drawStrips(t);
  drawAnnot(t);
  drawVignette();
  applyActs(t);
  fadeEl.style.opacity = Math.max(1 - P(t, 0, .6), P(t, 105.2, 105.9)).toFixed(3);
}

/* ───────────── reproductor ───────────── */
let now = 0, playing = false, last = 0;
const hud = document.getElementById('hud'), pp = document.getElementById('pp'), seek = document.getElementById('seek'), clock = document.getElementById('clock');
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * s) / 2}px,${(innerHeight - H * s) / 2}px) scale(${s})`;
}
function setPlaying(v) { playing = v; pp.textContent = v ? '❚❚' : '▶'; last = performance.now(); if (v) requestAnimationFrame(loop); }
function loop(ts) {
  if (!playing) return;
  now += Math.min(.1, (ts - last) / 1000); last = ts;
  if (now >= DUR) { now = DUR; setPlaying(false); }
  render(now); seek.value = now / DUR * 1000; clock.textContent = `${mmss(now)} / ${mmss(DUR)}`;
  if (playing) requestAnimationFrame(loop);
}
function toggle() { if (!playing && now >= DUR - .05) now = 0; setPlaying(!playing); }
let hudTimer;
function wake() { hud.classList.add('on'); clearTimeout(hudTimer); hudTimer = setTimeout(() => playing && hud.classList.remove('on'), 2200); }

window.__DUR = DUR;
window.__seek = t => { now = t; render(t); };
window.__ready = (async () => {
  const fonts = ['24px KaTeX_Main', 'italic 24px KaTeX_Math', '500 24px Inter', '600 24px Inter', '24px Inter', '24px "Instrument Serif"', 'italic 24px "Instrument Serif"'];
  await Promise.all(fonts.map(fn => document.fonts.load(fn, 'x√−∞×0')));
  buildDOM();
  await document.fonts.ready;
  fit(); render(0);
  if (!RENDER) {
    addEventListener('resize', fit);
    stage.addEventListener('click', () => { toggle(); wake(); });
    pp.addEventListener('click', toggle);
    seek.addEventListener('input', () => { now = seek.value / 1000 * DUR; render(now); clock.textContent = `${mmss(now)} / ${mmss(DUR)}`; });
    addEventListener('mousemove', wake); addEventListener('touchstart', wake, { passive: true });
    addEventListener('keydown', e => {
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      if (e.code === 'ArrowRight') { now = Math.min(DUR, now + 2); render(now); }
      if (e.code === 'ArrowLeft') { now = Math.max(0, now - 2); render(now); }
      wake();
    });
    wake(); setPlaying(true);
  }
  return true;
})();
})();
