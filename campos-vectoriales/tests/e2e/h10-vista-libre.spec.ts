import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { abrir, registrar, sinErrores } from '../util/app';

type PaginaAxe = ConstructorParameters<typeof AxeBuilder>[0]['page'];

/* eslint-disable @typescript-eslint/no-explicit-any */
const gancho = (page: Page, expr: string) => page.evaluate(`(${expr})(window.__campos)`) as Promise<any>;
const estable = (page: Page) =>
  page.waitForFunction(() => {
    const c = (window as any).__campos;
    const p = c.pendiente();
    return c.resultados().malla !== null && !p.malla && !p.lineas;
  });
const vl = (page: Page) => gancho(page, '(c) => c.vistaLibre()');
const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** Espera a que el vuelo esté quieto (la inercia de 0.12 s decae en varios fotogramas). */
const quieto = (page: Page) =>
  page.waitForFunction(() => {
    const v = (window as any).__campos.vistaLibre().vuelo;
    return !v || (v.velocidad[0] === 0 && v.velocidad[1] === 0 && v.velocidad[2] === 0);
  });
/** Mantiene una tecla pulsada `ms` milisegundos (el vuelo avanza mientras está pulsada) y espera al reposo. */
async function mantener(page: Page, tecla: string, ms: number) {
  await page.keyboard.down(tecla);
  await page.waitForTimeout(ms);
  await page.keyboard.up(tecla);
  await quieto(page);
}

test.describe('V-FUN-18 · vista libre inmersiva', () => {
  test('entra con el botón: solo la escena, a toda la ventana; vuela con el teclado; Esc restaura pose, proyección, interfaz y foco', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page, 'prueba=1');
    await estable(page);
    // Proyección ortográfica antes de entrar: al salir debe volver.
    await page.keyboard.press('5');
    const antes = await gancho(page, '(c) => c.camara()');
    const boton = page.locator('[data-prueba="boton-vista-libre"]');
    await boton.click();
    await expect.poll(async () => (await vl(page)).activa).toBe(true);
    expect((await gancho(page, '(c) => c.escena()')).proyeccion).toBe('perspectiva');
    // Ninguna región de la interfaz es visible.
    for (const sel of ['.barra', '[data-region="panel"]', '[data-prueba="leyenda"]', '.barra-escena', '.triedro', '[data-prueba="inspector"]']) {
      await expect(page.locator(sel).first()).toBeHidden();
    }
    const lienzo = await page.locator('[data-prueba="lienzo"]').boundingBox();
    const vp = page.viewportSize()!;
    expect(lienzo).toMatchObject({ x: 0, y: 0, width: vp.width, height: vp.height });
    await expect(page.locator('[data-prueba="vl-pista"]')).toHaveAttribute('data-visible', 'true');
    await expect(page.locator('[data-prueba="vl-anuncio"]')).toContainText('Vista libre');

    // W avanza según la vista; A/D se desplazan a los lados; E sube por z.
    const v0 = (await vl(page)).vuelo;
    await mantener(page, 'KeyW', 400);
    const v1 = (await vl(page)).vuelo;
    const avance = [0, 1, 2].map((k) => v1.posicion[k] - v0.posicion[k]);
    const d = [Math.cos(v0.angulos.elevacion) * Math.cos(v0.angulos.azimut), Math.cos(v0.angulos.elevacion) * Math.sin(v0.angulos.azimut), Math.sin(v0.angulos.elevacion)];
    const proy = avance[0]! * d[0]! + avance[1]! * d[1]! + avance[2]! * d[2]!;
    // El recorrido corresponde al tiempo pulsado aunque los fotogramas sean lentos (WebGL por software).
    expect(proy).toBeGreaterThan(0.2);
    expect(Math.hypot(...avance.map((a, k) => a - proy * d[k]!))).toBeLessThan(1e-6 + 1e-3 * proy);
    await mantener(page, 'KeyE', 300);
    const v2 = (await vl(page)).vuelo;
    expect(v2.posicion[2]).toBeGreaterThan(v1.posicion[2] + 0.2);
    expect(Math.hypot(v2.posicion[0] - v1.posicion[0], v2.posicion[1] - v1.posicion[1])).toBeLessThan(1e-6);
    // Flechas: mirar a la izquierda aumenta el azimut.
    await mantener(page, 'ArrowLeft', 300);
    expect((await vl(page)).vuelo.angulos.azimut).toBeGreaterThan(v2.angulos.azimut + 0.2);
    // Arrastrar a la derecha gira la vista a la derecha (azimut menor).
    const az = (await vl(page)).vuelo.angulos.azimut;
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.mouse.down();
    await page.mouse.move(vp.width / 2 + 200, vp.height / 2, { steps: 5 });
    await page.mouse.up();
    expect((await vl(page)).vuelo.angulos.azimut).toBeLessThan(az - 0.5);
    // Los atajos de capas siguen activos.
    const flechas = (await gancho(page, '(c) => c.estado()')).capas.flechas;
    await page.keyboard.press('f');
    expect((await gancho(page, '(c) => c.estado()')).capas.flechas).toBe(!flechas);
    await page.keyboard.press('f');

    await page.keyboard.press('Escape');
    await expect.poll(async () => (await vl(page)).activa).toBe(false);
    const despues = await gancho(page, '(c) => c.camara()');
    expect(dist(despues.posicion, antes.posicion)).toBeLessThan(1e-9);
    expect(dist(despues.objetivo, antes.objetivo)).toBeLessThan(1e-9);
    expect((await gancho(page, '(c) => c.escena()')).proyeccion).toBe('ortografica');
    await expect(page.locator('.barra')).toBeVisible();
    await expect(page.locator('[data-region="panel"]')).toBeVisible();
    await expect(boton).toBeFocused();
    await expect(page.locator('[data-prueba="vl-anuncio"]')).toContainText('cerrada');
    const axe = await new AxeBuilder({ page: page as unknown as PaginaAxe }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
    sinErrores(reg);
  });

  test('V y la tecla R: entrar y salir con V; R vuelve a la pose de entrada', async ({ page }) => {
    await abrir(page, 'prueba=1');
    await estable(page);
    await page.locator('[data-prueba="lienzo"]').focus();
    await page.keyboard.press('v');
    await expect.poll(async () => (await vl(page)).activa).toBe(true);
    const entrada = (await vl(page)).vuelo.posicion;
    await mantener(page, 'KeyS', 300);
    expect(dist((await vl(page)).vuelo.posicion, entrada)).toBeGreaterThan(0.01);
    await page.keyboard.press('r');
    expect(dist((await vl(page)).vuelo.posicion, entrada)).toBeLessThan(1e-12);
    // 1–4 no cambian a una vista orbital dentro del vuelo.
    await page.keyboard.press('1');
    expect((await vl(page)).activa).toBe(true);
    await page.keyboard.press('v');
    await expect.poll(async () => (await vl(page)).activa).toBe(false);
  });
});

test.describe('V-FUN-19 · dilatación λ', () => {
  test('+ y − cambian λ ×1.25 con indicador; con la caja, el explorador se acerca al centro de Ω en coordenadas del campo; la velocidad se divide por λ', async ({ page }) => {
    await abrir(page, 'prueba=1');
    await estable(page);
    await page.locator('[data-prueba="boton-vista-libre"]').click();
    await expect.poll(async () => (await vl(page)).activa).toBe(true);
    const a = (await vl(page)).vuelo;
    await page.keyboard.press('+');
    const b = (await vl(page)).vuelo;
    expect(b.lambda).toBeCloseTo(1.25, 12);
    expect((await gancho(page, '(c) => c.estado()')).exploracion.escala).toBeCloseTo(1.25, 12);
    await expect(page.locator('[data-prueba="vl-indicador"]')).toContainText('λ = 1.25');
    // Centro de Ω = origen: r → r/1.25 (la imagen del mundo dilatado alrededor del centro).
    for (let k = 0; k < 3; k++) expect(b.posicion[k]).toBeCloseTo(a.posicion[k] / 1.25, 12);
    // Velocidad en coordenadas del campo: v/λ.
    expect(b.rapidez).toBeCloseTo(a.rapidez, 12);
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    expect((await vl(page)).vuelo.lambda).toBeCloseTo(0.8, 12);
    await page.keyboard.press('Escape');
  });
});

test.describe('V-FUN-20 · espacio sin límites', () => {
  test('U: la ventana se mueve por múltiplos de Δ con la cámara; F_ref no cambia; la flecha de un nodo común es la misma; sin caja', async ({ page }) => {
    await abrir(page, 'prueba=1&campo=rotacional');
    await estable(page);
    const fRef0 = (await gancho(page, '(c) => c.calculo()')).fRef;
    await page.locator('[data-prueba="boton-vista-libre"]').click();
    await expect.poll(async () => (await vl(page)).activa).toBe(true);
    await page.keyboard.press('u');
    await expect.poll(async () => (await vl(page)).ventana).not.toBeNull();
    await expect(page.locator('[data-prueba="vl-indicador"]')).toContainText('Sin límites');
    // Volar lejos (rápido, con Mayús) hasta que la ventana cambie.
    const v0 = (await vl(page)).ventana;
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    await quieto(page);
    await expect.poll(async () => JSON.stringify((await vl(page)).ventana)).not.toBe(JSON.stringify(v0));
    await estable(page);
    const v1 = (await vl(page)).ventana;
    // Desplazamiento por múltiplos enteros de Δ = 0.5.
    for (let k = 0; k < 3; k++) {
      const m = (v1.min[k] - v0.min[k]) / 0.5;
      expect(Math.abs(m - Math.round(m))).toBeLessThan(1e-9);
    }
    const r = await gancho(page, '(c) => c.calculo()');
    expect(r.fRef).toBe(fRef0);
    expect(r.origen).toBe('fija');
    // La ventana sigue a la cámara: su centro está a menos de Δ/2 por eje.
    const cam = (await vl(page)).vuelo.posicion;
    for (let k = 0; k < 3; k++) expect(Math.abs((v1.min[k] + v1.max[k]) / 2 - cam[k])).toBeLessThanOrEqual(0.25 + 1e-9);
    // Rotacional: en un nodo, F = (−y, x, 0) exactamente.
    const nodo = [v1.min[0], v1.min[1], v1.min[2]];
    const f = await gancho(page, `(c) => c.campoEnNodo(${nodo.join(',')})`);
    expect(f.F).toEqual([-nodo[1], nodo[0], 0].map((v) => v + 0));
    // Salir de la vista libre restaura Ω.
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await vl(page)).ventana).toBeNull();
    await estable(page);
    expect((await gancho(page, '(c) => c.calculo()')).origen).toBe('auto');
  });
});

test.describe('V-FUN-21 · ampliar y estrechar Ω', () => {
  test('«Ampliar ×2» conserva Δ (N = 17) y lo anuncia; otra vez, N = 21 y Δ cambia; «Estrechar» deshace', async ({ page }) => {
    await abrir(page, 'prueba=1');
    await estable(page);
    await page.locator('[data-prueba="seccion-dominio"] .seccion-boton').click();
    await page.locator('[data-prueba="ampliar"]').click();
    await expect(page.locator('[data-prueba="alcance-resultado"]')).toContainText('N = 17');
    let e = await gancho(page, '(c) => c.estado()');
    expect(e.dominio).toEqual({ min: [-4, -4, -4], max: [4, 4, 4] });
    expect(e.muestreo.n).toEqual([17, 17, 17]);
    await estable(page);
    expect((await gancho(page, '(c) => c.resultados()')).malla.deltaRef).toBe(0.5);
    await page.locator('[data-prueba="ampliar"]').click();
    await expect(page.locator('[data-prueba="alcance-resultado"]')).toContainText('Δ cambia');
    await page.locator('[data-prueba="estrechar"]').click();
    e = await gancho(page, '(c) => c.estado()');
    expect(e.dominio).toEqual({ min: [-4, -4, -4], max: [4, 4, 4] });
    expect(e.muestreo.n).toEqual([11, 11, 11]);
  });
});
