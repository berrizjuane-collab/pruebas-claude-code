// Renderiza maqueta/libro.html a PDF con Chromium (un pliego con sangrado por página)
// y guarda las medidas de cada caja para la verificación automática.
// Uso: node herramientas/renderizar.js maqueta/libro.html salida/_pliegos.pdf maqueta/medidas.json
const path = require("path");
const fs = require("fs");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(require("child_process").execSync("npm root -g").toString().trim(), "playwright"))); }

(async () => {
  const [, , html, pdf, medidas] = process.argv;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.resolve(html), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  // Medidas en mm respecto al corte de cada doble página
  const datos = await page.evaluate(() => {
    const PX = 96 / 25.4;
    const out = [];
    const fuentes = [...document.fonts].filter(f => f.status === "loaded").map(f => `${f.family} ${f.weight} ${f.style}`);
    for (const s of document.querySelectorAll("section.pliego")) {
      const c = s.querySelector(".corte").getBoundingClientRect();
      const cajas = [];
      for (const el of s.querySelectorAll("[data-caja]")) {
        const r = el.getBoundingClientRect();
        // Extensión de la tinta del texto: rectángulos de cada nodo de texto (no las cajas de papel)
        const rects = [];
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          if (!n.textContent.trim()) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          for (const q of rg.getClientRects()) if (q.width > 0.3 && q.height > 0.3) rects.push(q);
        }
        const tr = rects.length ? rects.reduce((a, q) => ({ left: Math.min(a.left, q.left), top: Math.min(a.top, q.top), right: Math.max(a.right, q.right), bottom: Math.max(a.bottom, q.bottom) }),
                                               { left: 1e9, top: 1e9, right: -1e9, bottom: -1e9 }) : r;
        cajas.push({
          tipo: el.dataset.caja, solapa: el.hasAttribute("data-solapa"), exento: el.hasAttribute("data-exento"),
          clase: el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className,
          texto: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60),
          x0: (r.left - c.left) / PX, y0: (r.top - c.top) / PX, x1: (r.right - c.left) / PX, y1: (r.bottom - c.top) / PX,
          tx0: (tr.left - c.left) / PX, ty0: (tr.top - c.top) / PX, tx1: (tr.right - c.left) / PX, ty1: (tr.bottom - c.top) / PX,
          desborde: el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflow !== "visible",
        });
      }
      const imgs = [...s.querySelectorAll("img")].map(i => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0,
        wmm: i.getBoundingClientRect().width / PX, nat: i.naturalWidth }));
      out.push({ paginas: s.dataset.paginas, nombre: s.dataset.nombre, tipo: s.dataset.tipo, cajas, imgs });
    }
    return { fuentes, pliegos: out };
  });
  fs.writeFileSync(medidas, JSON.stringify(datos, null, 1));

  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  await browser.close();
  console.log("PDF:", pdf, (fs.statSync(pdf).size / 1048576).toFixed(1) + " MB");
})();
