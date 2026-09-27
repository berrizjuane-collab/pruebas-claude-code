// Ensambla traza/index.html: un único archivo con CSS, JS, fuentes, emblema y
// bibliotecas incorporadas. Uso: node traza/tools/build.mjs   (sin dependencias externas)
// «TRAZA» sigue siendo el nombre interno del proyecto (carpeta y espacio de nombres
// de JavaScript); todo lo visible usa la marca VÉRTICE.
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const at = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(at(p), 'utf8');
const b64 = (p) => readFileSync(at(p)).toString('base64');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Un <script> inline termina en "</script": se neutraliza cualquier aparición. */
function inlineSafe(code, name) {
  const fixed = code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  if (fixed !== code) console.warn(`[build] secuencias neutralizadas en ${name}`);
  return fixed;
}

const MODULES = ['config.js', 'engine.js', 'format.js', 'inputs.js', 'charts.js', 'analysis.js', 'csv.js', 'pdf.js', 'app.js'];

/* Sustitutos abiertos de Segoe UI y Georgia (ver tools/build_fonts.py). La pila de
   fuentes de styles.css prefiere las originales cuando están instaladas. */
const FACES = [
  ['VerticeSans', 400, 'VerticeSans-Regular.woff2'],
  ['VerticeSans', 600, 'VerticeSans-SemiBold.woff2'],
  ['VerticeSerif', 400, 'VerticeSerif-Regular.woff2'],
];
const fontFaces = FACES.map(([family, weight, file]) => `@font-face {
  font-family: "${family}";
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(data:font/woff2;base64,${b64('../vendor/fonts/' + file)}) format("woff2");
}`).join('\n');

/* Emblema original de la guía de marca (no se reconstruye): una sola copia en CSS
   que usan el encabezado, el pie y, leída desde JS, el informe PDF. */
const emblem = `:root { --emblem: url("data:image/png;base64,${b64('../vendor/brand/vertice-emblema.png')}"); }`;
const favicon = `data:image/png;base64,${b64('../vendor/brand/vertice-favicon.png')}`;

const css = `<style>
/* VerticeSans = Noto Sans 2.015 (© The Noto Project Authors) con flechas y operadores de Inter 4.1 (© The Inter Project Authors);
   VerticeSerif = Gelasio 1.008 (© The Gelasio Project Authors). Todas bajo SIL Open Font License 1.1; familias renombradas por ser subconjuntos modificados. */
${fontFaces}
${emblem}
${read('../src/styles.css')}</style>`;

const jspdf = read('../vendor/jspdf/jspdf.umd.min.js').replace(/\n\/\/# sourceMappingURL=.*$/m, '');
const autotable = read('../vendor/jspdf/jspdf.plugin.autotable.min.js').replace(/\n\/\/# sourceMappingURL=.*$/m, '');
const cmap = JSON.parse(read('../vendor/fonts/pdf-cmap.json'));
if (!Array.isArray(cmap.sans) || !Array.isArray(cmap.serif)) throw new Error('pdf-cmap.json debe tener las listas "sans" y "serif"');

const vendor = [
  '<!-- Bibliotecas incorporadas, inactivas hasta exportar el PDF (se ejecutan bajo demanda). -->',
  '<!-- jsPDF 4.2.1 · MIT · https://github.com/parallax/jsPDF -->',
  `<script type="text/plain" id="vendor-jspdf">${inlineSafe(jspdf, 'jsPDF')}</script>`,
  '<!-- jsPDF-AutoTable 5.0.8 · MIT · https://github.com/simonbengtsson/jsPDF-AutoTable -->',
  `<script type="text/plain" id="vendor-autotable">${inlineSafe(autotable, 'AutoTable')}</script>`,
  '<!-- VerticeSans Regular y SemiBold, VerticeSerif Regular en TTF (subconjuntos) para el PDF · SIL OFL 1.1 -->',
  `<script type="text/plain" id="font-vsans-regular">${b64('../vendor/fonts/VerticeSans-Regular.ttf')}</script>`,
  `<script type="text/plain" id="font-vsans-semibold">${b64('../vendor/fonts/VerticeSans-SemiBold.ttf')}</script>`,
  `<script type="text/plain" id="font-vserif-regular">${b64('../vendor/fonts/VerticeSerif-Regular.ttf')}</script>`,
].join('\n');

const js = MODULES.map((f) => `/* ---- ${f} ---- */\n${read('../src/' + f)}`).join('\n');
const script = `<script>
/* VÉRTICE ${JSON.parse(read('../package.json')).version} · El valor correcto. En la fecha correcta. */
${inlineSafe(js, 'app')}
TRAZA.pdfCmap = ${JSON.stringify(cmap)};
</script>`;

const licenses = [
  '<p>VerticeSans — subconjunto modificado de Noto Sans 2.015 (© The Noto Project Authors), con flechas y operadores tomados de Inter 4.1. Distribuida bajo SIL Open Font License 1.1 (incorporada en la interfaz y en el PDF).</p>',
  `<pre>${esc(read('../vendor/fonts/OFL-NotoSans.txt'))}</pre>`,
  '<p>Inter 4.1 — © The Inter Project Authors. SIL Open Font License 1.1 (solo los glifos tomados para VerticeSans).</p>',
  `<pre>${esc(read('../vendor/fonts/OFL-Inter.txt'))}</pre>`,
  '<p>VerticeSerif — subconjunto de Gelasio 1.008 (© The Gelasio Project Authors). Distribuida bajo SIL Open Font License 1.1 (incorporada en la interfaz y en el PDF).</p>',
  `<pre>${esc(read('../vendor/fonts/OFL-Gelasio.txt'))}</pre>`,
  '<p>jsPDF 4.2.1 — licencia MIT.</p>',
  `<pre>${esc(read('../vendor/jspdf/LICENSE-jspdf.txt'))}</pre>`,
  '<p>jsPDF-AutoTable 5.0.8 — licencia MIT.</p>',
  `<pre>${esc(read('../vendor/jspdf/LICENSE-jspdf-autotable.txt'))}</pre>`,
].join('\n');

let html = read('../src/template.html');
const slots = {
  '{{FAVICON}}': favicon,
  '<!--INJECT:STYLE-->': css,
  '<!--INJECT:LICENSES-->': licenses,
  '<!--INJECT:VENDOR-->': vendor,
  '<!--INJECT:SCRIPT-->': script,
};
for (const [slot, content] of Object.entries(slots)) {
  if (!html.includes(slot)) throw new Error('Falta el marcador ' + slot);
  html = html.replace(slot, () => content);
}
html = html.replace('<!doctype html>', '<!doctype html>\n<!-- VÉRTICE · archivo generado por traza/tools/build.mjs desde traza/src; edita las fuentes y vuelve a construir. -->');

writeFileSync(at('../index.html'), html);
const size = statSync(at('../index.html')).size;
console.log(`traza/index.html · ${(size / 1024).toFixed(1)} KB (${(size / 1048576).toFixed(2)} MB)`);
