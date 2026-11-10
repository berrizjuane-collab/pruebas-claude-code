// Renderiza la animación a MP4: Chromium (Playwright) captura cada cuadro y ffmpeg lo codifica.
//   node render.mjs                 → un-area-dos-mundos.mp4 (1920×1080, 60 fps)
//   node render.mjs --shots 3,12.5  → PNGs sueltos en ./shots (para revisar cuadros)
//   FPS=30 WORKERS=4 node render.mjs
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright'); // respeta NODE_PATH (instalación global)
const ROOT = dirname(fileURLToPath(import.meta.url));
const FPS = +process.env.FPS || 60, WORKERS = +process.env.WORKERS || 4;
const OUT = process.env.OUT || join(ROOT, 'un-area-dos-mundos.mp4');
const TMP = process.env.TMP_DIR || join(ROOT, '.render-tmp');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

const server = createServer(async (req, res) => {
  try {
    const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(await readFile(p));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const URL_ = `http://127.0.0.1:${server.address().port}/index.html?render=1`;

const browser = await chromium.launch();
async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(URL_);
  await page.evaluate(() => window.__ready);
  return page;
}

const si = process.argv.indexOf('--shots');
if (si > 0) {
  const dir = process.env.SHOTS || join(ROOT, 'shots');
  await mkdir(dir, { recursive: true });
  const page = await openPage();
  for (const t of process.argv[si + 1].split(',').map(Number)) {
    await page.evaluate(t => window.__seek(t), t);
    await page.screenshot({ path: join(dir, `t${t.toFixed(2).padStart(6, '0')}.png`) });
  }
} else {
  const page0 = await openPage();
  const total = Math.round((await page0.evaluate(() => window.__DUR)) * FPS);
  await page0.close();
  await mkdir(TMP, { recursive: true });
  const per = Math.ceil(total / WORKERS);
  let done = 0;
  const tick = setInterval(() => console.log(`${done}/${total} cuadros`), 15000);
  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    const a = w * per, b = Math.min(total, a + per);
    const page = await openPage();
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-vf', 'scale=in_range=pc:out_range=tv', '-g', String(FPS * 2), join(TMP, `seg${w}.mp4`)],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    const closed = new Promise(r => ff.on('close', r));
    for (let i = a; i < b; i++) {
      await page.evaluate(t => window.__seek(t), i / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 97 }); // PNG a 1080p cuesta ~0,5 s por cuadro
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      done++;
    }
    ff.stdin.end(); await closed; await page.close();
  }));
  clearInterval(tick);
  await writeFile(join(TMP, 'list.txt'), Array.from({ length: WORKERS }, (_, w) => `file 'seg${w}.mp4'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(TMP, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', OUT]);
  await rm(TMP, { recursive: true, force: true });
  console.log('listo →', OUT);
}
await browser.close();
server.close();
