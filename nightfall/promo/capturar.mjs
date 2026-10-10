/**
 * Metraje real del vídeo promocional: la web (nightfall/index.html) grabada fotograma a fotograma
 * con un reloj virtual. Antes de que corra la página se sustituyen performance.now, Date, los
 * temporizadores y requestAnimationFrame, y en cada fotograma se avanza el reloj 1/60 s y se
 * fijan todas las animaciones y transiciones CSS en ese instante. Así cada toma es fluida y
 * reproducible, tarde lo que tarde cada captura. La hora de la página es la de un viernes a las
 * 11:47 p. m. en Caracas, con los ocho locales abiertos.
 *
 *   node nightfall/promo/capturar.mjs <carpeta de salida> [toma …]
 *
 * Cada toma queda en <salida>/<toma>/0000.jpg … con un meta.json (fps, viewport, escala, toques y
 * las cajas de los elementos que el compositor recorta). SOLO_CAJAS=1 solo vuelve a medir las cajas.
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
function cargarPlaywright() {
  try { return require('playwright'); } catch { /* sin dependencia local */ }
  return require(join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium } = cargarPlaywright();

const aqui = dirname(fileURLToPath(import.meta.url));
const html = pathToFileURL(resolve(aqui, '..', 'index.html')).href;
const salida = resolve(process.argv[2] ?? 'tomas');
const pedidas = process.argv.slice(3);
const FPS = 60;
const EPOCA = Date.UTC(2026, 9, 10, 3, 47, 0); // viernes 9 de octubre de 2026, 11:47 p. m. en Caracas

const RELOJ = `(() => {
  const EPOCA = ${EPOCA};
  let ahora = 0;
  const DateReal = Date;
  function DateVirtual(...a) {
    if (!new.target) return new DateReal(EPOCA + ahora).toString();
    return a.length ? new DateReal(...a) : new DateReal(EPOCA + ahora);
  }
  DateVirtual.prototype = DateReal.prototype;
  DateVirtual.now = () => EPOCA + ahora;
  DateVirtual.UTC = DateReal.UTC;
  DateVirtual.parse = DateReal.parse;
  window.Date = DateVirtual;
  performance.now = () => ahora;
  const temporizadores = new Map();
  let sig = 1;
  window.setTimeout = (fn, ms = 0, ...args) => { const id = sig++; temporizadores.set(id, { en: ahora + Math.max(0, +ms || 0), fn, args, cada: 0 }); return id; };
  window.setInterval = (fn, ms = 0, ...args) => { const id = sig++; const c = Math.max(4, +ms || 0); temporizadores.set(id, { en: ahora + c, fn, args, cada: c }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { temporizadores.delete(id); };
  const cuadros = new Map();
  let sigC = 1;
  window.requestAnimationFrame = (fn) => { const id = sigC++; cuadros.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { cuadros.delete(id); };
  // desplazamientos suaves en tiempo virtual (los nativos irían a tiempo real)
  const irNativo = Element.prototype.scrollTo;
  Element.prototype.scrollTo = function (a, b) {
    if (a && typeof a === 'object' && a.behavior === 'smooth') {
      const el = this, x0 = el.scrollLeft, y0 = el.scrollTop, x1 = a.left ?? x0, y1 = a.top ?? y0, t0 = ahora;
      const paso = () => {
        const u = Math.min(1, (ahora - t0) / 420), e = 1 - (1 - u) ** 3;
        irNativo.call(el, { left: x0 + (x1 - x0) * e, top: y0 + (y1 - y0) * e, behavior: 'instant' });
        if (u < 1) window.requestAnimationFrame(paso);
      };
      window.requestAnimationFrame(paso);
      return;
    }
    return irNativo.call(this, a, b);
  };
  const verNativo = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (o) { return verNativo.call(this, o && typeof o === 'object' ? { ...o, behavior: 'instant' } : o); };
  const vistas = new WeakMap();
  window.__avanzar = (ms, paso = 1000 / 60) => {
    const meta = ahora + ms;
    while (ahora < meta - 1e-6) {
      ahora = Math.min(meta, ahora + paso);
      for (let guarda = 0; guarda < 500; guarda++) {
        let prox = null;
        for (const entrada of temporizadores) if (entrada[1].en <= ahora && (!prox || entrada[1].en < prox[1].en)) prox = entrada;
        if (!prox) break;
        const [id, t] = prox;
        if (t.cada) t.en += t.cada; else temporizadores.delete(id);
        try { typeof t.fn === 'function' ? t.fn(...t.args) : (0, eval)(t.fn); } catch (e) { console.error(e); }
      }
      const cbs = [...cuadros.values()];
      cuadros.clear();
      for (const cb of cbs) { try { cb(ahora); } catch (e) { console.error(e); } }
    }
    for (const a of document.getAnimations()) {
      let ini = vistas.get(a);
      if (ini === undefined) { ini = ahora - (a.currentTime || 0); vistas.set(a, ini); }
      a.pause();
      a.currentTime = Math.max(0, ahora - ini);
    }
    return ahora;
  };
})();`;

const suave = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const enOut = (u) => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;
const ESCRITORIO = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 };
const MOVIL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true };

/** Posición absoluta (scrollY) de un elemento, con desplazamiento. */
const yDe = (page, sel, off = 0) => page.evaluate(([s, o]) => document.querySelector(s).getBoundingClientRect().top + scrollY + o, [sel, off]);
const centroDe = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

/**
 * Tomas: { dispositivo, duracion, previo (s de reloj antes de grabar), preparar(page) → scrollY
 * inicial, scroll(t, y0) → scrollY, acciones: [[t, async (page, toques) => …]] }.
 */
const TOMAS = {
  escritorio_portada: { dispositivo: ESCRITORIO, duracion: 3.4, previo: 0,
    acciones: [[0, (p) => p.mouse.move(720, 450)], ...Array.from({ length: 20 }, (_, k) => [1.4 + k * 0.1, (p) => p.mouse.move(720 + 300 * enOut(k / 19), 450 - 90 * enOut(k / 19))])] },
  escritorio_scroll: { dispositivo: ESCRITORIO, duracion: 2.6, previo: 3.4,
    preparar: async (p) => ({ fin: await yDe(p, '#beat', 0) }),
    scroll: (t, d) => d.fin * suave(Math.min(1, t / 2.3)) },
  escritorio_mapa: { dispositivo: { ...ESCRITORIO, deviceScaleFactor: 2 }, duracion: 3.4, previo: 0.6, cajas: ['[data-map]'],
    preparar: async (p) => ({ y: await p.evaluate(() => { const r = document.querySelector('[data-map]').getBoundingClientRect(); return r.top + scrollY - (innerHeight - r.height) / 2; }) }),
    scroll: (t, d) => d.y,
    acciones: [[2.5, async (p) => { const c = await centroDe(p, '.pin[data-pin="7"]'); await p.mouse.move(c.x, c.y); }]] },
  escritorio_mezclador: { dispositivo: { ...ESCRITORIO, deviceScaleFactor: 2 }, duracion: 2.6, previo: 0.6, cajas: ['[data-mixer]', '.mx-body'],
    preparar: async (p) => ({ y: await p.evaluate(() => { const r = document.querySelector('[data-mixer]').getBoundingClientRect(); return r.top + scrollY - (innerHeight - r.height) / 2; }) }),
    scroll: (t, d) => d.y,
    acciones: [[0.12, async (p, toques) => { const c = await centroDe(p, '.mx-play'); await p.mouse.click(c.x, c.y); toques.push({ t: 0.12, ...c }); }],
      ...Array.from({ length: 30 }, (_, k) => [0.5 + k * 0.05, (p) => p.evaluate((v) => { const x = document.querySelector('[data-xf]'); x.value = v; x.dispatchEvent(new Event('input', { bubbles: true })); }, Math.round(50 + (k < 10 ? -38 * suave(k / 9) : -38 + 126 * suave((k - 10) / 19))))])] },
  escritorio_polaroids: { dispositivo: ESCRITORIO, duracion: 2.6, previo: 0.6, cajas: ['#flash-2'],
    preparar: async (p) => ({ y: await yDe(p, '#flash-2', 0) }),
    scroll: (t, d) => d.y },
  escritorio_agenda: { dispositivo: ESCRITORIO, duracion: 2.6, previo: 0.6, cajas: ['[data-cal]', '[data-ag-live]'],
    preparar: async (p) => ({ y: await yDe(p, '[data-ag-live]', -170) }),
    scroll: (t, d) => d.y,
    acciones: [[1.15, async (p, toques) => { const c = await centroDe(p, '.cal-ev[data-ev="23"]'); await p.mouse.click(c.x, c.y); toques.push({ t: 1.15, ...c }); }]] },
  escritorio_carta: { dispositivo: ESCRITORIO, duracion: 2.4, previo: 0.6, cajas: ['[data-panels]', '[data-ticket]'],
    preparar: async (p) => ({ y: await yDe(p, '[data-panels]', -120) }),
    scroll: (t, d) => d.y,
    acciones: [[0.2, '.price[data-k="0-0-0-0"]'], [0.43, '.price[data-k="0-1-1-0"]'], [0.66, '.price[data-k="1-3-0-0"]'], [0.9, '.price[data-k="1-3-1-0"]'], [1.13, '.price[data-k="1-1-0-1"]'], [1.42, '[data-split="1"]'], [1.62, '[data-split="1"]']]
      .map(([t, sel]) => [t, async (p, toques) => { const c = await centroDe(p, sel); await p.mouse.click(c.x, c.y); toques.push({ t, ...c }); }]) },
  movil_portada: { dispositivo: MOVIL, duracion: 3.4, previo: 0 },
  movil_scroll: { dispositivo: MOVIL, duracion: 2.6, previo: 3.4,
    preparar: async (p) => ({ fin: await yDe(p, '#contenido', 0) }),
    scroll: (t, d) => d.fin * suave(Math.min(1, t / 2.3)) },
  movil_mapa: { dispositivo: MOVIL, duracion: 3.0, previo: 0.6, cajas: ['[data-map-scroller]', '#mapa-h'],
    preparar: async (p) => ({ y: await yDe(p, '#mapa', 40) }),
    scroll: (t, d) => d.y,
    acciones: [[1.6, async (p, toques) => { const c = await centroDe(p, '[data-map-list] button[data-pin="7"]'); await p.touchscreen.tap(c.x, c.y); toques.push({ t: 1.6, ...c }); }]] },
  movil_mezclador: { dispositivo: MOVIL, duracion: 2.6, previo: 0.6, cajas: ['[data-mixer]', '.mx-body'],
    preparar: async (p) => ({ y: await p.evaluate(() => { const r = document.querySelector('[data-mixer]').getBoundingClientRect(); return r.top + scrollY - (innerHeight - r.height) / 2; }) }),
    scroll: (t, d) => d.y,
    acciones: [[0.12, async (p, toques) => { const c = await centroDe(p, '.mx-play'); await p.touchscreen.tap(c.x, c.y); toques.push({ t: 0.12, ...c }); }],
      ...Array.from({ length: 30 }, (_, k) => [0.5 + k * 0.05, (p) => p.evaluate((v) => { const x = document.querySelector('[data-xf]'); x.value = v; x.dispatchEvent(new Event('input', { bubbles: true })); }, Math.round(50 + (k < 10 ? -38 * suave(k / 9) : -38 + 126 * suave((k - 10) / 19))))])] },
  movil_polaroids: { dispositivo: MOVIL, duracion: 2.4, previo: 0.6, cajas: ['#flash-2'],
    preparar: async (p) => ({ y: await p.evaluate(() => { const r = document.querySelector('#flash-2').getBoundingClientRect(); return r.top + scrollY - (innerHeight - r.height) / 2; }) }),
    scroll: (t, d) => d.y },
  movil_agenda: { dispositivo: MOVIL, duracion: 2.4, previo: 0.6, cajas: ['[data-ag-live]', '[data-cal]'],
    preparar: async (p) => ({ y: await yDe(p, '#agenda', 60) }),
    scroll: (t, d) => d.y + 380 * suave(Math.max(0, (t - 0.5) / 1.6)) },
  movil_carta: { dispositivo: MOVIL, duracion: 2.6, previo: 0.6, cajas: ['[data-panels]'],
    preparar: async (p) => ({ y: await yDe(p, '[data-panels]', -90) }),
    scroll: (t, d) => d.y,
    acciones: [[0.2, '.price[data-k="0-0-0-0"]'], [0.43, '.price[data-k="0-1-1-0"]'], [0.66, '.price[data-k="0-1-3-0"]'], [0.9, '.price[data-k="0-0-2-1"]'], [1.3, '[data-tk-fab]'], [1.85, '[data-split="1"]'], [2.1, '[data-split="1"]']]
      .map(([t, sel]) => [t, async (p, toques) => { const c = await centroDe(p, sel); await p.touchscreen.tap(c.x, c.y); toques.push({ t, ...c }); }]) },
};

// el arrastre de la polaroid se define aparte: necesita la posición inicial
TOMAS.escritorio_polaroids.acciones = (() => {
  const acc = [];
  let c0 = null;
  acc.push([1.5, async (p) => { c0 = await centroDe(p, '#flash-2 .pol:nth-child(4)'); await p.mouse.move(c0.x, c0.y); await p.mouse.down(); }]);
  for (let k = 1; k <= 14; k++) acc.push([1.5 + k * 0.05, async (p) => { const u = enOut(k / 14); await p.mouse.move(c0.x - 300 * u, c0.y - 120 * u + 40 * Math.sin(u * Math.PI)); }]);
  acc.push([2.25, (p) => p.mouse.up()]);
  return acc;
})();

const navegador = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });
try {
  for (const [nombre, toma] of Object.entries(TOMAS)) {
    if (pedidas.length && !pedidas.includes(nombre)) continue;
    const dir = join(salida, nombre);
    if (!process.env.SOLO_CAJAS) { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); }
    const ctx = await navegador.newContext({ ...toma.dispositivo, reducedMotion: 'no-preference' });
    await ctx.addInitScript({ content: RELOJ });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.goto(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    const avanzar = (ms) => page.evaluate((m) => window.__avanzar(m), ms);
    // reloj previo (la intro, por ejemplo) con fotogramas reales de por medio para el IntersectionObserver
    for (let t = 0; t < toma.previo * 1000; t += 1000 / FPS) { await avanzar(1000 / FPS); if (Math.round(t) % 100 < 17) await page.waitForTimeout(8); }
    const datos = toma.preparar ? await toma.preparar(page) : {};
    const acciones = (toma.acciones ?? []).slice().sort((a, b) => a[0] - b[0]);
    const toques = [];
    if (toma.scroll) { await page.evaluate((y) => scrollTo(0, y), toma.scroll(0, datos)); await page.waitForTimeout(60); await avanzar(0); await page.waitForTimeout(60); }
    const cajas = await page.evaluate((sels) => Object.fromEntries(sels.map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [s, { x: r.left, y: r.top, w: r.width, h: r.height }]; })), toma.cajas ?? []);
    if (process.env.SOLO_CAJAS) {
      const ruta = join(dir, 'meta.json');
      writeFileSync(ruta, JSON.stringify({ ...JSON.parse(readFileSync(ruta, 'utf8')), cajas }, null, 1));
      console.log(`${nombre}: cajas ${JSON.stringify(cajas)}`);
      await ctx.close();
      continue;
    }
    const total = Math.round(toma.duracion * FPS);
    const t0 = Date.now();
    for (let f = 0; f < total; f++) {
      const t = f / FPS;
      while (acciones.length && acciones[0][0] <= t + 1e-6) { const [, fn] = acciones.shift(); await fn(page, toques); }
      if (toma.scroll) await page.evaluate((y) => scrollTo(0, y), toma.scroll(t, datos));
      await avanzar(f === 0 ? 0 : 1000 / FPS);
      await page.screenshot({ path: join(dir, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 90 });
    }
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ fps: FPS, fotogramas: total, ...toma.dispositivo, toques, cajas }, null, 1));
    console.log(`${nombre}: ${total} fotogramas en ${((Date.now() - t0) / 1000).toFixed(0)} s${errores.length ? ' · errores: ' + errores.join(' | ') : ''}`);
    await ctx.close();
  }
} finally {
  await navegador.close();
}
