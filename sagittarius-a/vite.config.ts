/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * KaTeX declara cada fuente en woff2, woff y ttf. El HTML final lo incrusta todo en base64,
 * así que se conservan solo las woff2 para no triplicar el tamaño.
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
    // Todo recurso se incrusta: el resultado final es un único HTML (scripts/autocontenido.mjs).
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 4096,
  },
  worker: { format: 'iife' },
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
  optimizeDeps: { include: ['react', 'react-dom/client', 'three', 'katex', 'lucide-react'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
