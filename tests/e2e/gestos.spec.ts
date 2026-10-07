import { expect, test } from '@playwright/test';
import { idle, jumpTo, openAtlas, state } from './util.ts';

/*
 * Gestos táctiles reales (dos dedos) inyectados por el protocolo de Chrome. Es la prueba más
 * pesada sin GPU: minutos de fotogramas por software. Va en su propio proyecto de Playwright
 * (ver playwright.config.ts), que se ejecuta después del principal con un navegador nuevo.
 */
test.describe('móvil 390×844 · gestos táctiles', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('gestos táctiles: pellizco y arrastre con dos dedos respetan los límites de la cámara', async ({ page }) => {
    // sin GPU cada toque inyectado espera a un fotograma lento: gestos cortos y pocos
    test.setTimeout(600_000);
    const t0 = Date.now();
    const fase = (n: string) => console.log(`TACTIL ${n} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await openAtlas(page);
    await jumpTo(page, 'bottleneck');
    await idle(page);
    const box = (await page.locator('#scene').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height * 0.62;
    // toques reales vía el protocolo de Chrome: generan pointer events de tipo «touch»
    const cdp = await page.context().newCDPSession(page);
    type P = [number, number];
    const twoFingers = async (from: P[], to: P[], steps = 3) => {
      // los dos dedos deben empezar sobre el lienzo (no sobre un marcador ni un botón)
      const onCanvas = await page.evaluate((pts) => pts.every(([x, y]) => document.elementFromPoint(x, y)?.id === 'scene'), from);
      expect(onCanvas, `inicio del gesto sobre el lienzo: ${JSON.stringify(from)}`).toBe(true);
      const at = (t: number) => from.map(([x, y], id) => ({ x: x + (to[id][0] - x) * t, y: y + (to[id][1] - y) * t, id }));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
      for (let k = 1; k <= steps; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k / steps) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const dist = (st: Awaited<ReturnType<typeof state>>) => Math.hypot(st.camera.x - st.target.x, st.camera.y - st.target.y, st.camera.z - st.target.z);
    const d0 = dist(await state(page));
    // abrir los dedos (acercar; cada gesto ≈ ×5) varias veces: nunca más cerca del mínimo focal ni bajo el relieve
    for (let k = 0; k < 3; k++) await twoFingers([[cx - 25, cy], [cx + 25, cy]], [[cx - 120, cy], [cx + 120, cy]]);
    await idle(page);
    fase('acercar');
    let st = await state(page);
    expect(dist(st)).toBeLessThan(d0 * 0.9); // el gesto llegó a la cámara
    expect(dist(st)).toBeGreaterThan(340);
    expect(st.clearance).toBeGreaterThan(35);
    // arrastre con dos dedos (desplazamiento) intentando hundir la cámara en la ladera
    await twoFingers([[cx - 50, cy - 160], [cx + 50, cy - 160]], [[cx - 50, cy + 140], [cx + 50, cy + 140]]);
    await idle(page);
    fase('desplazar');
    st = await state(page);
    expect(st.camera.y - st.terrainY).toBeGreaterThan(35);
    // cerrar los dedos (alejar; cada gesto ≈ ×8): tres bastan para intentar pasar de 24 km
    for (let k = 0; k < 3; k++) await twoFingers([[cx - 120, cy], [cx + 120, cy]], [[cx - 15, cy], [cx + 15, cy]]);
    await idle(page);
    fase('alejar');
    st = await state(page);
    expect(dist(st)).toBeGreaterThan(d0);
    expect(dist(st)).toBeLessThanOrEqual(24000 + 1);
    expect(Math.abs(st.camera.x)).toBeLessThanOrEqual(20500 + 1);
    expect(Math.abs(st.camera.z)).toBeLessThanOrEqual(20500 + 1);
    await page.close();
  });
});
