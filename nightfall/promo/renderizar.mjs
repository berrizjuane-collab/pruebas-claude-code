/**
 * Renderiza el vídeo promocional: sirve el compositor, los recursos y las tomas por HTTP local,
 * dibuja cada fotograma a 60 fps con `window.render(f)`, lo captura y monta el MP4 con la música.
 * El vídeo final va a 30 fps: cada fotograma es la media de dos de 60 (desenfoque de movimiento
 * de obturador a 180°); los cortes caen en fotogramas pares, así que no se mezclan planos.
 *
 *   node nightfall/promo/renderizar.mjs --formato=9x16 --tomas=<carpeta> --fotogramas=<carpeta> --musica=<wav> [--salida=…]
 *   node nightfall/promo/renderizar.mjs --formato=16x9 --tomas=… --fotogramas=… --solo=0,120,…   (fotogramas sueltos)
 *   node nightfall/promo/renderizar.mjs --formato=9x16 --fotogramas=… --musica=… --codificar   (solo el MP4)
 */
import { createRequire } from 'node:module';
import { execSync, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync, readdirSync, rmSync } from 'node:fs';
import http from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function cargarPlaywright() {
  try { return require('playwright'); } catch { /* sin dependencia local */ }
  return require(join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium } = cargarPlaywright();

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const aqui = dirname(fileURLToPath(import.meta.url));
const formato = args.formato === '16x9' ? '16x9' : '9x16';
const [W, H] = formato === '16x9' ? [1920, 1080] : [1080, 1920];
const tomas = args.tomas ? resolve(args.tomas) : null;
const soloCodificar = 'codificar' in args;
const fotogramas = resolve(args.fotogramas, formato);
const salida = resolve(args.salida ?? join(aqui, `nightfall-promo-${formato}.mp4`));
const solo = args.solo ? args.solo.split(',').map(Number) : null;
const desde = Number(args.desde ?? 0);
mkdirSync(fotogramas, { recursive: true });

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const RUTAS = [['/tomas/', tomas], ['/', aqui]];
const servidor = http.createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const [prefijo, dir] of RUTAS) {
    if (!ruta.startsWith(prefijo)) continue;
    const archivo = join(dir, ruta.slice(prefijo.length));
    if (archivo.startsWith(dir) && existsSync(archivo) && statSync(archivo).isFile()) {
      res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=3600' });
      createReadStream(archivo).pipe(res);
      return;
    }
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const puerto = servidor.address().port;

const navegador = soloCodificar ? null : await chromium.launch({ args: ['--disable-gpu-vsync', '--hide-scrollbars'] });
if (navegador) try {
  const page = await navegador.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  await page.goto(`http://127.0.0.1:${puerto}/compositor.html?formato=${formato}`);
  const { fotogramas: total } = await page.evaluate(() => window.preparar());
  const lista = solo ?? Array.from({ length: total - desde }, (_, i) => i + desde);
  const t0 = Date.now();
  for (const f of lista) {
    await page.evaluate((n) => window.render(n), f);
    await page.screenshot({ path: join(fotogramas, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: W, height: H } });
    if (f % 120 === 0) console.log(`${formato} · fotograma ${f}/${total} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  if (errores.length) console.log('errores:', [...new Set(errores)].slice(0, 10));
} finally {
  await navegador.close();
}
servidor.close();

if (!solo) {
  // música a -14 LUFS (redes sociales), con medición previa para el loudnorm lineal
  const musica = resolve(args.musica);
  const medida = spawnSync('ffmpeg', ['-hide_banner', '-i', musica, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = JSON.parse(medida.stderr.slice(medida.stderr.lastIndexOf('{'), medida.stderr.lastIndexOf('}') + 1));
  const audio = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  // tblend deja cada par (2k, 2k+1) con la marca de tiempo del segundo, a medio camino de la rejilla de 30 fps:
  // setpts la fija en k/30 para que no se pierda ni se duplique ningún fotograma (900 exactos)
  const video = 'tblend=all_mode=average,framestep=2,setpts=N/(30*TB),scale=out_color_matrix=bt709:out_range=tv,format=yuv420p';
  const comun = ['-y', '-loglevel', 'error', '-framerate', '60', '-i', join(fotogramas, '%04d.jpg')];
  const x264 = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-b:v', '9M', '-maxrate', '13M', '-bufsize', '18M', '-r', '30', '-g', '60',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
  const registro = join(fotogramas, 'x264-pasada');
  const pasos = [
    [...comun, '-vf', video, ...x264, '-pass', '1', '-passlogfile', registro, '-an', '-f', 'mp4', '/dev/null'],
    [...comun, '-i', musica, '-map', '0:v', '-map', '1:a', '-vf', video, ...x264, '-pass', '2', '-passlogfile', registro,
      '-af', audio, '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-t', '30', '-movflags', '+faststart', salida],
  ];
  for (const p of pasos) {
    const ff = spawnSync('ffmpeg', p, { stdio: 'inherit' });
    if (ff.status !== 0) process.exit(ff.status ?? 1);
  }
  for (const f of readdirSync(fotogramas)) if (f.startsWith('x264-pasada')) rmSync(join(fotogramas, f));
  console.log(`vídeo: ${salida}`);
}
