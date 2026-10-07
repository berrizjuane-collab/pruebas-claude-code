import { defineConfig } from 'vitest/config';

// base relativa: la build funciona servida desde cualquier subruta (GitHub Pages, artifact, file server).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    assetsInlineLimit: 0,
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
