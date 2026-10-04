import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { abrir, registrar, sinErrores } from '../util/app';

/* eslint-disable @typescript-eslint/no-explicit-any */
type PaginaAxe = ConstructorParameters<typeof AxeBuilder>[0]['page'];
const axe = (page: Page) => new AxeBuilder({ page: page as unknown as PaginaAxe });
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
// Se combina con lo que ya hayan escrito otros procesos de la misma ejecución (el proyecto de
// rendimiento ejecuta este archivo aparte); Playwright vacía `test-results` al empezar.
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  const ruta = 'test-results/h5-informe.json';
  const previo = existsSync(ruta) ? (JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>) : {};
  writeFileSync(ruta, JSON.stringify({ ...previo, ...informe }, null, 2));
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
    // La leyenda sigue al estado al instante; los grises llegan con la malla nueva del worker.
    await estable(page);
    const f = await gancho(page, '(c) => c.flecha(10)');
    expect(Math.abs(f.gris - rampa(Math.log10(1 + (9 * f.mag) / 3)))).toBeLessThanOrEqual(1 / 255 + 1e-6);
  });
});

// ---------------------------------------------------------------- REN-05 (V-FUN-07, parte geométrica)

test.describe('REN-05 · cortes', () => {
  const corte = async (page: Page) => (await gancho(page, '(c) => c.escena()')).corte;

  test('XY, XZ e YZ: el plano está en la posición indicada y con su rótulo; C lo activa y lo desactiva', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await estable(page);
    const interruptor = page.getByRole('switch', { name: 'Mostrar el plano de corte' });
    await page.locator('body').press('c');
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await corte(page)).rotulo).toBe('z = 0.00');
    await page.getByRole('button', { name: 'Corte', exact: true }).click();
    const casos: [string, string, string, number][] = [
      ['YZ', '-0.5', 'x = −0.50', 0],
      ['XZ', '1.25', 'y = 1.25', 1],
      ['XY', '-2', 'z = −2.00', 2],
    ];
    const medidas: Record<string, unknown> = {};
    for (const [plano, c, rotulo, k] of casos) {
      await page.getByRole('group', { name: 'Plano del corte' }).getByRole('button', { name: `Plano ${plano}` }).click();
      const campo = page.locator('[data-prueba="corte-c"]');
      await campo.fill(c);
      await campo.press('Enter');
      await expect.poll(async () => (await corte(page)).rotulo).toBe(rotulo);
      const d = await corte(page);
      expect(d.visible).toBe(true);
      // Las cuatro esquinas, en el plano pedido y extendidas a toda la caja en las otras dos coordenadas.
      expect(d.esquinas).toHaveLength(4);
      for (const q of d.esquinas) expect(q[k]).toBeCloseTo(Number(c), 9);
      for (const j of [0, 1, 2].filter((j) => j !== k)) expect(new Set(d.esquinas.map((q: number[]) => q[j]))).toEqual(new Set([-2, 2]));
      // El rótulo, junto a la esquina más cercana a la cámara.
      const cam = (await gancho(page, '(c) => c.camara()')).posicion as number[];
      const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
      const masCercana = (p: number[]) => d.esquinas.reduce((m: number, q: number[], i: number) => (dist(q, p) < dist(d.esquinas[m], p) ? i : m), 0);
      expect(masCercana(d.posRotulo)).toBe(masCercana(cam));
      medidas[plano] = { rotulo: d.rotulo, esquinas: d.esquinas, esquinaRotulo: d.esquinas[masCercana(d.posRotulo)] };
    }
    informe['REN-05 planos'] = medidas;
    // Vista XY: el eje z apunta a la cámara y sus rótulos se ocultan (no se amontonan en el origen).
    await gancho(page, "(c) => c.vista('XY')");
    await gancho(page, '(c) => c.dibujar()');
    expect((await gancho(page, '(c) => c.escena()')).rotulosEjes).toEqual([true, true, false]);
    await gancho(page, "(c) => c.vista('iso')");
    await gancho(page, '(c) => c.dibujar()');
    expect((await gancho(page, '(c) => c.escena()')).rotulosEjes).toEqual([true, true, true]);
    // Los atajos no actúan dentro de un campo de texto: primero se sale del campo de posición.
    await page.locator('[data-prueba="corte-c"]').blur();
    await page.keyboard.press('c');
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    expect((await corte(page)).visible).toBe(false);
    sinErrores(reg);
  });

  test('«solo corte»: se ocultan las flechas del volumen y las del plano quedan sobre él; tangencial: F·n = 0 y nota fija', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await estable(page);
    await page.getByRole('button', { name: 'Corte', exact: true }).click();
    await page.getByRole('switch', { name: 'Mostrar el plano de corte' }).click();
    const vector = page.getByRole('group', { name: 'Vector en el corte' });
    // «Vector» solo tiene sentido con las flechas del plano.
    await expect(vector.getByRole('button', { name: 'Tangencial' })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('group', { name: 'Plano del corte' }).getByRole('button', { name: 'Plano YZ' }).click();
    await page.locator('[data-prueba="corte-c"]').fill('-0.5');
    await page.locator('[data-prueba="corte-c"]').press('Enter');
    await page.getByRole('group', { name: 'Flechas del corte' }).getByRole('button', { name: 'Solo corte' }).click();
    await estable(page);
    await expect.poll(async () => (await gancho(page, '(c) => c.flechasCorte()'))?.n ?? 0).toBe(81);
    const esc = await gancho(page, '(c) => c.escena()');
    expect(esc.flechasVisibles).toBe(false);
    expect(esc.corte.flechas).toBe(81);
    const completo = await gancho(page, '(c) => c.flechasCorte()');
    for (let i = 0; i < completo.n; i++) expect(completo.centros[3 * i]).toBeCloseTo(-0.5, 5);
    // Helicoidal: F = (−y, x, a) tiene componente normal Fx = −y ≠ 0 fuera de y = 0.
    const normalMax = (f: { n: number; dir: number[] }) => Math.max(...Array.from({ length: f.n }, (_, i) => Math.abs(f.dir[3 * i]!)));
    expect(normalMax(completo)).toBeGreaterThan(0.5);
    await vector.getByRole('button', { name: 'Tangencial' }).click();
    await expect(page.locator('[data-prueba="nota-tangencial"]')).toContainText('no son líneas de corriente 3D');
    await expect.poll(async () => normalMax(await gancho(page, '(c) => c.flechasCorte()'))).toBeLessThan(1e-6);
    // Volver a «Todas» restituye las flechas del volumen y retira la nota.
    await page.getByRole('group', { name: 'Flechas del corte' }).getByRole('button', { name: 'Todas' }).click();
    await expect(page.locator('[data-prueba="nota-tangencial"]')).toHaveCount(0);
    await expect.poll(async () => (await gancho(page, '(c) => c.escena()')).flechasVisibles).toBe(true);
    informe['REN-05 solo corte'] = { flechas: completo.n, componenteNormalMaxCompleto: normalMax(completo) };
    sinErrores(reg);
  });

  test('la posición se mantiene dentro de Ω: valores fuera de rango se rechazan y el corte se recoloca al cambiar el dominio', async ({ page }) => {
    await abrir(page);
    await estable(page);
    await page.getByRole('button', { name: 'Corte', exact: true }).click();
    await page.getByRole('switch', { name: 'Mostrar el plano de corte' }).click();
    const campo = page.locator('[data-prueba="corte-c"]');
    await campo.fill('3');
    await campo.press('Enter');
    await expect(page.locator('.seccion[data-prueba="seccion-corte"] .mensaje-campo')).toContainText('≤ 2');
    expect((await estado(page)).corte.c).toBe(0);
    await campo.press('Escape');
    await campo.fill('1.5');
    await campo.press('Enter');
    expect((await estado(page)).corte.c).toBe(1.5);
    await expect.poll(async () => (await corte(page)).rotulo).toBe('z = 1.50');
    // Con z ∈ [−2, 1], z = 1.5 queda fuera: el corte vuelve a z = 0 y el rectángulo se adapta.
    await page.getByRole('button', { name: 'Dominio y muestreo' }).click();
    await page.getByRole('switch', { name: /^Cubo/ }).click();
    await page.locator('[data-prueba="max-z"]').fill('1');
    await page.locator('[data-prueba="max-z"]').press('Enter');
    expect((await estado(page)).corte.c).toBe(0);
    await expect.poll(async () => (await corte(page)).rotulo).toBe('z = 0.00');
    await page.locator('[data-prueba="max-x"]').fill('3');
    await page.locator('[data-prueba="max-x"]').press('Enter');
    await expect.poll(async () => Math.max(...(await corte(page)).esquinas.map((q: number[]) => q[0]))).toBe(3);
  });
});

// ---------------------------------------------------------------- REN-06 (V-FUN-07, signos con T6)

/** Formas de los glifos (render/glifos.ts). */
const FORMA = { ASPA: 3, MAS: 6, MENOS: 7, PUNTO_CIRCULO: 8, CRUZ_CIRCULO: 9, GIRO_ANTIHORARIO: 10, GIRO_HORARIO: 11 } as const;

test.describe('REN-06 · mapa escalar del corte', () => {
  const conCorte = (campo: string, escalar: string, extra = '') =>
    `{ ...s, nombre: 'Prueba', base: null, campo: ${campo}, parametros: [], capas: { ...s.capas, flechas: false, lineas: false }, corte: { ...s.corte, activo: true, plano: 'XY', c: 0, escalar: '${escalar}'${extra} } }`;
  /** Malla, líneas y corte aplicados. */
  const listo = (page: Page) =>
    page.waitForFunction(() => {
      const c = (window as any).__campos;
      const p = c.pendiente();
      return c.resultados().malla !== null && c.resultados().corte !== null && !p.malla && !p.lineas && !p.corte;
    });
  const mapa = async (page: Page) => (await gancho(page, '(c) => c.escena()')).corte.escalar;
  const proyectar = (page: Page, p: number[]) => gancho(page, '(c, p) => c.proyectar(p[0], p[1], p[2])', p) as Promise<[number, number]>;

  test('V-FUN-07 · T6 con «Escalar: div F»: rayado y «−» a la izquierda de x = −0.5, puntos y «+» a la derecha, curva discontinua en x = −0.5', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await fijar(page, conCorte(`{ P: 'x^2', Q: 'y', R: '0' }`, 'ninguno'));
    // El escalar se elige en el panel.
    await page.getByRole('button', { name: 'Corte', exact: true }).click();
    await page.getByRole('combobox', { name: 'Escalar sobre el corte' }).click();
    await page.getByRole('option', { name: 'div F' }).click();
    await listo(page);
    await gancho(page, "(c) => c.vista('XY')");
    await page.waitForTimeout(200);
    const m = await mapa(page);
    expect(m).toMatchObject({ tipo: 'divergencia', vRef: 5, lado: 42 });

    // Curva de nivel cero: todos sus puntos en x = −0.5 (±1 celda de la textura).
    const celda = 4 / (m.lado - 1);
    const xs = m.contorno.filter((_: number, i: number) => i % 3 === 0);
    expect(xs.length).toBeGreaterThan(10);
    for (const x of xs) expect(Math.abs(x + 0.5)).toBeLessThan(celda);
    // Glifos: «−» a la izquierda, «+» a la derecha.
    for (const g of m.glifos) expect(g.forma).toBe(g.pos[0] < -0.5 ? FORMA.MENOS : FORMA.MAS);
    expect(m.glifos.filter((g: { forma: number }) => g.forma === FORMA.MENOS).length).toBeGreaterThan(0);

    // Leyenda del corte.
    const leyenda = page.locator('[data-prueba="leyenda-corte"]');
    await expect(leyenda).toContainText('|div F| en z = 0.00');
    await expect(leyenda).toContainText('div F > 0: fuente');
    await expect(leyenda).toContainText('div F < 0: sumidero');
    await expect(leyenda).toContainText('V_ref = 5 · auto (P95)');

    // ---- Píxeles: patrón a cada lado de x = −0.5, vista desde +z.
    await page.getByRole('button', { name: 'Leyenda' }).click(); // plegada: no tapa el corte
    await page.waitForTimeout(100);
    const lienzo = page.locator('canvas').first();
    const png = PNG.sync.read(await lienzo.screenshot());
    const g = (x: number, y: number) => png.data[4 * (y * png.width + x)]!;
    const [x0, y0] = await proyectar(page, [-2, 2, 0]);
    const [x1, y1] = await proyectar(page, [2, -2, 0]);
    const pxU = (x1 - x0) / 4; // píxeles por unidad (vista cenital: x a la derecha, y arriba)
    expect(Math.abs((y1 - y0) / 4 - pxU)).toBeLessThan(0.5); // el plano, paralelo a la pantalla
    const aPx = (x: number, y: number) => [x0 + (x + 2) * pxU, y0 + (2 - y) * pxU] as const;
    const glifos = await Promise.all(m.glifos.map((q: { pos: number[] }) => proyectar(page, q.pos)));
    const tapado = (px: number, py: number) => glifos.some(([gx, gy]) => Math.abs(px - gx) < 12 && Math.abs(py - gy) < 12);
    // Regiones sin ejes ni rótulos (|x|, |y| > 0.3) y lejos de la curva de nivel.
    const region = (xa: number, xb: number) => {
      const filas: { y: number; xs: number[] }[] = [];
      const [pxa] = aPx(xa, 0);
      const [pxb] = aPx(xb, 0);
      for (const [ya, yb] of [
        [0.3, 1.85],
        [-1.85, -0.3],
      ] as const) {
        const [, pya] = aPx(0, yb);
        const [, pyb] = aPx(0, ya);
        for (let y = Math.ceil(pya); y <= Math.floor(pyb); y++) {
          const xsFila: number[] = [];
          for (let x = Math.ceil(pxa); x <= Math.floor(pxb); x++) if (!tapado(x, y) && !(Math.abs((x - x0) / pxU - 2) < 0.3)) xsFila.push(x);
          filas.push({ y, xs: xsFila });
        }
      }
      return filas;
    };
    const analizar = (filas: { y: number; xs: number[] }[]) => {
      // Base por columna (mediana: el patrón cubre ≈ 15 %) y píxeles de patrón (≥ +8 niveles).
      const columnas = new Map<number, number[]>();
      for (const f of filas) for (const x of f.xs) (columnas.get(x) ?? columnas.set(x, []).get(x)!).push(g(x, f.y));
      const base = new Map([...columnas].map(([x, v]) => [x, v.sort((a, b) => a - b)[Math.floor(v.length / 2)]!]));
      const marca = new Set<number>();
      let maximo = 0;
      for (const f of filas) {
        for (const x of f.xs) {
          maximo = Math.max(maximo, g(x, f.y));
          if (g(x, f.y) > base.get(x)! + 8) marca.add(f.y * png.width + x);
        }
      }
      const en = (x: number, y: number) => marca.has(y * png.width + x);
      const filasCon = filas.filter((f) => f.xs.some((x) => en(x, f.y))).length / filas.length;
      // Coherencia diagonal: «/» (x+1, y−1) frente a «\\» (x+1, y+1).
      let n = 0;
      let barra = 0;
      let contra = 0;
      for (const k of marca) {
        const x = k % png.width;
        const y = Math.floor(k / png.width);
        n++;
        if (en(x + 1, y - 1)) barra++;
        if (en(x + 1, y + 1)) contra++;
      }
      // Periodo horizontal: primer pico de la autocorrelación de las filas (no un armónico).
      const C = [0];
      for (let d = 1; d < 62; d++) {
        let num = 0;
        let den = 0;
        for (const f of filas) {
          const fila = new Set(f.xs);
          for (const x of f.xs) {
            if (!fila.has(x + d) || !en(x, f.y)) continue;
            den++;
            if (en(x + d, f.y)) num++;
          }
        }
        C.push(den > 0 ? num / den : 0);
      }
      const cMax = Math.max(...C.slice(5));
      let dMejor = 0;
      for (let d = 5; d < 61 && !dMejor; d++) if (C[d]! >= C[d - 1]! && C[d]! >= C[d + 1]! && C[d]! > 0.6 * cMax) dMejor = d;
      const base0 = [...base.values()];
      return { filasCon, barra: barra / n, contra: contra / n, periodo: dMejor, cobertura: marca.size / filas.reduce((s, f) => s + f.xs.length, 0), maximo, base: [Math.min(...base0), Math.max(...base0)] };
    };
    const izquierda = analizar(region(-1.85, -0.75));
    const derecha = analizar(region(-0.25, 1.85));
    const periodoPx = m.periodo * pxU;
    informe['V-FUN-07 píxeles'] = { periodoPx, izquierda, derecha };
    // Izquierda: rayado «/» (todas las filas cortan rayas; coherente en la diagonal «/»), periodo √2·P en horizontal.
    expect(izquierda.filasCon).toBeGreaterThan(0.95);
    expect(izquierda.barra).toBeGreaterThan(izquierda.contra + 0.2);
    expect(Math.abs(izquierda.periodo / (Math.SQRT2 * periodoPx) - 1)).toBeLessThan(0.15);
    // Derecha: puntos (filas vacías entre filas de puntos; sin dirección preferente), periodo P.
    expect(derecha.filasCon).toBeLessThan(0.75);
    expect(derecha.filasCon).toBeGreaterThan(0.25);
    expect(Math.abs(derecha.barra - derecha.contra)).toBeLessThan(0.15);
    expect(Math.abs(derecha.periodo / periodoPx - 1)).toBeLessThan(0.15);
    // Cobertura parecida (el patrón no sesga la luminancia de la banda) y banda oscura (≤ L* 42 ≈ sRGB 104).
    for (const r of [izquierda, derecha]) {
      expect(r.cobertura).toBeGreaterThan(0.08);
      expect(r.cobertura).toBeLessThan(0.3);
      expect(r.maximo).toBeLessThanOrEqual(104);
    }
    // Curva discontinua en x = −0.5: píxeles claros (#B0B0B0) solo en esa franja, a trazos.
    const [xc] = aPx(-0.5, 0);
    let trazos = 0;
    let filasFranja = 0;
    for (const [ya, yb] of [
      [0.3, 1.85],
      [-1.85, -0.3],
    ] as const) {
      for (let y = Math.ceil(aPx(0, yb)[1]); y <= Math.floor(aPx(0, ya)[1]); y++) {
        if (glifos.some(([gx, gy]) => Math.abs(xc - gx) < 14 && Math.abs(y - gy) < 12)) continue;
        filasFranja++;
        let claro = false;
        for (let x = Math.round(xc - celda * pxU); x <= Math.round(xc + celda * pxU); x++) if (g(x, y) > 140) claro = true;
        if (claro) trazos++;
      }
    }
    informe['V-FUN-07 curva cero'] = { xPantalla: xc, fraccionConTrazo: trazos / filasFranja };
    expect(trazos / filasFranja).toBeGreaterThan(0.4);
    expect(trazos / filasFranja).toBeLessThan(0.85);
    sinErrores(reg);
  });

  test('F·n con ⊙/⊗, (rot F)·n con ↺/↻ según ω, ‖F‖ sin signo, × donde no hay valor', async ({ page }) => {
    await abrir(page);
    // F·n con n = +z: F = (0, 0, x) → ⊙ a la derecha de x = 0, ⊗ a la izquierda.
    await fijar(page, conCorte(`{ P: '0', Q: '0', R: 'x' }`, 'normal'));
    await listo(page);
    let m = await mapa(page);
    for (const q of m.glifos) expect(q.forma).toBe(q.pos[0] > 0 ? FORMA.PUNTO_CIRCULO : FORMA.CRUZ_CIRCULO);
    await expect(page.locator('[data-prueba="leyenda-corte"]')).toContainText('F·n > 0: sale hacia +z');
    // (rot F)·n del rotacional: 2ω, sin cambio de signo (ni curva de nivel).
    for (const [omega, forma] of [
      [1, FORMA.GIRO_ANTIHORARIO],
      [-1, FORMA.GIRO_HORARIO],
    ] as const) {
      await fijar(page, conCorte(`{ P: '-${omega}*y', Q: '${omega}*x', R: '0' }`, 'rotacional'));
      await listo(page);
      m = await mapa(page);
      expect(m.glifos.length).toBe(16);
      for (const q of m.glifos) expect(q.forma).toBe(forma);
      expect(m.contorno).toEqual([]);
      expect(m.vRef).toBe(2);
    }
    await expect(page.locator('[data-prueba="leyenda-corte"]')).toContainText('giro horario visto desde +z');
    // ‖F‖: solo la banda oscura (sin patrón, curva ni glifos de signo).
    await fijar(page, conCorte(`{ P: 'x^2', Q: 'y', R: '0' }`, 'magnitud'));
    await listo(page);
    m = await mapa(page);
    expect(m).toMatchObject({ tipo: 'magnitud', contorno: [], glifos: [] });
    await expect(page.locator('[data-prueba="leyenda-corte"]')).toContainText('‖F‖ en z = 0.00');
    await expect(page.locator('[data-prueba="leyenda-signos"] li')).toHaveCount(0);
    // (rot F)·ŷ de (zy, −zx, 0) es y: nula en el plano y = 0 → la leyenda lo dice (sin escala ficticia).
    await fijar(page, conCorte(`{ P: 'z*y', Q: '-z*x', R: '0' }`, 'rotacional', `, plano: 'XZ'`));
    await listo(page);
    await expect(page.locator('[data-prueba="leyenda-corte"]')).toContainText('(rot F)·n = 0 en todo el corte');
    await expect(page.locator('[data-prueba="leyenda-corte"] [data-prueba="barra-escalar"]')).toHaveCount(0);
    // √x: div no definida para x < 0 → × en esa mitad y «no definido» en la leyenda.
    await fijar(page, conCorte(`{ P: 'sqrt(x)', Q: '0', R: '0' }`, 'divergencia'));
    await listo(page);
    m = await mapa(page);
    for (const q of m.glifos) if (q.pos[0] < 0) expect(q.forma).toBe(FORMA.ASPA);
    await expect(page.locator('[data-prueba="leyenda-corte"]')).toContainText('no definido');
  });

  test('V_ref se fija desde la leyenda y se conserva al cambiar de campo; cambiar de escalar la libera', async ({ page }) => {
    await abrir(page);
    await fijar(page, conCorte(`{ P: 'x^2', Q: 'y', R: '0' }`, 'divergencia'));
    await listo(page);
    await page.getByRole('button', { name: 'Fijar V_ref' }).click();
    await expect(page.locator('[data-prueba="leyenda-vref"]')).toContainText('V_ref = 5 · fija');
    expect((await estado(page)).corte.escala).toEqual({ tipo: 'fija', valor: 5 });
    // Otro campo con div mayor (6x + 1): la escala sigue fija.
    await fijar(page, `{ ...s, campo: { P: '3*x^2', Q: 'y', R: '0' } }`);
    await listo(page);
    expect((await mapa(page)).vRef).toBe(5);
    await page.getByRole('button', { name: /Liberar V_ref/ }).click();
    await expect(page.locator('[data-prueba="leyenda-vref"]')).toContainText('auto (P95)');
    await listo(page);
    expect((await mapa(page)).vRef).toBeGreaterThan(5);
    // Fijada de nuevo y con otro escalar: vuelve a automática.
    await page.getByRole('button', { name: 'Fijar V_ref' }).click();
    await gancho(page, "(c) => c.fijarEstado((s) => s)");
    await page.getByRole('button', { name: 'Corte', exact: true }).click();
    await page.getByRole('combobox', { name: 'Escalar sobre el corte' }).click();
    await page.getByRole('option', { name: 'F · n', exact: true }).click();
    expect((await estado(page)).corte.escala).toEqual({ tipo: 'auto' });
  });
});

// ---------------------------------------------------------------- REN-07 (glifos de rot F)

test.describe('REN-07 · glifos de rotacional', () => {
  test('rotacional con ω = ±1: glifos hacia ±z, anillo antihorario (ω = 1) u horario (ω = −1) visto desde arriba; puntas del lado de la cámara', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await page.locator('[data-campo="rotacional"]').click();
    await estable(page);
    // «Glifos: rot F» con el atajo G.
    await page.locator('body').press('g');
    await page.waitForFunction(() => (window as any).__campos.resultados().malla?.glifos === 'rotacional');
    await estable(page);
    const medidas: Record<string, unknown> = {};
    for (const omega of [1, -1]) {
      await fijar(page, `{ ...s, parametros: s.parametros.map((p) => ({ ...p, valor: ${omega} })) }`);
      await page.waitForFunction((w) => {
        const m = (window as any).__campos.resultados().malla;
        return m?.glifos === 'rotacional' && m.instancias.n > 0 && Math.sign(m.instancias.dir[2]) === Math.sign(w);
      }, omega);
      await estable(page);
      await gancho(page, '(c) => c.dibujar()');
      const a = await gancho(page, '(c) => c.anillos()');
      const cam = (await gancho(page, '(c) => c.camara()')).posicion as number[];
      expect(a.n).toBe(729);
      expect(a.dibujados).toBe(729);
      let delante = 0;
      for (let i = 0; i < a.n; i++) {
        expect(a.dir[3 * i + 2]).toBeCloseTo(omega, 6);
        for (const j of [0, 1]) {
          const k = 2 * i + j;
          const e = [0, 1, 2].map((q) => a.punta[3 * k + q] - a.centro[3 * i + q]);
          const t = [0, 1, 2].map((q) => a.tangente[3 * k + q]);
          const g = [e[1]! * t[2]! - e[2]! * t[1]!, e[2]! * t[0]! - e[0]! * t[2]!, e[0]! * t[1]! - e[1]! * t[0]!];
          // Giro visto desde +z: antihorario (g_z > 0) con ω = 1, horario con ω = −1.
          expect(Math.sign(g[2]!)).toBe(omega);
        }
        // La primera punta está en el lado del anillo que mira a la cámara.
        const d = (p: number[]) => Math.hypot(p[0]! - cam[0]!, p[1]! - cam[1]!, p[2]! - cam[2]!);
        if (d(a.punta.slice(6 * i, 6 * i + 3)) < d(a.centro.slice(3 * i, 3 * i + 3))) delante++;
      }
      expect(delante).toBe(a.n);
      medidas[`omega=${omega}`] = { glifos: a.n, ejeZ: Math.sign(a.dir[2]), puntasDelante: delante };
    }
    informe['REN-07 orientación'] = medidas;
    // Leyenda: la banda clara es ‖rot F‖ con su C_ref, y el anillo se explica.
    const leyenda = page.locator('[data-prueba="leyenda-flechas"]');
    await expect(page.locator('.leyenda')).toContainText('‖rot F‖');
    await expect(leyenda).toContainText('eje de giro: rot F');
    await expect(leyenda).toContainText('regla de la mano derecha');
    await expect(page.locator('[data-prueba="leyenda-escala"]')).toContainText('C_ref = 2 · auto (P95)');
    // Fijar C_ref no toca F_ref.
    await page.getByRole('button', { name: 'Fijar escala' }).click();
    expect((await estado(page)).flechas).toMatchObject({ escala: { tipo: 'auto' }, escalaRot: { tipo: 'fija', valor: 2 } });
    // Volver a «Glifos: F»: la leyenda vuelve a ‖F‖ y F_ref.
    await page.locator('body').press('g');
    await expect(page.locator('[data-prueba="leyenda-escala"]')).toContainText('F_ref');
    // F = (−ωy, ωx, 0) es nulo en el eje z: 9 nodos «≈ 0» y 720 flechas.
    await expect.poll(async () => (await gancho(page, '(c) => c.escena()')).flechas).toBe(720);
    sinErrores(reg);
  });
});

// ---------------------------------------------------------------- REN-08 (partículas y animación)

test.describe('REN-08 · partículas y control de animación', () => {
  /** Suma de los desplazamientos de las partículas entre dos lecturas. */
  const posiciones = async (page: Page) => (await gancho(page, '(c) => c.particulas()')).pos as number[];
  const movimiento = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - (b[i] ?? v)), 0);

  test('Espacio y el botón de la barra pausan y reanudan; la leyenda muestra τ y el estado se anuncia', async ({ page }) => {
    const reg = registrar(page);
    // Reloj real (`prueba=1`, sin congelar la animación) y sin movimiento reducido.
    await abrir(page, 'prueba=1');
    const boton = page.locator('[data-prueba="boton-animacion"]');
    const avanza = async () => {
      const a = await posiciones(page);
      await expect.poll(async () => movimiento(a, await posiciones(page)), { timeout: 10_000 }).toBeGreaterThan(0.01);
    };
    // Sin partículas ni rueda no hay nada que animar: el botón está, pero deshabilitado con su motivo.
    await expect(boton).toHaveAttribute('aria-disabled', 'true');
    await page.locator('body').press('p');
    await expect(boton).not.toHaveAttribute('aria-disabled', 'true');
    await expect(boton).toHaveAttribute('aria-label', 'Pausar la animación');
    await expect.poll(async () => (await gancho(page, '(c) => c.animacion()')).enMarcha).toBe(true);
    await avanza();
    // Espacio: pausa (y lo anuncia); las partículas no se mueven.
    await page.keyboard.press(' ');
    await expect(boton).toHaveAttribute('aria-label', 'Reanudar la animación');
    await expect(page.locator('[data-prueba="anuncio-animacion"]')).toHaveText('Animación en pausa');
    await expect(page.locator('[data-prueba="leyenda-tau"]')).toContainText('animación en pausa');
    const quietas = await posiciones(page);
    await page.waitForTimeout(600);
    expect(movimiento(quietas, await posiciones(page))).toBe(0);
    // El botón la reanuda.
    await boton.click();
    await expect(page.locator('[data-prueba="anuncio-animacion"]')).toHaveText('Animación en marcha');
    await avanza();
    // Con el foco en un botón, Espacio pulsa el botón y no conmuta la animación.
    await page.getByRole('button', { name: 'Vista isométrica' }).focus();
    await page.keyboard.press(' ');
    expect((await gancho(page, '(c) => c.animacion()')).enMarcha).toBe(true);
    // τ = Δ/F_ref = 0.5/3 en el helicoidal.
    await expect(page.locator('[data-prueba="leyenda-tau"]')).toContainText('1 s ≙ τ = 0.167 unidades de t');
    expect((await gancho(page, '(c) => c.animacion()')).tau).toBeCloseTo(0.5 / 3, 12);
    const esc = (await gancho(page, '(c) => c.escena()')).particulas;
    expect(esc).toMatchObject({ visible: true, particulas: 400 });
    expect(esc.tramos).toBeGreaterThan(400 * 8);
    informe['REN-08 pausa'] = { tau: 0.5 / 3, particulas: esc.particulas, tramosEstela: esc.tramos };
    sinErrores(reg);
  });

  test('con movimiento reducido arranca en pausa y la estela ya muestra el sentido', async ({ browser }) => {
    const contexto = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await contexto.newPage();
    await abrir(page, 'prueba=1');
    await page.locator('body').press('p');
    await expect(page.locator('[data-prueba="boton-animacion"]')).toHaveAttribute('aria-label', 'Reanudar la animación');
    expect((await gancho(page, '(c) => c.animacion()')).enMarcha).toBe(false);
    const a = await posiciones(page);
    await page.waitForTimeout(300);
    expect(movimiento(a, await posiciones(page))).toBe(0);
    // La estela está llena (12 posiciones → 11 tramos por partícula, salvo las que renacieron).
    expect((await gancho(page, '(c) => c.escena()')).particulas.tramos).toBeGreaterThan(400 * 8);
    await expect(page.locator('[data-prueba="leyenda-tau"]')).toContainText('animación en pausa');
    await contexto.close();
  });

  test('V-FUN-08 · rueda frente a partículas: rotacional ω = 1, reloj determinista, 2 s → mismo ángulo (T-18) y «ω = 1.000 rad/t»', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await page.locator('[data-campo="rotacional"]').click();
    await estable(page);
    await fijar(page, `{ ...s, punto: [1, 0, 0], capas: { ...s.capas, particulas: true } }`);
    await page.waitForFunction(() => (window as any).__campos.escena().rueda?.visible === true);
    const rueda = (await gancho(page, '(c) => c.escena()')).rueda;
    expect(rueda).toMatchObject({ omega: 1, eje: [0, 0, 1], rotulo: 'ω = 1.000 rad/t' });
    const antes = await gancho(page, '(c) => c.particulas()');
    const t0 = await gancho(page, '(c) => c.animacion()');
    await gancho(page, '(c) => c.avanzarAnimacion(2)');
    const despues = await gancho(page, '(c) => c.particulas()');
    const t1 = await gancho(page, '(c) => c.animacion()');
    const dRueda = t1.anguloRueda - t0.anguloRueda;
    // Ángulo de la rueda: ω·τ·2 s, con τ = Δ/F_ref.
    expect(dRueda).toBeCloseTo(t1.tau * 2, 12);
    // Partículas que no han renacido (edad + 2 s) y lejos de las caras: giran lo mismo que la rueda.
    let comparadas = 0;
    let peor = 0;
    for (let i = 0; i < antes.n; i++) {
      if (Math.abs(despues.edad[i] - antes.edad[i] - 2) > 1e-9) continue;
      const x0 = antes.pos[3 * i];
      const y0 = antes.pos[3 * i + 1];
      const x1 = despues.pos[3 * i];
      const y1 = despues.pos[3 * i + 1];
      if (Math.hypot(x0, y0) < 0.2) continue;
      let d = Math.atan2(y1, x1) - Math.atan2(y0, x0);
      d = ((d + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      peor = Math.max(peor, Math.abs(d - dRueda));
      comparadas++;
    }
    informe['V-FUN-08'] = { anguloRueda: dRueda, tau: t1.tau, particulasComparadas: comparadas, maxDiferencia: peor };
    expect(comparadas).toBeGreaterThan(100);
    expect(peor).toBeLessThanOrEqual(1e-3);
    expect((await gancho(page, '(c) => c.escena()')).rueda.angulo).toBeCloseTo(t1.anguloRueda, 12);
    sinErrores(reg);
  });
});

// ---------------------------------------------------------------- UI-08 (secciones de líneas, corte y derivadas)

test.describe('UI-08 · secciones de líneas, corte y derivadas', () => {
  test('líneas: semillas en rejilla o aleatorias, validación de 256, paso fijo y «Detalles del cálculo» con el recuento por motivo', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await estable(page);
    await page.getByRole('button', { name: 'Líneas de corriente', exact: true }).click();
    // Rejilla XY en z = 0.5 de 3 × 3: nueve semillas en ese plano.
    await page.getByRole('group', { name: 'Plano de la rejilla de semillas' }).getByRole('button', { name: 'Plano XY' }).click();
    for (const [campo, v] of [
      ['semillas-c', '0.5'],
      ['semillas-nu', '3'],
      ['semillas-nv', '3'],
    ]) {
      await page.locator(`[data-prueba="${campo}"]`).fill(v);
      await page.locator(`[data-prueba="${campo}"]`).press('Enter');
    }
    await expect.poll(async () => (await estado(page)).lineas.semillas).toMatchObject({ tipo: 'rejilla', plano: 'XY', c: 0.5, nu: 3, nv: 3 });
    await estable(page);
    const l = await gancho(page, '(c) => c.lineasDibujadas()');
    expect(l.semillas.length / 3).toBe(9);
    for (let i = 0; i < 9; i++) expect(l.semillas[3 * i + 2]).toBeCloseTo(0.5, 5);
    // Más de 256: se explica y no se aplica.
    await page.locator('[data-prueba="semillas-nu"]').fill('100');
    await page.locator('[data-prueba="semillas-nu"]').press('Enter');
    await expect(page.locator('[data-prueba="seccion-lineas"] .mensaje-campo')).toContainText('256');
    expect((await estado(page)).lineas.semillas.nu).toBe(3);
    await page.locator('[data-prueba="semillas-nu"]').press('Escape');
    // Aleatorias: 20 con semilla 7.
    await page.getByRole('group', { name: 'Estrategia de las semillas' }).getByRole('button', { name: 'Aleatoria' }).click();
    await page.locator('[data-prueba="semillas-n"]').fill('20');
    await page.locator('[data-prueba="semillas-n"]').press('Enter');
    await page.locator('[data-prueba="semillas-semilla"]').fill('7');
    await page.locator('[data-prueba="semillas-semilla"]').press('Enter');
    await expect.poll(async () => (await estado(page)).lineas.semillas).toEqual({ tipo: 'aleatoria', n: 20, semilla: 7 });
    // «Desde P» necesita un punto.
    await expect(page.getByRole('group', { name: 'Estrategia de las semillas' }).getByRole('button', { name: 'Desde P' })).toHaveAttribute('aria-disabled', 'true');
    // Paso fijo.
    await page.getByRole('group', { name: 'Paso de integración h' }).getByRole('button', { name: 'Fijo' }).click();
    await page.locator('[data-prueba="lineas-paso"]').fill('0.02');
    await page.locator('[data-prueba="lineas-paso"]').press('Enter');
    await expect.poll(async () => (await estado(page)).lineas.paso).toBe(0.02);
    await estable(page);
    // Detalles del cálculo: el recuento de cada motivo coincide con el del cálculo.
    await page.getByRole('button', { name: 'Detalles del cálculo' }).click();
    const r = await gancho(page, '(c) => c.resultados().lineas');
    expect(r.paso).toBe(0.02);
    const detalles = page.locator('[data-prueba="detalles-lineas"]');
    await expect(detalles).toContainText(`${r.nLineas} líneas desde ${r.semillas.n} semillas`);
    await expect(detalles).toContainText('Paso h = 0.02000');
    const motivos = Object.entries(r.recuentoMotivos as Record<string, number>).filter(([, n]) => n > 0);
    expect(motivos.length).toBeGreaterThan(0);
    for (const [m, n] of motivos) await expect(page.locator(`[data-prueba="motivos-parada"] [data-motivo="${m}"] dd`)).toHaveText(String(n));
    informe['UI-08 líneas'] = { lineas: r.nLineas, semillas: r.semillas, motivos: r.recuentoMotivos, paso: r.paso };
    sinErrores(reg);
  });

  test('derivadas: div F de T6 se muestra como 2x + 1; los accesos directos llevan al corte y a «Glifos: rot F»', async ({ page }) => {
    await abrir(page);
    await fijar(page, `{ ...s, nombre: 'T6', base: null, campo: { P: 'x^2', Q: 'y', R: '0' }, parametros: [] }`);
    await estable(page);
    await page.getByRole('button', { name: 'Divergencia y rotacional' }).click();
    // Texto visible de KaTeX, sin espacios (ni el de anchura cero que pone tras los subíndices).
    const texto = (sel: string) => page.locator(`${sel} .katex-html`).evaluate((e) => (e.textContent ?? '').replace(/[\s\u200b]/g, ''));
    expect(await texto('[data-prueba="div-simbolica"]')).toBe('∇⋅F=2x+1');
    for (const k of ['x', 'y', 'z']) expect(await texto(`[data-prueba="rot-simbolico-${k}"]`)).toBe(`(∇×F)${k}=0`);
    await expect(page.locator('[data-prueba="seccion-derivadas"]')).toContainText('campo irrotacional');
    // Rotacional: rot F = (0, 0, 2ω), agrupado.
    await page.locator('[data-campo="rotacional"]').click();
    await expect.poll(() => texto('[data-prueba="rot-simbolico-z"]')).toBe('(∇×F)z=2ω');
    await expect(page.locator('[data-prueba="seccion-derivadas"]')).toContainText('campo solenoidal');
    // Accesos directos.
    await page.getByRole('button', { name: 'Ver div en el corte' }).click();
    expect((await estado(page)).corte).toMatchObject({ activo: true, escalar: 'divergencia' });
    await page.getByRole('button', { name: 'Ver rot · n en el corte' }).click();
    expect((await estado(page)).corte).toMatchObject({ activo: true, escalar: 'rotacional' });
    const glifos = page.locator('[data-prueba="seccion-derivadas"]').getByRole('button', { name: 'Glifos de rot F' });
    await glifos.click();
    await expect(glifos).toHaveAttribute('aria-pressed', 'true');
    expect((await estado(page)).capas.glifos).toBe('rotacional');
  });

  test('avanzado: número de partículas, τ fija (la leyenda la muestra), semilla y cifras significativas', async ({ page }) => {
    await abrir(page);
    await estable(page);
    await page.locator('body').press('p');
    await page.getByRole('button', { name: 'Avanzado' }).click();
    await page.locator('[data-prueba="particulas-n"]').fill('100');
    await page.locator('[data-prueba="particulas-n"]').press('Enter');
    await expect.poll(async () => (await gancho(page, '(c) => c.escena()')).particulas.particulas).toBe(100);
    await page.getByRole('group', { name: 'Escala temporal τ (unidades de t por segundo)' }).getByRole('button', { name: 'Fija' }).click();
    await page.locator('[data-prueba="particulas-tau"]').fill('0.5');
    await page.locator('[data-prueba="particulas-tau"]').press('Enter');
    await expect(page.locator('[data-prueba="leyenda-tau"]')).toContainText('τ = 0.5 unidades de t');
    expect((await gancho(page, '(c) => c.animacion()')).tau).toBe(0.5);
    const antes = (await gancho(page, '(c) => c.particulas()')).pos.slice(0, 3);
    await page.locator('[data-prueba="particulas-semilla"]').fill('9');
    await page.locator('[data-prueba="particulas-semilla"]').press('Enter');
    await expect.poll(async () => (await gancho(page, '(c) => c.particulas()')).pos.slice(0, 3)).not.toEqual(antes);
    await page.locator('[data-prueba="cifras"]').fill('6');
    await page.locator('[data-prueba="cifras"]').press('Enter');
    expect((await estado(page)).cifras).toBe(6);
    expect((await estado(page)).particulas).toEqual({ n: 100, tau: 0.5, semilla: 9, nacimiento: 'dominio' });
  });
});

// ---------------------------------------------------------------- VIS-05 (leyenda completa y codificación)

test.describe('VIS-05 · leyenda completa y auditoría de la codificación', () => {
  test('VV-09: las entradas de la leyenda son exactamente las capas visibles, en el orden de DESIGN §9.12', async ({ page }) => {
    test.setTimeout(120_000);
    await abrir(page);
    await estable(page);
    const BLOQUES = ['leyenda-flechas', 'leyenda-lineas', 'leyenda-particulas', 'leyenda-corte'];
    const combinaciones: Record<string, boolean>[] = [];
    for (let m = 0; m < 16; m++) combinaciones.push({ flechas: !!(m & 1), lineas: !!(m & 2), particulas: !!(m & 4), corte: !!(m & 8) });
    const fallos: string[] = [];
    for (const c of combinaciones) {
      await fijar(
        page,
        `{ ...s, capas: { ...s.capas, flechas: ${c.flechas}, lineas: ${c.lineas}, particulas: ${c.particulas} }, corte: { ...s.corte, activo: ${c.corte}, escalar: '${c.corte ? 'divergencia' : 'ninguno'}' } }`,
      );
      await page.waitForFunction(() => {
        const k = (window as any).__campos;
        const p = k.pendiente();
        return !p.malla && !p.lineas && !p.corte;
      });
      const esperado = [c.flechas, c.lineas, c.particulas, c.corte];
      // Los bloques presentes, en el orden del documento.
      const presentes = await page.evaluate((ids) => {
        const nodos = [...document.querySelectorAll('.leyenda [data-prueba]')].map((e) => e.getAttribute('data-prueba'));
        return nodos.filter((n): n is string => !!n && ids.includes(n));
      }, BLOQUES);
      const debidos = BLOQUES.filter((_, i) => esperado[i]);
      // El helicoidal tiene div F = 0: el bloque del corte dice «= 0 en todo el corte».
      if (JSON.stringify(presentes) !== JSON.stringify(debidos)) fallos.push(`${JSON.stringify(c)} → ${presentes.join(', ')}`);
    }
    informe['VV-09 leyenda'] = { combinaciones: combinaciones.length, fallos };
    expect(fallos).toEqual([]);
  });

  test('«prohibido en la escena»: sin luces ni niebla, materiales sin iluminación y flechas opacas', async ({ page }) => {
    await abrir(page);
    await fijar(page, `{ ...s, punto: [1, 0, 0], capas: { ...s.capas, particulas: true }, corte: { ...s.corte, activo: true, escalar: 'magnitud' } }`);
    await page.waitForFunction(() => (window as any).__campos.escena().rueda?.visible === true);
    await estable(page);
    const a = await gancho(page, '(c) => c.auditarEscena()');
    informe['VIS-05 materiales'] = a;
    expect(a.luces).toBe(0);
    expect(a.niebla).toBe(false);
    expect(a.conLuz).toEqual([]);
    // Solo son transparentes los glifos en pantalla (puntos con borde suavizado) y las etiquetas.
    for (const nombre of a.transparentes) expect(['ShaderMaterial', 'SpriteMaterial', 'corte-velo']).toContain(nombre);
  });

  test('VV-05: conos de la mitad delantera de C1 (1440×900): ≥ 6 px en el 95 % de las flechas legibles por su geometría', async ({ page }) => {
    await abrir(page);
    await estable(page);
    const conos = (await gancho(page, '(c) => c.conosProyectados()')) as { largo: number; distancia: number; escorzo: number; fraccion: number }[];
    const delante = [...conos].sort((p, q) => p.distancia - q.distancia).slice(0, Math.floor(conos.length / 2));
    // Legibles por su geometría: ‖F‖ ≥ 20 % de F_ref y a más de 30° del rayo de vista. Las que
    // apuntan casi hacia la cámara se leen por la base oscura y el degradado del cono (REV-01);
    // las débiles se escalan enteras por diseño (DESIGN §9.2) y su magnitud está en la luminancia.
    const legibles = delante.filter((c) => c.fraccion >= 0.2 && c.escorzo >= 30);
    const bien = legibles.filter((c) => c.largo >= 6).length;
    const cortos = delante.filter((c) => c.largo < 6);
    informe['VV-05 C1'] = {
      mitadDelantera: delante.length,
      legibles: legibles.length,
      conoAlMenos6px: bien,
      fraccion: bien / legibles.length,
      conoMenor6px: { total: cortos.length, debiles: cortos.filter((c) => c.fraccion < 0.2).length, haciaLaCamara: cortos.filter((c) => c.fraccion >= 0.2 && c.escorzo < 30).length },
    };
    expect(legibles.length).toBeGreaterThan(200);
    expect(bien / legibles.length).toBeGreaterThanOrEqual(0.95);
  });

  test('VV-03: axe sin infracciones con las secciones nuevas abiertas y la leyenda completa', async ({ page }) => {
    await abrir(page);
    await fijar(page, `{ ...s, capas: { ...s.capas, particulas: true }, corte: { ...s.corte, activo: true, escalar: 'divergencia' }, campo: { P: 'x^2', Q: 'y', R: '0' }, parametros: [], base: null }`);
    await estable(page);
    for (const s of ['Líneas de corriente', 'Corte', 'Divergencia y rotacional', 'Avanzado']) await page.getByRole('button', { name: s, exact: true }).click();
    await page.getByRole('button', { name: 'Detalles del cálculo' }).click();
    const r = await axe(page).analyze();
    informe['VV-03 axe H5'] = { infracciones: r.violations.map((v) => v.id), reglasSuperadas: r.passes.length };
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------- REV-03 · VV-10 (movimiento reducido)

test.describe('REV-03 · movimiento reducido (VV-10)', () => {
  test('sin animaciones CSS tras interactuar, partículas en pausa al inicio y la cámara salta', async ({ browser }) => {
    const contexto = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await contexto.newPage();
    await abrir(page, 'prueba=1');
    await estable(page);
    await page.locator('body').press('p');
    expect((await gancho(page, '(c) => c.animacion()')).enMarcha).toBe(false);
    // Interacciones con transiciones: secciones, leyenda, menú y botones.
    await page.getByRole('button', { name: 'Avanzado' }).click();
    await page.getByRole('button', { name: 'Leyenda' }).click();
    await page.getByRole('button', { name: 'Restablecer', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Vista isométrica' }).hover();
    const animaciones = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    expect(animaciones).toBe(0);
    // La cámara salta a la vista pedida (sin transición).
    await page.locator('body').press('1');
    const cam = await gancho(page, '(c) => c.camara()');
    await page.waitForTimeout(150);
    // Sin transición: la cámara no se mueve (más allá del redondeo de OrbitControls, ≈ 10⁻¹⁵, D-52).
    const despues = await gancho(page, '(c) => c.camara()');
    const mov = Math.max(...[0, 1, 2].flatMap((k) => [Math.abs(despues.posicion[k] - cam.posicion[k]), Math.abs(despues.objetivo[k] - cam.objetivo[k])]));
    expect(mov).toBeLessThan(1e-9);
    informe['VV-10'] = { animacionesEnCurso: animaciones, particulasEnPausa: true, camara: 'salta' };
    await contexto.close();
  });
});
