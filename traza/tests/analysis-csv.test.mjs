// Pruebas del análisis determinista y de la exportación CSV (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import engine from '../src/engine.js';
import analysis from '../src/analysis.js';
import csv from '../src/csv.js';

const covered = new Set(JSON.parse(readFileSync(new URL('../vendor/fonts/pdf-cmap.json', import.meta.url))));

function scenario(P, rate, n, type = 'nominal_annual', presentation = { mode: 'denomination', displayCurrency: 'USD', fxRate: 1 }) {
  const result = engine.calculateLoan({ principalBase: P, baseCurrency: 'USD', annualRatePercent: rate, rateType: type, months: n });
  const alt = engine.calculateAlternative(result.input);
  const view = engine.convertResult(result, presentation);
  const altView = engine.convertResult(alt, presentation);
  return { result, alt, view, altView, presentation };
}

const CASES = [
  scenario(12000, 12, 24),
  scenario(12000, 0, 24),
  scenario(1000, 12, 1),
  scenario(1000, 0, 1),
  scenario(1000, 12, 12, 'effective_annual'),
  scenario(1e9, 100, 600),
  scenario(12000, 0.0001, 600),
  scenario(12000, 0, 600),
  scenario(987654.32, 35.5, 589, 'effective_annual'),
  scenario(12000, 12, 24, 'nominal_annual', { mode: 'conversion', displayCurrency: 'EUR', fxRate: 2.5, fxDate: '2026-09-26', fxSource: 'Tipo de cambio ingresado manualmente' }),
  scenario(1e9, 99.9999, 600, 'effective_annual', { mode: 'conversion', displayCurrency: 'VES', fxRate: 100000000, fxDate: '2026-01-31', fxSource: 'Banco Central (valor de prueba)' }),
];

test('Análisis: 180–300 palabras y sin juicios sin sustento', () => {
  for (const c of CASES) {
    const a = analysis.buildAnalysis(c);
    const text = a.paragraphs.map((p) => p.title + ' ' + p.text).join(' ');
    assert.ok(a.wordCount >= 180 && a.wordCount <= 300, `palabras = ${a.wordCount} para n=${c.result.input.months}, tasa=${c.result.input.annualRatePercent}`);
    for (const bad of ['barato', 'caro', 'recomendado', 'puedes pagarlo', 'NaN', 'undefined', 'Infinity']) {
      assert.ok(!text.includes(bad), `no debe decir «${bad}»`);
    }
  }
});

test('Análisis: dirección de cambios verificada con los números', () => {
  const a = analysis.buildAnalysis(CASES[0]);
  const s = a.paragraphs.find((p) => p.id === 'sensibilidad').text;
  assert.match(s, /Con 36 meses \(12 más\)/);
  assert.match(s, /la cuota bajaría a \$ 398,57/);
  assert.match(s, /el interés total subiría a \$ 2\.348,58/);
  assert.match(s, /Una cuota menor no implica un costo total menor/);
  const z = analysis.buildAnalysis(CASES[1]).paragraphs.find((p) => p.id === 'sensibilidad').text;
  assert.match(z, /sin generar intereses/);
  assert.match(z, /seguiría en \$ 0,00/);
  const long = analysis.buildAnalysis(CASES[8]).paragraphs.find((p) => p.id === 'sensibilidad').text;
  assert.match(long, /Con 577 meses \(12 menos\)/);
  const costo = analysis.buildAnalysis(CASES[0]).paragraphs[0].text;
  assert.match(costo, /11,5 % de lo pagado \(J\/T\)/);
  assert.match(costo, /13,0 % del capital recibido \(J\/P\)/);
});

test('Análisis: conversión explicada como equivalencia fija manual', () => {
  const a = analysis.buildAnalysis(CASES[9]);
  const lim = a.paragraphs.find((p) => p.id === 'limites').text;
  assert.match(lim, /1 USD = 2,50 EUR, referencia del 26\/09\/2026/);
  assert.match(lim, /no es un pronóstico/);
  assert.match(a.paragraphs[0].text, /€ 30\.000,00/);
});

test('Todo el texto del análisis está cubierto por la fuente del PDF', () => {
  for (const c of CASES) {
    const a = analysis.buildAnalysis(c);
    const all = [
      ...a.paragraphs.flatMap((p) => [p.title, p.text]),
      ...a.formulas.flatMap((f) => [f.title, ...f.lines]),
      ...a.comparison.rows.flatMap((r) => [r.label, r.current, r.alt, r.delta]),
      ...a.assumptions, a.roundingNote, a.currencyNote,
    ].join('');
    const missing = [...new Set([...all].filter((ch) => !covered.has(ch.codePointAt(0))))];
    assert.deepEqual(missing, [], 'caracteres sin glifo: ' + missing.map((c) => 'U+' + c.codePointAt(0).toString(16)).join(' '));
  }
});

function parseCsv(text) {
  assert.equal(text.charCodeAt(0), 0xfeff, 'BOM UTF-8');
  const lines = text.slice(1).split('\r\n').filter(Boolean);
  const split = (line) => {
    const out = []; let cur = ''; let q = false;
    for (let k = 0; k < line.length; k++) {
      const ch = line[k];
      if (q) { if (ch === '"' && line[k + 1] === '"') { cur += '"'; k++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, k) => [header[k], v])));
}

test('V19: tres CSV con ID compartido, n / n+1 filas y números parseables', () => {
  for (const c of [CASES[0], CASES[5], CASES[9], CASES[10]]) {
    const id = csv.scenarioId(c.result.input, c.presentation);
    const files = csv.buildCsvFiles({ scenarioId: id, generatedAt: new Date('2026-09-26T12:00:00Z'), result: c.result, view: c.view });
    const esc = parseCsv(files.escenario.text);
    const am = parseCsv(files.amortizacion.text);
    const fl = parseCsv(files.flujos.text);
    const n = c.result.input.months;
    assert.equal(esc.length, 1);
    assert.equal(am.length, n);
    assert.equal(fl.length, n + 1);
    for (const row of [...esc, ...am, ...fl]) assert.equal(row.scenario_id, id);
    for (const row of am) for (const k of ['payment', 'principal_component', 'interest_component', 'remaining_balance']) {
      assert.ok(/^-?\d+(\.\d+)?$/.test(row[k]), `${k} = ${row[k]}`);
    }
    const sumPay = am.reduce((s, r) => s + Number(r.payment), 0);
    assert.ok(Math.abs(sumPay - Number(esc[0].total_paid)) <= Math.max(1e-6, Number(esc[0].total_paid) * 1e-12), 'Σ payment ≈ total_paid');
    assert.equal(Number(fl[0].cash_flow), c.view.principal);
    assert.equal(Number(fl[0].cumulative_cash), c.view.principal);
    assert.equal(Number(fl[0].debt_balance), c.view.principal);
    assert.equal(esc[0].display_currency, c.view.currency);
    if (c.view.mode === 'denomination') {
      assert.equal(esc[0].fx_rate, '1');
      assert.equal(esc[0].fx_date, '');
      assert.equal(esc[0].fx_source, '');
      assert.equal(esc[0].currency_mode, 'denomination');
    } else {
      assert.equal(esc[0].currency_mode, 'conversion');
      assert.equal(Number(esc[0].fx_rate), c.view.fxRate);
    }
  }
});

test('ID estable y cambiante; texto neutralizado ante fórmulas', () => {
  const c = CASES[0];
  assert.equal(csv.scenarioId(c.result.input, c.presentation), csv.scenarioId(c.result.input, c.presentation));
  const other = engine.calculateLoan({ ...c.result.input, months: 25 });
  assert.notEqual(csv.scenarioId(other.input, c.presentation), csv.scenarioId(c.result.input, c.presentation));
  assert.equal(csv.csvText('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csv.csvText('+1'), "'+1");
  assert.equal(csv.csvText('Banco, S.A.'), '"Banco, S.A."');
  assert.equal(csv.pdfFilename({ view: c.view, result: c.result, generatedAt: new Date(2026, 8, 26, 10) }), 'TRAZA_prestamo_USD_24m_2026-09-26.pdf');
});
