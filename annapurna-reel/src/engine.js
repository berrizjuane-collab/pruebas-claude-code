'use strict';
/* =========================================================================
   Motor "paper-cut": utilidades deterministas para pintar capas de papel
   recortado (silueta + textura + sombra proyectada) sobre un canvas 2D.
   Todo depende sólo de t (segundos) => render reproducible fotograma a fotograma.
   ========================================================================= */
const W = 1080, H = 1920;
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  lin: t => t,
  in: t => t * t * t,
  out: t => 1 - Math.pow(1 - t, 3),
  inOut: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuint: t => 1 - Math.pow(1 - t, 5),
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outBack: t => { if (t <= 0) return 0; if (t >= 1) return 1; const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  sine: t => .5 - .5 * Math.cos(Math.PI * t),
  outElastic: t => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1),
};
const ease = (t, a, b, fn = E.inOut) => fn(prog(t, a, b));
function rng(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash1(i, seed) { let x = Math.imul(i ^ (seed * 374761393), 668265263); x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, seed = 1) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash1(i, seed), hash1(i + 1, seed), u); }
function fbm(x, seed = 1, oct = 4, gain = .5) { let a = 1, s = 0, n = 0; for (let o = 0; o < oct; o++) { s += a * vnoise(x, seed + o * 17); n += a; a *= gain; x *= 2.03; } return s / n; }
function ridged(x, seed = 1, oct = 4) { let a = 1, s = 0, n = 0; for (let o = 0; o < oct; o++) { s += a * (1 - Math.abs(2 * vnoise(x, seed + o * 31) - 1)); n += a; a *= .5; x *= 2.1; } return s / n; }
function hash2(i, j, seed) { return hash1(i * 7919 + j * 104729, seed); }
function noise2(x, y, seed = 1) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(i, j, seed), hash2(i + 1, j, seed), u), lerp(hash2(i, j + 1, seed), hash2(i + 1, j + 1, seed), u), v);
}
function fbm2(x, y, seed = 1, oct = 4) { let a = 1, s = 0, n = 0; for (let o = 0; o < oct; o++) { s += a * noise2(x, y, seed + o * 13); n += a; a *= .5; x *= 2; y *= 2; } return s / n; }

/* ---------- color ---------- */
function hex(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function mix(a, b, t) { const A = hex(a), B = hex(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * clamp(t))).join(',') + ')'; }
function rgba(h, a) { const A = hex(h); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }

/* ---------- canvas ---------- */
function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
function vgrad(x, y0, y1, stops) { const g = x.createLinearGradient(0, y0, 0, y1); stops.forEach(([p, c]) => g.addColorStop(p, c)); return g; }
function poly(x, pts) { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); }

/* ---------- texturas de papel ---------- */
function makeSpeckle(size, seed, strength) {
  const c = mk(size, size), x = c.getContext('2d'), id = x.createImageData(size, size), r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    const v = r(), g = v < .5 ? 0 : 255;
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = g;
    id.data[i * 4 + 3] = Math.pow(r(), 2.2) * strength * 255;
  }
  x.putImageData(id, 0, 0);
  // fibras
  for (let i = 0; i < size * .9; i++) {
    const px = r() * size, py = r() * size, a = r() * TAU, l = 6 + r() * 26;
    x.strokeStyle = r() < .5 ? `rgba(255,255,255,${.03 + r() * .06})` : `rgba(0,0,0,${.02 + r() * .05})`;
    x.lineWidth = .6 + r();
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * l * .5 + (r() - .5) * 8, py + Math.sin(a) * l * .5 + (r() - .5) * 8, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  return c;
}
let TEX = null, GRAIN = [], VIGN = null;
function initTextures() {
  TEX = makeSpeckle(512, 11, .16);
  for (let k = 0; k < 6; k++) {
    // grano de película: ruido a media resolución (más orgánico y comprime mejor)
    const s = 360, c = mk(s, s * 16 / 9), x = c.getContext('2d'), id = x.createImageData(c.width, c.height), r = rng(100 + k);
    for (let i = 0; i < c.width * c.height; i++) { const v = (r() + r() + r()) / 3; const g = v * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = g; id.data[i * 4 + 3] = 255; }
    x.putImageData(id, 0, 0); GRAIN.push(c);
  }
  VIGN = mk(W / 4, H / 4); const v = VIGN.getContext('2d');
  const g = v.createRadialGradient(W / 8, H / 8 * .92, H / 8 * .45, W / 8, H / 8, H / 8 * 1.12);
  g.addColorStop(0, 'rgba(8,10,28,0)'); g.addColorStop(1, 'rgba(8,10,28,.62)');
  v.fillStyle = g; v.fillRect(0, 0, W / 4, H / 4);
}
function texturize(x, w, h, alpha = 1, ox = 0, oy = 0) {
  x.save(); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = alpha;
  x.translate(ox, oy); x.fillStyle = x.createPattern(TEX, 'repeat'); x.fillRect(-ox, -oy, w, h); x.restore();
}

/* ---------- capa de papel: {c: lienzo, s: sombra difuminada} ---------- */
function shadowOf(c, blur, color = '#050818') {
  const pad = blur * 3, s = mk(c.width / 2 + pad * 2, c.height / 2 + pad * 2), x = s.getContext('2d');
  x.filter = `blur(${blur / 2}px)`; x.drawImage(c, pad, pad, c.width / 2, c.height / 2); x.filter = 'none';
  x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, s.width, s.height);
  s._pad = pad * 2; return s;
}
function paper(w, h, draw, o = {}) {
  const c = mk(w, h), x = c.getContext('2d');
  draw(x, w, h);
  if (o.tex !== 0) texturize(x, w, h, o.tex ?? .8, o.tx || 0, o.ty || 0);
  const L = { c, w, h, sa: o.sa ?? .5, sdx: o.sdx ?? 0, sdy: o.sdy ?? -10 };
  if (o.shadow !== 0) L.s = shadowOf(c, o.shadow ?? 26, o.shadowColor);
  return L;
}
function put(x, L, px, py, o = {}) {
  const sc = o.scale ?? 1, a = o.alpha ?? 1;
  if (L.s && o.shadow !== false) {
    x.globalAlpha = a * (o.sa ?? L.sa);
    x.drawImage(L.s, px + (L.sdx - L.s._pad) * sc, py + (L.sdy - L.s._pad) * sc, L.s.width * 2 * sc, L.s.height * 2 * sc);
  }
  x.globalAlpha = a; x.drawImage(L.c, px, py, L.w * sc, L.h * sc); x.globalAlpha = 1;
}

/* ---------- siluetas ---------- */
function displace(pts, levels, jag, r) {
  for (let l = 0; l < levels; l++) {
    const n = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y);
      n.push(a, { x: (a.x + b.x) / 2 + (r() - .5) * d * jag * .35, y: (a.y + b.y) / 2 + (r() - .5) * d * jag, p: 0 });
    }
    n.push(pts[pts.length - 1]); pts = n;
  }
  return pts;
}
function ridgeLine(w, o) {
  // perfil alpino procedural: ruido "ridged" (picos afilados) + fbm (masa)
  const pts = [], st = o.step || 8, r = rng(o.seed * 7 + 3);
  for (let px = -20; px <= w + 20; px += st) {
    const u = px / (o.scale || 420) + o.seed * 9.7;
    let y = o.base - o.amp * (.62 * Math.pow(ridged(u, o.seed, 4), o.sharp || 1.5) + .38 * fbm(u * .6, o.seed + 5, 3));
    y += (r() - .5) * (o.jit ?? 5);
    pts.push([px, y]);
  }
  return pts;
}
function ridgeLayer(w, h, o) {
  const pts = ridgeLine(w, o);
  const L = paper(w, h, (x) => {
    x.beginPath(); x.moveTo(-30, h + 10); pts.forEach(p => x.lineTo(p[0], p[1])); x.lineTo(w + 30, h + 10); x.closePath();
    x.fillStyle = vgrad(x, o.base - o.amp, h, [[0, o.col], [o.hazeAt ?? .75, o.col2 || o.col], [1, o.haze || o.col2 || o.col]]);
    x.fill();
    x.save(); x.clip();
    for (let k = 1; k <= (o.bands ?? 3); k++) { // bandas tonales: estratos de papel dentro de la misma capa
      x.beginPath(); x.moveTo(-30, h + 10);
      pts.forEach(p => x.lineTo(p[0], lerp(p[1], o.base, .35) + k * (o.bandGap ?? 120) + (fbm(p[0] / 170 + k * 7, o.seed + 40 + k, 3) - .5) * 150));
      x.lineTo(w + 30, h + 10); x.closePath(); x.fillStyle = o.bandCol || 'rgba(4,6,30,.13)'; x.fill();
    }
    if (o.snow) { // nieve en las crestas: franja irregular bajo la arista
      x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1] - 2) : x.moveTo(p[0], p[1] - 2)));
      const r = rng(o.seed + 99);
      for (let i = pts.length - 1; i >= 0; i -= 2) { const p = pts[i]; const up = (o.base - p[1]) / o.amp; x.lineTo(p[0] + (r() - .5) * 8, p[1] + Math.max(0, (up - (o.snowLine ?? .35)) * o.amp * (.3 + r() * .55))); }
      x.closePath(); x.fillStyle = o.snow; x.fill();
    }
    x.restore();
    // canto del papel iluminado
    x.save(); x.globalCompositeOperation = 'source-atop'; x.strokeStyle = o.edge || 'rgba(255,255,255,.22)'; x.lineWidth = o.edgeW || 3;
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1] + 1) : x.moveTo(p[0], p[1] + 1))); x.stroke(); x.restore();
  }, o);
  L.pts = pts; L.yAt = (px) => { const st = pts[1][0] - pts[0][0], i = clamp(Math.floor((px - pts[0][0]) / st), 0, pts.length - 2); return lerp(pts[i][1], pts[i + 1][1], clamp((px - pts[i][0]) / st)); };
  return L;
}

/* ---------- montaña facetada (luz desde la izquierda) ---------- */
function buildMountain(o) {
  const r = rng(o.seed), w = o.w, h = o.h, P = o.pal;
  let pts = displace(o.ctrl.map(c => ({ x: c[0] * w, y: c[1] * h, p: c[2] || 0 })), o.levels ?? 4, o.jag ?? .22, r);
  const peaks = []; pts.forEach((p, i) => { if (p.p) peaks.push(i); });
  const zig = (px, py, lean, amp, sMin = 40, sMax = 110) => {
    const L = [[px, py]]; let s = r() < .5 ? 1 : -1;
    while (py < h + 60) { const dy = lerp(sMin, sMax, r()); py += dy; px += lean * dy + s * amp * (.35 + r() * .65); s = -s; L.push([px, py]); }
    return L;
  };
  const faces = [], ribs = [], rocks = [];
  peaks.forEach((pi, k) => {
    const next = k + 1 < peaks.length ? peaks[k + 1] : pts.length - 1;
    let vi = pi; for (let i = pi; i <= next; i++) if (pts[i].y > pts[vi].y) vi = i;
    const spine = zig(pts[pi].x, pts[pi].y, o.lean ?? .16, 26), val = zig(pts[vi].x, pts[vi].y, (o.lean ?? .16) + .22, 18);
    const f = [...spine, ...val.slice().reverse()];
    for (let i = vi - 1; i > pi; i--) f.push([pts[i].x, pts[i].y]);
    faces.push(f);
  });
  // costillas secundarias: pequeñas cuñas de sombra en la cara iluminada y de luz en la sombría
  for (let i = 2; i < pts.length - 2; i++) {
    if (r() < (o.ribs ?? .55)) {
      const p = pts[i], len = 90 + r() * 320, lean = .25 + r() * .5, wd = 16 + r() * 54;
      const a = zig(p.x, p.y + 4, lean, 12, 30, 70).filter(q => q[1] < p.y + len);
      if (a.length < 2) continue;
      const end = a[a.length - 1];
      ribs.push([...a, [end[0] + wd * .2, end[1] + 30], ...a.slice(1).reverse().map((q, j, arr) => [q[0] + wd * (1 - j / arr.length) + 8, q[1] - 6])]);
    }
  }
  const silY = (px) => { for (let i = 0; i < pts.length - 1; i++) if (px >= pts[i].x && px <= pts[i + 1].x) return lerp(pts[i].y, pts[i + 1].y, (px - pts[i].x) / (pts[i + 1].x - pts[i].x)); return h; };
  // contrafuertes interiores: cada nivel es otra "hoja" de papel con sus propias caras en sombra
  const inner = (o.inner || []).map((lv, li) => {
    const ip = ridgeLine(w, { base: lv.y * h, amp: lv.amp * h, scale: lv.scale || 300, seed: o.seed * 3 + li * 11, sharp: 1.7, step: 16, jit: 10 });
    const fc = []; let last = -1;
    for (let i = 3; i < ip.length - 3; i++) {
      let pk = true; for (let d = -3; d <= 3; d++) if (ip[i + d][1] < ip[i][1]) pk = false;
      if (!pk || i - last < 5) continue; last = i;
      let vi = i, j = i + 1; for (; j < ip.length - 1; j++) { if (ip[j][1] > ip[vi][1]) vi = j; else if (ip[j][1] < ip[vi][1] - 40) break; }
      const f = [...zig(ip[i][0], ip[i][1], (o.lean ?? .16) + .05, 22, 36, 90), ...zig(ip[vi][0], ip[vi][1], (o.lean ?? .16) + .3, 16, 36, 90).reverse()];
      for (let q = vi - 1; q > i; q--) f.push(ip[q]);
      fc.push(f);
    }
    return { ip, fc };
  });
  // roca: esquirlas angulosas agrupadas en bandas
  const nR = o.rocks ?? 90, cl = [];
  for (let i = 0; i < Math.ceil(nR / 7); i++) { const px = r() * w, top = silY(px); cl.push([px, top + (o.rockFrom ?? 60) + Math.pow(r(), o.rockBias ?? .7) * (h - top) * .85]); }
  for (let i = 0; i < nR; i++) {
    const c = cl[i % cl.length], px = c[0] + (r() - .5) * 260, py = c[1] + (r() - .5) * 320 + (px - c[0]) * .35, rh = 20 + Math.pow(r(), 1.8) * 110, rw = rh * (.28 + r() * .5), rot = .2 + (r() - .5) * .9;
    const n = 4 + Math.floor(r() * 3), sh = [];
    for (let j = 0; j < n; j++) { const a = (j + r() * .7) / n * TAU - Math.PI / 2, rr = .45 + r() * .55, lx = Math.cos(a) * rw * rr, ly = Math.sin(a) * rh * rr; sh.push([px + lx * Math.cos(rot) - ly * Math.sin(rot), py + lx * Math.sin(rot) + ly * Math.cos(rot)]); }
    rocks.push(sh);
  }
  const sil = (x) => { x.beginPath(); x.moveTo(-40, h + 20); pts.forEach(p => x.lineTo(p.x, p.y)); x.lineTo(w + 40, h + 20); x.closePath(); };
  const shadeFill = (x) => vgrad(x, 0, h, [[0, P.shade], [1, P.shade2 || P.shade]]);
  const tmp = mk(w, h), tx = tmp.getContext('2d');
  const mulFaces = (x, list, alpha = 1) => { tx.clearRect(0, 0, w, h); tx.fillStyle = shadeFill(tx); list.forEach(f => { poly(tx, f); tx.fill(); }); x.save(); x.globalCompositeOperation = 'multiply'; x.globalAlpha = alpha; x.drawImage(tmp, 0, 0); x.restore(); };
  const L = paper(w, h, (x) => {
    x.fillStyle = vgrad(x, 0, h, [[0, P.snow], [.6, P.snow2 || P.snow], [1, P.haze]]); x.fillRect(0, 0, w, h);
    // sombra de las caras orientadas a la derecha
    mulFaces(x, faces); mulFaces(x, ribs, .55);
    if (P.bounce) { x.save(); x.beginPath(); faces.forEach(f => { f.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); }); x.clip(); x.globalAlpha = .16; x.fillStyle = P.bounce; ribs.forEach(f => { x.save(); x.translate(-30, 12); poly(x, f); x.fill(); x.restore(); }); x.restore(); }
    inner.forEach(({ ip, fc }, li) => {
      const body = () => { x.beginPath(); x.moveTo(-40, h + 20); ip.forEach(p => x.lineTo(p[0], p[1])); x.lineTo(w + 40, h + 20); x.closePath(); };
      // sombra arrojada por esta hoja sobre la anterior
      x.save(); x.globalCompositeOperation = 'multiply'; x.strokeStyle = P.shade; x.globalAlpha = .5; x.lineWidth = 34; x.lineJoin = 'round'; x.beginPath(); ip.forEach((p, i) => (i ? x.lineTo(p[0] + 8, p[1] - 6) : x.moveTo(p[0] + 8, p[1] - 6))); x.stroke(); x.restore();
      body(); x.fillStyle = vgrad(x, o.inner[li].y * h - o.inner[li].amp * h, h, [[0, P.snow], [.5, P.snow2 || P.snow], [1, P.haze]]); x.fill();
      x.save(); body(); x.clip(); mulFaces(x, fc);
      x.strokeStyle = P.edge || 'rgba(255,255,255,.6)'; x.lineWidth = 3; x.beginPath(); ip.forEach((p, i) => (i ? x.lineTo(p[0], p[1] + 1.5) : x.moveTo(p[0], p[1] + 1.5))); x.stroke(); x.restore();
    });
    rocks.forEach(s => { const m = s.length >> 1; x.fillStyle = P.rock; poly(x, s); x.fill(); x.fillStyle = P.rockLit || 'rgba(255,255,255,.2)'; poly(x, [s[0], [(s[0][0] + s[m][0]) / 2 + 3, (s[0][1] + s[m][1]) / 2], ...s.slice(m)]); x.fill(); });
    // bruma en la base
    x.fillStyle = vgrad(x, h * (o.hazeFrom ?? .55), h, [[0, rgba(P.haze, 0)], [1, rgba(P.haze, o.hazeA ?? .95)]]); x.fillRect(0, 0, w, h);
    // recorte por la silueta
    x.globalCompositeOperation = 'destination-in'; sil(x); x.fillStyle = '#000'; x.fill();
    x.globalCompositeOperation = 'source-atop'; x.strokeStyle = P.edge || 'rgba(255,255,255,.5)'; x.lineWidth = 3.5;
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p.x, p.y + 1.5) : x.moveTo(p.x, p.y + 1.5))); x.stroke();
    x.globalCompositeOperation = 'source-over';
  }, o);
  L.pts = pts; L.peaks = peaks.map(i => pts[i]); L.silY = silY;
  return L;
}

/* ---------- nubes de papel ---------- */
function cloudLayer(w, h, o) {
  const r = rng(o.seed);
  return paper(w, h, (x) => {
    x.fillStyle = vgrad(x, 0, h, [[0, o.col], [1, o.col2 || o.col]]);
    x.beginPath();
    const base = h * (o.base ?? .62); let px = -60;
    while (px < w + 60) { const rad = (o.rMin ?? 40) + r() * ((o.rMax ?? 110) - (o.rMin ?? 40)); x.moveTo(px + rad, base - rad * .25 * r()); x.arc(px, base - rad * (.1 + r() * .5), rad, 0, TAU); px += rad * (.7 + r() * .7); }
    x.rect(-60, base - 4, w + 120, h - base + 10);
    x.fill();
    if (o.edge) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = vgrad(x, 0, base, [[0, o.edge], [1, rgba('#ffffff', 0)]]); x.fillRect(0, 0, w, base); x.globalCompositeOperation = 'source-over'; }
  }, o);
}

/* ---------- partículas de nieve (posiciones cerradas en función de t) ---------- */
function snow(x, t, o = {}) {
  const n = o.n ?? 140, seed = o.seed ?? 5, vx = o.vx ?? -60, vy = o.vy ?? 150, col = o.col || '#ffffff';
  x.save(); x.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const z = .25 + hash1(i, seed) * .75; // profundidad
    const px = ((hash1(i, seed + 1) * (W + 200) + vx * t * z + Math.sin(t * (.6 + hash1(i, seed + 3)) + i) * 26 * z) % (W + 200) + (W + 200)) % (W + 200) - 100;
    const py = ((hash1(i, seed + 2) * (H + 200) + vy * t * z) % (H + 200) + (H + 200)) % (H + 200) - 100;
    const rad = (o.size ?? 5) * z * z;
    x.globalAlpha = (o.alpha ?? .85) * (.35 + .65 * z) * (.6 + .4 * Math.sin(t * 3 + i * 1.7));
    if (o.streak) { x.beginPath(); x.ellipse(px, py, rad * (1 + o.streak * z), rad * .7, Math.atan2(vy, vx), 0, TAU); x.fill(); }
    else { x.beginPath(); x.arc(px, py, rad, 0, TAU); x.fill(); }
  }
  x.restore();
}

/* ---------- sol / luna con halos escalonados ---------- */
function orb(x, cx, cy, rad, col, o = {}) {
  const rings = o.rings ?? 4;
  for (let i = rings; i >= 1; i--) { x.globalAlpha = (o.ha ?? .11) * (1 - (i - 1) / (rings + 1)); x.fillStyle = o.halo || col; x.beginPath(); x.arc(cx, cy, rad * (1 + i * (o.step ?? .42)), 0, TAU); x.fill(); }
  x.globalAlpha = o.alpha ?? 1; x.fillStyle = col; x.beginPath(); x.arc(cx, cy, rad, 0, TAU); x.fill(); x.globalAlpha = 1;
}
function rays(x, cx, cy, r0, r1, n, rot, col, alpha) {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.fillStyle = col; x.globalAlpha = alpha;
  for (let i = 0; i < n; i++) { const a = i / n * TAU, da = TAU / n * .25; x.beginPath(); x.moveTo(Math.cos(a - da * .3) * r0, Math.sin(a - da * .3) * r0); x.lineTo(Math.cos(a - da) * r1, Math.sin(a - da) * r1); x.lineTo(Math.cos(a + da) * r1, Math.sin(a + da) * r1); x.lineTo(Math.cos(a + da * .3) * r0, Math.sin(a + da * .3) * r0); x.closePath(); x.fill(); }
  x.restore();
}

/* ---------- alpinista de papel ---------- */
function climber(x, px, py, s, o = {}) {
  // px,py = pies. phase: ciclo de paso. slope: ángulo de la ladera. arm: 0..1 piolet en alto
  const ph = o.phase ?? 0, jacket = o.jacket || '#e5533c', dark = o.dark || '#141b3a', dir = o.dir ?? 1;
  x.save(); x.translate(px, py); x.scale(s * dir, s); x.rotate((o.lean ?? .12));
  x.lineCap = 'round'; x.lineJoin = 'round';
  const sw = Math.sin(ph), sw2 = Math.sin(ph + Math.PI), bob = Math.abs(Math.cos(ph)) * 2.2;
  const hip = [0, -30 + bob];
  // piernas
  const leg = (k, col) => { const fx = k * 9, fy = Math.min(0, -Math.max(0, k) * 5); const kx = hip[0] + k * 5 + 4, ky = hip[1] + 15; x.strokeStyle = col; x.lineWidth = 7.5; x.beginPath(); x.moveTo(hip[0], hip[1]); x.lineTo(kx, ky); x.lineTo(fx, fy); x.stroke(); x.lineWidth = 8; x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + 6, fy); x.stroke(); };
  leg(sw2, o.dark2 || '#0c1230'); leg(sw, dark);
  // mochila
  x.fillStyle = o.pack || '#3b2a2a'; x.beginPath(); x.roundRect(-17, -62 + bob, 13, 26, 5); x.fill();
  // torso
  x.strokeStyle = jacket; x.lineWidth = 15; x.beginPath(); x.moveTo(hip[0], hip[1] - 4); x.lineTo(4, -56 + bob); x.stroke();
  // brazo con piolet
  const arm = o.arm ?? 0, sh = [4, -54 + bob];
  const hx = lerp(18 + sw2 * 4, 10, arm), hy = lerp(-34 + bob, -92, arm);
  x.strokeStyle = jacket; x.lineWidth = 6.5; x.beginPath(); x.moveTo(sh[0], sh[1]); x.lineTo(lerp(14, 10, arm), lerp(-44 + bob, -72, arm)); x.lineTo(hx, hy); x.stroke();
  if (o.axe !== false) {
    x.strokeStyle = o.axeCol || '#f3e9d2'; x.lineWidth = 2.6;
    const ax = lerp(hx + 4, hx, arm), ay0 = lerp(hy - 12, hy + 6, arm), ay1 = lerp(-2, hy - 30, arm), axb = lerp(hx + 12, hx, arm);
    x.beginPath(); x.moveTo(ax, ay0); x.lineTo(axb, ay1); x.stroke();
    const tx = arm > .5 ? axb : ax, ty = arm > .5 ? ay1 : ay0;
    x.beginPath(); x.moveTo(tx - 7, ty + 1); x.lineTo(tx + 9, ty - 1); x.stroke();
    if (o.flag) { // banderín en el piolet
      const fl = o.flag, fw = 30, fh = 18, wv = Math.sin(o.t * 9) * 2.5;
      const cols = ['#2b4fa8', '#f6f1e4', '#d8362f'];
      cols.forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.moveTo(tx + i * fw / 3, ty + 3 + Math.sin(o.t * 9 + i) * 1.5 * i); x.lineTo(tx + (i + 1) * fw / 3 + .5, ty + 3 + Math.sin(o.t * 9 + i + 1) * 1.5 * (i + 1)); x.lineTo(tx + (i + 1) * fw / 3 + .5, ty + 3 + fh + Math.sin(o.t * 9 + i + 1.5) * 1.5 * (i + 1)); x.lineTo(tx + i * fw / 3, ty + 3 + fh + Math.sin(o.t * 9 + i + .5) * 1.5 * i); x.closePath(); x.globalAlpha = fl; x.fill(); x.globalAlpha = 1; });
    }
  }
  // cabeza con capucha
  x.fillStyle = jacket; x.beginPath(); x.arc(7, -68 + bob, 9.5, 0, TAU); x.fill();
  x.fillStyle = o.face || '#f1c9a5'; x.beginPath(); x.arc(10.5, -67 + bob, 5.2, 0, TAU); x.fill();
  x.fillStyle = '#10152e'; x.fillRect(8.5, -69.5 + bob, 7.5, 3); // gafas de glaciar
  x.restore();
}

/* ---------- tipografía ---------- */
const F = {
  serif: (px, wt = 600, it = false) => `${it ? 'italic ' : ''}${wt} ${px}px Fraunces`,
  cond: (px, wt = 600) => `${wt} ${px}px "Barlow Condensed"`,
};
function text(x, str, px, py, o = {}) {
  x.save(); x.font = o.font; x.textAlign = o.align || 'center'; x.textBaseline = o.base || 'alphabetic';
  if (o.ls != null) x.letterSpacing = o.ls + 'px';
  x.globalAlpha *= clamp(o.alpha ?? 1);
  if (o.shadow) { x.shadowColor = o.shadow; x.shadowBlur = o.sb ?? 18; x.shadowOffsetY = o.sy ?? 4; }
  x.fillStyle = o.col || '#f3e9d2';
  if (o.stroke) { x.strokeStyle = o.stroke; x.lineWidth = o.lw || 2; x.strokeText(str, px, py); }
  if (o.fill !== false) x.fillText(str, px, py);
  x.restore();
}
/* texto que emerge desde una máscara (clásico "reveal" de motion design) */
function reveal(x, str, px, py, p, o = {}) {
  if (p <= 0) return;
  x.save(); x.font = o.font; if (o.ls != null) x.letterSpacing = o.ls + 'px';
  const m = x.measureText(str), hgt = (o.size || 80) * 1.25, wd = m.width + 40;
  const left = o.align === 'left' ? px - 20 : o.align === 'right' ? px - wd + 20 : px - wd / 2;
  x.beginPath(); x.rect(left, py - hgt * .86, wd, hgt * 1.08); x.clip();
  text(x, str, px, py + (1 - E.outQuint(clamp(p))) * hgt, o);
  x.restore();
}
/* texto letra a letra con escalonado */
function stagger(x, str, px, py, t, o = {}) {
  x.save(); x.font = o.font; if (o.ls != null) x.letterSpacing = o.ls + 'px';
  const total = x.measureText(str).width; let cx = o.align === 'left' ? px : px - total / 2; x.restore();
  for (let i = 0; i < str.length; i++) {
    x.save(); x.font = o.font; if (o.ls != null) x.letterSpacing = o.ls + 'px'; const cw = x.measureText(str[i]).width; x.restore();
    const p = E.outBack(clamp((t - i * (o.gap ?? .04)) / (o.dur ?? .5)));
    if (p > 0) text(x, str[i], cx, py + (1 - p) * (o.rise ?? 60), { ...o, align: 'left', alpha: (o.alpha ?? 1) * clamp(p * 1.6) });
    cx += cw;
  }
}
