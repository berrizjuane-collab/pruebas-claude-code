import { expect, test, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { abrir, registrar, sinErrores } from '../util/app';
import { trabajoMalla } from '../../src/compute/trabajos';
import { huellaMalla } from '../../src/compute/huella';
import { peticionMalla } from '../../src/compute/peticiones';
import { CATALOGO } from '../../src/math/catalog';
import { experimentoDesdeCatalogo, type EstadoExperimento } from '../../src/state/schema';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Evalúa `expr(window.__campos, arg)` en la página (como expresión: también vale con la CSP del HTML final). */
const gancho = (page: Page, expr: string, arg?: unknown) =>
  page.evaluate(`(${expr})(window.__campos, ${JSON.stringify(arg ?? null)})`) as Promise<any>;
/** Espera a que el orquestador no tenga trabajos pendientes. */
const estable = (page: Page) =>
  page.waitForFunction(() => {
    const c = (window as any).__campos;
    const p = c.pendiente();
    return c.resultados().malla !== null && !p.malla && !p.lineas;
  });

/** Registro de evidencias de H3 (se adjunta a `evidencia/CMP-0x/`). */
const informe: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/h3-informe.json', JSON.stringify(informe, null, 2));
});

/** Variantes que recorren otras ramas del código: funciones trascendentes, singularidades, centros, modo normalizado y luminancia log. */
function variantes(): [string, EstadoExperimento][] {
  const base = experimentoDesdeCatalogo('helicoidal');
  return [
    ['T1 · trascendentes', { ...base, campo: { P: 'sin(y*z)', Q: 'x^2*exp(z)', R: 'y^3*cos(x)' } }],
    ['T2 · singular en el origen', { ...base, campo: { P: 'x/r^3', Q: 'y/r^3', R: 'z/r^3' } }],
    [
      'centros, normalizado, log, 13³',
      {
        ...base,
        muestreo: { ...base.muestreo, n: [13, 13, 13], posicion: 'centros' },
        flechas: { ...base.flechas, modo: 'normalizado', luminancia: 'log' },
      },
    ],
    ['escala fija 0.5 (saturación)', { ...base, flechas: { ...base.flechas, escala: { tipo: 'fija', valor: 0.5 } } }],
  ];
}

test.describe('CMP-01 · worker y protocolo', () => {
  test('la malla del worker coincide bit a bit con la calculada en Node', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    expect(await gancho(page, '(c) => c.modoCalculo')).toBe('worker');
    const casos: [string, EstadoExperimento][] = [...CATALOGO.map((c) => [c.id, experimentoDesdeCatalogo(c.id)] as [string, EstadoExperimento]), ...variantes()];
    const filas: { caso: string; arrays: number; bytes: number; iguales: boolean }[] = [];
    for (const [caso, e] of casos) {
      const nodo = huellaMalla(trabajoMalla({ ...peticionMalla(e), id: 0 }));
      const worker = await gancho(page, '(c, e) => c.huellaMallaCon("worker", e)', e);
      expect(worker, caso).toEqual(nodo);
      const bytes = Object.values(nodo.arrays).reduce((s, h) => s + h.length / 2, 0);
      filas.push({ caso, arrays: Object.keys(nodo.arrays).length, bytes, iguales: true });
    }
    // Además, la malla que la aplicación dibuja (su propio worker) es la misma que la de Node.
    for (const c of CATALOGO) {
      await gancho(page, `(c) => c.seleccionarCampo(${JSON.stringify(c.id)})`);
      await estable(page);
      const aplicada = await gancho(page, '(c) => c.huellaMallaAplicada()');
      expect(aplicada, `${c.id} (aplicada)`).toEqual(huellaMalla(trabajoMalla({ ...peticionMalla(experimentoDesdeCatalogo(c.id)), id: 0 })));
    }
    informe['CMP-01 equivalencia'] = filas;
    sinErrores(reg);
  });

  test('un error dentro del worker se muestra y la interfaz sigue operativa', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    const estado = page.locator('[data-prueba="estado-calculo"]');
    const antes = (await gancho(page, '(c) => c.escena()')).flechas;
    await gancho(page, '(c) => c.fijarEstado((s) => ({ ...s, campo: { ...s.campo, P: "x+" } }))');
    await expect(estado).toContainText('Error: La componente P no es válida');
    await expect(estado).toHaveAttribute('role', 'alert');
    await expect(page.locator('[data-prueba="aviso-escena"]')).toHaveText('Aviso: Mostrando el último campo válido');
    // La escena conserva el último campo válido y sigue respondiendo.
    expect((await gancho(page, '(c) => c.escena()')).flechas).toBe(antes);
    await page.getByRole('button', { name: 'Restablecer', exact: true }).click();
    await page.getByRole('menuitem', { name: /Cámara/ }).click();
    await expect(page.getByRole('menu')).toBeHidden();
    // Elegir otro campo recupera el estado normal.
    await gancho(page, '(c) => c.seleccionarCampo("radial-saliente")');
    await expect(estado).toContainText('Listo');
    await expect(page.locator('[data-prueba="aviso-escena"]')).toHaveCount(0);
    informe['CMP-01 error'] = { mensaje: 'Error: La componente P no es válida…', flechasConservadas: antes };
    sinErrores(reg);
  });
});

test.describe('CMP-02 · orquestación, cancelación y presupuestos', () => {
  test.describe.configure({ mode: 'serial' });
  test('60 cambios de parámetro en 3 s: solo se aplica el último resultado de líneas y no hay tareas largas', { tag: '@rendimiento' }, async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await page.waitForFunction(() => (window as any).__campos.resultados().lineas !== null);
    const r = await page.evaluate(async () => {
      const c = (window as any).__campos;
      const largas: number[] = [];
      const obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => largas.push(e.duration)));
      obs.observe({ type: 'longtask', buffered: false });
      const aplicadas: { t: number; p: number[] | null }[] = [];
      let anterior = c.resultados().lineas;
      let mallas = 0;
      let mallaAnterior = c.resultados().malla;
      const baja = c.suscribirCalculo((s: any) => {
        if (s.lineas !== anterior) {
          anterior = s.lineas;
          aplicadas.push({ t: performance.now(), p: s.lineasConParametros });
        }
        if (s.malla !== mallaAnterior) {
          mallaAnterior = s.malla;
          mallas++;
        }
      });
      let fotogramas = 0;
      let midiendo = true;
      const contar = () => {
        fotogramas++;
        if (midiendo) requestAnimationFrame(contar);
      };
      requestAnimationFrame(contar);
      const t0 = performance.now();
      const valores: number[] = [];
      for (let k = 1; k <= 60; k++) {
        const v = Number((0.25 + 0.01 * k).toFixed(2));
        valores.push(v);
        c.fijarEstado((s: any) => ({ ...s, parametros: s.parametros.map((p: any) => (p.nombre === 'a' ? { ...p, valor: v } : p)) }));
        await new Promise((res) => setTimeout(res, 50));
      }
      const tCambios = performance.now() - t0;
      midiendo = false;
      const ultimo = valores[valores.length - 1];
      // Espera a que lleguen las líneas del último valor (o 5 s).
      const limite = performance.now() + 5000;
      while (performance.now() < limite && !(aplicadas.length && aplicadas[aplicadas.length - 1]!.p?.[0] === ultimo)) {
        await new Promise((res) => setTimeout(res, 20));
      }
      await new Promise((res) => setTimeout(res, 500));
      baja();
      obs.disconnect();
      return { tCambios, ultimo, aplicadas: aplicadas.map((a) => ({ t: a.t - t0, p: a.p })), mallas, fotogramas, largas, msLineas: c.resultados().lineas.ms };
    });
    informe['CMP-02 ráfaga'] = r;
    expect(r.tCambios).toBeLessThan(3600);
    expect(r.aplicadas).toHaveLength(1);
    expect(r.aplicadas[0].p).toEqual([r.ultimo]);
    expect(r.aplicadas[0].t).toBeGreaterThan(r.tCambios);
    expect(r.largas).toEqual([]);
    // Agrupamiento por fotograma: nunca más mallas aplicadas que cambios ni que fotogramas.
    expect(r.mallas).toBeLessThanOrEqual(Math.min(60, r.fotogramas + 1));
    sinErrores(reg);
  });

  test('«Cancelar» detiene el cálculo de líneas en menos de 100 ms', { tag: '@rendimiento' }, async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    // Cálculo largo: 256 semillas, hélice que no sale de Ω ni se cierra, paso pequeño y una expresión cara.
    await gancho(
      page,
      `(c) => c.fijarEstado((s) => ({
        ...s,
        campo: {
          P: '-y + 1e-9*sin(x)*cos(y)*exp(sin(z))*cos(x*y)',
          Q: 'x + 1e-9*cos(x)*sin(z)*exp(cos(y))*sin(x*z)',
          R: '0.004 + 1e-9*sin(x*y*z)*cos(x+y+z)',
        },
        parametros: [],
        lineas: { semillas: { tipo: 'rejilla', plano: 'XY', c: 0, nu: 16, nv: 16 }, paso: 0.01, longitudMax: 1e6 },
      }))`,
    );
    const boton = page.locator('[data-prueba="cancelar-calculo"]');
    await expect(boton).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-prueba="estado-calculo"]')).toContainText(/Calculando líneas… \d+ %/);
    const medidasAntes = await gancho(page, '(c) => { window.__lineasAntes = c.resultados().lineas; return c.medidasCancelacion().length; }');
    const progresoAlCancelar = await gancho(page, '(c) => c.resultados().progresoLineas');
    await boton.click();
    await page.waitForFunction((n) => (window as any).__campos.medidasCancelacion().length > n, medidasAntes, { timeout: 2000 });
    const medida = (await gancho(page, '(c) => c.medidasCancelacion()')).at(-1);
    await expect(page.locator('[data-prueba="estado-calculo"]')).toContainText('Aviso: Cálculo de líneas cancelado');
    await expect(boton).toHaveCount(0);
    // Ningún resultado tardío se aplica después de cancelar.
    await page.waitForTimeout(1500);
    const despues = await gancho(page, '(c) => ({ mismasLineas: c.resultados().lineas === window.__lineasAntes, canceladas: c.resultados().lineasCanceladas, progreso: c.resultados().progresoLineas })');
    informe['CMP-02 cancelación'] = { medida, progresoAlCancelar, despues };
    expect(medida.tipo).toBe('lineas');
    expect(medida.ms).toBeLessThan(100);
    expect(despues).toEqual({ mismasLineas: true, canceladas: true, progreso: null });
    sinErrores(reg);
  });
});
