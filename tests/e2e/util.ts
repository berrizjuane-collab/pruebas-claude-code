import type { Page } from '@playwright/test';

/**
 * Abre el atlas. Por defecto perfil Baja sin MSAA: las pruebas verifican comportamiento, y sin
 * GPU (SwiftShader) cada fotograma con antialiasing a 1440×900 cuesta segundos.
 */
export async function openAtlas(page: Page, query = 'q=baja&aa=0'): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__k2?.ready || window.__k2?.error, null, { timeout: 180_000 });
  return problems;
}

export const state = (page: Page) => page.evaluate(() => window.__k2!.app!.debugState());

/** Espera a que termine cualquier transición de cámara (los fotogramas pueden tardar segundos sin GPU). */
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => !window.__k2!.app!.cam.animating, null, { timeout: 60_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Ejecuta una vista sin animación y espera a que el render se asiente. */
export async function jumpTo(page: Page, id: string): Promise<void> {
  await page.evaluate((v) => {
    const a = window.__k2!.app!;
    a.cam.reducedMotion = true;
    a.goToView(v);
    a.cam.reducedMotion = false;
  }, id);
  await settled(page);
}

/**
 * Espera a que la aplicación quede en reposo: con render bajo demanda, sin fotogramas nuevos
 * durante `quietMs` (cámara, transiciones y nivel de detalle asentados).
 */
export async function idle(page: Page, quietMs = 1500): Promise<void> {
  await page.waitForFunction(
    (quiet) => {
      const w = window as unknown as { __idle?: { renders: number; since: number } };
      const renders = window.__k2!.app!.renders;
      const now = performance.now();
      if (!w.__idle || w.__idle.renders !== renders) {
        w.__idle = { renders, since: now };
        return false;
      }
      return now - w.__idle.since >= quiet;
    },
    quietMs,
    { timeout: 180_000, polling: 250 },
  );
}
