/**
 * Capturas de documentación (docs/capturas, JPEG de calidad 88). Requiere el servidor en marcha:
 *   npm run dev   y en otra terminal   npm run capturas      (o URL=http://… para otra build)
 * Sin GPU se usa SwiftShader: es lento (minutos por captura en calidad Alta) pero fiel.
 * `npm run capturas -- 03` repite solo las capturas cuyo nombre contiene «03».
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:5173/';
const OUT = 'docs/capturas';
mkdirSync(OUT, { recursive: true });
const gpu = process.env.PERF_GPU === '1';
const args = gpu ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const shots = [
  { file: '01-vista-general.jpg', q: 'alta', view: 'general' },
  { file: '02-rutas-abruzzi-cesen.jpg', q: 'alta', view: 'abruzzi' },
  { file: '03-bottleneck-serac.jpg', q: 'alta', view: 'bottleneck' },
  { file: '04-cumbre-ficha.jpg', q: 'alta', view: 'cumbre', select: 'cumbre' },
  { file: '05-hombro-c4.jpg', q: 'alta', view: 'hombro', select: 'c4' },
  { file: '06-cara-norte.jpg', q: 'alta', view: 'norte' },
  { file: '07-luz-de-tarde.jpg', q: 'alta', view: 'general', light: 'tarde' },
  { file: '08-procedencia-del-relieve.jpg', q: 'media', view: 'cumbre', dem: true },
  { file: '09-lod-por-bloques.jpg', q: 'media', view: 'general', extra: 'lod=1' },
  { file: '10-movil.jpg', q: 'media', view: 'general', mobile: true },
  { file: '11-movil-panel.jpg', q: 'media', view: 'general', mobile: true, openPanel: true },
  { file: '12-movil-ficha.jpg', q: 'media', view: 'bottleneck', mobile: true, select: 'bottleneck' },
];

const only = process.argv[2];
const browser = await chromium.launch({ args });
for (const s of shots) {
  if (only && !s.file.includes(only)) continue;
  const ctx = s.mobile
    ? await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    : await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${URL}?q=${s.q}${s.extra ? `&${s.extra}` : ''}`);
  await page.waitForFunction(() => window.__k2?.ready || window.__k2?.error, null, { timeout: 180000 });
  await page.evaluate((s) => {
    const a = window.__k2.app;
    a.cam.reducedMotion = true;
    if (s.light) a.setLight(s.light);
    if (s.dem) a.setDemOverlay(true);
    a.goToView(s.view);
    if (s.select) a.selectPoi(s.select, false);
    a.cam.reducedMotion = false;
  }, s);
  if (s.dem) await page.locator('#t-dem').check({ force: true });
  if (s.light) await page.locator(`#light-presets input[value=${s.light}]`).check({ force: true });
  if (s.openPanel) await page.locator('#panel-toggle').click();
  await page.evaluate(() => window.__k2.app.settleForCapture());
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/${s.file}`, type: 'jpeg', quality: 88, timeout: 600000 });
  console.log('✓', s.file);
  await ctx.close();
}
await browser.close();
