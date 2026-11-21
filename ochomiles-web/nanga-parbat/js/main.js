// Nanga Parbat · arranque

import { Stage } from './stage.js';
import { Director } from './director.js';
import { Overlays, Minimap } from './overlays.js';
import { MacizoMap } from './map.js';
import { Perfil } from './profile.js';
import { stoneBoxes, stoneScale, reveals, portada, chrome, historia, relatos, galeria, escalada } from './fx.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const decodeImg = (img) => (img.complete && img.naturalWidth ? Promise.resolve() : (img.decode ? img.decode() : new Promise((r) => { img.onload = r; img.onerror = r; }))).catch(() => {});

async function preload(stage) {
  const pct = document.querySelector('.preloader__pct');
  const txt = document.querySelector('.preloader__txt');
  const tasks = [
    { w: 1, p: document.fonts ? document.fonts.ready : Promise.resolve() },
    ...[...document.querySelectorAll('.capa img')].map((img) => ({ w: 3, p: decodeImg(img) })),
    { w: 3, p: stage.load('fairy') },
    { w: 2, p: stage.load('rupal') },
    { w: 2, p: stage.load('diamir') },
    { w: 1, p: fetch('assets/data/geo.json').then((r) => r.json()) },
  ];
  const total = tasks.reduce((s, t) => s + t.w, 0);
  let done = 0, shown = 0;
  const msgs = ['Preparando las láminas', 'Mezclando el albaricoque', 'Secando el pincel', 'Afinando la cumbre'];
  let mi = 0;
  const msgTimer = setInterval(() => { mi = (mi + 1) % msgs.length; txt.textContent = msgs[mi]; }, 1300);
  const ticker = setInterval(() => {
    const target = (done / total) * 100;
    shown += (target - shown) * 0.25;
    pct.textContent = Math.round(shown);
  }, 40);
  tasks.forEach((t) => t.p.then(() => { done += t.w; }, () => { done += t.w; }));
  const geoP = tasks[tasks.length - 1].p;
  await Promise.race([Promise.allSettled(tasks.map((t) => t.p)), wait(12000)]);
  await wait(reduced ? 0 : 450);
  clearInterval(msgTimer);
  clearInterval(ticker);
  pct.textContent = '100';
  return geoP;
}

async function boot() {
  const stage = new Stage(document.querySelector('#stage'), document.querySelector('.stage-fallback'));
  const t0 = performance.now();
  const geo = await preload(stage);
  // que la animación del sello termine aunque todo cargue muy rápido
  const minShow = reduced ? 0 : 1900 - (performance.now() - t0);
  if (minShow > 0) await wait(minShow);

  if (!gsap || !ScrollTrigger) {
    document.body.classList.remove('is-loading');
    document.querySelector('.preloader')?.remove();
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  // desplazamiento suave
  let lenis = null;
  if (!reduced && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.95, touchMultiplier: 1.4 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }

  stoneBoxes();
  stoneScale();
  const intro = portada(reduced);
  reveals(reduced);
  chrome(lenis);
  historia(reduced);
  relatos(reduced);
  galeria(reduced);

  // el mapa del macizo
  const mapa = new MacizoMap(document.querySelector('#macizo'), geo, { reduced });
  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px)', () => {
    mapa.mobile = false;
    const st = ScrollTrigger.create({ trigger: '#macizo', start: 'top top', end: 'bottom bottom', onUpdate: (s) => mapa.progress(s.progress) });
    mapa.progress(st.progress || 0);
  });
  mm.add('(max-width: 899px)', () => {
    mapa.mobileMode();
    document.querySelectorAll('.macizo__paso').forEach((p) => {
      ScrollTrigger.create({ trigger: p, start: 'top 75%', end: 'bottom 40%', onToggle: (s) => { if (s.isActive) mapa.mobileStep(Number(p.dataset.step)); } });
    });
  });

  // escenario, superposiciones, perfil
  const director = new Director(stage, { reduced });
  const overlays = new Overlays(document.querySelector('#overlay'), stage, geo);
  const minimap = new Minimap(document.querySelector('.minimapa'), geo);
  const perfil = new Perfil(document.querySelector('.perfil'), geo);
  const climb = escalada(perfil, geo);
  const rutaPanel = document.querySelector('.ruta__panel');
  if (new URLSearchParams(location.search).has('debug')) window.__np = { director, overlays, stage, minimap };
  director.onChange((info) => {
    overlays.update(info);
    // durante la escalada manda el panel de altitud; el minimapa se retira
    minimap.set(rutaPanel.classList.contains('is-on') ? null : info.dominant.cam);
  });

  // un solo bucle para todo lo que depende del scroll
  gsap.ticker.add(() => {
    director.update(window.scrollY);
    stage.render();
    climb();
  });

  ScrollTrigger.addEventListener('refresh', () => { director.measure(); stage.resize(); });
  let rT;
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => ScrollTrigger.refresh(), 180); }, { passive: true });
  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  // el resto de láminas, en segundo plano
  const rest = ['camp1', 'camp2', 'camp3', 'summit'];
  (window.requestIdleCallback || ((f) => setTimeout(f, 600)))(() => rest.reduce((p, id) => p.then(() => stage.load(id)), Promise.resolve()));

  // fuera la precarga
  ScrollTrigger.refresh();
  window.scrollTo(0, 0);
  const pre = document.querySelector('.preloader');
  const out = gsap.timeline({
    onComplete: () => {
      pre.remove();
      document.body.classList.remove('is-loading');
      lenis?.start();
      ScrollTrigger.refresh();
      if (location.hash && document.querySelector(location.hash)) lenis ? lenis.scrollTo(location.hash, { immediate: true }) : document.querySelector(location.hash).scrollIntoView();
    },
  });
  out.to('.preloader__inner', { opacity: 0, y: -20, scale: 0.98, duration: reduced ? 0.01 : 0.7, ease: 'power2.in' })
    .to(pre, { opacity: 0, duration: reduced ? 0.01 : 0.9, ease: 'power2.inOut' }, '-=0.15')
    .add(() => intro.play(), '-=0.75');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
