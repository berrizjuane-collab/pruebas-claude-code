// Verificación de extremo a extremo de traza/index.html (VÉRTICE) en Chromium (Playwright).
// Uso: NODE_PATH=$(npm root -g) node traza/tests/e2e.cjs [carpeta_de_salida]
// Recorre la matriz V01–V28 del plan maestro que puede automatizarse y deja
// capturas, PDF y CSV descargados en la carpeta de salida.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const engine = require('../src/engine.js');
const format = require('../src/format.js');

const OUT = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'vertice-e2e-')));
fs.mkdirSync(OUT, { recursive: true });
const INDEX = path.resolve(__dirname, '..', 'index.html');
const FILE = 'file://' + INDEX;
const results = [];
function check(id, ok, detail) {
  results.push({ id, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + id + (detail ? ' — ' + detail : ''));
}
const pay = (P, r, n, t = 'nominal_annual') =>
  engine.calculateLoan({ principalBase: P, baseCurrency: 'USD', annualRatePercent: r, rateType: t, months: n });
const fm = (x, c = 'USD') => format.formatMoney(x, c);

async function setField(page, sel, text) {
  await page.fill(sel, text);
  await page.locator(sel).blur();
  await page.waitForTimeout(60);
}
async function calc(page) { await page.click('#calc-btn'); await page.waitForTimeout(120); }
async function heroValue(page) { return (await page.textContent('#hero-amount-sr')).trim(); }
async function errorText(page, id) { return page.locator('#' + id).isVisible().then((v) => (v ? page.textContent('#' + id) : '')); }
async function setScenario(page, amount, rate, months) {
  await setField(page, '#amount-input', amount);
  await setField(page, '#rate-input', rate);
  await setField(page, '#months-input', months);
  await calc(page);
}
async function download(page, clickSel, name) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click(clickSel)]);
  const target = path.join(OUT, name || dl.suggestedFilename());
  await dl.saveAs(target);
  return { file: target, suggested: dl.suggestedFilename() };
}
function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split('\r\n').filter(Boolean);
  const header = lines[0].split(',');
  return lines.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, k) => [header[k], v])));
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  const external = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fallo simulado')) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  context.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) external.push(r.url()); });
  await page.goto(FILE);

  /* Estado inicial */
  check('INI-orientación', await page.isVisible('#hero-empty') && !(await page.isVisible('#hero-result')), 'tarjeta de orientación sin cifras');
  check('INI-exportaciones deshabilitadas', await page.$eval('[data-export-pdf]', (b) => b.disabled) && await page.$eval('[data-csv]', (b) => b.disabled));
  check('INI-una sola h1', (await page.$$eval('h1', (a) => a.length)) === 1);

  /* Identidad VÉRTICE: nombre, emblema, tipografías y paleta (solo presentación) */
  const brand = await page.evaluate(async () => {
    await document.fonts.ready;
    const css = (el, prop) => getComputedStyle(el).getPropertyValue(prop).trim();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    const attrs = [];
    for (let el = walker.currentNode; el; el = walker.nextNode()) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      for (const a of el.attributes) attrs.push(a.value);
    }
    const tile = document.querySelector('header .brand-tile');
    const tb = tile.getBoundingClientRect();
    const faces = Array.from(document.fonts).filter((f) => /Vertice/.test(f.family)).map((f) => f.family.replace(/"/g, '') + ' ' + f.weight + ' ' + f.status);
    return {
      title: document.title,
      visibleOld: /traza/i.test(document.body.innerText) || attrs.some((v) => /traza/i.test(v)) || /traza/i.test(document.title),
      wordmark: document.querySelector('header .wordmark').textContent + ' / ' + document.querySelector('header .descriptor').textContent,
      tagline: document.querySelector('footer .tagline').textContent,
      emblem: /^url\("?data:image\/png;base64,/.test(css(document.documentElement, '--emblem')),
      tileBg: /data:image\/png;base64,/.test(getComputedStyle(tile).backgroundImage),
      tileBox: Math.round(tb.width) + 'x' + Math.round(tb.height),
      tileColor: getComputedStyle(tile).backgroundColor,
      favicon: /^data:image\/png;base64,/.test(document.querySelector('link[rel="icon"]').getAttribute('href')),
      faces,
      h1Font: getComputedStyle(document.querySelector('h1')).fontFamily,
      bodyFont: getComputedStyle(document.body).fontFamily,
      header: getComputedStyle(document.querySelector('.site-header') || document.querySelector('header')).backgroundColor,
      page: getComputedStyle(document.body).backgroundColor,
    };
  });
  check('MARCA título y textos', brand.title.includes('VÉRTICE') && !brand.visibleOld && brand.wordmark === 'VÉRTICE / Ingeniería Económica' && brand.tagline === 'El valor correcto. En la fecha correcta.', brand.title);
  check('MARCA emblema original y favicon', brand.emblem && brand.tileBg && brand.tileBox === '40x40' && brand.tileColor === 'rgb(244, 241, 232)' && brand.favicon, brand.tileBox + ' ' + brand.tileColor);
  check('MARCA tipografías cargadas', ['VerticeSans 400 loaded', 'VerticeSans 600 loaded', 'VerticeSerif 400 loaded'].every((f) => brand.faces.includes(f)) && /^Georgia, VerticeSerif/.test(brand.h1Font) && /^"Segoe UI", VerticeSans/.test(brand.bodyFont), brand.faces.join(', '));
  check('MARCA paleta', brand.header === 'rgb(16, 55, 47)' && brand.page === 'rgb(244, 241, 232)', brand.header + ' / ' + brand.page);

  /* V01 */
  await setField(page, '#amount-input', '12.000,50');
  check('V01a 12.000,50', (await page.inputValue('#amount-input')) === '12.000,50');
  await setField(page, '#amount-input', '12000.50');
  check('V01b 12000.50 → 12.000,50', (await page.inputValue('#amount-input')) === '12.000,50');
  await setField(page, '#amount-input', '12000');
  check('V01c 12000 → 12.000,00', (await page.inputValue('#amount-input')) === '12.000,00');

  /* V02 */
  await setField(page, '#amount-input', '');
  check('V02a vacío', (await errorText(page, 'amount-error')).includes('Ingresa un monto entre 100 y 1.000.000.000'));
  await calc(page);
  check('V02b resumen y foco', await page.isVisible('#error-summary') && (await page.evaluate(() => document.activeElement.id)) === 'amount-input');
  check('V02c sin resultado con datos inválidos', !(await page.isVisible('#hero-result')));
  await setField(page, '#amount-input', '12.000,00');
  await setField(page, '#rate-input', '-5');
  check('V02d tasa negativa', (await errorText(page, 'rate-error')).includes('La tasa debe estar entre 0 % y 100 %'));
  await setField(page, '#rate-input', '12,00');
  await setField(page, '#months-input', '0');
  check('V02e n = 0', (await errorText(page, 'months-error')).includes('El plazo debe ser un número entero entre 1 y 600 meses'));
  await setField(page, '#months-input', '2,5');
  check('V02f n = 2,5', (await errorText(page, 'months-error')).includes('número entero'));
  await setField(page, '#months-input', '24');

  /* V03 */
  await setField(page, '#amount-input', '12000,555');
  check('V03a precisión extra', (await errorText(page, 'amount-error')).includes('Usa hasta 2 decimales') && (await page.inputValue('#amount-input')) === '12000,555');
  await setField(page, '#amount-input', '1e6');
  check('V03b 1e6 rechazado', (await errorText(page, 'amount-error')).includes('Usa solo cifras'));

  /* V04 */
  await setScenario(page, '12.345,67', '12,3456', '24');
  const r04 = pay(12345.67, 12.3456, 24);
  check('V04 precisión manual', (await page.inputValue('#amount-input')) === '12.345,67' && (await page.inputValue('#rate-input')) === '12,3456' && (await heroValue(page)) === fm(r04.payment), await heroValue(page));

  /* N01 */
  await setScenario(page, '12.000,00', '12,00', '24');
  check('N01 cuota', (await heroValue(page)) === '$ 564,88');
  check('N01 KPIs', JSON.stringify(await page.$$eval('.kpi-value', (a) => a.map((x) => x.textContent))) === JSON.stringify(['$ 12.000,00', '$ 1.557,16', '$ 13.557,16', '11,5 %']));
  check('N01 exportaciones habilitadas', !(await page.$eval('[data-export-pdf]', (b) => b.disabled)));
  await page.screenshot({ path: path.join(OUT, 'e2e-1440-n01.png'), fullPage: true });

  /* V05: arrastre rápido del slider y luego Calcular */
  const box = await page.locator('#months-slider').boundingBox();
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(box.x + box.width * (k / 12), box.y + box.height / 2, { steps: 2 });
  await page.mouse.up();
  await calc(page);
  const n05 = Number(await page.inputValue('#months-input'));
  const r05 = pay(12000, 12, n05);
  const rows05 = await page.$$eval('#amort-body tr', (a) => a.length);
  const flow05 = await page.textContent('#flow-summary');
  check('V05 último valor en todas las vistas', (await heroValue(page)) === fm(r05.payment) && (n05 <= 60 ? rows05 === n05 : rows05 === 24) && flow05.includes('meses 1 a ' + n05), 'n=' + n05);
  await setScenario(page, '12.000,00', '12,00', '24');

  /* V06 */
  await page.click('label.seg:has-text("Efectiva anual")');
  await page.waitForTimeout(120);
  const r06 = pay(12000, 12, 24, 'effective_annual');
  check('V06 efectiva anual', (await heroValue(page)) === fm(r06.payment) && (await page.textContent('#rate-type-help')).includes('(1 + e)^(1/12)') && (await page.textContent('#hero-rate')).includes('0,948879'), await heroValue(page));
  await page.click('label.seg:has-text("Nominal anual")');
  await page.waitForTimeout(120);

  /* V07 */
  for (const [code, sym] of [['EUR', '€'], ['GBP', '£'], ['VES', 'Bs.'], ['USD', '$']]) {
    await page.click(`input[name="currency"][value="${code}"] + .choice-box`);
    await page.waitForTimeout(120);
    const h = await heroValue(page);
    const cell = await page.textContent('#amort-body tr td:nth-child(2)');
    const pre = await page.textContent('#amount-prefix');
    const csvBtn = await page.$eval('[data-csv]', (b) => b.disabled);
    check('V07 ' + code, h === sym + ' 564,88' && cell.startsWith(sym) && pre === sym && !csvBtn && (await page.inputValue('#amount-input')) === '12.000,00', h);
  }

  /* V08 */
  await page.click('label[for="convert-toggle"]');
  await page.waitForTimeout(120);
  check('V08 conversión sin factor', (await page.textContent('#convert-status')).includes('Completa el tipo de cambio') && (await heroValue(page)) === '$ 564,88');

  /* V09 */
  await setField(page, '#fx-rate', '0,92');
  await page.fill('#fx-date', '2026-09-26');
  await page.dispatchEvent('#fx-date', 'change');
  await page.waitForTimeout(150);
  const eur1 = await heroValue(page);
  const r09 = pay(12000, 12, 24);
  check('V09a conversión aplicada', eur1 === fm(r09.payment * 0.92, 'EUR') && (await page.textContent('#hero-currency')).includes('1 USD = 0,92 EUR'), eur1);
  const csvConv = await download(page, '[data-csv="escenario"]', 'conv_vertice_escenario.csv');
  const esc = parseCsv(fs.readFileSync(csvConv.file, 'utf8'))[0];
  check('V09b metadatos CSV', esc.currency_mode === 'conversion' && esc.fx_rate === '0.92' && esc.fx_date === '2026-09-26' && esc.display_currency === 'EUR' && esc.base_currency === 'USD' && esc.principal_base === '12000');
  await page.selectOption('#convert-target', 'GBP');
  await page.waitForTimeout(150);
  check('V09c otro par pide su tasa', (await page.inputValue('#fx-rate')) === '' && (await heroValue(page)) === '$ 564,88');
  await page.selectOption('#convert-target', 'EUR');
  await page.waitForTimeout(150);
  check('V09d regreso sin deriva', (await page.inputValue('#fx-rate')) === '0,92' && (await heroValue(page)) === eur1);
  await page.click('label[for="convert-toggle"]');
  await page.waitForTimeout(120);

  /* V10 */
  await setScenario(page, '12.000,00', '0', '1');
  const donut = await page.$$eval('#donut-svg [data-part]', (a) => a.map((e) => e.tagName + ':' + e.getAttribute('data-part')));
  const bodyText = await page.textContent('main');
  check('V10 tasa cero y n = 1', (await heroValue(page)) === '$ 12.000,00' && donut.length === 1 && donut[0] === 'circle:capital' && !/NaN|Infinity|undefined/.test(bodyText), donut.join(','));
  const pdf1 = await download(page, '[data-export-pdf]', 'pdf_1m.pdf');
  check('V16a PDF de 1 mes', fs.statSync(pdf1.file).size > 20000 && /^VERTICE_prestamo_USD_1m_\d{4}-\d{2}-\d{2}\.pdf$/.test(pdf1.suggested), pdf1.suggested);

  /* V11 */
  await setScenario(page, '1.000.000.000', '100', '600');
  const h11 = await heroValue(page);
  const r11 = pay(1e9, 100, 600);
  check('V11a extremos finitos', h11 === fm(r11.payment) && !/NaN|Infinity/.test(await page.textContent('main')), h11);
  check('V15a paginación', (await page.textContent('#table-range')).startsWith('Meses 1–24 de 600'));
  await page.click('#tbl-last');
  const lastRow = await page.$$eval('#amort-body tr:last-child td', (a) => a.map((x) => x.textContent));
  check('V15b último mes', lastRow[0] === '600' && lastRow[4] === '$ 0,00', lastRow.join(' | '));
  await page.click('#tbl-all');
  check('V15c mostrar todos', (await page.$$eval('#amort-body tr', (a) => a.length)) === 600);
  await page.click('#tbl-all');
  const t0 = Date.now();
  const pdf600 = await download(page, '[data-export-pdf]', 'pdf_600m.pdf');
  check('V16b PDF de 600 meses', fs.statSync(pdf600.file).size > 60000, ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  const am600 = await download(page, '[data-csv="amortizacion"]', 'am600_vertice_amortizacion.csv');
  const fl600 = await download(page, '[data-csv="flujos"]', 'fl600_vertice_flujos.csv');
  const amRows = parseCsv(fs.readFileSync(am600.file, 'utf8'));
  const flRows = parseCsv(fs.readFileSync(fl600.file, 'utf8'));
  check('V15d CSV completo sin página', amRows.length === 600 && flRows.length === 601 && new Set(amRows.map((r) => r.month)).size === 600);

  /* V12 */
  await setScenario(page, '12.000,00', '0,0001', '600');
  const r12 = pay(12000, 0.0001, 600);
  await page.click('#precision summary');
  const prec = await page.textContent('#precision-list');
  check('V12 tasa diminuta no es cero', (await heroValue(page)) === fm(r12.payment) && prec.includes('0,0000083333') && r12.totalInterest > 0, 'J=' + r12.totalInterest.toFixed(6));
  await page.click('#precision summary');

  /* V13 */
  await setScenario(page, '12.000,00', '12,00', '24');
  await page.click('label.seg:has-text("Efectivo acumulado")');
  await page.waitForTimeout(100);
  const cashTexts = await page.$$eval('#balance-svg text', (a) => a.map((t) => t.textContent));
  check('V13a efectivo acumulado', (await page.textContent('#balance-title')).includes('efectivo acumulado del préstamo') && cashTexts.includes('Mes 24: −$ 1.557,16') && (await page.textContent('#balance-explain')).includes('No incluye ingresos'));
  await page.click('label.seg:has-text("Deuda pendiente")');
  await page.waitForTimeout(100);
  const debtTexts = await page.$$eval('#balance-svg text', (a) => a.map((t) => t.textContent));
  check('V13b deuda pendiente', (await page.textContent('#balance-title')).includes('deuda pendiente') && debtTexts.includes('Mes 24: $ 0,00'));

  /* Tooltips por teclado */
  await page.focus('#balance-plot');
  await page.keyboard.press('End');
  await page.waitForTimeout(80);
  const tip = await page.textContent('#balance-tooltip');
  check('Tooltip con teclado', (await page.isVisible('#balance-tooltip')) && tip.includes('Mes 24') && tip.includes('$ 0,00'), tip);

  /* V14 */
  await setScenario(page, '12.000,00', '12,00', '120');
  const tramos = await page.$$eval('#flow-tramos li', (a) => a.map((x) => x.textContent));
  check('V14a tramos', tramos.length === 5 && tramos[0].startsWith('Pagos mensuales del mes 1 al 24'), tramos[0]);
  await page.click('#flow-all-btn');
  await page.waitForTimeout(150);
  const wide = await page.evaluate(() => ({ svg: document.getElementById('flow-all-svg').getBoundingClientRect().width, box: document.getElementById('flow-all-scroll').clientWidth }));
  const labels = await page.$$eval('#flow-all-svg text', (a) => a.map((t) => t.textContent));
  check('V14b todos los meses', wide.svg > wide.box && labels.includes('0') && labels.includes('120'), JSON.stringify(wide));
  await page.click('#flow-all-btn');

  /* V17: editar mientras se genera el PDF */
  await setScenario(page, '12.000,00', '12,00', '24');
  const idBefore = (await page.textContent('#scenario-id')).trim();
  const [dl17] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    (async () => { await page.click('[data-export-pdf]'); await page.fill('#months-input', '36'); await page.locator('#months-input').blur(); })(),
  ]);
  const pdf17 = path.join(OUT, 'pdf_24m_edit.pdf');
  await dl17.saveAs(pdf17);
  fs.writeFileSync(path.join(OUT, 'v17_expected_id.txt'), idBefore);
  check('V17 PDF descargado durante edición', fs.statSync(pdf17).size > 20000, 'id esperado ' + idBefore);

  /* V18: fallo de generación */
  await setScenario(page, '12.000,00', '12,00', '24');
  await page.evaluate(() => { window.__orig = TRAZA.pdf.generatePdf; TRAZA.pdf.generatePdf = async () => { throw new Error('fallo simulado'); }; });
  await page.click('[data-export-pdf]');
  await page.waitForTimeout(300);
  const st18 = await page.textContent('[data-pdf-status]');
  check('V18 error veraz y recuperación', st18.includes('No se pudo generar el PDF') && !(await page.$eval('[data-export-pdf]', (b) => b.disabled)) && (await heroValue(page)) === '$ 564,88', st18);
  await page.evaluate(() => { TRAZA.pdf.generatePdf = window.__orig; });

  /* V19 */
  const c1 = await download(page, '[data-csv="escenario"]', 'n01_vertice_escenario.csv');
  const c2 = await download(page, '[data-csv="amortizacion"]', 'n01_vertice_amortizacion.csv');
  const c3 = await download(page, '[data-csv="flujos"]', 'n01_vertice_flujos.csv');
  const e19 = parseCsv(fs.readFileSync(c1.file, 'utf8'));
  const a19 = parseCsv(fs.readFileSync(c2.file, 'utf8'));
  const f19 = parseCsv(fs.readFileSync(c3.file, 'utf8'));
  const ids = new Set([...e19, ...a19, ...f19].map((r) => r.scenario_id));
  check('MARCA nombres de archivo', [c1, c2, c3].map((d) => d.suggested).join('|') === 'vertice_escenario.csv|vertice_amortizacion.csv|vertice_flujos.csv' && /^VRT-[0-9A-F]{8}$/.test([...ids][0]), [c1, c2, c3].map((d) => d.suggested).join(' '));
  check('V19 tres CSV coherentes', ids.size === 1 && a19.length === 24 && f19.length === 25 && Math.abs(Number(e19[0].payment) - 564.8816666791765) < 1e-9 && e19[0].fx_rate === '1' && e19[0].fx_date === '', [...ids][0]);
  const pdf24 = await download(page, '[data-export-pdf]', 'pdf_24m.pdf');
  check('V16c PDF de 24 meses', fs.statSync(pdf24.file).size > 20000, pdf24.suggested);

  /* V21 */
  check('V21 sin iframe ficticio', (await page.$$('#pbi-report iframe')).length === 0 && (await page.textContent('#pbi-status')).includes('Sin reporte externo configurado'));

  /* V23 */
  await page.click('#credits-open');
  await page.waitForTimeout(380);
  const s23 = await page.evaluate(() => ({
    face: document.getElementById('credits').dataset.face,
    focus: document.activeElement.id,
    frontInert: document.getElementById('credits-front').inert,
    backInert: document.getElementById('credits-back').inert,
    mail: document.querySelector('#credits-contact a') && document.querySelector('#credits-contact a').getAttribute('href'),
    text: document.getElementById('credits-contact').textContent,
  }));
  check('V23a giro al reverso', s23.face === 'back' && s23.focus === 'credits-back-title' && s23.frontInert && !s23.backInert, JSON.stringify(s23.focus));
  check('V23b correo real', s23.mail === 'mailto:jeberrizbeitia.25@est.ucab.edu.ve' && s23.text.includes('Para cualquier consulta, escribir a jeberrizbeitia.25@est.ucab.edu.ve del coordinador del equipo'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(380);
  check('V23c Escape vuelve', (await page.evaluate(() => document.getElementById('credits').dataset.face)) === 'front' && (await page.evaluate(() => document.activeElement.id)) === 'credits-open');
  await page.focus('#credits-open');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(380);
  const faceEnter = await page.evaluate(() => document.getElementById('credits').dataset.face);
  await page.keyboard.press('Tab');
  const afterTab = await page.evaluate(() => document.activeElement && document.activeElement.closest('#credits-back') !== null);
  await page.click('#credits-close');
  await page.waitForTimeout(380);
  check('V23d Enter y foco dentro de la cara activa', faceEnter === 'back' && afterTab);
  const names = await page.$$eval('#team-list li', (a) => a.map((x) => x.textContent));
  check('Créditos: integrantes', names.join('|') === 'Stephy Batiuk|Daniela Vidal|Diego Estevez|Juan Montero|Juan Berrizbeitia|Juan Rafael');

  /* V22: teclado */
  await page.goto(FILE);
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => document.activeElement.className);
  check('V22a primer Tab: saltar a la calculadora', first.includes('skip-link'));
  await page.focus('#months-input');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check('V22b Enter calcula', (await heroValue(page)) === '$ 564,88');
  await page.focus('#months-slider');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  check('V22c flechas en slider', (await page.inputValue('#months-input')) === '25' && (await heroValue(page)) === fm(pay(12000, 12, 25).payment));
  const outline = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('#amount-input').closest('.input-affix')); return s.outlineStyle; });
  await page.focus('#amount-input');
  const outlineFocus = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('#amount-input').closest('.input-affix')); return s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor; });
  check('V22d foco visible', outline === 'none' && outlineFocus.startsWith('solid 2px'), outlineFocus);
  await page.click('#nav-howto');
  check('Cómo usar abre instrucciones', await page.evaluate(() => document.getElementById('como-usar').open));

  /* V24: movimiento reducido */
  const rmContext = await browser.newContext({ viewport: { width: 1024, height: 800 }, reducedMotion: 'reduce' });
  const rm = await rmContext.newPage();
  await rm.goto(FILE);
  await rm.click('#calc-btn');
  await rm.fill('#months-input', '36');
  await rm.locator('#months-input').blur();
  const immediate = await rm.evaluate(() => document.getElementById('hero-amount').textContent === document.getElementById('hero-amount-sr').textContent);
  await rm.click('#credits-open');
  await rm.waitForTimeout(60);
  const rmFlip = await rm.evaluate(() => ({ t: getComputedStyle(document.querySelector('.credits-inner')).transform, back: getComputedStyle(document.getElementById('credits-back')).visibility, front: getComputedStyle(document.getElementById('credits-front')).visibility }));
  check('V24 movimiento reducido', immediate && rmFlip.t === 'none' && rmFlip.back === 'visible' && rmFlip.front === 'hidden', JSON.stringify(rmFlip));
  await rmContext.close();

  /* V25: anchos */
  for (const width of [320, 390, 768, 1024, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, hasTouch: width < 768, isMobile: width < 768 });
    const p = await ctx.newPage();
    await p.goto(FILE);
    await p.click('#calc-btn');
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => {
      const hero = document.getElementById('hero-amount').parentElement;
      const kpis = Array.from(document.querySelectorAll('.kpi-value')).every((k) => k.scrollWidth <= k.clientWidth + 1);
      return { doc: document.documentElement.scrollWidth, win: window.innerWidth, hero: hero.scrollWidth <= hero.clientWidth + 1, kpis };
    });
    check('V25 ' + width + ' px', m.doc <= m.win && m.hero && m.kpis, JSON.stringify(m));
    await p.screenshot({ path: path.join(OUT, `e2e-${width}.png`), fullPage: true });
    if (width === 390) {
      await p.fill('#amount-input', '1.000.000.000');
      await p.fill('#rate-input', '99,9999');
      await p.fill('#months-input', '600');
      await p.click('input[name="currency"][value="VES"] + .choice-box');
      await p.click('#calc-btn');
      await p.waitForTimeout(300);
      const big = await p.evaluate(() => {
        const hero = document.getElementById('hero-amount').parentElement;
        return { doc: document.documentElement.scrollWidth, win: window.innerWidth, hero: hero.scrollWidth <= hero.clientWidth + 1, kpis: Array.from(document.querySelectorAll('.kpi-value')).every((k) => k.scrollWidth <= k.clientWidth + 1), text: document.getElementById('hero-amount').textContent };
      });
      check('V25 390 px importes extensos', big.doc <= big.win && big.hero && big.kpis, JSON.stringify(big));
      await p.screenshot({ path: path.join(OUT, 'e2e-390-extremo.png'), fullPage: false });
    }
    await ctx.close();
  }

  /* V27: sin conexión */
  const off = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await off.setOffline(true);
  const po = await off.newPage();
  await po.goto(FILE);
  await po.click('#calc-btn');
  const offPdf = await download(po, '[data-export-pdf]', 'offline.pdf');
  const offCsv = await download(po, '[data-csv="flujos"]', 'offline_vertice_flujos.csv');
  check('V27 sin conexión', (await heroValue(po)) === '$ 564,88' && fs.statSync(offPdf.file).size > 20000 && fs.statSync(offCsv.file).size > 500);
  await off.close();

  /* V28: nombres/correo largos y sin configurar */
  const html = fs.readFileSync(INDEX, 'utf8');
  const variants = {
    largo: html.replace("'Stephy Batiuk',", "'María de los Ángeles Fernández-Villavicencio Rodríguez de la Santísima Trinidad', 'Stephy Batiuk',")
      .replace("coordinatorEmail: 'jeberrizbeitia.25@est.ucab.edu.ve'", "coordinatorEmail: 'coordinacion.academica.ingenieria.economica.seccion.402.grupo.vertice@est.ucab.edu.ve'"),
    vacio: html.replace(/teamMembers: \[[\s\S]*?\],/, 'teamMembers: [],').replace("coordinatorEmail: 'jeberrizbeitia.25@est.ucab.edu.ve'", "coordinatorEmail: 'XXX@ucab'").replace("coordinatorName: 'Juan Berrizbeitia'", "coordinatorName: ''"),
  };
  for (const [name, content] of Object.entries(variants)) {
    const f = path.join(OUT, `variante-${name}.html`);
    fs.writeFileSync(f, content);
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const p = await ctx.newPage();
    await p.goto('file://' + f);
    await p.click('#credits-open');
    await p.waitForTimeout(400);
    const info = await p.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
      mail: document.querySelectorAll('#credits-contact a').length,
      text: document.getElementById('credits-contact').textContent,
      team: document.getElementById('team-list').textContent,
      overflow: Array.from(document.querySelectorAll('.credits-face')).some((f) => f.scrollWidth > f.clientWidth + 1),
    }));
    if (name === 'largo') check('V28a nombres y correo largos', info.doc <= info.win && !info.overflow && info.mail === 1, JSON.stringify({ doc: info.doc, win: info.win }));
    else check('V28b datos pendientes sin mailto', info.mail === 0 && info.text.includes('Correo del coordinador pendiente') && info.team.includes('Nombres del equipo pendientes') && info.text.includes('Nombre del coordinador pendiente'));
    await p.screenshot({ path: path.join(OUT, `e2e-creditos-${name}.png`), fullPage: false });
    await ctx.close();
  }

  check('Consola sin errores', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' / '));
  check('Sin peticiones de red externas', external.length === 0, external.slice(0, 3).join(' '));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} verificaciones aprobadas · salida en ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(2); });
