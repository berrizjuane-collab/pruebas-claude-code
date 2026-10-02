/**
 * Convierte la compilación de Vite en un único HTML autocontenido (RNF-14, D-15).
 *
 * - Incrusta el script de entrada (módulo ES) y la hoja de estilos.
 * - Las fuentes y el worker ya vienen incrustados por Vite (data URI y Blob).
 * - Escribe una CSP con la huella SHA-256 del script: el navegador bloquea cualquier
 *   otra ejecución y cualquier petición de red (`connect-src 'none'`).
 * - Comprueba que no queda ninguna referencia a archivos externos.
 *
 * Salida: dist/campos-vectoriales.html
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const entrada = join(dist, 'index.html');
const salida = join(dist, 'campos-vectoriales.html');

if (!existsSync(entrada)) {
  console.error('No existe dist/index.html: ejecuta `vite build` primero.');
  process.exit(1);
}

let html = readFileSync(entrada, 'utf8');

const reScript = /<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g;
const reEstilo = /<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/g;

const scripts = [...html.matchAll(reScript)];
const estilos = [...html.matchAll(reEstilo)];
if (scripts.length !== 1) {
  console.error(`Se esperaba un único script de entrada; hay ${scripts.length}.`);
  process.exit(1);
}

// `</script` dentro del código cerraría la etiqueta: se escapa (válido en JS: «<\/»).
const codigo = readFileSync(join(dist, scripts[0][1]), 'utf8').replace(/<\/script/gi, '<\\/script');
const huella = createHash('sha256').update(codigo, 'utf8').digest('base64');

html = html.replace(scripts[0][0], () => '');
for (const m of estilos) {
  const css = readFileSync(join(dist, m[1]), 'utf8').replace(/<\/style/gi, '<\\/style');
  html = html.replace(m[0], () => `<style>${css}</style>`);
}
// El módulo va al final del <body>: los módulos se difieren igualmente, y así el
// documento ya está analizado cuando se ejecuta.
html = html.replace('</body>', () => `<script type="module">${codigo}</script>\n  </body>`);

const csp = [
  "default-src 'none'",
  `script-src 'sha256-${huella}'`,
  'worker-src blob: data:',
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');
html = html.replace('<meta charset="UTF-8" />', () => `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);

// Ninguna referencia a archivos: solo se admiten data:, blob: y anclas.
const externas = [...html.matchAll(/\s(?:src|href)="(?!data:|blob:|#)([^"]+)"/g)].map((m) => m[1]);
if (externas.length) {
  console.error('Quedan referencias externas:', externas);
  process.exit(1);
}
if (/url\((?!["']?data:)[^)]*\)/.test(html.replace(/<script type="module">[\s\S]*<\/script>/, ''))) {
  console.error('Quedan url() externas en los estilos.');
  process.exit(1);
}

writeFileSync(salida, html);
const bytes = Buffer.byteLength(html);
const sha = createHash('sha256').update(html).digest('hex');
console.log(`HTML autocontenido: dist/campos-vectoriales.html · ${(bytes / 1024 / 1024).toFixed(2)} MB · sha256 ${sha}`);
