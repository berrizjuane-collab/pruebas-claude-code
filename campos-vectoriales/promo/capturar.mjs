/**
 * Tomas del vídeo promocional grabadas con el laboratorio real (HTML de `entrega/`), fotograma
 * a fotograma: el modo captura congela el reloj y cada fotograma fija la cámara (o la pose de
 * vuelo), avanza el reloj una cantidad exacta y espera al cálculo de ese instante. Así las tomas
 * son reproducibles y no dependen de la velocidad de la máquina.
 *
 *   node promo/capturar.mjs <carpeta de salida> [toma …]
 *
 * Cada toma queda en <salida>/<toma>/0000.jpg … y <salida>/<toma>/meta.json (t de cada fotograma).
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const salida = resolve(process.argv[2] ?? 'promo/tomas');
const pedidas = process.argv.slice(3);
const html = pathToFileURL(resolve('entrega/campos-vectoriales.html')).href;
const FPS = 30;

const suave = (x) => x * x * (3 - 2 * x);

/** Espera a que el cálculo esté al día (con un campo temporal, el del instante del reloj). */
async function alDia(page) {
  await page.waitForFunction(
    () => {
      const c = window.__campos;
      const p = c.pendiente();
      const r = c.resultados();
      if (!r.malla || p.malla || p.lineas || p.corte) return false;
      return !c.animacion().temporal || r.malla.t === c.reloj();
    },
    null,
    { timeout: 120000 },
  );
}

async function elegirCampo(page, id) {
  await page.locator(`[data-campo="${id}"]`).click();
  await page.waitForFunction((v) => window.__campos.estado().base === v, id);
  await alDia(page);
}

async function entrarVistaLibre(page) {
  await page.locator('[data-prueba="boton-vista-libre"]').click();
  await page.waitForFunction(() => window.__campos.vistaLibre().activa === true);
  // La pista de teclas aparece un instante después de entrar: se espera y H la oculta.
  await page.waitForFunction(() => document.querySelector('[data-prueba="vl-pista"]')?.getAttribute('data-visible') === 'true', null, { timeout: 5000 }).catch(() => {});
  if ((await page.locator('[data-prueba="vl-pista"]').getAttribute('data-visible')) === 'true') await page.keyboard.press('h');
  await page.waitForFunction(() => document.querySelector('[data-prueba="vl-pista"]')?.getAttribute('data-visible') !== 'true');
  await page.waitForTimeout(400);
}

/** Dirección de vista (azimut, elevación) desde `de` hacia `a`. */
function mirar(de, a) {
  const d = [a[0] - de[0], a[1] - de[1], a[2] - de[2]];
  return { azimut: Math.atan2(d[1], d[0]), elevacion: Math.atan2(d[2], Math.hypot(d[0], d[1])) };
}

/**
 * Tomas: `preparar` deja la escena lista; `fotograma(page, i, n)` fija cámara/pose y reloj del
 * fotograma i. `reloj` son los segundos del reloj del laboratorio que avanza cada fotograma.
 */
const TOMAS = {
  // Helicoidal con la interfaz completa: órbita lenta con acercamiento, partículas en marcha.
  'helice-ui': {
    n: 130,
    reloj: 1 / FPS,
    preparar: async (page) => {
      await page.locator('body').press('p');
      await page.waitForFunction(() => window.__campos.escena().particulas?.visible === true);
      await alDia(page);
      return { camara: await page.evaluate(() => window.__campos.camara()) };
    },
    fotograma: async (page, i, n, ctx) => {
      const { posicion: p0, objetivo: o } = ctx.camara;
      const v = [p0[0] - o[0], p0[1] - o[1], p0[2] - o[2]];
      const r0 = Math.hypot(...v);
      const az0 = Math.atan2(v[1], v[0]);
      const pol0 = Math.acos(v[2] / r0);
      const s = suave(i / (n - 1));
      const az = az0 - 0.55 * s;
      const r = r0 * (1 - 0.16 * s);
      const pol = pol0 + 0.06 * s;
      const posicion = [o[0] + r * Math.sin(pol) * Math.cos(az), o[1] + r * Math.sin(pol) * Math.sin(az), o[2] + r * Math.cos(pol)];
      await page.evaluate((c) => window.__campos.fijarCamara(c), { posicion, objetivo: o });
    },
  },
  // Lluvia con ráfagas desde dentro de la vista libre, avanzando despacio; el tiempo corre.
  lluvia: {
    n: 130,
    reloj: 2.4 / FPS,
    preparar: async (page) => {
      await elegirCampo(page, 'lluvia');
      await page.evaluate(() => window.__campos.fijarEstado((s) => ({ ...s, particulas: { ...s.particulas, n: 1600 } })));
      await alDia(page);
      await entrarVistaLibre(page);
      return {};
    },
    fotograma: async (page, i, n) => {
      const s = i / (n - 1);
      const de = [-0.35 + 0.25 * s, -4.3 + 1.5 * suave(s), 0.55 - 0.15 * s];
      const { azimut, elevacion } = mirar(de, [0.15, 1.5, -0.1]);
      await page.evaluate(([p, a, e]) => window.__campos.fijarPoseVuelo(p, a, e), [de, azimut, elevacion]);
    },
  },
  // Vuelo cabalgando una hélice del campo helicoidal (F = (−y, x, a)): la cámara sigue la tangente.
  vuelo: {
    n: 80,
    reloj: 1 / FPS,
    preparar: async (page) => {
      await page.evaluate(() => window.__campos.fijarEstado((s) => ({ ...s, particulas: { ...s.particulas, n: 1500 } })));
      await page.locator('body').press('p');
      await page.waitForFunction(() => window.__campos.escena().particulas?.visible === true);
      await alDia(page);
      await entrarVistaLibre(page);
      return {};
    },
    fotograma: async (page, i, n) => {
      // Dentro de Ω y cerca del eje: la cámara recorre una hélice y mira un poco hacia dentro.
      const R = 1.0;
      const a = 0.25;
      const th = -1.1 + 1.6 * (i / (n - 1)) + 0.25 * suave(i / (n - 1));
      const de = [R * Math.cos(th), R * Math.sin(th), -1.35 + a * (th + 1.1) * 1.4];
      const tangente = [-Math.sin(th), Math.cos(th), (a * 1.4) / R];
      const azimut = Math.atan2(tangente[1], tangente[0]) + 0.45;
      const elevacion = Math.atan2(tangente[2], Math.hypot(tangente[0], tangente[1])) + 0.06;
      await page.evaluate(([p, az, el]) => window.__campos.fijarPoseVuelo(p, az, el), [de, azimut, elevacion]);
    },
  },
  // Cortes rápidos (≈ 0.5 s cada uno, con margen).
  silla: {
    n: 22,
    reloj: 4 / FPS,
    preparar: async (page) => {
      await elegirCampo(page, 'silla-giratoria');
      // Sin líneas de corriente: en medio segundo no se leen y recalcularlas en cada instante es lo más caro.
      await page.evaluate(() => window.__campos.fijarEstado((s) => ({ ...s, capas: { ...s.capas, lineas: false }, particulas: { ...s.particulas, n: 1400 } })));
      await alDia(page);
      await entrarVistaLibre(page);
      return {};
    },
    fotograma: async (page, i, n) => {
      const s = i / (n - 1);
      const de = [0.4 - 0.5 * s, -3.6 + 0.5 * s, 3.3 - 0.3 * s];
      const { azimut, elevacion } = mirar(de, [0, 0, -0.2]);
      await page.evaluate(([p, a, e]) => window.__campos.fijarPoseVuelo(p, a, e), [de, azimut, elevacion]);
    },
  },
  viento: {
    n: 22,
    reloj: 7 / FPS,
    preparar: async (page) => {
      await elegirCampo(page, 'viento-giratorio');
      await page.evaluate(() => window.__campos.fijarEstado((s) => ({ ...s, capas: { ...s.capas, lineas: false } })));
      await alDia(page);
      await entrarVistaLibre(page);
      return {};
    },
    fotograma: async (page, i, n) => {
      const s = i / (n - 1);
      const de = [-3.9 + 0.5 * s, -2.6 + 0.3 * s, 1.9 - 0.1 * s];
      const { azimut, elevacion } = mirar(de, [0, 0, 0]);
      await page.evaluate(([p, a, e]) => window.__campos.fijarPoseVuelo(p, a, e), [de, azimut, elevacion]);
    },
  },
  'rotacional-ui': {
    n: 22,
    reloj: 1.5 / FPS,
    preparar: async (page) => {
      await elegirCampo(page, 'rotacional');
      await page.evaluate(() => window.__campos.fijarEstado((s) => ({ ...s, punto: [1, 0, 0] })));
      await page.waitForFunction(() => window.__campos.escena().rueda?.visible === true);
      await page.locator('[data-prueba="inspector"]').waitFor();
      await alDia(page);
      return { camara: await page.evaluate(() => window.__campos.camara()) };
    },
    fotograma: async (page, i, n, ctx) => {
      const { posicion: p0, objetivo: o } = ctx.camara;
      const f = 1 - 0.07 * (i / (n - 1));
      const posicion = [o[0] + (p0[0] - o[0]) * f, o[1] + (p0[1] - o[1]) * f, o[2] + (p0[2] - o[2]) * f];
      await page.evaluate((c) => window.__campos.fijarCamara(c), { posicion, objetivo: o });
    },
  },
  radial: {
    n: 22,
    reloj: 1 / FPS,
    preparar: async (page) => {
      await elegirCampo(page, 'radial-saliente');
      await page.locator('body').press('p');
      await alDia(page);
      await entrarVistaLibre(page);
      return {};
    },
    fotograma: async (page, i, n) => {
      const s = suave(i / (n - 1));
      const de = [-4.6 + 2.2 * s, -3.8 + 1.8 * s, 2.6 - 1.2 * s];
      const { azimut, elevacion } = mirar(de, [0, 0, 0]);
      await page.evaluate(([p, a, e]) => window.__campos.fijarPoseVuelo(p, a, e), [de, azimut, elevacion]);
    },
  },
};

const navegador = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [nombre, toma] of Object.entries(TOMAS)) {
    if (pedidas.length && !pedidas.includes(nombre)) continue;
    const carpeta = join(salida, nombre);
    mkdirSync(carpeta, { recursive: true });
    const contexto = await navegador.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const page = await contexto.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.goto(`${html}?captura=1`);
    await page.waitForFunction(() => window.__campos?.listo === true && (window.__campos?.escenaLista ?? true) === true, null, { timeout: 120000 });
    await alDia(page);
    const ctx = await toma.preparar(page);
    const t = [];
    const t0 = Date.now();
    // MUESTRA=1: solo el primero, el central y el último (para revisar encuadres).
    const muestra = process.env.MUESTRA ? new Set([0, Math.floor(toma.n / 2), toma.n - 1]) : null;
    for (let i = 0; i < toma.n; i++) {
      if (muestra && !muestra.has(i)) continue;
      await toma.fotograma(page, i, toma.n, ctx);
      if (i > 0) await page.evaluate((s) => window.__campos.avanzarAnimacion(s), toma.reloj);
      await alDia(page);
      await page.evaluate(() => window.__campos.dibujar());
      await page.screenshot({ path: join(carpeta, `${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
      t.push(await page.evaluate(() => window.__campos.reloj()));
    }
    writeFileSync(join(carpeta, 'meta.json'), JSON.stringify({ toma: nombre, fotogramas: toma.n, fps: FPS, t, errores }, null, 1));
    console.log(`${nombre}: ${toma.n} fotogramas en ${((Date.now() - t0) / 1000).toFixed(0)} s · errores ${errores.length}`);
    await contexto.close();
  }
} finally {
  await navegador.close();
}
