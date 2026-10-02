import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { abrir, registrar, sinErrores } from '../util/app';

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
const fijar = (page: Page, cuerpo: string) => gancho(page, `(c) => c.fijarEstado((s) => (${cuerpo}))`);
/** Clic en un punto del lienzo dado en px CSS relativos a él. */
async function clicEnLienzo(page: Page, [x, y]: [number, number]) {
  const caja = (await page.locator('[data-prueba="lienzo"]').boundingBox())!;
  await page.mouse.click(caja.x + x, caja.y + y);
}
/** Componentes de una fila vectorial del inspector (texto visible de cada una). */
const vector = (page: Page, clave: string) => page.locator(`[data-prueba="inspector-${clave}"] .inspector-componente`).allTextContents();
const valor = (page: Page, clave: string) => page.locator(`[data-prueba="inspector-${clave}"] dd`).textContent();

const informe: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  const ruta = 'test-results/h6-informe.json';
  const previo = existsSync(ruta) ? (JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>) : {};
  writeFileSync(ruta, JSON.stringify({ ...previo, ...informe }, null, 2));
});

// ---------------------------------------------------------------- INS-01

test.describe('INS-01 · selección de puntos', () => {
  test('clic sobre una flecha: P es su nodo exacto; el aro, la cruz y la flecha exacta aparecen', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await estable(page);
    // La flecha más cercana a la cámara cuyo centro (el nodo) se ve sobre el lienzo.
    const objetivo = await page.evaluate(() => {
      const c = (window as any).__campos;
      const cam = c.camara().posicion as number[];
      const lienzo = document.querySelector('[data-prueba="lienzo"]')!;
      const r = lienzo.getBoundingClientRect();
      const n = c.resultados().malla.instancias.n;
      const candidatas: { pos: number[]; d: number; px: number[] }[] = [];
      for (let k = 0; k < n; k++) {
        const f = c.flecha(k);
        const px = c.proyectar(f.pos[0], f.pos[1], f.pos[2]);
        if (document.elementFromPoint(r.left + px[0], r.top + px[1]) !== lienzo) continue;
        candidatas.push({ pos: f.pos, d: Math.hypot(f.pos[0] - cam[0], f.pos[1] - cam[1], f.pos[2] - cam[2]), px });
      }
      candidatas.sort((a, b) => a.d - b.d);
      return candidatas[0]!;
    });
    await clicEnLienzo(page, objetivo.px as [number, number]);
    await expect.poll(async () => (await estado(page)).punto).toEqual(objetivo.pos);
    await expect(page.locator('[data-prueba="inspector"]')).toBeVisible();
    const sel = (await gancho(page, '(c) => c.escena()')).seleccion;
    expect(sel).toMatchObject({ visible: true, punto: objetivo.pos, flecha: true, discontinua: true, rotulo: true });
    // Cruz: tres tramos paralelos a los ejes que pasan por P y van de cara a cara de Ω = [−2, 2]³.
    const [px, py, pz] = objetivo.pos as number[];
    expect(sel.cruz).toEqual([
      [[-2, py, pz], [2, py, pz]],
      [[px, -2, pz], [px, 2, pz]],
      [[px, py, -2], [px, py, 2]],
    ]);
    informe['INS-01 clic flecha'] = { nodo: objetivo.pos, pantalla: objetivo.px };
    sinErrores(reg);
  });

  test('clic sobre el corte: P está en el plano (|error| < Δ/100)', async ({ page }) => {
    await abrir(page);
    await fijar(page, `{ ...s, capas: { ...s.capas, flechas: false, lineas: false }, corte: { ...s.corte, activo: true, plano: 'XY', c: 0.5, escalar: 'magnitud' } }`);
    await estable(page);
    const meta = [0.73, -0.41, 0.5];
    const px = await gancho(page, '(c, p) => c.proyectar(p[0], p[1], p[2])', meta);
    await clicEnLienzo(page, px);
    await expect.poll(async () => (await estado(page)).punto).not.toBeNull();
    const P = (await estado(page)).punto as number[];
    const delta = (await gancho(page, '(c) => c.resultados().malla.deltaRef')) as number;
    const error = Math.hypot(P[0]! - meta[0]!, P[1]! - meta[1]!, P[2]! - meta[2]!);
    informe['INS-01 clic corte'] = { meta, P, error, limite: delta / 100 };
    expect(P[2]).toBe(0.5);
    expect(error).toBeLessThan(delta / 100);
  });

  test('Alt + flechas y Alt + RePág/AvPág mueven P en pasos de Δ sin salir de Ω; I abre las coordenadas; Esc cierra', async ({ page }) => {
    await abrir(page);
    await estable(page);
    // I: P en el origen y el foco en la coordenada x.
    await page.locator('body').press('i');
    await expect.poll(async () => (await estado(page)).punto).toEqual([0, 0, 0]);
    await expect(page.locator('[data-prueba="inspector-x"]')).toBeFocused();
    await page.locator('[data-prueba="inspector-x"]').fill('1');
    await page.locator('[data-prueba="inspector-x"]').press('Enter');
    await expect.poll(async () => (await estado(page)).punto).toEqual([1, 0, 0]);
    // Con la escena enfocada, Alt + flechas.
    const lienzo = page.locator('[data-prueba="lienzo"]');
    await lienzo.focus();
    await lienzo.press('Alt+ArrowRight');
    await lienzo.press('Alt+ArrowUp');
    await lienzo.press('Alt+PageDown');
    expect((await estado(page)).punto).toEqual([1.5, 0.5, -0.5]);
    for (let k = 0; k < 4; k++) await lienzo.press('Alt+ArrowRight');
    expect((await estado(page)).punto).toEqual([2, 0.5, -0.5]);
    await lienzo.press('Escape');
    expect((await estado(page)).punto).toBeNull();
    await expect(page.locator('[data-prueba="inspector"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------- INS-02 (V-FUN-06)

test.describe('INS-02 · tarjeta del inspector', () => {
  test('V-FUN-06: rotacional ω = 1 en (1, 0, 0) y radial saliente en (1, 2, 2) muestran los valores de tabla', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await page.locator('[data-campo="rotacional"]').click();
    await estable(page);
    await fijar(page, `{ ...s, punto: [1, 0, 0] }`);
    await expect(page.locator('[data-prueba="inspector"]')).toBeVisible();
    expect(await vector(page, 'F')).toEqual(['0', '1.000', '0']);
    expect(await valor(page, 'magF')).toBe('1.000');
    expect(await valor(page, 'div')).toMatch(/^0 · lo que entra sale/);
    expect(await vector(page, 'rot')).toEqual(['0', '0', '2.000']);
    await expect(page.locator('[data-prueba="inspector-omega"] dd')).toHaveText('ω = 1.000 rad/t');
    await expect(page.locator('[data-prueba="inspector-metodo"]')).toHaveText('Derivadas analíticas');
    // En vivo con los parámetros: ω = 2.
    await fijar(page, `{ ...s, parametros: s.parametros.map((p) => ({ ...p, valor: 2 })) }`);
    await expect.poll(() => valor(page, 'magF')).toBe('2.000');
    expect(await vector(page, 'rot')).toEqual(['0', '0', '4.000']);
    // Radial saliente k = 1 en (1, 2, 2): ‖F‖ = 3, div = +3 (fuente local).
    await page.locator('[data-campo="radial-saliente"]').click();
    await estable(page);
    await fijar(page, `{ ...s, punto: [1, 2, 2] }`);
    await expect.poll(() => valor(page, 'magF')).toBe('3.000');
    expect(await valor(page, 'div')).toBe('+3.000 · fuente local: sale más de lo que entra');
    expect(await page.locator('[data-prueba="inspector-autovalores"]').textContent()).toContain('1.000 · 1.000 · 1.000');
    sinErrores(reg);
  });

  test('P fuera del dominio de definición y en un punto anguloso; Esc dentro de la tarjeta la cierra', async ({ page }) => {
    await abrir(page);
    await fijar(page, `{ ...s, campo: { P: 'sqrt(x)', Q: '0', R: '0' }, parametros: [], base: null, punto: [-1, 0, 0] }`);
    await expect(page.locator('[data-prueba="inspector-no-definido"]')).toContainText('F no está definido en P');
    await fijar(page, `{ ...s, campo: { P: 'abs(x)', Q: '0', R: '0' }, punto: [0, 1, 0] }`);
    await expect(page.locator('[data-prueba="inspector-sin-derivadas"]')).toContainText('punto anguloso');
    await page.locator('[data-prueba="inspector-y"]').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-prueba="inspector"]')).toHaveCount(0);
  });

  test('«Copiar valores» copia texto tabulado y lo notifica; con «Glifos: rot F», el glifo exacto en P lleva anillo', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await abrir(page);
    await page.locator('[data-campo="rotacional"]').click();
    await estable(page);
    await fijar(page, `{ ...s, punto: [1, 0, 0] }`);
    await page.getByRole('button', { name: 'Copiar valores' }).click();
    await expect(page.locator('.notificaciones')).toContainText('Valores copiados');
    const texto = await page.evaluate(() => navigator.clipboard.readText());
    expect(texto).toContain('‖F‖\t1.000');
    expect(texto).toContain('rot F\t0\t0\t2.000');
    expect(texto.split('\n')[0]).toBe('P\t1.000\t0\t0');
    informe['INS-02 copia'] = texto.split('\n');
    await page.locator('body').press('g');
    await expect.poll(async () => (await gancho(page, '(c) => c.escena()')).seleccion.flecha).toBe(true);
  });
});
