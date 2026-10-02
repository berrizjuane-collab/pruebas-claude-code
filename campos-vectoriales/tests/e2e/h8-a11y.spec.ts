/**
 * A11Y-02 · ARIA, regiones vivas, resumen de la escena y movimiento reducido (V-A11Y-01, VV-10).
 * La sesión con lector de pantalla (V-A11Y-04: NVDA + Firefox o VoiceOver + Safari) se hace en
 * el equipo del usuario; aquí se comprueba todo lo que se puede automatizar.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { abrir, registrar, sinErrores, urlApp } from '../util/app';

/* eslint-disable @typescript-eslint/no-explicit-any */
type PaginaAxe = ConstructorParameters<typeof AxeBuilder>[0]['page'];
const gancho = (page: Page, expr: string, arg?: unknown) =>
  page.evaluate(`(${expr})(window.__campos, ${JSON.stringify(arg ?? null)})`) as Promise<any>;
const estable = (page: Page) =>
  page.waitForFunction(() => {
    const c = (window as any).__campos;
    const p = c.pendiente();
    return c.resultados().malla !== null && !p.malla && !p.lineas && !p.corte;
  });
const fijar = (page: Page, cuerpo: string) => gancho(page, `(c) => c.fijarEstado((s) => (${cuerpo}))`);

/** axe con las reglas WCAG 2.x A y AA; devuelve las infracciones resumidas. */
async function auditarAxe(page: Page) {
  const r = await new AxeBuilder({ page: page as unknown as PaginaAxe }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return {
    infracciones: r.violations.map((v) => ({ id: v.id, impacto: v.impact, nodos: v.nodes.length, ejemplo: v.nodes[0]?.target.join(' ') })),
    superadas: r.passes.length,
  };
}

const informe: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  const ruta = 'test-results/h8-informe.json';
  const previo = existsSync(ruta) ? (JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>) : {};
  writeFileSync(ruta, JSON.stringify({ ...previo, ...informe }, null, 2));
});

test.describe('A11Y-02 · V-A11Y-01 con axe-core', () => {
  test('C1, C4, C6, C8, panel desplegado, diálogos abiertos y modo consulta: 0 infracciones serious o critical', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const reg = registrar(page);
    const escenas: Record<string, Awaited<ReturnType<typeof auditarAxe>>> = {};
    const graves = (a: Awaited<ReturnType<typeof auditarAxe>>) => a.infracciones.filter((i) => i.impacto === 'serious' || i.impacto === 'critical');

    // C1: estado inicial.
    await abrir(page);
    await estable(page);
    escenas['C1 estado inicial'] = await auditarAxe(page);
    // Panel con todas las secciones desplegadas.
    const plegadas = page.locator('.seccion-boton[aria-expanded="false"]');
    for (let k = 0; k < 20 && (await plegadas.count()) > 0; k++) await plegadas.first().click();
    escenas['Panel desplegado'] = await auditarAxe(page);
    // C4: rotacional con el inspector en (1, 0, 0), jacobiana abierta.
    await page.locator('[data-campo="rotacional"]').click();
    await fijar(page, `{ ...s, punto: [1, 0, 0], corte: { ...s.corte, activo: true, escalar: 'divergencia' } }`);
    await expect(page.locator('[data-prueba="inspector"]')).toBeVisible();
    await page.locator('[data-prueba="inspector"]').getByRole('button', { name: 'Jacobiana' }).click();
    await estable(page);
    escenas['C4 inspector'] = await auditarAxe(page);
    // C6: cajón de ayuda en «Divergencia», también en Sintaxis (tabla) y Atajos.
    await page.locator('[data-ayuda="divergencia"]').click();
    await expect(page.locator('[data-apartado="divergencia"]')).toBeFocused();
    escenas['C6 ayuda (Conceptos)'] = await auditarAxe(page);
    await page.locator('[data-prueba="ayuda"]').getByRole('tab', { name: 'Sintaxis' }).click();
    escenas['Ayuda (Sintaxis)'] = await auditarAxe(page);
    await page.keyboard.press('Escape');
    // Diálogo de exportación PNG (C9) y diálogo de errores al abrir un archivo.
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Imagen PNG…' }).click();
    await expect(page.locator('[data-prueba="vista-previa-png"]')).toBeVisible();
    escenas['C9 diálogo PNG'] = await auditarAxe(page);
    await page.keyboard.press('Escape');
    await page.locator('[data-prueba="entrada-archivo"]').setInputFiles('tests/fixtures/configuracion/fuera-de-rango.json');
    await expect(page.getByRole('dialog', { name: 'No se pudo abrir la configuración' })).toBeVisible();
    escenas['Diálogo de errores'] = await auditarAxe(page);
    await page.keyboard.press('Escape');
    // Menú abierto.
    await page.getByRole('button', { name: 'Restablecer', exact: true }).click();
    escenas['Menú «Restablecer»'] = await auditarAxe(page);
    await page.keyboard.press('Escape');
    sinErrores(reg);

    // C8: galería de controles con todos los estados.
    const ctxGaleria = await browser.newContext();
    const galeria = await ctxGaleria.newPage();
    await galeria.goto(urlApp('muestras'));
    await galeria.locator('[data-prueba="galeria"]').waitFor();
    escenas['C8 galería'] = await auditarAxe(galeria);
    await ctxGaleria.close();

    // Modo consulta (390 × 844) con la hoja abierta y el menú.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const movil = await ctx.newPage();
    await abrir(movil);
    await estable(movil);
    escenas['V5 consulta'] = await auditarAxe(movil);
    await movil.locator('[data-prueba="boton-panel"]').click();
    escenas['V5 hoja abierta'] = await auditarAxe(movil);
    await ctx.close();

    informe['V-A11Y-01 axe'] = escenas;
    for (const [nombre, a] of Object.entries(escenas)) expect(graves(a), nombre).toEqual([]);
  });
});

test.describe('A11Y-02 · nombres, regiones vivas y resumen de la escena', () => {
  test('la escena es una aplicación con nombre de rol y un resumen vivo que cambia con el campo', async ({ page }) => {
    await abrir(page);
    await estable(page);
    const lienzo = page.locator('[data-prueba="lienzo"]');
    await expect(lienzo).toHaveAttribute('role', 'application');
    await expect(lienzo).toHaveAttribute('aria-roledescription', 'escena 3D');
    const id = await lienzo.getAttribute('aria-describedby');
    const resumen = page.locator(`#${id}`);
    await expect(resumen).toHaveAttribute('aria-live', 'polite');
    await expect(resumen).toContainText('Helicoidal');
    await expect(resumen).toContainText('729');
    await page.locator('[data-campo="radial-saliente"]').click();
    await expect(resumen).toContainText('Radial saliente');
    await expect(resumen).toContainText('728');
    informe['A11Y-02 resumen'] = await resumen.textContent();
  });

  test('el estado del cálculo se anuncia (status) y un error, como alerta; las notificaciones son status', async ({ page }) => {
    await abrir(page);
    await estable(page);
    const estadoCalculo = page.locator('[data-prueba="estado-calculo"]');
    await expect(estadoCalculo).toHaveAttribute('role', 'status');
    await expect(estadoCalculo).toContainText('Listo · 729 nodos');
    // Un experimento sin ningún nodo definido: aviso en la barra y estado vacío.
    await fijar(page, `{ ...s, campo: { P: 'sqrt(-1-x^2)', Q: '0', R: '0' }, parametros: [], base: null }`);
    await expect(estadoCalculo).toContainText('Aviso');
    // Las notificaciones (exportar) son regiones de estado.
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    const descarga = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Configuración (.json)' }).click();
    await descarga;
    await expect(page.locator('[data-prueba="notificacion"]').first()).toHaveAttribute('role', 'status');
  });

  test('VV-10 con la ayuda: con movimiento reducido no hay animaciones al abrir el cajón ni los diálogos', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await abrir(page);
    await estable(page);
    await page.locator('body').press('F1');
    await expect(page.locator('[data-prueba="ayuda"]')).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Imagen PNG…' }).click();
    await expect(page.locator('[data-prueba="vista-previa-png"]')).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
    await ctx.close();
  });
});
