import { expect, test, type Page } from '@playwright/test';
import { abrir, registrar, sinErrores } from '../util/app';

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
