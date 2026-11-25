// Imprime book.html a PDF con Chromium y realiza el control de calidad tipográfico en la propia página.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const here = __dirname;
  const out = process.argv[2] || path.join(here, 'out', 'base.pdf');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(here, 'book.html'), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  const qa = await page.evaluate(() => {
    const MM = 96 / 25.4;
    const res = { overflow: [], shortLines: [], safety: [], fontsLoaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight + ' ' + f.style) };
    const pages = [...document.querySelectorAll('section.page')];
    pages.forEach(pg => {
      const folio = +pg.dataset.folio;
      const pr = pg.getBoundingClientRect();
      const recto = pg.classList.contains('recto');
      // 1) desbordes de cada módulo de la retícula
      pg.querySelectorAll('.block > div').forEach(area => {
        const ar = area.getBoundingClientRect();
        let maxB = ar.bottom, maxR = ar.right;
        area.querySelectorAll('*').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          maxB = Math.max(maxB, r.bottom); maxR = Math.max(maxR, r.right);
        });
        const over = (maxB - ar.bottom) / MM, overR = (maxR - ar.right) / MM;
        if (over > 0.6 || overR > 0.6) res.overflow.push({ folio, cls: area.className, down_mm: +over.toFixed(1), right_mm: +overR.toFixed(1) });
      });
      // 2) zona de seguridad: ningún texto a menos de 5 mm del corte ni a menos de 15 mm del lomo
      const walker = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (el.closest('.tab') || el.closest('.sk-wrap') || el.closest('.mp')) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) {
          const x0 = (r.left - pr.left) / MM - 3, x1 = (r.right - pr.left) / MM - 3;
          const y0 = (r.top - pr.top) / MM - 3, y1 = (r.bottom - pr.top) / MM - 3;
          const trimW = 215.9, trimH = 279.4;
          const inner = recto ? x0 : trimW - x1;      // distancia al lomo
          const outer = recto ? trimW - x1 : x0;      // distancia al corte
          if (y0 < 5 || trimH - y1 < 5 || outer < 5 || inner < 15)
            res.safety.push({ folio, text: n.textContent.trim().slice(0, 30), inner: +inner.toFixed(1), outer: +outer.toFixed(1), top: +y0.toFixed(1), bottom: +(trimH - y1).toFixed(1) });
        }
      }
      // 3) líneas finales demasiado cortas («viudas» de párrafo) y párrafos de una línea huérfana
      pg.querySelectorAll('.body p, .card p, .nota p, .ct p, .logline, .rquote blockquote, .kv-quote blockquote, .specs dd, .legal p, .how li').forEach(p => {
        const rg = document.createRange(); rg.selectNodeContents(p);
        const rects = [...rg.getClientRects()].filter(r => r.width > 0.5);
        if (!rects.length) return;
        const lines = [];
        rects.forEach(r => {
          const l = lines.find(L => Math.abs(L.top - r.top) < 3);
          if (l) { l.left = Math.min(l.left, r.left); l.right = Math.max(l.right, r.right); }
          else lines.push({ top: r.top, left: r.left, right: r.right });
        });
        lines.sort((a, b) => a.top - b.top);
        if (lines.length < 2) return;
        const measure = p.getBoundingClientRect().width;
        const last = lines[lines.length - 1];
        const w = (last.right - last.left);
        const txt = p.innerText.trim(); const lastWords = txt.split(/\s+/);
        if (w / measure < 0.16) res.shortLines.push({ folio, cls: p.className || p.parentElement.className, lines: lines.length, last_pct: Math.round(100 * w / measure), end: lastWords.slice(-2).join(' ') });
      });
    });
    return res;
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(path.join(here, 'qa_render.json'), JSON.stringify(qa, null, 1));
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
  await browser.close();
  console.log('pdf', out, '| desbordes', qa.overflow.length, '| líneas cortas', qa.shortLines.length, '| zona de seguridad', qa.safety.length, '| fuentes', qa.fontsLoaded.length);
})();
