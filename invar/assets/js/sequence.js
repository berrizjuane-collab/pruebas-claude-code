/* =============================================================================
   INVAR · secuencia narrativa
   -----------------------------------------------------------------------------
   El scroll no mueve cosas: adelanta un reloj. La posición dentro de la sección
   es el tiempo del incidente, y de ese tiempo se derivan tres frentes:

     · frente de compromiso  → avanza por el grafo desde el nodo de entrada
     · frente de detección   → aparece cuando la correlación dispara
     · frente de contención  → corta las aristas que cruzan el límite y enfría

   El grafo son cuatro anillos concéntricos (perímetro, identidad, estaciones,
   núcleo). El adversario entra por fuera. Nunca llega al núcleo: ese es el
   argumento de la sección, y la simulación tiene que sostenerlo sola.
   ========================================================================== */
window.INVAR = window.INVAR || {};

window.INVAR.sequence = function sequence(canvas, opts) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const onPhase = (opts && opts.onPhase) || function () {};
  const still = !!(opts && opts.still);          // versión estática (sin animar)

  /* --- utilidades ------------------------------------------------------ */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const TAU = Math.PI * 2;

  /* --- guion ------------------------------------------------------------ */
  const BEATS = [
    { at: 0.00, t: 0,    name: 'Acceso inicial' },
    { at: 0.14, t: 47,   name: 'Reconocimiento' },
    { at: 0.32, t: 130,  name: 'Movimiento lateral' },
    { at: 0.50, t: 252,  name: 'Detección' },
    { at: 0.66, t: 690,  name: 'Contención' },
    { at: 0.85, t: 1084, name: 'Verificación' },
  ];

  /* --- grafo ------------------------------------------------------------ */
  const RINGS = [
    { n: 18, r: 1.00 },   // perímetro: VPN, correo, expuestos
    { n: 14, r: 0.72 },   // identidad y servicios
    { n: 10, r: 0.46 },   // estaciones y servidores
    { n: 5,  r: 0.19 },   // núcleo: datos y proceso
  ];
  const nodes = [];
  const edges = [];

  RINGS.forEach((ring, ri) => {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * TAU - Math.PI / 2 + ri * 0.22;
      nodes.push({ ring: ri, a, r: ring.r, i: nodes.length, order: Infinity, nb: [] });
    }
  });
  const idxOf = (ri, i) => RINGS.slice(0, ri).reduce((s, r) => s + r.n, 0) + i;

  function connect(a, b) {
    if (a === b) return;
    if (edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) return;
    edges.push({ a, b });
    nodes[a].nb.push(b);
    nodes[b].nb.push(a);
  }
  // vecinos dentro del anillo (con algún hueco: ningún anillo es un bus perfecto)
  RINGS.forEach((ring, ri) => {
    for (let i = 0; i < ring.n; i++) {
      if ((i * 7 + ri * 3) % 11 === 0) continue;
      connect(idxOf(ri, i), idxOf(ri, (i + 1) % ring.n));
    }
  });
  // enlaces hacia el anillo interior: cada nodo cuelga del más próximo en ángulo
  RINGS.forEach((ring, ri) => {
    if (ri === RINGS.length - 1) return;
    const inner = RINGS[ri + 1];
    for (let i = 0; i < ring.n; i++) {
      const a = nodes[idxOf(ri, i)];
      let best = 0, bd = Infinity;
      for (let j = 0; j < inner.n; j++) {
        const b = nodes[idxOf(ri + 1, j)];
        let d = Math.abs(((a.a - b.a + Math.PI * 3) % TAU) - Math.PI);
        if (d < bd) { bd = d; best = j; }
      }
      if ((i * 5 + ri) % 3 !== 2) connect(a.i, idxOf(ri + 1, best));
    }
  });

  // recorrido en anchura desde el nodo de entrada: define el orden de caída
  const ENTRY = idxOf(0, 11);
  nodes[ENTRY].order = 0;
  const queue = [ENTRY];
  while (queue.length) {
    const cur = nodes[queue.shift()];
    for (const nb of cur.nb) {
      if (nodes[nb].order === Infinity) { nodes[nb].order = cur.order + 1; queue.push(nb); }
    }
  }
  const MAXORD = nodes.reduce((m, n) => Math.max(m, n.order === Infinity ? 0 : n.order), 0);
  // el núcleo queda deliberadamente fuera del alcance del frente
  nodes.forEach((n) => { if (n.ring === 3) n.order = MAXORD + 4; });
  /* El compromiso no llega a todas partes: se detiene en un sector. Si toda la
     red arde, la contención no significa nada y la imagen pierde el frío. */
  const REACH = Math.max(2, Math.round(MAXORD * 0.45));

  /* --- estado ----------------------------------------------------------- */
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0;
  let progress = 0, pulse = 0, raf = 0;
  let lastBeat = -1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // en la versión estática el grafo se centra: no hay relato que esquivar
    const wide = W >= 1080 && !still;
    const narrow = W < 1080;   // mismo umbral que la maqueta: grafo arriba
    cx = W * (wide ? 0.64 : 0.5);
    cy = H * (wide || still ? 0.5 : narrow ? 0.29 : 0.42);
    R = Math.min(W * (wide ? 0.3 : narrow ? 0.4 : 0.34), H * (narrow && !still ? 0.24 : 0.4));
  }

  const pos = (n) => ({ x: cx + Math.cos(n.a) * n.r * R, y: cy + Math.sin(n.a) * n.r * R });

  /* El resplandor de un nodo caliente se dibuja miles de veces por segundo:
     se rasteriza una sola vez y después solo se copia (drawImage es barato,
     createRadialGradient por fotograma no lo es). */
  const GLOW = (() => {
    const c = document.createElement('canvas');
    const r = 64;
    c.width = c.height = r * 2;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,91,46,1)');
    grad.addColorStop(0.35, 'rgba(255,91,46,.42)');
    grad.addColorStop(1, 'rgba(255,91,46,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, r * 2, r * 2);
    return c;
  })();

  /* --- resolución del estado en función del progreso -------------------- */
  function state(p) {
    // frente de compromiso: se detiene en cuanto entra la contención
    const spread = easeInOut(clamp(p / 0.50, 0, 1));
    const front = spread * (REACH + 0.6);
    const detect = smooth(0.50, 0.60, p);
    const contain = smooth(0.66, 0.82, p);
    const coolFront = (1 - smooth(0.70, 0.99, p)) * (REACH + 1.2);
    return { front, detect, contain, coolFront };
  }

  function nodeHeat(n, s) {
    if (n.order > REACH) return 0;                        // fuera de alcance
    const hot = smooth(n.order - 0.9, n.order + 0.15, s.front);
    const cooled = smooth(s.coolFront, s.coolFront + 1.1, n.order);
    // el paciente cero se queda en cuarentena hasta el final
    const keep = n.order === 0 ? 0.55 : 0;
    return Math.max(hot * (1 - cooled), hot * keep);
  }

  /* --- dibujo ----------------------------------------------------------- */
  function draw() {
    const s = state(progress);
    ctx.clearRect(0, 0, W, H);

    /* anillos guía: instrumento, no decoración */
    ctx.lineWidth = 1;
    for (const ring of RINGS) {
      ctx.strokeStyle = 'rgba(255,255,255,.045)';
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r * R, 0, TAU);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.03)';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 0.19, cy + Math.sin(a) * R * 0.19);
      ctx.lineTo(cx + Math.cos(a) * R * 1.06, cy + Math.sin(a) * R * 1.06);
      ctx.stroke();
    }

    /* barrido de detección */
    if (s.detect > 0.02 && s.contain < 0.9) {
      const a = pulse * 0.9;
      const g = ctx.createConicGradient
        ? ctx.createConicGradient(a, cx, cy)
        : null;
      ctx.save();
      ctx.globalAlpha = s.detect * (1 - s.contain) * 0.5;
      if (g) {
        g.addColorStop(0, 'rgba(138,158,173,.16)');
        g.addColorStop(0.08, 'rgba(138,158,173,0)');
        g.addColorStop(1, 'rgba(138,158,173,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.06, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(174,190,203,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R * 1.06, cy + Math.sin(a) * R * 1.06);
      ctx.stroke();
      ctx.restore();
    }

    /* aristas */
    for (const e of edges) {
      const A = nodes[e.a], B = nodes[e.b];
      const pa = pos(A), pb = pos(B);
      const ha = nodeHeat(A, s), hb = nodeHeat(B, s);
      const hot = Math.min(ha, hb);
      const boundary = Math.abs(ha - hb) > 0.4;           // arista de frontera
      const cut = boundary ? s.contain : 0;

      ctx.lineWidth = hot > 0.3 ? 1.6 : 1;
      ctx.strokeStyle = hot > 0.3
        ? `rgba(255,91,46,${0.12 + hot * 0.38})`
        : `rgba(70,89,106,${0.42 - cut * 0.28})`;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();

      // marca de corte: la segmentación aplicada, visible
      if (cut > 0.05) {
        const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const d = Math.hypot(dx, dy) || 1;
        const nx = -dy / d * 5 * cut, ny = dx / d * 5 * cut;
        ctx.strokeStyle = `rgba(255,91,46,${cut * 0.9})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(mx - nx, my - ny);
        ctx.lineTo(mx + nx, my + ny);
        ctx.stroke();
      }
    }

    /* nodos */
    for (const n of nodes) {
      const p = pos(n);
      const heat = nodeHeat(n, s);
      const watched = s.detect * (heat > 0.25 ? 1 : 0);
      const size = n.ring === 3 ? 7 : n.ring === 0 ? 4.5 : 5.5;

      if (heat > 0.05) {
        const gr = size * 4.6;
        ctx.globalAlpha = 0.24 * heat;
        ctx.drawImage(GLOW, p.x - gr, p.y - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
      }

      const cold = n.ring === 3 ? 'rgba(174,190,203,.85)' : 'rgba(122,141,156,.62)';
      ctx.fillStyle = heat > 0.05
        ? `rgba(${255},${Math.round(91 + 90 * (1 - heat))},${Math.round(46 + 90 * (1 - heat))},${0.55 + heat * 0.45})`
        : cold;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);

      // anillo de vigilancia sobre lo comprometido
      if (watched > 0.05) {
        ctx.strokeStyle = `rgba(226,230,233,${watched * 0.5})`;
        ctx.lineWidth = 1;
        const rr = size * (1.9 + Math.sin(pulse * 2 + n.i) * 0.12);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, TAU);
        ctx.stroke();
      }

      // nodo de entrada: marcado desde el primer fotograma
      if (n.i === ENTRY) {
        ctx.strokeStyle = `rgba(255,91,46,${0.35 + Math.sin(pulse * 1.6) * 0.2})`;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(p.x - size * 2, p.y - size * 2, size * 4, size * 4);
      }
    }

    /* núcleo: el objetivo que no se alcanza */
    ctx.strokeStyle = `rgba(226,230,233,${0.1 + s.contain * 0.16})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.28, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    /* perímetro de contención: se cierra en la fase de corte */
    if (s.contain > 0.02) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,91,46,${0.28 * s.contain})`;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -pulse * 12;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.6, -Math.PI * 0.15, -Math.PI * 0.15 + TAU * s.contain);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* --- ciclo ------------------------------------------------------------ */
  function frame() {
    pulse += 0.016;
    draw();
    raf = requestAnimationFrame(frame);
  }

  function setProgress(p) {
    progress = clamp(p, 0, 1);
    let bi = 0;
    for (let i = 0; i < BEATS.length; i++) if (progress >= BEATS[i].at) bi = i;
    const cur = BEATS[bi];
    const next = BEATS[bi + 1];
    const local = next ? clamp((progress - cur.at) / (next.at - cur.at), 0, 1) : 1;
    const secs = Math.round(cur.t + (next ? (next.t - cur.t) * local : 0));
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    onPhase(bi, `t+${mm}:${ss}`, cur.name, bi !== lastBeat);
    lastBeat = bi;
    if (still) draw();
  }

  resize();
  setProgress(0);
  draw();
  window.addEventListener('resize', () => { resize(); draw(); });

  if (!still) {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { if (!raf) raf = requestAnimationFrame(frame); }
      else { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0 });
    io.observe(canvas);
  }

  return { setProgress, resize, draw };
};
