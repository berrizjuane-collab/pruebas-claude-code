/**
 * INS-03 · Coherencia entre ecuaciones, geometría, leyenda e inspector (V-FUN-05 y V-FUN-06,
 * VALIDATION §5) para los 6 campos del catálogo y T6 = (x², y, 0).
 *
 * El oráculo es independiente de la aplicación: F, ‖F‖, div y rot se evalúan aquí a partir de
 * las fórmulas; F_ref se recalcula con la regla de SPEC §5.1 (P95 por rango más cercano y
 * redondeo legible); la rampa de gris y el formato numérico se reimplementan (DESIGN §9.3 y
 * §3.3). La geometría se lee de los búferes de instancia que se envían a la GPU (float32).
 */
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { abrir, registrar, sinErrores } from '../util/app';
import { angulo } from '../util/oraculos';

/* eslint-disable @typescript-eslint/no-explicit-any */
type V3 = [number, number, number];
const gancho = (page: Page, expr: string, arg?: unknown) =>
  page.evaluate(`(${expr})(window.__campos, ${JSON.stringify(arg ?? null)})`) as Promise<any>;
const estable = (page: Page) =>
  page.waitForFunction(() => {
    const c = (window as any).__campos;
    const p = c.pendiente();
    return c.resultados().malla !== null && !p.malla && !p.lineas && !p.corte;
  });
const fijar = (page: Page, cuerpo: string) => gancho(page, `(c) => c.fijarEstado((s) => (${cuerpo}))`);

interface Caso {
  id: string;
  nombre: string;
  ecuaciones: [string, string, string];
  F: (p: V3) => V3;
  div: (p: V3) => number;
  rot: (p: V3) => V3;
}

const CASOS: Caso[] = [
  { id: 'uniforme', nombre: 'Uniforme', ecuaciones: ['a', 'b', 'c'], F: () => [1, 0, 0], div: () => 0, rot: () => [0, 0, 0] },
  { id: 'radial-saliente', nombre: 'Radial saliente', ecuaciones: ['k*x', 'k*y', 'k*z'], F: ([x, y, z]) => [x, y, z], div: () => 3, rot: () => [0, 0, 0] },
  { id: 'radial-entrante', nombre: 'Radial entrante', ecuaciones: ['-k*x', '-k*y', '-k*z'], F: ([x, y, z]) => [-x, -y, -z], div: () => -3, rot: () => [0, 0, 0] },
  { id: 'rotacional', nombre: 'Rotacional', ecuaciones: ['-omega*y', 'omega*x', '0'], F: ([x, y]) => [-y, x, 0], div: () => 0, rot: () => [0, 0, 2] },
  { id: 'helicoidal', nombre: 'Helicoidal', ecuaciones: ['-y', 'x', 'a'], F: ([x, y]) => [-y, x, 0.25], div: () => 0, rot: () => [0, 0, 2] },
  { id: 'silla', nombre: 'Silla', ecuaciones: ['k*x', '-k*y', '0'], F: ([x, y]) => [x, -y, 0], div: () => 0, rot: () => [0, 0, 0] },
  { id: 'T6', nombre: 'T6', ecuaciones: ['x^2', 'y', '0'], F: ([x, y]) => [x * x, y, 0], div: ([x]) => 2 * x + 1, rot: () => [0, 0, 0] },
];

// ---------------------------------------------------------------- oráculos (SPEC/DESIGN)

const N = 9;
const MIN = -2;
const DELTA = 0.5;
const nodos = (): V3[] => {
  const r: V3[] = [];
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) r.push([MIN + i * DELTA, MIN + j * DELTA, MIN + k * DELTA]);
  return r;
};
const norma = (v: number[]) => Math.hypot(...v);

/** SPEC §5.1: P95 por rango más cercano, redondeado hacia arriba a {1, 1.5, 2, 2.5, 3, 4, 5, 6, 8}·10ᵏ. */
function fRefEsperada(mags: number[]): number {
  const orden = [...mags].sort((a, b) => a - b);
  const p95 = orden[Math.min(orden.length - 1, Math.ceil(0.95 * orden.length) - 1)]!;
  const decada = 10 ** Math.floor(Math.log10(p95));
  for (const paso of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (paso * decada >= p95 * (1 - 1e-12)) return Number((paso * decada).toPrecision(12));
  return 10 * decada;
}

/** DESIGN §9.3: gris sRGB de L* = 45.2 + 51.3·u. */
function grisRampa(u: number): number {
  const L = 45.2 + 51.3 * Math.min(1, Math.max(0, u));
  const Y = L > 8 ? ((L + 16) / 116) ** 3 : L / 903.3;
  return Y <= 0.0031308 ? 12.92 * Y : 1.055 * Y ** (1 / 2.4) - 0.055;
}

/** DESIGN §3.3: 4 cifras significativas, «−» tipográfico; 0 exacto se escribe «0». */
const fmt = (v: number) => (v === 0 ? '0' : (v < 0 ? '−' : '') + Math.abs(v).toPrecision(4));
const conSigno = (s: string) => (s === '0' || s.startsWith('−') ? s : `+${s}`);
/** Formato corto de la leyenda: sin ceros finales. */
const corto = (v: number) => String(Number(v.toPrecision(6)));

// ---------------------------------------------------------------- pruebas

const informe: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  const ruta = 'test-results/coherencia-informe.json';
  const previo = existsSync(ruta) ? (JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>) : {};
  writeFileSync(ruta, JSON.stringify({ ...previo, ...informe }, null, 2));
});

test.describe('INS-03 · coherencia ecuaciones–geometría–leyenda–inspector', () => {
  for (const caso of CASOS) {
    test(`${caso.nombre}: V-FUN-05 (todas las flechas, 20 en detalle) y V-FUN-06 (3 nodos)`, async ({ page }) => {
      const reg = registrar(page);
      await abrir(page);
      if (caso.id === 'T6') await fijar(page, `{ ...s, campo: { P: 'x^2', Q: 'y', R: '0' }, parametros: [], base: null }`);
      else await page.locator(`[data-campo="${caso.id}"]`).click();
      await estable(page);

      // 1. Ecuaciones: lo que se lee en el panel es lo que evalúa el oráculo.
      for (const [k, eje] of ['x', 'y', 'z'].entries()) {
        await expect(page.getByRole('textbox', { name: new RegExp(`componente ${eje} de F`) }).first()).toHaveValue(caso.ecuaciones[k]!);
      }

      // 2. Leyenda: F_ref calculada por el oráculo = la de la aplicación = la marca máxima.
      const todos = nodos();
      const mags = todos.map((p) => norma(caso.F(p)));
      const fRef = fRefEsperada(mags);
      const calc = await gancho(page, '(c) => c.calculo()');
      expect(calc.fRef).toBe(fRef);
      expect(calc.lMax).toBeCloseTo(0.9 * DELTA, 12);
      const marcas = await page.locator('[data-prueba="leyenda-marcas"] span').allTextContents();
      expect(marcas).toEqual(['0', corto(fRef / 2), `≥ ${corto(fRef)}`]);

      // 3. Geometría en la GPU: una flecha por nodo con ‖F‖ ≥ 2 % F_ref, centrada en él.
      const conFlecha = todos.filter((_, i) => mags[i]! >= 0.02 * fRef);
      const dibujadas = (await page.evaluate(() => {
        const c = (window as any).__campos;
        const n = c.escena().flechas as number;
        return Array.from({ length: n }, (_, k) => c.flechaDibujada(k));
      })) as { centro: V3; dir: V3; largo: number; puntas: number; gris: number; desfaseCono: number; alineacion: number }[];
      expect(dibujadas.length).toBe(conFlecha.length);
      const vistos = new Set<string>();
      const peor = { centro: 0, angulo: 0, largoRel: 0, gris: 0, desfaseCono: 0, alineacion: 0 };
      const detalle: unknown[] = [];
      const muestra = new Set(Array.from({ length: 20 }, (_, j) => Math.round((j * (dibujadas.length - 1)) / 19)));
      for (const [k, f] of dibujadas.entries()) {
        const nodo = f.centro.map((c) => MIN + Math.round((c - MIN) / DELTA) * DELTA) as V3;
        vistos.add(nodo.join(','));
        const F = caso.F(nodo);
        const m = norma(F);
        const largo = calc.lMax * Math.min(m / fRef, 1);
        const errores = {
          centro: norma(f.centro.map((c, i) => c - nodo[i]!)),
          angulo: angulo(f.dir, F),
          largoRel: Math.abs(f.largo - largo) / largo,
          gris: Math.abs(f.gris - grisRampa(m / fRef)),
          desfaseCono: Math.abs(f.desfaseCono),
          alineacion: 1 - f.alineacion,
        };
        for (const c of Object.keys(peor) as (keyof typeof peor)[]) peor[c] = Math.max(peor[c], errores[c]);
        expect(f.puntas, `puntas en ${nodo}`).toBe(m >= fRef ? 2 : 1);
        if (muestra.has(k)) detalle.push({ nodo, F, mag: m, largo: f.largo, gris255: Math.round(f.gris * 255), puntas: f.puntas, ...errores });
      }
      expect(vistos.size, 'cada flecha en un nodo distinto').toBe(conFlecha.length);
      // T-17: 10⁻⁶ rad · 10⁻⁶ relativo · ±1/255.
      expect(peor.centro).toBeLessThan(1e-6);
      expect(peor.angulo).toBeLessThan(1e-6);
      expect(peor.largoRel).toBeLessThan(1e-6);
      expect(peor.gris).toBeLessThanOrEqual(1 / 255);
      expect(peor.desfaseCono).toBeLessThan(1e-6);
      expect(peor.alineacion).toBeLessThan(1e-6);

      // 4. Inspector en tres nodos con flecha (V-FUN-06): valores de tabla formateados y el
      //    glifo exacto en P idéntico a la flecha de la rejilla.
      const inspector: unknown[] = [];
      for (const j of [0, Math.floor(dibujadas.length / 2), dibujadas.length - 1]) {
        const f = dibujadas[j]!;
        const P = f.centro.map((c) => MIN + Math.round((c - MIN) / DELTA) * DELTA) as V3;
        await fijar(page, `{ ...s, punto: ${JSON.stringify(P)} }`);
        await expect.poll(async () => (await gancho(page, '(c) => c.escena()')).seleccion).toMatchObject({ punto: P, flecha: true });
        const F = caso.F(P);
        const m = norma(F);
        const [div, rot] = [caso.div(P), caso.rot(P)];
        const fila = (clave: string) => page.locator(`[data-prueba="inspector-${clave}"]`);
        await expect(fila('F').locator('.inspector-componente')).toHaveText(F.map(fmt));
        await expect(fila('magF').locator('dd')).toHaveText(fmt(m));
        await expect(fila('Funit').locator('.inspector-componente')).toHaveText(F.map((c) => fmt(c / m)));
        await expect(fila('div').locator('dd')).toContainText(conSigno(fmt(div)));
        await expect(fila('div').locator('dd')).toContainText(div === 0 ? 'lo que entra sale' : div > 0 ? 'fuente local' : 'sumidero local');
        await expect(fila('rot').locator('.inspector-componente')).toHaveText(rot.map(fmt));
        await expect(page.locator('[data-prueba="inspector-metodo"]')).toHaveText('Derivadas analíticas');
        const exacta = await gancho(page, '(c) => c.flechaDibujada(0, true)');
        expect(norma(exacta.centro.map((c: number, i: number) => c - f.centro[i]!))).toBeLessThan(1e-6);
        expect(angulo(exacta.dir, f.dir)).toBeLessThan(1e-6);
        expect(Math.abs(exacta.largo - f.largo) / f.largo).toBeLessThan(1e-6);
        expect(exacta.gris).toBe(f.gris);
        expect(exacta.puntas).toBe(f.puntas);
        inspector.push({ P, F: F.map(fmt), magF: fmt(m), div: conSigno(fmt(div)), rot: rot.map(fmt) });
      }

      informe[caso.nombre] = { fRef, lMax: calc.lMax, marcas, flechas: dibujadas.length, peor, detalle, inspector };
      sinErrores(reg);
    });
  }
});
