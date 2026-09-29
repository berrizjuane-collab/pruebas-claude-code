// TRAZA · Empaqueta la animación en un único HTML autocontenido
// (tipografía y audio incrustados en base64, igual que el propio TRAZA).
//   node tools/build.mjs [audio.m4a] [salida.html]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../src/promo.html');
const audio = resolve(process.argv[2] || resolve(here, '../traza-promo.m4a'));
const out = resolve(process.argv[3] || resolve(here, '../traza-promo.html'));

let html = readFileSync(src, 'utf8');
const font = readFileSync(resolve(here, '../src/inter.woff2')).toString('base64');
html = html.replace('url("inter.woff2")', `url(data:font/woff2;base64,${font})`);
if (existsSync(audio)) {
  const b64 = readFileSync(audio).toString('base64');
  html = html.replace('<script>', `<audio id="sfx" preload="auto" src="data:audio/mp4;base64,${b64}"></audio>\n<script>`);
}
writeFileSync(out, html);
console.log(`html → ${out} (${(html.length / 1024).toFixed(0)} KB)`);
