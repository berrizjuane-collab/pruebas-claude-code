/* =============================================================================
   INVAR · arranque e interacción
   -----------------------------------------------------------------------------
   Orden de montaje:
     1. preferencias      (movimiento reducido, puntero, potencia del equipo)
     2. scroll suave      (Lenis ↔ ScrollTrigger, un solo reloj: el de GSAP)
     3. tipografía        (partido en palabras para el reveal del héroe)
     4. revelados         (fade + translate con easing, nunca lineal)
     5. paralaje          (solo transform; jamás top/left/height)
     6. secuencia         (el scroll adelanta el reloj del incidente)
     7. arquitectura      (pinning + desplazamiento horizontal en escritorio)
     8. cromo             (raíl de progreso, cursor, navegación, contadores)

   Todo lo que anima usa transform u opacity. Nada dispara recálculo de layout.
   ========================================================================== */
(() => {
'use strict';

const doc = document.documentElement;
doc.classList.add('js');

/* ─────────────────────────────── 1 · preferencias ────────────────────────── */

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');
let RM = reduced.matches;

const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);
gsap.defaults({ ease: 'power3.out' });

/* ─────────────────────────────── 2 · scroll suave ────────────────────────── */

let lenis = null;
if (!RM && window.Lenis) {
  lenis = new Lenis({
    duration: 1.05,                       // inercia corta: firme, no flotante
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    syncTouch: false,                     // en táctil manda el scroll nativo
    touchMultiplier: 1.4,
    wheelMultiplier: 0.92,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

const scrollTo = (target) => {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: -10, duration: 1.15 });
  else el.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' });
};

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    closeDrawer();
    scrollTo(el);
  });
});

/* ─────────────────────────────── 3 · tipografía ──────────────────────────── */

/** Parte un texto en palabras envueltas para poder revelarlas por separado.
    Se conservan las palabras completas: el lector de pantalla no se entera. */
function splitWords(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  return words.map((w, i) => {
    const outer = document.createElement('span');
    outer.className = 'word';
    const inner = document.createElement('span');
    inner.textContent = w;
    outer.appendChild(inner);
    el.appendChild(outer);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    return inner;
  });
}

document.querySelectorAll('[data-split]').forEach((el) => {
  const parts = splitWords(el);
  if (RM) return;
  const isHero = el.classList.contains('hero__title');
  gsap.from(parts, {
    yPercent: 118,
    duration: 1.15,
    ease: 'power4.out',
    stagger: 0.045,
    delay: isHero ? 0.15 : 0,
    scrollTrigger: isHero ? null : { trigger: el, start: 'top 85%', once: true },
  });
});

/* entrada por capas del héroe */
if (!RM) {
  const tl = gsap.timeline({ delay: 0.05 });
  tl.from('.hero__media', { scale: 1.12, opacity: 0, duration: 1.8, ease: 'power2.out' }, 0)
    .from('.hero__field', { opacity: 0, duration: 2.2 }, 0.3)
    .from('.hero__eyebrow', { opacity: 0, y: 14, duration: 0.9 }, 0.25)
    .from('.hero__cols > *', { opacity: 0, y: 22, duration: 1, stagger: 0.1 }, 0.75)
    .from('.hero__stats > div', { opacity: 0, y: 18, duration: 0.9, stagger: 0.08 }, 0.9)
    .from('.hero__scroll', { opacity: 0, duration: 0.8 }, 1.15)
    .from('.nav', { yPercent: -100, duration: 1, ease: 'power3.out' }, 0.1);
}

/* ─────────────────────────────── 4 · revelados ───────────────────────────── */

gsap.utils.toArray('[data-reveal]').forEach((el) => {
  const staggered = el.hasAttribute('data-reveal-stagger');
  const targets = staggered ? Array.from(el.children) : el;
  if (staggered) gsap.set(el, { opacity: 1 });
  if (RM) { gsap.set(targets, { opacity: 1, y: 0 }); return; }
  gsap.fromTo(targets,
    { opacity: 0, y: 30 },
    {
      opacity: 1, y: 0,
      duration: 1.1,
      ease: 'power3.out',
      stagger: staggered ? 0.09 : 0,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
});

/* ─────────────────────────────── 5 · paralaje ────────────────────────────── */

if (!RM) {
  gsap.utils.toArray('[data-parallax]').forEach((el) => {
    const amt = parseFloat(el.dataset.parallax) || 0.1;
    const img = el.classList.contains('frame') ? el.querySelector('img') : null;
    const target = img || el;
    if (img) gsap.set(img, { scale: 1 + amt * 1.6, transformOrigin: 'center' });
    gsap.fromTo(target,
      { yPercent: -amt * 50 },
      {
        yPercent: amt * 50,
        ease: 'none',
        scrollTrigger: {
          trigger: el.closest('section') || el,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });
  });
}

/* ─────────────────────────────── 6 · secuencia ───────────────────────────── */

const seqCanvas = document.querySelector('.sequence__canvas');
if (seqCanvas && window.INVAR && INVAR.sequence) {
  const clock = document.querySelector('.sequence__t');
  const phase = document.querySelector('.sequence__phase');
  const meter = Array.from(document.querySelectorAll('.sequence__meter span'));
  const beats = gsap.utils.toArray('.beat');

  const seq = INVAR.sequence(seqCanvas, {
    still: RM,
    onPhase(index, time, name, changed) {
      if (clock) clock.textContent = time;
      if (changed) {
        if (phase) phase.textContent = name;
        meter.forEach((m, i) => m.classList.toggle('is-on', i <= index));
      }
    },
  });

  if (RM) {
    seq.setProgress(0.72);                       // estado legible: ya contenido
    beats.forEach((b) => b.classList.add('is-on'));
  } else {
    ScrollTrigger.create({
      trigger: '.sequence',
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => seq.setProgress(self.progress),
      onRefresh: (self) => seq.setProgress(self.progress),
    });
    beats.forEach((b) => {
      ScrollTrigger.create({
        trigger: b,
        start: 'top 62%',
        end: 'bottom 38%',
        onToggle: (self) => b.classList.toggle('is-on', self.isActive),
      });
    });
  }
}

/* ─────────────────────────────── 7 · arquitectura ────────────────────────── */

const mm = gsap.matchMedia();

mm.add('(min-width: 1080px)', () => {
  if (RM) return;
  const track = document.querySelector('.arch__track');
  const pinEl = document.querySelector('.arch__pin');
  if (!track || !pinEl) return;

  const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 48);

  const tween = gsap.to(track, {
    x: () => -distance(),
    ease: 'none',
    scrollTrigger: {
      trigger: '.arch',
      start: 'top top',
      end: () => '+=' + (distance() + window.innerHeight * 0.4),
      pin: pinEl,
      pinSpacing: true,
      anticipatePin: 1,
      scrub: 0.65,
      invalidateOnRefresh: true,
    },
  });

  return () => { tween.scrollTrigger && tween.scrollTrigger.kill(); tween.kill(); gsap.set(track, { x: 0 }); };
});

/* ─────────────────────── 8 · fondo, raíl, contadores, cromo ──────────────── */

/* transición de color de fondo: se cruzan capas por opacidad (sin repintar) */
(() => {
  const layers = gsap.utils.toArray('.bg__layer');
  const map = [
    { sel: '.hero', layer: 0 },
    { sel: '.tension', layer: 1 },
    { sel: '.sequence', layer: 2 },
    { sel: '.caps', layer: 1 },
    { sel: '.arch', layer: 3 },
    { sel: '.metrics', layer: 1 },
    { sel: '.field', layer: 3 },
    { sel: '.doctrine', layer: 2 },
    { sel: '.contact', layer: 3 },
  ];
  map.forEach(({ sel, layer }) => {
    const el = document.querySelector(sel);
    if (!el || !layers[layer]) return;
    ScrollTrigger.create({
      trigger: el,
      start: 'top 70%',
      end: 'bottom 30%',
      onToggle: (self) => {
        gsap.to(layers[layer], {
          opacity: self.isActive ? 1 : 0,
          duration: 1.2,
          ease: 'power2.inOut',
          overwrite: 'auto',
        });
      },
    });
  });
})();

/* raíl de progreso + índice de sección */
(() => {
  const fill = document.querySelector('.rail__fill');
  const label = document.querySelector('.rail__label');
  if (!fill) return;
  gsap.to(fill, {
    scaleY: 1,
    ease: 'none',
    scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.3 },
  });
  const sections = gsap.utils.toArray('main section[id]');
  sections.forEach((sec, i) => {
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 55%',
      end: 'bottom 45%',
      onToggle: (self) => {
        if (!self.isActive || !label) return;
        label.textContent = String(i).padStart(2, '0');
      },
    });
  });
})();

/* contadores: solo al entrar en viewport, con formato español */
(() => {
  const nf = (d) => {
    try {
      return new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always',
      });
    } catch (_) {
      return new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
    }
  };
  document.querySelectorAll('[data-count]').forEach((el) => {
    const end = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.decimals || '0', 10);
    const suffix = el.dataset.suffix || '';
    const fmt = nf(dec);
    if (RM) { el.textContent = fmt.format(end) + suffix; return; }
    const obj = { v: 0 };
    el.textContent = fmt.format(0) + suffix;
    gsap.to(obj, {
      v: end,
      duration: 1.9,
      ease: 'power2.out',
      onUpdate: () => { el.textContent = fmt.format(obj.v) + suffix; },
      scrollTrigger: { trigger: el, start: 'top 92%', once: true },
    });
  });
})();

/* navegación: se oculta al bajar, vuelve al subir, marca la sección activa */
(() => {
  const nav = document.getElementById('nav');
  if (!nav) return;
  let last = 0;
  ScrollTrigger.create({
    start: 'top -80',
    end: 99999,
    onUpdate: (self) => {
      const y = self.scroller === window ? window.scrollY : self.scroll();
      nav.classList.toggle('is-stuck', y > 60);
      nav.classList.toggle('is-hidden', y > last && y > 320 && !drawerOpen);
      last = y;
    },
  });

  const links = Array.from(nav.querySelectorAll('.nav__links a'));
  links.forEach((a) => {
    const sec = document.querySelector(a.getAttribute('href'));
    if (!sec) return;
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (self.isActive) {
          links.forEach((l) => l.removeAttribute('aria-current'));
          a.setAttribute('aria-current', 'true');
        }
      },
    });
  });
})();

/* menú móvil */
let drawerOpen = false;
const toggle = document.querySelector('.nav__toggle');
const drawer = document.getElementById('nav-drawer');

function openDrawer() {
  if (!drawer) return;
  drawerOpen = true;
  drawer.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  toggle.querySelector('.sr').textContent = 'Cerrar menú';
  if (lenis) lenis.stop();
  gsap.fromTo(drawer, { opacity: 0 }, { opacity: 1, duration: 0.4 });
  gsap.fromTo(drawer.querySelectorAll('a'),
    { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, delay: 0.05 });
}
function closeDrawer() {
  if (!drawer || !drawerOpen) return;
  drawerOpen = false;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.querySelector('.sr').textContent = 'Abrir menú';
  if (lenis) lenis.start();
  gsap.to(drawer, {
    opacity: 0, duration: 0.3,
    onComplete: () => { drawer.hidden = true; },
  });
}
if (toggle) toggle.addEventListener('click', () => (drawerOpen ? closeDrawer() : openDrawer()));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

/* cursor: dos cuerpos con inercias distintas, estados por data-cursor */
if (fine.matches && !RM) {
  const cur = document.querySelector('.cursor');
  const dot = cur.querySelector('.cursor__dot');
  const ring = cur.querySelector('.cursor__ring');
  const text = cur.querySelector('.cursor__text');
  const LABELS = { call: 'Llamar', mail: 'Escribir', down: 'Bajar' };
  document.body.classList.add('has-cursor');

  const p = { x: innerWidth / 2, y: innerHeight / 2 };
  const d = { x: p.x, y: p.y };
  const r = { x: p.x, y: p.y };

  // no se muestra hasta que el puntero se mueve: nada de un punto suelto al cargar
  window.addEventListener('pointermove', (e) => {
    p.x = e.clientX; p.y = e.clientY;
    if (!cur.classList.contains('is-live')) {
      gsap.set([dot, ring], { x: p.x, y: p.y });
      d.x = r.x = p.x; d.y = r.y = p.y;
      cur.classList.add('is-live');
    }
  }, { passive: true });

  gsap.ticker.add(() => {
    d.x += (p.x - d.x) * 0.85; d.y += (p.y - d.y) * 0.85;
    r.x += (p.x - r.x) * 0.16; r.y += (p.y - r.y) * 0.16;
    gsap.set(dot, { x: d.x, y: d.y });
    gsap.set(ring, { x: r.x, y: r.y });
  });

  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-cursor]');
    cur.classList.remove('is-link', 'is-label');
    if (!t) return;
    const kind = t.dataset.cursor;
    if (LABELS[kind]) {
      text.textContent = LABELS[kind];
      cur.classList.add('is-label');
    } else {
      cur.classList.add('is-link');
    }
  });
  document.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest('[data-cursor]')) {
      cur.classList.remove('is-link', 'is-label');
    }
  });
}

/* campo del héroe */
const heroCanvas = document.querySelector('.hero__field');
if (heroCanvas && !RM && window.INVAR && INVAR.field) INVAR.field(heroCanvas);

/* recálculo tras cargar imágenes: las alturas cambian y ScrollTrigger lo sabe */
window.addEventListener('load', () => ScrollTrigger.refresh());
reduced.addEventListener('change', () => location.reload());

})();
