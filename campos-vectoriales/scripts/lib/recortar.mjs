/** Recorta una región de un PNG: node scripts/lib/recortar.mjs entrada.png salida.png x y ancho alto */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
const [entrada, salida, x, y, w, h] = process.argv.slice(2);
const src = PNG.sync.read(readFileSync(entrada));
const out = new PNG({ width: Number(w), height: Number(h) });
PNG.bitblt(src, out, Number(x), Number(y), Number(w), Number(h), 0, 0);
writeFileSync(salida, PNG.sync.write(out));
