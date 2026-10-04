import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { abrir, registrar, sinErrores } from '../util/app';

type PaginaAxe = ConstructorParameters<typeof AxeBuilder>[0]['page'];
/* eslint-disable @typescript-eslint/no-explicit-any */
const gancho = (page: Page, expr: string) => page.evaluate(`(${expr})(window.__campos)`) as Promise<any>;
/** Espera a que el cálculo esté al día con el instante del reloj (malla y líneas del t vigente). */
const alDia = (page: Page) =>
  page.waitForFunction(() => {
    const c = (window as any).__campos;
    const p = c.pendiente();
    const r = c.resultados();
    const t = c.reloj();
    return r.malla && r.malla.t === t && !p.malla && !p.lineas && (!r.lineas || r.lineas.t === t);
  });

test.describe('V-FUN-22 · campos dependientes del tiempo', () => {
  test('viento giratorio: las flechas giran con t, las líneas instantáneas son rectas y las partículas recorren circunferencias', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page, 'captura=1&campo=viento-giratorio');
    await alDia(page);
    expect(await gancho(page, '(c) => c.animacion()')).toMatchObject({ temporal: true, tiempo: 0 });
    expect(await gancho(page, '(c) => c.estado().capas.particulas')).toBe(true);
    const dir0 = (await gancho(page, '(c) => c.flecha(0)')).dir;
    expect(dir0[0]).toBeCloseTo(1, 6);
    expect(dir0[1]).toBeCloseTo(0, 6);

    // Partículas: posiciones antes y después de 2 s de reloj determinista.
    const antes = await gancho(page, '(c) => ({ p: c.particulas(), t: c.animacion().tiempo })');
    await gancho(page, '(c) => c.avanzarAnimacion(2)');
    await alDia(page);
    const despues = await gancho(page, '(c) => ({ p: c.particulas(), t: c.animacion().tiempo, reloj: c.reloj() })');
    expect(despues.t).toBeGreaterThan(antes.t);
    expect(despues.reloj).toBe(despues.t);
    const [t0, t1] = [antes.t, despues.t];
    let comprobadas = 0;
    for (let i = 0; i < antes.p.n; i++) {
      // Solo las que no renacieron entre medias: su edad aumentó exactamente 2 s reales.
      if (Math.abs(despues.p.edad[i] - antes.p.edad[i] - 2) > 1e-6) continue;
      const x = antes.p.pos[3 * i] + Math.sin(t1) - Math.sin(t0);
      const y = antes.p.pos[3 * i + 1] - (Math.cos(t1) - Math.cos(t0));
      expect(Math.abs(despues.p.pos[3 * i] - x)).toBeLessThan(1e-3);
      expect(Math.abs(despues.p.pos[3 * i + 1] - y)).toBeLessThan(1e-3);
      comprobadas++;
    }
    expect(comprobadas).toBeGreaterThan(100);

    // Flechas en el instante t1 y líneas instantáneas rectas de dirección (cos t, sin t, 0).
    const dir1 = (await gancho(page, '(c) => c.flecha(0)')).dir;
    expect(dir1[0]).toBeCloseTo(Math.cos(t1), 5);
    expect(dir1[1]).toBeCloseTo(Math.sin(t1), 5);
    const lineas = await gancho(page, '(c) => c.lineasDibujadas()');
    const tangentes: number[] = lineas.tangentes;
    expect(tangentes.length).toBeGreaterThan(0);
    for (let k = 0; k < tangentes.length; k += 3) {
      expect(Math.abs(tangentes[k]! * Math.sin(t1) - tangentes[k + 1]! * Math.cos(t1))).toBeLessThan(1e-5);
    }
    sinErrores(reg);
  });

  test('F_ref común a la ventana: no cambia al avanzar el reloj (D-64)', async ({ page }) => {
    await abrir(page, 'captura=1&campo=silla-giratoria');
    await alDia(page);
    const f0 = (await gancho(page, '(c) => c.calculo()')).fRef;
    await gancho(page, '(c) => c.avanzarAnimacion(3)');
    await alDia(page);
    expect((await gancho(page, '(c) => c.calculo()')).fRef).toBe(f0);
  });
});

test.describe('V-FUN-22 · interfaz del tiempo', () => {
  test('inspector en la silla giratoria: t, ∂F/∂t y DF/Dt = ∂F/∂t + J·F correctos en (1, 0, 0), t = 0', async ({ page }) => {
    await abrir(page, 'captura=1&campo=silla-giratoria');
    await alDia(page);
    await gancho(page, '(c) => c.fijarEstado((s) => ({ ...s, punto: [1, 0, 0] }))');
    const ins = page.locator('[data-prueba="inspector"]');
    await expect(ins.locator('[data-prueba="inspector-temporal"]')).toBeVisible();
    // k = 1, ω = 1.5, t = 0: F = (1, 0, 0); ∂F/∂t = 2kω(0, 1, 0) = (0, 3, 0); J·F = k²(x, y, 0) = (1, 0, 0).
    await expect(ins.locator('[data-prueba="inspector-t"]')).toContainText('0');
    await expect(ins.locator('[data-prueba="inspector-dFdt"]')).toHaveText(/^∂F\/∂t\s*0\s*3(\.0+)?\s*0$/);
    await expect(ins.locator('[data-prueba="inspector-aceleracion"]')).toHaveText(/^DF\/Dt\s*1(\.0+)?\s*3(\.0+)?\s*0$/);
  });

  test('la sección «Tiempo»: el deslizador fija t (lectura de la escena y cálculo); con un campo estacionario solo explica', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page, 'captura=1&campo=viento-giratorio');
    await alDia(page);
    const seccion = page.locator('[data-prueba="seccion-tiempo"]');
    await expect(seccion.locator('[role="slider"]')).toBeVisible();
    await seccion.locator('[data-prueba="tiempo-t"]').fill('2.5');
    await seccion.locator('[data-prueba="tiempo-t"]').press('Enter');
    await expect.poll(async () => gancho(page, '(c) => c.reloj()')).toBe(2.5);
    await alDia(page);
    await expect(page.locator('[data-prueba="lectura-t"]')).toHaveText('t = 2.5');
    const dir = (await gancho(page, '(c) => c.flecha(0)')).dir;
    expect(dir[0]).toBeCloseTo(Math.cos(2.5), 5);
    expect(dir[1]).toBeCloseTo(Math.sin(2.5), 5);
    // Un campo estacionario: la sección lo explica y no hay lectura de t.
    await page.locator('[data-campo="helicoidal"]').click();
    await expect(seccion.locator('[data-prueba="tiempo-estacionario"]')).toBeAttached();
    await expect(page.locator('[data-prueba="lectura-t"]')).toHaveCount(0);
    sinErrores(reg);
  });

  test('axe sin infracciones graves con un campo temporal: «Tiempo», «Vista libre», «Avanzado» e inspector temporal (TMP-05)', async ({ page }) => {
    await abrir(page, 'captura=1&campo=silla-giratoria');
    await alDia(page);
    await gancho(page, '(c) => c.fijarEstado((s) => ({ ...s, punto: [1, 0, 0] }))');
    await expect(page.locator('[data-prueba="inspector-temporal"]')).toBeVisible();
    const plegadas = page.locator('.seccion-boton[aria-expanded="false"]');
    for (let k = 0; k < 20 && (await plegadas.count()) > 0; k++) await plegadas.first().click();
    await expect(page.locator('[data-prueba="seccion-tiempo"] [role="slider"]')).toBeVisible();
    // La fórmula de la silla giratoria no cabe: se desplaza y es enfocable (scrollable-region-focusable).
    const formula = page.locator('[data-prueba="formula-campo"]');
    expect(await formula.evaluate((e) => e.scrollWidth > e.clientWidth + 1)).toBe(true);
    await expect(formula).toHaveAttribute('tabindex', '0');
    const axe =await new AxeBuilder({ page: page as unknown as PaginaAxe }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });

  test('escribir t en una ecuación hace temporal el campo: P = t*x crece con t a escala fija de la ventana', async ({ page }) => {
    await abrir(page);
    await page.locator('[data-prueba="expr-P"]').fill('t*x');
    await page.locator('[data-prueba="expr-P"]').press('Tab');
    await expect.poll(async () => (await gancho(page, '(c) => c.animacion()')).temporal).toBe(true);
    await alDia(page);
    await expect(page.locator('[data-prueba="lectura-t"]')).toBeVisible();
    await expect(page.locator('[data-prueba="leyenda-escala"]')).toContainText('P95 en t ∈');
  });
});
