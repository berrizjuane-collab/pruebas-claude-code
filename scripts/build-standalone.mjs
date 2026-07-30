/**
 * Inlines the Vite build into a single self-contained HTML file.
 *
 * The output is byte-for-byte the same game as the deployed site — it just
 * carries its JS and CSS inside the document, so it can be pasted anywhere
 * (a Claude Artifact, a file:// page, an email attachment) and simply run.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const assets = join(dist, 'assets');

if (!existsSync(dist)) {
  console.error('dist/ no existe: ejecuta `vite build` primero.');
  process.exit(1);
}

const files = readdirSync(assets);
const jsFiles = files.filter((f) => f.endsWith('.js'));
const cssFiles = files.filter((f) => f.endsWith('.css'));

if (jsFiles.length !== 1) {
  console.error(`Se esperaba un único bundle JS, se encontraron ${jsFiles.length}:`, jsFiles);
  process.exit(1);
}

const js = readFileSync(join(assets, jsFiles[0]), 'utf8');
const css = cssFiles.map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#05030c" />
<title>NEON WRAITHS — Nexus-9</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2305030c'/%3E%3Cpath d='M8 24 L16 6 L24 24 L16 19 Z' fill='none' stroke='%233fe9ff' stroke-width='2.4'/%3E%3Ccircle cx='16' cy='14' r='2.4' fill='%23ff4fd8'/%3E%3C/svg%3E" />
<style>
${css}
</style>
</head>
<body>
<div id="stage">
  <canvas id="screen" width="960" height="540"></canvas>
  <div id="touch-ui" hidden></div>
  <div id="rotate-hint" hidden>Gira el dispositivo para jugar en horizontal</div>
</div>
<script type="module">
${js}
</script>
</body>
</html>
`;

const out = join(dist, 'neon-wraiths-standalone.html');
writeFileSync(out, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`✔ Artifact autocontenido: dist/neon-wraiths-standalone.html (${kb} KB)`);
