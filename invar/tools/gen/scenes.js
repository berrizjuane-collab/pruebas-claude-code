/* =============================================================================
   INVAR — motor de render procedural · escenas
   -----------------------------------------------------------------------------
   Cada escena es una función (ctx, w, h, S, opts) donde S = w / 2400 es el
   factor de escala: todo grosor de línea o radio se multiplica por S para que
   la misma escena se pueda renderizar a 640 px o a 2560 px sin cambiar de aire.
   ========================================================================== */

(() => {
const C = window.INVAR_CORE;
const { rng, noise2, fbm, lerp, clamp, smoothstep, P, rgba, mix,
        makeCanvas, fillBase, haze, develop, makeCamera, compositeDepth } = C;

const TAU = Math.PI * 2;

/* ---------- primitivas compartidas --------------------------------------- */

/**
 * Curvas de nivel por marching squares sobre un campo escalar.
 * Devuelve un lienzo con las líneas en blanco (sirve de máscara para colorear
 * por posición, no por nivel: así una misma curva puede pasar de acero a ámbar).
 */
function contourMask(w, h, field, { levels = 44, cols = 260, rows = 150, lw = 1 } = {}) {
  const { cv, ctx } = makeCanvas(w, h);
  const gw = cols, gh = rows;
  const vals = new Float32Array((gw + 1) * (gh + 1));
  for (let j = 0; j <= gh; j++)
    for (let i = 0; i <= gw; i++) vals[j * (gw + 1) + i] = field(i / gw, j / gh);

  const cw = w / gw, ch = h / gh;
  ctx.lineCap = 'round';
  for (let l = 0; l < levels; l++) {
    const lev = (l + 0.5) / levels;
    ctx.beginPath();
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const a = vals[j * (gw + 1) + i], b = vals[j * (gw + 1) + i + 1];
        const c = vals[(j + 1) * (gw + 1) + i + 1], d = vals[(j + 1) * (gw + 1) + i];
        const idx = (a > lev ? 8 : 0) | (b > lev ? 4 : 0) | (c > lev ? 2 : 0) | (d > lev ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x0 = i * cw, y0 = j * ch;
        const t = (v1, v2) => (lev - v1) / (v2 - v1);
        const top = [x0 + cw * t(a, b), y0];
        const right = [x0 + cw, y0 + ch * t(b, c)];
        const bottom = [x0 + cw * t(d, c), y0 + ch];
        const left = [x0, y0 + ch * t(a, d)];
        const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
        switch (idx) {
          case 1: case 14: seg(left, bottom); break;
          case 2: case 13: seg(bottom, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(top, right); break;
          case 5: seg(left, top); seg(bottom, right); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, top); break;
          case 10: seg(left, bottom); seg(top, right); break;
        }
      }
    }
    // las curvas centrales (valores altos) se dibujan algo más marcadas
    ctx.strokeStyle = `rgba(255,255,255,${0.45 + 0.55 * smoothstep(0.35, 0.95, lev)})`;
    ctx.lineWidth = lw * (0.85 + 0.5 * smoothstep(0.5, 1, lev));
    ctx.stroke();
  }
  return cv;
}

/** Colorea una máscara blanca con un degradado radial: ámbar en el foco. */
function tintMask(maskCv, focal, r, cold = P.steel, warm = P.ember) {
  const w = maskCv.width, h = maskCv.height;
  const { cv, ctx } = makeCanvas(w, h);
  ctx.drawImage(maskCv, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  const g = ctx.createRadialGradient(focal[0], focal[1], 0, focal[0], focal[1], r);
  g.addColorStop(0, rgba(mix(warm, P.emberCore, 0.5), 1));
  g.addColorStop(0.22, rgba(mix(warm, cold, 0.45), 1));
  g.addColorStop(0.5, rgba(mix(warm, cold, 0.85), 1));
  g.addColorStop(1, rgba(cold, 1));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return cv;
}

/** Profundidad de campo radial: nítido en el foco, desenfocado hacia fuera. */
function radialDOF(srcCv, focal, r0, r1, maxBlur, farAlpha = 1) {
  const w = srcCv.width, h = srcCv.height;
  const out = makeCanvas(w, h);
  // capa desenfocada de base (atenuada: fuera de foco se apaga, no lechea)
  out.ctx.filter = `blur(${maxBlur}px)`;
  out.ctx.globalAlpha = farAlpha;
  out.ctx.drawImage(srcCv, 0, 0);
  out.ctx.filter = 'none';
  out.ctx.globalAlpha = 1;
  // capa media
  const mid = makeCanvas(w, h);
  mid.ctx.filter = `blur(${maxBlur * 0.35}px)`;
  mid.ctx.drawImage(srcCv, 0, 0);
  mid.ctx.filter = 'none';
  mid.ctx.globalCompositeOperation = 'destination-in';
  let g = mid.ctx.createRadialGradient(focal[0], focal[1], 0, focal[0], focal[1], r1);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  mid.ctx.fillStyle = g; mid.ctx.fillRect(0, 0, w, h);
  out.ctx.drawImage(mid.cv, 0, 0);
  // capa nítida
  const sharp = makeCanvas(w, h);
  sharp.ctx.drawImage(srcCv, 0, 0);
  sharp.ctx.globalCompositeOperation = 'destination-in';
  g = sharp.ctx.createRadialGradient(focal[0], focal[1], 0, focal[0], focal[1], r0);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,0.9)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  sharp.ctx.fillStyle = g; sharp.ctx.fillRect(0, 0, w, h);
  out.ctx.drawImage(sharp.cv, 0, 0);
  return out.cv;
}

/** Partículas en suspensión: polvo iluminado a contraluz. */
function motes(ctx, w, h, S, seed, n = 140, focal = null) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h;
    const d = focal ? Math.hypot(x - focal[0], y - focal[1]) / Math.hypot(w, h) : 0.5;
    const near = 1 - smoothstep(0, 0.5, d);
    const rad = (0.6 + r() * r() * 5) * S * 2.2;
    const a = (0.05 + r() * 0.22) * (0.35 + near);
    const col = r() < 0.16 + near * 0.4 ? P.emberHot : P.mist;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = `blur(${rad * 0.5}px)`;
    ctx.fillStyle = rgba(col, a);
    ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.filter = 'none';
}

/* =============================================================================
   1 · SUSTRATO — héroe abstracto
   Campo térmico de isolíneas: mapa de instrumentación, no "matrix". Un único
   núcleo incandescente donde las curvas se comprimen; el resto, acero frío.
   ========================================================================== */
function sceneSubstrate(ctx, w, h, S, o = {}) {
  const seed = o.seed ?? 7;
  const fx = o.focal?.[0] ?? 0.63, fy = o.focal?.[1] ?? 0.44;
  const focal = [w * fx, h * fy];
  fillBase(ctx, w, h, [10, 14, 18], [4, 6, 8]);

  // campo = fbm + bulbo térmico en el foco (las isolíneas se aprietan ahí)
  const ar = w / h;
  const field = (u, v) => {
    const x = u * 2.35 * ar, y = v * 2.35;
    let base = fbm(x + seed * 3.7, y - seed * 1.3, 6, seed, 2.05, 0.5);
    // remapeo suave (sin recorte): evita mesetas y por tanto zonas vacías
    base = smoothstep(0.2, 0.8, base);
    const d = Math.hypot((u - fx) * ar, v - fy);
    const bulb = Math.exp(-Math.pow(d * 3.1, 2)) * 0.09;   // apenas un apriete
    const tilt = u * 0.2 - v * 0.13;
    return base * 0.62 + bulb + tilt + 0.16;
  };

  const mask = contourMask(w, h, field, {
    levels: o.levels ?? 46, cols: 340, rows: 200, lw: 0.95 * S * 2,
  });
  const tinted = tintMask(mask, focal, Math.min(w, h) * 0.42, mix(P.steel, [54, 74, 92], 0.6), mix(P.ember, P.mist, 0.25));
  const dof = radialDOF(tinted, focal, Math.min(w, h) * 1.1, Math.min(w, h) * 1.7, 3.5 * S * 2, 0.42);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.72;                // el campo es fondo: el texto manda
  ctx.drawImage(dof, 0, 0);
  ctx.restore();

  // calor contenido en el foco, sin núcleo dominante
  haze(ctx, focal[0], focal[1], Math.min(w, h) * 0.3, P.ember, 0.05);
  haze(ctx, w * 0.14, h * 0.86, Math.min(w, h) * 0.95, [74, 118, 165], 0.13);
  haze(ctx, w * 0.5, h * 0.1, Math.min(w, h) * 0.8, [58, 92, 130], 0.07);

  motes(ctx, w, h, S, seed + 11, 170, focal);
  develop(ctx.canvas, { bloom: { amount: 0.36, radius: 0.016, passes: 2 }, halation: 0.1, vignette: 0.66 });
}

/* =============================================================================
   2 · TOPOLOGÍA — grafo de red en profundidad
   Nube de nodos proyectada en perspectiva, tres planos de nitidez. Unos pocos
   nodos comprometidos irradian ámbar por sus aristas: la propagación es el tema.
   ========================================================================== */
function sceneTopology(ctx, w, h, S, o = {}) {
  const seed = o.seed ?? 21;
  const r = rng(seed);
  fillBase(ctx, w, h, [11, 15, 19], [5, 7, 10]);
  haze(ctx, w * 0.72, h * 0.3, Math.max(w, h) * 0.5, [70, 110, 150], 0.1);

  const N = 620;
  const pts = [];
  // el volumen se deduce del encuadre: la red llena la imagen sea cual sea
  const fov = 1.05, dist = 3.15;
  const f = (h * 0.5) / Math.tan(fov * 0.5);
  const spanX = 1.25 * (w * 0.5) * dist / f;
  const spanY = 1.25 * (h * 0.5) * dist / f;
  for (let i = 0; i < N; i++) {
    const x = (r() - 0.5) * spanX * 2;
    const y = (r() - 0.5) * spanY * 2;
    const z = (r() - 0.5) * 3.2;
    pts.push({ x, y, z, hot: 0, hub: false });
  }
  // concentradores: unos pocos nodos con grado alto → topología, no ruido
  const hubs = [];
  for (let i = 0; i < 11; i++) {
    const p = pts[Math.floor(r() * N)];
    p.hub = true; hubs.push(p);
  }
  // focos comprometidos → difusión de "calor" por vecindad
  const seeds = [pts[7], pts[64], pts[131]];
  for (const s of seeds) s.hot = 1;
  for (let pass = 0; pass < 3; pass++) {
    for (const a of pts) {
      if (a.hot <= 0.02) continue;
      for (const b of pts) {
        if (a === b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d < 0.62) b.hot = Math.max(b.hot, a.hot * (0.55 - d * 0.35));
      }
    }
  }

  const cam = makeCamera(w, h, { fov, dist, tilt: -0.12 });
  for (const p of pts) p.p = cam(p.x, p.y, p.z);

  // tres capas de profundidad para una DOF creíble
  const bands = [
    { test: (z) => z > 3.9, blur: 9 * S * 2, alpha: 0.8 },
    { test: (z) => z <= 3.9 && z >= 2.5, blur: 0, alpha: 1 },
    { test: (z) => z < 2.5, blur: 15 * S * 2, alpha: 0.62 },
  ].map((b) => ({ ...b, ...makeCanvas(w, h) }));

  const edges = [];
  const REACH = 0.62;
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const a = pts[i], b = pts[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (d < REACH && r() < 0.5) edges.push([a, b, d / REACH]);
    }
  // enlaces troncales hacia los concentradores y entre ellos
  for (const p of pts) {
    let best = null, bd = 1e9;
    for (const hb of hubs) {
      const d = Math.hypot(p.x - hb.x, p.y - hb.y, p.z - hb.z);
      if (d < bd) { bd = d; best = hb; }
    }
    if (best && bd < 1.5 && r() < 0.5) edges.push([p, best, bd / 1.5]);
  }
  for (let i = 0; i < hubs.length; i++)
    for (let j = i + 1; j < hubs.length; j++)
      if (r() < 0.35) edges.push([hubs[i], hubs[j], 0.85]);

  for (const [a, b, dn] of edges) {
    if (!a.p || !b.p) continue;
    const z = (a.p.z + b.p.z) / 2;
    const band = bands.find((bd) => bd.test(z)); if (!band) continue;
    const c = band.ctx;
    const hot = Math.max(a.hot, b.hot);
    const near = clamp(1 - (z - 1.8) / 3.2, 0.15, 1);
    c.strokeStyle = rgba(hot > 0.12 ? mix(P.steel, P.ember, clamp(hot * 1.5, 0, 1)) : mix(P.steel, P.mist, 0.35),
      (0.16 + 0.6 * near) * (1 - dn * 0.7) * (hot > 0.12 ? 1.6 : 1));
    c.lineWidth = (0.45 + near * 1.05) * S * 2;
    c.beginPath(); c.moveTo(a.p.x, a.p.y); c.lineTo(b.p.x, b.p.y); c.stroke();
  }

  for (const p of pts) {
    if (!p.p) continue;
    const band = bands.find((bd) => bd.test(p.p.z)); if (!band) continue;
    const c = band.ctx;
    const near = clamp(1 - (p.p.z - 1.8) / 3.2, 0.15, 1);
    const s = (1.6 + near * 3.4) * S * 2 * (p.hub ? 1.9 : 1);
    const hot = p.hot;
    const col = hot > 0.12 ? mix(P.mist, P.emberHot, clamp(hot * 1.6, 0, 1)) : P.mist;
    if (hot > 0.35) {
      c.save(); c.globalCompositeOperation = 'lighter';
      c.filter = `blur(${s * 3}px)`;
      c.fillStyle = rgba(P.ember, 0.5 * hot);
      c.beginPath(); c.arc(p.p.x, p.p.y, s * 4, 0, TAU); c.fill();
      c.restore(); c.filter = 'none';
    }
    c.fillStyle = rgba(col, 0.35 + 0.6 * near);
    c.fillRect(p.p.x - s / 2, p.p.y - s / 2, s, s);
    if (near > 0.55) {
      c.strokeStyle = rgba(col, 0.3 * near);
      c.lineWidth = 0.9 * S * 2;
      c.strokeRect(p.p.x - s * 1.9, p.p.y - s * 1.9, s * 3.8, s * 3.8);
    }
  }

  compositeDepth(ctx, bands.map((b) => ({ cv: b.cv, blur: b.blur, alpha: b.alpha })));
  motes(ctx, w, h, S, seed + 3, 90);
  develop(ctx.canvas, { bloom: { amount: 0.32, radius: 0.014 }, halation: 0.08, vignette: 0.7 });
}

/* =============================================================================
   3 · FLUJO — el dato viaja y se cifra
   Líneas de corriente sobre ruido curl que atraviesan una garganta: orden
   laminar antes, incandescencia en la compresión, turbulencia cifrada después.
   ========================================================================== */
function sceneFlow(ctx, w, h, S, o = {}) {
  const seed = o.seed ?? 33;
  const r = rng(seed);
  fillBase(ctx, w, h, [9, 13, 17], [4, 6, 9]);

  const gate = 0.52;                       // posición de la garganta (0..1)
  const layers = [
    { blur: 7 * S * 2, alpha: 0.5, n: 260 },
    { blur: 0, alpha: 1, n: 420 },
    { blur: 12 * S * 2, alpha: 0.35, n: 120 },
  ].map((l) => ({ ...l, ...makeCanvas(w, h) }));

  for (const L of layers) {
    const c = L.ctx;
    c.lineCap = 'round';
    for (let i = 0; i < L.n; i++) {
      let x = -0.06 + r() * 0.04;
      let y = 0.12 + r() * 0.76;
      const life = 260 + r() * 140;
      let prev = null;
      c.beginPath();
      for (let t = 0; t < life; t++) {
        // campo: avance + convergencia hacia la garganta + turbulencia posterior
        const dgate = x - gate;
        const pull = -Math.sign(y - 0.5) * Math.exp(-Math.abs(dgate) * 9) * 0.0042;
        const spread = Math.sign(y - 0.5) * smoothstep(0, 0.22, dgate) * 0.0016;
        const turb = smoothstep(-0.02, 0.3, dgate);
        const n1 = fbm(x * 5.5 + seed, y * 5.5, 4, seed) - 0.5;
        const vy = pull + spread + n1 * 0.006 * (0.25 + turb * 2.6);
        const vx = 0.0038 + Math.abs(dgate) * 0.0015;
        x += vx; y += vy;
        if (y < 0.02 || y > 0.98 || x > 1.06) break;
        const px = x * w, py = y * h;
        if (prev) { c.moveTo(prev[0], prev[1]); c.lineTo(px, py); }
        prev = [px, py];
        const heat = Math.exp(-Math.abs(dgate) * 11);
        const col = mix(P.steel, P.emberCore, clamp(heat * 1.25, 0, 1));
        c.strokeStyle = rgba(col, (0.05 + heat * 0.4) * (0.5 + r() * 0.5));
        c.lineWidth = (0.45 + heat * 1.6) * S * 2;
        c.stroke();
        c.beginPath();
      }
    }
  }
  compositeDepth(ctx, layers.map((l) => ({ cv: l.cv, blur: l.blur, alpha: l.alpha })));

  // la garganta: fuente cálida única
  haze(ctx, gate * w, h * 0.5, h * 0.42, P.ember, 0.16);
  haze(ctx, gate * w, h * 0.5, h * 0.1, P.emberCore, 0.22);
  motes(ctx, w, h, S, seed + 5, 80, [gate * w, h * 0.5]);
  develop(ctx.canvas, { bloom: { amount: 0.42, radius: 0.016 }, halation: 0.13, vignette: 0.68 });
}

/* =============================================================================
   4 · CAPAS — cifrado por estratos
   Planos translúcidos en perspectiva. Un haz entra ordenado y sale ilegible:
   cada plano desordena un poco más su sección. Moiré real entre micro-rejillas.
   ========================================================================== */
function sceneLayers(ctx, w, h, S, o = {}) {
  const seed = o.seed ?? 44;
  const r = rng(seed);
  fillBase(ctx, w, h, [10, 14, 18], [4, 6, 9]);
  haze(ctx, w * 0.2, h * 0.18, Math.max(w, h) * 0.55, [80, 120, 160], 0.09);

  const NL = 6;
  const cam = makeCamera(w, h, { fov: 1.0, dist: 3.5, tilt: -0.42 });
  const half = 1.42;

  for (let i = NL - 1; i >= 0; i--) {
    const z = -1.35 + i * 0.62;            // i = 0 → el estrato más cercano
    const yOff = -0.62 + i * 0.235;        // el estrato limpio queda al fondo
    const corners = [
      cam(-half, yOff, z), cam(half, yOff, z),
      cam(half * 0.99, yOff + 0.015, z + 1.15), cam(-half * 0.99, yOff + 0.015, z + 1.15),
    ];
    if (corners.some((c) => !c)) continue;
    const depth = i / (NL - 1);            // 0 cerca · 1 lejos
    const scramble = 1 - depth;            // el dato entra legible por el fondo

    // punto (u,v) dentro del cuadrilátero, por interpolación bilineal
    const at = (u, v) => {
      const ax = lerp(corners[0].x, corners[1].x, u), ay = lerp(corners[0].y, corners[1].y, u);
      const bx = lerp(corners[3].x, corners[2].x, u), by = lerp(corners[3].y, corners[2].y, u);
      return [lerp(ax, bx, v), lerp(ay, by, v)];
    };

    // micro-rejilla rotada por capa → moiré natural entre estratos
    const tile = makeCanvas(64, 64);
    tile.ctx.strokeStyle = rgba(mix(P.steel, P.mist, depth * 0.6), 0.5);
    tile.ctx.lineWidth = 1;
    const step = 7 + i;
    for (let g = 0; g < 64; g += step) {
      tile.ctx.beginPath(); tile.ctx.moveTo(g, 0); tile.ctx.lineTo(g, 64); tile.ctx.stroke();
      tile.ctx.beginPath(); tile.ctx.moveTo(0, g); tile.ctx.lineTo(64, g); tile.ctx.stroke();
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let k = 1; k < 4; k++) ctx.lineTo(corners[k].x, corners[k].y);
    ctx.closePath();
    ctx.clip();

    const g = ctx.createLinearGradient(0, corners[0].y, 0, corners[2].y);
    g.addColorStop(0, rgba(P.slate, 0.34 + depth * 0.2));
    g.addColorStop(1, rgba(P.void, 0.58));
    ctx.fillStyle = g; ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.08 + depth * 0.12;
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(w * 0.5, h * 0.5);
    ctx.rotate(((i * 8.5) * Math.PI) / 180);
    ctx.scale(1 + i * 0.07, 1 + i * 0.07);
    ctx.fillStyle = ctx.createPattern(tile.cv, 'repeat');
    ctx.fillRect(-w, -h, w * 2, h * 2);
    ctx.restore();

    /* La señal: las mismas 13 trazas cruzando todos los estratos. En el fondo
       son continuas y legibles; cada capa las desplaza y las trocea hasta que
       abajo ya no queda estructura recuperable. */
    const M = 13, K = 56;
    for (let m = 0; m < M; m++) {
      const t0 = 0.18 + (m / (M - 1)) * 0.64;
      for (let k = 0; k < K; k++) {
        const u0 = 0.06 + (k / K) * 0.88, u1 = 0.06 + ((k + 1) / K) * 0.88;
        // hueco: la traza se rompe en trozos a medida que se cifra
        if (scramble > 0.1 && r() < scramble * 0.55) continue;
        const off = (v) => (noise2(v * 9 + m * 3.3, i * 11 + seed, seed) - 0.5) * scramble * 0.26;
        const p0 = at(u0, clamp(t0 + off(u0), 0.04, 0.96));
        const p1 = at(u1, clamp(t0 + off(u1), 0.04, 0.96));
        const hot = 1 - scramble;
        ctx.strokeStyle = rgba(mix(P.steel, P.emberCore, hot * 0.92), (0.07 + 0.4 * hot) * (0.6 + r() * 0.5));
        ctx.lineWidth = (0.9 + hot * 1.5) * S * 2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      }
    }
    ctx.restore();

    // canto iluminado del estrato
    ctx.strokeStyle = rgba(i === 0 ? P.ember : mix(P.steel, P.mist, depth),
      i === 0 ? 0.5 : 0.16 + depth * 0.22);
    ctx.lineWidth = (i === 0 ? 1.8 : 1.1) * S * 2;
    ctx.beginPath();
    ctx.moveTo(corners[3].x, corners[3].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.stroke();
  }

  haze(ctx, w * 0.5, h * 0.86, h * 0.4, P.ember, 0.07);
  motes(ctx, w, h, S, seed + 2, 70);
  develop(ctx.canvas, { bloom: { amount: 0.34, radius: 0.013 }, halation: 0.09, vignette: 0.68 });
}

/* =============================================================================
   5 · SUPERFICIE — relieve de exposición
   Malla de alambre con oclusión por pintor: la topografía de todo lo que una
   organización expone. Los focos cálidos son los puntos que arden por debajo.
   ========================================================================== */
function sceneSurface(ctx, w, h, S, o = {}) {
  const seed = o.seed ?? 55;
  fillBase(ctx, w, h, [10, 14, 18], [5, 7, 10]);
  haze(ctx, w * 0.5, h * 0.22, Math.max(w, h) * 0.55, [70, 105, 145], 0.09);

  const rows = 96, cols = 300;
  const hotspots = [[0.34, 0.44], [0.68, 0.62], [0.52, 0.3]];
  const height = (u, v) => {
    let hgt = Math.pow(fbm(u * 4.2 + seed, v * 4.2, 6, seed, 2.1, 0.52), 1.35);
    for (const [hx, hy] of hotspots) {
      const d = Math.hypot(u - hx, v - hy);
      hgt += Math.exp(-Math.pow(d * 7, 2)) * 0.38;
    }
    return hgt;
  };

  const horizon = h * 0.3;
  for (let j = 0; j < rows; j++) {
    const v = j / (rows - 1);
    const persp = Math.pow(v, 1.9);                 // filas comprimidas al fondo
    const yBase = horizon + persp * (h * 0.92);
    const spread = 0.6 + persp * 1.9;               // ensanchado hacia el frente
    const amp = h * (0.1 + persp * 0.34);
    const near = persp;

    ctx.beginPath();
    let firstX = 0, lastX = 0;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const x = w * 0.5 + (u - 0.5) * w * spread;
      const y = yBase - height(u, v) * amp;
      if (i === 0) { ctx.moveTo(x, y); firstX = x; } else ctx.lineTo(x, y);
      lastX = x;
    }
    // relleno opaco por debajo: oculta las filas de detrás (algoritmo del pintor)
    ctx.lineTo(lastX, h + 10); ctx.lineTo(firstX, h + 10); ctx.closePath();
    const gf = ctx.createLinearGradient(0, yBase - h * 0.2, 0, yBase + h * 0.1);
    gf.addColorStop(0, rgba([9, 12, 16], 0.94));
    gf.addColorStop(1, rgba([5, 7, 10], 1));
    ctx.fillStyle = gf;
    ctx.fill();

    // brillo bajo la cresta en los focos calientes
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [hx, hy] of hotspots) {
      const d = Math.abs(v - hy);
      if (d > 0.1) continue;
      const x = w * 0.5 + (hx - 0.5) * w * spread;
      const y = yBase - height(hx, v) * amp;
      const a = (1 - d / 0.1) * 0.34 * (0.3 + near);
      const rr = h * (0.05 + near * 0.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, rgba(P.ember, a));
      g.addColorStop(1, rgba(P.ember, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    ctx.restore();

    // la cresta
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const x = w * 0.5 + (u - 0.5) * w * spread;
      const y = yBase - height(u, v) * amp;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    let hotNear = 0;
    for (const [, hy] of hotspots) hotNear = Math.max(hotNear, 1 - Math.min(1, Math.abs(v - hy) / 0.08));
    ctx.strokeStyle = rgba(mix(mix(P.slate, P.mist, 0.15 + near * 0.85), P.ember, hotNear * 0.55),
      0.18 + near * 0.72);
    ctx.lineWidth = (0.5 + near * 1.5) * S * 2;
    ctx.stroke();
  }

  motes(ctx, w, h, S, seed + 9, 60);
  develop(ctx.canvas, { bloom: { amount: 0.3, radius: 0.013 }, halation: 0.08, vignette: 0.72 });
}

/* =============================================================================
   6 · SALA DE OPERACIONES — entorno humano
   Interior a contraluz: muro de paneles, bruma volumétrica, siluetas recortadas
   por la luz de sus propias pantallas. Cine, no foto de stock corporativa.
   ========================================================================== */
function figure(c, x, y, sc, seed, rim, fill, o = {}) {
  const r = rng(seed);
  const headR = 0.108 * sc;
  const lean = (r() - 0.5) * 0.1;
  const lx = o.light?.[0] ?? 0.35, ly = o.light?.[1] ?? -1;   // dirección de luz
  const sw = (0.3 + r() * 0.06) * sc;                          // medio hombro
  c.save();
  c.translate(x, y);
  c.rotate(lean * 0.3);

  const body = new Path2D();
  body.moveTo(-sw * 1.12, sc * 0.62);
  body.bezierCurveTo(-sw * 1.08, sc * 0.16, -sw * 0.86, sc * 0.04, -sw * 0.48, -sc * 0.005);
  body.bezierCurveTo(-sw * 0.36, -sc * 0.03, -sw * 0.33, -sc * 0.07, -sw * 0.29, -sc * 0.108);
  body.lineTo(sw * 0.27, -sc * 0.104);
  body.bezierCurveTo(sw * 0.33, -sc * 0.062, sw * 0.36, -sc * 0.026, sw * 0.5, 0);
  body.bezierCurveTo(sw * 0.9, sc * 0.05, sw * 1.1, sc * 0.2, sw * 1.14, sc * 0.62);
  body.closePath();

  // cabeza con contorno perturbado: nada de círculo perfecto (leería a icono)
  const head = new Path2D();
  const hy = -sc * 0.105 - headR * 0.86;
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU;
    const k = 1 + (noise2(Math.cos(a) * 1.7 + seed, Math.sin(a) * 1.7, seed) - 0.5) * 0.16;
    const px = Math.cos(a) * headR * k * 0.94, py = Math.sin(a) * headR * k * 1.06;
    i ? head.lineTo(px, hy + py) : head.moveTo(px, hy + py);
  }
  head.closePath();

  c.fillStyle = fill;
  c.fill(body); c.fill(head);

  // luz de contorno direccional: solo el lado iluminado recibe filo
  const span = sw * 1.25;
  const g = c.createLinearGradient(-lx * span, -ly * span * 0.9 + hy * 0.5,
                                    lx * span, ly * span * 0.9 + hy * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.42, 'rgba(0,0,0,0)');
  g.addColorStop(0.8, rim);
  g.addColorStop(1, rim);
  c.strokeStyle = g;
  c.lineWidth = sc * 0.009;
  c.stroke(body); c.stroke(head);
  c.restore();
}

function sceneOps(ctx, w, h, S, o = {}) {
  const seed = o.seed ?? 66;
  const r = rng(seed);
  fillBase(ctx, w, h, [8, 11, 15], [3, 5, 7]);

  const vpx = w * 0.52, vpy = h * 0.46;

  /* --- muro de paneles al fondo --------------------------------------- */
  const wallL = w * 0.16, wallR = w * 0.86, wallT = h * 0.13, wallB = h * 0.62;
  const cols = 7, rowsP = 3;
  const gapx = (wallR - wallL) / cols, gapy = (wallB - wallT) / rowsP;
  const wall = makeCanvas(w, h);
  const wc = wall.ctx;
  for (let j = 0; j < rowsP; j++) {
    for (let i = 0; i < cols; i++) {
      const x = wallL + i * gapx + gapx * 0.06;
      const y = wallT + j * gapy + gapy * 0.08;
      const pw = gapx * 0.88, ph = gapy * 0.84;
      const isHot = (i === 4 && j === 1);
      const base = isHot ? P.ember : mix([48, 78, 104], [26, 44, 60], r());
      const g = wc.createLinearGradient(x, y, x, y + ph);
      g.addColorStop(0, rgba(base, isHot ? 0.5 : 0.34));
      g.addColorStop(1, rgba(base, isHot ? 0.2 : 0.14));
      wc.fillStyle = g;
      wc.fillRect(x, y, pw, ph);
      // contenido tenue: series temporales / barras / mapas
      const kind = Math.floor(r() * 3);
      wc.save();
      wc.beginPath(); wc.rect(x, y, pw, ph); wc.clip();
      wc.strokeStyle = rgba(isHot ? P.emberCore : P.mist, 0.5);
      wc.lineWidth = 1.1 * S * 2;
      if (kind === 0) {
        wc.beginPath();
        for (let k = 0; k <= 40; k++) {
          const px = x + (k / 40) * pw;
          const py = y + ph * (0.35 + 0.5 * fbm(k * 0.35, i * 3 + j, 3, seed));
          k ? wc.lineTo(px, py) : wc.moveTo(px, py);
        }
        wc.stroke();
      } else if (kind === 1) {
        for (let k = 0; k < 14; k++) {
          const bh = ph * (0.1 + r() * 0.55);
          wc.fillStyle = rgba(isHot ? P.emberHot : P.mist, 0.28);
          wc.fillRect(x + pw * (k / 14) + pw * 0.02, y + ph - bh - ph * 0.1, pw / 22, bh);
        }
      } else {
        for (let k = 0; k < 26; k++) {
          wc.fillStyle = rgba(P.mist, 0.22 + r() * 0.3);
          wc.fillRect(x + r() * pw, y + ph * (0.15 + r() * 0.7), pw * 0.02, ph * 0.02);
        }
        wc.strokeStyle = rgba(P.mist, 0.16);
        for (let k = 0; k < 6; k++) {
          wc.beginPath();
          wc.moveTo(x + r() * pw, y + r() * ph);
          wc.lineTo(x + r() * pw, y + r() * ph);
          wc.stroke();
        }
      }
      wc.restore();
      // marco
      wc.strokeStyle = rgba(P.steel, 0.3);
      wc.lineWidth = 1.4 * S * 2;
      wc.strokeRect(x, y, pw, ph);
    }
  }
  ctx.save();
  ctx.filter = `blur(${3.2 * S * 2}px)`;   // el muro está al fondo: fuera de foco
  ctx.drawImage(wall.cv, 0, 0);
  ctx.restore();
  ctx.filter = 'none';

  // derrame de luz del muro sobre el aire
  haze(ctx, w * 0.5, h * 0.38, Math.max(w, h) * 0.62, [78, 120, 158], 0.16);
  haze(ctx, wallL + 4.5 * gapx, wallT + 1.5 * gapy, h * 0.4, P.ember, 0.13);

  /* --- reflejo en el suelo pulido -------------------------------------- */
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = `blur(${9 * S * 2}px)`;
  ctx.translate(0, h * 1.32);
  ctx.scale(1, -0.62);
  ctx.drawImage(wall.cv, 0, 0);
  ctx.restore();
  ctx.filter = 'none';

  /* --- niebla volumétrica en haces ------------------------------------- */
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x0 = wallL + (i + 0.5) * gapx * 1.35;
    const g = ctx.createLinearGradient(x0, wallT, x0 + (x0 - vpx) * 0.5, h);
    const col = i === 3 ? P.ember : [90, 135, 175];
    g.addColorStop(0, rgba(col, 0.05));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - gapx * 0.4, wallT);
    ctx.lineTo(x0 + gapx * 0.4, wallT);
    ctx.lineTo(x0 + (x0 - vpx) * 0.55 + gapx * 1.5, h);
    ctx.lineTo(x0 + (x0 - vpx) * 0.55 - gapx * 1.5, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  /* --- puestos de trabajo: mesas, monitores, siluetas ------------------ */
  const desks = [
    { x: 0.3, y: 0.78, s: 0.30, seed: 3 },
    { x: 0.62, y: 0.8, s: 0.32, seed: 8 },
    { x: 0.86, y: 0.9, s: 0.42, seed: 12 },
    { x: 0.1, y: 0.92, s: 0.44, seed: 17 },
  ];
  const near = makeCanvas(w, h), mid = makeCanvas(w, h);
  for (const d of desks) {
    const target = d.s > 0.36 ? near.ctx : mid.ctx;
    const px = d.x * w, py = d.y * h, sc = d.s * h;
    // monitor: rectángulo emisor tras la silueta
    const mw = sc * 0.95, mh = sc * 0.5;
    const mx = px - mw / 2, my = py - sc * 0.72;
    const gm = target.createLinearGradient(mx, my, mx, my + mh);
    const mcol = d.seed === 8 ? P.ember : [70, 120, 160];
    gm.addColorStop(0, rgba(mcol, 0.34));
    gm.addColorStop(1, rgba(mcol, 0.13));
    target.fillStyle = gm;
    target.fillRect(mx, my, mw, mh);
    target.save();
    target.beginPath(); target.rect(mx, my, mw, mh); target.clip();
    target.strokeStyle = rgba(P.bone, 0.22);
    target.lineWidth = 1.2 * S * 2;
    for (let k = 0; k < 12; k++) {
      const yy = my + mh * (0.12 + k * 0.07);
      target.beginPath();
      target.moveTo(mx + mw * 0.08, yy);
      target.lineTo(mx + mw * (0.15 + rng(d.seed * 31 + k)() * 0.7), yy);
      target.stroke();
    }
    target.restore();
    target.save();
    target.globalCompositeOperation = 'lighter';
    target.filter = `blur(${sc * 0.25}px)`;
    target.fillStyle = rgba(mcol, 0.2);
    target.fillRect(mx - sc * 0.2, my - sc * 0.15, mw + sc * 0.4, mh + sc * 0.3);
    target.restore();
    target.filter = 'none';

    // silueta recortada contra su pantalla
    figure(target, px, py - sc * 0.18, sc, d.seed,
      rgba(mix(P.mist, mcol, 0.5), 0.5), rgba([4, 6, 8], 0.97));

    // canto de la mesa
    const dw = sc * 2.1;
    const gd = target.createLinearGradient(0, py + sc * 0.4, 0, py + sc * 0.52);
    gd.addColorStop(0, rgba([16, 21, 26], 1));
    gd.addColorStop(1, rgba([6, 8, 11], 1));
    target.fillStyle = gd;
    target.fillRect(px - dw / 2, py + sc * 0.4, dw, sc * 0.5);
    target.strokeStyle = rgba(P.steel, 0.35);
    target.lineWidth = 1.3 * S * 2;
    target.beginPath();
    target.moveTo(px - dw / 2, py + sc * 0.4); target.lineTo(px + dw / 2, py + sc * 0.4);
    target.stroke();
  }
  ctx.save(); ctx.filter = `blur(${1.1 * S * 2}px)`; ctx.drawImage(mid.cv, 0, 0); ctx.restore();
  ctx.save(); ctx.filter = `blur(${7 * S * 2}px)`; ctx.globalAlpha = 0.96; ctx.drawImage(near.cv, 0, 0); ctx.restore();
  ctx.filter = 'none'; ctx.globalAlpha = 1;

  motes(ctx, w, h, S, seed + 4, 150, [w * 0.5, h * 0.4]);
  develop(ctx.canvas, { bloom: { amount: 0.4, radius: 0.016 }, halation: 0.1, vignette: 0.78, grain: 0.07 });
}

/* =============================================================================
   7 · PUESTO — un analista, plano medio
   ========================================================================== */
function sceneConsole(ctx, w, h, S, o = {}) {
  const seed = o.seed ?? 77;
  const r = rng(seed);
  fillBase(ctx, w, h, [9, 12, 16], [4, 5, 8]);

  /* --- muro de situación: un único gran panel con la topología viva ----- */
  const wx = w * 0.2, wy = h * 0.1, ww = w * 0.76, wh = h * 0.46;
  const wall = makeCanvas(w, h);
  const c = wall.ctx;
  const g = c.createLinearGradient(wx, wy, wx, wy + wh);
  g.addColorStop(0, rgba([34, 60, 84], 0.6));
  g.addColorStop(1, rgba([14, 27, 38], 0.5));
  c.fillStyle = g;
  c.fillRect(wx, wy, ww, wh);
  c.save();
  c.beginPath(); c.rect(wx, wy, ww, wh); c.clip();

  // grafo proyectado sobre el panel
  const cam = makeCamera(ww, wh, { fov: 1.2, dist: 3.2, tilt: -0.1 });
  const nodes = [];
  for (let i = 0; i < 150; i++) {
    const p = cam((r() - 0.5) * 3.4, (r() - 0.5) * 2.2, (r() - 0.5) * 2.4);
    if (p) nodes.push({ x: wx + p.x, y: wy + p.y, hot: r() < 0.12 });
  }
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > wh * 0.16) continue;
      c.strokeStyle = rgba(a.hot && b.hot ? P.ember : P.mist, 0.22 * (1 - d / (wh * 0.16)));
      c.lineWidth = 1.2 * S * 2;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
  for (const n of nodes) {
    c.fillStyle = rgba(n.hot ? P.emberHot : P.mist, n.hot ? 0.9 : 0.5);
    const sz = (n.hot ? 4 : 2.6) * S * 2;
    c.fillRect(n.x - sz / 2, n.y - sz / 2, sz, sz);
  }
  // franja de estado inferior y columna de eventos a la izquierda del panel
  for (let k = 0; k < 30; k++) {
    c.fillStyle = rgba(k % 7 === 3 ? P.ember : P.mist, 0.14 + r() * 0.22);
    c.fillRect(wx + ww * 0.03, wy + wh * (0.08 + k * 0.028), ww * (0.04 + r() * 0.14), wh * 0.012);
  }
  c.restore();
  c.strokeStyle = rgba(P.steel, 0.34);
  c.lineWidth = 2 * S * 2;
  c.strokeRect(wx, wy, ww, wh);

  ctx.save();
  ctx.filter = `blur(${2.6 * S * 2}px)`;
  ctx.drawImage(wall.cv, 0, 0);
  ctx.restore(); ctx.filter = 'none';

  haze(ctx, wx + ww * 0.5, wy + wh * 0.6, Math.max(w, h) * 0.55, [76, 122, 162], 0.15);
  haze(ctx, wx + ww * 0.72, wy + wh * 0.5, h * 0.26, P.ember, 0.07);

  // reflejo en el suelo
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = `blur(${10 * S * 2}px)`;
  ctx.translate(0, h * 1.88);
  ctx.scale(1, -0.5);
  ctx.drawImage(wall.cv, 0, 0);
  ctx.restore(); ctx.filter = 'none'; ctx.globalAlpha = 1;

  /* --- mesa larga en perspectiva y puestos encendidos ------------------- */
  const mid = makeCanvas(w, h);
  const m = mid.ctx;
  const tTop = h * 0.72, tBot = h * 0.86;
  m.beginPath();
  m.moveTo(w * 0.16, tTop); m.lineTo(w * 0.94, tTop);
  m.lineTo(w * 1.02, tBot); m.lineTo(w * 0.06, tBot);
  m.closePath();
  const gt = m.createLinearGradient(0, tTop, 0, tBot);
  gt.addColorStop(0, rgba([15, 20, 25], 1));
  gt.addColorStop(1, rgba([6, 8, 11], 1));
  m.fillStyle = gt; m.fill();
  m.strokeStyle = rgba(mix(P.steel, P.mist, 0.3), 0.45);
  m.lineWidth = 1.6 * S * 2;
  m.beginPath(); m.moveTo(w * 0.16, tTop); m.lineTo(w * 0.94, tTop); m.stroke();
  // portátiles abiertos: solo el resplandor de sus pantallas
  for (const [px, sc] of [[0.3, 0.9], [0.52, 1], [0.76, 0.85]]) {
    const lw2 = w * 0.075 * sc, lh = h * 0.075 * sc;
    const lx = px * w - lw2 / 2, ly = tTop - lh;
    const gl = m.createLinearGradient(lx, ly, lx, ly + lh);
    gl.addColorStop(0, rgba([90, 140, 180], 0.42));
    gl.addColorStop(1, rgba([50, 90, 125], 0.2));
    m.fillStyle = gl;
    m.beginPath();
    m.moveTo(lx, ly + lh); m.lineTo(lx + lw2 * 0.08, ly);
    m.lineTo(lx + lw2 * 0.92, ly); m.lineTo(lx + lw2, ly + lh);
    m.closePath(); m.fill();
    m.save(); m.globalCompositeOperation = 'lighter';
    m.filter = `blur(${lh * 0.5}px)`;
    m.fillStyle = rgba([90, 140, 180], 0.3);
    m.fillRect(lx - lw2 * 0.2, ly - lh * 0.3, lw2 * 1.4, lh * 1.4);
    m.restore(); m.filter = 'none';
  }
  // dos personas de pie frente al muro, una sentada al fondo de la mesa
  figure(m, w * 0.36, h * 0.79, h * 0.33, seed + 2,
    rgba(mix(P.mist, [120, 170, 210], 0.7), 0.55), rgba([4, 6, 9], 0.98), { light: [-0.6, -0.8] });
  figure(m, w * 0.46, h * 0.8, h * 0.31, seed + 5,
    rgba(mix(P.mist, [120, 170, 210], 0.7), 0.5), rgba([4, 6, 9], 0.98), { light: [0.5, -0.85] });
  figure(m, w * 0.68, h * 0.86, h * 0.28, seed + 9,
    rgba(mix(P.mist, P.emberHot, 0.35), 0.4), rgba([4, 6, 9], 0.98), { light: [0.7, -0.7] });
  ctx.save(); ctx.filter = `blur(${1.4 * S * 2}px)`; ctx.drawImage(mid.cv, 0, 0); ctx.restore();
  ctx.filter = 'none';

  // marco de puerta en primer plano: encuadra la escena y da profundidad
  const fg = makeCanvas(w, h);
  fg.ctx.fillStyle = rgba([5, 7, 9], 1);
  fg.ctx.fillRect(0, 0, w * 0.11, h);
  fg.ctx.fillRect(0, h * 0.93, w, h * 0.07);
  ctx.save(); ctx.filter = `blur(${16 * S * 2}px)`; ctx.drawImage(fg.cv, 0, 0); ctx.restore();
  ctx.filter = 'none';

  motes(ctx, w, h, S, seed + 8, 130, [w * 0.55, h * 0.35]);
  develop(ctx.canvas, { bloom: { amount: 0.38, radius: 0.016 }, halation: 0.09, vignette: 0.8, grain: 0.065 });
}

/* =============================================================================
   8 · FIBRA — macro de hardware
   Haz de fibra óptica: puntas encendidas como bokeh, profundidad de campo
   extrema, una única fibra ámbar. Óptica real: el bokeh tiene borde definido.
   ========================================================================== */
function sceneFiber(ctx, w, h, S, o = {}) {
  const seed = o.seed ?? 88;
  const r = rng(seed);
  fillBase(ctx, w, h, [8, 11, 14], [3, 4, 6]);

  /* El corte del haz: empaquetado hexagonal de fibras sobre un plano
     inclinado. El eje de inclinación define la profundidad, y con ella el
     tamaño del bokeh: solo una banda estrecha queda a foco. */
  const cx = w * 0.5, cy = h * 0.48, R = h * 0.74;
  const rot = -0.34;                         // el haz cruza en diagonal
  const tiltK = 0.42;                        // aplastamiento por perspectiva
  const focusD = 0.46;                       // plano de enfoque
  const fibers = [];
  const pitch = R * 0.125;
  for (let ring = 0; ring < 12; ring++) {
    const nOn = ring === 0 ? 1 : ring * 6;
    for (let k = 0; k < nOn; k++) {
      const a = (k / nOn) * TAU + ring * 0.4;
      const rr = ring * pitch * (0.92 + r() * 0.16);
      const jx = (r() - 0.5) * pitch * 0.35, jy = (r() - 0.5) * pitch * 0.35;
      let ux = Math.cos(a) * rr + jx, uy = Math.sin(a) * rr + jy;
      if (Math.hypot(ux, uy) > R) continue;
      // el eje de inclinación marca la profundidad de cada fibra
      const depth = clamp(0.5 + (uy / R) * 0.62 + (ux / R) * 0.2, 0, 1);
      const rx = ux * Math.cos(rot) - uy * Math.sin(rot);
      const ry = ux * Math.sin(rot) + uy * Math.cos(rot);
      fibers.push({
        x: cx + rx, y: cy + ry * tiltK,
        depth, hot: r() < 0.075, jitter: r(),
      });
    }
  }
  fibers.sort((a, b) => a.depth - b.depth);

  const bands = [
    { lo: 0, hi: 0.34, blur: 13 * S * 2, alpha: 0.5 },
    { lo: 0.34, hi: 0.66, blur: 0.6 * S * 2, alpha: 1 },
    { lo: 0.66, hi: 1.01, blur: 30 * S * 2, alpha: 0.45 },
  ].map((b) => ({ ...b, ...makeCanvas(w, h) }));

  for (const f of fibers) {
    const band = bands.find((b) => f.depth >= b.lo && f.depth < b.hi);
    const c = band.ctx;
    const col = f.hot ? P.ember : [128, 182, 222];
    // hebra de vidrio hacia atrás-izquierda, con ligera curvatura de haz
    const back = w * (0.34 + f.jitter * 0.3);
    const ex = f.x - back, ey = f.y + (f.jitter - 0.35) * h * 0.3;
    const gl = c.createLinearGradient(ex, ey, f.x, f.y);
    gl.addColorStop(0, rgba(col, 0.015));
    gl.addColorStop(0.8, rgba(col, 0.1 + f.depth * 0.1));
    gl.addColorStop(1, rgba(col, 0.42));
    c.strokeStyle = gl;
    c.lineWidth = (1 + f.depth * 3.4) * S * 2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(ex, ey);
    c.quadraticCurveTo((ex + f.x) / 2, (ey + f.y) / 2 + h * 0.06, f.x, f.y);
    c.stroke();
    // punta: disco de bokeh con borde definido (óptica real, no glow difuso)
    const coc = Math.abs(f.depth - focusD);            // círculo de confusión
    const rad = Math.min(h * 0.085, h * (0.008 + Math.pow(coc, 1.2) * 0.16));
    // conservación de energía: al desenfocarse, el punto se extiende y se apaga
    const eng = Math.pow((h * 0.011) / rad, 1.65);
    const gb = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
    gb.addColorStop(0, rgba(f.hot ? P.emberCore : [216, 238, 255], 0.92 * eng));
    gb.addColorStop(0.55, rgba(col, 0.6 * eng));
    gb.addColorStop(0.88, rgba(col, 0.5 * eng));
    gb.addColorStop(0.97, rgba(mix(col, P.bone, 0.4), 0.62 * eng));
    gb.addColorStop(1, rgba(col, 0));
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = gb;
    c.beginPath(); c.arc(f.x, f.y, rad, 0, TAU); c.fill();
    c.restore();
  }
  compositeDepth(ctx, bands.map((b) => ({ cv: b.cv, blur: b.blur, alpha: b.alpha })));

  haze(ctx, cx, cy, Math.max(w, h) * 0.4, [60, 105, 150], 0.09);
  haze(ctx, w * 0.26, h * 0.7, h * 0.22, P.ember, 0.06);
  motes(ctx, w, h, S, seed + 1, 70);
  develop(ctx.canvas, { bloom: { amount: 0.42, radius: 0.018 }, halation: 0.11, vignette: 0.74 });
}

/* =============================================================================
   9 · VELO — textura de transición
   ========================================================================== */
function sceneVeil(ctx, w, h, S, o = {}) {
  const seed = o.seed ?? 99;
  fillBase(ctx, w, h, [10, 13, 17], [6, 8, 11]);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const n = fbm(u * 7.5, v * 2.2, 5, seed, 2.2, 0.55);
      const streak = fbm(u * 22, v * 1.1, 3, seed + 7);
      const t = clamp(n * 0.75 + streak * 0.35 - 0.2, 0, 1);
      const warm = smoothstep(0.45, 1, u + v * 0.3) * 0.55;
      const col = mix(mix([12, 17, 22], P.steel, t * 0.7), P.ember, warm * t * 0.55);
      const i = (y * w + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, h, w, 0);
  g.addColorStop(0, rgba(P.void, 0));
  g.addColorStop(0.7, rgba([60, 95, 130], 0.12));
  g.addColorStop(1, rgba(P.ember, 0.1));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.restore();
  develop(ctx.canvas, { bloom: { amount: 0.18, radius: 0.025 }, halation: 0.05, vignette: 0.5, grain: 0.07 });
}

/* ---------- registro ------------------------------------------------------ */

const SCENES = {
  substrate: sceneSubstrate,
  topology: sceneTopology,
  flow: sceneFlow,
  layers: sceneLayers,
  surface: sceneSurface,
  ops: sceneOps,
  console: sceneConsole,
  fiber: sceneFiber,
  veil: sceneVeil,
};

window.renderScene = async function (name, w, h, opts = {}) {
  const { cv, ctx } = makeCanvas(w, h);
  const S = w / 2400;
  SCENES[name](ctx, w, h, S, opts);
  const blob = await new Promise((res) =>
    cv.toBlob(res, opts.type || 'image/webp', opts.quality ?? 0.82));
  const buf = await blob.arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH)
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
};
})();
