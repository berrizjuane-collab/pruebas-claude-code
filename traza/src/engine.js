/* ==========================================================================
   VÉRTICE · Motor financiero puro
   Sistema francés, pagos mensuales vencidos, tasa fija, amortización completa.
   No conoce el DOM ni símbolos de moneda: recibe números y devuelve números.
   ========================================================================== */
(function (root) {
  'use strict';

  var RATE_TYPES = Object.freeze({ NOMINAL: 'nominal_annual', EFFECTIVE: 'effective_annual' });

  var LIMITS = Object.freeze({
    principalMin: 100,
    principalMax: 1000000000,
    rateMin: 0,
    rateMax: 100,
    monthsMin: 1,
    monthsMax: 600,
  });

  function EngineError(message, details) {
    var err = new Error(message);
    err.name = 'EngineError';
    err.details = details || null;
    return err;
  }

  /* Suma compensada de Neumaier: evita perder centavos al acumular 600 términos. */
  function createSum() {
    var s = 0;
    var c = 0;
    return {
      add: function (x) {
        var t = s + x;
        if (Math.abs(s) >= Math.abs(x)) c += (s - t) + x;
        else c += (x - t) + s;
        s = t;
      },
      value: function () { return s + c; },
    };
  }

  /* Tolerancia monetaria del motor, en moneda base (§6.4). */
  function toleranceFor(principal) {
    return Math.max(1e-7, principal * 1e-10);
  }

  /* i a partir del porcentaje anual de la interfaz (12 → 12 %). */
  function monthlyRateFromAnnual(annualRatePercent, rateType) {
    var r = annualRatePercent / 100;
    if (rateType === RATE_TYPES.NOMINAL) return r / 12;
    if (rateType === RATE_TYPES.EFFECTIVE) return Math.expm1(Math.log1p(r) / 12);
    throw EngineError('Tipo de tasa desconocido: ' + rateType);
  }

  /* TEA = (1 + i)^12 − 1 */
  function effectiveAnnualFromMonthly(i) {
    return Math.expm1(12 * Math.log1p(i));
  }

  /* Factor de recuperación de capital (A/P, i, n). */
  function capitalRecoveryFactor(i, n) {
    if (i === 0) return 1 / n;
    return i / (-Math.expm1(-n * Math.log1p(i)));
  }

  function validateLoanInput(input) {
    if (!input || typeof input !== 'object') throw EngineError('Faltan los datos del préstamo.');
    var P = input.principalBase;
    var rate = input.annualRatePercent;
    var n = input.months;
    if (typeof P !== 'number' || !isFinite(P) || P < LIMITS.principalMin || P > LIMITS.principalMax) {
      throw EngineError('Monto fuera del dominio del modelo.', { field: 'principalBase', value: P });
    }
    if (typeof rate !== 'number' || !isFinite(rate) || rate < LIMITS.rateMin || rate > LIMITS.rateMax) {
      throw EngineError('Tasa fuera del dominio del modelo.', { field: 'annualRatePercent', value: rate });
    }
    if (typeof n !== 'number' || !isFinite(n) || Math.floor(n) !== n || n < LIMITS.monthsMin || n > LIMITS.monthsMax) {
      throw EngineError('Plazo fuera del dominio del modelo.', { field: 'months', value: n });
    }
    if (input.rateType !== RATE_TYPES.NOMINAL && input.rateType !== RATE_TYPES.EFFECTIVE) {
      throw EngineError('Tipo de tasa desconocido.', { field: 'rateType', value: input.rateType });
    }
  }

  /* Flujos del deudor: CF_0 = +P, CF_t = −A_t; C_t es suma nominal (sin capitalizar). */
  function buildCashFlows(principal, schedule) {
    var flows = new Array(schedule.length + 1);
    var cumulative = createSum();
    cumulative.add(principal);
    flows[0] = Object.freeze({ month: 0, flow: principal, cumulativeCash: principal, debtBalance: principal });
    for (var t = 0; t < schedule.length; t++) {
      var row = schedule[t];
      cumulative.add(-row.payment);
      flows[t + 1] = Object.freeze({
        month: row.month,
        flow: -row.payment,
        cumulativeCash: cumulative.value(),
        debtBalance: row.balance,
      });
    }
    return Object.freeze(flows);
  }

  function assertFinite(value, label) {
    if (typeof value !== 'number' || !isFinite(value)) {
      throw EngineError('El motor produjo un valor no finito (' + label + ').', { label: label });
    }
  }

  /**
   * Calcula el préstamo completo con la formulación estable de §6.4:
   *   z = log1p(i)
   *   A   = P·i / (−expm1(−n·z))
   *   K_t = A·exp(−(n−t+1)·z)
   *   I_t = A − K_t
   *   B_t = A·(−expm1(−(n−t)·z)) / i
   * Último mes: K_n = B_(n−1), A_n = B_(n−1) + I_n, B_n = 0 (solo corrige residuo).
   */
  function calculateLoan(input) {
    validateLoanInput(input);
    var P = input.principalBase;
    var n = input.months;
    var i = monthlyRateFromAnnual(input.annualRatePercent, input.rateType);
    assertFinite(i, 'tasa mensual');
    if (i < 0) throw EngineError('Tasa mensual negativa.');

    var eps = toleranceFor(P);
    var schedule = new Array(n);
    var A;
    var t;

    if (i === 0) {
      A = P / n;
      for (t = 1; t <= n; t++) {
        var k0 = P / n;
        schedule[t - 1] = { month: t, payment: k0, principal: k0, interest: 0, balance: t === n ? 0 : P * (n - t) / n };
      }
    } else {
      var z = Math.log1p(i);
      A = P * i / (-Math.expm1(-n * z));
      for (t = 1; t < n; t++) {
        var principal = A * Math.exp(-(n - t + 1) * z);
        schedule[t - 1] = {
          month: t,
          payment: A,
          principal: principal,
          interest: A - principal,
          balance: A * (-Math.expm1(-(n - t) * z)) / i,
        };
      }
      var prevBalance = n === 1 ? P : schedule[n - 2].balance;
      var stableLastPrincipal = A * Math.exp(-z);
      var lastInterest = A - stableLastPrincipal;
      schedule[n - 1] = {
        month: n,
        payment: prevBalance + lastInterest,
        principal: prevBalance,
        interest: lastInterest,
        balance: 0,
      };
    }

    assertFinite(A, 'cuota');

    /* Totales y verificación de identidades (§16.2). */
    var sumPaid = createSum();
    var sumInterest = createSum();
    var sumPrincipal = createSum();
    var pv = createSum();
    var z2 = Math.log1p(i);
    var maxRowIdentity = 0;
    var maxBalanceStep = 0;
    var prev = P;
    for (t = 0; t < n; t++) {
      var r = schedule[t];
      assertFinite(r.payment, 'pago del mes ' + r.month);
      assertFinite(r.principal, 'capital del mes ' + r.month);
      assertFinite(r.interest, 'interés del mes ' + r.month);
      assertFinite(r.balance, 'saldo del mes ' + r.month);
      sumPaid.add(r.payment);
      sumInterest.add(r.interest);
      sumPrincipal.add(r.principal);
      pv.add(i === 0 ? r.payment : r.payment * Math.exp(-r.month * z2));
      maxRowIdentity = Math.max(maxRowIdentity, Math.abs(r.payment - (r.principal + r.interest)));
      maxBalanceStep = Math.max(maxBalanceStep, Math.abs(r.balance - (prev - r.principal)));
      if (r.balance < -eps) throw EngineError('Saldo negativo más allá de la tolerancia en el mes ' + r.month + '.');
      if (r.balance > prev + eps) throw EngineError('La deuda creció en el mes ' + r.month + '.');
      if (r.interest < -eps) throw EngineError('Interés negativo en el mes ' + r.month + '.');
      prev = r.balance;
      Object.freeze(r);
    }

    var totalPaid = sumPaid.value();
    var totalInterest = sumInterest.value();
    var closure = schedule[n - 1].payment - A;
    var diagnostics = Object.freeze({
      epsilon: eps,
      presentValueResidual: P - pv.value(),
      balanceResidual: closure,
      maxRowIdentityError: maxRowIdentity,
      maxBalanceStepError: maxBalanceStep,
      principalSumError: sumPrincipal.value() - P,
      totalsIdentityError: totalPaid - (P + totalInterest),
    });

    var checks = [
      ['cierre del último mes', diagnostics.balanceResidual],
      ['identidad cuota = capital + interés', diagnostics.maxRowIdentityError],
      ['recurrencia del saldo', diagnostics.maxBalanceStepError],
      ['suma de capital', diagnostics.principalSumError],
      ['total = capital + intereses', diagnostics.totalsIdentityError],
      ['equivalencia de valor presente', diagnostics.presentValueResidual],
    ];
    for (var c = 0; c < checks.length; c++) {
      assertFinite(checks[c][1], checks[c][0]);
      if (Math.abs(checks[c][1]) > eps) {
        throw EngineError('Falla del motor: ' + checks[c][0] + ' fuera de tolerancia.', { check: checks[c][0], value: checks[c][1], epsilon: eps });
      }
    }

    Object.freeze(schedule);
    var cashFlows = buildCashFlows(P, schedule);
    if (Math.abs(cashFlows[n].cumulativeCash + totalInterest) > eps) {
      throw EngineError('Falla del motor: efectivo acumulado final distinto de −J.');
    }

    return Object.freeze({
      input: Object.freeze({
        principalBase: P,
        baseCurrency: input.baseCurrency,
        annualRatePercent: input.annualRatePercent,
        rateType: input.rateType,
        months: n,
      }),
      monthlyRate: i,
      effectiveAnnualRate: effectiveAnnualFromMonthly(i),
      capitalRecoveryFactor: capitalRecoveryFactor(i, n),
      payment: A,
      lastPayment: schedule[n - 1].payment,
      totalPaid: totalPaid,
      totalInterest: totalInterest,
      interestShare: totalPaid > 0 ? totalInterest / totalPaid : 0,
      interestOverPrincipal: totalInterest / P,
      schedule: schedule,
      cashFlows: cashFlows,
      diagnostics: diagnostics,
    });
  }

  /* Regla de §10.2: n ≤ 588 → n + 12; n > 588 → n − 12. */
  function alternativeMonths(n) {
    return n <= 588 ? n + 12 : n - 12;
  }

  function calculateAlternative(input) {
    var copy = {};
    for (var k in input) if (Object.prototype.hasOwnProperty.call(input, k)) copy[k] = input[k];
    copy.months = alternativeMonths(input.months);
    return calculateLoan(copy);
  }

  /**
   * Vista derivada en la moneda de presentación: x_destino = x_base × q.
   * Nunca modifica el resultado base; siempre parte de él (sin deriva).
   */
  function convertResult(result, presentation) {
    var q = presentation && presentation.mode === 'conversion' ? presentation.fxRate : 1;
    if (typeof q !== 'number' || !isFinite(q) || q <= 0) throw EngineError('Tipo de cambio no válido.');
    var same = q === 1;
    var schedule = same ? result.schedule : Object.freeze(result.schedule.map(function (r) {
      return Object.freeze({ month: r.month, payment: r.payment * q, principal: r.principal * q, interest: r.interest * q, balance: r.balance * q });
    }));
    var cashFlows = same ? result.cashFlows : Object.freeze(result.cashFlows.map(function (f) {
      return Object.freeze({ month: f.month, flow: f.flow * q, cumulativeCash: f.cumulativeCash * q, debtBalance: f.debtBalance * q });
    }));
    return Object.freeze({
      currency: presentation && presentation.displayCurrency ? presentation.displayCurrency : result.input.baseCurrency,
      baseCurrency: result.input.baseCurrency,
      mode: presentation && presentation.mode === 'conversion' ? 'conversion' : 'denomination',
      fxRate: q,
      fxDate: presentation && presentation.mode === 'conversion' ? presentation.fxDate : '',
      fxSource: presentation && presentation.mode === 'conversion' ? presentation.fxSource : '',
      principal: result.input.principalBase * q,
      payment: result.payment * q,
      lastPayment: result.lastPayment * q,
      totalPaid: result.totalPaid * q,
      totalInterest: result.totalInterest * q,
      schedule: schedule,
      cashFlows: cashFlows,
    });
  }

  var api = {
    RATE_TYPES: RATE_TYPES,
    LIMITS: LIMITS,
    EngineError: EngineError,
    createSum: createSum,
    toleranceFor: toleranceFor,
    monthlyRateFromAnnual: monthlyRateFromAnnual,
    effectiveAnnualFromMonthly: effectiveAnnualFromMonthly,
    capitalRecoveryFactor: capitalRecoveryFactor,
    calculateLoan: calculateLoan,
    buildCashFlows: buildCashFlows,
    alternativeMonths: alternativeMonths,
    calculateAlternative: calculateAlternative,
    convertResult: convertResult,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.TRAZA = root.TRAZA || {};
    root.TRAZA.engine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
