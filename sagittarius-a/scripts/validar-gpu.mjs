/**
 * Lanza la página de validación GPU ↔ CPU en Chromium (WebGL2 por software, SwiftShader) y
 * guarda el informe en docs/validacion/gpu.json.
 * Uso: npm run validar:gpu [-- N]   (N = resolución por lado, 40 por defecto)
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = Number(process.argv[2] ?? 40);
const server = spawn('npx', ['vite', '--port', '5190'], { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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
console.log('vite listo');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  console.log('navegador listo');
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[página]', m.text()));
  await page.goto(`${base}validacion.html?n=${N}`);
  await page.waitForFunction(() => window.__validation, null, { timeout: 30 * 60 * 1000, polling: 1000 });
  const out = await page.evaluate(() => window.__validation);
  mkdirSync(join(raiz, 'docs', 'validacion'), { recursive: true });
  writeFileSync(join(raiz, 'docs', 'validacion', 'gpu.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill();
  }
}
