/**
 * Renderiza el vídeo promocional: sirve el compositor, las fuentes y las tomas por HTTP local,
 * dibuja cada fotograma con `window.render(f)`, lo captura y monta el MP4 con la música.
 *
 *   node promo/renderizar.mjs --tomas=<carpeta> --fotogramas=<carpeta> --musica=<wav> [--salida=promo/campos-promo.mp4]
 *   node promo/renderizar.mjs --tomas=… --fotogramas=… --solo=0,60,120   (fotogramas sueltos, sin vídeo)
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const raiz = resolve('.');
const tomas = resolve(args.tomas);
const fotogramas = resolve(args.fotogramas);
const salida = resolve(args.salida ?? 'promo/campos-promo.mp4');
const solo = args.solo ? args.solo.split(',').map(Number) : null;
mkdirSync(fotogramas, { recursive: true });

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const RUTAS = [
  ['/promo/', join(raiz, 'promo')],
  ['/m/', join(raiz, 'node_modules')],
  ['/tomas/', tomas],
];
const servidor = http.createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const [prefijo, dir] of RUTAS) {
    if (!ruta.startsWith(prefijo)) continue;
    const archivo = join(dir, ruta.slice(prefijo.length));
    if (archivo.startsWith(dir) && existsSync(archivo) && statSync(archivo).isFile()) {
      res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' });
      createReadStream(archivo).pipe(res);
      return;
    }
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const puerto = servidor.address().port;

const navegador = await chromium.launch();
try {
  const page = await navegador.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  await page.goto(`http://127.0.0.1:${puerto}/promo/compositor.html`);
  const { fotogramas: total } = await page.evaluate(() => window.preparar());
  const lista = solo ?? Array.from({ length: total }, (_, i) => i);
  const t0 = Date.now();
  for (const f of lista) {
    await page.evaluate((n) => window.render(n), f);
    await page.screenshot({ path: join(fotogramas, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    if (f % 60 === 0) console.log(`fotograma ${f} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  if (errores.length) console.log('errores:', errores);
} finally {
  await navegador.close();
  servidor.close();
}

if (!solo) {
  // Dos pasadas a 10 Mb/s (1080p30 de calidad alta, ~25 MB): el grano y las estelas se llevan
  // muchos bits y un CRF fijo daba ~35 Mb/s.
  const comun = ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(fotogramas, '%04d.jpg')];
  const video = ['-c:v', 'libx264', '-preset', 'slow', '-tune', 'film', '-b:v', '10M', '-maxrate', '14M', '-bufsize', '20M', '-pix_fmt', 'yuv420p', '-profile:v', 'high'];
  const registro = join(fotogramas, 'x264-pasada');
  const pasos = [
    [...comun, ...video, '-pass', '1', '-passlogfile', registro, '-an', '-f', 'mp4', '/dev/null'],
    [...comun, '-i', resolve(args.musica), '-map', '0:v', '-map', '1:a', ...video, '-pass', '2', '-passlogfile', registro, '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', salida],
  ];
  for (const p of pasos) {
    const ff = spawnSync('ffmpeg', p, { stdio: 'inherit' });
    if (ff.status !== 0) process.exit(ff.status ?? 1);
  }
  console.log(`vídeo: ${salida}`);
}
