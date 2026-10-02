/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * KaTeX declara cada fuente en woff2, woff y ttf. Como el HTML final lo incrusta todo en
 * base64, se conservan solo las woff2 (todas las versiones actuales de los navegadores
 * objetivo las admiten) para no triplicar el tamaño.
 */
function katexSoloWoff2(): Plugin {
  return {
    name: 'katex-solo-woff2',
    enforce: 'pre',
    transform(code, id) {
      if (!/katex(\.min)?\.css(\?.*)?$/.test(id)) return null;
      return code.replace(/,\s*url\([^)]*\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g, '');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), katexSoloWoff2()],
  build: {
    target: 'es2022',
    // Todo recurso se incrusta como data URI: el resultado es un único HTML (RNF-14).
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 4096,
  },
  worker: { format: 'iife' },
  server: { port: 5173, strictPort: true },
  // Preoptimizadas al arrancar: evita recargas por «Outdated Optimize Dep» en la primera visita.
  optimizeDeps: { include: ['react', 'react-dom/client', 'three', 'katex', 'lucide-react'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // VAL-01: cobertura de las capas puras; ≥ 90 % de líneas en math/ y numerics/.
    coverage: {
      provider: 'v8',
      include: ['src/math/**', 'src/numerics/**', 'src/geometria/**', 'src/state/**'],
      exclude: ['**/*.test.ts', '**/*.medida.test.ts'],
      reporter: ['text', 'text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        'src/math/**': { lines: 90 },
        'src/numerics/**': { lines: 90 },
      },
    },
  },
});
