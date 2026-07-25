/* =============================================================================
   INVAR · compilación a fichero único
   -----------------------------------------------------------------------------
   Produce una versión autocontenida del sitio: CSS, JavaScript e imágenes
   incrustados en un solo HTML que funciona con doble clic, sin carpeta
   `assets/` al lado y sin conexión.

     node tools/build-single.mjs

   Salidas:
     invar-portable.html        documento completo, para descargar y abrir con
                                doble clic (va versionado en el repositorio)
     dist/invar.artifact.html   solo el contenido, sin <html>/<head>/<body>,
                                para publicar como Artifact

   Las imágenes NO se copian de assets/: se vuelven a renderizar desde las
   mismas escenas a tamaños intermedios pensados para incrustar. Una sola
   fuente de verdad —tools/gen— y un fichero final que pesa lo razonable.
   ========================================================================== */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIST = resolve(ROOT, 'dist');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/* Tamaño de cada escena en la versión incrustada: entre 1,3× y 1,5× del
   tamaño al que se muestra, que es donde deja de notarse la diferencia. */
const IMAGES = {
  substrate: { scene: 'substrate', w: 1920, h: 1080, q: 0.78, opts: { seed: 7, focal: [0.66, 0.42] } },
  surface:   { scene: 'surface',   w: 1280, h: 853,  q: 0.80, opts: { seed: 55 } },
  topology:  { scene: 'topology',  w: 800,  h: 1000, q: 0.80, opts: { seed: 21 } },
  fiber:     { scene: 'fiber',     w: 1200, h: 800,  q: 0.80, opts: { seed: 88 } },
  layers:    { scene: 'layers',    w: 900,  h: 900,  q: 0.80, opts: { seed: 44 } },
  flow:      { scene: 'flow',      w: 1400, h: 788,  q: 0.78, opts: { seed: 33 } },
  ops:       { scene: 'ops',       w: 1600, h: 900,  q: 0.78, opts: { seed: 66 } },
  console:   { scene: 'console',   w: 1000, h: 750,  q: 0.80, opts: { seed: 77 } },
  veil:      { scene: 'veil',      w: 800,  h: 450,  q: 0.80, opts: { seed: 99 } },
};

/* ---------- 1 · renderizar las imágenes en memoria ------------------------ */

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => { console.error('  ! error de render:', e.message); process.exitCode = 1; });
await page.goto('file://' + resolve(HERE, 'gen/index.html'));

const dataURI = {};
for (const [name, job] of Object.entries(IMAGES)) {
  const b64 = await page.evaluate(
    ([scene, w, h, opts, q]) => window.renderScene(scene, w, h, { ...opts, quality: q }),
    [job.scene, job.w, job.h, job.opts, job.q]
  );
  dataURI[name] = `data:image/webp;base64,${b64}`;
  console.log(`  ${name.padEnd(10)} ${job.w}×${job.h}  ${(b64.length * 0.75 / 1024).toFixed(0)} kB`);
}
await browser.close();

/* ---------- 2 · CSS con la textura incrustada ----------------------------- */

let css = read('assets/css/site.css')
  .replace(/image-set\([^)]*\)/g, `url("${dataURI.veil}")`);

/* ---------- 3 · marcado: <img> a una sola fuente incrustada --------------- */

const html = read('index.html');
const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'INVAR'])[1];

let body = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'))
  // los <script> se vuelven a insertar en línea más abajo
  .replace(/\s*<script src="[^"]*"><\/script>/g, '');

body = body.replace(
  /<img\s+src="assets\/img\/([a-z]+)\.webp"[\s\S]*?>/g,
  (tag, name) => {
    if (!dataURI[name]) throw new Error(`falta la escena "${name}" en el manifiesto`);
    return tag
      .replace(/src="assets\/img\/[^"]*"/, `src="${dataURI[name]}"`)
      .replace(/\s+srcset="[^"]*"/, '')
      .replace(/\s+sizes="[^"]*"/, '');
  }
);

if (/assets\//.test(body)) {
  throw new Error('quedan referencias a assets/ en el marcado: ' +
    (body.match(/assets\/[^"' ]*/g) || []).join(', '));
}

/* ---------- 4 · JavaScript en línea, en el mismo orden ------------------- */

const js = [
  'assets/vendor/gsap.min.js',
  'assets/vendor/ScrollTrigger.min.js',
  'assets/vendor/lenis.min.js',
  'assets/js/field.js',
  'assets/js/sequence.js',
  'assets/js/app.js',
].map((f) => `/* ${f} */\n${read(f)}`).join('\n;\n');

/* ---------- 5 · escribir las dos salidas --------------------------------- */

mkdirSync(DIST, { recursive: true });

const inner = `<title>${title}</title>
<style>\n${css}\n</style>
${body}
<script>\n${js}\n</script>`;

const full = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${(html.match(/name="description" content="([^"]*)"/) || [, ''])[1]}">
<meta name="theme-color" content="#06080A">
${inner.replace(/^<title>/, '<title>')}
</head>
</html>`;

// el documento completo necesita el marcado dentro de <body>, no de <head>
const fullDoc = full
  .replace('<style>', '</head>\n<body>\n<style>')
  .replace('</head>\n</html>', '</body>\n</html>');

writeFileSync(resolve(ROOT, 'invar-portable.html'), fullDoc);
writeFileSync(resolve(DIST, 'invar.artifact.html'), inner);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' kB';
console.log(`\n  invar-portable.html       ${kb(fullDoc)}`);
console.log(`  dist/invar.artifact.html  ${kb(inner)}`);
