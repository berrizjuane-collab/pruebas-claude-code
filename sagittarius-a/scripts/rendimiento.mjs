/**
 * Medición de rendimiento en un navegador real (Chromium con Playwright).
 *
 * Compila la aplicación, la sirve con «vite preview» y ejecuta el banco de pruebas del motor
 * (Engine.benchmark: cada fotograma se traza completo, sin reutilizar la acumulación) para cada
 * perfil y escala de render. Guarda docs/validacion/rendimiento.json.
 *
 * IMPORTANTE: sin GPU, Chromium usa SwiftShader (rasterizado por CPU) y las cifras NO representan
 * una GPU real. El propio informe registra el renderizador usado.
 *
 *   npm run rendimiento                     (1280×720, escalas 0,25 y 0,5, 12 s por medida)
 *   ESCALAS=0.5,1 SEGUNDOS=8 GPU=1 npm run rendimiento   (GPU=1: no forzar SwiftShader)
 */
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = Number(process.env.ANCHO ?? 1280);
const H = Number(process.env.ALTO ?? 720);
const escalas = (process.env.ESCALAS ?? '0.25,0.5').split(',').map(Number);
const segundos = Number(process.env.SEGUNDOS ?? 12);
const perfiles = (process.env.PERFILES ?? 'cinematic,eht,spacetime').split(',');
const outBuild = join(raiz, 'node_modules/.cache/rendimiento-build');
execFileSync('npx', ['vite', 'build', '--outDir', outBuild, '--emptyOutDir', '--logLevel', 'warn'], { cwd: raiz, stdio: 'inherit' });
const server = spawn('npx', ['vite', 'preview', '--outDir', outBuild, '--port', '5195', '--strictPort'], { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const base = await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('vite preview no arrancó')), 60000);
  let buf = '';
  server.stdout.on('data', (d) => {
    buf += String(d).replace(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g'), '');
    const m = buf.match(/Local:\s+(http:\/\/localhost:\d+\/)/);
    if (m) {
      clearTimeout(to);
      res(m[1]);
    }
  });
});
const args = process.env.GPU === '1' ? ['--ignore-gpu-blocklist', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });
const filas = [];
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[error]', e.message));
  await page.goto(`${base}?escala=0.2&intro=0&deriva=0&ui=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__obs, null, { timeout: 180000, polling: 500 });
  const gpu = await page.evaluate(() => window.__obs.engine.gpu);
  console.log('Renderizador:', gpu);
  for (const perfil of perfiles) {
    for (const escala of escalas) {
      await page.evaluate((p) => window.__store.set({ profile: p, quality: 'interactive' }), perfil);
      const r = await page.evaluate(async ([s, e]) => window.__obs.engine.benchmark(s, e), [segundos, escala]);
      const fila = { perfil, escala, ancho: r.width, alto: r.height, fotogramas: r.frames, fps: +r.fps.toFixed(3), msPorFotograma: +r.msPerFrame.toFixed(1), rayosPorSegundo: Math.round(r.raysPerSecond) };
      filas.push(fila);
      console.log(JSON.stringify(fila));
    }
  }
  mkdirSync(join(raiz, 'docs/validacion'), { recursive: true });
  writeFileSync(join(raiz, 'docs/validacion/rendimiento.json'), JSON.stringify({ fecha: new Date().toISOString(), renderizador: gpu, ventana: [W, H], segundos, filas }, null, 2));
  console.log('Guardado en docs/validacion/rendimiento.json');
} finally {
  await browser.close();
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill();
  }
}
