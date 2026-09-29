// TRAZA · Renderizador fotograma a fotograma.
//
//   node tools/render.mjs --stills 0.5,3.2,6.4 [--out carpeta]      PNG sueltos (revisión)
//   node tools/render.mjs --cues tools/cues.json                     marcas para el audio
//   node tools/render.mjs --frames carpeta [--jobs 3] [--range a,b]  fotogramas con desenfoque
//   node tools/render.mjs --encode salida.mp4 --frames carpeta [--audio pista.wav]
//
// La animación es determinista: la página expone window.__seek(t). Cada
// fotograma promedia N submuestras dentro de un obturador de 180° (desenfoque
// de movimiento real); en los tramos rápidos (window.__fast) se usan más.
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright', 'playwright-core'];
  try { tries.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/playwright'); } catch { /* sin npm global */ }
  for (const t of tries) { if (!t) continue; try { return require(t); } catch { /* siguiente */ } }
  throw new Error('No encuentro Playwright: instálalo con «npm i -D playwright».');
}
const { chromium } = loadPlaywright();

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const pageUrl = pathToFileURL(resolve(here, '../src/promo.html')).href + '?render';
const fps = Number(args.fps || 60);
const LO = Number(args.samples || 8), HI = Number(args.fast || 16), SHUTTER = 0.5;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const run = (cmd, a) => new Promise((res, rej) => {
  const p = spawn(cmd, a, { stdio: ['ignore', 'inherit', 'inherit'] });
  p.on('close', c => (c === 0 ? res() : rej(new Error(cmd + ' ' + c))));
});

if (args.encode) {
  // Solo codifica: PNG (sRGB) → H.264 BT.709 + AAC.
  const dir = resolve(args.frames);
  const a = ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', resolve(dir, 'f%04d.png')];
  if (args.audio) a.push('-i', resolve(args.audio));
  a.push('-map', '0:v');
  if (args.audio) a.push('-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  a.push('-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow',
    '-crf', String(args.crf || 16), '-tune', 'animation', '-profile:v', 'high', '-color_primaries', 'bt709',
    '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', resolve(args.encode));
  await run(ffmpeg, a);
  console.log('video →', args.encode);
  process.exit(0);
}

const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
async function openPage() {
  const p = await ctx.newPage();
  await p.goto(pageUrl);
  await p.evaluate(() => window.__ready);
  return p;
}
const page = await openPage();
const dur = await page.evaluate(() => window.__dur);
async function shot(p, t) {
  await p.evaluate(tt => window.__seek(tt), t);
  return p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
}

if (args.cues) {
  const cues = await page.evaluate(() => window.__cues);
  writeFileSync(resolve(args.cues), JSON.stringify({ dur, cues }, null, 1));
  console.log('cues →', args.cues, cues.length);
}

if (args.stills) {
  const out = resolve(args.out || resolve(here, '../.stills'));
  mkdirSync(out, { recursive: true });
  for (const s of String(args.stills).split(',')) {
    const t = Number(s);
    writeFileSync(resolve(out, `t${t.toFixed(2).padStart(5, '0')}.png`), await shot(page, t));
  }
  console.log('stills →', out);
}

if (args.frames) {
  const out = resolve(args.frames);
  mkdirSync(out, { recursive: true });
  const fast = await page.evaluate(() => window.__fast || []);
  const [r0, r1] = args.range ? String(args.range).split(',').map(Number) : [0, dur];
  const first = Math.round(r0 * fps), last = Math.round(r1 * fps);
  const spf = f => (fast.some(([a, b]) => f / fps >= a - 1 / fps && f / fps <= b + 1 / fps) ? HI : LO);
  // Bloques de fotogramas consecutivos con el mismo número de submuestras.
  const chunks = [];
  for (let f = first; f < last;) {
    const s = spf(f);
    let g = f;
    while (g < last && spf(g) === s && g - f < 40) g++;
    chunks.push({ f0: f, f1: g, s });
    f = g;
  }
  const jobs = Math.max(1, Number(args.jobs || 3));
  const pages = [page];
  for (let j = 1; j < jobs; j++) pages.push(await openPage());
  const t0 = Date.now();
  let next = 0, done = 0;
  const total = last - first;
  await Promise.all(pages.map(async p => {
    while (next < chunks.length) {
      const c = chunks[next++];
      const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps * c.s), '-i', '-',
        '-vf', `tmix=frames=${c.s},select='not(mod(n+1\\,${c.s}))'`, '-fps_mode', 'passthrough',
        '-start_number', String(c.f0), resolve(out, 'f%04d.png')], { stdio: ['pipe', 'inherit', 'inherit'] });
      const closed = new Promise((res, rej) => ff.on('close', code => (code === 0 ? res() : rej(new Error('ffmpeg ' + code)))));
      const write = buf => new Promise(res => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res)));
      for (let f = c.f0; f < c.f1; f++) {
        for (let s = 0; s < c.s; s++) {
          const off = c.s > 1 ? ((s + 0.5) / c.s - 0.5) * SHUTTER : 0;
          await write(await shot(p, Math.min(dur, Math.max(0, (f + off) / fps))));
        }
      }
      ff.stdin.end();
      await closed;
      done += c.f1 - c.f0;
      process.stdout.write(`\r  ${done}/${total} fotogramas · ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
    }
  }));
  console.log(`\nfotogramas → ${out}`);
}

await browser.close();
