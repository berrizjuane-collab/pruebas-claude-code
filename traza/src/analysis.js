/* ==========================================================================
   TRAZA · Análisis crítico determinista (§10)
   Plantillas locales: cada cifra proviene del resultado o del escenario
   alternativo; las direcciones de cambio se verifican con los números.
   ========================================================================== */
(function (root) {
  'use strict';

  var isNode = typeof module === 'object' && module.exports;
  var format = isNode ? require('./format.js') : root.TRAZA.format;
  var engine = isNode ? require('./engine.js') : root.TRAZA.engine;

  var ASSUMPTIONS = Object.freeze([
    'El capital completo se recibe en el mes 0.',
    'Meses de igual duración; el primer pago vence al terminar el mes 1.',
    'Cuotas vencidas y constantes (sistema francés) con tasa fija durante todo el plazo.',
    'Sin comisiones, seguros, impuestos, mora ni otros cargos.',
    'Sin pagos extraordinarios ni períodos de gracia.',
    'El saldo final es cero; el último mes solo corrige el residuo numérico del cálculo.',
    'Cálculo con precisión completa; importes mostrados a dos decimales.',
  ]);

  var ROUNDING_NOTE = 'Cálculo con precisión completa; importes mostrados a dos decimales. La suma de valores redondeados puede diferir del total calculado.';

  function countWords(text) {
    var m = String(text).match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][^\s]*/g);
    return m ? m.length : 0;
  }

  function rateTypeLabel(type) {
    return type === engine.RATE_TYPES.EFFECTIVE ? 'efectiva anual' : 'nominal anual capitalizable mensualmente';
  }

  function plainRate(x, maxDec) {
    return format.formatNumberTrim(x, maxDec === undefined ? 10 : maxDec, 2);
  }

  /**
   * ctx = { result, view, alt, altView }
   * Devuelve párrafos, comparación de plazo, fórmulas sustituidas y supuestos.
   */
  function buildAnalysis(ctx) {
    var r = ctx.result;
    var v = ctx.view;
    var a = ctx.alt;
    var av = ctx.altView;
    var cur = v.currency;
    var base = r.input.baseCurrency;
    var n = r.input.months;
    var i = r.monthlyRate;
    var zero = i === 0;
    var rateTxt = format.formatPercentTrim(r.input.annualRatePercent, 4, 2);
    var iPct = format.formatPercentTrim(i * 100, 6, 2);
    var M = function (x, sign) { return format.formatMoney(x, cur, { sign: sign || 'auto' }); };
    var D = function (x) { return format.formatMoney(x, cur, { sign: 'always' }); };
    var first = v.schedule[0];
    var last = v.schedule[n - 1];
    var lastDiffers = format.roundHalfAway(v.lastPayment, 2) !== format.roundHalfAway(v.payment, 2);
    var paras = [];

    /* 1. Lectura del costo */
    var p1 = n === 1
      ? 'Recibes ' + M(v.principal) + ' en el mes 0 y lo devuelves con un único pago de ' + M(v.lastPayment) + ' al final del mes 1.'
      : 'Recibes ' + M(v.principal) + ' en el mes 0 y lo devuelves en ' + n + ' cuotas mensuales de ' + M(v.payment) + '.';
    if (n > 1 && lastDiffers) p1 += ' La última cuota, de ' + M(v.lastPayment) + ', cierra el saldo.';
    if (zero) {
      p1 += ' Con tasa 0 %, no hay intereses: pagas exactamente el capital, ' + M(v.totalPaid) + '.';
    } else {
      p1 += ' En total pagas ' + M(v.totalPaid) + ': ' + M(v.principal) + ' de capital y ' + M(v.totalInterest) +
        ' de intereses. Los intereses son el ' + format.formatPercent(100 * r.interestShare, 1) +
        ' de lo pagado (J/T) y el ' + format.formatPercent(100 * r.interestOverPrincipal, 1) +
        ' del capital recibido (J/P); este último no es una tasa anual.';
    }
    paras.push({ id: 'costo', title: 'Costo.', text: p1 });

    /* 2. Explicación temporal */
    var p2;
    if (zero) {
      p2 = n === 1
        ? 'Sin intereses, el único pago cancela todo el capital al final del mes 1.'
        : 'Sin intereses, cada cuota amortiza la misma porción de capital, ' + M(first.principal) + ', y la deuda baja en línea recta hasta cero.';
    } else if (n === 1) {
      p2 = 'Con un solo pago, el interés del mes, ' + M(first.interest) + ', se calcula sobre todo el capital y se paga junto con él.';
    } else {
      p2 = 'Cada mes, el interés se calcula sobre la deuda anterior: la cuota del mes 1 lleva ' + M(first.interest) +
        ' de intereses y ' + M(first.principal) + ' de capital; la del mes ' + n + ', ' + M(last.interest) + ' y ' +
        M(last.principal) + '. La cuota no cambia, pero su parte de capital crece al bajar el saldo.';
    }
    paras.push({ id: 'tiempo', title: 'En el tiempo.', text: p2 });

    /* 3. Modelo */
    var p3 = 'El cálculo sigue el sistema francés: una anualidad vencida con cuota constante, A = P · (A/P,\u00A0i,\u00A0n). ';
    p3 += r.input.rateType === engine.RATE_TYPES.EFFECTIVE
      ? 'La tasa efectiva anual de ' + rateTxt + ' da i = (1 + e)^(1/12) − 1 = ' + iPct + ' mensual'
      : 'La tasa nominal anual de ' + rateTxt + ' capitalizable mensualmente da i = j/12 = ' + iPct + ' mensual';
    p3 += zero
      ? '; con i = 0, el factor se reduce a 1/n y la cuota es P/n.'
      : ', y el factor de recuperación de capital vale ' + format.formatNumber(r.capitalRecoveryFactor, 6) + '.';
    paras.push({ id: 'modelo', title: 'Modelo.', text: p3 });

    /* 4. Equivalencia */
    var pvDisplay = (r.input.principalBase - r.diagnostics.presentValueResidual) * v.fxRate;
    var p4 = zero
      ? 'Con tasa cero, descontar no cambia los montos: las cuotas suman exactamente el capital. Esto verifica el cálculo; no indica si el préstamo te conviene.'
      : 'Por el valor del dinero en el tiempo, un pago futuro vale menos que uno de hoy. Descontada' + (n === 1 ? ' la cuota' : 's las ' + n + ' cuotas') +
        ' a ' + iPct + ' mensual, su valor presente es ' + M(pvDisplay) + ', igual al capital (diferencia: ' +
        M(r.diagnostics.presentValueResidual * v.fxRate) + '). Esto verifica el cálculo; no indica si el préstamo te conviene.';
    paras.push({ id: 'equivalencia', title: 'Equivalencia.', text: p4 });

    /* 5. Sensibilidad (plazo alternativo calculado con el motor) */
    var altN = a.input.months;
    var dn = altN - n;
    var dA = av.payment - v.payment;
    var dJ = av.totalInterest - v.totalInterest;
    var dT = av.totalPaid - v.totalPaid;
    var dirOf = function (d) { return Math.abs(d) < 0.005 ? 'same' : (d < 0 ? 'down' : 'up'); };
    var dirA = dirOf(dA);
    var dirJ = dirOf(dJ);
    var phrase = function (label, dir, value, delta) {
      if (dir === 'same') return label + ' prácticamente no cambiaría (' + value + ')';
      return label + ' ' + (dir === 'down' ? 'bajaría' : 'subiría') + ' a ' + value + ' (' + delta + ')';
    };
    var p5 = 'Con ' + altN + ' meses (12 ' + (dn > 0 ? 'más' : 'menos') + ') e igual capital y tasa, ' +
      phrase('la cuota', dirA, M(av.payment), D(dA)) + ' y ' +
      (zero && dirJ === 'same' ? 'el interés total seguiría en ' + M(av.totalInterest) : phrase('el interés total', dirJ, M(av.totalInterest), D(dJ))) + '.';
    if (!zero && dn > 0 && dirA === 'down' && dirJ === 'up') p5 += ' Una cuota menor no implica un costo total menor.';
    if (!zero && dn < 0 && dirA === 'up' && dirJ === 'down') p5 += ' Acortar el plazo sube la cuota, pero reduce el interés total.';
    if (zero && dn > 0) p5 += ' Con tasa cero, repartir el capital en más meses reduce la cuota sin generar intereses en este modelo.';
    if (zero && dn < 0) p5 += ' Con tasa cero, concentrar el capital en menos meses sube la cuota y el interés sigue en cero.';
    paras.push({ id: 'sensibilidad', title: 'Sensibilidad.', text: p5 });

    /* 6. Límites */
    var p6 = 'El modelo no incluye comisiones, seguros, impuestos, mora ni inflación. Sin datos de ingresos y gastos no es posible juzgar si la cuota es asequible.';
    if (v.mode === 'conversion') {
      p6 += ' Los importes se muestran en ' + cur + ' con una equivalencia fija ingresada manualmente (1 ' + base + ' = ' +
        format.formatNumberTrim(v.fxRate, 8, 2) + ' ' + cur + ', referencia del ' + format.formatIsoDate(v.fxDate) +
        '); no es un pronóstico del tipo de cambio.';
    }
    paras.push({ id: 'limites', title: 'Límites.', text: p6 });

    var words = paras.reduce(function (acc, p) { return acc + countWords(p.title + ' ' + p.text); }, 0);

    var dirWord = function (d) { return d === 'same' ? 'sin cambio' : (d === 'down' ? 'baja' : 'sube'); };
    var comparison = {
      currentMonths: n,
      altMonths: altN,
      rows: [
        { label: 'Plazo', current: format.monthsLabel(n), alt: format.monthsLabel(altN), delta: (dn > 0 ? '+' : format.MINUS) + Math.abs(dn) + ' meses', dir: dn > 0 ? 'up' : 'down' },
        { label: 'Cuota mensual', current: M(v.payment), alt: M(av.payment), delta: dirA === 'same' ? 'sin cambio' : D(dA) + ' (' + dirWord(dirA) + ')', dir: dirA },
        { label: 'Interés total', current: M(v.totalInterest), alt: M(av.totalInterest), delta: dirJ === 'same' ? 'sin cambio' : D(dJ) + ' (' + dirWord(dirJ) + ')', dir: dirJ },
        { label: 'Total pagado', current: M(v.totalPaid), alt: M(av.totalPaid), delta: dirOf(dT) === 'same' ? 'sin cambio' : D(dT) + ' (' + dirWord(dirOf(dT)) + ')', dir: dirOf(dT) },
      ],
    };

    /* Fórmulas con sustitución del escenario actual (importes en la moneda mostrada). */
    var N2 = function (x) { return format.formatNumber(x, 2); };
    var jDec = r.input.annualRatePercent / 100;
    var formulas = [];
    formulas.push({
      title: 'Variables',
      lines: [
        'P = ' + N2(v.principal) + ' (' + cur + ')   ·   n = ' + n + ' meses   ·   tasa ' + rateTypeLabel(r.input.rateType) + ' = ' + rateTxt,
        'i = tasa efectiva mensual = ' + plainRate(i, 10) + '   ·   A = cuota   ·   Iₜ, Kₜ, Bₜ = interés, capital y saldo del mes t',
      ],
    });
    formulas.push({
      title: 'Tasa mensual',
      lines: r.input.rateType === engine.RATE_TYPES.EFFECTIVE
        ? ['i = (1 + e)^(1/12) − 1 = (1 + ' + plainRate(jDec, 6) + ')^(1/12) − 1 = ' + plainRate(i, 10),
          'TEA = (1 + i)^12 − 1 = ' + format.formatPercentTrim(100 * r.effectiveAnnualRate, 6, 2) + ' (coincide con la tasa ingresada)']
        : ['i = j / 12 = ' + plainRate(jDec, 6) + ' / 12 = ' + plainRate(i, 10),
          'TEA equivalente = (1 + i)^12 − 1 = ' + format.formatPercentTrim(100 * r.effectiveAnnualRate, 6, 2)],
    });
    formulas.push({
      title: 'Cuota (factor de recuperación de capital)',
      lines: zero
        ? ['A = P / n = ' + N2(v.principal) + ' / ' + n + ' = ' + N2(v.payment), '(A/P, 0, n) = 1 / n = ' + format.formatNumber(r.capitalRecoveryFactor, 9)]
        : ['A = P × i / [1 − (1 + i)^(−n)] = P × (A/P, i, n)',
          'A = ' + N2(v.principal) + ' × ' + plainRate(i, 10) + ' / [1 − (1 + ' + plainRate(i, 10) + ')^(−' + n + ')] = ' + N2(v.payment),
          '(A/P, i, n) = ' + format.formatNumber(r.capitalRecoveryFactor, 9)],
    });
    formulas.push({
      title: 'Amortización mes a mes',
      lines: [
        'Iₜ = Bₜ₋₁ × i   ·   Kₜ = A − Iₜ   ·   Bₜ = Bₜ₋₁ − Kₜ   ·   B₀ = P',
        'Mes 1: I₁ = ' + N2(v.principal) + ' × ' + plainRate(i, 10) + ' = ' + N2(first.interest) + '; K₁ = ' + N2(first.payment) + ' − ' +
          N2(first.interest) + ' = ' + N2(first.principal) + '; B₁ = ' + N2(first.balance),
        'Último mes: Kₙ = Bₙ₋₁, Aₙ = Bₙ₋₁ + Iₙ = ' + N2(last.payment) + ' y Bₙ = 0 (solo corrige el residuo numérico).',
      ],
    });
    formulas.push({
      title: 'Totales',
      lines: [
        'T = Σ Aₜ = ' + N2(v.totalPaid) + '   ·   J = Σ Iₜ = T − P = ' + N2(v.totalInterest),
        'J/T = ' + format.formatPercent(100 * r.interestShare, 2) + ' de lo pagado   ·   J/P = ' + format.formatPercent(100 * r.interestOverPrincipal, 2) + ' del capital (no es tasa anual)',
      ],
    });
    formulas.push({
      title: 'Equivalencia al origen',
      lines: [
        'P = Σ Aₜ / (1 + i)^t   →   P − Σ Aₜ / (1 + i)^t = ' + format.formatScientific(r.diagnostics.presentValueResidual * v.fxRate, 2) + ' (' + cur + ')',
        'Flujos del deudor: CF₀ = +P; CFₜ = −Aₜ. Efectivo acumulado: Cₜ = P − Σ Aₖ, con Cₙ = −J = ' + N2(v.cashFlows[n].cumulativeCash),
      ],
    });

    return {
      paragraphs: paras,
      wordCount: words,
      comparison: comparison,
      formulas: formulas,
      assumptions: ASSUMPTIONS,
      roundingNote: ROUNDING_NOTE,
      currencyNote: 'Importes en ' + format.currencyOf(cur).plural + ' (' + cur + ').',
    };
  }

  var api = {
    ASSUMPTIONS: ASSUMPTIONS,
    ROUNDING_NOTE: ROUNDING_NOTE,
    countWords: countWords,
    rateTypeLabel: rateTypeLabel,
    buildAnalysis: buildAnalysis,
  };

  if (isNode) module.exports = api;
  else {
    root.TRAZA = root.TRAZA || {};
    root.TRAZA.analysis = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
