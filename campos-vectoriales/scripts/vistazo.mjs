/**
 * Vistazo rápido durante el desarrollo: abre la aplicación (servidor de Vite), ejecuta unos
 * pasos opcionales con Playwright y guarda una captura.
 *   node scripts/vistazo.mjs salida.png [consulta] [ancho] [alto] [pasos.mjs]
 * `pasos.mjs` exporta por defecto `async (page) => { … }` (clics, escritura…).
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [, , salida, consulta = '', ancho = '1440', alto = '900', pasos = ''] = process.argv;
const servidor = spawn('npx', ['vite', '--port', '5181', '--strictPort'], { stdio: 'ignore', cwd: process.cwd() });
const base = 'http://localhost:5181/';
for (let i = 0; i < 60; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
const nav = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-lcd-text'] });
const ctx = await nav.newContext({ viewport: { width: Number(ancho), height: Number(alto) }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errores.push(m.text()));
await page.goto(`${base}?captura=1${consulta ? '&' + consulta : ''}`);
if (!consulta.includes('muestras')) await page.waitForFunction(() => window.__campos?.listo === true, null, { timeout: 60000 });
if (pasos) {
  const { default: ejecutar } = await import(pathToFileURL(resolve(pasos)).href);
  await ejecutar(page);
}
await page.waitForTimeout(500);
await page.screenshot({ path: salida, fullPage: false });
console.log(errores.length ? errores.join('\n') : 'sin errores');
await nav.close();
servidor.kill();
