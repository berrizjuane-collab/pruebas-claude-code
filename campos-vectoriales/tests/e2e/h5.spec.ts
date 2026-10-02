import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { abrir, registrar, sinErrores } from '../util/app';

/* eslint-disable @typescript-eslint/no-explicit-any */
const gancho = (page: Page, expr: string, arg?: unknown) =>
  page.evaluate(`(${expr})(window.__campos, ${JSON.stringify(arg ?? null)})`) as Promise<any>;
const estado = (page: Page) => gancho(page, '(c) => c.estado()');
/** Espera a que el orquestador haya aplicado malla y líneas del estado vigente. */
const estable = (page: Page) =>
  page.waitForFunction(() => {
    const c = (window as any).__campos;
    const p = c.pendiente();
    return c.resultados().malla !== null && !p.malla && !p.lineas;
  });
const fijar = (page: Page, cuerpo: string) => gancho(page, `(c) => c.fijarEstado((s) => (${cuerpo}))`);

const informe: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/h5-informe.json', JSON.stringify(informe, null, 2));
});

// ---------------------------------------------------------------- REN-03

test.describe('REN-03 · capa de líneas de corriente', () => {
  test('helicoidal (a = 0.25): 4 hélices con cheurones en el sentido de +F', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await estable(page);
    const l = await gancho(page, '(c) => c.lineasDibujadas()');
    const esc = (await gancho(page, '(c) => c.escena()')).lineas;
    expect(l.nLineas).toBe(4);
    expect(esc).toMatchObject({ visible: true, semillas: 4, segmentos: l.vertices - 4 });
    expect(esc.cheurones).toBeGreaterThan(20);
    // Cada cheurón apunta en el sentido de F en su posición.
    let peor = 1;
    for (let k = 0; k < l.cheurones.length / 3; k++) {
      const p = l.cheurones.slice(3 * k, 3 * k + 3);
      const t = l.tangentes.slice(3 * k, 3 * k + 3);
      const F = await gancho(page, '(c, p) => c.campoEn(p[0], p[1], p[2])', p);
      const coseno = (F[0] * t[0] + F[1] * t[1] + F[2] * t[2]) / Math.hypot(F[0], F[1], F[2]);
      peor = Math.min(peor, coseno);
    }
    informe['REN-03 hélices'] = { lineas: l.nLineas, cheurones: esc.cheurones, cosenoMinimo: peor, motivos: l.recuentoMotivos };
    expect(peor).toBeGreaterThan(0.99);
    sinErrores(reg);
  });

  test('las marcas finales coinciden con los motivos de parada (◇ = CERO, × = NO_DEFINIDO)', async ({ page }) => {
    await abrir(page);
    // Radial entrante: todas las ramas hacia delante acaban en ≈ 0 en el origen.
    await page.locator('[data-campo="radial-entrante"]').click();
    await estable(page);
    const r = await gancho(page, '(c) => c.lineasDibujadas()');
    const rombos = r.formasFinales.filter((f: number) => f === 1).length;
    expect(rombos).toBe(r.recuentoMotivos.CERO ?? 0);
    expect(rombos).toBeGreaterThan(0);
    // √x: hacia x < 0 el campo no está definido.
    await fijar(page, `{ ...s, campo: { P: 'sqrt(x)', Q: '0.3', R: '0' }, parametros: [], lineas: { ...s.lineas, semillas: { tipo: 'rejilla', plano: 'XY', c: 0, u: [0.5, 1.5], v: [-1, 1], nu: 3, nv: 3 } } }`);
    await estable(page);
    const t = await gancho(page, '(c) => c.lineasDibujadas()');
    const aspas = t.formasFinales.filter((f: number) => f === 2).length;
    expect(aspas).toBe(t.recuentoMotivos.NO_DEFINIDO ?? 0);
    expect(aspas).toBeGreaterThan(0);
    // «× no definido» aparece una sola vez en la leyenda (aquí ya lo aportan los nodos con x < 0).
    await expect(page.locator('.leyenda')).toContainText('no definido');
    informe['REN-03 finales'] = { radialEntrante: { rombos, motivos: r.recuentoMotivos }, raizDeX: { aspas, motivos: t.recuentoMotivos } };
  });

  // Prueba pesada: se ejecuta con las de rendimiento, al final y sin otras en paralelo.
  test('1 000 000 de vértices: se respeta el límite y se dibujan sin errores', { tag: '@rendimiento' }, async ({ page }) => {
    test.setTimeout(120_000);
    const reg = registrar(page);
    await abrir(page);
    await fijar(
      page,
      `{ ...s, campo: { P: '-y', Q: 'x', R: '0.004' }, parametros: [], lineas: { semillas: { tipo: 'rejilla', plano: 'XY', c: 0, nu: 16, nv: 16 }, paso: 0.01, longitudMax: 1e6 } }`,
    );
    await page.waitForFunction(() => (window as any).__campos.lineasDibujadas()?.limiteVertices === true, null, { timeout: 90_000 });
    const l = await gancho(page, '(c) => ({ n: c.lineasDibujadas().nLineas, v: c.lineasDibujadas().vertices })');
    await page.waitForTimeout(500);
    const esc = (await gancho(page, '(c) => c.escena()')).lineas;
    informe['REN-03 límite'] = { lineas: l.n, vertices: l.v, segmentos: esc.segmentos };
    expect(l.v).toBeLessThanOrEqual(1_000_000);
    expect(l.v).toBeGreaterThan(900_000);
    expect(esc).toMatchObject({ visible: true, segmentos: l.v - l.n });
    sinErrores(reg);
  });
});

// ---------------------------------------------------------------- V-FUN-13 (F5)

test.describe('V-FUN-13 · capas, leyenda y atajos', () => {
  test('cada capa visible tiene su entrada en la leyenda; F y L con el teclado, inactivos en campos de texto', async ({ page }) => {
    await abrir(page);
    await estable(page);
    const lineasLeyenda = page.locator('[data-prueba="leyenda-lineas"]');
    const flechasLeyenda = page.locator('[data-prueba="leyenda-flechas"]');
    await expect(lineasLeyenda).toBeVisible();
    await expect(flechasLeyenda).toBeVisible();
    await page.locator('body').press('l');
    await expect(lineasLeyenda).toHaveCount(0);
    expect((await gancho(page, '(c) => c.escena()')).lineas.visible).toBe(false);
    await page.locator('body').press('f');
    await expect(flechasLeyenda).toHaveCount(0);
    expect((await gancho(page, '(c) => c.escena()')).flechas).toBeGreaterThan(0);
    expect((await estado(page)).capas).toMatchObject({ flechas: false, lineas: false });
    // Dentro de un campo de texto, las letras se escriben y no activan capas.
    await page.locator('[data-prueba="expr-R"]').fill('a');
    await page.locator('[data-prueba="expr-R"]').press('l');
    expect((await estado(page)).capas.lineas).toBe(false);
    // Los interruptores del panel hacen lo mismo.
    await page.getByRole('switch', { name: 'Líneas de corriente' }).click();
    await page.getByRole('switch', { name: 'Flechas' }).click();
    await expect(lineasLeyenda).toBeVisible();
    await expect(flechasLeyenda).toBeVisible();
  });
});

// ---------------------------------------------------------------- REN-04

test.describe('REN-04 · modos de magnitud y escala', () => {
  const rampa = (u: number) => {
    // gris sRGB de L* = 45.2 + 51.3 u (misma fórmula que geometria/flechas)
    const L = 45.2 + 51.3 * Math.min(1, Math.max(0, u));
    const Y = L > 8 ? ((L + 16) / 116) ** 3 : L / 903.3;
    const s = Y <= 0.0031308 ? 12.92 * Y : 1.055 * Y ** (1 / 2.4) - 0.055;
    return Math.round(s * 255) / 255;
  };

  test('escala fija: al cambiar de campo, la misma ‖F‖ da la misma longitud y el mismo gris; aviso si cambia Δ', async ({ page }) => {
    await abrir(page);
    await estable(page);
    await page.getByRole('button', { name: 'Fijar escala' }).click();
    await expect(page.locator('[data-prueba="leyenda-escala"]')).toContainText('fija');
    const comprobar = async () => {
      const calc = await gancho(page, '(c) => c.calculo()');
      expect(calc).toMatchObject({ fRef: 3, origen: 'fija' });
      for (const k of [0, 50, 200, 400]) {
        const f = await gancho(page, `(c) => c.flecha(${k})`);
        if (!f) continue;
        expect(Math.abs(f.largo - calc.lMax * Math.min(f.mag / 3, 1))).toBeLessThan(1e-6);
        expect(Math.abs(f.gris - rampa(Math.min(f.mag / 3, 1)))).toBeLessThanOrEqual(1 / 255 + 1e-6);
      }
    };
    await comprobar();
    for (const id of ['radial-saliente', 'rotacional']) {
      await page.locator(`[data-campo="${id}"]`).click();
      await estable(page);
      await comprobar();
    }
    // Con otra N (Δ distinto), la leyenda avisa de que las longitudes no son comparables.
    await fijar(page, `{ ...s, muestreo: { ...s.muestreo, n: [11, 11, 11] } }`);
    await expect(page.locator('[data-prueba="leyenda-delta"]')).toContainText('no comparables');
    // Liberar vuelve a la escala automática.
    await page.getByRole('button', { name: /Liberar escala/ }).click();
    await expect(page.locator('[data-prueba="leyenda-escala"]')).toContainText('auto (P95)');
  });

  test('normalizada: todas las longitudes iguales (0.75 ℓmax) y la leyenda lo dice; logarítmica: marcas recalculadas', async ({ page }) => {
    await abrir(page);
    await estable(page);
    await page.getByRole('button', { name: 'Avanzado' }).click();
    await page.getByRole('group', { name: 'Longitud de las flechas' }).getByRole('button', { name: 'Normalizada' }).click();
    await estable(page);
    const calc = await gancho(page, '(c) => c.calculo()');
    const largos = new Set<number>();
    for (const k of [0, 100, 300, 600]) largos.add(Math.round((await gancho(page, `(c) => c.flecha(${k})`)).largo * 1e6));
    expect([...largos]).toEqual([Math.round(0.75 * calc.lMax * 1e6)]);
    await expect(page.locator('[data-prueba="leyenda-referencia"]')).toContainText('longitud constante');
    // Logarítmica: la marca central pasa de F_ref/2 a F_ref·(√10 − 1)/9.
    await expect(page.locator('[data-prueba="leyenda-marcas"]')).toContainText('1.5');
    await page.getByRole('group', { name: 'Luminancia de las flechas' }).getByRole('button', { name: 'Log' }).click();
    await expect(page.locator('[data-prueba="leyenda-marcas"]')).toContainText('0.721');
    const f = await gancho(page, '(c) => c.flecha(10)');
    expect(Math.abs(f.gris - rampa(Math.log10(1 + (9 * f.mag) / 3)))).toBeLessThanOrEqual(1 / 255 + 1e-6);
  });
});
