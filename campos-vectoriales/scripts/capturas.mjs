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
import { auditarAlineacion, auditarDensidad, auditarMaquetacion, auditarTipografia } from './lib/maquetacion.mjs';

/**
 * Preparación de cada captura (VALIDATION §7.2) con interacciones reales: escribir en las
 * ecuaciones y salir del campo, como haría el usuario.
 */
const PREPARAR = {
  C5: async (page) => {
    await page.locator('[data-prueba="expr-Q"]').fill('x*(');
    await page.locator('[data-prueba="expr-Q"]').press('Tab');
    await page.locator('[data-prueba="error-Q"]').waitFor();
    await page.locator('[data-prueba="aviso-escena"]').waitFor();
  },
  // Helicoidal con líneas y partículas, en pausa y con el reloj determinista (estela inicial).
  C2: async (page) => {
    await page.locator('body').press('p');
    await page.waitForFunction(() => window.__campos.escena().particulas?.visible === true);
    if ((await page.locator('[data-prueba="boton-animacion"]').getAttribute('aria-label')) === 'Pausar la animación') {
      await page.locator('[data-prueba="boton-animacion"]').click();
    }
    await esperarCalculo(page);
  },
  // Rotacional con la rueda de paletas en P = (1, 0, 0) (la tarjeta del inspector llega con INS-02).
  C4: async (page) => {
    await page.locator('[data-campo="rotacional"]').click();
    await esperarCalculo(page);
    await page.evaluate(() => window.__campos.fijarEstado((s) => ({ ...s, punto: [1, 0, 0] })));
    await page.waitForFunction(() => window.__campos.escena().rueda?.visible === true && window.__campos.escena().seleccion?.flecha === true);
    await page.locator('[data-prueba="inspector"]').waitFor();
  },
  // Radial saliente con la densidad máxima, 21³ (estrés visual, VV-05).
  C7: async (page) => {
    await page.locator('[data-campo="radial-saliente"]').click();
    await page.getByRole('button', { name: 'Dominio y muestreo' }).click();
    await page.locator('[data-prueba="n"]').fill('21');
    await page.locator('[data-prueba="n"]').press('Enter');
    await page.waitForFunction(() => window.__campos.resultados().malla?.total === 9261, null, { timeout: 60000 });
    await esperarCalculo(page);
  },
  // Rotacional con «Glifos: rot F» y el corte con «rot F · n».
  C11: async (page) => {
    await page.locator('[data-campo="rotacional"]').click();
    await page.locator('body').press('g');
    await activarCorte(page, 'XY', null);
    await page.getByRole('combobox', { name: 'Escalar sobre el corte' }).click();
    await page.getByRole('option', { name: 'rot F · n' }).click();
    await page.waitForFunction(() => window.__campos.resultados().malla?.glifos === 'rotacional');
    await esperarCalculo(page);
  },
  C3: async (page) => {
    await escribirCampo(page, { P: 'x^2', Q: 'y', R: '0' });
    await activarCorte(page, 'XY', null);
    await page.getByRole('combobox', { name: 'Escalar sobre el corte' }).click();
    await page.getByRole('option', { name: 'div F' }).click();
    await esperarCalculo(page);
  },
  // Los tres planos del corte (evidencia de REN-05), con «Flechas: solo corte».
  'CORTE-XY': (page) => cortePlano(page, 'XY', '0.5'),
  'CORTE-XZ': (page) => cortePlano(page, 'XZ', '-1'),
  'CORTE-YZ': (page) => cortePlano(page, 'YZ', '-0.5'),
  // Modos de magnitud (evidencia de REN-04): proporcional (inicial), normalizada y logarítmica.
  'MAG-PROP': async (page) => {
    await esperarCalculo(page);
  },
  'MAG-NORM': async (page) => {
    await page.getByRole('button', { name: 'Avanzado' }).click();
    await page.getByRole('group', { name: 'Longitud de las flechas' }).getByRole('button', { name: 'Normalizada' }).click();
    await esperarCalculo(page);
  },
  'MAG-LOG': async (page) => {
    await page.getByRole('button', { name: 'Avanzado' }).click();
    await page.getByRole('group', { name: 'Luminancia de las flechas' }).getByRole('button', { name: 'Log' }).click();
    await esperarCalculo(page);
  },
  // Glifos de rot F con ω = ±1 (evidencia de REN-07), solo en el corte z = 0 para leerlos.
  'ROT+1': (page) => glifosRot(page, 1),
  'ROT-1': (page) => glifosRot(page, -1),
  // Solo partículas, en pausa (evidencia de REN-08).
  PARTICULAS: async (page) => {
    await page.evaluate(() => window.__campos.fijarEstado((s) => ({ ...s, capas: { ...s.capas, flechas: false, lineas: false, particulas: true } })));
    await page.waitForFunction(() => window.__campos.escena().particulas?.visible === true);
  },
  // Secciones nuevas del panel (evidencia de UI-08) con T6.
  'PANEL-LINEAS': async (page) => {
    await page.getByRole('button', { name: 'Líneas de corriente', exact: true }).click();
    await page.getByRole('button', { name: 'Detalles del cálculo' }).click();
    await esperarCalculo(page);
    await page.evaluate(() => document.querySelector('[data-prueba="seccion-lineas"]').scrollIntoView({ block: 'start' }));
  },
  'PANEL-DERIVADAS': async (page) => {
    await escribirCampo(page, { P: 'x^2', Q: 'y', R: '0' });
    await page.getByRole('button', { name: 'Divergencia y rotacional' }).click();
    await esperarCalculo(page);
    await page.evaluate(() => document.querySelector('[data-prueba="seccion-derivadas"]').scrollIntoView({ block: 'start' }));
  },
  C10: async (page) => {
    await page.locator('[data-prueba="expr-P"]').fill('sqrt(-1-x^2)');
    await page.locator('[data-prueba="expr-P"]').press('Tab');
    await page.locator('[data-prueba="estado-vacio"]').waitFor();
  },
};
async function escribirCampo(page, campo) {
  for (const [c, v] of Object.entries(campo)) {
    await page.locator(`[data-prueba="expr-${c}"]`).fill(v);
    await page.locator(`[data-prueba="expr-${c}"]`).press('Tab');
  }
}
async function activarCorte(page, plano, c) {
  await page.getByRole('button', { name: 'Corte', exact: true }).click();
  await page.getByRole('switch', { name: 'Mostrar el plano de corte' }).click();
  await page.getByRole('group', { name: 'Plano del corte' }).getByRole('button', { name: `Plano ${plano}` }).click();
  if (c !== null) {
    await page.locator('[data-prueba="corte-c"]').fill(c);
    await page.locator('[data-prueba="corte-c"]').press('Enter');
  }
}
async function esperarCalculo(page) {
  await page.waitForFunction(() => {
    const c = window.__campos;
    const p = c.pendiente();
    return c.resultados().malla && !p.malla && !p.lineas && !p.corte;
  });
}
async function glifosRot(page, omega) {
  await page.locator('[data-campo="rotacional"]').click();
  await page.evaluate((w) => window.__campos.fijarEstado((s) => ({ ...s, parametros: s.parametros.map((p) => ({ ...p, valor: w })), capas: { ...s.capas, lineas: false, glifos: 'rotacional' }, muestreo: { ...s.muestreo, n: [7, 7, 7] }, corte: { ...s.corte, activo: true, plano: 'XY', c: 0, flechas: 'corte' } })), omega);
  await page.waitForFunction(() => window.__campos.resultados().malla?.glifos === 'rotacional' && window.__campos.resultados().malla?.corte);
  await esperarCalculo(page);
}
async function cortePlano(page, plano, c) {
  await activarCorte(page, plano, c);
  await page.getByRole('group', { name: 'Flechas del corte' }).getByRole('button', { name: 'Solo corte' }).click();
  await esperarCalculo(page);
}

/** Capturas de otras páginas: la galería ocupa toda su altura (se amplía la ventana). */
const PAGINA = { C8: 'muestras' };

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
      if (PAGINA[cap]) {
        await page.goto(`${base}?${PAGINA[cap]}`);
        await page.locator('[data-prueba="galeria"]').waitFor();
        const alto = await page.evaluate(() => document.querySelector('.galeria').scrollHeight);
        await page.setViewportSize({ width: TAMANOS[tam].width, height: Math.ceil(alto) });
      } else {
        await page.goto(`${base}?captura=1&escena=${cap}${consultaCaptura ? `&${consultaCaptura}` : ''}${extra}`);
        await page.waitForFunction(() => window.__campos?.listo === true && (window.__campos?.escenaLista ?? true) === true, null, { timeout: 60000 });
        await PREPARAR[cap]?.(page);
      }
      await page.waitForTimeout(400);
      const archivo = join(carpeta, `${cap}-${tam}.png`);
      const png = await page.screenshot({ path: archivo });
      const paleta = auditarPaleta(png);
      const maquetacion = await page.evaluate(auditarMaquetacion);
      const tipografia = await page.evaluate(auditarTipografia);
      const alineacion = await page.evaluate(auditarAlineacion);
      const densidad = await page.evaluate(auditarDensidad);
      informe.resultados.push({ captura: cap, tamano: tam, archivo: `capturas/${cap}-${tam}.png`, paleta, maquetacion: maquetacion.incidencias, alineacion, densidad, tipografia, errores });
      console.log(
        `${cap}-${tam}: paleta ${paleta.fuera === 0 ? 'OK' : `${paleta.fuera} px fuera (máx ${paleta.maxDiff})`} · maquetación ${maquetacion.incidencias.length} incidencias · alineación ${alineacion.incidencias.length}/${alineacion.anclajes} · errores ${errores.length}`,
      );
      await page.close();
    }
    await contexto.close();
  }
} finally {
  await navegador.close();
  servidor?.kill();
}
writeFileSync(resolve('evidencia', tarea, 'capturas.json'), JSON.stringify(informe, null, 2));
const fallos = informe.resultados.filter((r) => !r.paleta.superada || r.maquetacion.length || r.alineacion.incidencias.length || r.errores.length);
console.log(fallos.length ? `${fallos.length} capturas con incidencias` : 'Todas las capturas superan las auditorías automáticas');
process.exitCode = fallos.length ? 1 : 0;
