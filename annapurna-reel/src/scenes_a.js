'use strict';
/* =========================================================================
   Escenas 1–4. Cada escena es una función pura de t (segundos absolutos).
   ========================================================================= */
const C = { cream: '#f3e9d2', gold: '#ffd27a', red: '#e5533c', ink: '#0b1026', navy: '#141b3a', must: '#f2b340', sepia: '#4a3524' };
const S = TL.scenes;
const A = {}; // recursos pre-renderizados
const wt = (seg, i) => TL.vo.find(v => v.id === seg).words[i].t;      // instante de la palabra i
const we = (seg, i) => { const w = TL.vo.find(v => v.id === seg).words[i]; return w.t + w.d; };
function kf(t, frames, fn = E.inOut) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 0; i < frames.length - 1; i++) { const [a, va] = frames[i], [b, vb] = frames[i + 1]; if (t <= b) return lerp(va, vb, fn((t - a) / (b - a))); }
  return frames[frames.length - 1][1];
}
function stars(x, t, n, seed, maxY, alpha = 1) {
  x.save(); x.fillStyle = '#fff';
  for (let i = 0; i < n; i++) {
    const px = hash1(i, seed) * W, py = Math.pow(hash1(i, seed + 1), 1.4) * maxY, r = .8 + hash1(i, seed + 2) * 2.2;
    x.globalAlpha = alpha * (.25 + .75 * Math.pow(.5 + .5 * Math.sin(t * (1 + hash1(i, seed + 3) * 2.5) + i), 2)) * (1 - py / maxY * .6);
    x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
    if (r > 2.6) { x.globalAlpha *= .5; x.fillRect(px - r * 3, py - .5, r * 6, 1); x.fillRect(px - .5, py - r * 3, 1, r * 6); }
  }
  x.restore();
}
/* trazo a mano que se dibuja progresivamente */
function wobble(pts, seed, amt = 5, sub = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < sub; k++) { const u = k / sub, n = out.length; out.push([lerp(pts[i][0], pts[i + 1][0], u) + (vnoise(n * .45, seed) - .5) * amt * 2, lerp(pts[i][1], pts[i + 1][1], u) + (vnoise(n * .45, seed + 9) - .5) * amt * 2]); }
  out.push(pts[pts.length - 1]); return out;
}
function pathLen(p) { let l = 0; const acc = [0]; for (let i = 1; i < p.length; i++) { l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); acc.push(l); } return { l, acc }; }
function drawOn(x, p, f, o = {}) {
  if (f <= 0) return null;
  const { l, acc } = p._len || (p._len = pathLen(p)); const target = l * clamp(f);
  x.save(); x.strokeStyle = o.col || C.red; x.lineWidth = o.lw || 6; x.lineCap = 'round'; x.lineJoin = 'round'; if (o.dash) x.setLineDash(o.dash);
  x.globalAlpha = o.alpha ?? 1; x.beginPath(); x.moveTo(p[0][0], p[0][1]); let head = p[0];
  for (let i = 1; i < p.length; i++) {
    if (acc[i] <= target) { x.lineTo(p[i][0], p[i][1]); head = p[i]; }
    else { const u = (target - acc[i - 1]) / (acc[i] - acc[i - 1]); head = [lerp(p[i - 1][0], p[i][0], u), lerp(p[i - 1][1], p[i][1], u)]; x.lineTo(head[0], head[1]); break; }
  }
  x.stroke(); x.restore(); return head;
}

/* =====================================================================
   ESCENA 1 — 1950: catorce gigantes, cero cumbres
   ===================================================================== */
const EIGHT = [8849, 8611, 8586, 8516, 8485, 8188, 8167, 8163, 8126, 8091, 8080, 8051, 8035, 8027]; // Annapurna = índice 9
function initS1() {
  A.n1 = ridgeLayer(1500, 1500, { seed: 3, base: 540, amp: 480, scale: 520, col: '#3b4394', col2: '#353c86', haze: '#4d4d9c', snow: 'rgba(222,228,255,.55)', snowLine: .42, sharp: 1.7, shadow: 34, sa: .4 });
  A.n2 = ridgeLayer(1500, 1400, { seed: 8, base: 470, amp: 400, scale: 430, col: '#283078', col2: '#2b327c', haze: '#3d418c', snow: 'rgba(196,206,250,.3)', snowLine: .55, sa: .5 });
  A.n3 = ridgeLayer(1500, 1300, { seed: 14, base: 420, amp: 340, scale: 380, col: '#1a205a', haze: '#272c6c', sa: .55 });
  A.n4 = ridgeLayer(1500, 1200, { seed: 21, base: 380, amp: 300, scale: 330, col: '#10153e', haze: '#191e50', sa: .6 });
  A.n5 = ridgeLayer(1500, 1000, { seed: 33, base: 330, amp: 260, scale: 300, col: '#080b24', haze: '#0b0f2e', sa: .65 });
}
function s1(x, t) {
  const cam = E.outQuint(prog(t, 0, 3.2)) * .62 + .38 * prog(t, 0, 10.2);
  const drift = t * 9;
  x.fillStyle = vgrad(x, 0, H, [[0, '#050818'], [.4, '#111844'], [.75, '#2a2e72'], [1, '#55458c']]); x.fillRect(0, 0, W, H);
  stars(x, t, 230, 7, 1500);
  // luna
  const mx = 868, my = 300 + cam * 40;
  orb(x, mx, my, 104, '#f4ead0', { rings: 5, ha: .07, step: .5, halo: '#cfd4ff' });
  x.globalAlpha = .1; x.fillStyle = '#8f8fb8'; [[-30, -22, 22], [26, 14, 30], [-10, 40, 14], [38, -40, 12]].forEach(([a, b, r]) => { x.beginPath(); x.arc(mx + a, my + b, r, 0, TAU); x.fill(); }); x.globalAlpha = 1;

  const tIn = wt('s1', 3) - .25, p2 = ease(t, tIn, tIn + 1.0);         // paso a la infografía
  put(x, A.n1, -210 - drift * .25, lerp(520, 800, cam));
  // "1950" encajado entre capas (profundidad)
  const up = E.outQuint(prog(t, .2, 2.5)), ty = lerp(lerp(1620, 880, up), 392, p2), sc = lerp(1, .40, p2);
  x.save(); x.translate(540, ty); x.scale(sc, sc);
  text(x, '1950', 0, 0, { font: F.serif(430, 900), col: C.cream, ls: -6, shadow: 'rgba(5,8,30,.55)', sb: 40, sy: 14 });
  x.restore();
  put(x, A.n2, -160 - drift * .45, lerp(600, 1090, cam));
  put(x, A.n3, -240 - drift * .7, lerp(860, 1380, cam));
  put(x, A.n4, -120 - drift, lerp(1120, 1640, cam));
  put(x, A.n5, -200 - drift * 1.4, lerp(1400, 1900, cam));
  snow(x, t, { n: 90, seed: 3, vx: -30, vy: 70, size: 4.5, alpha: .55 });

  // ---- infografía: los 14 ochomiles
  if (p2 > 0) {
    x.fillStyle = `rgba(5,8,26,${.42 * p2})`; x.fillRect(0, 0, W, H);
    const t14 = wt('s1', 7) - .12, base = 1010, x0 = 98, dx = 68;
    text(x, 'LOS CATORCE OCHOMILES', 540, 548, { font: F.cond(40, 600), ls: 12, alpha: .82 * ease(t, t14 - .2, t14 + .5, E.out) });
    const lw = 884 * ease(t, t14 - .1, t14 + .9, E.out);
    x.strokeStyle = rgba(C.cream, .5); x.lineWidth = 2; x.setLineDash([3, 9]); x.beginPath(); x.moveTo(98 - 34, base + 1); x.lineTo(98 - 34 + lw + 68, base + 1); x.stroke(); x.setLineDash([]);
    text(x, '8.000 m', 64, base + 44, { font: F.cond(30, 600), ls: 3, align: 'left', alpha: .7 * ease(t, t14 + .5, t14 + 1) });
    const tNo = wt('s1', 16) - .05;
    for (let i = 0; i < 14; i++) {
      const g = E.outBack(prog(t, t14 + i * .055, t14 + i * .055 + .55)); if (g <= 0) continue;
      const cx = x0 + i * dx, hh = (150 + (EIGHT[i] - 8000) / 849 * 250) * g, hw = 44;
      x.fillStyle = 'rgba(4,6,22,.35)'; x.beginPath(); x.moveTo(cx - hw + 8, base); x.lineTo(cx + 8, base - hh + 6); x.lineTo(cx + hw + 12, base); x.fill();
      x.fillStyle = '#cdd6ff'; x.beginPath(); x.moveTo(cx - hw, base); x.lineTo(cx, base - hh); x.lineTo(cx + 6, base); x.fill();
      x.fillStyle = '#6f7bd0'; x.beginPath(); x.moveTo(cx, base - hh); x.lineTo(cx + hw, base); x.lineTo(cx + 6, base); x.lineTo(cx - 6, base - hh * .45); x.fill();
      x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(cx, base - hh); x.lineTo(cx - hw * .3, base - hh * .7); x.lineTo(cx - 4, base - hh * .76); x.lineTo(cx + 2, base - hh * .64); x.lineTo(cx + hw * .22, base - hh * .78); x.fill();
      // anillo vacío = cumbre sin pisar
      const rp = E.outBack(prog(t, t14 + .5 + i * .055, t14 + .9 + i * .055)), pulse = Math.max(0, 1 - Math.abs((t - tNo - i * .045) / .16));
      if (rp > 0) { x.strokeStyle = pulse > 0 ? mix(C.cream, C.red, pulse) : C.cream; x.lineWidth = 3.2; x.beginPath(); x.arc(cx, base - hh - 26, (10 + pulse * 5) * rp, 0, TAU); x.stroke(); }
    }
    // 0 / 14
    const z = prog(t, tNo, tNo + .5);
    if (z > 0) {
      const s0 = lerp(1.9, 1, E.outExpo(z));
      x.save(); x.translate(540, 1228); x.scale(s0, s0); x.globalAlpha = clamp(z * 3);
      x.font = F.serif(190, 900); const w0 = x.measureText('0').width, w1 = x.measureText(' / 14').width, st = -(w0 + w1) / 2;
      text(x, '0', st, 0, { font: F.serif(190, 900), col: C.red, align: 'left', shadow: 'rgba(0,0,0,.4)' });
      text(x, ' / 14', st + w0, 0, { font: F.serif(190, 900), col: C.cream, align: 'left', shadow: 'rgba(0,0,0,.4)' });
      x.restore();
      reveal(x, 'CUMBRES PISADAS', 540, 1296, prog(t, tNo + .35, tNo + .95), { font: F.cond(36, 600), ls: 12, size: 36, alpha: .85 });
    }
  }
}

/* =====================================================================
   ESCENA 2 — el mapa que miente
   ===================================================================== */
const MAP = { OX: 310, OY: 340, SW: 1700, SH: 2600, dh: [190, 770], fake: [770, 520], real: [800, 1010], tuk: [478, 640] };
const riverX = (y) => 432 + 46 * Math.sin(y / 300) + 26 * Math.sin(y / 130 + 1);
function mapH(px, py) {
  const b = (cx, cy, r) => Math.exp(-((px - cx) ** 2 + (py - cy) ** 2) / (r * r));
  return .40 * fbm2(px / 250, py / 250, 7, 4) + .58 * b(190, 770, 230) + .66 * b(800, 1010, 250) + .3 * b(620, 660, 140) + .42 * b(880, 400, 200) + .3 * b(180, 1500, 300) + .35 * b(900, 1650, 260)
    - .26 * Math.exp(-((px - riverX(py)) ** 2) / (95 * 95));
}
function initS2() {
  const { OX, OY, SW, SH } = MAP, ink = C.sepia;
  A.map = paper(SW, SH, (x) => {
    // hoja con borde rasgado
    const r = rng(4), edge = [];
    for (let px = 0; px <= SW; px += 22) edge.push([px, 26 + r() * 22 + (r() < .12 ? r() * 30 : 0)]);
    x.beginPath(); x.moveTo(0, SH); edge.forEach(p => x.lineTo(p[0], p[1])); x.lineTo(SW, SH); x.closePath();
    x.fillStyle = vgrad(x, 0, SH, [[0, '#efdfbb'], [.5, '#e9d6ad'], [1, '#dcc594']]); x.fill();
    x.save(); x.clip();
    for (let i = 0; i < 26; i++) { const cx = r() * SW, cy = r() * SH, rad = 120 + r() * 380; const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, `rgba(150,105,50,${.05 + r() * .08})`); g.addColorStop(1, 'rgba(150,105,50,0)'); x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); }
    x.translate(OX, OY);
    // retícula
    x.strokeStyle = rgba(ink, .16); x.lineWidth = 1.5;
    for (let gx = -300; gx < 1400; gx += 180) { x.beginPath(); x.moveTo(gx, -340); x.lineTo(gx, 2300); x.stroke(); }
    for (let gy = -300; gy < 2300; gy += 180) { x.beginPath(); x.moveTo(-310, gy); x.lineTo(1400, gy); x.stroke(); }
    // curvas de nivel (marching squares)
    const cs = 13, nx = Math.ceil(SW / cs) + 1, ny = Math.ceil(SH / cs) + 1, f = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) f[j * nx + i] = mapH(i * cs - OX, j * cs - OY);
    for (let li = 0; li < 17; li++) {
      const lv = .2 + li * .05; x.strokeStyle = rgba(ink, li % 4 === 0 ? .6 : .34); x.lineWidth = li % 4 === 0 ? 2.4 : 1.4; x.beginPath();
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = f[j * nx + i], b = f[j * nx + i + 1], c = f[(j + 1) * nx + i + 1], d = f[(j + 1) * nx + i];
        const k = (a > lv) | ((b > lv) << 1) | ((c > lv) << 2) | ((d > lv) << 3); if (k === 0 || k === 15) continue;
        const X0 = i * cs - OX, Y0 = j * cs - OY, ip = (u, v) => (lv - u) / (v - u) * cs;
        const T = [X0 + ip(a, b), Y0], R = [X0 + cs, Y0 + ip(b, c)], B = [X0 + ip(d, c), Y0 + cs], Lf = [X0, Y0 + ip(a, d)];
        const seg = (p, q) => { x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); };
        switch (k) { case 1: case 14: seg(Lf, T); break; case 2: case 13: seg(T, R); break; case 3: case 12: seg(Lf, R); break; case 4: case 11: seg(R, B); break; case 6: case 9: seg(T, B); break; case 7: case 8: seg(Lf, B); break; case 5: seg(Lf, T); seg(R, B); break; case 10: seg(T, R); seg(Lf, B); break; }
      }
      x.stroke();
    }
    // río Kali Gandaki
    x.strokeStyle = 'rgba(70,118,150,.75)'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); for (let y = -340; y < 2300; y += 20) x.lineTo(riverX(y), y); x.stroke();
    x.strokeStyle = 'rgba(70,118,150,.5)'; x.lineWidth = 3.5;[[620, 1000, 1], [300, 1260, -1], [640, 300, 1]].forEach(([ex, ey, s]) => { x.beginPath(); x.moveTo(riverX(ey + 60), ey + 60); x.quadraticCurveTo(lerp(riverX(ey), ex, .5), ey + 70 * s, ex, ey); x.stroke(); });
    x.save(); x.translate(riverX(1320) - 26, 1320); x.rotate(-Math.PI / 2 + .1); text(x, 'KALI  GANDAKI', 0, 0, { font: F.serif(24, 400, true), col: 'rgb(55,100,130)', ls: 6 }); x.restore();
    // rotulación impresa
    const tri = (px, py, s = 1, col = ink) => { x.fillStyle = col; x.beginPath(); x.moveTo(px, py - 15 * s); x.lineTo(px + 14 * s, py + 9 * s); x.lineTo(px - 14 * s, py + 9 * s); x.fill(); };
    tri(...MAP.dh); text(x, 'DHAULAGIRI', MAP.dh[0], MAP.dh[1] + 52, { font: F.serif(34, 600), col: ink, ls: 3 }); text(x, '8167', MAP.dh[0], MAP.dh[1] + 84, { font: F.cond(26, 600), col: ink, ls: 3, alpha: .8 });
    tri(...MAP.fake); text(x, 'ANNAPURNA', MAP.fake[0], MAP.fake[1] - 34, { font: F.serif(34, 600), col: ink, ls: 3 });
    x.fillStyle = ink; x.beginPath(); x.arc(MAP.tuk[0], MAP.tuk[1], 7, 0, TAU); x.fill(); x.strokeStyle = ink; x.lineWidth = 2; x.beginPath(); x.arc(MAP.tuk[0], MAP.tuk[1], 12, 0, TAU); x.stroke();
    text(x, 'Tukucha', MAP.tuk[0] + 22, MAP.tuk[1] + 9, { font: F.serif(27, 400, true), col: ink, align: 'left' });
    text(x, 'NILGIRI', 630, 705, { font: F.cond(22, 600), col: ink, ls: 5, alpha: .7 });
    text(x, 'T  I  B  E  T', 560, 90, { font: F.cond(26, 500), col: ink, ls: 10, alpha: .5 });
    // cartela
    text(x, 'NEPAL', 66, 318, { font: F.serif(104, 900), col: ink, align: 'left', ls: 2 });
    x.fillStyle = ink; x.fillRect(70, 338, 330, 4); x.fillRect(70, 348, 330, 1.5);
    text(x, 'MAPA OFICIAL · ED. 1950', 70, 386, { font: F.cond(28, 600), col: ink, align: 'left', ls: 5, alpha: .85 });
    // rosa de los vientos
    x.save(); x.translate(930, 330); x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 54, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, 46, 0, TAU); x.globalAlpha = .4; x.stroke(); x.globalAlpha = 1;
    for (let i = 0; i < 8; i++) { x.save(); x.rotate(i * Math.PI / 4); const l = i % 2 ? 30 : 68; x.beginPath(); x.moveTo(0, -l); x.lineTo(7, 0); x.lineTo(0, 0); x.fill(); x.beginPath(); x.moveTo(0, -l); x.lineTo(-7, 0); x.lineTo(0, 0); x.globalAlpha = .35; x.fill(); x.restore(); }
    text(x, 'N', 0, -78, { font: F.serif(26, 600), col: ink }); x.restore();
    // pliegues
    x.restore(); x.save(); x.beginPath(); x.moveTo(0, SH); edge.forEach(p => x.lineTo(p[0], p[1])); x.lineTo(SW, SH); x.closePath(); x.clip();
    [[OX + 540, 0, 1], [0, OY + 1130, 0]].forEach(([fx, fy, v]) => { const g = v ? x.createLinearGradient(fx - 26, 0, fx + 26, 0) : x.createLinearGradient(0, fy - 26, 0, fy + 26); g.addColorStop(0, 'rgba(90,60,20,0)'); g.addColorStop(.48, 'rgba(90,60,20,.16)'); g.addColorStop(.5, 'rgba(255,250,230,.35)'); g.addColorStop(.56, 'rgba(90,60,20,.05)'); g.addColorStop(1, 'rgba(90,60,20,0)'); x.fillStyle = g; if (v) x.fillRect(fx - 26, 0, 52, SH); else x.fillRect(0, fy - 26, SW, 52); });
    x.restore();
  }, { tex: 1, shadow: 46, sa: .7, sdy: -16, shadowColor: '#03040f' });
  // rutas de exploración (tinta roja, a mano)
  const T0 = MAP.tuk;
  A.rA = wobble([T0, [400, 655], [330, 695], [270, 728], [222, 752]], 3, 4);
  A.rB = wobble([T0, [520, 566], [600, 480], [690, 470], [752, 508]], 5, 5);
  A.rC = wobble([[752, 508], [860, 548], [905, 680], [800, 772], [660, 800], [545, 880], [470, 1000], [545, 1075], [660, 1052], [742, 1026]], 8, 6);
}
function s2(x, t) {
  const t0 = S[1], enter = E.outQuint(prog(t, t0 - .45, t0 + .8));
  const tExp = wt('s2', 6), tHz = wt('s2', 12), tMap = wt('s2', 15), tLie = wt('s2', 17), tWk = wt('s2', 18), tMnt = wt('s2', 22), tEnd = we('s2', 27);
  const zoom = E.inExpo(prog(t, S[2] - .75, S[2] + .25));
  // cámara: foco, escala y giro
  const fx = kf(t, [[t0, 520], [tExp, 470], [tHz + .6, 400], [tMap + .2, 640], [tLie + .9, 700], [tWk + 1.2, 760], [tMnt + .8, 690], [tEnd - .2, 780], [S[2] - .1, 800]]);
  const fy = kf(t, [[t0, 830], [tExp, 760], [tHz + .6, 700], [tMap + .2, 600], [tLie + .9, 600], [tWk + 1.2, 720], [tMnt + .8, 940], [tEnd - .2, 1000], [S[2] - .1, 1010]]);
  let sc = kf(t, [[t0, 1.02], [tExp, 1.1], [tHz + .6, 1.32], [tMap + .2, 1.38], [tLie + .9, 1.5], [tWk + 1.2, 1.3], [tMnt + .8, 1.3], [tEnd - .2, 1.46]]);
  sc *= 1 + zoom * 5;
  const rot = kf(t, [[t0 - .4, -.09], [t0 + 1.2, -.035], [tMap, .02], [tEnd, -.015]]) + zoom * .12;
  x.save();
  x.translate(540, 900 + (1 - enter) * 2150); x.rotate(rot); x.scale(sc, sc); x.translate(-fx, -fy);
  put(x, A.map, -MAP.OX, -MAP.OY);
  // --- tinta roja
  const red = '#c9362b';
  // banderín de la expedición en Tukucha
  const pf = E.outBack(prog(t, tExp - .1, tExp + .45));
  if (pf > 0) {
    x.save(); x.translate(MAP.tuk[0], MAP.tuk[1]); x.scale(pf, pf);
    x.strokeStyle = red; x.lineWidth = 4; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -58); x.stroke();
    x.fillStyle = red; x.beginPath(); x.moveTo(0, -58); x.lineTo(40 + Math.sin(t * 6) * 3, -47); x.lineTo(0, -34); x.fill(); x.restore();
    x.save(); x.translate(MAP.tuk[0] + 16, MAP.tuk[1] - 64); x.rotate(-.05);
    reveal(x, 'Expedición francesa', 0, 0, prog(t, tExp, tExp + .6), { font: F.serif(32, 600, true), col: red, align: 'left', size: 32, alpha: 1 - prog(t, tHz + .4, tHz + .9) }); x.restore();
  }
  const hA = drawOn(x, A.rA, ease(t, tExp + .5, tHz + .5, E.inOut), { col: red, lw: 5, dash: [16, 11] });
  const cross = (px, py, p, s = 26) => { if (p <= 0) return; x.save(); x.strokeStyle = red; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(px - s, py - s); x.lineTo(px - s + 2 * s * clamp(p * 2), py - s + 2 * s * clamp(p * 2)); if (p > .5) { x.moveTo(px + s, py - s); x.lineTo(px + s - 2 * s * (p * 2 - 1), py - s + 2 * s * (p * 2 - 1)); } x.stroke(); x.restore(); };
  cross(MAP.dh[0] + 4, MAP.dh[1] - 2, prog(t, tHz + .45, tHz + .85));
  const hB = drawOn(x, A.rB, ease(t, tHz + .7, tMap + .55, E.inOut), { col: red, lw: 5, dash: [16, 11] });
  // "que mienten": la cumbre impresa no está donde dice el mapa
  cross(MAP.fake[0], MAP.fake[1] - 4, prog(t, tLie - .15, tLie + .3), 34);
  const pl = prog(t, tLie - .1, tLie + .4);
  if (pl > 0) { x.save(); x.strokeStyle = red; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); x.moveTo(MAP.fake[0] - 108, MAP.fake[1] - 46); x.lineTo(MAP.fake[0] - 108 + 216 * E.out(pl), MAP.fake[1] - 44); x.stroke(); x.translate(MAP.fake[0] + 96, MAP.fake[1] + 44); x.rotate(.12); const q = E.outBack(prog(t, tLie + .15, tLie + .6)); x.scale(q, q); text(x, '¿?', 0, 0, { font: F.serif(84, 900, true), col: red }); x.restore(); }
  const hC = drawOn(x, A.rC, ease(t, tWk, tEnd - .5, E.inOut), { col: red, lw: 5, dash: [16, 11] });
  [[905, 680], [545, 880]].forEach((q, i) => { const pq = E.outBack(prog(t, tWk + .9 + i * 1.1, tWk + 1.3 + i * 1.1)); if (pq > 0) { x.save(); x.translate(q[0] + 40, q[1] - 14); x.scale(pq, pq); text(x, '?', 0, 0, { font: F.serif(52, 900, true), col: red, alpha: .9 }); x.restore(); } });
  const head = (t > tWk ? hC : t > tHz + .7 ? hB : hA);
  if (head && t < tEnd - .45) { x.fillStyle = red; x.beginPath(); x.arc(head[0], head[1], 10, 0, TAU); x.fill(); x.fillStyle = 'rgba(201,54,43,.25)'; x.beginPath(); x.arc(head[0], head[1], 18 + Math.sin(t * 9) * 4, 0, TAU); x.fill(); }
  // hallazgo: la montaña verdadera
  const pc = ease(t, tEnd - .55, tEnd + .1, E.out);
  if (pc > 0) {
    x.save(); x.strokeStyle = red; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.ellipse(MAP.real[0], MAP.real[1], 74, 62, -.2, -1.2, -1.2 + TAU * 1.06 * pc); x.stroke();
    const pt = E.outBack(prog(t, tEnd - .35, tEnd + .1)); x.translate(MAP.real[0], MAP.real[1]); x.scale(pt, pt); x.fillStyle = red; x.beginPath(); x.moveTo(0, -24); x.lineTo(22, 15); x.lineTo(-22, 15); x.fill(); x.restore();
    x.save(); x.translate(MAP.real[0] - 6, MAP.real[1] + 118); x.rotate(-.06); reveal(x, 'Annapurna', 0, 0, prog(t, tEnd - .3, tEnd + .25), { font: F.serif(50, 900, true), col: red, size: 50 }); x.restore();
  }
  x.restore();
  // contador de días de búsqueda (fuera del mapa, HUD)
  const pd = ease(t, tWk - .2, tWk + .4, E.out) * (1 - prog(t, S[2] - .8, S[2] - .4));
  if (pd > 0) {
    const day = Math.round(lerp(1, 30, ease(t, tWk, tEnd - .3, E.lin)));
    x.save(); x.translate(132 - (1 - pd) * 60, 1196); x.rotate(-.04); x.globalAlpha = pd;
    x.fillStyle = 'rgba(40,24,10,.28)'; x.beginPath(); x.roundRect(-76 + 7, -106 + 10, 188, 172, 10); x.fill();
    x.fillStyle = '#f7ecd0'; x.beginPath(); x.roundRect(-76, -106, 188, 172, 10); x.fill();
    x.fillStyle = '#c9362b'; x.beginPath(); x.roundRect(-76, -106, 188, 44, [10, 10, 0, 0]); x.fill();
    text(x, 'DÍA', 18, -73, { font: F.cond(30, 700), col: '#f7ecd0', ls: 8 });
    text(x, String(day), 18, 40, { font: F.cond(116, 700), col: C.sepia });
    x.restore();
  }
}

/* =====================================================================
   ESCENA 3 — la ruta y el monzón
   ===================================================================== */
const ANN = [[0, .40], [.08, .355], [.17, .30, 1], [.25, .345], [.33, .26], [.42, .19], [.5, .12, 1], [.57, .175], [.63, .205], [.71, .165, 1], [.78, .235], [.86, .20, 1], [.93, .29], [1, .37]];
const ANN_IN = [{ y: .40, amp: .075 }, { y: .50, amp: .08 }, { y: .60, amp: .085 }, { y: .70, amp: .09 }, { y: .80, amp: .09 }, { y: .90, amp: .09 }];
const MW = 1400, MH = 2600, MX = -160;           // lienzo de la montaña; cumbre en (540, 312)
const ROUTE = [[300, 2150], [430, 1900], [350, 1620], [520, 1330], [640, 1020], [585, 700]];
function cloudBand(w, h, o) {
  const r = rng(o.seed);
  return paper(w, h, (x) => {
    x.fillStyle = vgrad(x, 0, h, [[0, o.col], [.5, o.col2 || o.col], [1, o.col]]); x.beginPath();
    for (const yb of [o.pad ?? 170, h - (o.pad ?? 170)]) { let px = -80; while (px < w + 80) { const rad = 70 + r() * 110; x.moveTo(px + rad, yb); x.arc(px, yb + (r() - .5) * 60, rad, 0, TAU); px += rad * (.6 + r() * .6); } }
    x.rect(-80, o.pad ?? 170, w + 160, h - 2 * (o.pad ?? 170)); x.fill();
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = vgrad(x, h - 420, h, [[0, 'rgba(255,255,255,0)'], [1, o.rim || 'rgba(255,255,255,.14)']]); x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over';
  }, { shadow: 40, sa: .5, sdy: 18, ...o });
}
function initS3() {
  A.annDay = buildMountain({ w: MW, h: MH, seed: 5, ctrl: ANN, levels: 4, jag: .2, rocks: 46, rockFrom: 160, inner: ANN_IN, hazeFrom: .7, hazeA: .9, shadow: 40, sa: .35,
    pal: { snow: '#fbfdff', snow2: '#e3eef7', shade: '#86a9d0', shade2: '#6f93c2', rock: '#30456c', haze: '#bcd3e6', bounce: '#ffffff' } });
  A.d1 = ridgeLayer(1500, 900, { seed: 41, base: 420, amp: 330, scale: 500, col: '#a9c6de', col2: '#bcd4e6', haze: '#cfe0ec', snow: 'rgba(255,255,255,.8)', snowLine: .3, sa: .18 });
  A.d3 = ridgeLayer(1500, 700, { seed: 47, base: 300, amp: 220, scale: 340, col: '#1d2c4c', haze: '#2b3d62', sa: .5 });
  A.mon = [0, 1, 2].map(i => cloudBand(1700, 3000, { seed: 60 + i, col: ['#5b6883', '#414c66', '#262d44'][i], col2: ['#4c5873', '#343e56', '#1a2034'][i] }));
  A.route = wobble(ROUTE, 12, 7, 8);
}
function tent(x, px, py, s = 1, col = '#f08a3c') {
  x.save(); x.translate(px, py); x.scale(s, s);
  x.fillStyle = 'rgba(20,40,80,.3)'; x.beginPath(); x.ellipse(4, 3, 26, 5, 0, 0, TAU); x.fill();
  x.fillStyle = col; x.beginPath(); x.moveTo(-22, 0); x.lineTo(-2, -26); x.lineTo(22, 0); x.fill();
  x.fillStyle = 'rgba(120,40,10,.55)'; x.beginPath(); x.moveTo(-2, -26); x.lineTo(22, 0); x.lineTo(6, 0); x.fill();
  x.restore();
}
function s3(x, t) {
  const t0 = S[2], tR = wt('s3', 3) - .1, tM = wt('s3', 7), tQ = wt('s3', 13) - .1;
  const inn = E.outQuint(prog(t, t0 - .2, t0 + 1.1));
  const tilt = ease(t, tR - .2, tM + 1.2, E.inOut);
  const my = lerp(-1010, 150, tilt) + (1 - inn) * 520;
  x.fillStyle = vgrad(x, 0, H, [[0, '#2f5f95'], [.45, '#7fb0d6'], [1, '#dfeef6']]); x.fillRect(0, 0, W, H);
  put(x, A.d1, -260, 760 + my * .22);
  const sc0 = lerp(1.22, 1, inn);
  x.save(); x.translate(540, 960); x.scale(sc0, sc0); x.translate(-540, -960);
  put(x, A.annDay, MX, my);
  // ruta
  x.save(); x.translate(0, my);
  const pr = ease(t, tR, tM + .9, E.inOut);
  const head = drawOn(x, A.route, pr, { col: '#e23d2c', lw: 7, dash: [20, 13] });
  ROUTE.forEach((p, i) => {
    const f = A.route._len ? A.route._len.acc[i * 8] / A.route._len.l : 0, pp = E.outBack(prog(pr, f - .01, f + .05));
    if (pp <= 0) return;
    tent(x, p[0], p[1] + 6, 1.25 * pp, i === 0 ? '#f2b340' : '#f08a3c');
    const lab = i === 0 ? 'CAMPO BASE' : 'C ' + ['I', 'II', 'III', 'IV', 'V'][i - 1], wd = i === 0 ? 178 : 84, lx = p[0] + (i % 2 ? 44 : -44 - wd);
    x.globalAlpha = clamp(pp); x.fillStyle = '#12203f'; x.beginPath(); x.roundRect(lx, p[1] - 30, wd, 42, 6); x.fill(); x.globalAlpha = 1;
    text(x, lab, lx + wd / 2, p[1] + 2, { font: F.cond(30, 700), col: C.cream, ls: 3, alpha: clamp(pp) });
  });
  if (head && pr < 1) { x.fillStyle = '#e23d2c'; x.beginPath(); x.arc(head[0], head[1], 11, 0, TAU); x.fill(); }
  // tramo final, aún incógnita
  const pq = ease(t, tM + .7, tM + 1.5, E.out);
  if (pq > 0) { x.save(); x.setLineDash([3, 16]); x.strokeStyle = 'rgba(226,61,44,.8)'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.moveTo(585, 700); x.quadraticCurveTo(620, 520, lerp(585, 545, pq), lerp(700, 330, pq)); x.stroke(); x.restore(); }
  x.restore();
  x.restore();
  put(x, A.d3, -200, 1540 + my * 1.25 + 1010 * 1.25 + (1 - inn) * 300);
  snow(x, t, { n: 70, seed: 9, vx: -90, vy: 120, size: 4, alpha: .7 });
  // cota de la cumbre
  const ps = ease(t, tM + .5, tM + 1.1, E.out) * (1 - prog(t, tM + 2.4, tM + 2.9));
  if (ps > 0) {
    x.save(); x.globalAlpha = ps; x.strokeStyle = '#12203f'; x.lineWidth = 3; x.beginPath(); x.moveTo(556, my + 300); x.lineTo(700, my + 240); x.lineTo(700 + 250 * ps, my + 240); x.stroke(); x.restore();
    text(x, '8.091 m', 708, my + 226, { font: F.cond(64, 700), col: '#12203f', align: 'left', alpha: ps, ls: 2 });
  }
  // ---- el monzón baja como un techo
  const mc = ease(t, tM - .3, S[3] - .5, E.inOut), wipe = E.inOut(prog(t, S[3] - .65, S[3] + .75));
  if (mc > 0) {
    const yb = lerp(-3000, -2330, mc) + wipe * 5300;
    A.mon.forEach((L, i) => put(x, L, -300 + Math.sin(t * .5 + i * 2) * 40 - t * (8 + i * 6) % 60, yb + i * 190 * (1 - wipe * .4) - 100 + Math.sin(t * .8 + i) * 14));
    const pm = ease(t, tM - .05, tM + .5, E.out) * (1 - prog(t, S[3] - .7, S[3] - .3));
    if (pm > 0) {
      const ty = yb + 3000 - 330;
      reveal(x, 'MONZÓN', 540, ty, pm, { font: F.serif(150, 900, true), col: C.cream, size: 150, ls: 2 });
      text(x, 'PREVISTO: 5 DE JUNIO', 540, ty + 70, { font: F.cond(40, 600), ls: 10, alpha: pm * .9 });
    }
  }
  // ---- calendario: la cuenta atrás
  const pcal = ease(t, tQ - .15, tQ + .5, E.outBack) * (1 - prog(t, S[3] - .55, S[3] - .2));
  if (pcal > .001) {
    const days = ['29', '30', '31', '1', '2', '3', '4', '5'], bw = 104, gap = 12, x0 = 82, y0 = 1130 + (1 - pcal) * 160;
    x.save(); x.globalAlpha = clamp(pcal);
    text(x, 'MAYO', x0, y0 - 22, { font: F.cond(30, 700), col: '#12203f', align: 'left', ls: 8 }); text(x, 'JUNIO', x0 + 3 * (bw + gap), y0 - 22, { font: F.cond(30, 700), col: '#12203f', align: 'left', ls: 8 });
    days.forEach((d, i) => {
      const bx = x0 + i * (bw + gap), last = i === 7, pop = E.outBack(prog(t, tQ + i * .05, tQ + .4 + i * .05));
      x.save(); x.translate(bx + bw / 2, y0 + 60); x.scale(pop, pop);
      x.fillStyle = 'rgba(15,30,60,.3)'; x.beginPath(); x.roundRect(-bw / 2 + 5, -54, bw, 120, 10); x.fill();
      x.fillStyle = last ? '#1d2438' : '#f6eeda'; x.beginPath(); x.roundRect(-bw / 2, -60, bw, 120, 10); x.fill();
      text(x, d, 0, 22, { font: F.cond(70, 700), col: last ? C.cream : '#12203f' });
      if (last) text(x, 'MONZÓN', 0, 48, { font: F.cond(19, 700), col: C.gold, ls: 2 });
      const pc = prog(t, tQ + .55 + i * .16, tQ + .75 + i * .16);
      if (i < 5 && pc > 0) { x.strokeStyle = '#e23d2c'; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath(); x.moveTo(-34, 42); x.lineTo(-34 + 68 * pc, 42 - 86 * pc); x.stroke(); }
      if (i === 5) { const pu = prog(t, tQ + 1.45, tQ + 1.8); if (pu > 0) { x.strokeStyle = '#e23d2c'; x.lineWidth = 6; x.globalAlpha = clamp(pu * 2); x.beginPath(); x.roundRect(-bw / 2 - 7 - (1 - pu) * 20, -67 - (1 - pu) * 20, bw + 14 + (1 - pu) * 40, 134 + (1 - pu) * 40, 14); x.stroke(); } }
      x.restore();
    });
    x.restore();
  }
}

/* =====================================================================
   ESCENA 4 — 3 de junio: el ataque a la cumbre
   ===================================================================== */
const SLOPE = -.6;
const prof4 = (wx) => 2600 + SLOPE * wx + 70 * (fbm(wx / 260, 71, 3) - .5) + 16 * (vnoise(wx / 38, 73) - .5);
function slopeLayer(P) {
  const w = 3200, h = 3000;
  return paper(w, h, (x) => {
    x.beginPath(); x.moveTo(-20, h + 10); for (let px = -20; px <= w + 20; px += 10) x.lineTo(px, prof4(px)); x.lineTo(w + 20, h + 10); x.closePath();
    const g = x.createLinearGradient(0, 2600, 1500, 2600 + 2500); P.g.forEach((c, i) => g.addColorStop([0, .25, .6, 1][i], c));
    x.fillStyle = g; x.fill(); x.save(); x.clip();
    const r = rng(77);
    // sastrugi: cuñas de sombra paralelas a la ladera
    for (let i = 0; i < 150; i++) { const px = r() * w, d = 30 + Math.pow(r(), 1.6) * 900, py = prof4(px) + d, len = 90 + r() * 360, th = 6 + r() * 26 * (d / 500 + .3); x.fillStyle = `rgba(${P.wedge},${.1 + r() * .22})`; x.beginPath(); x.moveTo(px, py); x.lineTo(px + len, py + SLOPE * len + (r() - .5) * 20); x.lineTo(px + len * .7, py + SLOPE * len * .7 + th); x.closePath(); x.fill(); }
    for (let i = 0; i < 16; i++) { // rocas que asoman de la nieve, apoyadas en la pendiente
      const px = r() * w, d = 300 + r() * 900, py = prof4(px) + d, s = 50 + r() * 130, k = .35 + r() * .45, m = .3 + r() * .4;
      x.fillStyle = P.rock; x.beginPath(); x.moveTo(px, py); x.lineTo(px + s * m * .5, py + SLOPE * s * m * .5 - s * k * .6); x.lineTo(px + s * m, py + SLOPE * s * m - s * k); x.lineTo(px + s * (m + .25), py + SLOPE * s * (m + .25) - s * k * .5); x.lineTo(px + s, py + SLOPE * s); x.fill();
      x.fillStyle = P.rockLit; x.beginPath(); x.moveTo(px, py); x.lineTo(px + s * m * .5, py + SLOPE * s * m * .5 - s * k * .6); x.lineTo(px + s * m, py + SLOPE * s * m - s * k); x.lineTo(px + s * m * .9, py + SLOPE * s * m * .9); x.fill();
    }
    x.restore();
    x.globalCompositeOperation = 'source-atop'; x.strokeStyle = P.edge; x.lineWidth = 5; x.beginPath(); for (let px = -20; px <= w + 20; px += 10) x.lineTo(px, prof4(px) + 2); x.stroke(); x.globalCompositeOperation = 'source-over';
  }, { shadow: 36, sa: .5 });
}
function initS4() {
  A.slope = slopeLayer({ g: ['#eef2ff', '#b9c6ee', '#6e7fc4', '#3a4690'], wedge: '60,76,160', rock: '#232c66', rockLit: 'rgba(190,200,255,.25)', edge: 'rgba(255,255,255,.9)' });
  A.back4 = buildMountain({ w: 1700, h: 2200, seed: 23, levels: 4, jag: .22, rocks: 60, rockFrom: 160, inner: [{ y: .52, amp: .08 }, { y: .64, amp: .09 }, { y: .76, amp: .1 }], hazeFrom: .45, hazeA: 1, shadow: 40, sa: .4,
    ctrl: [[0, .62], [.14, .5], [.26, .43, 1], [.36, .46], [.5, .31], [.62, .2], [.73, .1, 1], [.82, .2], [.92, .3], [1, .36]],
    pal: { snow: '#dfe4ff', snow2: '#a8b3ea', shade: '#6a78c8', shade2: '#4d5ab0', rock: '#262f72', haze: '#5460b0', bounce: '#ffffff', edge: 'rgba(255,255,255,.75)' } });
  A.far4 = ridgeLayer(1700, 900, { seed: 52, base: 420, amp: 300, scale: 460, col: '#5a60ae', col2: '#6f6fb8', haze: '#9a86c4', snow: 'rgba(226,226,255,.45)', snowLine: .4, sa: .25 });
  A.sea4 = cloudLayer(2000, 700, { seed: 88, col: '#9d95d6', col2: '#7a78c2', base: .34, rMin: 60, rMax: 150, edge: 'rgba(255,214,200,.5)', sa: .25 });
}
const _d4 = [];
function dist4(t) { // distancia recorrida: se detienen durante el diálogo
  const n = Math.max(0, Math.round((t - S[3]) * 60)); if (_d4[n] != null) return _d4[n];
  const tStop = wt('s4', 21) - .5, tGo = we('s4', 33) + .15; let d = 0;
  for (let i = 0; i <= n; i++) { const tt = S[3] + i / 60; const v = 46 * (1 - ease(tt, tStop, tStop + .9, E.inOut) + ease(tt, tGo, tGo + .9, E.inOut)); d += v / 60; _d4[i] = d; }
  return _d4[n];
}
function s4(x, t) {
  const t0 = S[3], tQ1 = wt('s4', 21), tQ2 = wt('s4', 29), tQ3 = wt('s4', 31), tEndQ = we('s4', 33);
  const whip = E.in(prog(t, S[4] - 1.25, S[4])), warm = ease(t, t0 + 2, S[4] - .5, E.inOut);
  const d = dist4(t), camx = 900 + d, camy = 2600 + SLOPE * camx;
  const sx = (wx) => wx - camx + 520, sy = (wy) => wy - camy + 1130;
  const tO_ = wt('s4', 12), shk = t >= tO_ && t < tO_ + .35 ? (1 - prog(t, tO_, tO_ + .35)) * 16 : 0;
  const z4 = kf(t, [[t0, 1], [tQ1 - .7, 1.1], [tQ1 + .5, 1.3], [tEndQ + .2, 1.3], [S[4] - 1.1, 1.08]]);   // la cámara se acerca para el diálogo
  x.save(); x.translate((hash1(Math.floor(t * 30), 1) - .5) * shk, whip * 2700 + (hash1(Math.floor(t * 30), 2) - .5) * shk);
  x.translate(560, 1080); x.scale(z4, z4); x.translate(-560, -1080);
  x.fillStyle = vgrad(x, -2700, H, [[0, '#fff6e0'], [.45, '#f6c59a'], [.585, '#0c1640'], [.75, '#2c3c8c'], [.9, '#7672c0'], [1, mix('#b592c4', '#f0a58f', warm)]]); x.fillRect(-200, -2700, W + 400, H + 2700);
  stars(x, t, 120, 31, 900, 1 - warm * .8);
  // resplandor del amanecer tras la cumbre
  const gx = 830 - d * .1, gy = 560 + d * .14;
  const gl = x.createRadialGradient(gx, gy, 0, gx, gy, 900); gl.addColorStop(0, rgba('#ffd9a0', .2 + .5 * warm)); gl.addColorStop(.4, rgba('#f59a8a', .1 + .22 * warm)); gl.addColorStop(1, 'rgba(245,154,138,0)');
  x.fillStyle = gl; x.fillRect(0, -200, W, H + 200);
  put(x, A.far4, -360 + d * .05, 980 + d * .1);
  put(x, A.sea4, -500 - t * 6 % 400 + d * .06, 1250 + d * .12);
  put(x, A.back4, -330 - d * .22, 300 + d * .22 * .6 + 60);
  // punta de la cumbre encendida por el primer sol
  const sp = A.back4.peaks[1], spx = -330 - d * .22 + sp.x, spy = 360 + d * .132 + sp.y;
  x.save(); x.globalCompositeOperation = 'lighter'; const sg = x.createRadialGradient(spx, spy + 30, 0, spx, spy + 30, 220); sg.addColorStop(0, rgba('#ffcf8a', .55 * warm)); sg.addColorStop(1, 'rgba(255,207,138,0)'); x.fillStyle = sg; x.fillRect(spx - 240, spy - 220, 480, 480); x.restore();
  put(x, A.slope, sx(0), sy(0));
  // cordada
  const tq = Math.floor(t * 12) / 12, ph = dist4(tq) * .105, moving = 1 - ease(t, tQ1 - .5, tQ1 + .3) + ease(t, tEndQ + .1, tEndQ + .8);
  const hx = camx + 78, lx = camx - 92, hy = prof4(hx), ly = prof4(lx);
  x.save(); x.strokeStyle = 'rgba(243,233,210,.9)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(sx(lx) + 8, sy(ly) - 56); x.quadraticCurveTo(sx((hx + lx) / 2), sy((hy + ly) / 2) - 18 + (1 - moving) * 12, sx(hx) - 6, sy(hy) - 56); x.stroke(); x.restore();
  climber(x, sx(lx), sy(ly) + 3, 1.75, { phase: ph + 1.4, jacket: C.must, lean: lerp(.02, .2, moving), t });
  climber(x, sx(hx), sy(hy) + 3, 1.75, { phase: ph, jacket: C.red, lean: lerp(.02, .2, moving), t });
  // ventisca
  snow(x, t, { n: 170, seed: 21, vx: -560, vy: 150, size: 5, alpha: .8, streak: 5 });
  x.restore();

  // ---- capa gráfica
  const out = 1 - prog(t, S[4] - 1.2, S[4] - .7);
  const pt = ease(t, t0 + .5, t0 + 1.2, E.out) * (1 - prog(t, wt('s4', 12) - .3, wt('s4', 12) + .1)) * out;
  if (pt > 0) {
    reveal(x, '3 de junio', 540, 400, prog(t, t0 + .5, t0 + 1.2), { font: F.serif(124, 900, true), col: C.cream, size: 124, alpha: pt, shadow: 'rgba(8,12,40,.5)' });
    text(x, '1 9 5 0   ·   C A M P O  V', 540, 474, { font: F.cond(38, 600), alpha: pt * .9, ls: 4 });
  }
  // altímetro
  const dia = ease(t, tQ1 - .7, tQ1 - .2) * (1 - prog(t, tEndQ + .2, tEndQ + .7));
  const pa = ease(t, t0 + 1.3, t0 + 2, E.out) * (1 - dia) * out;
  if (pa > 0) {
    const alt = lerp(7300, 8040, prog(t, t0 + 1, S[4] - 1.4)), ax = 96, y0 = 1230, y1 = 620;
    x.save(); x.globalAlpha = pa; x.strokeStyle = C.cream; x.lineWidth = 3; x.beginPath(); x.moveTo(ax, y0); x.lineTo(ax, y1); x.stroke();
    for (let m = 7300; m <= 8100; m += 50) { const yy = lerp(y0, y1, (m - 7300) / 791), big = m % 200 === 100; x.lineWidth = big ? 3 : 2; x.globalAlpha = pa * (big ? 1 : .55); x.beginPath(); x.moveTo(ax, yy); x.lineTo(ax + (big ? 26 : 14), yy); x.stroke(); }
    x.globalAlpha = pa; const yy = lerp(y0, y1, (alt - 7300) / 791);
    x.fillStyle = C.red; x.beginPath(); x.moveTo(ax + 4, yy); x.lineTo(ax - 22, yy - 14); x.lineTo(ax - 22, yy + 14); x.fill();
    text(x, Math.round(alt).toLocaleString('de-DE') + ' m', ax + 44, yy + 20, { font: F.cond(62, 700), align: 'left', alpha: pa, shadow: 'rgba(8,12,40,.6)' });
    text(x, '8.091', ax + 40, y1 - 18, { font: F.cond(28, 600), align: 'left', alpha: pa * .6, ls: 2 });
    x.restore();
  }
  // sello "sin oxígeno"
  const tO = wt('s4', 12), po = prog(t, tO, tO + .35) * (1 - prog(t, tQ1 - .8, tQ1 - .4));
  if (po > 0) {
    const s0 = lerp(2.2, 1, E.outExpo(prog(t, tO, tO + .35)));
    x.save(); x.translate(700, 520); x.rotate(-.1); x.scale(s0, s0); x.globalAlpha = clamp(po * 2);
    x.strokeStyle = C.red; x.lineWidth = 7; x.beginPath(); x.roundRect(-240, -62, 480, 124, 12); x.stroke(); x.lineWidth = 2.5; x.beginPath(); x.roundRect(-228, -50, 456, 100, 7); x.stroke();
    text(x, 'SIN OXÍGENO', 0, 28, { font: F.cond(84, 700), col: C.red, ls: 6 }); x.restore();
  }
  // escarcha que cierra el encuadre ("los pies helándose")
  const fr = ease(t, wt('s4', 15), wt('s4', 18) + .6, E.inOut) * (1 - prog(t, S[4] - 1.2, S[4] - .4) * .5);
  if (fr > 0) { const g = x.createRadialGradient(540, 960, 520, 540, 960, 1150); g.addColorStop(0, 'rgba(214,230,255,0)'); g.addColorStop(1, `rgba(214,230,255,${.6 * fr})`); x.fillStyle = g; x.fillRect(0, 0, W, H); }
  // ---- el diálogo, palabra a palabra
  const qa = (1 - prog(t, tEndQ + .7, tEndQ + 1.2)) * out;
  if (t > tQ1 - .3 && qa > 0) {
    x.fillStyle = `rgba(8,12,40,${.38 * ease(t, tQ1 - .4, tQ1 + .2) * qa})`; x.fillRect(0, 0, W, H);
    const line = (words, i0, px, py, o) => { x.save(); x.font = o.font; let cx = px; if (o.align === 'right') cx = px - x.measureText(words.join(' ')).width; x.restore();
      words.forEach((w, k) => { const p = E.outQuint(prog(t, wt('s4', i0 + k) - .06, wt('s4', i0 + k) + .32)); x.save(); x.font = o.font; const wd = x.measureText(w + ' ').width; x.restore(); if (p > 0) text(x, w, cx, py + (1 - p) * 34, { ...o, align: 'left', alpha: clamp(p * 1.5) * qa, shadow: 'rgba(6,10,36,.7)', sb: 22 }); cx += wd; }); };
    const who = (s, px, py, col, tt, al) => text(x, s, px, py, { font: F.cond(32, 700), col, ls: 10, align: al, alpha: prog(t, tt - .2, tt + .2) * qa });
    who('LACHENAL', 88, 398, C.must, tQ1, 'left');
    line(['«Si', 'me', 'doy', 'la', 'vuelta,'], 21, 84, 486, { font: F.serif(78, 600, true), col: C.cream });
    line(['¿qué', 'harás', 'tú?»'], 26, 84, 580, { font: F.serif(78, 600, true), col: C.cream });
    who('HERZOG', 992, 690, C.red, tQ2, 'right');
    line(['«Seguiré', 'solo.»'], 29, 996, 786, { font: F.serif(96, 900, true), col: '#ff7a5c', align: 'right' });
    who('LACHENAL', 88, 890, C.must, tQ3, 'left');
    line(['«Entonces,', 'te', 'sigo.»'], 31, 84, 978, { font: F.serif(84, 600, true), col: C.gold });
  }
  if (whip > 0) { x.fillStyle = `rgba(255,246,224,${E.in(prog(t, S[4] - .5, S[4]))})`; x.fillRect(0, 0, W, H); }
}
