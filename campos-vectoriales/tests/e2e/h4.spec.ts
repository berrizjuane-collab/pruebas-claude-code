import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { abrir, registrar, sinErrores, urlApp } from '../util/app';
import { experimentoDesdeCatalogo } from '../../src/state/schema';

/* eslint-disable @typescript-eslint/no-explicit-any */
// @axe-core/playwright tipa la página con una versión más nueva de playwright-core (D-06 fija 1.56.1).
type PaginaAxe = ConstructorParameters<typeof AxeBuilder>[0]['page'];
const axe = (page: Page) => new AxeBuilder({ page: page as unknown as PaginaAxe });
const gancho = (page: Page, expr: string, arg?: unknown) =>
  page.evaluate(`(${expr})(window.__campos, ${JSON.stringify(arg ?? null)})`) as Promise<any>;
const estado = (page: Page) => gancho(page, '(c) => c.estado()');
const estable = (page: Page) =>
  page.waitForFunction(() => {
    const c = (window as any).__campos;
    const p = c.pendiente();
    return c.resultados().malla !== null && !p.malla && !p.lineas;
  });

/** Registro de evidencias de H4. */
const informe: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/h4-informe.json', JSON.stringify(informe, null, 2));
});

const expresion = (page: Page, c: 'P' | 'Q' | 'R') => page.locator(`[data-prueba="expr-${c}"]`);

// ---------------------------------------------------------------- VIS-02

test.describe('VIS-02 · biblioteca de controles y galería', () => {
  test('axe-core no encuentra infracciones en la galería', async ({ page }) => {
    const reg = registrar(page);
    await page.goto(urlApp('muestras'));
    await expect(page.locator('[data-prueba="galeria"]')).toBeVisible();
    const r = await axe(page).analyze();
    informe['VIS-02 axe'] = { infracciones: r.violations.map((v) => ({ id: v.id, nodos: v.nodes.map((n) => n.target) })), reglasSuperadas: r.passes.length, incompletas: r.incomplete.map((v) => v.id) };
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([]);
    // Lo único que axe no puede decidir es `aria-controls` hacia una lista oculta (patrón ARIA válido).
    const dudosas = r.incomplete.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.any[0]?.message ?? n.all[0]?.message ?? ''}`));
    expect(dudosas.filter((d) => !/aria-controls referenced ID exists on the page while using aria-haspopup/.test(d))).toEqual([]);
    sinErrores(reg);
  });

  test('axe-core no encuentra infracciones en la aplicación con el panel completo', async ({ page }) => {
    await abrir(page);
    await page.getByRole('button', { name: 'Dominio y muestreo' }).click();
    await page.getByRole('button', { name: 'Opciones de a' }).click();
    const r = await axe(page).analyze();
    informe['VIS-02 axe aplicación'] = { infracciones: r.violations.map((v) => v.id), reglasSuperadas: r.passes.length };
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([]);
  });

  test('cada estado tiene una señal no tonal: foco de 2 px ≥ 3:1 y deshabilitados con motivo (VV-07)', async ({ page }) => {
    await page.goto(urlApp('muestras'));
    const r = await page.evaluate(() => {
      const lum = (rgb: string) => {
        const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).map(Number).map((c) => {
          const s = (c as number) / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
      };
      const contraste = (a: string, b: string) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return ((x as number) + 0.05) / ((y as number) + 0.05);
      };
      const focos = [...document.querySelectorAll('[data-forzar~="foco"]')].map((el) => {
        const cs = getComputedStyle(el);
        // El contorno se dibuja hacia fuera (o hacia dentro si el desplazamiento es negativo).
        const fondo = Number.parseFloat(cs.outlineOffset) < 0 ? cs.backgroundColor : getComputedStyle(el.closest('.galeria-grupo')!).backgroundColor;
        return { clase: el.className, ancho: Number.parseFloat(cs.outlineWidth), estilo: cs.outlineStyle, contraste: contraste(cs.outlineColor, fondo) };
      });
      const deshabilitados = [...document.querySelectorAll('[aria-disabled="true"]')]
        .filter((el) => el.getAttribute('role') !== 'group')
        .map((el) => {
          const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
          const motivo = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
          return { control: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName, motivo, cursor: getComputedStyle(el).cursor };
        });
      return { focos, deshabilitados };
    });
    informe['VIS-02 señales'] = r;
    expect(r.focos.length).toBeGreaterThanOrEqual(10);
    for (const f of r.focos) {
      expect(f.ancho, f.clase).toBeGreaterThanOrEqual(2);
      expect(f.estilo, f.clase).toBe('solid');
      expect(f.contraste, f.clase).toBeGreaterThanOrEqual(3);
    }
    expect(r.deshabilitados.length).toBeGreaterThanOrEqual(8);
    for (const d of r.deshabilitados) {
      expect(d.motivo, d.control).not.toBe('');
      expect(d.cursor, d.control).toBe('not-allowed');
    }
  });

  test('todos los controles se manejan solo con el teclado', async ({ page }) => {
    await page.goto(urlApp('muestras'));
    // Interruptor (Espacio e Intro)
    const sw = page.getByRole('switch', { name: 'Flechas' });
    await sw.focus();
    await page.keyboard.press('Space');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Enter');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    // Segmentado
    const xz = page.getByRole('group', { name: 'Plano del corte' }).getByRole('button', { name: 'Plano XZ' });
    await xz.focus();
    await page.keyboard.press('Enter');
    await expect(xz).toHaveAttribute('aria-pressed', 'true');
    // Deslizador: ← → RePág AvPág Inicio Fin
    const sl = page.getByRole('slider', { name: 'a', exact: true });
    await sl.focus();
    await page.keyboard.press('ArrowRight');
    await expect(sl).toHaveAttribute('aria-valuenow', '0.3');
    await page.keyboard.press('PageDown');
    await expect(sl).toHaveAttribute('aria-valuenow', '-0.2');
    await page.keyboard.press('End');
    await expect(sl).toHaveAttribute('aria-valuenow', '1');
    await page.keyboard.press('Home');
    await expect(sl).toHaveAttribute('aria-valuenow', '-1');
    // Número: ↑ y una expresión constante
    const num = page.getByRole('spinbutton', { name: 'Valor de a' });
    await num.focus();
    await page.keyboard.press('ArrowUp');
    await expect(num).toHaveAttribute('aria-valuenow', '-0.95');
    await num.fill('pi/4');
    await page.keyboard.press('Enter');
    await expect(num).toHaveAttribute('aria-valuenow', String(Math.PI / 4));
    await num.fill('3');
    await page.keyboard.press('Enter');
    await expect(num).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Escape');
    await expect(num).not.toHaveAttribute('aria-invalid', 'true');
    // Lista desplegable
    const cb = page.getByRole('combobox', { name: 'Escalar del corte' });
    await cb.focus();
    await page.keyboard.press('ArrowDown');
    await expect(cb).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(cb).toHaveAttribute('aria-expanded', 'false');
    await expect(cb).toContainText('div F');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Escape');
    await expect(cb).toContainText('div F');
    // Menú: Intro abre y enfoca la primera opción; ↓; Esc cierra y devuelve el foco
    const mb = page.locator('button[aria-haspopup="menu"]').first();
    await mb.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: /Cámara/ }).first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Parámetros' }).first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(mb).toBeFocused();
    await expect(mb).toHaveAttribute('aria-expanded', 'false');
    // Sección desplegable
    const sec = page.getByRole('button', { name: 'Dominio y muestreo' });
    await sec.focus();
    await page.keyboard.press('Enter');
    await expect(sec).toHaveAttribute('aria-expanded', 'true');
    // Expresión
    const p = page.getByRole('textbox', { name: /componente x de F/ }).first();
    await p.focus();
    await page.keyboard.press('End');
    await page.keyboard.type('+1');
    await expect(p).toHaveValue('-omega*y+1');
    // Descripción emergente con el foco del teclado; Esc la cierra (WCAG 1.4.13)
    await page.keyboard.press('Tab');
    const copiar = page.getByRole('button', { name: 'Copiar valores' }).first();
    await copiar.focus();
    const desc = page.getByRole('tooltip', { name: 'Copiar valores' });
    await expect(desc).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(desc).toBeHidden();
  });
});

// ---------------------------------------------------------------- UI-07

test.describe('UI-07 · mensajes y estados de pantalla', () => {
  test('un error en línea lleva icono, «Error:» y texto, con role="alert"', async ({ page }) => {
    await abrir(page);
    await expresion(page, 'Q').fill('x*(');
    await expresion(page, 'Q').blur();
    const error = page.locator('[data-prueba="error-Q"]');
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error).toContainText('Error:');
    await expect(error.locator('svg')).toHaveCount(1);
  });

  test('las notificaciones usan role="status", ofrecen «Deshacer» y se pausan con hover y con foco', async ({ page }) => {
    test.setTimeout(60_000);
    await abrir(page);
    const restablecerParametros = async () => {
      await gancho(page, '(c) => c.fijarEstado((s) => ({ ...s, parametros: s.parametros.map((p) => ({ ...p, valor: 0.9 })) }))');
      await page.getByRole('button', { name: 'Restablecer', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Parámetros' }).click();
    };
    // Hover
    await restablecerParametros();
    const n = page.locator('[data-prueba="notificacion"]');
    await expect(n).toHaveAttribute('role', 'status');
    await expect(n).toContainText('Parámetros restablecidos');
    await n.hover();
    await page.waitForTimeout(9000);
    await expect(n).toBeVisible();
    await page.mouse.move(5, 5);
    await expect(n).toBeHidden({ timeout: 9000 });
    // Foco
    await restablecerParametros();
    await n.getByRole('button', { name: 'Deshacer' }).focus();
    await page.waitForTimeout(9000);
    await expect(n).toBeVisible();
    await n.getByRole('button', { name: 'Deshacer' }).click();
    await expect(n).toBeHidden();
    expect((await estado(page)).parametros[0].valor).toBe(0.9);
  });

  test('estado vacío (C10): campo no definido en todo el dominio, con causa y acción (V-FUN-15)', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await expresion(page, 'P').fill('sqrt(-1-x^2)');
    await expresion(page, 'P').blur();
    const vacio = page.locator('[data-prueba="estado-vacio"]');
    await expect(vacio).toContainText('El campo no está definido en ningún punto del dominio');
    await expect(page.locator('[data-prueba="estado-calculo"]')).toContainText('Aviso: 729 de 729 nodos sin definir');
    await vacio.getByRole('button', { name: 'Restablecer ejemplo' }).click();
    await expect(vacio).toBeHidden();
    expect((await estado(page)).campo.P).toBe('-y');
    sinErrores(reg);
  });

  test('estado vacío para el campo nulo (V-FUN-15)', async ({ page }) => {
    await abrir(page);
    for (const c of ['P', 'Q', 'R'] as const) await expresion(page, c).fill('0');
    await expresion(page, 'R').blur();
    await expect(page.locator('[data-prueba="estado-vacio"]')).toContainText('El campo es nulo en todo el dominio');
  });
});

// ---------------------------------------------------------------- UI-02 (V-FUN-02)

test.describe('UI-02 · editor de ecuaciones (V-FUN-02)', () => {
  test('una expresión válida se aplica 300 ms después de la última tecla', async ({ page }) => {
    await abrir(page);
    const r = await page.evaluate(async () => {
      const c = (window as any).__campos;
      const entrada = document.querySelector('[data-prueba="expr-P"]') as HTMLInputElement;
      let tUltima = 0;
      let tAplicada = 0;
      entrada.addEventListener('input', () => (tUltima = performance.now()));
      const inicial = c.estado();
      const espera = new Promise<void>((resolver) => {
        const id = setInterval(() => {
          if (c.estado() !== inicial && c.estado().campo.P === '-2*y') {
            tAplicada = performance.now();
            clearInterval(id);
            resolver();
          }
        }, 2);
      });
      const fijar = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      for (const v of ['-', '-2', '-2*', '-2*y']) {
        fijar.call(entrada, v);
        entrada.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((res) => setTimeout(res, 60));
      }
      await espera;
      return { retraso: tAplicada - tUltima };
    });
    informe['V-FUN-02 retraso'] = r;
    expect(r.retraso).toBeGreaterThanOrEqual(290);
    expect(r.retraso).toBeLessThanOrEqual(400);
    const e = await estado(page);
    expect(e.modificado).toBe(true);
    expect(e.nombre).toBe('Personalizado (desde Helicoidal)');
    await expect(page.locator('.tarjeta-ejemplo[aria-checked="true"] .tarjeta-marca')).toHaveText('•');
  });

  test('«incompleta» con el foco; error con posición y aviso de escena al salir; Esc recupera el último valor válido', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    const q = expresion(page, 'Q');
    await q.fill('x*(');
    const contenedor = page.locator('.expresion').filter({ has: q });
    await expect(contenedor).toHaveAttribute('data-estado', 'incompleta');
    await expect(q).not.toHaveAttribute('aria-invalid', 'true');
    await expect(contenedor).toContainText('Incompleta:');
    await expect(page.locator('[data-prueba="aviso-escena"]')).toHaveCount(0);
    await q.blur();
    await expect(contenedor).toHaveAttribute('data-estado', 'error');
    await expect(q).toHaveAttribute('aria-invalid', 'true');
    await expect(contenedor.locator('.ondulado')).toHaveCount(1);
    await expect(page.locator('[data-prueba="aviso-escena"]')).toHaveText('Aviso: Mostrando el último campo válido');
    expect((await estado(page)).campo.Q).toBe('x');
    // Esc devuelve el último valor válido
    await q.focus();
    await page.keyboard.press('Escape');
    await expect(q).toHaveValue('x');
    await expect(page.locator('[data-prueba="aviso-escena"]')).toHaveCount(0);
    sinErrores(reg);
  });

  test('«incompleta» pasa a error tras 800 ms sin teclear', async ({ page }) => {
    await abrir(page);
    const q = expresion(page, 'Q');
    await q.fill('x*(');
    const contenedor = page.locator('.expresion').filter({ has: q });
    await expect(contenedor).toHaveAttribute('data-estado', 'incompleta');
    await page.waitForTimeout(900);
    await expect(contenedor).toHaveAttribute('data-estado', 'error');
    await expect(q).toBeFocused();
  });

  test('un identificador no declarado ofrece «Añadir como parámetro», que lo crea y aplica el campo', async ({ page }) => {
    await abrir(page);
    const p = expresion(page, 'P');
    await p.fill('-k*y');
    await p.blur();
    const boton = page.getByRole('button', { name: 'Añadir «k» como parámetro' });
    await expect(boton).toBeVisible();
    await boton.click();
    const e = await estado(page);
    expect(e.parametros.map((x: any) => x.nombre)).toEqual(['a', 'k']);
    expect(e.campo.P).toBe('-k*y');
    await expect(page.locator('[data-parametro="k"]')).toBeVisible();
  });
});

// ---------------------------------------------------------------- UI-03 (V-FUN-03)

test.describe('UI-03 · parámetros (V-FUN-03)', () => {
  test('rotacional, ω → 2: F(1, 0, 0) = (0, 2, 0), la leyenda se actualiza, restablecer, rango y «Eliminar» con motivo', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await page.locator('[data-campo="rotacional"]').click();
    await estable(page);
    const refAntes = (await gancho(page, '(c) => c.calculo()')).fRef;
    const omega = page.locator('[data-prueba="valor-omega"]');
    await omega.fill('2');
    await omega.press('Enter');
    await estable(page);
    const nodo = await gancho(page, '(c) => c.campoEnNodo(1, 0, 0)');
    expect(nodo.F).toEqual([-0, 2, 0]);
    expect(nodo.mag).toBe(2);
    const ref = (await gancho(page, '(c) => c.calculo()')).fRef;
    expect(ref).toBe(2 * refAntes);
    await expect(page.locator('[data-prueba="leyenda-escala"]')).toContainText(`F_ref = ${ref}`);
    // Deslizador con el teclado
    const sl = page.locator('[data-parametro="omega"] [role="slider"]');
    await sl.focus();
    await page.keyboard.press('ArrowRight');
    expect((await estado(page)).parametros[0].valor).toBe(2.05);
    // «Eliminar», deshabilitado con motivo mientras se usa
    await page.getByRole('button', { name: 'Opciones de ω' }).click();
    const eliminar = page.getByRole('menuitem', { name: 'Eliminar' });
    await expect(eliminar).toHaveAttribute('aria-disabled', 'true');
    const motivo = await eliminar.getAttribute('aria-describedby');
    await expect(page.locator(`[id="${motivo}"]`)).toContainText('aparece en las ecuaciones');
    await eliminar.click({ force: true });
    expect((await estado(page)).parametros).toHaveLength(1);
    await expect(page.getByRole('menu')).toBeVisible();
    // «Restablecer valor» → ω = 1
    await page.getByRole('menuitem', { name: /Restablecer valor/ }).click();
    await estable(page);
    expect((await estado(page)).parametros[0].valor).toBe(1);
    expect((await gancho(page, '(c) => c.campoEnNodo(1, 0, 0)')).F).toEqual([-0, 1, 0]);
    // Rango y paso editables
    await page.getByRole('button', { name: 'Opciones de ω' }).click();
    await page.getByRole('menuitem', { name: 'Rango y paso…' }).click();
    const max = page.locator('[data-prueba="rango-max-omega"]');
    await max.fill('5');
    await max.press('Enter');
    const paso = page.locator('[data-prueba="rango-paso-omega"]');
    await paso.fill('0.5');
    await paso.press('Enter');
    expect((await estado(page)).parametros[0]).toMatchObject({ max: 5, paso: 0.5 });
    const min = page.locator('[data-prueba="rango-min-omega"]');
    await min.fill('6');
    await min.press('Enter');
    await expect(min).toHaveAttribute('aria-invalid', 'true');
    expect((await estado(page)).parametros[0].min).toBe(-3);
    sinErrores(reg);
  });

  test('añadir y eliminar un parámetro; nombres inválidos con motivo', async ({ page }) => {
    await abrir(page);
    await page.getByRole('button', { name: 'Añadir parámetro' }).click();
    const nombre = page.locator('[data-prueba="nombre-parametro"]');
    await nombre.fill('x');
    await nombre.press('Enter');
    await expect(page.getByText('«x» es una variable')).toBeVisible();
    await nombre.fill('beta');
    await nombre.press('Enter');
    await expect(page.locator('[data-parametro="beta"]')).toBeVisible();
    await page.getByRole('button', { name: 'Opciones de β' }).click();
    await page.getByRole('menuitem', { name: 'Eliminar' }).click();
    await expect(page.locator('[data-parametro="beta"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------- UI-04 (V-FUN-14)

test.describe('UI-04 · dominio y muestreo (V-FUN-14)', () => {
  test('N = 21 → 9261 instancias; límites inválidos rechazados; la caja y la cámara se adaptan', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await page.getByRole('button', { name: 'Dominio y muestreo' }).click();
    const n = page.locator('[data-prueba="n"]');
    await n.fill('21');
    await n.press('Enter');
    await estable(page);
    expect((await gancho(page, '(c) => c.escena()')).flechas).toBe(9261);
    // Límite inválido: mín ≥ máx
    const min = page.locator('[data-prueba="min-x, y, z"]');
    await min.fill('3');
    await min.press('Enter');
    await expect(min).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('El mínimo debe ser menor que el máximo')).toBeVisible();
    expect((await estado(page)).dominio).toEqual({ min: [-2, -2, -2], max: [2, 2, 2] });
    await min.press('Escape');
    // Lado demasiado grande
    const max = page.locator('[data-prueba="max-x, y, z"]');
    await max.fill('2000');
    await max.press('Enter');
    await expect(page.getByText('El lado no puede superar 1000')).toBeVisible();
    await max.press('Escape');
    // Válido: [−2, 4]³ → centro (1, 1, 1); la cámara se reencuadra hacia él
    await gancho(page, '(c) => c.fijarEstado((s) => ({ ...s, corte: { ...s.corte, c: -1.9 } }))');
    await min.fill('-1');
    await min.press('Enter');
    await max.fill('3');
    await max.press('Enter');
    await expect.poll(async () => (await estado(page)).dominio).toEqual({ min: [-1, -1, -1], max: [3, 3, 3] });
    // El corte (z = −1.9) quedó fuera al pasar a [−1, 2]: vuelve a z = 0, que sigue dentro (F6.1).
    expect((await estado(page)).corte.c).toBe(0);
    await expect.poll(async () => (await gancho(page, '(c) => c.camara()')).objetivo.map((v: number) => Math.round(v * 1e6) / 1e6), { timeout: 3000 }).toEqual([1, 1, 1]);
    await estable(page);
    const esc = await gancho(page, '(c) => c.escena()');
    expect(esc.flechas).toBe(9261);
    // Desenlazar el cubo y cambiar solo z
    await page.getByRole('switch', { name: /Cubo/ }).click();
    const zmax = page.locator('[data-prueba="max-z"]');
    await zmax.fill('5');
    await zmax.press('Enter');
    await expect.poll(async () => (await estado(page)).dominio.max).toEqual([3, 3, 5]);
    sinErrores(reg);
  });
});

// ---------------------------------------------------------------- UI-05 (V-FUN-09)

test.describe('UI-05 · restablecer y deshacer (V-FUN-09)', () => {
  const menu = async (page: Page, opcion: string) => {
    await page.getByRole('button', { name: 'Restablecer', exact: true }).click();
    await page.getByRole('menuitem', { name: opcion }).click();
  };

  test('cámara: restablecer y deshacer (también con Ctrl+Z), sin que la inercia de la órbita mueva la pose restaurada', async ({ page }) => {
    await abrir(page);
    const lienzo = page.locator('[data-prueba="lienzo"]');
    const caja = (await lienzo.boundingBox())!;
    const orbitar = async (dx: number) => {
      await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
      await page.mouse.down();
      await page.mouse.move(caja.x + caja.width / 2 + dx, caja.y + caja.height / 2 + 40, { steps: 6 });
      await page.mouse.up();
    };
    const camara = () => gancho(page, '(c) => c.camara()');
    const quieta = async () => {
      let previa = JSON.stringify(await camara());
      for (let iguales = 0, i = 0; iguales < 6 && i < 100; i++) {
        await page.waitForTimeout(100);
        const actual = JSON.stringify(await camara());
        iguales = actual === previa ? iguales + 1 : 0;
        previa = actual;
      }
      return JSON.parse(previa);
    };
    const igual = (a: any, b: any) => {
      for (const k of ['posicion', 'objetivo']) a[k].forEach((v: number, i: number) => expect(Math.abs(v - b[k][i])).toBeLessThan(1e-9));
    };
    // 1. Pose estable → restablecer → Ctrl+Z: la misma pose exacta. Con movimiento reducido no
    // hay amortiguación: la pose queda quieta al soltar aunque los fotogramas vayan lentos.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await orbitar(150);
    const orbitada = await quieta();
    await menu(page, 'Cámara');
    const restablecida = await quieta();
    expect(restablecida).not.toEqual(orbitada);
    await page.keyboard.press('Control+z');
    igual(await quieta(), orbitada);
    // 2. En plena inercia: R y Ctrl+Z al instante; la pose restaurada no debe seguir girando.
    // Se esperan dos fotogramas: Chromium entrega los `pointermove` agrupados con el fotograma
    // y, con carga, el último del arrastre llegaría después de las teclas (artefacto sintético).
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await orbitar(-200);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const enInercia = await camara();
    await page.keyboard.press('r');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(50);
    const tras = await camara();
    await page.waitForTimeout(1200);
    igual(await camara(), tras);
    // La pose restaurada es la del instante de pulsar R (aún girando), no la final de la órbita.
    expect(JSON.stringify(tras)).not.toBe(JSON.stringify(restablecida));
    expect(enInercia).toBeTruthy();
  });

  test('parámetros y experimento: cada acción da su estado y «Deshacer» restaura el anterior exactamente', async ({ page }) => {
    await abrir(page);
    // Parámetros
    await gancho(page, '(c) => c.fijarEstado((s) => ({ ...s, parametros: s.parametros.map((p) => ({ ...p, valor: -0.7 })) }))');
    const antesP = await estado(page);
    await menu(page, 'Parámetros');
    expect((await estado(page)).parametros[0].valor).toBe(0.25);
    await page.locator('[data-prueba="notificacion"]').getByRole('button', { name: 'Deshacer' }).click();
    expect(await estado(page)).toEqual(antesP);
    // Experimento: ecuaciones, dominio y muestreo vuelven a los del ejemplo base
    await gancho(page, `(c) => c.fijarEstado((s) => ({ ...s, campo: { P: 'x', Q: 'y', R: 'a' }, modificado: true, nombre: 'Personalizado (desde Helicoidal)', dominio: { min: [-1, -1, -1], max: [1, 1, 1] }, muestreo: { ...s.muestreo, n: [5, 5, 5] } }))`);
    const antesE = await estado(page);
    await menu(page, 'Experimento');
    expect(await estado(page)).toEqual(JSON.parse(JSON.stringify(experimentoDesdeCatalogo('helicoidal'))));
    await expect(page.locator('[data-prueba="notificacion"]')).toContainText('Experimento restablecido');
    await page.keyboard.press('Control+z');
    expect(await estado(page)).toEqual(antesE);
    // «Parámetros» se deshabilita (con motivo) si ya están por defecto
    await menu(page, 'Experimento');
    await page.getByRole('button', { name: 'Restablecer', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Parámetros' })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
  });

  test('elegir otro ejemplo con el campo editado ofrece «Deshacer» (F1.3)', async ({ page }) => {
    await abrir(page);
    await expresion(page, 'R').fill('2*a');
    await expresion(page, 'R').blur();
    await expect.poll(async () => (await estado(page)).modificado).toBe(true);
    const editado = await estado(page);
    await page.locator('[data-campo="silla"]').click();
    const n = page.locator('[data-prueba="notificacion"]');
    await expect(n).toContainText('Se ha sustituido tu campo');
    await n.getByRole('button', { name: 'Deshacer' }).click();
    expect(await estado(page)).toEqual(editado);
    await expect(expresion(page, 'R')).toHaveValue('2*a');
  });
});
