/* =============================================================================
   INVAR · campo del héroe
   -----------------------------------------------------------------------------
   Malla ligera de nodos conectados sobre la imagen de fondo. Existe para dar
   profundidad y una respuesta sutil al puntero; nada más. Se degrada solo:
   menos nodos en pantallas pequeñas, apagado con movimiento reducido y en
   equipos de pocos núcleos, y en pausa cuando el héroe sale del viewport.
   ========================================================================== */
window.INVAR = window.INVAR || {};

window.INVAR.field = function field(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;

  const coarse = matchMedia('(pointer: coarse)').matches;
  const weak = (navigator.hardwareConcurrency || 8) <= 4;

  let W = 0, H = 0, dpr = 1;
  let nodes = [];
  let raf = 0, running = false;
  let t = 0;
  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: false };

  /* --- construcción -------------------------------------------------- */
  function build() {
    const area = W * H;
    // densidad constante por área: la malla no se apelmaza en móvil
    const count = Math.round(Math.min(weak ? 30 : 58, Math.max(20, area / 32000)));
    nodes = Array.from({ length: count }, (_, i) => {
      const a = (i * 2.39996) % (Math.PI * 2);          // ángulo áureo: reparto uniforme
      const r = Math.sqrt((i + 0.5) / count);
      return {
        // posición base en coordenadas normalizadas, algo desplazada al tercio derecho
        bx: 0.5 + Math.cos(a) * r * 0.62 + 0.06,
        by: 0.5 + Math.sin(a) * r * 0.52,
        px: 0, py: 0,
        sp: 0.25 + ((i * 37) % 100) / 220,              // velocidad de deriva
        ph: (i * 1.7) % (Math.PI * 2),                  // fase
        amp: 0.012 + ((i * 13) % 100) / 5200,
        heat: ((i * 29) % 100) / 100 < 0.1 ? 1 : 0,     // ~10 % de nodos cálidos
      };
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1 : 1.5);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  /* --- dibujo ---------------------------------------------------------- */
  const LINK = Math.min(190, 0);   // se recalcula en draw a partir del tamaño

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const link = Math.min(210, Math.max(90, Math.hypot(W, H) * 0.11));

    // suavizado del puntero (inercia propia, independiente del scroll)
    pointer.x += (pointer.tx - pointer.x) * 0.055;
    pointer.y += (pointer.ty - pointer.y) * 0.055;
    const pxx = pointer.x * W, pyy = pointer.y * H;

    for (const n of nodes) {
      const drift = Math.sin(t * n.sp + n.ph);
      const drift2 = Math.cos(t * n.sp * 0.72 + n.ph * 1.4);
      // desplazamiento por puntero: atracción suave, siempre en transform lógico
      const dx = n.bx * W - pxx, dy = n.by * H - pyy;
      const d = Math.hypot(dx, dy) || 1;
      const pull = pointer.active ? Math.min(26, 2600 / d) : 0;
      n.px = n.bx * W + drift * n.amp * W - (dx / d) * pull;
      n.py = n.by * H + drift2 * n.amp * H - (dy / d) * pull;
    }

    // enlaces
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.px - b.px, dy = a.py - b.py;
        const d2 = dx * dx + dy * dy;
        if (d2 > link * link) continue;
        const k = 1 - Math.sqrt(d2) / link;
        const hot = a.heat || b.heat;
        ctx.strokeStyle = hot
          ? `rgba(255,110,64,${k * 0.2})`
          : `rgba(138,158,173,${k * 0.13})`;
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.stroke();
      }
    }

    // nodos
    for (const n of nodes) {
      const s = n.heat ? 3 : 2;
      ctx.fillStyle = n.heat ? 'rgba(255,138,99,.75)' : 'rgba(174,190,203,.42)';
      ctx.fillRect(n.px - s / 2, n.py - s / 2, s, s);
      if (n.heat) {
        const g = ctx.createRadialGradient(n.px, n.py, 0, n.px, n.py, 26);
        g.addColorStop(0, 'rgba(255,91,46,.20)');
        g.addColorStop(1, 'rgba(255,91,46,0)');
        ctx.fillStyle = g;
        ctx.fillRect(n.px - 26, n.py - 26, 52, 52);
      }
    }
  }

  function loop() {
    t += 0.0042;
    draw();
    raf = requestAnimationFrame(loop);
  }

  /* --- ciclo de vida --------------------------------------------------- */
  function start() { if (!running) { running = true; raf = requestAnimationFrame(loop); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function onPointer(e) {
    const r = canvas.getBoundingClientRect();
    pointer.tx = (e.clientX - r.left) / r.width;
    pointer.ty = (e.clientY - r.top) / r.height;
    pointer.active = true;
  }

  resize();
  draw();

  if (!coarse) window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('resize', resize);

  // solo consume CPU mientras se ve
  const io = new IntersectionObserver(
    ([entry]) => (entry.isIntersecting ? start() : stop()),
    { threshold: 0 }
  );
  io.observe(canvas);

  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : start();
  });

  return { resize, stop, start };
};
