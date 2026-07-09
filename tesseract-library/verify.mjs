// Verificación de extremo a extremo en Chromium headless (SwiftShader):
// carga el artifact real, espera el primer frame, lee las validaciones
// matemáticas, ejercita picking + re-anclaje + señal Morse (que ahora
// BIFURCA el árbol temporal) + navegación a una rama alternativa, y
// captura pantallas para dirección de arte.

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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
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
const statsBefore = await page.evaluate('window.__ENGINE__.debug.treeStats()');

await frames(30);
await page.screenshot({ path: 'shots/01-default.png' });

// picking sintético (devuelve claves de nodo)
const picks = [];
for (const [nx, ny] of [[-0.35, 0.1], [-0.5, 0.15], [-0.2, 0.05], [0.3, 0.0], [-0.65, 0.2]]) {
  picks.push(await page.evaluate(`window.__ENGINE__.debug.pickAt(${nx}, ${ny})`));
}

// ── REGRESIÓN #2 (camino DOM real): riel → botón ENTRAR ──
await page.locator('.rail-node', { hasText: 'T−3' }).first().click();
await frames(8);
const enterBtnText = await page.locator('.enter-btn').textContent().catch(() => null);
await page.locator('.enter-btn').click();
await frames(140);
const anchorAfterDomButton = await page.evaluate('window.__ENGINE__.debug.getAnchor()');

// ── REGRESIÓN #1 (camino DOM real): colapsar/desplegar no poda el árbol ──
const nodesBeforeCycle = (await page.evaluate('window.__ENGINE__.debug.treeStats()')).nodes;
await page.click('button:has-text("colapsar")');
await frames(110);
await page.click('button:has-text("desplegar")');
await frames(110);
const nodesAfterCycle = (await page.evaluate('window.__ENGINE__.debug.treeStats()')).nodes;
const roomsAfterCycle = await page.evaluate('window.__ENGINE__.debug.getRooms().length');

// re-anclaje lineal: entrar a T−2 en la línea troncal (vía API)
await page.evaluate(`
  const r = window.__ENGINE__.debug.getRooms().find((r) => r.t === -2 && r.tag === '');
  window.__ENGINE__.select(r.key);
`);
await frames(10);
await page.screenshot({ path: 'shots/02-selected.png' });
await page.evaluate('window.__ENGINE__.enterSelected()');
await frames(110);
const anchorAfterEnter = await page.evaluate('window.__ENGINE__.debug.getAnchor()');

// intervención: la señal Morse bifurca el instante ancla
await page.evaluate('window.__ENGINE__.debug.triggerSignal()');
await frames(45);
const signalPhase = await page.evaluate('window.__ENGINE__.debug.getSignalPhase()');
const statsForked = await page.evaluate('window.__ENGINE__.debug.treeStats()');
const roomsForked = await page.evaluate('window.__ENGINE__.debug.getRooms()');
await page.screenshot({ path: 'shots/04-morse.png' });
await frames(120); // dejar que la señal se disuelva

// navegación de rama: entrar a una línea alternativa (tag ≠ '')
const branchTarget = roomsForked.find((r) => r.tag !== '' && r.timeIndex > 0);
await page.evaluate(`window.__ENGINE__.select(${JSON.stringify(branchTarget?.key ?? null)})`);
await frames(8);
await page.evaluate('window.__ENGINE__.enterSelected()');
await frames(110);
const anchorInBranch = await page.evaluate('window.__ENGINE__.debug.getAnchor()');
const statsInBranch = await page.evaluate('window.__ENGINE__.debug.treeStats()');
await page.screenshot({ path: 'shots/03-branch-anchored.png' });

// colapsar el tiempo (ángulos → 0: el árbol se anida concéntrico)
await page.evaluate('window.__ENGINE__.collapseTime()');
await frames(110);
await page.screenshot({ path: 'shots/05-collapsed.png' });

const report = {
  validation,
  statsBefore,
  picks,
  enterBtnText,
  anchorAfterDomButton,
  nodesBeforeCycle,
  nodesAfterCycle,
  roomsAfterCycle,
  anchorAfterEnter,
  signalPhase,
  statsForked,
  forkNodesRendered: roomsForked.filter((r) => r.isFork).length,
  branchTargetKey: branchTarget?.key,
  anchorInBranch,
  statsInBranch,
  consoleErrors: errors,
};
console.log(JSON.stringify(report, null, 2));

await browser.close();

const failed =
  errors.length > 0 ||
  !validation?.ok ||
  // regresión #2: el botón ENTRAR del riel (click DOM) tiene que re-anclar
  anchorAfterDomButton?.t !== -3 || anchorAfterDomButton?.tag !== '' ||
  // regresión #1: colapsar/desplegar (y el governor) no pueden podar el árbol
  nodesAfterCycle !== nodesBeforeCycle || roomsAfterCycle !== nodesAfterCycle ||
  anchorAfterEnter?.t !== -2 || anchorAfterEnter?.tag !== '' ||
  !picks.some((p) => p !== null) ||
  !['forming', 'hold', 'release'].includes(signalPhase) ||
  // la intervención tiene que haber agregado ramas reales al árbol
  // (criterio independiente de la calidad adaptativa: líneas alternativas
  // materializadas y nodos de bifurcación renderizados)
  !(statsForked.forks >= 1 && statsForked.lines >= 3) ||
  !roomsForked.some((r) => r.tag !== '') ||
  statsForked.edges !== statsForked.nodes - 1 ||
  // y tenemos que haber podido anclarnos DENTRO de una rama alternativa
  !anchorInBranch?.tag ||
  statsInBranch.edges !== statsInBranch.nodes - 1;
process.exit(failed ? 1 : 0);
