// Render determinista: N páginas de Chromium pintan fotogramas en paralelo y los
// vuelcan por tubería a ffmpeg (un fragmento por trabajador); después se concatenan.
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const OUT = process.env.OUT || require('path').join(__dirname, 'build');
const FPS = 30, WORKERS = +(process.env.WORKERS || 4);
const T0 = +(process.env.T0 || 0), T1 = +(process.env.T1 || 88.5), SCALE = +(process.env.SCALE || 1);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const f0 = Math.round(T0 * FPS), f1 = Math.round(T1 * FPS), total = f1 - f0, per = Math.ceil(total / WORKERS);
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--js-flags=--max-old-space-size=4096'] });
  const start = Date.now(); let done = 0;
  const parts = await Promise.all([...Array(WORKERS)].map(async (_, w) => {
    const a = f0 + w * per, b = Math.min(f1, a + per), file = path.join(OUT, `part${w}.mp4`);
    const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
    page.on('pageerror', e => console.log('[error]', e.message));
    await page.goto('file://' + path.join(__dirname, 'src/index.html'));
    await page.evaluate(() => window.ready);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-vf', SCALE === 1 ? 'format=yuv420p' : `scale=iw*${SCALE}:-2,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '13', '-g', '30', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const closed = new Promise(r => ff.on('close', r));
    for (let f = a; f < b; f++) {
      const url = await page.evaluate((t) => { renderFrame(t); return document.getElementById('c').toDataURL('image/jpeg', .97); }, f / FPS);
      if (!ff.stdin.write(Buffer.from(url.slice(23), 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
      if (++done % 150 === 0) console.log(`${done}/${total} fotogramas  (${((Date.now() - start) / 1000).toFixed(0)} s)`);
    }
    ff.stdin.end(); await closed; await page.close(); return file;
  }));
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'list.txt'), parts.map(p => `file '${p}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'list.txt'), '-c', 'copy', path.join(OUT, 'video.mp4')]);
  console.log('vídeo:', path.join(OUT, 'video.mp4'), `(${((Date.now() - start) / 1000).toFixed(0)} s)`);
})();
