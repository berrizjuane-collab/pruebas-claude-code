import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [w,h,label] of [[390,844,'móvil'],[1440,900,'escritorio']]) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  let bytes = 0, reqs = 0;
  p.on('response', async (r) => { reqs++; try { bytes += (await r.body()).length; } catch {} });
  await p.goto('file:///home/user/pruebas-claude-code/invar/index.html', { waitUntil:'load' });
  await p.waitForTimeout(2500);
  const m = await p.evaluate(() => new Promise((res) => {
    let lcp = 0, cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) lcp = Math.max(lcp, e.startTime); })
      .observe({ type:'largest-contentful-paint', buffered:true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; })
      .observe({ type:'layout-shift', buffered:true });
    setTimeout(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime;
      res({ lcp: Math.round(lcp), cls: +cls.toFixed(4), fcp: Math.round(fcp||0),
            dcl: Math.round(nav.domContentLoadedEventEnd||0), nodes: document.querySelectorAll('*').length });
    }, 900);
  }));
  // fotogramas durante un scroll largo
  const fps = await p.evaluate(() => new Promise((res) => {
    let frames = 0; const t0 = performance.now();
    const tick = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
      else res(Math.round(frames / ((performance.now() - t0) / 1000))); };
    requestAnimationFrame(tick);
    const max = document.documentElement.scrollHeight - innerHeight;
    let y = 0; const iv = setInterval(() => { y += max / 60; window.scrollTo(0, y); if (y >= max) clearInterval(iv); }, 45);
  }));
  console.log(`${label} ${w}px · ${reqs} peticiones · ${(bytes/1024).toFixed(0)} kB · FCP ${m.fcp}ms · LCP ${m.lcp}ms · CLS ${m.cls} · nodos ${m.nodes} · ~${fps} fps durante scroll`);
  await p.close();
}
await b.close();
