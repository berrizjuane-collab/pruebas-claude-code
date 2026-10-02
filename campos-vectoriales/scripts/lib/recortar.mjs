/**
 * Recorta una región de un PNG y, si se pide, la amplía sin suavizar (vecino más cercano):
 *   node scripts/lib/recortar.mjs entrada.png salida.png x y ancho alto [aumento]
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
const [entrada, salida, x, y, w, h, aumento = '1'] = process.argv.slice(2);
const src = PNG.sync.read(readFileSync(entrada));
const recorte = new PNG({ width: Number(w), height: Number(h) });
PNG.bitblt(src, recorte, Number(x), Number(y), Number(w), Number(h), 0, 0);
const k = Math.max(1, Math.round(Number(aumento)));
const out = new PNG({ width: recorte.width * k, height: recorte.height * k });
for (let j = 0; j < out.height; j++) {
  for (let i = 0; i < out.width; i++) {
    const o = 4 * (j * out.width + i);
    const s = 4 * (Math.floor(j / k) * recorte.width + Math.floor(i / k));
    for (let c = 0; c < 4; c++) out.data[o + c] = recorte.data[s + c];
  }
}
writeFileSync(salida, PNG.sync.write(out));
