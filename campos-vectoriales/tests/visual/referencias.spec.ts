/**
 * REV-04 · Capturas de referencia (VALIDATION §7.5): C1–C12 a 1280 × 720 (V3, DPR 1) con las
 * mismas escenas que `scripts/capturas.mjs`, en modo captura (reloj determinista) y con
 * movimiento reducido. Tolerancias: 0.1 por píxel y 0.5 % de píxeles distintos con escena
 * (antialiasing por software); 0.1 % para la galería, que es solo interfaz.
 *
 * Solo son válidas en Linux con Chromium 1194 (el renderizado depende del sistema y del
 * navegador); en otros equipos la revisión visual es la manual. Para regenerarlas tras un
 * cambio visual intencionado: `npx playwright test --project=visual --update-snapshots`.
 */
import { expect, test } from '@playwright/test';
import { PAGINA, PREPARAR, TAMANOS } from '../../scripts/lib/escenas.mjs';
import { urlApp } from '../util/app';

const TAMANO = 'V3';
const CAPTURAS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12'];

test.use({
  viewport: { width: TAMANOS[TAMANO].width, height: TAMANOS[TAMANO].height },
  deviceScaleFactor: TAMANOS[TAMANO].deviceScaleFactor,
  contextOptions: { reducedMotion: 'reduce' },
});

for (const cap of CAPTURAS) {
  test(`${cap} a ${TAMANO}`, async ({ page }) => {
    test.setTimeout(120_000);
    const pagina = PAGINA[cap];
    if (pagina) {
      await page.goto(urlApp(pagina));
      await page.locator('[data-prueba="galeria"]').waitFor();
      const alto = await page.evaluate(() => document.querySelector('.galeria')!.scrollHeight);
      await page.setViewportSize({ width: TAMANOS[TAMANO].width, height: Math.ceil(alto) });
    } else {
      await page.goto(urlApp(`captura=1&escena=${cap}`));
      await page.waitForFunction(() => (window as unknown as { __campos?: { listo?: boolean } }).__campos?.listo === true, null, { timeout: 60_000 });
      await PREPARAR[cap]?.(page);
    }
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot(`${cap}-${TAMANO}.png`, {
      threshold: 0.1,
      maxDiffPixelRatio: pagina ? 0.001 : 0.005,
      animations: 'disabled',
      caret: 'hide',
      fullPage: !!pagina,
    });
  });
}
