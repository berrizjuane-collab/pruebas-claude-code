/**
 * VIS-06 · Adaptación a pantallas (DESIGN §5.4, SPEC §9) y V-A11Y-05 (zoom al 200 %).
 */
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { abrir, registrar, sinErrores } from '../util/app';
import { auditarMaquetacion } from '../../scripts/lib/maquetacion.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const gancho = (page: Page, expr: string, arg?: unknown) =>
  page.evaluate(`(${expr})(window.__campos, ${JSON.stringify(arg ?? null)})`) as Promise<any>;
const estado = (page: Page) => gancho(page, '(c) => c.estado()');
const estable = (page: Page) =>
  page.waitForFunction(() => {
    const c = (window as any).__campos;
    const p = c.pendiente();
    return c.resultados().malla !== null && !p.malla && !p.lineas && !p.corte;
  });
const nivel = (page: Page) => page.locator('.app').getAttribute('data-nivel');
const incidencias = async (page: Page) => (await page.evaluate(auditarMaquetacion)).incidencias as unknown[];

const informe: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  const ruta = 'test-results/h8-informe.json';
  const previo = existsSync(ruta) ? (JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>) : {};
  writeFileSync(ruta, JSON.stringify({ ...previo, ...informe }, null, 2));
});

test.describe('VIS-06 · adaptación a pantallas', () => {
  test('niveles por ancho: amplio, referencia, cajón, compacto y consulta; VV-08 sin incidencias en cada uno', async ({ page }) => {
    const reg = registrar(page);
    const resultados: Record<string, unknown> = {};
    for (const [ancho, alto, esperado] of [
      [1920, 1080, 'amplio'],
      [1440, 900, 'referencia'],
      [1280, 720, 'referencia'],
      [1100, 760, 'cajon'],
      [1024, 768, 'cajon'],
      [900, 700, 'compacto'],
      [390, 844, 'consulta'],
    ] as const) {
      await page.setViewportSize({ width: ancho, height: alto });
      if (!Object.keys(resultados).length) {
        await abrir(page);
        await estable(page);
      }
      await expect.poll(() => nivel(page)).toBe(esperado);
      await page.waitForTimeout(150);
      const inc = await incidencias(page);
      resultados[`${ancho}×${alto}`] = { nivel: esperado, incidencias: inc };
      expect(inc, `${ancho}×${alto}`).toEqual([]);
    }
    informe['VIS-06 niveles'] = resultados;
    sinErrores(reg);
  });

  test('cajón (1024 × 768): «Panel» lo oculta y lo muestra; acciones solo con icono pero con nombre; todas las funciones siguen a mano', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await abrir(page);
    await estable(page);
    const panel = page.locator('#panel');
    const boton = page.locator('[data-prueba="boton-panel"]');
    await expect(panel).toBeVisible();
    await expect(boton).toHaveAttribute('aria-pressed', 'true');
    await expect(boton).toHaveAttribute('aria-controls', 'panel');
    // La leyenda no queda debajo del cajón.
    const p = (await panel.boundingBox())!;
    const l = (await page.locator('.leyenda').boundingBox())!;
    expect(l.x).toBeGreaterThanOrEqual(p.x + p.width);
    // Acciones con icono y nombre accesible.
    for (const nombre of ['Restablecer', 'Exportar', 'Abrir', 'Ayuda']) await expect(page.locator('.barra-acciones').getByRole('button', { name: nombre, exact: true })).toBeVisible();
    await expect(page.locator('.barra-acciones')).not.toContainText('Restablecer');
    // Ocultar y mostrar el panel; la ayuda lo pliega.
    await boton.click();
    await expect(panel).toBeHidden();
    await boton.click();
    await expect(panel).toBeVisible();
    await page.locator('body').press('F1');
    await expect(page.locator('[data-prueba="ayuda"]')).toBeVisible();
    await expect(panel).toBeHidden();
    await page.keyboard.press('Escape');
    // Funciones: elegir campo, capa, inspector, exportar.
    await boton.click();
    await page.locator('[data-campo="rotacional"]').click();
    await expect.poll(async () => (await estado(page)).base).toBe('rotacional');
    await page.locator('body').press('i');
    await expect(page.locator('[data-prueba="inspector"]')).toBeVisible();
    const descarga = page.waitForEvent('download');
    await page.locator('.barra-acciones').getByRole('button', { name: 'Exportar', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Configuración (.json)' }).click();
    expect((await descarga).suggestedFilename()).toMatch(/\.json$/);
    expect(await incidencias(page)).toEqual([]);
  });

  test('compacto (900 × 700): inspector de 256 px y leyenda plegada al empezar', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await abrir(page);
    await estable(page);
    await expect(page.locator('.leyenda-cabecera')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('body').press('i');
    const ins = (await page.locator('[data-prueba="inspector"]').boundingBox())!;
    expect(Math.round(ins.width)).toBe(256);
    expect(await incidencias(page)).toEqual([]);
  });

  test('consulta (390 × 844, DPR 3): hoja inferior con la fórmula que se despliega al 60 %, «Menú» con todas las acciones y densidad 7³', async ({ browser }) => {
    const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const page = await contexto.newPage();
    const reg = registrar(page);
    await abrir(page);
    await estable(page);
    expect((await estado(page)).muestreo.n).toEqual([7, 7, 7]);
    expect((await gancho(page, '(c) => c.escena()')).flechas).toBe(7 ** 3);
    const hoja = page.locator('#panel');
    const asa = hoja.locator('[data-prueba="boton-panel"]');
    await expect(asa).toHaveAttribute('aria-expanded', 'false');
    expect(Math.round((await hoja.boundingBox())!.height)).toBe(65);
    await expect(hoja.locator('.hoja-formula')).toBeVisible();
    await asa.click();
    await expect(asa).toHaveAttribute('aria-expanded', 'true');
    expect(Math.abs((await hoja.boundingBox())!.height - 0.6 * 844)).toBeLessThan(2);
    // Se puede editar desde la hoja.
    await hoja.locator('[data-campo="silla"]').click();
    await expect.poll(async () => (await estado(page)).base).toBe('silla');
    await asa.click();
    // El menú reúne restablecer, exportar, abrir y ayuda.
    await page.getByRole('button', { name: 'Menú' }).click();
    const opciones = await page.getByRole('menuitem').allTextContents();
    for (const o of ['Restablecer: Cámara', 'Restablecer: Experimento', 'Exportar: Imagen PNG…', 'Exportar: Configuración (.json)', 'Abrir', 'Ayuda']) expect(opciones.join(' | ')).toContain(o);
    await page.getByRole('menuitem', { name: /Ayuda/ }).click();
    await expect(page.locator('[data-prueba="ayuda"]')).toBeVisible();
    // A todo lo ancho; lo que flota debajo no es visible ni enfocable.
    expect(Math.round((await page.locator('[data-prueba="ayuda"]').boundingBox())!.width)).toBe(390);
    await expect(page.locator('.barra-escena')).toBeHidden();
    await page.keyboard.press('Escape');
    // Inspector como hoja en la parte de abajo de la escena.
    await page.locator('body').press('i');
    const ins = (await page.locator('[data-prueba="inspector"]').boundingBox())!;
    const esc = (await page.locator('[data-region="escena"]').boundingBox())!;
    expect(Math.abs(ins.y + ins.height - (esc.y + esc.height - 8))).toBeLessThan(1.5);
    expect(await incidencias(page)).toEqual([]);
    informe['VIS-06 consulta'] = { hojaPlegada: 65, hojaAbierta: '60 %', densidad: '7³' };
    sinErrores(reg);
    await contexto.close();
  });

  test('V-A11Y-05 · zoom al 200 % en V3 (1280 × 720): pasa al modo consulta sin perder funciones ni desplazar en horizontal', async ({ page }) => {
    // Zoom 200 % ≡ viewport CSS de 640 × 360 con el doble de densidad.
    await page.setViewportSize({ width: 640, height: 360 });
    await abrir(page);
    await estable(page);
    expect(await nivel(page)).toBe('consulta');
    expect(await incidencias(page)).toEqual([]);
    await page.getByRole('button', { name: 'Menú' }).click();
    await expect(page.getByRole('menuitem')).toHaveCount(7);
    await page.keyboard.press('Escape');
    await page.locator('[data-prueba="boton-panel"]').click();
    await expect(page.locator('[data-prueba="expr-P"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
  });
});
