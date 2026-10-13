/**
 * Recorrido automático de la aplicación real en Chromium (Playwright): arranca Vite, abre el
 * observatorio, ejecuta acciones (lanzar objetos, cambiar de perspectiva, abrir paneles) y guarda
 * capturas. Informa de cualquier error de la página o de la consola.
 *
 *   node scripts/recorrido.mjs <directorio-salida> [ancho] [alto] ["inicio|click:ARROJAR|tecla:Digit2|foto:nombre|…"]
 */
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? '/tmp/recorrido';
const W = Number(process.argv[3] ?? 1280);
const H = Number(process.argv[4] ?? 720);
const pasos = (process.argv[5] ?? 'inicio').split('|');
mkdirSync(outDir, { recursive: true });

// Compilación de producción servida con «vite preview»: sin recargas en caliente si se editan fuentes
const outBuild = join(raiz, 'node_modules/.cache/recorrido-build');
execFileSync('npx', ['vite', 'build', '--outDir', outBuild, '--emptyOutDir', '--logLevel', 'warn'], { cwd: raiz, stdio: 'inherit' });
const server = spawn('npx', ['vite', 'preview', '--outDir', outBuild, '--port', '5193', '--strictPort'], { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const base = await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('vite no arrancó')), 60000);
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
const errores = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('GPU stall') || t.includes('[vite]') || t.includes('React DevTools')) return;
    if (m.type() === 'error' || m.type() === 'warning') errores.push(`[consola:${m.type()}] ${t.slice(0, 500)}`);
    console.log('[página]', t.slice(0, 300));
  });
  page.on('pageerror', (e) => {
    errores.push(`[error] ${e.message}`);
    console.log('[error]', e.message);
  });
  // Escala de render baja: SwiftShader (CPU) es lento; la interfaz se dibuja a resolución completa
  await page.goto(`${base}?escala=${process.env.ESCALA ?? '0.3'}&intro=0&deriva=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__obs, null, { timeout: 180000, polling: 500 });
  const escalaFoto = Number(process.env.ESCALA_FOTO ?? 0.3);
  const muestrasFoto = Number(process.env.MUESTRAS ?? 2);
  const foto = async (nombre) => {
    const t0 = Date.now();
    await page.evaluate(async ([n, e]) => {
      const o = window.__obs;
      await o.engine.capture(n, e);
    }, [muestrasFoto, escalaFoto]);
    await page.screenshot({ path: join(outDir, `${nombre}.png`), timeout: 180000 });
    console.log(`captura ${nombre} en ${Date.now() - t0} ms`);
  };
  for (const paso of pasos) {
    const i = paso.indexOf(':');
    const accion = i < 0 ? paso : paso.slice(0, i);
    const arg = i < 0 ? '' : paso.slice(i + 1);
    console.log('— paso', paso);
    switch (accion) {
      case 'inicio':
        await espera(2500);
        await foto('01-inicio');
        break;
      case 'eval':
        console.log(await page.evaluate(arg));
        break;
      case 'esperar':
        await espera(Number(arg));
        break;
      case 'click':
        // force: con SwiftShader cada fotograma tarda segundos y la comprobación de «estabilidad» caduca
        await page.getByRole('button', { name: arg }).first().click({ force: true, timeout: 120000 });
        break;
      case 'radio':
        await page.getByRole('radio', { name: arg }).first().click({ force: true, timeout: 120000 });
        break;
      case 'tecla':
        await page.keyboard.press(arg);
        break;
      case 'foto':
        await foto(arg);
        break;
      case 'estado':
        console.log(
          JSON.stringify(
            await page.evaluate(() => {
              const s = window.__store.get();
              return { view: s.view, panel: s.panel, exps: s.experiments.map((e) => [e.label, e.status, e.events.map((v) => v.kind)]), tel: s.telemetry && { r: s.telemetry.r, tau: s.telemetry.tau, st: s.telemetry.captureState }, t: s.live.t, fps: s.live.fps };
            }),
          ),
        );
        break;
      default:
        throw new Error(`paso desconocido: ${paso}`);
    }
  }
} finally {
  await browser.close();
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill();
  }
}
console.log(errores.length ? `ERRORES (${errores.length}):\n${errores.join('\n')}` : 'Sin errores de página ni de consola.');
process.exit(errores.length ? 1 : 0);
