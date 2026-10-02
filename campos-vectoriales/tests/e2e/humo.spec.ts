import { expect, test } from '@playwright/test';
import { abrir, registrar, sinErrores } from '../util/app';
import { auditarPaleta } from '../../scripts/lib/paleta.mjs';
import { auditarMaquetacion } from '../../scripts/lib/maquetacion.mjs';

/** FND-02: prueba de humo y pruebas negativas de las auditorías. */
test('la aplicación arranca sin errores, con worker y sin peticiones externas', async ({ page }) => {
  const reg = registrar(page);
  await abrir(page);
  expect(await page.evaluate(() => window.__campos?.modoCalculo)).toBe('worker');
  sinErrores(reg);
});

test('la auditoría de paleta acepta la página gris y rechaza un píxel de color', async ({ page }) => {
  await abrir(page);
  const gris = auditarPaleta(await page.screenshot());
  expect(gris.fuera, JSON.stringify(gris.ejemplos)).toBe(0);

  await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:10px;top:10px;width:1px;height:1px;background:#ff0000;z-index:99';
    document.body.appendChild(d);
  });
  const color = auditarPaleta(await page.screenshot());
  expect(color.fuera).toBeGreaterThan(0);
  expect(color.ejemplos[0]?.rgb).toEqual([255, 0, 0]);
});

test('el detector de maquetación señala solapamientos y desplazamiento horizontal', async ({ page }) => {
  await abrir(page);
  const limpia = await page.evaluate(auditarMaquetacion);
  expect(limpia.incidencias).toEqual([]);

  await page.evaluate(() => {
    for (const x of [100, 150]) {
      const d = document.createElement('div');
      d.setAttribute('data-flotante', `prueba-${x}`);
      d.style.cssText = `position:fixed;left:${x}px;top:100px;width:100px;height:40px;background:#242424`;
      document.body.appendChild(d);
    }
    const ancho = document.createElement('div');
    ancho.style.cssText = 'position:absolute;left:0;top:0;width:5000px;height:1px';
    document.body.style.overflow = 'auto';
    document.body.appendChild(ancho);
  });
  const sucia = await page.evaluate(auditarMaquetacion);
  const tipos = sucia.incidencias.map((i) => i.tipo);
  expect(tipos).toContain('solapamiento');
  expect(tipos).toContain('desplazamiento-horizontal');
});
