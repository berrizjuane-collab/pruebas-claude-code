/**
 * Sonda del HTML autocontenido: lo abre con file:// y la red cortada, espera a que la
 * aplicación esté lista y resume modo de cálculo, errores y peticiones externas.
 *   node scripts/sonda-file.mjs ruta/al/archivo.html
 */
import { chromium } from '@playwright/test';
const archivo = 'file://' + process.argv[2];
const navegador = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-lcd-text'] });
const contexto = await navegador.newContext();
await contexto.setOffline(true);
const page = await contexto.newPage();
const consola = [];
const peticiones = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && consola.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => consola.push(`pageerror: ${e.message}`));
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('file:')) peticiones.push(u);
});
await page.goto(`${archivo}?captura=1`);
await page.waitForFunction(() => window.__campos?.listo === true, null, { timeout: 30000 });
const resultado = await page.evaluate(() => ({
  modo: window.__campos.modoCalculo,
  flechas: window.__campos.escena().flechas,
  familia: getComputedStyle(document.body).fontFamily,
}));
console.log(JSON.stringify({ archivo, ...resultado, consola, peticionesExternas: peticiones }, null, 1));
await navegador.close();
