import { expect, test, type Page } from '@playwright/test';
import { abrir, registrar, sinErrores, urlApp } from '../util/app';
import { angulo, lstarDeGris255, lstarEsperada } from '../util/oraculos';
import { auditarMaquetacion } from '../../scripts/lib/maquetacion.mjs';
import { PNG } from 'pngjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const gancho = (page: Page, expr: string) => page.evaluate(`(${expr})(window.__campos)`) as Promise<any>;
/** Espera a que el orquestador haya aplicado la malla y las líneas del estado vigente (worker). */
const estable = (page: Page) =>
  page.waitForFunction(() => {
    const c = (window as any).__campos;
    const p = c.pendiente();
    return c.resultados().malla !== null && !p.malla && !p.lineas;
  });

test.describe('REN-01 · escena base', () => {
  test('dibujo bajo demanda: 0 fotogramas en 2 s de reposo; la órbita con el ratón dibuja y mueve la cámara', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await page.waitForTimeout(500);
    const antes = await gancho(page, '(c) => c.escena()');
    await page.waitForTimeout(2000);
    const despues = await gancho(page, '(c) => c.escena()');
    expect(despues.fotogramas).toBe(antes.fotogramas);

    const lienzo = page.locator('[data-prueba="lienzo"]');
    const caja = (await lienzo.boundingBox())!;
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width / 2 + 120, caja.y + caja.height / 2 + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const orbitado = await gancho(page, '(c) => c.escena()');
    expect(orbitado.fotogramas).toBeGreaterThan(despues.fotogramas);
    expect(orbitado.camara.posicion).not.toEqual(despues.camara.posicion);
    sinErrores(reg);
  });

  test('sin WebGL2 se muestra un estado vacío explicativo', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      (HTMLCanvasElement.prototype as any).getContext = function (tipo: string, ...resto: unknown[]) {
        if (tipo === 'webgl2' || tipo === 'webgl') return null;
        return (original as any).call(this, tipo, ...resto);
      };
    });
    await page.goto(urlApp());
    await expect(page.getByRole('alert')).toContainText('WebGL2');
  });
});

test.describe('REN-02 · flechas', () => {
  test('dirección, longitud y gris de 5 flechas coinciden con F y la leyenda (T-17)', async ({ page }) => {
    await abrir(page);
    const calc = await gancho(page, '(c) => c.calculo()');
    const n = (await gancho(page, '(c) => c.escena()')).flechas;
    expect(n).toBe(729);
    for (const k of [0, 101, 364, 500, 728]) {
      const f = await gancho(page, `(c) => c.flecha(${k})`);
      expect(angulo(f.dir, f.F)).toBeLessThan(1e-6);
      const l = calc.lMax * Math.min(f.mag / calc.fRef, 1);
      expect(Math.abs(f.largo - l) / l).toBeLessThan(1e-6);
      expect(Math.abs(lstarDeGris255(f.gris * 255) - lstarEsperada(f.mag, calc.fRef))).toBeLessThan(0.05);
    }
  });

  test('radial saliente: el origen es una marca ≈ 0; 21³ no produce errores', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page, 'captura=1&campo=radial-saliente');
    const calc = await gancho(page, '(c) => c.calculo()');
    expect(calc.recuento.ceros).toBe(1);
    expect((await gancho(page, '(c) => c.escena()')).flechas).toBe(728);
    await page.evaluate(() => {
      const c = (window as any).__campos;
      c.fijarEstado?.((s: any) => ({ ...s, muestreo: { ...s.muestreo, n: [21, 21, 21] } }));
    });
    await page.waitForFunction(() => (window as any).__campos.escena().flechas === 9260);
    sinErrores(reg);
  });
});

test.describe('VIS-03 · composición', () => {
  // Fracción mínima de la escena: 73 % a 1440×900 y 79 % a 1920×1080 (DESIGN §1, corregido).
  for (const [ancho, alto, fraccion] of [
    [1440, 900, 0.73],
    [1920, 1080, 0.79],
  ] as const) {
    test(`medidas y regiones a ${ancho}×${alto}`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto });
      await abrir(page);
      const caja = async (sel: string) => (await page.locator(sel).boundingBox())!;
      const barra = await caja('[data-region="barra"]');
      const panel = await caja('[data-region="panel"]');
      const escena = await caja('[data-region="escena"]');
      expect(Math.abs(barra.height - 48)).toBeLessThanOrEqual(1);
      expect(Math.abs(panel.width - 320)).toBeLessThanOrEqual(1);
      expect((escena.width * escena.height) / (ancho * alto)).toBeGreaterThanOrEqual(fraccion);
      const auditoria = await page.evaluate(auditarMaquetacion);
      expect(auditoria.incidencias).toEqual([]);
    });
  }
});

test.describe('UI-01 · selección de campo', () => {
  test('cada tarjeta cambia fórmula, flechas y leyenda; la activa queda marcada', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    const ids = ['uniforme', 'radial-saliente', 'radial-entrante', 'rotacional', 'helicoidal', 'silla'];
    let formulaAnterior = '';
    for (const id of ids) {
      await page.locator(`[data-campo="${id}"]`).click();
      await expect(page.locator(`[data-campo="${id}"]`)).toHaveAttribute('aria-checked', 'true');
      expect((await gancho(page, '(c) => c.estado()')).base).toBe(id);
      await estable(page);
      const formula = (await page.locator('[data-prueba="formula-campo"]').textContent()) ?? '';
      expect(formula).not.toBe(formulaAnterior);
      formulaAnterior = formula;
      const calc = await gancho(page, '(c) => c.calculo()');
      await expect(page.locator('[data-prueba="leyenda-escala"]')).toContainText(`F_ref = ${String(calc.fRef).replace('-', '−')}`);
    }
    sinErrores(reg);
  });

  test('teclado: flechas del teclado recorren la rejilla y seleccionan', async ({ page }) => {
    await abrir(page);
    await page.locator('[data-campo="helicoidal"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-campo="silla"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-campo="silla"]')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-campo="radial-entrante"]')).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('VIS-04 · leyenda', () => {
  test('las marcas coinciden con F_ref y el centro de la barra tiene L* = 70.85 ± 1', async ({ page }) => {
    await abrir(page);
    // Con las líneas ya aplicadas la leyenda no cambia de altura durante la captura.
    await estable(page);
    const calc = await gancho(page, '(c) => c.calculo()');
    await expect(page.locator('.leyenda-marcas')).toContainText(`≥ ${calc.fRef}`);
    const barra = page.locator('[data-prueba="barra-magnitud"]');
    const png = PNG.sync.read(await barra.screenshot());
    const y = Math.floor(png.height / 2);
    const x = Math.floor(png.width / 2);
    const i = 4 * (y * png.width + x);
    expect(Math.abs(lstarDeGris255(png.data[i] as number) - 70.85)).toBeLessThanOrEqual(1);
  });

  test('solo aparecen entradas de lo que está en la escena', async ({ page }) => {
    // Helicoidal: ‖F‖ máx. = √8.0625 ≈ 2.84 < F_ref = 3 → sin saturadas ni ceros: solo «sentido».
    const flechas = page.locator('[data-prueba="leyenda-flechas"] li');
    await abrir(page);
    await expect(flechas).toHaveCount(1);
    // Uniforme: ‖F‖ = F_ref = 1 en todos los nodos → todas saturadas.
    await abrir(page, 'captura=1&campo=uniforme');
    await expect(flechas).toHaveCount(2);
    await expect(page.locator('[data-prueba="leyenda-flechas"]')).toContainText('saturada');
    await abrir(page, 'captura=1&campo=rotacional');
    await expect(page.locator('[data-prueba="leyenda-flechas"]')).toContainText('2 %');
  });
});
