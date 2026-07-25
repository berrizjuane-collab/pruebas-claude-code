import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
// ruta a axe-core: pásala como argumento o instala el paquete (npm i axe-core)
const AXE = process.argv[2] || 'node_modules/axe-core/axe.min.js';
if (!existsSync(AXE)) {
  console.error(`No encuentro axe-core en "${AXE}".\n` +
    'Instálalo (npm i axe-core) o pasa la ruta: node tools/a11y.mjs ruta/axe.min.js');
  process.exit(1);
}
const b = await chromium.launch();
for (const [w, h] of [[375, 812], [1440, 900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto('file:///home/user/pruebas-claude-code/invar/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  // recorre la página para que todo esté revelado antes de auditar
  await p.evaluate(async () => {
    const max = document.documentElement.scrollHeight;
    for (let y = 0; y < max; y += window.innerHeight * 0.7) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(800);
  await p.addScriptTag({ path: AXE });
  const res = await p.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length,
      help: v.help, sample: v.nodes.slice(0,3).map(n => n.html.slice(0,110)) }));
  });
  console.log(`\n═══ ${w}px — ${res.length} violaciones`);
  for (const v of res) console.log(` [${v.impact}] ${v.id} ×${v.n} — ${v.help}\n   ${v.sample.join('\n   ')}`);
  await p.close();
}
await b.close();
