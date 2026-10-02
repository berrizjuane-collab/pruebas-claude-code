/**
 * Capturas de revisión visual (VALIDATION §7). Para cada captura y tamaño de pantalla:
 * guarda el PNG, audita la paleta y la maquetación, y escribe un informe JSON.
 *
 *   node scripts/capturas.mjs --tarea=REV-01 --capturas=C1,C2 --tamanos=V1,V2,V3 [--objetivo=archivo]
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditarPaleta } from './lib/paleta.mjs';
import { auditarMaquetacion, auditarTipografia } from './lib/maquetacion.mjs';

export const TAMANOS = {
  V1: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  V2: { width: 1440, height: 900, deviceScaleFactor: 2 },
  V3: { width: 1280, height: 720, deviceScaleFactor: 1 },
  V4: { width: 1024, height: 768, deviceScaleFactor: 1 },
  V5: { width: 390, height: 844, deviceScaleFactor: 3 },
};

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const s = a.replace(/^--/, ''); const i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
const tarea = args.tarea ?? 'capturas';
const capturas = (args.capturas ?? 'C1').split(',');
const tamanos = (args.tamanos ?? 'V1,V2,V3').split(',');
const objetivo = args.objetivo === 'archivo' ? 'archivo' : 'dev';
const extra = args.consulta ? `&${args.consulta}` : '';
const carpeta = resolve('evidencia', tarea, 'capturas');
mkdirSync(carpeta, { recursive: true });

let servidor = null;
let base = pathToFileURL(resolve('dist/campos-vectoriales.html')).href;
if (objetivo === 'dev') {
  servidor = spawn('npx', ['vite', '--port', '5179', '--strictPort'], { stdio: 'ignore' });
  base = 'http://localhost:5179/';
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(base);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

const navegador = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-lcd-text'] });
const informe = { tarea, objetivo, fecha: new Date().toISOString(), resultados: [] };
try {
  for (const tam of tamanos) {
    const contexto = await navegador.newContext({ viewport: { width: TAMANOS[tam].width, height: TAMANOS[tam].height }, deviceScaleFactor: TAMANOS[tam].deviceScaleFactor, reducedMotion: 'reduce' });
    for (const especificacion of capturas) {
      // «ID» o «ID@consulta» (p. ej. ROT@campo=rotacional)
      const [cap, consultaCaptura] = especificacion.split('@');
      const page = await contexto.newPage();
      const errores = [];
      page.on('pageerror', (e) => errores.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
      await page.goto(`${base}?captura=1&escena=${cap}${consultaCaptura ? `&${consultaCaptura}` : ''}${extra}`);
      await page.waitForFunction(() => window.__campos?.listo === true && (window.__campos?.escenaLista ?? true) === true, null, { timeout: 60000 });
      await page.waitForTimeout(400);
      const archivo = join(carpeta, `${cap}-${tam}.png`);
      const png = await page.screenshot({ path: archivo });
      const paleta = auditarPaleta(png);
      const maquetacion = await page.evaluate(auditarMaquetacion);
      const tipografia = await page.evaluate(auditarTipografia);
      informe.resultados.push({ captura: cap, tamano: tam, archivo: `capturas/${cap}-${tam}.png`, paleta, maquetacion: maquetacion.incidencias, tipografia, errores });
      console.log(`${cap}-${tam}: paleta ${paleta.fuera === 0 ? 'OK' : `${paleta.fuera} px fuera (máx ${paleta.maxDiff})`} · maquetación ${maquetacion.incidencias.length} incidencias · errores ${errores.length}`);
      await page.close();
    }
    await contexto.close();
  }
} finally {
  await navegador.close();
  servidor?.kill();
}
writeFileSync(resolve('evidencia', tarea, 'capturas.json'), JSON.stringify(informe, null, 2));
const fallos = informe.resultados.filter((r) => !r.paleta.superada || r.maquetacion.length || r.errores.length);
console.log(fallos.length ? `${fallos.length} capturas con incidencias` : 'Todas las capturas superan las auditorías automáticas');
process.exitCode = fallos.length ? 1 : 0;
