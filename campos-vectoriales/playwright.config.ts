import { defineConfig } from '@playwright/test';

/**
 * Pruebas de navegador (VALIDATION §1). Por defecto contra el servidor de desarrollo; con
 * OBJETIVO=archivo, contra el HTML autocontenido abierto con file:// (ENT-01).
 * Chromium 1194 preinstalado (Playwright 1.56.1, D-06) con WebGL2 por software.
 */
const archivo = process.env.OBJETIVO === 'archivo';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: archivo ? undefined : 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-lcd-text'] },
  },
  webServer: archivo
    ? undefined
    : {
        command: 'npx vite --port 5173 --strictPort',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 60_000,
      },
  // Las medidas de rendimiento (@rendimiento) se ejecutan al final, en serie y sin otras
  // pruebas en paralelo: con la CPU saturada por otros navegadores no miden la aplicación.
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, grepInvert: /@rendimiento/ },
    { name: 'rendimiento', use: { browserName: 'chromium' }, grep: /@rendimiento/, dependencies: ['chromium'], workers: 1 },
  ],
});
