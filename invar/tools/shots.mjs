/* Capturas de revisión: recorre la página a varios anchos y guarda vistas.
   node tools/shots.mjs [carpeta] [ancho1,ancho2,...]                        */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = 'file://' + resolve(HERE, '../index.html');
const OUT = process.argv[2] || '/tmp/shots';
const WIDTHS = (process.argv[3] || '375,768,1024,1440,1920').split(',').map(Number);
const STOPS = [0, 0.06, 0.16, 0.26, 0.34, 0.42, 0.5, 0.58, 0.68, 0.78, 0.88, 0.97];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const w of WIDTHS) {
  const h = w < 700 ? 812 : w < 1100 ? 1024 : 900;
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    isMobile: w < 700,
    hasTouch: w < 900,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1800);

  const doc = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let i = 0; i < STOPS.length; i++) {
    await page.evaluate((p) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, max * p);
    }, STOPS[i]);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${w}-${String(i).padStart(2, '0')}.png` });
  }

  // desbordamiento horizontal: el fallo más caro y el más fácil de detectar
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    const bad = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > de.clientWidth + 2 || r.left < -2)) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') return;
        bad.push(el.tagName + '.' + (el.className.toString().slice(0, 40)) +
                 ' [' + Math.round(r.left) + '→' + Math.round(r.right) + ']');
      }
    });
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, bad: bad.slice(0, 12) };
  });
  console.log(`\n── ${w}px  doc=${doc}px  scrollW=${overflow.scrollW} clientW=${overflow.clientW}`);
  if (overflow.bad.length) console.log('   desborda:', overflow.bad.join('\n             '));
  if (errors.length) console.log('   errores:', [...new Set(errors)].join(' | '));
  await page.close();
}
await browser.close();
console.log('\nlisto →', OUT);
