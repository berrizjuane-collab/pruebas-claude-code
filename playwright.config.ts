import { defineConfig } from '@playwright/test';

/**
 * Pruebas de extremo a extremo en Chromium. Sin GPU se usa SwiftShader (WebGL por
 * CPU): sirve para comprobar comportamiento y maquetación, no rendimiento real.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174/',
    launchOptions: {
      // --enable-precise-memory-info y gc() expuesto: lecturas del montón comparables en la prueba de ciclos
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
    },
  },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
