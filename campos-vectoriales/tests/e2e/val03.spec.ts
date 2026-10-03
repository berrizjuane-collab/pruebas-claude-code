/**
 * VAL-03 · El modo de medición (`?perf=`) carga la escena reproducible, mide y entrega un
 * informe bien formado sin tocar el autoguardado del usuario. Las cifras de C0 se obtienen con
 * `npm run perf` (VALIDATION §6.3); aquí solo se comprueba la herramienta, con pocas repeticiones.
 */
import { expect, test, type Page } from '@playwright/test';
import { abrir, registrar, sinErrores } from '../util/app';

/* eslint-disable @typescript-eslint/no-explicit-any */
const informe = (page: Page) =>
  page.waitForFunction(() => (window as any).__perfInforme, null, { timeout: 240_000, polling: 500 }).then((h) => h.jsonValue() as Promise<any>);

test.describe('VAL-03 · modo de medición', () => {
  test('PERF-C: arrastre de ω con 60 valores, tiempos de cálculo y tareas largas; el autoguardado no cambia @rendimiento', async ({ page }) => {
    test.setTimeout(300_000);
    const reg = registrar(page);
    await page.addInitScript(() => localStorage.setItem('campos-vectoriales:autoguardado', 'previo'));
    await abrir(page, 'prueba=1&perf=PERF-C&auto=1&repeticiones=2');
    await expect(page.locator('[data-prueba="panel-rendimiento"]')).toContainText('PERF-C (interacción)');
    const r = await informe(page);
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ formato: 'campos-vectoriales/rendimiento', version: 1, escena: 'PERF-C', equipo: 'R1', fotogramas: null });
    expect(Object.keys(r.calculo).sort()).toEqual(['lineas', 'malla']);
    expect(r.calculo.malla.repeticiones).toHaveLength(2);
    expect(r.calculo.malla.descripcion).toBe('malla 9×9×9');
    expect(r.interaccion.valores).toBe(60);
    expect(Array.isArray(r.interaccion.tareasLargas)).toBe(true);
    expect(r.interaccion.latencias.n + r.interaccion.perdidos).toBe(60);
    expect(r.arranqueMs).toBeGreaterThan(0);
    expect(r.entorno.modoCalculo).toBe('worker');
    // Al terminar se restaura la escena de partida (ω = 1).
    expect((await page.evaluate(() => (window as any).__campos.estado())).parametros[0].valor).toBe(1);
    await expect(page.getByRole('button', { name: 'Descargar informe (.json)' })).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('campos-vectoriales:autoguardado'))).toBe('previo');
    sinErrores(reg);
  });

  test('PERF-A: 3375 flechas, corte 41² con div F, 128 semillas y partículas; fotogramas y los tres trabajos @rendimiento', async ({ page }) => {
    test.setTimeout(300_000);
    const reg = registrar(page);
    await abrir(page, 'prueba=1&perf=PERF-A&auto=1&fotogramas=5&repeticiones=1');
    const r = await informe(page);
    expect(r.error).toBeUndefined();
    expect(r.fotogramas.n).toBe(5);
    expect(Object.fromEntries(Object.entries(r.calculo).map(([k, v]: [string, any]) => [k, v.descripcion]))).toEqual({
      malla: 'malla 15×15×15',
      corte: 'corte 41×41 (divergencia)',
      lineas: 'líneas (128 semillas)',
    });
    expect((await page.evaluate(() => (window as any).__campos.escena())).flechas).toBe(3375);
    expect(r.interaccion).toBeNull();
    sinErrores(reg);
  });
});
