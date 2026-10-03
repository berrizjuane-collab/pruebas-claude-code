import { expect, type FileChooser, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const OBJETIVO = process.env.OBJETIVO === 'archivo' ? 'archivo' : 'dev';

/** URL de la aplicación según el objetivo (servidor de desarrollo o HTML autocontenido). */
export function urlApp(consulta = 'captura=1'): string {
  const q = consulta ? `?${consulta}` : '';
  if (OBJETIVO === 'archivo') return pathToFileURL(resolve('dist/campos-vectoriales.html')).href + q;
  return `/${q}`;
}

export interface Registro {
  consola: string[];
  externas: string[];
}

/** Registra errores de consola y peticiones a orígenes externos. */
export function registrar(page: Page): Registro {
  const reg: Registro = { consola: [], externas: [] };
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') reg.consola.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => reg.consola.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    const local = u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('file:') || /^https?:\/\/localhost[:/]/.test(u);
    if (!local) reg.externas.push(u);
  });
  return reg;
}

/** Abre la aplicación y espera a que el gancho de pruebas diga que está lista. */
export async function abrir(page: Page, consulta = 'captura=1'): Promise<void> {
  await page.goto(urlApp(consulta));
  await page.waitForFunction(() => (window as unknown as { __campos?: { listo?: boolean } }).__campos?.listo === true, null, {
    timeout: 30_000,
  });
}

export function sinErrores(reg: Registro): void {
  expect(reg.consola, reg.consola.join('\n')).toEqual([]);
  expect(reg.externas, reg.externas.join('\n')).toEqual([]);
}

/**
 * Selectores de archivo sin carrera. `page.waitForEvent('filechooser')` activa la interceptación
 * con un mensaje que Playwright no espera: si la acción (sobre todo una tecla, que no hace
 * comprobaciones previas) llega antes, Chromium abre su diálogo nativo, invisible sin interfaz, y
 * el evento no llega nunca (8 de 25 intentos con Intro sobre «Abrir»). Se deja una escucha
 * permanente desde el principio de la prueba y se espera al siguiente selector.
 */
export async function interceptarSelectores(page: Page): Promise<() => Promise<FileChooser>> {
  const pendientes: FileChooser[] = [];
  const esperas: ((f: FileChooser) => void)[] = [];
  page.on('filechooser', (f) => {
    const resolver = esperas.shift();
    if (resolver) resolver(f);
    else pendientes.push(f);
  });
  await page.evaluate(() => 0);
  return () =>
    new Promise<FileChooser>((resolver) => {
      const f = pendientes.shift();
      if (f) resolver(f);
      else esperas.push(resolver);
    });
}
