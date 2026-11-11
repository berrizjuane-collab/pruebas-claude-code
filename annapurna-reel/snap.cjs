// Fotogramas sueltos para revisar el diseño: node snap.mjs 1.5 4.2 ...  -> build/snap_*.jpg
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
const out = process.env.OUT || require('path').join(__dirname, 'build/snaps');
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('console', m => console.log('[page]', m.text()));
p.on('pageerror', e => console.log('[error]', e.message));
await p.goto('file://' + process.cwd() + '/src/index.html');
const t0 = Date.now();
await p.evaluate(() => window.ready);
console.log('init', Date.now() - t0, 'ms');
const scale = parseFloat(process.env.SCALE || '0.5');
for (const a of process.argv.slice(2)) {
  const t = parseFloat(a), s = Date.now();
  const url = await p.evaluate(({ t, scale }) => { renderFrame(t); const c = document.createElement('canvas'); c.width = 1080 * scale; c.height = 1920 * scale; c.getContext('2d').drawImage(document.getElementById('c'), 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .9); }, { t, scale });
  fs.writeFileSync(`${out}/snap_${a.padStart(5, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(a, Date.now() - s, 'ms');
}
await b.close();
})();
