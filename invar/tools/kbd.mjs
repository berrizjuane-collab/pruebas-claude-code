import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await p.goto('file:///home/user/pruebas-claude-code/invar/index.html', { waitUntil: 'load' });
await p.waitForTimeout(1200);
// menú móvil
await p.click('.nav__toggle');
await p.waitForTimeout(700);
await p.screenshot({ path: process.argv[2] + '/drawer.png' });
const expanded = await p.getAttribute('.nav__toggle', 'aria-expanded');
await p.keyboard.press('Escape');
await p.waitForTimeout(600);
const hidden = await p.evaluate(() => document.getElementById('nav-drawer').hidden);
console.log('menú → aria-expanded:', expanded, '· cierra con Escape:', hidden);
await p.close();

// recorrido con tabulador
const d = await b.newPage({ viewport: { width: 1440, height: 900 } });
await d.goto('file:///home/user/pruebas-claude-code/invar/index.html', { waitUntil: 'load' });
await d.waitForTimeout(1200);
const seq = [];
for (let i = 0; i < 12; i++) {
  await d.keyboard.press('Tab');
  seq.push(await d.evaluate(() => {
    const a = document.activeElement;
    const r = a.getBoundingClientRect();
    const cs = getComputedStyle(a);
    return `${a.tagName}.${String(a.className).slice(0, 18)} "${(a.textContent || '').trim().slice(0, 22)}" vis=${r.top > -5 && r.top < innerHeight} outline=${cs.outlineWidth}`;
  }));
}
console.log(seq.map((s, i) => ` ${i + 1}. ${s}`).join('\n'));
await d.screenshot({ path: process.argv[2] + '/focus.png' });
await b.close();
