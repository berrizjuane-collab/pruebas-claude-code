// Verificación de extremo a extremo en Chromium headless (SwiftShader):
// carga el artifact real, espera el primer frame, lee las validaciones
// matemáticas, ejercita picking + re-anclaje + señal Morse, y captura
// pantallas para dirección de arte.

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const EXEC_CANDIDATES = [
  '/opt/pw-browsers/chromium',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];
const executablePath = EXEC_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) throw new Error('No se encontró Chromium preinstalado');

mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({
  executablePath,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });

const errors = [];
const logs = [];
page.on('console', (m) => {
  logs.push(`[${m.type()}] ${m.text()}`);
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const frames = (n) =>
  page.evaluate(
    (count) =>
      new Promise((res) => {
        let i = 0;
        const step = () => (++i >= count ? res() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    n
  );

await page.goto('file://' + resolve('dist/index.html'));
await page.waitForFunction('window.__TESSERACT_READY__ === true', null, { timeout: 90000 });

const validation = await page.evaluate('window.__VALIDATION__');
const rooms = await page.evaluate('window.__ENGINE__.debug.getRooms()');
const drawCalls = await page.evaluate('window.__ENGINE__.debug.drawCalls()');

await frames(30);
await page.screenshot({ path: 'shots/01-default.png' });

// picking sintético en el centro-izquierda (zona del pasillo)
const picks = [];
for (const [nx, ny] of [[-0.35, 0.1], [-0.5, 0.15], [-0.2, 0.05], [0.3, 0.0], [-0.65, 0.2]]) {
  picks.push(await page.evaluate(`window.__ENGINE__.debug.pickAt(${nx}, ${ny})`));
}

// re-anclaje: seleccionar T−2 y entrar
await page.evaluate('window.__ENGINE__.select(-2)');
await frames(10);
await page.screenshot({ path: 'shots/02-selected.png' });
await page.evaluate('window.__ENGINE__.enterSelected()');
await frames(50);
const midGlide = await page.evaluate('window.__ENGINE__.debug.getEpoch()');
await frames(70);
const epochAfter = await page.evaluate('window.__ENGINE__.debug.getEpoch()');
const geosAfter = await page.evaluate('window.__ENGINE__.debug.geometries()');
await page.screenshot({ path: 'shots/03-reanchored.png' });

// señal Morse forzada
await page.evaluate('window.__ENGINE__.debug.triggerSignal()');
await frames(45);
const signalPhase = await page.evaluate('window.__ENGINE__.debug.getSignalPhase()');
await page.screenshot({ path: 'shots/04-morse.png' });

// colapsar el tiempo (ángulos → 0: las habitaciones se anidan concéntricas)
await page.evaluate('window.__ENGINE__.collapseTime()');
await frames(110);
await page.screenshot({ path: 'shots/05-collapsed.png' });

const report = {
  validation,
  roomsInTree: rooms.length,
  roomsVisible: rooms.filter((r) => r.visible).length,
  drawCalls,
  picks,
  epochAfterEnter: epochAfter,
  epochMidGlide: midGlide,
  geometriesAfter: geosAfter,
  signalPhase,
  consoleErrors: errors,
};
console.log(JSON.stringify(report, null, 2));

await browser.close();

const failed =
  errors.length > 0 ||
  !validation?.ok ||
  epochAfter !== -2 ||
  !picks.some((p) => p !== null) ||
  !['forming', 'hold', 'release'].includes(signalPhase);
process.exit(failed ? 1 : 0);
