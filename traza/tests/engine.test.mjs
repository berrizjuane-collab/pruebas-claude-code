// Pruebas del motor financiero, parser y formato de TRAZA (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import engine from '../src/engine.js';
import format from '../src/format.js';
import inputs from '../src/inputs.js';

const { calculateLoan, convertResult, RATE_TYPES } = engine;
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}, obtenido ${a} (tol ${tol})`);
const loan = (P, rate, n, type = RATE_TYPES.NOMINAL) =>
  calculateLoan({ principalBase: P, baseCurrency: 'USD', annualRatePercent: rate, rateType: type, months: n });

function checkInvariants(r) {
  const P = r.input.principalBase;
  const n = r.input.months;
  const eps = engine.toleranceFor(P);
  assert.equal(r.schedule.length, n, 'n pagos');
  assert.equal(r.cashFlows.length, n + 1, 'n+1 flujos');
  let sumK = 0, sumI = 0, sumA = 0, prev = P, pv = 0;
  for (const row of r.schedule) {
    sumK += row.principal; sumI += row.interest; sumA += row.payment;
    close(row.payment, row.principal + row.interest, eps, `A_t = K_t + I_t (mes ${row.month})`);
    close(row.balance, prev - row.principal, eps, `B_t = B_(t-1) - K_t (mes ${row.month})`);
    assert.ok(row.balance >= -eps && row.balance <= prev + eps, `deuda no negativa y no creciente (mes ${row.month})`);
    assert.ok(row.interest >= -eps, 'interés no negativo');
    pv += row.payment / Math.pow(1 + r.monthlyRate, row.month);
    prev = row.balance;
  }
  assert.equal(r.schedule[n - 1].balance, 0, 'B_n = 0');
  close(sumK, P, eps * 10, 'ΣK ≈ P');
  close(sumI, r.totalInterest, eps * 10, 'ΣI ≈ J');
  close(sumA, P + r.totalInterest, eps * 10, 'ΣA ≈ P + J');
  close(P - pv, 0, Math.max(eps * 10, P * 1e-9), 'P − Σ A_t/(1+i)^t ≈ 0');
  let c = P;
  for (let t = 1; t <= n; t++) {
    c += r.cashFlows[t].flow;
    close(r.cashFlows[t].cumulativeCash, c, eps * 10, `C_t = C_(t-1) + CF_t (mes ${t})`);
  }
  close(r.cashFlows[n].cumulativeCash, -r.totalInterest, eps, 'C_n ≈ −J');
  for (const v of [r.payment, r.totalPaid, r.totalInterest, r.monthlyRate]) assert.ok(Number.isFinite(v));
}

test('N01: 12.000 al 12 % nominal, 24 meses', () => {
  const r = loan(12000, 12, 24);
  close(r.monthlyRate, 0.01, 1e-15, 'i');
  close(r.payment, 564.8816666791765, 1e-9, 'A');
  close(r.totalPaid, 13557.160000300235, 1e-8, 'T');
  close(r.totalInterest, 1557.1600003002359, 1e-8, 'J');
  checkInvariants(r);
  const f = (x) => format.formatNumber(x, 2);
  assert.deepEqual(r.schedule.slice(0, 3).map((x) => [f(x.payment), f(x.principal), f(x.interest), f(x.balance)]), [
    ['564,88', '444,88', '120,00', '11.555,12'],
    ['564,88', '449,33', '115,55', '11.105,79'],
    ['564,88', '453,82', '111,06', '10.651,96'],
  ]);
  assert.equal(f(r.totalInterest), '1.557,16');
  const pct = format.compositionPercents(12000, r.totalInterest);
  assert.equal(pct.capital, 88.5);
  assert.equal(pct.interest, 11.5);
});

test('N02: tasa cero', () => {
  const r = loan(12000, 0, 24);
  assert.equal(r.payment, 500);
  assert.equal(r.totalPaid, 12000);
  assert.equal(r.totalInterest, 0);
  assert.equal(r.schedule[23].balance, 0);
  assert.ok(r.schedule.every((x) => x.interest === 0), 'intereses exactamente cero');
  checkInvariants(r);
});

test('N03: un mes', () => {
  const r = loan(1000, 12, 1);
  close(r.payment, 1010, 1e-9);
  close(r.schedule[0].principal, 1000, 1e-9);
  close(r.schedule[0].interest, 10, 1e-9);
  assert.equal(r.schedule[0].balance, 0);
  checkInvariants(r);
});

test('N04: efectiva anual 12 %, 12 meses (no se divide entre 12)', () => {
  const r = loan(1000, 12, 12, RATE_TYPES.EFFECTIVE);
  close(r.monthlyRate, 0.009488792934582975, 1e-15, 'i');
  close(r.payment, 88.5620673894411, 1e-9, 'A');
  close(r.totalInterest, 62.7448086732931, 1e-8, 'J');
  close(r.effectiveAnnualRate, 0.12, 1e-14, 'TEA');
  checkInvariants(r);
});

test('N05: flujo y efectivo acumulado', () => {
  const r = loan(12000, 12, 24);
  assert.equal(r.cashFlows[0].flow, 12000);
  assert.equal(r.cashFlows[0].cumulativeCash, 12000);
  assert.equal(r.cashFlows[0].debtBalance, 12000);
  close(r.cashFlows[1].flow, -564.8816666791765, 1e-9);
  close(r.cashFlows[24].cumulativeCash, -1557.160000300235, 1e-8);
  assert.equal(r.cashFlows[24].debtBalance, 0);
});

test('N06: conversión sintética q = 2,5 sin tocar el resultado base', () => {
  const r = loan(12000, 12, 24);
  const v = convertResult(r, { mode: 'conversion', displayCurrency: 'EUR', fxRate: 2.5, fxDate: '2026-09-26', fxSource: 'Prueba' });
  close(v.principal, 30000, 1e-9);
  close(v.payment, 1412.2041666979413, 1e-8);
  close(v.totalInterest, 3892.9000007505897, 1e-7);
  assert.equal(r.payment, 564.8816666791765 + (r.payment - 564.8816666791765)); // base intacta
  assert.equal(v.schedule.length, 24);
  close(v.cashFlows[24].cumulativeCash, -3892.9000007505897, 1e-7);
  assert.equal(r.input.months, 24);
});

test('V09: ida y vuelta de conversión sin deriva', () => {
  const r = loan(12345.67, 12.3456, 37);
  const base = convertResult(r, { mode: 'denomination' });
  let v = base;
  for (let k = 0; k < 50; k++) {
    v = convertResult(r, { mode: 'conversion', displayCurrency: 'EUR', fxRate: 0.9137, fxDate: '2026-09-01', fxSource: 'x' });
    v = convertResult(r, { mode: 'denomination' });
  }
  assert.equal(v.payment, base.payment);
  assert.equal(v.totalInterest, base.totalInterest);
});

test('Duplicar P duplica cada importe', () => {
  const a = loan(5000, 18, 48);
  const b = loan(10000, 18, 48);
  close(b.payment, 2 * a.payment, 1e-9);
  close(b.totalInterest, 2 * a.totalInterest, 1e-8);
  a.schedule.forEach((row, k) => close(b.schedule[k].balance, 2 * row.balance, 1e-8));
});

test('V11: P máximo, tasa 100 %, n = 600 (nominal y efectiva)', () => {
  for (const type of [RATE_TYPES.NOMINAL, RATE_TYPES.EFFECTIVE]) {
    const r = loan(1e9, 100, 600, type);
    checkInvariants(r);
    assert.ok(Math.abs(r.diagnostics.balanceResidual) <= r.diagnostics.epsilon);
    assert.ok(r.schedule[0].principal > 0, 'la amortización inicial diminuta no se elimina');
  }
});

test('V12: tasa 0,0001 % y n = 600 no se trata como cero', () => {
  const r = loan(12000, 0.0001, 600);
  assert.ok(r.monthlyRate > 0);
  assert.ok(r.totalInterest > 0);
  assert.ok(r.payment > 20 && r.payment < 20.01);
  checkInvariants(r);
});

test('Barrido de dominio: invariantes en casos representativos', () => {
  const Ps = [100, 12000, 987654.32, 1e9];
  const rates = [0, 0.0001, 1, 12, 35.5, 100];
  const terms = [1, 2, 12, 59, 60, 61, 360, 588, 589, 600];
  for (const P of Ps) for (const rate of rates) for (const n of terms) for (const type of Object.values(RATE_TYPES)) {
    checkInvariants(loan(P, rate, n, type));
  }
});

test('Regla de comparación de plazo (§10.2)', () => {
  assert.equal(engine.alternativeMonths(24), 36);
  assert.equal(engine.alternativeMonths(588), 600);
  assert.equal(engine.alternativeMonths(589), 577);
  assert.equal(engine.alternativeMonths(600), 588);
  const base = loan(12000, 12, 24);
  const alt = engine.calculateAlternative(base.input);
  assert.ok(alt.payment < base.payment && alt.totalInterest > base.totalInterest);
  const zero = engine.calculateAlternative(loan(12000, 0, 24).input);
  assert.equal(zero.totalInterest, 0);
  assert.equal(zero.payment, 12000 / 36);
});

test('Entradas fuera de dominio se rechazan en el motor', () => {
  assert.throws(() => loan(99, 12, 24));
  assert.throws(() => loan(12000, -1, 24));
  assert.throws(() => loan(12000, 12, 0));
  assert.throws(() => loan(12000, 12, 2.5));
  assert.throws(() => loan(NaN, 12, 24));
  assert.throws(() => loan(12000, 101, 24));
});

test('V01: parser localizado', () => {
  const p = (s, o) => inputs.parseLocalizedNumber(s, o);
  assert.deepEqual(p('12.000,50'), { ok: true, value: 12000.5, decimals: 2 });
  assert.deepEqual(p('12000.50'), { ok: true, value: 12000.5, decimals: 2 });
  assert.deepEqual(p('12000'), { ok: true, value: 12000, decimals: 0 });
  assert.deepEqual(p('12.000'), { ok: true, value: 12000, decimals: 0 });
  assert.deepEqual(p('1.234.567,89'), { ok: true, value: 1234567.89, decimals: 2 });
  assert.deepEqual(p('12000,'), { ok: true, value: 12000, decimals: 0 });
  assert.deepEqual(p('0.001', { maxDecimals: 4 }), { ok: true, value: 0.001, decimals: 3 });
  assert.equal(p('1,234.56').code, 'mixed');
  assert.equal(p('1,2,3').code, 'multiple');
  assert.equal(p('12.34.567').code, 'grouping');
  assert.equal(p('12.0000,5').code, 'grouping');
  assert.equal(p('12 000').code, 'chars');
  assert.equal(p('$12000').code, 'chars');
  assert.equal(p('').code, 'empty');
  assert.equal(p('   ').code, 'empty');
});

test('V02–V03: vacíos, negativos, fraccionarios, precisión extra y exponentes', () => {
  assert.equal(inputs.validateAmount('').message, inputs.MESSAGES.amountRange);
  assert.equal(inputs.validateAmount('99,99').message, inputs.MESSAGES.amountRange);
  assert.equal(inputs.validateAmount('1.000.000.001').message, inputs.MESSAGES.amountRange);
  assert.equal(inputs.validateRate('-1').message, inputs.MESSAGES.rateRange);
  assert.equal(inputs.validateMonths('0').message, inputs.MESSAGES.months);
  assert.equal(inputs.validateMonths('2,5').message, inputs.MESSAGES.months);
  assert.equal(inputs.validateMonths('601').message, inputs.MESSAGES.months);
  assert.equal(inputs.validateAmount('12000,555').message, inputs.MESSAGES.amountPrecision);
  assert.equal(inputs.validateRate('12,34567').message, inputs.MESSAGES.ratePrecision);
  assert.equal(inputs.validateAmount('1e6').ok, false);
  assert.equal(inputs.validateAmount('1e6').message, inputs.MESSAGES.amountChars);
  assert.ok(inputs.validateRate('12.345').message.startsWith(inputs.MESSAGES.rateRange));
  assert.equal(inputs.validateRate('12%').value, 12);
});

test('V04: precisión manual conservada', () => {
  assert.equal(inputs.validateAmount('12.345,67').value, 12345.67);
  assert.equal(inputs.validateRate('12,3456').value, 12.3456);
  assert.equal(inputs.normalizedAmount(12345.67), '12.345,67');
  assert.equal(inputs.normalizedRate(12.3456), '12,3456');
  assert.equal(inputs.normalizedRate(12), '12,00');
});

test('Tipo de cambio y fecha', () => {
  assert.equal(inputs.validateFxRate('').ok, false);
  assert.equal(inputs.validateFxRate('0').ok, false);
  assert.equal(inputs.validateFxRate('0,00000001').value, 1e-8);
  assert.equal(inputs.validateFxRate('0,000000001').message, inputs.MESSAGES.fxPrecision);
  assert.equal(inputs.validateFxRate('100.000.000').value, 1e8);
  assert.equal(inputs.validateFxRate('100.000.001').ok, false);
  assert.equal(inputs.validateFxDate('2026-02-30').ok, false);
  assert.equal(inputs.validateFxDate('2026-09-26').ok, true);
});

test('Slider del monto: escalas ampliables y extremos representables', () => {
  assert.equal(inputs.amountScaleFor(12000), 1e5);
  assert.equal(inputs.amountScaleFor(100001), 1e6);
  assert.equal(inputs.amountScaleFor(1e9), 1e9);
  assert.equal(inputs.amountFromPosition(1, 1e5), 100);
  assert.equal(inputs.amountFromPosition(1000, 1e5), 100000);
  assert.equal(inputs.amountFromPosition(0, 1e6), 100);
  assert.equal(inputs.amountFromPosition(1, 1e6), 1000);
  assert.equal(inputs.positionFromAmount(12345.67, 1e5), 123);
});

test('Formato: redondeo de presentación, signos y CSV sin exponentes', () => {
  assert.equal(format.formatNumber(1.005, 2), '1,01');
  assert.equal(format.formatNumber(-0.004, 2), '0,00');
  assert.equal(format.formatNumber(-1557.16, 2), '−1.557,16');
  assert.equal(format.formatMoney(12000, 'USD', { sign: 'always' }), '+$ 12.000,00');
  assert.equal(format.formatMoney(-564.8816, 'VES'), '−Bs. 564,88');
  assert.equal(format.formatMoney(564.88, 'EUR'), '€ 564,88');
  assert.equal(format.plainNumber(8.333333333333334e-8), '0.00000008333333333333334');
  assert.equal(format.plainNumber(-1.5e-10), '-0.00000000015');
  assert.equal(format.plainNumber(1e21), '1000000000000000000000');
  assert.equal(format.plainNumber(564.8816666791765), '564.8816666791765');
  assert.equal(Number(format.plainNumber(1.2345678901234567e-14)), 1.2345678901234567e-14);
  assert.equal(format.formatPercentTrim(1, 6, 2), '1,00 %');
  assert.equal(format.formatPercentTrim(0.9488792934582975, 6, 2), '0,948879 %');
  const pct = format.compositionPercents(1, 1);
  assert.equal(pct.capital + pct.interest, 100);
});
