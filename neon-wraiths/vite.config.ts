import { defineConfig } from 'vite';

// Relative base so the same build works on GitHub Pages (project subpath),
// on a local `vite preview`, and inlined into a single HTML file.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // One JS chunk + one CSS file keeps the standalone inliner trivial.
        manualChunks: undefined,
        entryFileNames: 'assets/neon-wraiths.js',
        chunkFileNames: 'assets/neon-wraiths-[hash].js',
        assetFileNames: 'assets/neon-wraiths.[ext]',
      },
    },
  },
});
