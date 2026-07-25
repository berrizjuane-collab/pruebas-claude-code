/* =============================================================================
   INVAR — motor de render procedural · núcleo
   -----------------------------------------------------------------------------
   Utilidades compartidas por todas las escenas: ruido, aleatoriedad con semilla,
   paleta, cámara y el pase de revelado (bloom, halación, grano, viñeta, grading).

   Regla de coherencia fotográfica que respetan TODAS las escenas:
     · base grafito frío (2900K de sombra azulada)
     · UNA sola fuente cálida incandescente por encuadre
     · niebla volumétrica ligera, profundidad de campo real por capas
     · grano fino tipo 35 mm empujado un paso
   ========================================================================== */

/* ---------- aleatoriedad reproducible ------------------------------------ */

/** PRNG mulberry32: determinista, mismo seed ⇒ misma imagen. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- ruido de valor + fbm ----------------------------------------- */

function hash2(x, y, s) {
  let h = x * 374761393 + y * 668265263 + s * 2246822519;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Ruido de valor 2D en [0,1]. */
function noise2(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = fade(x - xi), yf = fade(y - yi);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
}

/** Ruido fractal (suma de octavas), en [0,1]. */
function fbm(x, y, oct = 5, s = 0, lac = 2.03, gain = 0.5) {
  let v = 0, amp = 0.5, norm = 0, fx = x, fy = y;
  for (let i = 0; i < oct; i++) {
    v += amp * noise2(fx, fy, s + i * 131);
    norm += amp;
    fx *= lac; fy *= lac; amp *= gain;
  }
  return v / norm;
}

/* ---------- paleta ------------------------------------------------------- */
/* Un único acento cálido (INVAR ember) sobre grafito frío. Nada más. */

const P = {
  void:      [5, 7, 9],
  graphite:  [12, 16, 20],
  slate:     [26, 34, 41],
  steel:     [70, 89, 106],
  mist:      [138, 158, 173],
  bone:      [226, 230, 233],
  ember:     [255, 91, 46],
  emberHot:  [255, 176, 122],
  emberCore: [255, 236, 220],
};
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (c1, c2, t) => [
  Math.round(lerp(c1[0], c2[0], t)),
  Math.round(lerp(c1[1], c2[1], t)),
  Math.round(lerp(c1[2], c2[2], t)),
];

/* ---------- lienzos ------------------------------------------------------ */

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  const ctx = cv.getContext('2d');
  return { cv, ctx };
}

/** Rellena con un degradado vertical de ambiente frío. */
function fillBase(ctx, w, h, top = P.graphite, bottom = P.void) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(top));
  g.addColorStop(1, rgba(bottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Niebla volumétrica: mancha suave de luz, siempre desde la fuente cálida. */
function haze(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.45, rgba(color, alpha * 0.32));
  g.addColorStop(1, rgba(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/* ---------- pase de revelado --------------------------------------------- */

/**
 * Bloom por umbral: se eleva la imagen al cuadrado (multiply sobre sí misma)
 * para aplastar sombras y conservar altas luces, se desenfoca y se suma.
 */
function bloom(cv, { amount = 0.34, radius = 0.014, passes = 2 } = {}) {
  const w = cv.width, h = cv.height;
  const src = makeCanvas(w >> 2, h >> 2);
  src.ctx.drawImage(cv, 0, 0, src.cv.width, src.cv.height);
  src.ctx.globalCompositeOperation = 'multiply';
  src.ctx.drawImage(src.cv, 0, 0);          // v²: umbral suave
  src.ctx.globalCompositeOperation = 'source-over';

  const ctx = cv.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i <= passes; i++) {
    ctx.filter = `blur(${(radius * w * i) / 4}px)`;
    ctx.globalAlpha = amount / i;
    ctx.drawImage(src.cv, 0, 0, w, h);
  }
  ctx.restore();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
}

/**
 * Halación cálida: sangrado anaranjado SOLO alrededor de las altas luces.
 * Umbral duro (v⁴ por doble multiply) para que las sombras no se tiñan: sin
 * esto el ámbar inunda el encuadre y se pierde el grafito frío.
 */
function halation(cv, strength = 0.09) {
  if (strength <= 0) return;
  const w = cv.width, h = cv.height;
  const t = makeCanvas(w >> 3, h >> 3);
  t.ctx.drawImage(cv, 0, 0, t.cv.width, t.cv.height);
  t.ctx.globalCompositeOperation = 'multiply';
  t.ctx.drawImage(t.cv, 0, 0);          // v²
  t.ctx.drawImage(t.cv, 0, 0);          // v⁴ → solo sobreviven las altas luces
  t.ctx.globalCompositeOperation = 'source-atop';
  t.ctx.fillStyle = rgba(P.ember, 1);
  t.ctx.fillRect(0, 0, t.cv.width, t.cv.height);

  const ctx = cv.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = strength;
  ctx.filter = `blur(${w * 0.016}px)`;
  ctx.drawImage(t.cv, 0, 0, w, h);
  ctx.restore();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
}

/** Grano de película: mosaico de ruido monocromo con ligera deriva de canal. */
let grainTile = null;
function grain(cv, amount = 0.055, size = 1) {
  const w = cv.width, h = cv.height;
  if (!grainTile) {
    const T = 256;
    const t = makeCanvas(T, T);
    const img = t.ctx.createImageData(T, T);
    const r = rng(9137);
    for (let i = 0; i < T * T; i++) {
      // suma de dos uniformes ⇒ distribución triangular, más orgánica
      const n = ((r() + r()) * 0.5) * 255;
      img.data[i * 4] = n * 1.02;
      img.data[i * 4 + 1] = n;
      img.data[i * 4 + 2] = n * 0.97;
      img.data[i * 4 + 3] = 255;
    }
    t.ctx.putImageData(img, 0, 0);
    grainTile = t.cv;
  }
  const ctx = cv.getContext('2d');
  const scaled = makeCanvas(w, h);
  const pat = scaled.ctx.createPattern(grainTile, 'repeat');
  scaled.ctx.save();
  scaled.ctx.scale(size, size);
  scaled.ctx.fillStyle = pat;
  scaled.ctx.fillRect(0, 0, w / size, h / size);
  scaled.ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = amount;
  ctx.drawImage(scaled.cv, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Viñeta óptica: caída suave, nunca un aro visible. */
function vignette(ctx, w, h, strength = 0.6, inner = 0.28) {
  const g = ctx.createRadialGradient(
    w * 0.5, h * 0.48, Math.min(w, h) * inner,
    w * 0.5, h * 0.5, Math.max(w, h) * 0.78
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.6, `rgba(0,0,0,${strength * 0.35})`);
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Grading: sombras al azul frío, altas luces a la temperatura del ámbar. */
function grade(ctx, w, h, { lift = 0.06, warm = 0.02, cool = 0.055 } = {}) {
  ctx.save();
  // sombras levantadas hacia un azul frío (nunca negro puro)
  ctx.globalCompositeOperation = 'lighten';
  ctx.fillStyle = `rgba(8,14,20,${lift * 12})`;
  ctx.fillRect(0, 0, w, h);
  // sesgo frío general: mantiene el ámbar como excepción, no como ambiente
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = `rgba(96,150,200,${cool})`;
  ctx.fillRect(0, 0, w, h);
  // altas luces apenas cálidas
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = `rgba(255,176,132,${warm})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Revelado completo, idéntico para todas las escenas. */
function develop(cv, opts = {}) {
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  bloom(cv, opts.bloom);
  halation(cv, opts.halation ?? 0.09);
  grade(ctx, w, h, opts.grade);
  vignette(ctx, w, h, opts.vignette ?? 0.62, opts.vignetteInner ?? 0.28);
  grain(cv, opts.grain ?? 0.05, Math.max(1, Math.round(w / 1600)));
}

/* ---------- geometría de cámara ------------------------------------------ */

/** Proyección en perspectiva simple para nubes de puntos 3D. */
function makeCamera(w, h, { fov = 1.15, dist = 3.2, tilt = 0 } = {}) {
  const f = (h * 0.5) / Math.tan(fov * 0.5);
  return function project(x, y, z) {
    const cy = y * Math.cos(tilt) - z * Math.sin(tilt);
    const cz = y * Math.sin(tilt) + z * Math.cos(tilt) + dist;
    if (cz <= 0.05) return null;
    return { x: w * 0.5 + (x * f) / cz, y: h * 0.5 + (cy * f) / cz, s: f / cz, z: cz };
  };
}

/** Dibuja `layers` (canvas + blur) de lejos a cerca: profundidad de campo real. */
function compositeDepth(ctx, layers) {
  for (const l of layers) {
    ctx.save();
    if (l.blur > 0.05) ctx.filter = `blur(${l.blur}px)`;
    ctx.globalAlpha = l.alpha ?? 1;
    ctx.drawImage(l.cv, 0, 0);
    ctx.restore();
  }
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
}

window.INVAR_CORE = {
  rng, noise2, fbm, lerp, clamp, smoothstep, P, rgba, mix,
  makeCanvas, fillBase, haze, develop, bloom, grain, vignette,
  makeCamera, compositeDepth,
};
