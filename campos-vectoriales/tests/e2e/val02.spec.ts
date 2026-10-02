/**
 * VAL-02 · criterios funcionales que no tenían prueba propia completa: V-FUN-01 (elegir campo,
 * con todos sus puntos), V-FUN-04 (equilibrios), V-FUN-16 (robustez ante 200 ediciones
 * aleatorias) y V-FUN-17 (HTML autocontenido con `file://` y la red cortada, también para ENT-01).
 */
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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
/** Posiciones de las marcas ≈ 0 (rombos) dibujadas. */
const ceros = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__campos.resultados().malla.instancias.ceros as Float32Array;
    return Array.from({ length: c.length / 3 }, (_, i) => [c[3 * i], c[3 * i + 1], c[3 * i + 2]].map((v) => Math.round(v * 1e6) / 1e6));
  });

const informe: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  const ruta = 'test-results/val02-informe.json';
  const previo = existsSync(ruta) ? (JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>) : {};
  writeFileSync(ruta, JSON.stringify({ ...previo, ...informe }, null, 2));
});

test.describe('VAL-02 · V-FUN-01 · elegir campo', () => {
  test('las 6 tarjetas: fórmula, flechas, leyenda y semillas del campo; marcada con borde, ✓ y aria-checked; la cámara no cambia', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await estable(page);
    // Semillas de cada ejemplo (catálogo, SPEC §4.1).
    const semillas: Record<string, unknown> = {
      uniforme: { tipo: 'rejilla', plano: 'YZ', c: -1.9, nu: 5, nv: 5 },
      'radial-saliente': { tipo: 'aleatoria', n: 32, semilla: 1 },
      'radial-entrante': { tipo: 'aleatoria', n: 32, semilla: 1 },
      rotacional: { tipo: 'rejilla', plano: 'XZ', c: 0, u: [0.3, 1.9], v: [-1.5, 1.5], nu: 6, nv: 3 },
      helicoidal: { tipo: 'rejilla', plano: 'XZ', c: 0, u: [0.5, 2], v: [0, 0], nu: 4, nv: 1 },
      silla: { tipo: 'rejilla', plano: 'XY', c: 0, nu: 7, nv: 7 },
    };
    const numero = (e: any) => (e.tipo === 'aleatoria' ? e.n : e.nu * e.nv);
    const camara0 = await gancho(page, '(c) => c.camara()');
    const formulas = new Set<string>();
    const resultado: Record<string, unknown> = {};
    for (const id of ['uniforme', 'radial-saliente', 'radial-entrante', 'rotacional', 'silla', 'helicoidal']) {
      const tarjeta = page.locator(`[data-campo="${id}"]`);
      await tarjeta.click();
      await estable(page);
      await expect.poll(async () => (await gancho(page, '(c) => c.pendiente().lineas'))).toBe(false);
      // Marcada: aria-checked, ✓ y borde de 2 px; las demás, sin marca.
      await expect(tarjeta).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('.tarjeta-ejemplo[aria-checked="true"]')).toHaveCount(1);
      await expect(tarjeta.locator('.tarjeta-marca')).toHaveText('✓');
      const borde = await tarjeta.evaluate((b) => getComputedStyle(b).borderTopWidth);
      const bordeOtra = await page.locator('.tarjeta-ejemplo[aria-checked="false"]').first().evaluate((b) => getComputedStyle(b).borderTopWidth);
      expect(borde).toBe('2px');
      expect(bordeOtra).not.toBe('2px');
      // Fórmula propia.
      const formula = (await page.locator('[data-prueba="formula-campo"]').textContent()) ?? '';
      expect(formulas.has(formula), id).toBe(false);
      formulas.add(formula);
      // Flechas: una por nodo válido; leyenda con la F_ref de esta malla.
      const calc = await gancho(page, '(c) => c.calculo()');
      expect((await gancho(page, '(c) => c.escena()')).flechas).toBe(calc.recuento.validos);
      await expect(page.locator('[data-prueba="leyenda-escala"]')).toContainText(`F_ref = ${String(calc.fRef).replace('-', '−')}`);
      // Semillas del campo: las del catálogo, todas usadas o descartadas con motivo.
      const e = await estado(page);
      expect(e.lineas.semillas).toEqual(semillas[id]);
      const s = await gancho(page, '(c) => c.resultados().lineas.semillas');
      expect(s.n + s.descartadas.fuera + s.descartadas.cero + s.descartadas.noDefinido + s.recortadas).toBe(numero(semillas[id]));
      // La cámara no cambia.
      const camara = await gancho(page, '(c) => c.camara()');
      for (const k of ['posicion', 'objetivo'] as const) camara[k].forEach((v: number, i: number) => expect(v).toBeCloseTo(camara0[k][i], 9));
      resultado[id] = { flechas: calc.recuento.validos, fRef: calc.fRef, semillas: s };
    }
    informe['V-FUN-01'] = resultado;
    sinErrores(reg);
  });
});

test.describe('VAL-02 · V-FUN-04 · equilibrios', () => {
  test('marcas ≈ 0 exactamente en el eje z (rotacional, silla), en el origen (radiales) y en ninguno (helicoidal con a = 0.25, uniforme); con a = 0, en el eje', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    const ejeZ = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map((z) => [0, 0, z]);
    const ordenar = (l: number[][]) => [...l].map((p) => p.map((v) => (Object.is(v, -0) ? 0 : v))).sort((a, b) => a[2]! - b[2]! || a[1]! - b[1]! || a[0]! - b[0]!);
    const resultado: Record<string, number> = {};
    for (const [id, esperado] of [
      ['rotacional', ejeZ],
      ['silla', ejeZ],
      ['radial-saliente', [[0, 0, 0]]],
      ['radial-entrante', [[0, 0, 0]]],
      ['helicoidal', []],
      ['uniforme', []],
    ] as const) {
      await page.locator(`[data-campo="${id}"]`).click();
      await estable(page);
      const c = await ceros(page);
      resultado[id] = c.length;
      expect(ordenar(c), id).toEqual(ordenar(esperado as unknown as number[][]));
    }
    // Helicoidal con a = 0: el eje z pasa a ser de equilibrios.
    await page.locator('[data-campo="helicoidal"]').click();
    await fijar(page, `{ ...s, parametros: s.parametros.map((p) => ({ ...p, valor: 0 })) }`);
    await estable(page);
    const c0 = await ceros(page);
    resultado['helicoidal a = 0'] = c0.length;
    expect(ordenar(c0)).toEqual(ordenar(ejeZ));
    informe['V-FUN-04'] = resultado;
    sinErrores(reg);
  });
});

test.describe('VAL-02 · V-FUN-16 · robustez', () => {
  test('200 ediciones aleatorias rápidas (expresiones, parámetros y dominio): 0 errores en consola, 0 excepciones y la interfaz responde al final (< 1 s)', async ({ page }) => {
    test.setTimeout(240_000);
    const reg = registrar(page);
    await abrir(page, 'prueba=1');
    await estable(page);
    // Generador reproducible (mulberry32) para que un fallo se pueda repetir.
    let semilla = 20261002;
    const azar = () => {
      semilla |= 0;
      semilla = (semilla + 0x6d2b79f5) | 0;
      let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const elegir = <T,>(l: readonly T[]) => l[Math.floor(azar() * l.length)] as T;
    const expresiones = ['x', '-y', 'sin(x*y)', 'x^2 - z', 'sqrt(x)', '1/x', 'exp(z)', 'k*x', 'x*(', ')', 'ln(-1)', 'atan2(y, x)', 'abs(z)', '2x+', 'hypot(x, y, z)', '1e400', 'cbrt(y)', 't', 'xy', '0'];
    const componentes = ['P', 'Q', 'R'] as const;
    const tipos: Record<string, number> = { expresion: 0, parametro: 0, dominio: 0, campo: 0, densidad: 0 };
    for (let k = 0; k < 200; k++) {
      const r = azar();
      if (r < 0.5) {
        tipos.expresion!++;
        const c = elegir(componentes);
        const campo = page.locator(`[data-prueba="expr-${c}"]`);
        await campo.fill(elegir(expresiones));
        if (azar() < 0.5) await campo.press('Tab');
      } else if (r < 0.65) {
        tipos.parametro!++;
        await fijar(page, `{ ...s, parametros: s.parametros.map((p) => ({ ...p, valor: Math.min(p.max, Math.max(p.min, ${(azar() * 6 - 3).toFixed(3)})) })) }`);
      } else if (r < 0.8) {
        tipos.dominio!++;
        const lado = (0.5 + azar() * 4).toFixed(2);
        await fijar(page, `{ ...s, dominio: { min: [-${lado}, -2, ${(-1 - azar()).toFixed(2)}], max: [${lado}, 2, ${(1 + azar()).toFixed(2)}] } }`);
      } else if (r < 0.92) {
        tipos.campo!++;
        await page.locator(`[data-campo="${elegir(['uniforme', 'radial-saliente', 'radial-entrante', 'rotacional', 'helicoidal', 'silla'])}"]`).click();
      } else {
        tipos.densidad!++;
        const n = elegir([3, 5, 9, 13]);
        await fijar(page, `{ ...s, muestreo: { ...s.muestreo, n: [${n}, ${n}, ${n}] } }`);
      }
    }
    // Justo al terminar la ráfaga, un campo válido conocido: la interfaz debe responder en menos
    // de 1 s. Se mide dentro de la página (sin las esperas de Playwright): desde el clic hasta el
    // estado nuevo y su malla calculada y entregada a la escena, y las tareas largas del hilo
    // principal. El fotograma dibujado se anota solo como dato: con WebGL por software, el
    // proceso GPU tarda hasta ~1.5 s en rasterizar los cambios de la ráfaga aunque el hilo
    // principal esté libre (D-57); en hardware real lo mide VAL-03.
    const medida = await page.evaluate(
      () =>
        new Promise<{ tEstado: number; tMalla: number; tFotograma: number; tareasLargas: number[] }>((resolver) => {
          const c = (window as any).__campos;
          const tareasLargas: number[] = [];
          const observador = new PerformanceObserver((l) => l.getEntries().forEach((e) => tareasLargas.push(Math.round(e.duration))));
          observador.observe({ type: 'longtask' });
          const t0 = performance.now();
          let tEstado = 0;
          (document.querySelector('[data-campo="rotacional"]') as HTMLElement).click();
          const id = setInterval(() => {
            if (!tEstado && c.estado().base === 'rotacional') tEstado = performance.now() - t0;
            if (tEstado && c.resultados().malla && !c.pendiente().malla) {
              clearInterval(id);
              const tMalla = performance.now() - t0;
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  observador.disconnect();
                  resolver({ tEstado, tMalla, tFotograma: performance.now() - t0, tareasLargas });
                }),
              );
            }
          }, 1);
        }),
    );
    const respuesta = medida.tMalla;
    informe['V-FUN-16 detalle'] = { ...medida, calculo: await gancho(page, '(c) => c.calculo()') };
    expect((await estado(page)).campo).toEqual({ P: '-omega*y', Q: 'omega*x', R: '0' });
    informe['V-FUN-16'] = { ediciones: 200, tipos, respuestaMs: respuesta, errores: reg.consola.length };
    expect(respuesta).toBeLessThan(1000);
    // Ninguna tarea del hilo principal bloquea la interfaz (p. ej. recompilar shaders: 0.5 s).
    expect(Math.max(0, ...medida.tareasLargas)).toBeLessThan(250);
    sinErrores(reg);
  });

  test('cambiar el dominio no desecha programas de shader (sin recompilaciones ni tirones)', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await estable(page);
    await gancho(page, '(c) => c.dibujar()');
    const antes = await gancho(page, '(c) => c.programas()');
    for (const lado of ['1.5', '3.25', '0.75']) {
      await fijar(page, `{ ...s, dominio: { min: [-${lado}, -2, -1], max: [${lado}, 2, 1.5] } }`);
      await estable(page);
      await gancho(page, '(c) => c.dibujar()');
    }
    const despues = await gancho(page, '(c) => c.programas()');
    informe['V-FUN-16 programas'] = { antes, despues };
    expect([...despues].sort()).toEqual([...antes].sort());
    sinErrores(reg);
  });
});

test.describe('VAL-02 · V-FUN-17 · HTML autocontenido sin red (ENT-01)', () => {
  const archivo = resolve('dist/campos-vectoriales.html');
  test.skip(!existsSync(archivo), 'Falta dist/campos-vectoriales.html (npm run build)');

  test('file:// con la red cortada: 0 peticiones de red, 0 errores, worker activo; escena, edición, inspector y exportaciones operativos; ≤ 3 MB', async ({ browser }) => {
    const bytes = statSync(archivo).size;
    expect(bytes).toBeLessThanOrEqual(3 * 1024 * 1024);
    const ctx = await browser.newContext({ acceptDownloads: true });
    await ctx.setOffline(true);
    const page = await ctx.newPage();
    const reg = registrar(page);
    const peticiones: string[] = [];
    page.on('request', (r) => {
      if (!/^(file|data|blob):/.test(r.url())) peticiones.push(r.url());
    });
    await page.goto(`${pathToFileURL(archivo).href}?prueba=1`);
    await page.waitForFunction(() => (window as any).__campos?.listo === true, null, { timeout: 30_000 });
    await estable(page);
    // Worker de cálculo activo (no el respaldo en el hilo principal).
    expect(await gancho(page, '(c) => c.modoCalculo')).toBe('worker');
    // Escena.
    expect((await gancho(page, '(c) => c.escena()')).flechas).toBe(729);
    // Edición.
    await page.locator('[data-prueba="expr-R"]').fill('0.5*z');
    await expect.poll(async () => (await estado(page)).campo.R).toBe('0.5*z');
    await estable(page);
    // Inspector: con el foco fuera del campo de texto (en la escena), «I» lo abre.
    await page.locator('[data-prueba="lienzo"]').focus();
    await page.keyboard.press('i');
    await expect(page.locator('[data-prueba="inspector"]')).toBeVisible();
    // Exportar configuración y PNG.
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    const json = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Configuración (.json)' }).click();
    expect((await json).suggestedFilename()).toMatch(/\.json$/);
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Imagen PNG…' }).click();
    const png = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportar', exact: true }).click();
    expect((await png).suggestedFilename()).toMatch(/\.png$/);
    // Ayuda.
    await page.locator('body').press('F1');
    await expect(page.locator('[data-prueba="ayuda"]')).toBeVisible();
    informe['V-FUN-17'] = { bytes, peticionesDeRed: peticiones.length, modo: 'worker' };
    expect(peticiones).toEqual([]);
    sinErrores(reg);
    await ctx.close();
  });
});
