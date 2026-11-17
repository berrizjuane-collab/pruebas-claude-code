// Coreografía: portada multiplano, piedras que se asientan, dinteles que se
// cincelan, medallones que giran, odómetro de años, galería horizontal,
// altímetro y la escalada con su perfil.

import { LAMINAS, ORDEN, lamSrc, COTA_CAMPO, NOMBRES_CAMPO } from './data.js';

const gsap = () => window.gsap;
const ST = () => window.ScrollTrigger;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// ───────────────────────────────────────────── piedras elásticas: --k = ancho / ancho nominal
export function stoneScale() {
  const NAT = { losa: 1600, lapida: 1700, pizarra: 1500, tablilla: 1400, dintel: 2400, chilas: 1100 };
  const narrow = matchMedia('(max-width: 700px)');
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const n = e.target;
      const type = n._type;
      if (type === 'chilas' && !narrow.matches) continue;
      let nat = NAT[type];
      let k = n.offsetWidth / nat;
      // en pantallas pequeñas, bordes algo más finos para dejar sitio al texto
      if (window.innerWidth < 700 && type !== 'chilas') k *= 0.82;
      if (type === 'dintel') k = Math.max(k, 0.16);
      n.style.setProperty('--k', k.toFixed(4));
    }
  });
  document.querySelectorAll('.piedra').forEach((n) => {
    const m = n.className.match(/piedra--(\w+)/);
    if (!m || !NAT[m[1]]) return;
    n._type = m[1];
    ro.observe(n);
  });
  narrow.addEventListener?.('change', () => document.querySelectorAll('.piedra--chilas').forEach((n) => n.style.removeProperty('--k')));
}

// ───────────────────────────────────────────── piedras de forma fija: caja interior
export function stoneBoxes() {
  document.querySelectorAll('.piedra--estela, .piedra--medallon, .piedra--chilas').forEach((n) => {
    if (n.querySelector(':scope > .piedra__caja')) return;
    const box = document.createElement('div');
    box.className = 'piedra__caja';
    while (n.firstChild) box.appendChild(n.firstChild);
    n.appendChild(box);
  });
}

// ───────────────────────────────────────────── dividir texto en letras (sin romper palabras)
function splitChars(node) {
  const words = node.textContent.trim().split(/\s+/);
  node.textContent = '';
  const chars = [];
  words.forEach((w, i) => {
    const ws = document.createElement('span');
    ws.style.display = 'inline-block';
    ws.style.whiteSpace = 'nowrap';
    for (const c of w) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.style.display = 'inline-block';
      s.textContent = c;
      ws.appendChild(s);
      chars.push(s);
    }
    node.appendChild(ws);
    if (i < words.length - 1) node.appendChild(document.createTextNode(' '));
  });
  return chars;
}

// ───────────────────────────────────────────── contador
function countUp(n, reduced) {
  const final = n.textContent.trim();
  n.style.setProperty('--len', String(final.length));
  const to = Number(n.dataset.count);
  if (!Number.isFinite(to) || reduced) return;
  const prefix = n.dataset.prefix || '';
  const from = n.dataset.plain !== undefined ? to - 48 : 0;
  const o = { v: from };
  n.textContent = prefix + Math.round(from);
  gsap().to(o, { v: to, duration: n.dataset.plain !== undefined ? 1.6 : 1.9, ease: 'power3.out', delay: 0.35,
    onUpdate: () => { n.textContent = prefix + Math.round(o.v); }, onComplete: () => { n.textContent = final; } });
}

// ───────────────────────────────────────────── revelado de piedras
export function reveals(reduced) {
  const g = gsap();
  document.querySelectorAll('.medallon__n').forEach((n) => n.style.setProperty('--len', String(n.textContent.trim().length)));
  document.querySelectorAll('[data-reveal]').forEach((node) => {
    const kind = node.dataset.reveal || 'piedra';
    const st = { trigger: node, start: 'top 90%', once: true };
    if (reduced) {
      g.from(node, { opacity: 0, duration: 0.8, scrollTrigger: st });
      return;
    }
    if (kind === 'dintel') {
      const span = node.querySelector('span');
      const chars = span ? splitChars(span) : [];
      const tl = g.timeline({ scrollTrigger: st });
      tl.fromTo(node, { clipPath: 'inset(0% 50% 0% 50%)', opacity: 0.4 }, { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1, duration: 1.3, ease: 'expo.inOut' })
        .from(chars, { opacity: 0, yPercent: 35, filter: 'blur(6px)', duration: 0.9, ease: 'power3.out', stagger: { each: 0.025, from: 'center' } }, '-=0.55');
      return;
    }
    if (kind === 'medallon') {
      const n = node.querySelector('.medallon__n');
      g.fromTo(node, { opacity: 0, rotationY: -88, scale: 0.78, transformPerspective: 900 },
        { opacity: 1, rotationY: 0, scale: 1, duration: 1.5, ease: 'expo.out', scrollTrigger: { ...st, onEnter: () => n && countUp(n, reduced) } });
      return;
    }
    // piedra: cae, gira un poco y se asienta; luego aparece lo grabado
    const box = node.querySelector(':scope > .piedra__caja');
    const kids = [...(box || node).children];
    const rot = rand(-2.6, 2.6);
    const tl = g.timeline({ scrollTrigger: st });
    tl.fromTo(node, { opacity: 0, y: 90, rotation: rot, scale: 0.95 }, { opacity: 1, y: 0, rotation: 0, scale: 1, duration: 1.45, ease: 'expo.out' })
      .from(kids, { opacity: 0, y: 14, duration: 0.9, ease: 'power3.out', stagger: 0.08 }, 0.32);
  });
}

// ───────────────────────────────────────────── portada multiplano
export function portada(reduced) {
  const g = gsap();
  const sec = document.querySelector('#portada');
  const cielo = sec.querySelector('.capa--cielo'), monte = sec.querySelector('.capa--montana'), frente = sec.querySelector('.capa--frente');
  const titulo = sec.querySelector('.portada__titulo');
  const pin = sec.querySelector('.portada__pin');
  const h1 = sec.querySelector('.portada__h1');
  const chars = [];
  h1.querySelectorAll('.portada__palabra').forEach((w) => {
    const t = w.textContent; w.textContent = '';
    for (const c of t) { const s = document.createElement('span'); s.className = 'ch'; s.textContent = c; w.appendChild(s); chars.push(s); }
  });

  // entrada (al terminar la precarga): las letras salen de detrás de la pradera
  const intro = g.timeline({ paused: true, defaults: { ease: 'expo.out' } });
  if (!reduced) {
    intro
      .from(cielo.querySelector('img'), { scale: 1.16, duration: 3.2, ease: 'power3.out' }, 0)
      .from(monte.querySelector('img'), { scale: 1.07, yPercent: 2.5, duration: 3.0, ease: 'power3.out' }, 0)
      .from(frente.querySelector('img'), { yPercent: 9, duration: 2.6, ease: 'power4.out' }, 0.05)
      .from(chars, { yPercent: 135, opacity: 0, duration: 1.9, stagger: 0.055 }, 0.45)
      .from(sec.querySelector('.portada__etiqueta'), { opacity: 0, y: 18, duration: 1.4 }, 1.1)
      .from(sec.querySelector('.portada__ur'), { opacity: 0, y: 24, duration: 1.6 }, 1.25)
      .from(sec.querySelectorAll('.portada__pie > *, .portada__cue'), { opacity: 0, y: 16, duration: 1.2, stagger: 0.12 }, 1.5);
  }

  // scroll: la pradera sube más deprisa que la montaña y se traga el título
  if (!reduced) {
    const tl = g.timeline({ scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom bottom', scrub: true } });
    tl.to(cielo, { yPercent: 6, scale: 1.05, ease: 'none', duration: 1 }, 0)
      .to(monte, { yPercent: -2.5, scale: 1.03, ease: 'none', duration: 1 }, 0)
      .to(frente, { yPercent: -4.5, scale: 1.5, transformOrigin: '50% 100%', ease: 'none', duration: 0.62 }, 0)
      .to(titulo, { y: () => window.innerHeight * 0.17, ease: 'none', duration: 0.55 }, 0)
      .to(titulo, { opacity: 0, ease: 'none', duration: 0.12 }, 0.46)
      .to(sec.querySelectorAll('.portada__pie, .portada__cue'), { opacity: 0, ease: 'none', duration: 0.12 }, 0)
      .to(sec.querySelector('.portada__velo'), { opacity: 0.5, ease: 'none', duration: 0.3 }, 0.42)
      .to([cielo, monte, frente, sec.querySelector('.portada__velo')], { opacity: 0, ease: 'none', duration: 0.18 }, 0.8);
  } else {
    g.to(pin, { opacity: 0, scrollTrigger: { trigger: sec, start: '60% top', end: 'bottom bottom', scrub: true } });
  }
  return intro;
}

// ───────────────────────────────────────────── cabecera, navegación, altímetro
export function chrome(lenis) {
  const g = gsap();
  const head = document.querySelector('.cabecera');
  const alt = document.querySelector('.altimetro');
  const val = alt.querySelector('.altimetro__valor');
  ST().create({
    trigger: '#nombre', start: 'top 85%',
    onEnter: () => { head.dataset.state = 'shown'; alt.classList.add('is-on'); },
    onLeaveBack: () => { head.dataset.state = 'hidden'; alt.classList.remove('is-on'); },
  });
  ST().create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      const p = self.progress;
      alt.style.setProperty('--p', p.toFixed(4));
      val.textContent = Math.round(1150 + p * (8126 - 1150));
    },
  });
  const links = [...document.querySelectorAll('.nav a')];
  links.forEach((a) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    ST().create({ trigger: target, start: 'top 55%', end: 'bottom 55%', onToggle: (s) => a.classList.toggle('is-active', s.isActive) });
  });
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(t, { offset: id === '#portada' ? 0 : -8, duration: 2.2 });
      else t.scrollIntoView({ behavior: 'smooth' });
      history.replaceState(null, '', id);
    });
  });
  void g;
}

// ───────────────────────────────────────────── odómetro de la historia
export function historia(reduced) {
  const g = gsap();
  const od = document.querySelector('.odometro');
  if (!od) return;
  // Fraunces no trae cifras tabulares: cada columna toma el ancho de su dígito
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
  od.appendChild(probe);
  const fs = parseFloat(getComputedStyle(od).fontSize) || 100;
  const widths = [];
  for (let d = 0; d <= 9; d++) { probe.textContent = String(d); widths.push(probe.getBoundingClientRect().width / fs); }
  probe.remove();
  const cols = [], wraps = [];
  for (let i = 0; i < 4; i++) {
    const col = document.createElement('span');
    col.className = 'odometro__col';
    const tira = document.createElement('span');
    tira.className = 'odometro__tira';
    for (let d = 0; d <= 9; d++) { const s = document.createElement('span'); s.textContent = d; tira.appendChild(s); }
    col.appendChild(tira);
    od.appendChild(col);
    cols.push(tira);
    wraps.push(col);
  }
  const set = (year, instant = false) => {
    String(year).padStart(4, '0').split('').forEach((c, i) => {
      const n = Number(c);
      const dur = instant || reduced ? 0 : 1.1;
      const delay = instant ? 0 : (3 - i) * 0.05;
      g.to(cols[i], { yPercent: -n * 10, duration: dur, ease: 'power3.inOut', delay, overwrite: true });
      g.to(wraps[i], { width: widths[n] + 'em', duration: dur, ease: 'power3.inOut', delay, overwrite: true });
    });
    od.setAttribute('data-value', year);
  };
  set(1895, true);
  document.querySelectorAll('.evento').forEach((ev) => {
    ST().create({ trigger: ev, start: 'top 62%', end: 'bottom 62%', onToggle: (s) => { if (s.isActive) set(ev.dataset.year); } });
  });
}

// ───────────────────────────────────────────── relatos: deriva lenta
export function relatos(reduced) {
  if (reduced) return;
  document.querySelectorAll('.relato[data-drift]').forEach((n) => {
    const d = Number(n.dataset.drift);
    gsap().fromTo(n, { yPercent: d * 2.2 }, { yPercent: -d * 2.2, ease: 'none', scrollTrigger: { trigger: n, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}

// ───────────────────────────────────────────── galería de las ocho láminas
export function galeria(reduced) {
  const list = document.querySelector('.laminas__lista');
  const big = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2) > 1500;
  for (const id of ORDEN) {
    const L = LAMINAS[id];
    const li = document.createElement('li');
    li.className = 'lamina';
    li.style.setProperty('--ar', id === 'mapa' ? (2000 / 2121).toFixed(4) : '1.5');
    const marco = document.createElement('div');
    marco.className = 'lamina__marco';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = lamSrc(id, 1280);
    img.srcset = `${lamSrc(id, 1280)} 1280w, ${lamSrc(id, 2400)} ${id === 'mapa' ? 2000 : 2400}w`;
    img.sizes = '(min-width: 900px) 60vw, 86vw';
    img.alt = `Lámina ${L.n}: ${L.titulo}, ${L.dato}. ${L.texto}`;
    const num = document.createElement('span');
    num.className = 'lamina__num';
    num.textContent = String(L.n);
    marco.append(img, num);
    const pie = document.createElement('div');
    pie.className = 'lamina__pie';
    const h = document.createElement('h3'); h.className = 'lamina__titulo'; h.textContent = `${L.n} · ${L.titulo}`;
    const d = document.createElement('p'); d.className = 'lamina__dato np-dato'; d.textContent = L.dato;
    const t = document.createElement('p'); t.className = 'lamina__txt'; t.textContent = L.texto;
    const c = document.createElement('p'); c.className = 'lamina__cam np-pie np-dato';
    c.textContent = L.cam ? `cámara ${L.cam.lat}, ${L.cam.lon} · ${L.cam.alt} m · mira al ${String(L.cam.az).padStart(3, '0')}° · campo ${L.cam.fov}°` : 'centro 35.2375° N, 74.5892° E · cenital · norte arriba';
    pie.append(h, d, t, c);
    li.append(marco, pie);
    list.appendChild(li);
  }
  void big;
  const mm = gsap().matchMedia();
  mm.add('(min-width: 900px)', () => {
    if (reduced) return;
    const pista = document.querySelector('.laminas__pista');
    const dist = () => Math.max(0, list.scrollWidth - window.innerWidth);
    const tw = gsap().to(list, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: pista, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: true, invalidateOnRefresh: true, anticipatePin: 1 } });
    // cada lámina se acerca un poco al pasar por el centro
    list.querySelectorAll('.lamina__marco img').forEach((img) => {
      gsap().fromTo(img, { scale: 1.14, xPercent: -3 }, { scale: 1.02, xPercent: 3, ease: 'none', scrollTrigger: { trigger: img.closest('.lamina'), containerAnimation: tw, start: 'left right', end: 'right left', scrub: true } });
    });
    return () => {};
  });
}

// ───────────────────────────────────────────── la escalada
export function escalada(perfil, geo) {
  const sec = document.querySelector('.ruta__escalada');
  const panel = sec.querySelector('.ruta__panel');
  const num = sec.querySelector('.ruta__num');
  const lugar = sec.querySelector('.ruta__lugar');
  const pasos = [...sec.querySelectorAll('.ruta__paso')];
  const camp = Object.fromEntries(geo.camps.map((c) => [c.id, c]));
  const dist = (id) => id === 'muro' ? camp.c1.d + (camp.c2.d - camp.c1.d) * 0.45 : camp[id]?.d ?? 0;
  const LUG = { ...NOMBRES_CAMPO, bc: 'Campo base del Diamir', muro: 'El muro Kinshofer' };
  const nodes = pasos.map((p) => ({ el: p, id: p.dataset.camp, d: dist(p.dataset.camp), z: COTA_CAMPO[p.dataset.camp] }));
  ST().create({ trigger: sec, start: 'top 70%', end: 'bottom 40%', toggleClass: { targets: panel, className: 'is-on' } });
  let shown = 0, lastLugar = '';
  const tick = () => {
    const mid = window.innerHeight * 0.5;
    const cs = nodes.map((n) => { const r = n.el.getBoundingClientRect(); return r.top + r.height / 2 - mid; });
    let d = nodes[0].d, z = nodes[0].z, at = nodes[0];
    if (cs[0] > 0) { d = nodes[0].d; z = nodes[0].z; at = nodes[0]; }
    else if (cs[cs.length - 1] <= 0) { const n = nodes[nodes.length - 1]; d = n.d; z = n.z; at = n; }
    else {
      for (let i = 0; i < nodes.length - 1; i++) {
        if (cs[i] <= 0 && cs[i + 1] > 0) {
          const t = clamp(-cs[i] / (cs[i + 1] - cs[i]));
          const e = t * t * (3 - 2 * t);
          d = nodes[i].d + (nodes[i + 1].d - nodes[i].d) * e;
          z = nodes[i].z + (nodes[i + 1].z - nodes[i].z) * e;
          at = t < 0.5 ? nodes[i] : nodes[i + 1];
        }
      }
    }
    perfil.setClimber(d);
    shown += (z - shown) * 0.18;
    if (Math.abs(z - shown) < 0.6) shown = z;
    num.textContent = Math.round(shown);
    if (at.id !== lastLugar) { lastLugar = at.id; lugar.textContent = LUG[at.id] || ''; }
  };
  return tick;
}
