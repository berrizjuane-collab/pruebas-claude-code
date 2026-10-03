/**
 * Medición de rendimiento en C0 (VAL-03, VALIDATION §6.3):
 *
 *   npm run build
 *   npm run perf -- --escena=PERF-A --equipo=C0 [--fotogramas=60] [--repeticiones=10]
 *
 * Abre el HTML autocontenido (`dist/campos-vectoriales.html`) con `?perf=…&auto=1` en Chromium
 * sin interfaz a 1920 × 1080, espera el informe de la aplicación y lo guarda en
 * `evidencia/VAL-03/<fecha>-<equipo>-<escena>.json`. Después comprueba los objetivos de cálculo
 * (V-PERF-03), los de interacción (V-PERF-04) y la regresión frente al registro anterior del
 * mismo equipo y escena (V-PERF-07: ningún tiempo de cálculo empeora más de un 30 %).
 * En C0 los fotogramas no cuentan (SwiftShader, sin GPU): por defecto se miden solo 60.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const s = a.replace(/^--/, '');
    const i = s.indexOf('=');
    return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
  }),
);
const escena = (args.escena ?? 'PERF-A').toUpperCase();
const equipo = args.equipo ?? 'C0';
const fotogramas = Number(args.fotogramas) || 60;
const repeticiones = Number(args.repeticiones) || 10;
const archivo = resolve(args.archivo ?? 'dist/campos-vectoriales.html');
const carpeta = 'evidencia/VAL-03';

if (!['PERF-A', 'PERF-B', 'PERF-C'].includes(escena)) {
  console.error(`Escena desconocida: ${escena} (PERF-A, PERF-B o PERF-C)`);
  process.exit(1);
}
if (!existsSync(archivo)) {
  console.error(`Falta ${archivo}: ejecuta antes «npm run build».`);
  process.exit(1);
}

const navegador = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-lcd-text'] });
const contexto = await navegador.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await contexto.newPage();
const consola = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && consola.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => consola.push(`pageerror: ${e.message}`));
const url = `${pathToFileURL(archivo).href}?perf=${escena}&equipo=${encodeURIComponent(equipo)}&auto=1&fotogramas=${fotogramas}&repeticiones=${repeticiones}`;
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__perfInforme !== undefined, null, { timeout: 15 * 60_000, polling: 500 });
const informe = await page.evaluate(() => window.__perfInforme);
await navegador.close();
if ('error' in informe) {
  console.error(`La medición falló: ${informe.error}`);
  process.exit(1);
}
informe.maquina = { cpu: cpus()[0]?.model ?? null, nucleos: cpus().length, memoriaGiB: Math.round(totalmem() / 2 ** 30) };
informe.consola = consola;
informe.duracionS = Math.round((Date.now() - t0) / 1000);

// Registro anterior del mismo equipo y escena (V-PERF-07).
mkdirSync(carpeta, { recursive: true });
const sufijo = `-${equipo}-${escena}.json`;
const anteriores = readdirSync(carpeta)
  .filter((f) => f.endsWith(sufijo))
  .map((f) => join(carpeta, f))
  .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
const anterior = anteriores.length ? JSON.parse(readFileSync(anteriores.at(-1), 'utf8')) : null;

let nombre = join(carpeta, `${informe.fecha.slice(0, 10)}${sufijo}`);
for (let k = 2; existsSync(nombre); k++) nombre = join(carpeta, `${informe.fecha.slice(0, 10)}-${k}${sufijo}`);
writeFileSync(nombre, JSON.stringify(informe, null, 2) + '\n');

// Objetivos (VALIDATION §6.4).
const OBJETIVOS = {
  'PERF-A': { malla: 30, corte: 40, lineas: 250 },
  'PERF-B': { lineas: 1000 },
};
const filas = [];
for (const [trabajo, v] of Object.entries(informe.calculo)) {
  const objetivo = OBJETIVOS[escena]?.[trabajo];
  const previo = anterior?.calculo?.[trabajo]?.medianaMs;
  const cambio = previo ? (v.medianaMs - previo) / previo : null;
  filas.push({
    criterio: objetivo ? 'V-PERF-03' : '—',
    medida: `${v.descripcion}: mediana ${v.medianaMs} ms (p95 ${v.p95})`,
    objetivo: objetivo ? `≤ ${objetivo} ms` : 'informativo',
    ok: objetivo ? v.medianaMs <= objetivo : null,
  });
  if (cambio !== null)
    filas.push({ criterio: 'V-PERF-07', medida: `${trabajo}: ${previo} → ${v.medianaMs} ms (${(100 * cambio).toFixed(0)} %)`, objetivo: '≤ +30 %', ok: cambio <= 0.3 });
}
if (informe.interaccion) {
  const i = informe.interaccion;
  filas.push({ criterio: 'V-PERF-04', medida: `tareas > 50 ms: ${i.tareasLargas.length} (${i.tareasLargas.join(', ') || '—'})`, objetivo: '0', ok: i.tareasLargas.length === 0 });
  // La latencia termina en un fotograma: en C0 la marca el dibujo por software (no cuenta, §6.1).
  filas.push({
    criterio: 'V-PERF-04',
    medida: `latencia p95: ${i.latencias?.p95 ?? '—'} ms (${i.latencias?.n ?? 0} de ${i.valores} valores; el resto, agrupados)`,
    objetivo: equipo === 'C0' ? 'no cuenta en C0' : '≤ 50 ms',
    ok: equipo === 'C0' ? null : (i.latencias?.p95 ?? Infinity) <= 50,
  });
}
if (informe.fotogramas) {
  const f = informe.fotogramas;
  filas.push({ criterio: 'V-PERF-01/02', medida: `fotogramas p50 ${f.p50} · p95 ${f.p95} · p99 ${f.p99} ms · ${f.porEncimaDe33ms} % > 33 ms`, objetivo: equipo === 'C0' ? 'no cuenta en C0' : escena === 'PERF-A' ? 'p95 ≤ 7.5 ms' : 'p95 ≤ 10 ms', ok: equipo === 'C0' ? null : f.p95 <= (escena === 'PERF-A' ? 7.5 : 10) });
}
filas.push({ criterio: 'V-PERF-06', medida: `arranque hasta interfaz interactiva: ${informe.arranqueMs} ms`, objetivo: equipo === 'C0' ? 'informativo en C0' : '≤ 1500 ms', ok: equipo === 'C0' ? null : informe.arranqueMs <= 1500 });

console.log(`\n${escena} en ${equipo} · ${informe.entorno.gpu ?? 'GPU desconocida'} · ${informe.entorno.lienzo.join('×')} px · cálculo en ${informe.entorno.modoCalculo}`);
for (const f of filas) console.log(`${f.ok === null ? '·' : f.ok ? '✓' : '✗'} ${f.criterio.padEnd(12)} ${f.medida}  [${f.objetivo}]`);
if (consola.length) console.log(`\nConsola:\n${consola.join('\n')}`);
console.log(`\nInforme: ${nombre}${anterior ? ` (comparado con ${anteriores.at(-1)})` : ''}`);
process.exit(filas.some((f) => f.ok === false) || consola.length ? 1 : 0);
