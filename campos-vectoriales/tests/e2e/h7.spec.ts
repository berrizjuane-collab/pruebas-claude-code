import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { abrir, registrar, sinErrores } from '../util/app';

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
const fijar = (page: Page, cuerpo: string) => gancho(page, `(c) => c.fijarEstado((s) => (${cuerpo}))`);
const FIXTURES = 'tests/fixtures/configuracion';
const notificacion = (page: Page) => page.locator('[data-prueba="notificacion"]');
type Camara = { posicion: number[]; objetivo: number[] };
/** Diferencia máxima entre dos cámaras: OrbitControls redondea al pasar por esféricas (≈ 10⁻¹⁵). */
const difCamara = (a: Camara, b: Camara) => Math.max(...[0, 1, 2].flatMap((k) => [Math.abs(a.posicion[k]! - b.posicion[k]!), Math.abs(a.objetivo[k]! - b.objetivo[k]!)]));

/** Captura del lienzo (con lo que tenga encima) sin las notificaciones, que no son parte de la escena. */
async function capturaEscena(page: Page): Promise<Buffer> {
  await estable(page);
  await gancho(page, '(c) => c.dibujar()');
  const caja = (await page.locator('[data-prueba="lienzo"]').boundingBox())!;
  await page.mouse.move(caja.x + 8, caja.y + 8);
  return page.locator('[data-prueba="lienzo"]').screenshot({ animations: 'disabled', style: '.notificaciones { visibility: hidden !important; }' });
}

function pixelesDistintos(a: Buffer, b: Buffer): number {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return Infinity;
  let n = 0;
  for (let i = 0; i < pa.data.length; i += 4) if (pa.data[i] !== pb.data[i] || pa.data[i + 1] !== pb.data[i + 1] || pa.data[i + 2] !== pb.data[i + 2]) n++;
  return n;
}

const informe: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  const ruta = 'test-results/h7-informe.json';
  const previo = existsSync(ruta) ? (JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>) : {};
  writeFileSync(ruta, JSON.stringify({ ...previo, ...informe }, null, 2));
});

// ---------------------------------------------------------------- EXP-01 (V-FUN-10)

test.describe('EXP-01 · configuración JSON v1', () => {
  test('V-FUN-10: exportar → importar da el mismo estado (igualdad profunda), la misma cámara y la misma escena píxel a píxel; «Deshacer» vuelve atrás', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    // Un experimento no trivial: rotacional con ω editado, corte con div F, punto P y cámara propia.
    await page.locator('[data-campo="rotacional"]').click();
    await fijar(
      page,
      `{ ...s, parametros: s.parametros.map((p) => ({ ...p, valor: 1.5 })), corte: { ...s.corte, activo: true, plano: 'XZ', c: 0.5, escalar: 'divergencia' }, punto: [1, 0.5, -0.5], cifras: 5 }`,
    );
    await gancho(page, '(c) => c.fijarCamara({ posicion: [6.1, -4.3, 3.7], objetivo: [0.2, 0, -0.1] })');
    const escenaA = await capturaEscena(page);
    const estadoA = await estado(page);
    const camaraA = await camara(page);

    // Exportar ▾ → Configuración (.json): descarga directa y notificación con el nombre.
    await page.getByRole('button', { name: 'Exportar' }).click();
    const descarga = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Configuración (.json)' }).click();
    const d = await descarga;
    const nombre = d.suggestedFilename();
    expect(nombre).toMatch(/^campo-rotacional-\d{8}-\d{4}\.json$/);
    await expect(notificacion(page).first()).toContainText(`Configuración exportada: ${nombre}`);
    const ruta = await d.path();
    const doc = JSON.parse(readFileSync(ruta, 'utf8'));
    expect(doc).toMatchObject({ formato: 'campos-vectoriales', version: 1, nombre: 'Rotacional', campo: { P: '-omega*y', Q: 'omega*x', R: '0', base: 'rotacional' } });
    expect(doc.camara).toEqual({ tipo: 'perspectiva', ...camaraA });

    // Otro experimento, con otro dominio (que reencuadra la cámara) y otra vista.
    await page.locator('[data-campo="silla"]').click();
    await fijar(page, `{ ...s, dominio: { min: [-1, -1, -1], max: [1, 1, 1] }, punto: null }`);
    await estable(page);
    await gancho(page, '(c) => c.vista("XY")');
    const estadoB = await estado(page);
    const camaraB = await camara(page);

    // Abrir el archivo exportado.
    await page.locator('[data-prueba="entrada-archivo"]').setInputFiles({ name: nombre, mimeType: 'application/json', buffer: readFileSync(ruta) });
    await expect(notificacion(page).first()).toContainText(`Configuración abierta: ${nombre}`);
    const estadoImportado = await estado(page);
    expect(estadoImportado).toEqual({ ...estadoA, camara: { tipo: 'perspectiva', ...camaraA } });
    expect(difCamara(await camara(page), camaraA)).toBeLessThan(1e-9);
    const escenaImportada = await capturaEscena(page);
    const distintos = pixelesDistintos(escenaA, escenaImportada);
    if (distintos) {
      writeFileSync('test-results/h7-escena-a.png', escenaA);
      writeFileSync('test-results/h7-escena-importada.png', escenaImportada);
    }
    informe['EXP-01 ida y vuelta'] = { archivo: nombre, bytes: readFileSync(ruta).length, pixelesDistintos: distintos, camara: camaraA };
    expect(distintos).toBe(0);

    // «Deshacer» restaura exactamente el experimento y la cámara anteriores.
    await notificacion(page).getByRole('button', { name: 'Deshacer' }).click();
    expect(await estado(page)).toEqual(estadoB);
    await expect.poll(async () => difCamara(await camara(page), camaraB)).toBeLessThan(1e-9);
    sinErrores(reg);
  });

  const INVALIDOS: [string, string, RegExp][] = [
    ['malformado.json', 'Archivo', /^no es JSON válido/],
    ['formato-ajeno.json', 'formato', /^debe ser «campos-vectoriales»/],
    ['version-futura.json', 'version', /versión 2, posterior a la que entiende esta aplicación \(1\)/],
    ['fuera-de-rango.json', 'dominio.min[2]', /^debe ser menor que dominio\.max\[2\]$/],
    ['expresion-501.json', 'campo.P', /^tiene 501 caracteres; el máximo es 500$/],
  ];

  test('casos inválidos: los errores se listan por dato y el estado queda intacto; Esc cierra y el foco vuelve a «Abrir»', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page);
    await estable(page);
    const antes = await estado(page);
    const camaraAntes = await camara(page);
    const casos: [string, { name: string; mimeType: string; buffer: Buffer }][] = INVALIDOS.map(([f]) => [f, { name: f, mimeType: 'application/json', buffer: readFileSync(`${FIXTURES}/${f}`) }]);
    const grande = readFileSync(`${FIXTURES}/spec-ejemplo.json`, 'utf8');
    const relleno = 300 * 1024 - Buffer.byteLength(grande) + 'Helicoidal'.length;
    casos.push(['300 KB', { name: 'grande.json', mimeType: 'application/json', buffer: Buffer.from(grande.replace('"Helicoidal"', `"${' '.repeat(relleno)}"`)) }]);
    const listados: Record<string, string[]> = {};
    const esperado = [...INVALIDOS, ['300 KB', 'Archivo', /^ocupa 300 KB; el máximo es 256 KB$/] as [string, string, RegExp]];
    for (const [k, [caso, archivo]] of casos.entries()) {
      const abrirBoton = page.getByRole('button', { name: 'Abrir', exact: true });
      const selector = page.waitForEvent('filechooser');
      await abrirBoton.click();
      await (await selector).setFiles(archivo);
      const dialogo = page.getByRole('dialog', { name: 'No se pudo abrir la configuración' });
      await expect(dialogo).toBeVisible();
      await expect(dialogo).toContainText(`«${archivo.name}» tiene`);
      await expect(dialogo).toContainText('Tu experimento no ha cambiado');
      const filas = await dialogo.locator('[data-prueba="lista-errores"] li').allInnerTexts();
      listados[caso] = filas.map((f) => f.replace('\n', ' · '));
      const [, ruta, mensaje] = esperado[k]!;
      expect(filas.some((f) => f.startsWith(`${ruta}\n`) && mensaje.test(f.slice(ruta.length + 1))), `${caso}: ${filas.join(' | ')}`).toBe(true);
      // El foco empieza en «Cerrar»; Esc cierra y devuelve el foco al botón «Abrir».
      await expect(dialogo.getByRole('button', { name: 'Cerrar', exact: true }).last()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialogo).toHaveCount(0);
      await expect(abrirBoton).toBeFocused();
      expect(await estado(page)).toEqual(antes);
      expect(difCamara(await camara(page), camaraAntes)).toBe(0);
    }
    informe['EXP-01 casos inválidos'] = listados;
    sinErrores(reg);
  });

  test('arrastrar un .json a la ventana lo abre; claves desconocidas y datos ausentes se avisan', async ({ page }) => {
    await abrir(page);
    await estable(page);
    const texto = readFileSync(`${FIXTURES}/claves-desconocidas.json`, 'utf8');
    await page.evaluate((t) => {
      const dt = new DataTransfer();
      dt.items.add(new File([t], 'arrastrado.json', { type: 'application/json' }));
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, texto);
    await expect(page.locator('.soltar-archivo')).toContainText('Suelta el archivo para abrir la configuración');
    await page.evaluate((t) => {
      const dt = new DataTransfer();
      dt.items.add(new File([t], 'arrastrado.json', { type: 'application/json' }));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, texto);
    await expect(page.locator('.soltar-archivo')).toHaveCount(0);
    await expect(notificacion(page).filter({ hasText: 'Configuración abierta: arrastrado.json' })).toBeVisible();
    await expect(notificacion(page).filter({ hasText: 'Al abrir, 3 avisos' })).toBeVisible();
    await expect.poll(async () => difCamara(await camara(page), { posicion: [5.2, -6.8, 4.1], objetivo: [0, 0, 0] })).toBeLessThan(1e-9);
    expect((await estado(page)).lineas.semillas).toEqual({ tipo: 'rejilla', plano: 'XZ', c: 0, u: [0.5, 2], v: [0, 0], nu: 4, nv: 1 });
  });
});

// ---------------------------------------------------------------- EXP-02 (V-FUN-11)

test.describe('EXP-02 · autoguardado y recuperación', () => {
  const guardado = (page: Page) => page.evaluate(() => localStorage.getItem('campos-vectoriales:autoguardado'));

  test('V-FUN-11: recargar recupera el experimento y la cámara con un aviso; «Empezar de cero» lo descarta', async ({ page }) => {
    const reg = registrar(page);
    await abrir(page, 'prueba=1');
    await estable(page);
    // Sin cambios no hay nada recuperado al arrancar.
    await expect(notificacion(page)).toHaveCount(0);
    await page.locator('[data-campo="radial-entrante"]').click();
    await fijar(page, `{ ...s, parametros: s.parametros.map((p) => ({ ...p, valor: 2 })), capas: { ...s.capas, lineas: false } }`);
    await gancho(page, '(c) => c.fijarCamara({ posicion: [3, 4, 5], objetivo: [0, 0, 0.5] })');
    const antes = await estado(page);
    // Rebote de 1 s: se guarda tras el último cambio.
    const camaraGuardada = { posicion: [3, 4, 5], objetivo: [0, 0, 0.5] };
    await expect
      .poll(async () => {
        const g = JSON.parse((await guardado(page)) ?? 'null');
        return g ? difCamara(g.camara, camaraGuardada) : Infinity;
      }, { timeout: 5000 })
      .toBeLessThan(1e-9);
    await page.reload();
    await page.waitForFunction(() => (window as any).__campos?.listo === true);
    await expect(notificacion(page)).toContainText('Se ha recuperado tu último experimento');
    const recuperado = await estado(page);
    expect({ ...recuperado, camara: null }).toEqual({ ...antes, camara: null });
    expect(recuperado.camara.tipo).toBe('perspectiva');
    expect(difCamara(recuperado.camara, camaraGuardada)).toBeLessThan(1e-9);
    await expect.poll(async () => difCamara(await camara(page), camaraGuardada)).toBeLessThan(1e-9);
    // «Empezar de cero»: el experimento inicial y la cámara encuadrada.
    await notificacion(page).getByRole('button', { name: 'Empezar de cero' }).click();
    const inicial = await estado(page);
    expect(inicial).toMatchObject({ nombre: 'Helicoidal', base: 'helicoidal', modificado: false, camara: null, punto: null });
    expect(difCamara(await camara(page), camaraGuardada)).toBeGreaterThan(1);
    sinErrores(reg);
  });

  test('con localStorage bloqueado la aplicación funciona y no muestra errores técnicos', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('El almacenamiento está bloqueado', 'SecurityError');
        },
      });
    });
    const reg = registrar(page);
    await abrir(page, 'prueba=1');
    await estable(page);
    await page.locator('[data-campo="silla"]').click();
    await estable(page);
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForFunction(() => (window as any).__campos?.listo === true);
    await estable(page);
    expect((await estado(page)).nombre).toBe('Helicoidal');
    await expect(notificacion(page)).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    sinErrores(reg);
  });

  test('un autoguardado dañado se ignora sin errores', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('campos-vectoriales:autoguardado', '{"formato": "campos-vectoriales", "version": 1, "campo": '));
    const reg = registrar(page);
    await abrir(page, 'prueba=1');
    await estable(page);
    expect((await estado(page)).nombre).toBe('Helicoidal');
    await expect(notificacion(page)).toHaveCount(0);
    sinErrores(reg);
  });
});
