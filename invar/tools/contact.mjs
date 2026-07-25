/* Hoja de contacto: monta todas las imágenes generadas en una sola lámina PNG
   para poder revisarlas de un vistazo.  node tools/contact.mjs */
import { chromium } from 'playwright';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const IMG = resolve(HERE, '../assets/img');
const files = readdirSync(IMG).filter((f) => f.endsWith('.webp') && !f.includes('@sm')).sort();

const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#111;
 display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px;font:11px monospace;color:#888">
${files.map((f) => `<figure style="margin:0"><img src="${f}" style="width:100%;display:block">
<figcaption>${f}</figcaption></figure>`).join('')}</body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
writeFileSync(resolve(IMG, '_contact.html'), html);
await page.goto('file://' + resolve(IMG, '_contact.html'));
await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => {}))));
await page.screenshot({ path: process.argv[2] || '/tmp/contact.png', fullPage: true });
await browser.close();
console.log('ok');
