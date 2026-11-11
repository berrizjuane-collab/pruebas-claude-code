'use strict';
/* Compositor: decide qué escenas pintar en t, añade subtítulos sincronizados,
   viñeta y grano de película. Expone window.renderFrame(t). */
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const BUF = mk(W, H), bctx = BUF.getContext('2d');

function monsoon(x, t) { /* se pinta dentro de s3; aquí sólo la cortina que cruza hacia la escena 4 */
  const tM = wt('s3', 7), mc = ease(t, tM - .3, S[3] - .5, E.inOut), wipe = E.inOut(prog(t, S[3] - .65, S[3] + .75));
  const yb = lerp(-3000, -2330, mc) + wipe * 5300;
  A.mon.forEach((L, i) => put(x, L, -300 + Math.sin(t * .5 + i * 2) * 40 - t * (8 + i * 6) % 60, yb + i * 190 * (1 - wipe * .4) - 100 + Math.sin(t * .8 + i) * 14));
}

/* ---------- subtítulos palabra a palabra ---------- */
function capDark(t) {
  if (t > S[1] + .35 && t < S[2] - .15) return true;
  if (t > wt('s6', 22) - .05 && t < S[6] + .7) return true;
  return false;
}
function captions(x, t) {
  const c = TL.caps.find(c => !c.q && t >= c.t0 && t < c.t1); if (!c) return;
  const dark = capDark(t), font = F.serif(62, 600);
  x.save(); x.font = font;
  const sp = x.measureText(' ').width, ws = c.tok.map(k => x.measureText(k.x).width);
  const total = ws.reduce((a, b) => a + b, 0) + sp * (ws.length - 1);
  let lines = [c.tok.map((k, i) => i)];
  if (total > 900) { // partir en dos líneas equilibradas
    let best = 1, bd = 1e9;
    for (let s = 1; s < ws.length; s++) { const a = ws.slice(0, s).reduce((p, q) => p + q, 0) + sp * (s - 1), b = total - a - sp; if (Math.abs(a - b) < bd) { bd = Math.abs(a - b); best = s; } }
    lines = [c.tok.map((k, i) => i).slice(0, best), c.tok.map((k, i) => i).slice(best)];
  }
  x.restore();
  const a = E.out(prog(t, c.t0, c.t0 + .14)), base = lines.length === 1 ? 1412 : 1374;
  const maxW = Math.max(...lines.map(ln => ln.reduce((p, i) => p + ws[i], 0) + sp * (ln.length - 1)));
  // tira de papel oscuro: legible sobre cualquier fondo
  const bw = maxW + 76, bh = lines.length * 80 + 30, by = base - 66 + (1 - a) * 12;
  x.save(); x.globalAlpha = a * .3; x.fillStyle = '#02030c'; x.beginPath(); x.roundRect(540 - bw / 2 + 6, by + 10, bw, bh, 18); x.fill();
  x.globalAlpha = a * (dark ? .93 : .8); x.fillStyle = '#0d1230'; x.beginPath(); x.roundRect(540 - bw / 2, by, bw, bh, 18); x.fill(); x.restore();
  lines.forEach((ln, li) => {
    const lw = ln.reduce((p, i) => p + ws[i], 0) + sp * (ln.length - 1); let cx = 540 - lw / 2; const y = base + li * 80 + (1 - a) * 12;
    ln.forEach(i => {
      const k = c.tok[i], on = t >= k.t - .04, cur = on && t < k.e + .06, pop = cur ? 1 - prog(t, k.t - .04, k.t + .22) : 0;
      text(x, k.x, cx, y - pop * 7, { font, align: 'left', col: cur ? C.gold : C.cream, alpha: a * (on ? 1 : .45) });
      cx += ws[i] + sp;
    });
  });
}

/* ---------- acabado ---------- */
function post(x, t) {
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  // viñeta más suave en las escenas de papel claro (mapa, balance)
  const tA = wt('s6', 20), light = Math.max(ease(t, S[1] + .1, S[1] + .8) * (1 - ease(t, S[2] - .6, S[2])), ease(t, tA + .1, tA + .9) * (1 - ease(t, S[6] + .2, S[6] + 1.5)));
  x.globalAlpha = 1 - .72 * light; x.drawImage(VIGN, 0, 0, W, H); x.globalAlpha = 1;
  const k = Math.floor(t * 12);          // grano "a doses", como animación stop-motion
  x.save(); x.globalCompositeOperation = 'overlay'; x.globalAlpha = .12;
  const fx = hash1(k, 3) < .5 ? -1 : 1, fy = hash1(k, 4) < .5 ? -1 : 1;
  x.translate(fx < 0 ? W : 0, fy < 0 ? H : 0); x.scale(fx, fy);
  x.drawImage(GRAIN[k % GRAIN.length], 0, 0, W, H); x.restore();
}

function renderFrame(t) {
  const x = ctx;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  x.fillStyle = '#05070f'; x.fillRect(0, 0, W, H);
  if (t < S[1] + .85) s1(x, t);
  if (t >= S[1] - .5 && t < S[2] + .25) {
    if (t >= S[2] - .3) { // fundido del zoom del mapa hacia la montaña
      s3(x, t);
      bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, W, H); s2(bctx, t);
      x.globalAlpha = 1 - E.inOut(prog(t, S[2] - .3, S[2] + .22)); x.drawImage(BUF, 0, 0); x.globalAlpha = 1;
    } else s2(x, t);
  } else if (t >= S[2] && t < S[3]) s3(x, t);
  else if (t >= S[3] && t < S[4]) { s4(x, t); if (t < S[3] + .8) monsoon(x, t); }
  else if (t >= S[4] && t < S[5]) s5(x, t);
  else if (t >= S[5] && t < S[6]) s6(x, t);
  else if (t >= S[6]) s7(x, t);
  captions(x, t);
  post(x, t);
}
window.renderFrame = renderFrame;
window.ready = (async () => {
  const fonts = ['400 40px Fraunces', 'italic 400 40px Fraunces', '600 40px Fraunces', 'italic 600 40px Fraunces', '900 40px Fraunces', 'italic 900 40px Fraunces', '500 40px "Barlow Condensed"', '600 40px "Barlow Condensed"', '700 40px "Barlow Condensed"'];
  await Promise.all(fonts.map(f => document.fonts.load(f, 'Añ8«')));
  initTextures(); initS1(); initS2(); initS3(); initS4(); initS5(); initS6(); initS7();
  return true;
})();
// vista previa en navegador: ?play reproduce en tiempo real, ?t=12.5 muestra un instante
const q = new URLSearchParams(location.search);
window.ready.then(() => {
  if (q.has('play')) { const t0 = performance.now() - (parseFloat(q.get('play')) || 0) * 1000; const loop = () => { renderFrame(((performance.now() - t0) / 1000) % TL.dur); requestAnimationFrame(loop); }; loop(); }
  else renderFrame(parseFloat(q.get('t')) || 0);
});
