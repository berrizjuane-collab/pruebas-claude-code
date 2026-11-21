const { chromium } = require('playwright');
(async () => {
  const [,, mode, ...stops] = process.argv;
  const mobile = mode === 'm';
  const browser = await chromium.launch({ args: [...(process.env.NOGL ? ['--disable-3d-apis'] : []), '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.goto('http://localhost:8765/test.html', { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  const info = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, gl: !document.getElementById('stage').hidden,
    secs: [...document.querySelectorAll('main>section')].map(s => [s.id, Math.round(s.getBoundingClientRect().top + scrollY), s.offsetHeight]) }));
  console.log(JSON.stringify(info));
  for (const st of stops) {
    let y;
    if (st.includes(':')) { const [id, off] = st.split(':'); y = await page.evaluate(([id, off]) => document.getElementById(id).getBoundingClientRect().top + scrollY + innerHeight * parseFloat(off), [id, off]); }
    else y = parseFloat(st);
    await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(1600);
    const name = `shots/${mode}_${st.replace(/[:.]/g, '_')}.png`;
    await page.screenshot({ path: name });
    console.log('shot', name, Math.round(y));
  }
  console.log(logs.slice(0, 20).join('\n'));
  await browser.close();
})();
