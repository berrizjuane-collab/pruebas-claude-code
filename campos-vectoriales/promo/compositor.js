/**
 * Compositor del vídeo promocional (1920 × 1080, 30 fps, 20 s). `window.preparar()` carga los
 * metadatos de las tomas, las fuentes y crea los textos; `window.render(f)` dibuja el fotograma f
 * de forma determinista (la intro y el cierre simulan sus partículas en orden: si se pide un
 * fotograma anterior al último, se vuelve a simular desde el principio).
 *
 * Montaje (compás de 2 s a 120 BPM, los cortes caen en los tiempos):
 *   0–4      partículas en un campo de flujo, «Cada punto del espacio / tiene una dirección.»,
 *            la estela se congela en una rejilla de flechas y la cámara se lanza dentro
 *   4–8      laboratorio real (helicoidal) con su interfaz; smash zoom a la escena en 6 s
 *   8–12     whip pan; F(x, y, z, t): lluvia con ráfagas desde dentro y el reloj t
 *   12–14    «Entra en el campo.»: vuelo cabalgando una hélice
 *   14–15.75 cortes al tiempo: silla giratoria, viento giratorio, rotacional, divergencia
 *   15.75–16 silencio: un punto
 *   16–20    estallido radial (una fuente) y cierre con la marca
 */
(() => {
  const FPS = 30;
  const W = 1920;
  const H = 1080;
  const $ = (id) => document.getElementById(id);
  const ctxToma = $('toma').getContext('2d');
  const ctxFondo = $('fondo').getContext('2d');
  const ctxGrano = $('grano').getContext('2d');
  const estelas = document.createElement('canvas');
  estelas.width = W;
  estelas.height = H;
  const ctxEstelas = estelas.getContext('2d');

  // ------------------------------------------------------------ curvas
  const cl = (x) => Math.max(0, Math.min(1, x));
  const rango = (t, a, b) => cl((t - a) / (b - a));
  const salida = (x) => 1 - (1 - x) ** 3;
  const entrada = (x) => x ** 3;
  const expo = (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));
  const mezcla = (a, b, x) => a + (b - a) * x;

  function azar(semilla) {
    let s = semilla >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------ metraje
  const META = {};
  const TOMAS = ['helice-ui', 'lluvia', 'vuelo', 'silla', 'viento', 'rotacional-ui', 'radial'];
  const cache = new Map();
  const vacia = document.createElement('canvas');
  async function imagen(toma, i) {
    const n = META[toma].fotogramas;
    if (!n) return vacia;
    const k = Math.max(0, Math.min(n - 1, Math.round(i)));
    const clave = `${toma}/${k}`;
    if (cache.has(clave)) return cache.get(clave);
    const img = new Image();
    img.src = `/tomas/${toma}/${String(k).padStart(4, '0')}.jpg`;
    await img.decode();
    cache.set(clave, img);
    if (cache.size > 16) cache.delete(cache.keys().next().value);
    return img;
  }

  /** Dibuja un fotograma: (cx, cy) de la toma va al centro, escala s; desenfoque radial y barrido. */
  function pintarToma(img, o = {}) {
    const { s = 1, cx = W / 2, cy = H / 2, dx = 0, dy = 0, alfa = 1, radial = 0, barrido = 0, brillo = 1 } = o;
    const c = ctxToma;
    c.save();
    c.filter = `contrast(1.12) brightness(${brillo})`;
    const capa = (e, ox, a) => {
      c.globalAlpha = alfa * a;
      c.setTransform(e, 0, 0, e, W / 2 + dx + ox - cx * e, H / 2 + dy - cy * e);
      c.drawImage(img, 0, 0);
    };
    capa(s, 0, 1);
    if (radial > 0.01) for (let k = 1; k <= 5; k++) capa(s * (1 + radial * k * 0.03), 0, 0.2);
    if (Math.abs(barrido) > 1) for (let k = 1; k <= 7; k++) capa(s, (barrido * k) / 7, 0.18);
    c.restore();
  }

  // ------------------------------------------------------------ campo de la intro (2D, en pantalla)
  function campoIntro(x, y, t) {
    const u = (x - W / 2) / 540;
    const v = (y - H / 2) / 540;
    const silla = 0.55 * Math.sin(t * 0.9 + 0.6);
    const fx = -v * 1.05 + u * 0.22 + silla * u + 0.38 * Math.sin(2.1 * v + t * 1.1);
    const fy = u * 1.05 + v * 0.22 - silla * v + 0.38 * Math.cos(1.9 * u - t * 0.8);
    return [fx, fy];
  }

  const PI2 = Math.PI * 2;
  let simulado = -1;
  let particulas = [];
  let estallido = [];

  function reiniciar() {
    const r = azar(7);
    // Una onda desde el centro: cada punto «recibe su dirección» cuando la onda lo alcanza.
    particulas = Array.from({ length: 3200 }, () => {
      const x = r() * W;
      const y = r() * H;
      const d = Math.hypot(x - W / 2, y - H / 2);
      return { x, y, nace: 0.3 + (d / 1100) * 1.7 + r() * 0.12, vida: 0, r };
    });
    const q = azar(11);
    estallido = Array.from({ length: 2200 }, () => {
      const a = q() * PI2;
      const v = 380 + q() ** 0.6 * 1500;
      return { x: W / 2, y: H / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, giro: (q() - 0.5) * 0.9 };
    });
    ctxEstelas.fillStyle = '#050505';
    ctxEstelas.fillRect(0, 0, W, H);
  }

  /** Un paso de la simulación de la intro (estelas en `estelas`). */
  function pasoIntro(t) {
    const dt = 1 / FPS;
    ctxEstelas.globalCompositeOperation = 'source-over';
    ctxEstelas.fillStyle = 'rgba(5,5,5,0.085)';
    ctxEstelas.fillRect(0, 0, W, H);
    ctxEstelas.lineWidth = 1.15;
    ctxEstelas.lineCap = 'round';
    for (const p of particulas) {
      if (t < p.nace) continue;
      p.vida += dt;
      const sub = 2;
      const x0 = p.x;
      const y0 = p.y;
      // Rapidez mínima: cerca del centro el campo es débil y las partículas se quedarían quietas.
      const vel = (x, y) => {
        const [fx, fy] = campoIntro(x, y, t);
        const m = Math.hypot(fx, fy) || 1;
        const v = 300 * (0.35 + 0.65 * Math.tanh(m));
        return [(fx / m) * v, (fy / m) * v];
      };
      for (let k = 0; k < sub; k++) {
        const h = dt / sub;
        const [ax, ay] = vel(p.x, p.y);
        const [bx, by] = vel(p.x + (ax * h) / 2, p.y + (ay * h) / 2);
        p.x += bx * h;
        p.y += by * h;
      }
      const m = Math.hypot(p.x - x0, p.y - y0);
      const alfa = Math.min(1, p.vida / 0.5) * Math.min(0.85, 0.25 + m / 14);
      ctxEstelas.strokeStyle = `rgba(245,245,245,${alfa.toFixed(3)})`;
      ctxEstelas.beginPath();
      ctxEstelas.moveTo(x0, y0);
      ctxEstelas.lineTo(p.x, p.y);
      ctxEstelas.stroke();
      // Las que salen o envejecen renacen dentro del disco: el campo llena la pantalla.
      if (p.vida > 1.6 + p.r() * 1.2 || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) {
        p.x = p.r() * W;
        p.y = p.r() * H;
        p.vida = 0;
      }
    }
  }

  function pasoEstallido(t) {
    const dt = 1 / FPS;
    const x = t - 16;
    ctxEstelas.fillStyle = `rgba(5,5,5,${x < 0.6 ? 0.16 : 0.1})`;
    ctxEstelas.fillRect(0, 0, W, H);
    ctxEstelas.lineWidth = 1.2;
    const freno = Math.exp(-x / 0.55);
    for (const p of estallido) {
      const x0 = p.x;
      const y0 = p.y;
      // Campo radial (div > 0) con un leve giro: cada partícula sale de la fuente.
      const ang = Math.atan2(p.vy, p.vx) + p.giro * dt;
      const v = Math.hypot(p.vx, p.vy) * (0.93 + 0.07 * freno);
      p.vx = Math.cos(ang) * v;
      p.vy = Math.sin(ang) * v;
      p.x += p.vx * dt * (0.25 + freno);
      p.y += p.vy * dt * (0.25 + freno);
      const alfa = 0.15 + 0.6 * freno;
      ctxEstelas.strokeStyle = `rgba(245,245,245,${alfa.toFixed(3)})`;
      ctxEstelas.beginPath();
      ctxEstelas.moveTo(x0, y0);
      ctxEstelas.lineTo(p.x, p.y);
      ctxEstelas.stroke();
    }
  }

  /** Flecha fina (varilla + punta de aguja), como las del laboratorio. */
  function flecha(c, x, y, ang, largo, alfa) {
    if (largo < 2 || alfa <= 0.01) return;
    const cx = Math.cos(ang);
    const sy = Math.sin(ang);
    const x0 = x - (cx * largo) / 2;
    const y0 = y - (sy * largo) / 2;
    const x1 = x + (cx * largo) / 2;
    const y1 = y + (sy * largo) / 2;
    const punta = largo * 0.34;
    const ancho = largo * 0.085;
    c.globalAlpha = alfa;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1 - cx * punta * 0.9, y1 - sy * punta * 0.9);
    c.stroke();
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x1 - cx * punta - sy * ancho, y1 - sy * punta + cx * ancho);
    c.lineTo(x1 - cx * punta + sy * ancho, y1 - sy * punta - cx * ancho);
    c.closePath();
    c.fill();
  }

  /** Rejilla de flechas del campo de la intro, que aparece en onda desde el centro. */
  function rejilla(c, t, aparicion, alfaMax, campo = campoIntro) {
    c.fillStyle = '#f5f5f5';
    c.strokeStyle = '#f5f5f5';
    c.lineWidth = 1.6;
    const paso = 62;
    for (let gy = -1; gy <= H / paso + 1; gy++) {
      for (let gx = -1; gx <= W / paso + 1; gx++) {
        const x = gx * paso + (gy % 2 ? paso / 2 : 0);
        const y = gy * paso + 18;
        const d = Math.hypot(x - W / 2, y - H / 2);
        const p = expo(rango(t, aparicion + d / 2200, aparicion + d / 2200 + 0.35));
        if (p <= 0) continue;
        const [fx, fy] = campo(x, y, t);
        const m = Math.hypot(fx, fy);
        const gris = 0.45 + 0.55 * Math.min(1, m / 1.6);
        flecha(c, x, y, Math.atan2(fy, fx), Math.min(46, 12 + m * 20) * p, alfaMax * p * gris);
      }
    }
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------ grano
  const grano = ctxGrano.createImageData(960, 540);
  /** Grano de película renovado cada dos fotogramas (como un 16 mm a 15 fps: orgánico y comprimible). */
  function pintarGrano(f) {
    const r = azar(1000 + Math.floor(f / 2));
    const d = grano.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (r() * 255) | 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctxGrano.putImageData(grano, 0, 0);
  }

  // ------------------------------------------------------------ textos
  const capa = $('textos');
  const T = {};
  function texto(id, html, estilo) {
    const el = document.createElement('div');
    el.className = `t ${estilo.clase ?? ''}`;
    el.innerHTML = html;
    Object.assign(el.style, estilo.css ?? {});
    capa.appendChild(el);
    T[id] = el;
    return el;
  }
  const palabras = (s, extra = '') =>
    s
      .split(' ')
      .map((p) => `<span class="mascara"><span class="palabra"${extra}>${p}</span></span>`)
      .join(' ');

  function crearTextos() {
    const centro = { left: '0', width: '1920px', textAlign: 'center' };
    texto('intro1', palabras('Cada punto del espacio'), { clase: 'sombra', css: { ...centro, top: '388px', fontSize: '84px', fontWeight: '300', letterSpacing: '-0.025em' } });
    texto('intro2', `${palabras('tiene una')} <span class="mascara"><span class="palabra" style="font-weight:700">dirección.</span></span>`, {
      clase: 'sombra',
      css: { ...centro, top: '500px', fontSize: '84px', fontWeight: '300', letterSpacing: '-0.025em' },
    });
    texto('ui-etiqueta', 'Laboratorio de campos vectoriales 3D', { clase: 'etiqueta', css: { left: '112px', top: '820px' } });
    texto('ui-titulo', palabras('Explora el espacio.'), { css: { left: '104px', top: '856px', fontSize: '104px', fontWeight: '700', letterSpacing: '-0.035em' } });
    const golpe = { left: '120px', top: '360px', fontSize: '150px', fontWeight: '800', letterSpacing: '-0.045em', transformOrigin: 'left center' };
    ['Flechas.', 'Corriente.', 'Partículas.', 'En 3D.'].forEach((p, i) => texto(`golpe${i}`, p, { clase: 'sombra', css: golpe }));
    texto('formula-helice', '<b>F</b> = (−<i>y</i>, <i>x</i>, <i>a</i>)', { clase: 'mat sombra', css: { left: '128px', top: '560px', fontSize: '54px', color: '#c9c9c9' } });
    texto('mat-t', '<b>F</b>(<i>x</i>, <i>y</i>, <i>z</i><span id="coma-t">, <i class="brillo">t</i></span>)', {
      clase: 'mat sombra',
      css: { left: '120px', top: '330px', fontSize: '176px', transformOrigin: 'left center' },
    });
    texto('lluvia-1', 'El campo cambia con el tiempo.', { clase: 'sombra', css: { left: '124px', top: '402px', fontSize: '84px', fontWeight: '700', letterSpacing: '-0.035em' } });
    texto('lluvia-2', 'Cada gota sigue <span class="mat"><span class="punto"><b>r</b></span> = <b>F</b>(<b>r</b>, <i>t</i>)</span>', {
      clase: 'sombra',
      css: { left: '128px', top: '520px', fontSize: '58px', fontWeight: '300', color: '#e6e6e6' },
    });
    texto('reloj', '<span class="etiqueta" style="font-size:16px">Tiempo</span><br><span id="reloj-valor" style="font-family:var(--mono);font-size:44px;font-weight:500">t = 0.000</span>', {
      clase: 'sombra',
      css: { right: '110px', top: '890px', textAlign: 'right', lineHeight: '1.5' },
    });
    texto('vuelo', 'Entra en el campo.', { clase: 'brillo', css: { ...centro, top: '430px', fontSize: '164px', fontWeight: '800', letterSpacing: '-0.045em' } });
    texto('vuelo-etiqueta', 'Vista libre · W A S D · dilata el espacio', { clase: 'etiqueta sombra', css: { ...centro, top: '640px' } });
    const corte = { left: '112px', top: '846px', fontSize: '96px', fontWeight: '800', letterSpacing: '-0.04em', transformOrigin: 'left center' };
    const sub = { left: '118px', top: '808px' };
    [
      ['Silla giratoria', 'ω &gt; k · partículas atrapadas'],
      ['Viento giratorio', 'corriente <span class="mat" style="letter-spacing:0">≠</span> trayectoria'],
      ['Rotacional', 'rueda de paletas · ω = ½ <span class="mat" style="letter-spacing:0">‖∇×<b>F</b>‖</span>'],
      ['Divergencia', '<span class="mat" style="letter-spacing:0">∇·<b>F</b> &gt; 0</span> · una fuente'],
    ].forEach(([a, b], i) => {
      texto(`corte${i}`, a, { clase: 'sombra', css: corte });
      texto(`corte-sub${i}`, b, { clase: 'etiqueta sombra', css: sub });
    });
    texto(
      'logo',
      `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" stroke="#f5f5f5" stroke-linecap="round" stroke-linejoin="round">
        <rect id="logo-marco" x="6" y="6" width="116" height="116" rx="26" stroke-width="6" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
        <path id="logo-vara" d="M36 92 L88 40" stroke-width="7" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
        <path id="logo-punta" d="M62 40 L88 40 L88 66" stroke-width="7" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
      </svg>`,
      { css: { left: '544px', top: '398px' } },
    );
    texto('marca', 'Campos', { css: { left: '708px', top: '366px', fontSize: '176px', fontWeight: '700', letterSpacing: '-0.045em' } });
    texto('lema', 'Laboratorio de campos vectoriales 3D', { css: { ...centro, top: '600px', fontSize: '44px', fontWeight: '400', color: '#c9c9c9', letterSpacing: '-0.01em' } });
    texto('rasgos', 'Campos que cambian con el tiempo &nbsp;·&nbsp; Vista libre &nbsp;·&nbsp; Un solo archivo HTML', { clase: 'etiqueta', css: { ...centro, top: '690px', fontSize: '19px', color: '#a3a3a3' } });
    texto('version', 'v1.1', {
      css: { ...centro, top: '760px', fontFamily: 'var(--mono)', fontSize: '22px', fontWeight: '500', color: '#c9c9c9' },
    });
  }

  function fijar(el, { o = 1, x = 0, y = 0, s = 1, blur = 0, ls = null } = {}) {
    el.style.opacity = String(o);
    el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(4)})`;
    el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
    if (ls !== null) el.style.letterSpacing = ls;
  }
  const ocultar = (el) => (el.style.opacity = '0');

  /** Palabras que suben desde su máscara, escalonadas. */
  function revelar(el, t, t0, escalon = 0.13, dur = 0.55) {
    el.querySelectorAll('.palabra').forEach((p, i) => {
      const k = expo(rango(t, t0 + i * escalon, t0 + i * escalon + dur));
      p.style.transform = `translateY(${((1 - k) * 115).toFixed(2)}%)`;
    });
  }

  // ------------------------------------------------------------ fotograma
  async function render(f) {
    const t = f / FPS;
    if (f <= simulado) {
      reiniciar();
      simulado = -1;
    }
    for (let k = simulado + 1; k <= f; k++) {
      const tk = k / FPS;
      if (tk < 4.05) pasoIntro(tk);
      else if (tk >= 16) {
        // El estallido empieza sobre negro: fuera las estelas de la intro.
        if (k === 16 * FPS) {
          ctxEstelas.fillStyle = '#050505';
          ctxEstelas.fillRect(0, 0, W, H);
        }
        pasoEstallido(tk);
      }
    }
    simulado = f;

    ctxToma.setTransform(1, 0, 0, 1, 0, 0);
    ctxToma.fillStyle = '#050505';
    ctxToma.fillRect(0, 0, W, H);
    ctxFondo.setTransform(1, 0, 0, 1, 0, 0);
    ctxFondo.clearRect(0, 0, W, H);
    for (const el of Object.values(T)) ocultar(el);
    $('banda').style.opacity = '0';
    let flash = 0;

    // ---------------- 0–4: intro procedural
    if (t < 4.05) {
      const z = 1 + 9 * entrada(rango(t, 3.5, 4.0));
      ctxFondo.save();
      ctxFondo.setTransform(z, 0, 0, z, (W / 2) * (1 - z), (H / 2) * (1 - z));
      ctxFondo.globalAlpha = 1 - 0.75 * rango(t, 2.9, 3.6);
      ctxFondo.drawImage(estelas, 0, 0);
      ctxFondo.globalAlpha = 1;
      rejilla(ctxFondo, t, 2.75, 0.95);
      ctxFondo.restore();
      // Punto de luz inicial.
      const g = rango(t, 0.05, 0.35) * (1 - rango(t, 1.2, 2.0));
      if (g > 0) {
        const grad = ctxFondo.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 90);
        grad.addColorStop(0, `rgba(255,255,255,${0.9 * g})`);
        grad.addColorStop(0.08, `rgba(255,255,255,${0.5 * g})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctxFondo.fillStyle = grad;
        ctxFondo.fillRect(0, 0, W, H);
      }
      const fuera = rango(t, 3.25, 3.6);
      if (t > 0.5 && t < 3.6) {
        fijar(T.intro1, { o: 1 - fuera, y: -30 * entrada(fuera), blur: 14 * fuera });
        fijar(T.intro2, { o: 1 - fuera, y: -30 * entrada(fuera), blur: 14 * fuera });
        revelar(T.intro1, t, 0.55);
        revelar(T.intro2, t, 1.55, 0.16);
      }
      flash = Math.max(flash, entrada(rango(t, 3.9, 4.0)));
    }

    // ---------------- 4–8: laboratorio real (helicoidal)
    if (t >= 4 && t < 8) {
      const i = (t - 4) * FPS;
      const img = await imagen('helice-ui', i);
      if (t < 6) {
        const e = salida(rango(t, 4, 4.55));
        pintarToma(img, { s: mezcla(1.22, 1.0, e) + 0.03 * rango(t, 4.55, 6), radial: 1.2 * (1 - e) });
        const a = rango(t, 4.15, 4.4) * (1 - rango(t, 5.78, 5.95));
        $('banda').style.opacity = String(a);
        fijar(T['ui-etiqueta'], { o: a, x: -20 * (1 - salida(rango(t, 4.15, 4.6))) });
        fijar(T['ui-titulo'], { o: 1 - rango(t, 5.78, 5.95), y: -14 * rango(t, 5.78, 5.95) });
        revelar(T['ui-titulo'], t, 4.22, 0.12);
      } else {
        // Smash zoom a la escena, en el tiempo.
        const e = expo(rango(t, 6, 6.14));
        const salidaWhip = rango(t, 7.8, 8) ** 2;
        pintarToma(img, {
          s: mezcla(1.03, 1.72, e) + 0.12 * rango(t, 6.14, 8),
          cx: mezcla(960, 1185, e),
          cy: mezcla(540, 580, e),
          radial: 0.9 * (1 - e),
          dx: -1150 * salidaWhip,
          barrido: -260 * salidaWhip,
          brillo: 0.92,
        });
        const k = Math.min(3, Math.floor((t - 6) / 0.5));
        const t0 = 6 + 0.5 * k;
        const ent = expo(rango(t, t0, t0 + 0.16));
        const sal = rango(t, t0 + 0.44, t0 + 0.5);
        fijar(T[`golpe${k}`], { o: ent * (1 - sal), y: 70 * (1 - ent), blur: 12 * (1 - ent) + 8 * sal, s: 1 + 0.04 * rango(t, t0, t0 + 0.5) });
        const fo = rango(t, 6.2, 6.5) * (1 - rango(t, 7.8, 7.92));
        fijar(T['formula-helice'], { o: fo, x: -16 * (1 - salida(rango(t, 6.2, 6.6))) });
        flash = Math.max(flash, 0.32 * (1 - rango(t, 6, 6.12)));
      }
    }

    // ---------------- 8–12: tiempo (lluvia con ráfagas)
    if (t >= 8 && t < 12) {
      const i = 4 + (t - 8) * FPS;
      const img = await imagen('lluvia', i);
      const entra = salida(rango(t, 8, 8.16));
      const textoOscuro = rango(t, 8.05, 8.3) * (1 - rango(t, 11.7, 11.9));
      pintarToma(img, { s: 1.0 + 0.07 * rango(t, 8, 12), dx: 1150 * (1 - entra), barrido: 260 * (1 - entra), brillo: 1 - 0.18 * textoOscuro });
      flash = Math.max(flash, 0.28 * (1 - rango(t, 8, 8.1)));
      $('banda').style.opacity = String(0.85 * textoOscuro);
      // F(x, y, z) y, en el tiempo siguiente, «, t».
      if (t < 10) {
        const a = expo(rango(t, 8.08, 8.4));
        const sal = rango(t, 9.75, 9.95);
        fijar(T['mat-t'], { o: a * (1 - sal), x: -30 * (1 - a), blur: 10 * sal, s: 1 + 0.02 * rango(t, 8.5, 9.9) });
        const c = expo(rango(t, 8.5, 8.7));
        const coma = $('coma-t');
        coma.style.opacity = String(c);
        coma.style.display = 'inline-block';
        coma.style.transform = `translateY(${(-40 * (1 - c)).toFixed(1)}px) scale(${(1.6 - 0.6 * c).toFixed(3)})`;
        flash = Math.max(flash, 0.18 * (1 - rango(t, 8.5, 8.62)));
      } else {
        const a = expo(rango(t, 10, 10.35));
        const b = expo(rango(t, 10.4, 10.75));
        const sal = rango(t, 11.72, 11.92);
        fijar(T['lluvia-1'], { o: a * (1 - sal), y: 40 * (1 - a), blur: 8 * (1 - a) + 10 * sal });
        fijar(T['lluvia-2'], { o: b * (1 - sal), y: 30 * (1 - b), blur: 8 * (1 - b) + 10 * sal });
      }
      const tReloj = META.lluvia.t[Math.max(0, Math.min(META.lluvia.t.length - 1, Math.round(i)))];
      $('reloj-valor').textContent = `t = ${tReloj.toFixed(3)}`;
      fijar(T.reloj, { o: rango(t, 8.3, 8.6) * (1 - rango(t, 11.75, 11.95)) });
      flash = Math.max(flash, 0.85 * entrada(rango(t, 11.9, 12)));
    }

    // ---------------- 12–14: vuelo
    if (t >= 12 && t < 14) {
      const u = rango(t, 12, 14);
      const i = 79 * (0.45 * u + 0.55 * u * u);
      const img = await imagen('vuelo', i);
      pintarToma(img, { s: 1.04 + 0.1 * u, radial: 0.15 + 1.4 * entrada(rango(t, 13.4, 14)) });
      flash = Math.max(flash, 0.85 * (1 - salida(rango(t, 12, 12.3))));
      const a = expo(rango(t, 12.12, 12.5));
      const vuela = entrada(rango(t, 13.2, 13.95));
      fijar(T.vuelo, { o: a * (1 - vuela), s: mezcla(0.86, 1, a) + 2.4 * vuela, blur: 10 * (1 - a) + 18 * vuela });
      const b = rango(t, 12.4, 12.7) * (1 - rango(t, 13.1, 13.3));
      fijar(T['vuelo-etiqueta'], { o: b, y: 10 * (1 - b) });
    }

    // ---------------- 14–15.75: cortes al tiempo
    if (t >= 14 && t < 15.75) {
      const k = Math.min(3, Math.floor((t - 14) / 0.5));
      const t0 = 14 + 0.5 * k;
      const toma = ['silla', 'viento', 'rotacional-ui', 'radial'][k];
      const img = await imagen(toma, 3 + (t - t0) * FPS);
      const punch = salida(rango(t, t0, t0 + 0.18));
      const encuadre = toma === 'rotacional-ui' ? { s: 1.3 - 0.1 * punch + 0.05 * rango(t, t0, t0 + 0.5), cx: 1330, cy: 470 } : { s: 1.12 - 0.1 * punch + 0.04 * rango(t, t0, t0 + 0.5) };
      pintarToma(img, { ...encuadre, radial: 0.8 * (1 - punch), brillo: 0.95 });
      flash = Math.max(flash, 0.5 * (1 - rango(t, t0, t0 + 0.1)));
      $('banda').style.opacity = '0.8';
      const ent = expo(rango(t, t0 + 0.02, t0 + 0.2));
      fijar(T[`corte${k}`], { o: ent, x: -50 * (1 - ent), blur: 8 * (1 - ent) });
      const es = expo(rango(t, t0 + 0.08, t0 + 0.26));
      fijar(T[`corte-sub${k}`], { o: es, x: -30 * (1 - es) });
    }

    // ---------------- 15.75–16: silencio, un punto
    if (t >= 15.75 && t < 16) {
      const g = 0.4 + 0.6 * rango(t, 15.75, 16);
      const grad = ctxFondo.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 70);
      grad.addColorStop(0, `rgba(255,255,255,${g})`);
      grad.addColorStop(0.1, `rgba(255,255,255,${0.6 * g})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctxFondo.fillStyle = grad;
      ctxFondo.fillRect(0, 0, W, H);
    }

    // ---------------- 16–20: estallido y cierre
    if (t >= 16) {
      const x = t - 16;
      ctxFondo.globalAlpha = 1 - 0.55 * rango(t, 16.8, 18);
      ctxFondo.drawImage(estelas, 0, 0);
      ctxFondo.globalAlpha = 1;
      // Onda de choque.
      const r = 1500 * salida(rango(x, 0, 0.8));
      if (x < 0.8) {
        ctxFondo.strokeStyle = `rgba(255,255,255,${0.7 * (1 - rango(x, 0, 0.8))})`;
        ctxFondo.lineWidth = 3;
        ctxFondo.beginPath();
        ctxFondo.arc(W / 2, H / 2, r, 0, PI2);
        ctxFondo.stroke();
      }
      // Rejilla tenue de un campo radial que gira despacio, detrás de la marca.
      const radialCampo = (px, py, tt) => {
        const u = (px - W / 2) / 540;
        const v = (py - H / 2) / 540;
        const giro = 0.35 * Math.sin(tt * 0.6);
        return [u - giro * v, v + giro * u];
      };
      ctxFondo.save();
      rejilla(ctxFondo, t, 16.35, 0.16, radialCampo);
      ctxFondo.restore();
      // Halo detrás de la marca para separarla de la rejilla.
      const halo = ctxFondo.createRadialGradient(W / 2, 470, 0, W / 2, 470, 620);
      halo.addColorStop(0, 'rgba(5,5,5,0.92)');
      halo.addColorStop(0.6, 'rgba(5,5,5,0.6)');
      halo.addColorStop(1, 'rgba(5,5,5,0)');
      ctxFondo.fillStyle = halo;
      ctxFondo.fillRect(0, 0, W, H);

      flash = Math.max(flash, 1 - salida(rango(x, 0, 0.45)));
      const fin = rango(t, 19.3, 19.92);
      // Logo: marco y flecha que se dibujan.
      fijar(T.logo, { o: rango(x, 0.15, 0.3) * (1 - fin), s: mezcla(0.85, 1, expo(rango(x, 0.15, 0.6))) });
      $('logo-marco').setAttribute('stroke-dashoffset', String(1 - salida(rango(x, 0.15, 0.85))));
      $('logo-vara').setAttribute('stroke-dashoffset', String(1 - salida(rango(x, 0.45, 0.85))));
      $('logo-punta').setAttribute('stroke-dashoffset', String(1 - salida(rango(x, 0.7, 1.0))));
      const m = expo(rango(x, 0.25, 1.0));
      fijar(T.marca, { o: m * (1 - fin), blur: 16 * (1 - m), ls: `${(-0.045 + 0.35 * (1 - m)).toFixed(4)}em` });
      const l = expo(rango(x, 0.95, 1.5));
      fijar(T.lema, { o: l * (1 - fin), y: 24 * (1 - l) });
      const g = expo(rango(x, 1.45, 2.0));
      fijar(T.rasgos, { o: g * (1 - fin), y: 16 * (1 - g) });
      const v = expo(rango(x, 1.9, 2.3));
      fijar(T.version, { o: v * (1 - fin) });
      // Fundido a negro.
      ctxFondo.fillStyle = `rgba(5,5,5,${(entrada(fin) * 0.97).toFixed(3)})`;
      ctxFondo.fillRect(0, 0, W, H);
    }

    $('flash').style.opacity = String(Math.min(1, flash));
    pintarGrano(f);
  }

  window.preparar = async () => {
    for (const toma of TOMAS) {
      const r = await fetch(`/tomas/${toma}/meta.json`);
      // Toma aún sin grabar (vista previa): sus fotogramas salen en negro.
      META[toma] = r.ok ? await r.json() : { fotogramas: 0, t: [0] };
    }
    crearTextos();
    await document.fonts.ready;
    // Fuerza la carga de todas las caras usadas.
    await Promise.all(
      ['300 20px Inter', '400 20px Inter', '700 20px Inter', '800 20px Inter', '400 20px "JetBrains Mono"', '500 20px "JetBrains Mono"', '20px KaTeX_Main', '700 20px KaTeX_Main', 'italic 20px KaTeX_Math'].map((f) =>
        document.fonts.load(f, 'Aaωñó∇‖≠½'),
      ),
    );
    reiniciar();
    return { fotogramas: 20 * FPS };
  };
  window.render = render;
})();
