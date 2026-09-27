/* ==========================================================================
   VÉRTICE · Exportación CSV para Power BI (§12.2)
   UTF-8 con BOM, coma como separador, punto decimal, cabeceras estables sin
   tildes, números completos sin símbolos y texto neutralizado ante fórmulas.
   ========================================================================== */
(function (root) {
  'use strict';

  var format = (typeof module === 'object' && module.exports) ? require('./format.js') : root.TRAZA.format;

  var BOM = '﻿';
  var EOL = '\r\n';

  /* Identificador estable del escenario (FNV-1a de sus datos efectivos). */
  function scenarioId(input, presentation) {
    var key = [
      input.principalBase, input.baseCurrency, input.annualRatePercent, input.rateType, input.months,
      presentation.mode, presentation.displayCurrency, presentation.fxRate,
      presentation.fxDate || '', presentation.fxSource || '',
    ].join('|');
    var h = 0x811c9dc5;
    for (var k = 0; k < key.length; k++) {
      h ^= key.charCodeAt(k);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return 'VRT-' + ('00000000' + h.toString(16).toUpperCase()).slice(-8);
  }

  function csvText(value) {
    var s = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function csvNumber(value) { return format.plainNumber(value); }

  function table(header, rows) {
    return BOM + header.join(',') + EOL + rows.map(function (r) { return r.join(','); }).join(EOL) + EOL;
  }

  /* snap = { scenarioId, generatedAt: Date, result, view } */
  function buildCsvFiles(snap) {
    var r = snap.result;
    var v = snap.view;
    var id = csvText(snap.scenarioId);
    var cur = csvText(v.currency);
    var conversion = v.mode === 'conversion';

    var escenario = table([
      'scenario_id', 'generated_at', 'principal_base', 'principal_display', 'base_currency', 'display_currency',
      'currency_mode', 'fx_rate', 'fx_date', 'fx_source', 'annual_rate_percent', 'rate_type', 'monthly_rate_decimal',
      'months', 'payment', 'total_interest', 'total_paid', 'effective_annual_rate_decimal', 'last_payment', 'interest_share_of_total',
    ], [[
      id,
      csvText(snap.generatedAt.toISOString()),
      csvNumber(r.input.principalBase),
      csvNumber(v.principal),
      csvText(r.input.baseCurrency),
      cur,
      conversion ? 'conversion' : 'denomination',
      csvNumber(conversion ? v.fxRate : 1),
      csvText(conversion ? v.fxDate : ''),
      csvText(conversion ? v.fxSource : ''),
      csvNumber(r.input.annualRatePercent),
      csvText(r.input.rateType),
      csvNumber(r.monthlyRate),
      String(r.input.months),
      csvNumber(v.payment),
      csvNumber(v.totalInterest),
      csvNumber(v.totalPaid),
      csvNumber(r.effectiveAnnualRate),
      csvNumber(v.lastPayment),
      csvNumber(r.interestShare),
    ]]);

    var amortizacion = table(
      ['scenario_id', 'month', 'payment', 'principal_component', 'interest_component', 'remaining_balance', 'currency'],
      v.schedule.map(function (row) {
        return [id, String(row.month), csvNumber(row.payment), csvNumber(row.principal), csvNumber(row.interest), csvNumber(row.balance), cur];
      })
    );

    var flujos = table(
      ['scenario_id', 'month', 'cash_flow', 'cumulative_cash', 'debt_balance', 'currency'],
      v.cashFlows.map(function (f) {
        return [id, String(f.month), csvNumber(f.flow), csvNumber(f.cumulativeCash), csvNumber(f.debtBalance), cur];
      })
    );

    return {
      escenario: { filename: 'vertice_escenario.csv', text: escenario, rows: 1 },
      amortizacion: { filename: 'vertice_amortizacion.csv', text: amortizacion, rows: v.schedule.length },
      flujos: { filename: 'vertice_flujos.csv', text: flujos, rows: v.cashFlows.length },
    };
  }

  function pdfFilename(snap) {
    var v = snap.view;
    var r = snap.result;
    var cur = r.input.baseCurrency + (v.mode === 'conversion' ? '-en-' + v.currency : '');
    return 'VERTICE_prestamo_' + cur + '_' + r.input.months + 'm_' + format.isoDateLocal(snap.generatedAt) + '.pdf';
  }

  var api = {
    scenarioId: scenarioId,
    csvText: csvText,
    buildCsvFiles: buildCsvFiles,
    pdfFilename: pdfFilename,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.TRAZA = root.TRAZA || {};
    root.TRAZA.csv = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
