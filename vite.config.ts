import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    // Keep three.js in its own chunk; it dominates the bundle size.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          katex: ['katex'],
        },
      },
    },
  },
  test: {
    // The physics/math layer is pure (no DOM/WebGL), so node suffices.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
