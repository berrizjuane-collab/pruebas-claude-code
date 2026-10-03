import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { abrir, interceptarSelectores, registrar, sinErrores } from '../util/app';
import { auditarMaquetacion } from '../../scripts/lib/maquetacion.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const gancho = (page: Page, expr: string, arg?: unknown) =>
  page.evaluate(`(${expr})(window.__campos, ${JSON.stringify(arg ?? null)})`) as Promise<any>;
const estado = (page: Page) => gancho(page, '(c) => c.estado()');
const camara = (page: Page) => gancho(page, '(c) => c.camara()');
const estable = (page: Page) =>
  page.waitForFunction(() => {
    const c = (window as any).__campos;
    const p = c.pendiente();
    return c.resultados().malla !== null && !p.malla && !p.lineas && !p.corte;
  });
const ayuda = (page: Page) => page.locator('[data-prueba="ayuda"]');
const activo = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return { etiqueta: el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? '', apartado: el?.getAttribute('data-apartado') ?? null, ayuda: el?.getAttribute('data-ayuda') ?? null, rol: el?.getAttribute('role') ?? el?.tagName.toLowerCase() };
});

/** Pulsa Tab hasta que el elemento enfocado cumpla `cond` (código JS sobre `el`); devuelve cuántas pulsaciones. */
async function tabHasta(page: Page, cond: string, max = 400): Promise<number> {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(`(() => { const el = document.activeElement; return !!el && (${cond}); })()`)) return i;
    await page.keyboard.press('Tab');
  }
  throw new Error(`No se alcanza con el teclado: ${cond}`);
}

const esferica = (c: { posicion: number[]; objetivo: number[] }) => {
  const [dx, dy, dz] = [0, 1, 2].map((k) => c.posicion[k]! - c.objetivo[k]!) as [number, number, number];
  const r = Math.hypot(dx, dy, dz);
  return { r, polar: (Math.acos(dz / r) * 180) / Math.PI, azimut: (Math.atan2(dy, dx) * 180) / Math.PI };
};

const informe: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  const ruta = 'test-results/h8-informe.json';
  const previo = existsSync(ruta) ? (JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>) : {};
  writeFileSync(ruta, JSON.stringify({ ...previo, ...informe }, null, 2));
});

// ---------------------------------------------------------------- UI-06

test.describe('UI-06 · cajón de ayuda', () => {
  test('cada «?» abre su apartado (pestaña y título enfocado); Esc lo cierra y el foco vuelve al «?»', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await estable(page);
    const botones = await page.locator('[data-ayuda]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ayuda')!));
    expect(botones.length).toBeGreaterThanOrEqual(8);
    const visitados: Record<string, string> = {};
    for (const apartado of botones) {
      const boton = page.locator(`[data-ayuda="${apartado}"]`);
      await boton.focus();
      await page.keyboard.press('Enter');
      await expect(ayuda(page)).toBeVisible();
      await expect.poll(async () => (await activo(page)).apartado).toBe(apartado);
      const pestana = await ayuda(page).getByRole('tab', { selected: true }).textContent();
      visitados[apartado] = `${pestana} › ${(await activo(page)).etiqueta}`;
      // El apartado está a la vista dentro del cajón.
      const caja = (await page.locator(`[data-apartado="${apartado}"]`).boundingBox())!;
      const cuerpo = (await ayuda(page).locator('.ayuda-cuerpo').boundingBox())!;
      expect(caja.y).toBeGreaterThanOrEqual(cuerpo.y - 1);
      expect(caja.y).toBeLessThan(cuerpo.y + cuerpo.height);
      await page.keyboard.press('Escape');
      await expect(ayuda(page)).toHaveCount(0);
      await expect(boton).toBeFocused();
    }
    informe['UI-06 «?»'] = visitados;
    sinErrores(reg);
  });

  test('? y F1 la abren en Conceptos; ← → recorren las pestañas; Sintaxis lista las 23 funciones de la lista blanca', async ({ page }) => {
    await abrir(page);
    await estable(page);
    await page.locator('body').press('F1');
    await expect(ayuda(page)).toBeVisible();
    const pestanaActiva = ayuda(page).getByRole('tab', { selected: true });
    await expect(pestanaActiva).toHaveText('Conceptos');
    await expect(pestanaActiva).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(ayuda(page).getByRole('tab', { selected: true })).toHaveText('Sintaxis');
    await expect(ayuda(page).getByRole('tab', { name: 'Sintaxis' })).toBeFocused();
    const filas = ayuda(page).locator('[data-prueba="tabla-sintaxis-funciones"] tbody tr');
    await expect(filas).toHaveCount(23);
    await expect(filas.first()).toContainText('sin');
    await expect(ayuda(page).locator('[data-prueba="tabla-sintaxis-funciones"]')).toContainText('ln (también log)');
    await page.keyboard.press('End');
    await expect(ayuda(page).getByRole('tab', { selected: true })).toHaveText('Supuestos');
    await page.keyboard.press('ArrowRight');
    await expect(ayuda(page).getByRole('tab', { selected: true })).toHaveText('Conceptos');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(ayuda(page).getByRole('tab', { selected: true })).toHaveText('Atajos');
    await expect(ayuda(page).locator('[data-prueba="tabla-atajos"]')).toContainText('Perspectiva / ortográfica');
    await page.keyboard.press('Escape');
    await expect(ayuda(page)).toHaveCount(0);
    await page.locator('body').press('?');
    await expect(ayuda(page)).toBeVisible();
    // No es modal: la escena sigue debajo y no cambia de tamaño, y lo que flota a la derecha se aparta.
    expect((await gancho(page, '(c) => c.escena()')).tamano[0]).toBeGreaterThan(400);
    const cajon = (await ayuda(page).boundingBox())!;
    for (const sel of ['.barra-escena', '[data-prueba="boton-proyeccion"]']) {
      const b = (await page.locator(sel).boundingBox())!;
      expect(b.x + b.width, sel).toBeLessThanOrEqual(cajon.x);
    }
  });

  test('Esc cierra lo último abierto: menú → cajón → inspector', async ({ page }) => {
    await abrir(page);
    await estable(page);
    await page.locator('body').press('i');
    await expect(page.locator('[data-prueba="inspector"]')).toBeVisible();
    const botonAyuda = page.locator('[data-prueba="boton-ayuda"]');
    await botonAyuda.focus();
    await page.keyboard.press('Enter');
    await expect(ayuda(page)).toBeVisible();
    // Con inspector y ayuda abiertos a la vez, nada flotante se solapa (VV-08).
    expect((await page.evaluate(auditarMaquetacion)).incidencias).toEqual([]);
    // Un menú abierto se cierra primero, sin tocar el cajón ni el inspector.
    const exportar = page.getByRole('button', { name: 'Exportar', exact: true });
    await exportar.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(exportar).toBeFocused();
    await expect(ayuda(page)).toBeVisible();
    // Luego el cajón (el foco vuelve al botón «Ayuda», que lo abrió) …
    await page.keyboard.press('Escape');
    await expect(ayuda(page)).toHaveCount(0);
    await expect(page.locator('[data-prueba="inspector"]')).toBeVisible();
    await expect(botonAyuda).toBeFocused();
    // … y por último el inspector.
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-prueba="inspector"]')).toHaveCount(0);
    expect((await estado(page)).punto).toBeNull();
  });
});

// ---------------------------------------------------------------- A11Y-01

test.describe('A11Y-01 · teclado, foco y atajos', () => {
  test('5 conmuta perspectiva / ortográfica: el centro y la escala en el objetivo no cambian; el botón lo anuncia con aria-pressed', async ({ page }) => {
    await abrir(page);
    await estable(page);
    const c = await camara(page);
    const centro = await gancho(page, '(c, p) => c.proyectar(p[0], p[1], p[2])', c.objetivo);
    const esquina = await gancho(page, '(c) => c.proyectar(2, 2, 2)');
    const boton = page.locator('[data-prueba="boton-proyeccion"]');
    await expect(boton).toHaveAttribute('aria-pressed', 'false');
    await page.locator('body').press('5');
    expect((await gancho(page, '(c) => c.escena()')).proyeccion).toBe('ortografica');
    await expect(boton).toHaveAttribute('aria-pressed', 'true');
    const centroOrto = await gancho(page, '(c, p) => c.proyectar(p[0], p[1], p[2])', c.objetivo);
    const esquinaOrto = await gancho(page, '(c) => c.proyectar(2, 2, 2)');
    expect(Math.hypot(centroOrto[0] - centro[0], centroOrto[1] - centro[1])).toBeLessThan(1e-6);
    // Sin perspectiva, la esquina más cercana a la cámara deja de agrandarse: se proyecta en otro sitio.
    expect(Math.hypot(esquinaOrto[0] - esquina[0], esquinaOrto[1] - esquina[1])).toBeGreaterThan(5);
    // La selección por clic y el centro siguen funcionando en ortográfica.
    const flecha = await gancho(page, '(c) => c.flecha(364)');
    const px = await gancho(page, '(c, p) => c.proyectar(p[0], p[1], p[2])', flecha.pos);
    expect(await gancho(page, '(c, p) => c.elegir(p[0], p[1])', px)).not.toBeNull();
    await boton.click();
    expect((await gancho(page, '(c) => c.escena()')).proyeccion).toBe('perspectiva');
    informe['A11Y-01 proyección'] = { centro, centroOrto, esquina, esquinaOrto };
  });

  test('escena enfocada: ← → ↑ ↓ orbitan 5°, Mayús + flechas desplaza, + − acercan, Intro inspecciona el nodo central', async ({ page }) => {
    await abrir(page);
    await estable(page);
    const lienzo = page.locator('[data-prueba="lienzo"]');
    await lienzo.focus();
    const e0 = esferica(await camara(page));
    await lienzo.press('ArrowRight');
    const e1 = esferica(await camara(page));
    expect(e1.azimut - e0.azimut).toBeCloseTo(5, 6);
    await lienzo.press('ArrowUp');
    const e2 = esferica(await camara(page));
    expect(e2.polar - e1.polar).toBeCloseTo(-5, 6);
    const o0 = (await camara(page)).objetivo;
    await lienzo.press('Shift+ArrowRight');
    const o1 = (await camara(page)).objetivo;
    expect(Math.hypot(o1[0] - o0[0], o1[1] - o0[1], o1[2] - o0[2])).toBeGreaterThan(0.05);
    expect(esferica(await camara(page)).r).toBeCloseTo(e2.r, 9);
    await lienzo.press('+');
    expect(esferica(await camara(page)).r / e2.r).toBeCloseTo(0.9, 9);
    await lienzo.press('-');
    expect(esferica(await camara(page)).r / e2.r).toBeCloseTo(1, 9);
    await lienzo.press('Enter');
    await expect.poll(async () => (await estado(page)).punto).not.toBeNull();
    const P = (await estado(page)).punto;
    const [x, y] = await gancho(page, '(c, p) => c.proyectar(p[0], p[1], p[2])', P);
    const t = (await gancho(page, '(c) => c.escena()')).tamano;
    informe['A11Y-01 Intro'] = { P, distanciaAlCentro: Math.hypot(x - t[0] / 2, y - t[1] / 2) };
    // Con nodos cada Δ = 0.5, alguno cae a menos de una celda proyectada del centro.
    expect(Math.hypot(x - t[0] / 2, y - t[1] / 2)).toBeLessThan(60);
  });

  test('WCAG 2.1.4: los atajos de una tecla se desactivan en «Avanzado» (F1 sigue funcionando) y la preferencia se recuerda', async ({ page }) => {
    await abrir(page, 'prueba=1');
    await estable(page);
    await page.getByRole('button', { name: 'Avanzado' }).click();
    const interruptor = page.getByRole('switch', { name: /Atajos de una sola tecla/ });
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    await interruptor.click();
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    await page.locator('body').press('f');
    expect((await estado(page)).capas.flechas).toBe(true);
    await page.locator('body').press('?');
    await expect(ayuda(page)).toHaveCount(0);
    await page.locator('body').press('F1');
    await expect(ayuda(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForFunction(() => (window as any).__campos?.listo === true);
    await page.locator('body').press('f');
    expect((await estado(page)).capas.flechas).toBe(true);
    await page.getByRole('button', { name: 'Avanzado' }).click();
    await page.getByRole('switch', { name: /Atajos de una sola tecla/ }).click();
    await page.locator('body').press('f');
    expect((await estado(page)).capas.flechas).toBe(false);
  });

  test('V-A11Y-02 · guion de teclado: cada requisito se completa sin ratón', async ({ page }) => {
    test.setTimeout(180_000);
    const reg = registrar(page);
    const siguienteSelector = await interceptarSelectores(page);
    await abrir(page);
    await estable(page);
    const pasos: { paso: string; tabs: number; ok: boolean }[] = [];
    const hecho = (paso: string, tabs: number) => pasos.push({ paso, tabs, ok: true });
    // 0. Primer elemento enfocable: «Saltar a la escena».
    await page.keyboard.press('Tab');
    expect((await activo(page)).etiqueta).toBe('Saltar a la escena');
    hecho('Saltar a la escena', 1);
    // 1. Elegir campo (RF-01).
    // Las tarjetas son un grupo de opciones (tabulador a la elegida; las flechas eligen otra).
    let n = await tabHasta(page, `el.getAttribute('data-campo') !== null`);
    expect((await page.evaluate(() => document.activeElement?.getAttribute('data-campo')))).toBe('helicoidal');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await estado(page)).base).toBe('rotacional');
    hecho('Elegir el campo rotacional', n);
    // 2. Editar una ecuación (RF-02).
    n = await tabHasta(page, `el.getAttribute('data-prueba') === 'expr-R'`);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('0.5*z');
    await expect.poll(async () => (await estado(page)).campo.R).toBe('0.5*z');
    hecho('Editar R = 0.5*z', n);
    // 3. Cambiar un parámetro con el deslizador (RF-03).
    n = await tabHasta(page, `el.getAttribute('role') === 'slider'`);
    const antes = (await estado(page)).parametros[0].valor;
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await estado(page)).parametros[0].valor).not.toBe(antes);
    hecho('Mover ω con el deslizador', n);
    // 4. Activar una capa (RF-05/RF-12).
    n = await tabHasta(page, `el.getAttribute('role') === 'switch' && el.textContent?.includes('Partículas')`);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await estado(page)).capas.particulas).toBe(true);
    hecho('Activar las partículas', n);
    // 5. Corte (RF-10).
    n = await tabHasta(page, `el.getAttribute('aria-label') === 'Mostrar el plano de corte'`);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await estado(page)).corte.activo).toBe(true);
    hecho('Activar el corte', n);
    // 6. Inspeccionar por coordenadas (RF-08).
    await page.keyboard.press('i');
    await expect(page.locator('[data-prueba="inspector-x"]')).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await estado(page)).punto?.[0]).toBe(1);
    hecho('Inspeccionar P = (1, 0, 0) por coordenadas', 0);
    // 7. Restablecer el experimento con el menú (F8).
    n = await tabHasta(page, `el.textContent?.trim() === 'Restablecer' && el.getAttribute('aria-haspopup') !== null`);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    for (let k = 0; k < 4 && (await activo(page)).etiqueta !== 'Experimento'; k++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await estado(page)).campo.R).toBe('0');
    hecho('Restablecer el experimento', n);
    // 8. Exportar la configuración (RF-15).
    n = await tabHasta(page, `el.textContent?.trim() === 'Exportar' && el.getAttribute('aria-haspopup') !== null`);
    await page.keyboard.press('Enter');
    for (let k = 0; k < 4 && !(await activo(page)).etiqueta.startsWith('Configuración'); k++) await page.keyboard.press('ArrowDown');
    const descarga = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    expect((await descarga).suggestedFilename()).toMatch(/\.json$/);
    hecho('Exportar la configuración', n);
    // 9. Abrir una configuración (RF-15).
    n = await tabHasta(page, `el.textContent?.trim() === 'Abrir'`);
    const selector = siguienteSelector();
    await page.keyboard.press('Enter');
    await (await selector).setFiles('tests/fixtures/configuracion/spec-ejemplo.json');
    await expect.poll(async () => (await estado(page)).base).toBe('helicoidal');
    hecho('Abrir una configuración', n);
    // 10. Ayuda (RF-17).
    await page.keyboard.press('F1');
    await expect(ayuda(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(ayuda(page)).toHaveCount(0);
    hecho('Abrir y cerrar la ayuda', 0);
    // 11. Cámara (RF-13): vistas, proyección y órbita con la escena enfocada.
    await page.keyboard.press('1');
    await page.keyboard.press('5');
    expect((await gancho(page, '(c) => c.escena()')).proyeccion).toBe('ortografica');
    n = await tabHasta(page, `el.getAttribute('data-prueba') === 'lienzo'`);
    const e0 = esferica(await camara(page));
    await page.keyboard.press('ArrowLeft');
    expect(esferica(await camara(page)).azimut).not.toBeCloseTo(e0.azimut, 3);
    hecho('Vista XY, ortográfica y órbita', n);
    // 12. Exportar imagen PNG (RF-14).
    n = await tabHasta(page, `el.textContent?.trim() === 'Exportar' && el.getAttribute('aria-haspopup') !== null`);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Imagen PNG…' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Exportar imagen PNG' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Exportar', exact: true })).toBeFocused();
    const png = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    expect((await png).suggestedFilename()).toMatch(/\.png$/);
    hecho('Exportar la imagen PNG', n);
    informe['V-A11Y-02 guion'] = { pasos, completados: `${pasos.length}/${pasos.length}` };
    sinErrores(reg);
  });

  test('V-A11Y-03 · foco visible en cada elemento enfocable: contorno ≥ 2 px, contraste ≥ 3:1 y nunca tapado', async ({ page }) => {
    test.setTimeout(180_000);
    await abrir(page);
    await estable(page);
    // Con el inspector abierto, que flota sobre la escena.
    await page.evaluate(() => (window as any).__campos.fijarEstado((s: any) => ({ ...s, punto: [1, 0, 0] })));
    await expect(page.locator('[data-prueba="inspector"]')).toBeVisible();
    // Todas las secciones del panel desplegadas: se revisa cada control, no solo las cabeceras.
    const plegadas = page.locator('.seccion-boton[aria-expanded="false"]');
    for (let k = 0; k < 20 && (await plegadas.count()) > 0; k++) await plegadas.first().click();
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    const revisados: { elemento: string; ancho: number; contraste: number; tapado: boolean }[] = [];
    const vistos = new Set<string>();
    for (let k = 0; k < 400; k++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const id = el.id || el.getAttribute('aria-label') || el.getAttribute('data-prueba') || el.textContent?.trim().slice(0, 40) || el.tagName;
        const ruta = `${el.tagName}:${id}:${Math.round(el.getBoundingClientRect().x)}:${Math.round(el.getBoundingClientRect().y)}`;
        const cs = getComputedStyle(el);
        const lum = (c: string) => {
          const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(m[0]!) + 0.7152 * f(m[1]!) + 0.0722 * f(m[2]!);
        };
        const opaco = (b: string) => !!b && !b.startsWith('rgba(0, 0, 0, 0)') && b !== 'transparent';
        // El anillo puede estar en el elemento o, con :focus-within, en un contenedor cercano (campo de expresión).
        let portador: HTMLElement = el;
        let ancho = 0;
        let colorAnillo = cs.outlineColor;
        let interior = false;
        for (let p: HTMLElement | null = el, k = 0; p && k < 3; p = p.parentElement, k++) {
          const ps = getComputedStyle(p);
          if (ps.outlineStyle !== 'none' && parseFloat(ps.outlineWidth) >= 2) {
            portador = p;
            ancho = parseFloat(ps.outlineWidth);
            colorAnillo = ps.outlineColor;
            interior = parseFloat(ps.outlineOffset) < 0;
            break;
          }
          const m = ps.boxShadow.match(/(rgba?\([^)]+\))\s+0px\s+0px\s+0px\s+([\d.]+)px/);
          if (m && parseFloat(m[2]!) >= 2) {
            portador = p;
            ancho = parseFloat(m[2]!);
            colorAnillo = m[1]!;
            interior = ps.boxShadow.includes('inset');
            break;
          }
        }
        // Contraste del anillo con lo que tiene al lado: el fondo del propio elemento si es interior, el de fuera si no.
        let fondo = 'rgb(16, 16, 16)';
        for (let p: HTMLElement | null = interior ? portador : portador.parentElement; p; p = p.parentElement) {
          const b = getComputedStyle(p).backgroundColor;
          if (opaco(b)) {
            fondo = b;
            break;
          }
        }
        const [a, b] = [lum(colorAnillo), lum(fondo)].sort((x, y) => y - x) as [number, number];
        const contraste = (a + 0.05) / (b + 0.05);
        const rect = el.getBoundingClientRect();
        const cx = Math.min(window.innerWidth - 1, Math.max(0, rect.x + rect.width / 2));
        const cy = Math.min(window.innerHeight - 1, Math.max(0, rect.y + rect.height / 2));
        const encima = document.elementFromPoint(cx, cy);
        const tapado = !!encima && !(el === encima || el.contains(encima) || encima.contains(el) || (el.tagName === 'INPUT' && encima.closest('label')?.contains(el)));
        return { ruta, elemento: `${el.tagName.toLowerCase()} «${id}»`, ancho, contraste: Number(contraste.toFixed(2)), tapado, enDialogo: !!el.closest('dialog') };
      });
      if (!r) continue;
      if (vistos.has(r.ruta)) break;
      vistos.add(r.ruta);
      revisados.push(r);
    }
    const fallos = revisados.filter((r) => r.ancho < 2 || r.contraste < 3 || r.tapado);
    informe['V-A11Y-03 foco'] = { revisados: revisados.length, fallos };
    expect(revisados.length).toBeGreaterThan(80);
    expect(fallos).toEqual([]);
  });
});
