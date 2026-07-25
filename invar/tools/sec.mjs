import { chromium } from 'playwright';
const [sel, w, h, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:+w, height:+(h||900)}, isMobile:+w<700, hasTouch:+w<900 });
await p.goto('file:///home/user/pruebas-claude-code/invar/index.html', {waitUntil:'load'});
await p.waitForTimeout(1200);
// recorre la página para disparar todos los reveals, luego vuelve a la sección
await p.evaluate(async () => {
  const max = document.documentElement.scrollHeight;
  for (let y = 0; y < max; y += window.innerHeight * 0.6) { window.scrollTo(0, y); await new Promise(r=>setTimeout(r,90)); }
});
await p.waitForTimeout(600);
await p.evaluate(([s, off]) => {
  const el = document.querySelector(s);
  const y = el.getBoundingClientRect().top + window.scrollY + (+off || 0);
  window.scrollTo(0, y);
}, [sel, process.argv[6]]);
await p.waitForTimeout(1400);
await p.screenshot({ path: out, fullPage:false });
await b.close();
