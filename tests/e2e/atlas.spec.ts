import { expect, test } from '@playwright/test';
import { idle, jumpTo, openAtlas, settled, state } from './util.ts';

test.describe('K2 — Atlas interactivo (escritorio 1440×900)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('carga sin errores, sin recursos ausentes y con barra de progreso completa', async ({ page }) => {
    const problems = await openAtlas(page);
    expect(await page.evaluate(() => window.__k2!.error ?? null)).toBeNull();
    await expect(page.locator('#loading')).toHaveClass(/is-done/);
    expect(await page.locator('.bar').getAttribute('aria-valuenow')).toBe('100');
    expect(problems).toEqual([]);
    const s = await state(page);
    expect(s.calls).toBeGreaterThan(5);
    expect(s.markersVisible).toBeGreaterThan(1);
  });

  test('mostrar/ocultar rutas no regenera geometría ni descarga nada', async ({ page }) => {
    await openAtlas(page);
    // primero el nivel de detalle asentado: así cualquier geometría nueva sería culpa de las rutas
    await idle(page);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    const before = await state(page);
    await page.locator('#t-routes').uncheck({ force: true });
    await idle(page);
    expect((await state(page)).routesVisible).toBe(0);
    await page.locator('#t-routes').check({ force: true });
    await idle(page);
    const after = await state(page);
    expect(after.routesVisible).toBe(before.routesVisible);
    expect(after.geometries).toBe(before.geometries);
    expect(requests.filter((u) => u.includes('/data/'))).toEqual([]);
  });

  test('destacar una ruta muestra solo sus campamentos', async ({ page }) => {
    await openAtlas(page);
    await jumpTo(page, 'abruzzi');
    await page.locator('#route-highlight input[value=cesen]').check({ force: true });
    // los marcadores se actualizan en el siguiente fotograma, que sin GPU puede tardar segundos
    const ajenos = () =>
      page.$$eval('.poi.is-visible.poi--campamento', (els) =>
        els.map((e) => (e as HTMLElement).dataset.id).filter((id) => !['c2-cesen', 'c3-cesen', 'c4', 'campo-base'].includes(id!)),
      );
    await expect.poll(ajenos, { timeout: 30_000 }).toEqual([]);
    await idle(page);
    expect(await ajenos()).toEqual([]);
  });

  test('seleccionar un punto abre la ficha, «Enfocar» mueve la cámara y Escape cierra', async ({ page }) => {
    await openAtlas(page);
    await page.locator('.poi-item[data-id="bottleneck"]').click();
    await expect(page.locator('#poi-card')).toBeVisible();
    await expect(page.locator('#card-title')).toContainText('Bottleneck');
    await settled(page);
    const s = await state(page);
    const d = Math.hypot(s.camera.x - s.target.x, s.camera.y - s.target.y, s.camera.z - s.target.z);
    expect(d).toBeLessThan(2000);
    expect(s.selected).toBe('bottleneck');
    await page.locator('#scene').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#poi-card')).toBeHidden();
  });

  test('zoom y desplazamiento limitados: nunca bajo el terreno ni más cerca del mínimo', async ({ page }) => {
    // nueve alejamientos animados encadenados: sin GPU cada fotograma tarda del orden de un segundo
    test.setTimeout(480_000);
    await openAtlas(page);
    await jumpTo(page, 'hombro');
    const box = await page.locator('#scene').boundingBox();
    await page.mouse.move(box!.x + 500, box!.y + 450);
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -2000);
    await page.waitForTimeout(2500);
    await settled(page);
    let s = await state(page);
    const dist = Math.hypot(s.camera.x - s.target.x, s.camera.y - s.target.y, s.camera.z - s.target.z);
    expect(dist).toBeGreaterThan(340);
    expect(s.clearance).toBeGreaterThan(35);
    // arrastre hacia abajo intentando meter la cámara bajo el relieve
    await page.mouse.move(box!.x + 500, box!.y + 300);
    await page.mouse.down();
    await page.mouse.move(box!.x + 500, box!.y + 850, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(2500);
    await settled(page);
    s = await state(page);
    expect(s.camera.y - s.terrainY).toBeGreaterThan(35);
    // alejarse al máximo con el botón «Alejar» de la interfaz
    for (let i = 0; i < 9; i++) {
      await page.locator('#zoom-out').click();
      await settled(page);
    }
    s = await state(page);
    const far = Math.hypot(s.camera.x - s.target.x, s.camera.y - s.target.y, s.camera.z - s.target.z);
    expect(far).toBeLessThanOrEqual(24000 + 1);
    expect(Math.abs(s.camera.x)).toBeLessThanOrEqual(20500 + 1);
    expect(Math.abs(s.camera.z)).toBeLessThanOrEqual(20500 + 1);
  });

  test('las transiciones entre vistas mantienen la cámara sobre el relieve en cada fotograma', async ({ page }) => {
    await openAtlas(page);
    const minClearance = await page.evaluate(async () => {
      const a = window.__k2!.app!;
      let min = Infinity;
      for (const v of ['norte', 'bottleneck', 'general', 'cumbre', 'abruzzi']) {
        a.goToView(v);
        const t0 = performance.now();
        while (performance.now() - t0 < 1400) {
          await new Promise((r) => requestAnimationFrame(r));
          min = Math.min(min, a.cam.clearanceNow());
        }
      }
      return min;
    });
    expect(minClearance).toBeGreaterThan(30);
  });

  test('20 ciclos de capas, vistas y enfoques sin crecimiento de recursos', async ({ page }) => {
    test.setTimeout(600_000);
    await openAtlas(page);
    const snapshot = async () => {
      const s = await state(page);
      const extra = await page.evaluate(() => ({
        // recolección forzada antes de leer el montón (gc() expuesto en playwright.config.ts)
        gc: (window as unknown as { gc?: () => void }).gc?.() ?? null,
        objects: (() => {
          let n = 0;
          window.__k2!.app!.scene.traverse(() => n++);
          return n;
        })(),
        markers: document.querySelectorAll('.poi').length,
        heapMiB: ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576,
      }));
      const { gc: _gc, ...rest } = extra;
      return { geometries: s.geometries, geometryCap: s.geometryCap, textures: s.textures, routesVisible: s.routesVisible, ...rest };
    };
    // 20 ciclos: rutas, destacado, zona de la muerte, procedencia, vista y enfoque de un punto
    const cycles = () =>
      page.evaluate(async () => {
        const a = window.__k2!.app!;
        const ids = ['c1-abruzzi', 'bottleneck', 'cumbre', 'c3-cesen', 'hombro'];
        const views = ['general', 'abruzzi', 'hombro', 'bottleneck', 'cumbre', 'norte'];
        a.cam.reducedMotion = true;
        for (let i = 0; i < 20; i++) {
          a.setRoutesMaster(i % 2 === 0);
          a.setRoute('cesen', i % 3 !== 0);
          a.setHighlight(i % 4 === 0 ? 'abruzzi' : null);
          a.setDeathZone(i % 2 === 1);
          a.setDemOverlay(i % 5 === 0);
          a.goToView(views[i % views.length]);
          a.selectPoi(ids[i % ids.length], true);
          await new Promise((r) => setTimeout(r, 120));
        }
        a.setRoutesMaster(true);
        a.setRoute('cesen', true);
        a.setHighlight(null);
        a.setDeathZone(true);
        a.setDemOverlay(false);
        a.goToView('general');
        a.cam.reducedMotion = false;
      });
    const s0 = await snapshot();
    await cycles();
    await idle(page);
    const s1 = await snapshot();
    await cycles();
    await idle(page);
    const s2 = await snapshot();
    console.log('RECURSOS', JSON.stringify({ inicio: s0, tras20: s1, tras40: s2 }));
    // todas las geometrías (cada nivel de LOD incluido) se crean al cargar: los ciclos solo pueden
    // subir a la GPU niveles aún no usados, nunca crear otras (cota dura), y la subida se frena
    expect(s1.geometries).toBeLessThanOrEqual(s0.geometryCap);
    expect(s2.geometries).toBeLessThanOrEqual(s0.geometryCap);
    expect(s2.geometries - s1.geometries).toBeLessThanOrEqual(s1.geometries - s0.geometries);
    expect(s1.textures).toBe(s0.textures);
    expect(s2.textures).toBe(s0.textures);
    expect(s2.objects).toBe(s0.objects);
    expect(s2.markers).toBe(s0.markers);
    expect(s2.routesVisible).toBe(s0.routesVisible);
  });

  test('perfil Baja: draw calls y triángulos del pase principal dentro del presupuesto en todas las vistas', async ({ page }) => {
    await openAtlas(page);
    const results = await page.evaluate(async () => {
      const a = window.__k2!.app!;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const out: { view: string; calls: number; triangles: number }[] = [];
      a.cam.reducedMotion = true;
      for (const view of ['general', 'abruzzi', 'hombro', 'bottleneck', 'cumbre', 'norte']) {
        a.goToView(view);
        a.settleForCapture();
        await frame();
        await frame();
        out.push({ view, ...a.passStats() });
      }
      a.cam.reducedMotion = false;
      return out;
    });
    console.log('PRESUPUESTO', JSON.stringify(results));
    for (const r of results) {
      expect(r.calls, r.view).toBeLessThanOrEqual(70);
      expect(r.triangles, r.view).toBeLessThanOrEqual(250_000);
    }
  });

  test('cambiar la calidad no duplica objetos ni pierde la selección', async ({ page }) => {
    await openAtlas(page);
    await page.locator('.poi-item[data-id="c4"]').click();
    const count = () => page.evaluate(() => window.__k2!.app!.scene.children.length);
    const c0 = await count();
    for (const q of ['media', 'baja', 'alta', 'auto']) {
      await page.locator(`#quality input[value=${q}]`).check({ force: true });
      await page.waitForTimeout(300);
    }
    expect(await count()).toBe(c0);
    expect((await state(page)).selected).toBe('c4');
    await expect(page.locator('#poi-card')).toBeVisible();
  });

  test('etiquetas de la cara oculta no se muestran sobre la cara visible', async ({ page }) => {
    await openAtlas(page);
    await jumpTo(page, 'norte');
    await idle(page);
    const visible = await page.$$eval('.poi.is-visible', (els) => els.map((e) => (e as HTMLElement).dataset.id));
    // desde el norte, los campamentos del espolón sureste quedan ocultos tras la pirámide
    for (const id of ['c1-abruzzi', 'c2-abruzzi', 'c3-abruzzi', 'c2-cesen', 'campo-base', 'bottleneck']) expect(visible).not.toContain(id);
  });
});

test.describe('móvil 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('sin scroll horizontal, hoja inferior y objetivos táctiles ≥ 44 px', async ({ page }) => {
    const problems = await openAtlas(page);
    expect(problems).toEqual([]);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(o.sw).toBeLessThanOrEqual(o.cw);
    for (const sel of ['#zoom-in', '#zoom-out', '#reset', '#autorotate', '#compass', '#panel-toggle']) {
      const b = await page.locator(sel).boundingBox();
      expect(b!.width).toBeGreaterThanOrEqual(44);
      expect(b!.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#panel-toggle').tap();
    await expect(page.locator('#panel')).toHaveClass(/is-open/);
    await expect(page.locator('#panel-toggle')).toHaveAttribute('aria-expanded', 'true');
    // un gesto sobre el panel no mueve la cámara
    const before = await state(page);
    const pb = await page.locator('#panel-body').boundingBox();
    await page.mouse.move(pb!.x + 100, pb!.y + 200);
    await page.mouse.down();
    await page.mouse.move(pb!.x + 260, pb!.y + 220, { steps: 8 });
    await page.mouse.up();
    await idle(page);
    const after = await state(page);
    expect(Math.hypot(after.camera.x - before.camera.x, after.camera.z - before.camera.z)).toBeLessThan(1);
  });
});

test.describe('accesibilidad y entornos degradados', () => {
  test('con movimiento reducido las vistas cambian sin animación', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    await openAtlas(page);
    const res = await page.evaluate(async () => {
      const a = window.__k2!.app!;
      a.goToView('bottleneck');
      await new Promise((r) => requestAnimationFrame(r));
      return { animating: a.cam.animating, reduced: a.cam.reducedMotion };
    });
    expect(res.reduced).toBe(true);
    expect(res.animating).toBe(false);
    await expect(page.locator('#autorotate')).toBeDisabled();
    expect(await page.evaluate(() => window.__k2!.app!.cam.controls.autoRotate)).toBe(false);
    await ctx.close();
  });

  test('sin WebGL 2 se informa y la lista de puntos sigue disponible en HTML', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error sustitución deliberada para simular un navegador sin WebGL
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
      };
    });
    await page.goto('/');
    await expect(page.locator('#loading-error-text')).toContainText('WebGL', { timeout: 60_000 });
    await expect(page.locator('.poi-item').first()).toBeAttached();
    expect(await page.locator('.poi-item').count()).toBeGreaterThan(10);
  });

  test('los controles tienen nombre accesible y la lista se recorre con teclado', async ({ page }) => {
    await openAtlas(page);
    for (const sel of ['#zoom-in', '#zoom-out', '#reset', '#autorotate', '#compass']) expect(await page.locator(sel).getAttribute('aria-label')).toBeTruthy();
    await page.locator('.poi-item').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#poi-card')).toBeVisible();
  });
});

test.describe('robustez', () => {
  test('si falla un recurso se muestra el error y «Reintentar» recupera la carga', async ({ page }) => {
    let fail = true;
    await page.route('**/data/heights_core.png', (route) => (fail ? route.abort() : route.continue()));
    await page.goto('/?q=baja&aa=0');
    await expect(page.locator('#loading-error')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#loading-error-text')).toContainText('heights_core.png');
    fail = false;
    await page.locator('#retry').click();
    await page.waitForFunction(() => window.__k2?.ready, null, { timeout: 180_000 });
    await expect(page.locator('#loading')).toHaveClass(/is-done/);
  });

  test('pérdida y restauración del contexto WebGL', async ({ page }) => {
    await openAtlas(page);
    const r0 = (await state(page)).renders;
    await page.evaluate(() => {
      const gl = window.__k2!.app!.renderer.getContext();
      (window as unknown as { __lose: WEBGL_lose_context | null }).__lose = gl.getExtension('WEBGL_lose_context');
      (window as unknown as { __lose: WEBGL_lose_context }).__lose.loseContext();
    });
    await expect(page.locator('#loading-stage')).toContainText('contexto gráfico', { timeout: 30_000 });
    await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
    await expect(page.locator('#loading')).toHaveClass(/is-done/, { timeout: 30_000 });
    await page.evaluate(() => window.__k2!.app!.request());
    await page.waitForFunction((n) => window.__k2!.app!.renders > n, r0, { timeout: 60_000 });
  });
});
