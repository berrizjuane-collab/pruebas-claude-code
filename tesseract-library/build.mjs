// Empaqueta todo (React + Three.js + fuentes propias) en un único HTML
// autocontenido: cero peticiones externas, apto para el CSP estricto
// del entorno de Artifacts.

import esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

await esbuild.build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  outfile: 'dist/bundle.js',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});

// `</script` dentro de literales rompería el HTML; el escape es inocuo en JS
const js = readFileSync('dist/bundle.js', 'utf8').replaceAll('</script', '<\\/script');
const css = readFileSync('src/styles.css', 'utf8');

const html = `<title>Biblioteca Tesseráctica — Interstellar 4D</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
${css}
</style>
<div id="root"></div>
<script>
${js}
</script>
`;

writeFileSync('dist/index.html', html);
console.log(`dist/index.html listo — ${(html.length / 1024).toFixed(0)} KB`);
