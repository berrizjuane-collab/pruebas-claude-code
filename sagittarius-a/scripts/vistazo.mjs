/**
 * Captura rápida de la aplicación (desarrollo): node scripts/vistazo.mjs [salida.png] [ancho] [alto] [muestras] [js-de-preparación]
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? '/tmp/vistazo.png';
const W = Number(process.argv[3] ?? 640);
const H = Number(process.argv[4] ?? 360);
const samples = Number(process.argv[5] ?? 8);
const prep = process.argv[6] ?? '';
const server = spawn('npx', ['vite', '--port', '5192'], { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const base = await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('vite no arrancó')), 60000);
  let buf = '';
  server.stdout.on('data', (d) => {
    buf += String(d).replace(/\x1b\[[0-9;]*m/g, '');
    const m = buf.match(/Local:\s+(http:\/\/localhost:\d+\/)/);
    if (m) {
      clearTimeout(to);
      res(m[1]);
    }
  });
});
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('console', (m) => { const t = m.text(); if (!t.includes('GPU stall')) console.log('[página]', t.slice(0, 400)); });
  page.on('pageerror', (e) => console.log('[error]', e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.__engine, null, { timeout: 120000 });
  if (prep) await page.evaluate(prep);
  const t0 = Date.now();
  await page.evaluate(async (n) => {
    const e = window.__engine;
    e.nav.autoOrbit = 0;
    await e.capture(n);
    e.stop();
  }, samples);
  console.log('captura en', Date.now() - t0, 'ms');
  await page.screenshot({ path: out, timeout: 120000 });
  console.log(JSON.stringify(await page.evaluate(() => window.__store ? null : null)));
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); }
}
