// Ensambla traza/index.html: un único archivo con CSS, JS, fuentes y bibliotecas
// incorporadas. Uso: node traza/tools/build.mjs   (sin dependencias externas)
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

const fontFace = `@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url(data:font/woff2;base64,${b64('../vendor/fonts/InterVariable-traza.woff2')}) format("woff2");
}
`;

const css = `<style>
/* Inter 4.1 (subconjunto variable 400–700) · © The Inter Project Authors · SIL Open Font License 1.1 */
${fontFace}
${read('../src/styles.css')}</style>`;

const jspdf = read('../vendor/jspdf/jspdf.umd.min.js').replace(/\n\/\/# sourceMappingURL=.*$/m, '');
const autotable = read('../vendor/jspdf/jspdf.plugin.autotable.min.js').replace(/\n\/\/# sourceMappingURL=.*$/m, '');
const cmap = JSON.parse(read('../vendor/fonts/pdf-cmap.json'));

const vendor = [
  '<!-- Bibliotecas incorporadas, inactivas hasta exportar el PDF (se ejecutan bajo demanda). -->',
  '<!-- jsPDF 4.2.1 · MIT · https://github.com/parallax/jsPDF -->',
  `<script type="text/plain" id="vendor-jspdf">${inlineSafe(jspdf, 'jsPDF')}</script>`,
  '<!-- jsPDF-AutoTable 5.0.8 · MIT · https://github.com/simonbengtsson/jsPDF-AutoTable -->',
  `<script type="text/plain" id="vendor-autotable">${inlineSafe(autotable, 'AutoTable')}</script>`,
  '<!-- Inter 4.1 Regular y Bold en TTF (subconjunto con cifras tabulares) para el PDF · SIL OFL 1.1 -->',
  `<script type="text/plain" id="font-inter-regular">${b64('../vendor/fonts/Inter-Regular-traza.ttf')}</script>`,
  `<script type="text/plain" id="font-inter-bold">${b64('../vendor/fonts/Inter-Bold-traza.ttf')}</script>`,
].join('\n');

const js = MODULES.map((f) => `/* ---- ${f} ---- */\n${read('../src/' + f)}`).join('\n');
const script = `<script>
/* TRAZA ${JSON.parse(read('../package.json')).version} · Las finanzas con claridad. */
${inlineSafe(js, 'app')}
TRAZA.pdfCmap = ${JSON.stringify(cmap)};
</script>`;

const licenses = [
  '<p>Inter 4.1 — © The Inter Project Authors. Distribuida bajo SIL Open Font License 1.1 (incorporada en la interfaz y en el PDF).</p>',
  `<pre>${esc(read('../vendor/fonts/OFL.txt'))}</pre>`,
  '<p>jsPDF 4.2.1 — licencia MIT.</p>',
  `<pre>${esc(read('../vendor/jspdf/LICENSE-jspdf.txt'))}</pre>`,
  '<p>jsPDF-AutoTable 5.0.8 — licencia MIT.</p>',
  `<pre>${esc(read('../vendor/jspdf/LICENSE-jspdf-autotable.txt'))}</pre>`,
].join('\n');

let html = read('../src/template.html');
const slots = {
  '<!--INJECT:STYLE-->': css,
  '<!--INJECT:LICENSES-->': licenses,
  '<!--INJECT:VENDOR-->': vendor,
  '<!--INJECT:SCRIPT-->': script,
};
for (const [slot, content] of Object.entries(slots)) {
  if (!html.includes(slot)) throw new Error('Falta el marcador ' + slot);
  html = html.replace(slot, () => content);
}
html = html.replace('<!doctype html>', '<!doctype html>\n<!-- TRAZA · archivo generado por traza/tools/build.mjs desde traza/src; edita las fuentes y vuelve a construir. -->');

writeFileSync(at('../index.html'), html);
const size = statSync(at('../index.html')).size;
console.log(`traza/index.html · ${(size / 1024).toFixed(1)} KB (${(size / 1048576).toFixed(2)} MB)`);
