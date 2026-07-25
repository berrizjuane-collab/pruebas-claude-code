/* =============================================================================
   INVAR — pipeline de imagen
   -----------------------------------------------------------------------------
   Renderiza cada escena procedural en Chromium (canvas 2D) y la exporta a WebP
   en dos tamaños (srcset). Uso:  node tools/render.mjs [nombre...]
   ========================================================================== */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../assets/img');
mkdirSync(OUT, { recursive: true });

/** name = fichero de salida · scene = escena · w/h = tamaño grande */
const MANIFEST = [
  { name: 'substrate',    scene: 'substrate', w: 2560, h: 1440, small: 1280, opts: { seed: 7,  focal: [0.66, 0.42] } },
  { name: 'surface',      scene: 'surface',   w: 1800, h: 1200, small: 900,  opts: { seed: 55 } },
  { name: 'topology',     scene: 'topology',  w: 1200, h: 1500, small: 640,  opts: { seed: 21 } },
  { name: 'fiber',        scene: 'fiber',     w: 1800, h: 1200, small: 900,  opts: { seed: 88 } },
  { name: 'layers',       scene: 'layers',    w: 1400, h: 1400, small: 700,  opts: { seed: 44 } },
  { name: 'flow',         scene: 'flow',      w: 2000, h: 1125, small: 1000, opts: { seed: 33 } },
  { name: 'ops',          scene: 'ops',       w: 2400, h: 1350, small: 1200, opts: { seed: 66 } },
  { name: 'console',      scene: 'console',   w: 1600, h: 1200, small: 800,  opts: { seed: 77 } },
  { name: 'veil',         scene: 'veil',      w: 1600, h: 900,  small: 800,  opts: { seed: 99 } },
  { name: 'og',           scene: 'substrate', w: 1200, h: 630,  small: 0,    opts: { seed: 7, focal: [0.62, 0.46], levels: 40 } },
];

const only = process.argv.slice(2);
const jobs = only.length ? MANIFEST.filter((m) => only.includes(m.name)) : MANIFEST;

const browser = await chromium.launch({ args: ['--enable-gpu', '--disable-lcd-text'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.error('  ! page error:', e.message));
await page.goto('file://' + resolve(HERE, 'gen/index.html'));

for (const job of jobs) {
  const sizes = [[job.w, job.h, `${job.name}.webp`]];
  if (job.small) {
    sizes.push([job.small, Math.round((job.small * job.h) / job.w), `${job.name}@sm.webp`]);
  }
  for (const [w, h, file] of sizes) {
    const t0 = Date.now();
    const b64 = await page.evaluate(
      ([scene, w, h, opts]) => window.renderScene(scene, w, h, opts),
      [job.scene, w, h, job.opts]
    );
    const buf = Buffer.from(b64, 'base64');
    writeFileSync(resolve(OUT, file), buf);
    console.log(`  ${file.padEnd(22)} ${w}×${h}  ${(buf.length / 1024).toFixed(0)} kB  ${Date.now() - t0} ms`);
  }
}

await browser.close();
console.log('listo →', OUT);
