'use strict';
/* =========================================================================
   Escenas 5–7: la cumbre, el precio y los otros Annapurnas.
   ========================================================================= */

/* =====================================================================
   ESCENA 5 — 14:00 h: ya no queda nada más arriba
   ===================================================================== */
const SUMMIT = [540, 1215];
function initS5() {
  A.sum = buildMountain({ w: 1500, h: 1400, seed: 9, levels: 4, jag: .18, rocks: 24, rockFrom: 260, inner: [{ y: .62, amp: .1 }, { y: .8, amp: .1 }], rockBias: .5, hazeFrom: .45, hazeA: 1, ribs: .7, shadow: 44, sa: .45,
    ctrl: [[0, .78], [.12, .64], [.25, .5], [.38, .32], [.5, .1, 1], [.6, .29], [.72, .46], [.86, .6], [1, .76]],
    pal: { snow: '#fff7e8', snow2: '#ffd9c2', shade: '#e48aa2', shade2: '#a2559e', rock: '#5c3276', haze: '#f08aa0', bounce: '#ffffff', edge: 'rgba(255,255,255,.95)' } });
  A.far5 = ridgeLayer(1800, 800, { seed: 57, base: 400, amp: 320, scale: 520, col: '#b76aa2', col2: '#d98aa8', haze: '#f5ab9f', snow: 'rgba(255,232,214,.7)', snowLine: .35, sa: .22 });
  A.c5 = [
    cloudLayer(2600, 760, { seed: 91, col: '#ffdcb8', col2: '#f9aa9f', base: .36, rMin: 70, rMax: 170, edge: 'rgba(255,250,226,.85)', sa: .22, sdy: -14 }),
    cloudLayer(2600, 760, { seed: 92, col: '#f79aa8', col2: '#cf6a9f', base: .36, rMin: 70, rMax: 160, edge: 'rgba(255,214,190,.6)', sa: .3, sdy: -14 }),
    cloudLayer(2600, 860, { seed: 93, col: '#b05a9e', col2: '#75408e', base: .32, rMin: 80, rMax: 180, edge: 'rgba(250,160,170,.45)', sa: .35, sdy: -14 }),
    cloudLayer(2600, 900, { seed: 94, col: '#5e3180', col2: '#35205a', base: .3, rMin: 90, rMax: 200, edge: 'rgba(190,110,170,.4)', sa: .4, sdy: -14 }),
  ];
}
function s5(x, t) {
  const t0 = S[4], u = t - t0;
  const zoom = lerp(1.6, 1, E.outQuint(prog(u, 0, 3.4))) * lerp(1, .8, E.inOut(prog(u, 3.2, 12.4)));   // llegada + grúa hacia atrás: el mundo queda abajo
  const rise = E.outQuint(prog(u, 0, 3));
  x.fillStyle = vgrad(x, 0, H, [[0, '#24174e'], [.2, '#5a2d84'], [.4, '#c0508f'], [.53, '#f46d7c'], [.66, '#ff9e63'], [.8, '#ffd27a'], [1, '#ffe9b8']]); x.fillRect(0, 0, W, H);
  stars(x, t, 60, 44, 520, .6);
  x.save(); x.translate(540, 1200); x.scale(zoom, zoom); x.translate(-540, -1200);
  const sunY = lerp(1420, 1085, rise);
  rays(x, 540, sunY, 215, 2100, 14, t * .045, '#fff3cf', .13 * rise);
  rays(x, 540, sunY, 215, 2100, 14, -t * .03 + .2, '#ffe0a0', .08 * rise);
  orb(x, 540, sunY, 245, '#fff3cc', { rings: 5, ha: .13, step: .3, halo: '#ffe9b0' });
  put(x, A.far5, -380 + u * 4, 1150);
  put(x, A.c5[0], -700 + u * 16, 1180);
  put(x, A.sum, SUMMIT[0] - 750, SUMMIT[1] - 140);
  // cordada en la cima
  const sy0 = SUMMIT[1] - 140;
  const lx = 750 - 62, ly = A.sum.silY(lx) + sy0;
  const arm = E.outBack(prog(u, .9, 1.7));
  climber(x, SUMMIT[0] - 62, ly + 2, 1.5, { phase: 0, jacket: C.must, lean: 0, t, dark: '#2a1640', dark2: '#1e1034' });
  climber(x, SUMMIT[0] + 2, SUMMIT[1] + 3, 1.5, { phase: 0, jacket: C.red, lean: -.02, arm, flag: clamp(arm), t, dark: '#2a1640', dark2: '#1e1034' });
  put(x, A.c5[1], -900 - u * 22, 1520);
  put(x, A.c5[2], -760 + u * 30, 1650);
  put(x, A.c5[3], -800 - u * 40, 1790);
  x.restore();
  // destellos
  snow(x, t, { n: 70, seed: 51, vx: 14, vy: -46, size: 7, alpha: .75, col: '#fff6d8' });

  // ---- tipografía
  reveal(x, 'ANNAPURNA I', 540, 312, prog(u, .45, 1.1), { font: F.cond(48, 600), ls: 20, size: 48, alpha: .95 });
  const n = Math.round(lerp(7980, 8091, E.outQuint(prog(u, .05, 1.35))));
  const slam = lerp(1.7, 1, E.outExpo(prog(u, .05, .7))), land = Math.max(0, 1 - Math.abs((u - 1.38) / .22));
  x.save(); x.translate(540, 536); x.scale(slam * (1 + land * .05), slam * (1 + land * .05));
  x.font = F.serif(236, 900); const wn = x.measureText('8.091').width, wm = 150;
  text(x, n.toLocaleString('de-DE'), -(wn + wm) / 2 + wn / 2, 0, { font: F.serif(236, 900), col: '#fff8e6', alpha: clamp(u * 4), shadow: 'rgba(60,16,80,.45)', sb: 40, sy: 12, ls: -3 });
  text(x, 'm', (wn + wm) / 2 - 62, 0, { font: F.serif(120, 600, true), col: C.gold, alpha: clamp(u * 4), shadow: 'rgba(60,16,80,.45)' });
  x.restore();
  const tD = wt('s5', 0) - .2, pl = ease(t, tD, tD + .7, E.out);
  if (pl > 0) { x.fillStyle = rgba(C.cream, .8); x.fillRect(540 - 250 * pl, 580, 500 * pl, 3); }
  reveal(x, '3 DE JUNIO DE 1950  ·  14:00 H', 540, 638, prog(t, tD + .1, tD + .8), { font: F.cond(44, 600), ls: 7, size: 44 });
  // 1 / 14: la promesa del primer plano, cumplida
  const tF = wt('s5', 19) - .1, tOn = wt('s5', 25);
  for (let i = 0; i < 14; i++) {
    const pp = E.outBack(prog(t, tF + i * .04, tF + .35 + i * .04)); if (pp <= 0) continue;
    const cx = 540 + (i - 6.5) * 46, cy = 712, on = i === 9 ? E.outBack(prog(t, tOn, tOn + .45)) : 0;
    x.strokeStyle = rgba(C.cream, .85); x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, 10 * pp, 0, TAU); x.stroke();
    if (on > 0) { x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx, cy, 15 * on, 0, TAU); x.fill(); const b = prog(t, tOn, tOn + .6); x.strokeStyle = rgba('#ffffff', 1 - b); x.lineWidth = 4; x.beginPath(); x.arc(cx, cy, 15 + b * 44, 0, TAU); x.stroke(); }
  }
  reveal(x, 'EL PRIMER OCHOMIL DE LA HISTORIA', 540, 784, prog(t, tOn + .1, tOn + .8), { font: F.cond(42, 700), ls: 7, size: 42, col: '#fff8e6', shadow: 'rgba(110,30,90,.7)', sb: 16, sy: 2 });
  // fogonazo de llegada
  const fl = 1 - E.out(prog(u, 0, .9)); if (fl > 0) { x.fillStyle = `rgba(255,246,224,${fl})`; x.fillRect(0, 0, W, H); }
}

/* =====================================================================
   ESCENA 6 — el precio
   ===================================================================== */
function initS6() {
  A.slopeSt = slopeLayer({ g: ['#e3e8f0', '#a5aec0', '#5d667c', '#2b3144'], wedge: '40,48,70', rock: '#1a1f2e', rockLit: 'rgba(200,210,230,.2)', edge: 'rgba(255,255,255,.8)' });
  // paredes de la grieta: capas de hielo, las cercanas más oscuras
  const wall = (side, i) => paper(700, 2100, (x) => {
    const r = rng(300 + i * 7 + side * 50), base = [150, 270, 370, 450][i];
    x.beginPath(); x.moveTo(0, 0);
    for (let y = -20; y <= 2120; y += 46) x.lineTo(base + (fbm(y / 240, 310 + i * 5 + side * 3, 3) - .5) * 190 + (r() - .5) * 26 + (y / 2100) * 46, y);
    x.lineTo(0, 2120); x.closePath();
    const cols = [['#050b1a', '#03060f'], ['#0a1c36', '#06101f'], ['#123660', '#0a1f3a'], ['#2a5f95', '#12365e']][i];
    x.fillStyle = vgrad(x, 0, 2100, [[0, cols[0]], [1, cols[1]]]); x.fill();
    x.save(); x.clip(); x.strokeStyle = `rgba(150,200,240,${.05 + i * .03})`; x.lineWidth = 3;
    for (let k = 0; k < 14; k++) { const y = r() * 2100; x.beginPath(); x.moveTo(0, y); x.lineTo(700, y + 120 + r() * 200); x.stroke(); }
    x.restore();
    x.globalCompositeOperation = 'source-atop'; x.strokeStyle = ['rgba(90,150,210,.25)', 'rgba(110,170,225,.35)', 'rgba(140,195,240,.5)', 'rgba(190,225,255,.7)'][i]; x.lineWidth = 5; x.beginPath();
    const r2 = rng(300 + i * 7 + side * 50);
    for (let y = -20; y <= 2120; y += 46) x.lineTo(base + (fbm(y / 240, 310 + i * 5 + side * 3, 3) - .5) * 190 + (r2() - .5) * 26 + (y / 2100) * 46 - 2, y);
    x.stroke(); x.globalCompositeOperation = 'source-over';
  }, { shadow: 30, sa: .7, sdx: 12, sdy: 0, shadowColor: '#01030a' });
  A.cvL = [0, 1, 2, 3].map(i => wall(0, i)); A.cvR = [0, 1, 2, 3].map(i => wall(1, i));
  // alud: tres hojas blancas con el borde inferior dentado
  A.av = [0, 1, 2].map(i => paper(1400, 2900, (x) => {
    const r = rng(400 + i); x.beginPath(); x.moveTo(0, 0); x.lineTo(1400, 0); x.lineTo(1400, 2600);
    for (let px = 1400; px >= 0; px -= 40 + r() * 70) x.lineTo(px, 2600 + r() * 260 + Math.sin(px / 170 + i) * 60);
    x.lineTo(0, 2600); x.closePath();
    x.fillStyle = vgrad(x, 0, 2900, [[0, ['#aebbd2', '#d3dcea', '#f4f1ea'][i]], [1, ['#c6d1e3', '#e6ecf4', '#fbf9f4'][i]]]); x.fill();
  }, { shadow: 44, sa: .55, sdy: 26, shadowColor: '#1a2238' }));
}
function glove(x, px, py, rot, s = 1) {
  x.save(); x.translate(px, py); x.rotate(rot); x.scale(s, s);
  x.fillStyle = '#2a1c18'; x.beginPath(); x.roundRect(-13, -18, 26, 34, 11); x.fill(); x.beginPath(); x.ellipse(15, -2, 7, 11, .5, 0, TAU); x.fill();
  x.fillStyle = '#c0452f'; x.fillRect(-13, 10, 26, 8); x.restore();
}
function s6(x, t) {
  const t0 = S[5], tPr = wt('s6', 5), tG = wt('s6', 7), tN = wt('s6', 14) - .25, tA = wt('s6', 20) - .2, tH = wt('s6', 22) - .25;
  const fall = E.inOut(prog(t, tN - .25, tN + .3));
  // ---------- 6a/6b: tormenta en la ladera, los guantes se escapan
  if (t < tN + .3) {
    x.save(); x.translate(0, -fall * H);
    const u = t - t0, stop = ease(t, tG - .9, tG - .2), d = 46 * (u - stop * Math.max(0, t - (tG - .55)));
    const camx = 1900 - d, camy = 2600 + SLOPE * camx, sx = (wx) => wx - camx + 560, sy = (wy) => wy - camy + 1060;
    const sh = (hash1(Math.floor(t * 30), 5) - .5) * 10 * (1 - prog(u, 0, .5));
    x.translate(sh, -sh);
    x.fillStyle = vgrad(x, 0, H, [[0, '#12151f'], [.5, '#2f3646'], [1, '#6a7384']]); x.fillRect(-20, -20, W + 40, H + 40);
    // jirones de niebla
    for (let i = 0; i < 6; i++) { const yy = 300 + i * 250, off = ((t * (120 + i * 40) + i * 400) % 2400) - 700; x.save(); x.translate(W - off, yy); x.scale(1, .22); const g = x.createRadialGradient(0, 0, 0, 0, 0, 620); g.addColorStop(0, `rgba(160,170,190,${.16 + (i % 3) * .05})`); g.addColorStop(1, 'rgba(160,170,190,0)'); x.fillStyle = g; x.fillRect(-620, -620, 1240, 1240); x.restore(); }
    put(x, A.slopeSt, sx(0), sy(0));
    const tq = Math.floor(t * 12) / 12, ph = (46 * (tq - t0)) * .105 * (1 - stop);
    const hx = camx - 20, lx2 = camx + 190;
    climber(x, sx(lx2), sy(prof4(lx2)) + 3, 1.7, { phase: ph + 1.2, jacket: '#b98a3a', lean: -.1, dir: -1, t, dark: '#12141f' });
    // Herzog, ya sin guantes, alarga el brazo
    climber(x, sx(hx), sy(prof4(hx)) + 3, 1.7, { phase: ph, jacket: '#b8452f', lean: lerp(-.1, -.28, stop), dir: -1, t, axe: stop < .5, dark: '#12141f' });
    // los guantes ruedan ladera abajo
    const g = prog(t, tG - .35, tN + .2);
    if (g > 0) for (let k = 0; k < 2; k++) {
      const gg = clamp(g * 1.15 - k * .12); if (gg <= 0) continue;
      const wx = hx - 60 - Math.pow(gg, 1.35) * 640, hop = Math.abs(Math.sin(gg * 13 + k)) * 60 * (1 - gg * .5);
      x.globalAlpha = 1 - prog(gg, .8, 1); glove(x, sx(wx), sy(prof4(wx)) - 22 - hop, -gg * 14 - k * 2, 2.5); x.globalAlpha = 1;
    }
    const fog = x.createLinearGradient(0, 0, 520, 0); fog.addColorStop(0, 'rgba(120,130,150,.8)'); fog.addColorStop(.6, 'rgba(120,130,150,0)'); x.fillStyle = fog; x.fillRect(-20, 0, 560, H);
    snow(x, t, { n: 260, seed: 61, vx: 760, vy: 260, size: 5.5, alpha: .8, streak: 7 });
    snow(x, t, { n: 60, seed: 62, vx: 1100, vy: 300, size: 11, alpha: .35, streak: 9 });
    x.restore();
    // título
    const pp = prog(t, tPr - .25, tPr + .35) * (1 - prog(t, tG - .2, tG + .2));
    if (pp > 0) { reveal(x, 'el precio', 540, 520 - fall * H, prog(t, tPr - .25, tPr + .35), { font: F.serif(190, 900, true), col: '#ff6a4e', size: 190, alpha: clamp(pp * 2), shadow: 'rgba(0,0,0,.5)' }); }
    // corte seco desde la gloria: un instante de negro
    const cut = 1 - prog(u, 0, .22); if (cut > 0) { x.fillStyle = `rgba(4,5,10,${cut})`; x.fillRect(0, 0, W, H); }
  }
  // ---------- 6c: la noche en la grieta
  if (t >= tN - .25 && t < tA + 1.3) {
    const u = t - tN, push = 1 + .07 * prog(u, 0, 3.2);
    x.save(); x.translate(0, (1 - fall) * H);
    x.fillStyle = '#02040b'; x.fillRect(0, 0, W, H);
    x.translate(540, 1000); x.scale(push, push); x.translate(-540, -1000);
    // el fondo: rendija de cielo de tormenta
    x.fillStyle = vgrad(x, 0, H, [[0, '#8fa6c4'], [.25, '#3d5f8c'], [.6, '#143056'], [1, '#07142a']]); x.fillRect(330, -60, 420, H + 120);
    x.save(); x.beginPath(); x.rect(300, -60, 480, H + 120); x.clip(); snow(x, t, { n: 150, seed: 71, vx: -40, vy: 330, size: 5, alpha: .9 }); x.restore();
    // haz de luz fría
    x.fillStyle = 'rgba(180,210,245,.07)'; x.beginPath(); x.moveTo(470, -60); x.lineTo(620, -60); x.lineTo(820, 1500); x.lineTo(380, 1500); x.fill();
    for (let i = 3; i >= 0; i--) {
      const par = (i - 1.5) * 9 * prog(u, 0, 3.2);
      put(x, A.cvL[i], -40 - par, -90);
      x.save(); x.translate(W + 40 + par, -90); x.scale(-1, 1); put(x, A.cvR[i], 0, 0); x.restore();
      if (i === 2) { // repisa de nieve y los cuatro acurrucados
        x.save(); x.translate(540, 1210); x.scale(1.75, 1.75); x.translate(-545, -1290);
        x.fillStyle = '#16365c'; x.beginPath(); x.moveTo(200, 1335); x.quadraticCurveTo(400, 1262, 560, 1280); x.quadraticCurveTo(740, 1296, 900, 1350); x.lineTo(900, 2000); x.lineTo(200, 2000); x.fill();
        x.fillStyle = '#a9c8e6'; x.beginPath(); x.moveTo(200, 1335); x.quadraticCurveTo(400, 1262, 560, 1280); x.quadraticCurveTo(740, 1296, 900, 1350); x.quadraticCurveTo(720, 1318, 560, 1304); x.quadraticCurveTo(400, 1290, 200, 1352); x.fill();
        [[430, '#b8452f'], [505, '#c9973a'], [590, '#2f7f8a'], [662, '#4a5fb0']].forEach(([px, col], k) => {
          const br = Math.sin(t * 1.6 + k * 1.3) * 1.5, py = 1290 + (k % 2) * 6;
          x.fillStyle = col; x.beginPath(); x.moveTo(px - 30, py); x.quadraticCurveTo(px - 30, py - 56 - br, px - 4, py - 58 - br); x.quadraticCurveTo(px + 30, py - 54 - br, px + 32, py); x.fill();
          x.beginPath(); x.arc(px + (k % 2 ? -6 : 8), py - 62 - br, 14, 0, TAU); x.fill();
          x.fillStyle = 'rgba(2,6,18,.42)'; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 6, py - 50, px + 32, py); x.fill();
        });
        x.restore();
      }
    }
    x.restore();
  }
  // ---------- 6d: el alud
  if (t >= tA - .1) {
    const u = t - tA, sh = (1 - prog(u, 0, 1.1)) * 16;
    x.save(); x.translate((hash1(Math.floor(t * 30), 8) - .5) * sh, (hash1(Math.floor(t * 30), 9) - .5) * sh);
    A.av.forEach((L, i) => { const p = E.in(prog(u, i * .16, .75 + i * .2)); put(x, L, -160 + (i - 1) * 40, -2950 + p * 2650); });
    x.restore();
    if (u < 1.4) snow(x, t, { n: 200, seed: 81, vx: -200, vy: 1500, size: 9, alpha: .9 * prog(u, 0, .3) * (1 - prog(u, .9, 1.4)), col: '#ffffff', streak: 3 });
  }
  // ---------- 6e: el balance, sobre papel blanco
  if (t >= tH - .1) {
    const ink = '#1a2140', red = '#d1402e', a = prog(t, tH - .1, tH + .3), tDed = wt('s6', 25) - .15, tPies = wt('s6', 30) - .1;
    x.fillStyle = `rgba(244,241,234,${a})`; x.fillRect(0, 0, W, H);
    reveal(x, 'MAURICE HERZOG', 540, 520, prog(t, tH, tH + .5), { font: F.cond(52, 700), col: ink, ls: 16, size: 52 });
    x.fillStyle = rgba(ink, a * .8); x.fillRect(540 - 60, 552, 120, 4);
    const row = (label, y, bh, tLose, span) => {
      text(x, label, 540, y - 34, { font: F.cond(32, 600), col: ink, ls: 14, alpha: a * .75 });
      for (let i = 0; i < 10; i++) {
        const cx = 540 + (i - 4.5) * 78 + (i > 4 ? 26 : -26), app = E.outBack(prog(t, tH + .15 + i * .035, tH + .5 + i * .035)), lost = E.out(prog(t, tLose + i * span, tLose + i * span + .3));
        if (app <= 0) continue;
        const hgt = bh * (i % 5 === 0 || i % 5 === 4 ? .78 : i % 5 === 2 ? 1 : .92) * app * (i > 4 ? 1 : 1), yy = y + bh - hgt + lost * 16;
        x.fillStyle = rgba(ink, (1 - lost)); x.beginPath(); x.roundRect(cx - 24, yy, 48, hgt, 24); x.fill();
        if (lost > 0) { x.save(); x.strokeStyle = rgba(red, lost); x.lineWidth = 3.5; x.setLineDash([9, 8]); x.beginPath(); x.roundRect(cx - 24, yy, 48, hgt, 24); x.stroke(); x.restore(); }
      }
    };
    row('MANOS', 690, 190, tDed, .1); row('PIES', 1010, 96, tPies, .06);
    const pf = prog(t, tPies + .9, tPies + 1.5);
    text(x, 'Lachenal perdió los dedos de los pies.', 540, 1240, { font: F.serif(42, 400, true), col: ink, alpha: pf * .9 });
  }
}

/* =====================================================================
   ESCENA 7 — otros Annapurnas
   ===================================================================== */
const FLAGC = ['#3c6fd1', '#f6f1e4', '#d8453a', '#3f9b6a', '#f1c545'];
function initS7() {
  A.annDawn = buildMountain({ w: MW, h: MH, seed: 5, ctrl: ANN, levels: 4, jag: .2, rocks: 46, rockFrom: 160, inner: ANN_IN, hazeFrom: .22, hazeA: 1, shadow: 40, sa: .3,
    pal: { snow: '#fff0de', snow2: '#fbcdb8', shade: '#b39bd8', shade2: '#8f7cc6', rock: '#54468c', haze: '#f2b3a4', bounce: '#ffffff', edge: 'rgba(255,255,255,.9)' } });
  A.w1 = ridgeLayer(1700, 900, { seed: 111, base: 380, amp: 250, scale: 520, col: '#a584be', col2: '#c394b8', haze: '#eeb0a6', snow: 'rgba(255,236,224,.5)', snowLine: .5, sa: .22 });
  A.w2 = ridgeLayer(1700, 900, { seed: 117, base: 360, amp: 250, scale: 440, col: '#6f5aa4', col2: '#8468ac', haze: '#b98bb4', sa: .3 });
  A.w3 = ridgeLayer(1700, 900, { seed: 123, base: 340, amp: 240, scale: 380, col: '#41357c', col2: '#4c3d86', haze: '#6f5aa0', sa: .4 });
  A.w4 = ridgeLayer(1700, 900, { seed: 131, base: 330, amp: 230, scale: 330, col: '#1d1a4c', col2: '#221f56', haze: '#2c2864', sa: .5 });
}
function flags(x, t, x0, y0, x1, y1, sag, n, s, alpha) {
  const pt = (u) => [lerp(x0, x1, u), lerp(y0, y1, u) + Math.sin(u * Math.PI) * (sag + Math.sin(t * .9) * 8)];
  x.save(); x.globalAlpha = alpha; x.strokeStyle = 'rgba(30,24,60,.8)'; x.lineWidth = 2.5 * s; x.beginPath(); for (let i = 0; i <= 40; i++) { const p = pt(i / 40); i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); } x.stroke();
  for (let i = 0; i < n; i++) {
    const u = (i + .6) / (n + .2), p = pt(u), p2 = pt(u + .01), ang = Math.atan2(p2[1] - p[1], p2[0] - p[0]);
    const sw = Math.sin(t * 2.3 + i * .8) * .16 + Math.sin(t * 5.1 + i * 1.7) * .05 + .12, fw = 56 * s, fh = 70 * s;
    x.save(); x.translate(p[0], p[1]); x.rotate(ang);
    x.fillStyle = 'rgba(20,16,50,.25)'; x.beginPath(); x.moveTo(-fw / 2 + 5, 4); x.lineTo(fw / 2 + 5, 4); x.lineTo(fw / 2 + 5 + sw * fh, fh + 5); x.lineTo(-fw / 2 + 5 + sw * fh * 1.15, fh + 3); x.fill();
    x.fillStyle = FLAGC[i % 5]; x.beginPath(); x.moveTo(-fw / 2, 0); x.lineTo(fw / 2, 0); x.lineTo(fw / 2 + sw * fh, fh + Math.sin(t * 6 + i) * 3 * s); x.lineTo(-fw / 2 + sw * fh * 1.15, fh - Math.sin(t * 6 + i) * 2 * s); x.fill();
    x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(-fw / 2, 0, fw, 5 * s);
    x.restore();
  }
  x.restore();
}
function s7(x, t) {
  const t0 = S[6], u = t - t0, D = TL.dur;
  const pull = E.inOut(prog(u, 0, 13)), zoom = lerp(1.22, 1, pull), dr = u * 5;
  x.fillStyle = vgrad(x, 0, H, [[0, '#1b2560'], [.22, '#4a4a9c'], [.4, '#9a78b6'], [.52, '#e79c96'], [.62, '#fbc9a0'], [.75, '#fde6c2'], [1, '#fde9c8']]); x.fillRect(0, 0, W, H);
  stars(x, t, 70, 91, 620, .5 * (1 - prog(u, 2, 9)));
  x.save(); x.translate(540, 1150); x.scale(zoom, zoom); x.translate(-540, -1150);
  const sunY = lerp(1190, 1010, E.out(prog(u, 0, 14)));
  rays(x, 830, sunY, 90, 1500, 12, t * .03, '#fff1cf', .1);
  orb(x, 830, sunY, 84, '#fff4d4', { rings: 5, ha: .12, step: .5, halo: '#ffe2b0' });
  put(x, A.annDawn, 540 - 700 * .85 - 0, 760, { scale: .85 });
  x.fillStyle = vgrad(x, 1150, 1500, [[0, 'rgba(244,180,165,0)'], [1, 'rgba(244,180,165,.85)']]); x.fillRect(-200, 1150, W + 400, 400);
  put(x, A.w1, -330 + dr * .3, 1120 + pull * 20);
  put(x, A.w2, -260 - dr * .5, 1260 + pull * 34);
  put(x, A.w3, -380 + dr * .8, 1420 + pull * 52);
  // dos figuras diminutas que siguen subiendo
  const tW = wt('s7', 18) - .4, pw = prog(t, tW, tW + .8);
  if (pw > 0) {
    const lxw = -380 + dr * .8, lyw = 1420 + pull * 52, tq = Math.floor(t * 12) / 12;
    [[0, C.red], [-64, C.must]].forEach(([off, col], k) => { const wx = 870 + off + (t - tW) * 13, wy = A.w3.yAt(wx); climber(x, lxw + wx, lyw + wy + 2, .9 * pw, { phase: (tq - tW) * 4.6 + k * 1.5, jacket: col, lean: .12, t, dark: '#15123a' }); });
  }
  put(x, A.w4, -240 - dr * 1.2, 1610 + pull * 80);
  x.restore();
  // banderas de oración
  flags(x, t, -80, 330 - pull * 60, 1160, 150 - pull * 60, 190, 13, .8, .55);
  flags(x, t + 3, -60, 120 - pull * 90, 1150, 300 - pull * 90, 210, 11, 1.12, 1);
  snow(x, t, { n: 40, seed: 95, vx: 20, vy: -22, size: 5, alpha: .5, col: '#fff3dc' });

  // ---- el libro
  const tB = wt('s7', 3) - .1, tAsi = we('s7', 8), pb = E.outBack(prog(t, tB, tB + .6)) * (1 - E.in(prog(t, tAsi - .05, tAsi + .4)));
  if (pb > 0) {
    x.save(); x.translate(540, 770 + (1 - pb) * 120 - E.in(prog(t, tAsi - .05, tAsi + .4)) * 200); x.rotate(-.06 + (1 - pb) * .2); x.scale(pb, pb); x.globalAlpha = clamp(pb * 1.5);
    x.fillStyle = 'rgba(20,16,60,.35)'; x.beginPath(); x.roundRect(-150 + 16, -210 + 20, 320, 430, 8); x.fill();
    x.fillStyle = '#e9e2d0'; x.beginPath(); x.roundRect(-150 + 8, -206, 316, 424, 6); x.fill();
    x.fillStyle = '#f6eeda'; x.beginPath(); x.roundRect(-160, -215, 320, 430, 8); x.fill();
    x.fillStyle = '#24306e'; x.fillRect(-160, -215, 26, 430);
    x.fillStyle = '#24306e'; x.beginPath(); x.moveTo(-100, 70); x.lineTo(-30, -30); x.lineTo(5, 10); x.lineTo(50, -60); x.lineTo(125, 70); x.fill();
    x.fillStyle = '#f6eeda'; x.beginPath(); x.moveTo(50, -60); x.lineTo(30, -28); x.lineTo(48, -34); x.lineTo(58, -18); x.lineTo(72, -26); x.fill();
    x.fillStyle = C.red; x.beginPath(); x.arc(-52, -92, 20, 0, TAU); x.fill();
    text(x, 'ANNAPURNA', 12, -140, { font: F.serif(40, 900), col: '#24306e', ls: 1 });
    text(x, 'premier 8.000', 12, 120, { font: F.serif(34, 400, true), col: '#24306e' });
    text(x, 'MAURICE HERZOG', 12, 176, { font: F.cond(24, 700), col: C.red, ls: 6 });
    x.restore();
  }
  // ---- la cita
  const qOut = 1 - prog(t, wt('s7', 18) + .5, wt('s7', 18) + 1.3), qIn = prog(t, wt('s7', 9) - .5, wt('s7', 9));
  if (qIn > 0 && qOut > 0) {
    x.fillStyle = vgrad(x, 0, 1150, [[0, `rgba(18,22,76,${.5 * qIn * qOut})`], [.72, `rgba(18,22,76,${.34 * qIn * qOut})`], [1, 'rgba(18,22,76,0)']]); x.fillRect(0, 0, W, 1150);
    const line = (words, i0, py, o) => { x.save(); x.font = o.font; let cx = 540 - x.measureText(words.join(' ')).width / 2; x.restore();
      words.forEach((w, k) => { const p = E.outQuint(prog(t, wt('s7', i0 + k) - .08, wt('s7', i0 + k) + .4)); x.save(); x.font = o.font; const wd = x.measureText(w + ' ').width; x.restore(); if (p > 0) text(x, w, cx, py + (1 - p) * 40, { ...o, align: 'left', alpha: clamp(p * 1.4) * qOut, shadow: 'rgba(20,16,70,.6)', sb: 26 }); cx += wd; }); };
    line(['«Hay', 'otros'], 9, 560, { font: F.serif(88, 400, true), col: C.cream });
    line(['Annapurnas'], 11, 690, { font: F.serif(138, 900, true), col: C.gold });
    line(['en', 'la', 'vida'], 12, 794, { font: F.serif(88, 400, true), col: C.cream });
    line(['de', 'los', 'hombres.»'], 15, 892, { font: F.serif(88, 400, true), col: C.cream });
    const pa = prog(t, we('s7', 17) + .1, we('s7', 17) + .7);
    text(x, '—  MAURICE HERZOG, 1951', 540, 972, { font: F.cond(34, 600), ls: 9, alpha: pa * qOut * .9 });
  }
  // ---- cierre
  const tE = we('s7', 30) + .25, pe = prog(t, tE, tE + .5);
  if (pe > 0) {
    x.fillStyle = vgrad(x, 0, 1150, [[0, `rgba(14,16,60,${.6 * pe})`], [.75, `rgba(14,16,60,${.42 * pe})`], [1, 'rgba(14,16,60,0)']]); x.fillRect(0, 0, W, 1150);
    stagger(x, 'ANNAPURNA I', 540, 600, t - tE, { font: F.serif(128, 900), col: C.cream, gap: .035, dur: .55, rise: 70, ls: 1, shadow: 'rgba(16,12,60,.5)' });
    const pr = ease(t, tE + .4, tE + 1, E.out); x.fillStyle = C.gold; x.fillRect(540 - 180 * pr, 640, 360 * pr, 4);
    reveal(x, '8.091 m', 540, 740, prog(t, tE + .45, tE + 1.05), { font: F.cond(92, 700), col: C.gold, size: 92, ls: 3 });
    reveal(x, '3 DE JUNIO DE 1950', 540, 808, prog(t, tE + .6, tE + 1.2), { font: F.cond(42, 600), size: 42, ls: 11 });
    reveal(x, 'LA PRIMERA CUMBRE DE OCHO MIL METROS', 540, 866, prog(t, tE + .75, tE + 1.35), { font: F.cond(32, 600), size: 32, ls: 6, alpha: .82 });
  }
  const wIn = 1 - E.inOut(prog(u, 0, 1.5)); if (wIn > 0) { x.fillStyle = `rgba(244,241,234,${wIn})`; x.fillRect(0, 0, W, H); }
  const fo = prog(t, D - .7, D - .05); if (fo > 0) { x.fillStyle = `rgba(6,8,24,${E.inOut(fo)})`; x.fillRect(0, 0, W, H); }
}
