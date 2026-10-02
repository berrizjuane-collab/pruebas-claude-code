import { expect, type Page } from '@playwright/test';
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
