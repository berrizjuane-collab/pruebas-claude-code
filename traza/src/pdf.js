/* ==========================================================================
   VÉRTICE · Informe PDF (§11)
   A4 vertical en pt con la identidad VÉRTICE: serif para títulos (Gelasio,
   sustituto abierto de Georgia) y sans serif para el cálculo (Noto Sans,
   sustituto abierto de Segoe UI), incrustadas; texto seleccionable, gráficas
   vectoriales desde las mismas escenas de la pantalla y tabla completa con
   encabezados repetidos. Se genera siempre a partir de una instantánea
   inmutable del escenario.
   ========================================================================== */
(function (root) {
  'use strict';

  var T = root.TRAZA;
  var format = T.format;
  var charts = T.charts;
  var engine = T.engine;
  var analysis = T.analysis;
  var csv = T.csv;
  var C = charts.COLORS;

  /* Paleta de marca para el informe (texto siempre con contraste suficiente). */
  var V = {
    green: '#10372F',
    graphite: '#2B3430',
    copper: '#B56C4D',
    copperText: '#96533A',
    gold: '#C5A25D',
    ivory: '#F4F1E8',
    surface: '#FCFBF7',
    line: '#DDE2DD',
    sage: '#E6EDE7',
    sageLine: '#CCD7D0',
    muted: '#5F6963',
  };
  var SANS = 'VerticeSans';
  var SERIF = 'VerticeSerif';
  var EMBLEM_RATIO = 400 / 303;

  var PAGE = { w: 595.28, h: 841.89, margin: 46, top: 72, bottom: 54 };
  var CONTENT_W = PAGE.w - PAGE.margin * 2;
  var BODY = 10;
  var LINE = 1.45;

  function tick() { return new Promise(function (resolve) { setTimeout(resolve, 0); }); }

  /* Sustituye cualquier carácter sin glifo en la fuente incrustada (evita .notdef). */
  function makeSanitizer(cmap) {
    var set = new Set(cmap || []);
    return function (s) {
      var out = '';
      for (var ch of String(s)) {
        var cp = ch.codePointAt(0);
        out += (cp === 10 || set.has(cp)) ? ch : '?';
      }
      return out;
    };
  }

  function Writer(doc, snap, env) {
    this.doc = doc;
    this.snap = snap;
    this.env = env;
    this.y = PAGE.margin;
    var cmap = env.cmap || {};
    this.clean = makeSanitizer(Array.isArray(cmap) ? cmap : cmap.sans);
    this.cleanSerif = makeSanitizer(Array.isArray(cmap) ? cmap : cmap.serif);
  }

  /* Sans serif para el cálculo: 400 normal, 600 seminegrita. */
  Writer.prototype.font = function (weight, size, color) {
    this.doc.setFont(SANS, weight >= 600 ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(color || V.graphite);
  };

  /* Serif para la idea: títulos y firma. */
  Writer.prototype.serif = function (size, color) {
    this.doc.setFont(SERIF, 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(color || V.green);
  };

  Writer.prototype.serifText = function (s, x, y, size, color, opts) {
    this.serif(size, color);
    this.doc.text(this.cleanSerif(s), x, y, opts || {});
  };

  /* Etiqueta en versalitas espaciadas (cobre legible sobre blanco). */
  Writer.prototype.eyebrow = function (s, x, y, color, size) {
    this.font(600, size || 7.2, color || V.copperText);
    this.doc.text(this.clean(String(s).toUpperCase()), x, y, { charSpace: 1.1 });
  };

  Writer.prototype.measure = function () {
    var doc = this.doc;
    var clean = this.clean;
    return function (text, size, weight) {
      doc.setFont(SANS, weight >= 600 ? 'bold' : 'normal');
      doc.setFontSize(size);
      return doc.getTextWidth(clean(text));
    };
  };

  Writer.prototype.newPage = function () {
    this.doc.addPage('a4', 'portrait');
    this.y = PAGE.top;
  };

  Writer.prototype.ensure = function (h) {
    if (this.y + h > PAGE.h - PAGE.bottom) this.newPage();
  };

  Writer.prototype.text = function (s, x, y, opts) {
    this.doc.text(this.clean(s), x, y, opts || {});
  };

  /* Párrafo con salto de línea real. */
  Writer.prototype.paragraph = function (s, opts) {
    opts = opts || {};
    var size = opts.size || BODY;
    var width = opts.width || CONTENT_W;
    var x = opts.x === undefined ? PAGE.margin : opts.x;
    this.font(opts.weight || 400, size, opts.color);
    var lines = this.doc.splitTextToSize(this.clean(s), width);
    var lh = size * (opts.lineHeight || LINE);
    for (var k = 0; k < lines.length; k++) {
      this.ensure(lh);
      this.doc.text(lines[k], x, this.y + size * 0.8);
      this.y += lh;
    }
    this.y += opts.after === undefined ? 4 : opts.after;
  };

  /* Párrafo con un título en seminegrita verde al inicio (misma línea). */
  Writer.prototype.leadParagraph = function (lead, s) {
    var doc = this.doc;
    this.font(600, BODY);
    var leadW = doc.getTextWidth(this.clean(lead) + ' ');
    this.font(400, BODY);
    var first = doc.splitTextToSize(this.clean(s), CONTENT_W - leadW);
    var rest = first.length > 1 ? doc.splitTextToSize(this.clean(first.slice(1).join(' ')), CONTENT_W) : [];
    var lh = BODY * LINE;
    this.ensure(lh * 2);
    this.font(600, BODY, V.green);
    doc.text(this.clean(lead), PAGE.margin, this.y + BODY * 0.8);
    this.font(400, BODY);
    doc.text(first[0] || '', PAGE.margin + leadW, this.y + BODY * 0.8);
    this.y += lh;
    for (var k = 0; k < rest.length; k++) {
      this.ensure(lh);
      doc.text(rest[k], PAGE.margin, this.y + BODY * 0.8);
      this.y += lh;
    }
    this.y += 5;
  };

  Writer.prototype.section = function (eyebrow, title, keepWith) {
    this.ensure(48 + (keepWith || 0));
    this.y += 6;
    this.eyebrow(eyebrow, PAGE.margin, this.y + 7);
    this.serifText(title, PAGE.margin, this.y + 27, 17, V.green);
    this.y += 40;
  };

  Writer.prototype.subtitle = function (s, y) {
    this.serifText(s, PAGE.margin, y, 12.5, V.green);
  };

  Writer.prototype.bullets = function (items, size) {
    var doc = this.doc;
    size = size || BODY;
    var lh = size * LINE;
    for (var k = 0; k < items.length; k++) {
      this.font(400, size);
      var lines = doc.splitTextToSize(this.clean(items[k]), CONTENT_W - 14);
      this.ensure(lh * lines.length);
      doc.setFillColor(V.gold);
      doc.circle(PAGE.margin + 3, this.y + size * 0.45, 1.7, 'F');
      for (var j = 0; j < lines.length; j++) {
        doc.text(lines[j], PAGE.margin + 12, this.y + size * 0.8);
        this.y += lh;
      }
      this.y += 1.5;
    }
    this.y += 4;
  };

  Writer.prototype.scene = function (scene, x) {
    charts.drawPdf(this.doc, scene, x === undefined ? PAGE.margin : x, this.y, { fontName: SANS, sanitize: this.clean });
  };

  /* Firma: emblema oficial (imagen de la guía, sin reconstruir) sobre su loseta
     marfil, igual que en la interfaz («emblema sobre marfil»), y la palabra en
     verde profundo. `tile` es el lado de la loseta en pt; el emblema ocupa 3/4
     de su ancho, así el área de respeto (1/6 de su altura) queda dentro. */
  Writer.prototype.signature = function (x, y, tile, withDescriptor) {
    var doc = this.doc;
    var tx = x;
    if (this.env.emblem) {
      var ew = tile * 0.75;
      var eh = ew / EMBLEM_RATIO;
      doc.setFillColor(V.ivory);
      doc.roundedRect(x, y, tile, tile, tile * 0.25, tile * 0.25, 'F');
      doc.addImage(this.env.emblem, 'PNG', x + (tile - ew) / 2, y + (tile - eh) / 2, ew, eh, 'vertice-emblema', 'FAST');
      tx = x + tile * 1.3;
    }
    var size = tile * (withDescriptor ? 0.6 : 0.46);
    var base = withDescriptor ? y + tile * 0.58 : y + tile * 0.5 + size * 0.35;
    this.serifText('VÉRTICE', tx, base, size, V.green, { charSpace: size * 0.05 });
    if (withDescriptor) {
      this.font(600, tile * 0.2, V.muted);
      doc.text(this.clean('INGENIERÍA ECONÓMICA'), tx + 0.5, y + tile * 0.88, { charSpace: tile * 0.2 * 0.24 });
    }
    return tx;
  };

  function moneyFn(cur) {
    return function (x, sign) { return format.formatMoney(x, cur, { sign: sign || 'auto' }); };
  }

  /* ---------------------------------------------------------------------
     Secciones
     --------------------------------------------------------------------- */
  function cover(w) {
    var doc = w.doc;
    var s = w.snap;
    var r = s.result;
    var v = s.view;
    var M = moneyFn(v.currency);
    var nominal = r.input.rateType === engine.RATE_TYPES.NOMINAL;

    w.signature(PAGE.margin, PAGE.margin - 10, 40, true);
    w.serifText('El valor correcto. En la fecha correcta.', PAGE.w - PAGE.margin, PAGE.margin + 13, 9.5, V.green, { align: 'right' });
    doc.setDrawColor(V.gold);
    doc.setLineWidth(0.9);
    doc.line(PAGE.margin, PAGE.margin + 38, PAGE.w - PAGE.margin, PAGE.margin + 38);

    w.y = PAGE.margin + 58;
    w.eyebrow('Informe de préstamo · ' + s.config.course, PAGE.margin, w.y);
    w.serifText('Informe de préstamo', PAGE.margin, w.y + 30, 26, V.green);
    w.font(400, 9, V.muted);
    w.text('Generado el ' + format.formatDateLocal(s.generatedAt) + ' a las ' + format.formatTimeLocal(s.generatedAt) +
      ' (hora local del dispositivo) · Escenario ' + s.scenarioId, PAGE.margin, w.y + 48);
    w.y += 64;

    /* Cuota destacada en la caja salvia de la pantalla de producto. */
    var boxH = 96;
    doc.setFillColor(V.sage);
    doc.setDrawColor(V.sageLine);
    doc.setLineWidth(0.8);
    doc.roundedRect(PAGE.margin, w.y, CONTENT_W, boxH, 10, 10, 'FD');
    w.eyebrow('Cuota mensual estimada', PAGE.margin + 18, w.y + 22, V.green);
    var amount = M(v.payment);
    var size = 30;
    w.font(600, size, V.green);
    while (size > 16 && doc.getTextWidth(w.clean(amount)) > CONTENT_W * 0.56) { size -= 1; w.font(600, size, V.green); }
    w.text(amount, PAGE.margin + 18, w.y + 57);
    /* Columna izquierda hasta el divisor y columna derecha hasta el borde: los
       textos se reducen si hace falta para no cruzar ninguno de los dos. */
    var rx = PAGE.margin + CONTENT_W * 0.64;
    var fitFont = function (s, weight, max, maxWidth, min, color) {
      var fs = max;
      w.font(weight, fs, color);
      while (fs > min && doc.getTextWidth(w.clean(s)) > maxWidth) { fs -= 0.25; w.font(weight, fs, color); }
    };
    var meta = format.monthsLabel(r.input.months) + ' · tasa ' + (nominal ? 'nominal' : 'efectiva') + ' anual ' +
      format.formatPercentTrim(r.input.annualRatePercent, 4, 2) + ' · tasa mensual ' + format.formatPercentTrim(r.monthlyRate * 100, 6, 2);
    fitFont(meta, 400, 9, rx - 22 - (PAGE.margin + 18), 7, V.graphite);
    w.text(meta, PAGE.margin + 18, w.y + 79);
    doc.setDrawColor(V.sageLine);
    doc.line(rx - 14, w.y + 16, rx - 14, w.y + boxH - 16);
    [['Interés total', M(v.totalInterest)], ['Total pagado', M(v.totalPaid)]].forEach(function (pair, k) {
      w.eyebrow(pair[0], rx, w.y + 27 + k * 34, V.green, 6.8);
      fitFont(pair[1], 600, 12, PAGE.margin + CONTENT_W - 14 - rx, 8, V.graphite);
      w.text(pair[1], rx, w.y + 43 + k * 34);
    });
    w.y += boxH + 18;

    /* Parámetros */
    var fxLine = v.mode === 'conversion'
      ? 'Conversión: 1 ' + r.input.baseCurrency + ' = ' + format.formatNumberTrim(v.fxRate, 8, 2) + ' ' + v.currency +
        ' · referencia del ' + format.formatIsoDate(v.fxDate) + ' · fuente: ' + v.fxSource + '. Importes del informe en ' + v.currency + '.'
      : 'Moneda del préstamo (denominación): todos los importes están en ' + v.currency + '; no se aplicó tipo de cambio.';
    var params = [
      ['Monto del préstamo', format.formatMoney(r.input.principalBase, r.input.baseCurrency) + ' (' + r.input.baseCurrency + ')'],
      ['Moneda del préstamo', format.currencyOf(r.input.baseCurrency).name + ' (' + r.input.baseCurrency + ')'],
      ['Presentación de importes', fxLine],
      ['Tipo de tasa', nominal ? 'Nominal anual capitalizable mensualmente (i = j / 12)' : 'Efectiva anual (i = (1 + e)^(1/12) − 1)'],
      ['Tasa anual ingresada', format.formatPercentTrim(r.input.annualRatePercent, 4, 2)],
      ['Tasa mensual equivalente (i)', format.formatPercentTrim(r.monthlyRate * 100, 6, 2) + ' (' + format.formatNumberTrim(r.monthlyRate, 10, 2) + ')'],
      ['Tasa efectiva anual equivalente', format.formatPercentTrim(r.effectiveAnnualRate * 100, 4, 2)],
      ['Plazo', format.monthsLabel(r.input.months) + ' · primer pago al final del mes 1'],
    ];
    w.subtitle('Parámetros del escenario', w.y + 10);
    w.y += 17;
    doc.autoTable({
      startY: w.y,
      margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.top, bottom: PAGE.bottom },
      body: params.map(function (p) { return [w.clean(p[0]), w.clean(p[1])]; }),
      theme: 'plain',
      styles: { font: SANS, fontSize: BODY, textColor: V.graphite, cellPadding: { top: 3.5, bottom: 3.5, left: 0, right: 8 }, lineColor: V.line, lineWidth: { bottom: 0.6 } },
      columnStyles: { 0: { cellWidth: 170, fontStyle: 'bold', textColor: V.muted } },
      rowPageBreak: 'avoid',
    });
    w.y = doc.lastAutoTable.finalY + 18;

    /* Resumen en tarjetas */
    w.ensure(110);
    w.subtitle('Resumen', w.y + 10);
    w.y += 19;
    var kpis = [
      ['Capital inicial', M(v.principal), C.capital],
      ['Interés total', M(v.totalInterest), C.interest],
      ['Total pagado', M(v.totalPaid), null],
      ['Intereses del total pagado (J/T)', format.formatPercent(100 * r.interestShare, 1), null],
    ];
    var gap = 8;
    var kw = (CONTENT_W - gap * 3) / 4;
    kpis.forEach(function (k, idx) {
      var x = PAGE.margin + idx * (kw + gap);
      doc.setDrawColor(V.line);
      doc.setFillColor(V.surface);
      doc.setLineWidth(0.8);
      doc.roundedRect(x, w.y, kw, 54, 6, 6, 'FD');
      if (k[2]) { doc.setFillColor(k[2]); doc.rect(x + 10, w.y + 11, 6, 6, 'F'); }
      w.font(600, 7, V.muted);
      var label = doc.splitTextToSize(w.clean(k[0]), kw - (k[2] ? 28 : 20));
      doc.text(label, x + (k[2] ? 20 : 10), w.y + 16);
      var vs = 12;
      w.font(600, vs, V.graphite);
      while (vs > 7 && doc.getTextWidth(w.clean(k[1])) > kw - 20) { vs -= 0.5; w.font(600, vs, V.graphite); }
      w.text(k[1], x + 10, w.y + 44);
    });
    w.y += 64;
    w.paragraph('Intereses respecto al capital (J/P): ' + format.formatPercent(100 * r.interestOverPrincipal, 1) +
      '. Es un porcentaje acumulado de toda la operación; no es una tasa anual ni una TAE regulatoria.', { size: BODY, color: V.graphite });

    w.y += 4;
    w.ensure(30);
    w.subtitle('Supuestos del modelo', w.y + 10);
    w.y += 19;
    w.bullets(analysis.ASSUMPTIONS);
  }

  function chartsPage(w) {
    var s = w.snap;
    var r = s.result;
    var v = s.view;
    var n = r.input.months;
    var M = moneyFn(v.currency);
    var measure = w.measure();
    var pct = format.compositionPercents(v.principal, v.totalInterest);

    w.section('Composición y saldo', 'Composición del total pagado y saldo de deuda', 200);
    var top = w.y;
    var donut = charts.buildDonutScene({
      size: 128, legend: true, legendWidth: 108, legendHeight: 150, measure: measure,
      total: v.totalPaid, interest: v.totalInterest, centerLabel: 'Total pagado', centerValue: M(v.totalPaid),
      centerCompact: format.compactMoney(v.totalPaid, v.currency),
      centerSize: 10, centerLabelSize: 7, legendSize: 8, legendLineHeight: 36,
      legendRows: [
        { color: C.capital, name: 'Capital · ' + format.formatPercent(pct.capital, 1), value: M(v.principal) },
        { color: C.interest, name: 'Intereses · ' + format.formatPercent(pct.interest, 1), value: M(v.totalInterest) },
        { color: null, name: 'Total pagado · 100,0 %', value: M(v.totalPaid) },
      ],
    });
    w.serifText('Composición del total pagado', PAGE.margin, top + 6, 10.5, V.green);
    w.y = top + 14;
    w.scene(donut, PAGE.margin);

    var debtVals = v.cashFlows.map(function (f) { return f.debtBalance; });
    var lx = PAGE.margin + 262;
    var debt = charts.buildBalanceScene({
      w: CONTENT_W - 262, h: 168, kind: 'debt', values: debtVals, n: n, measure: measure,
      unitLabel: 'Saldo de deuda (' + v.currency + ')', tickSize: 7.5, labelSize: 7.5, lineWidth: 1.8, dotR: 1.8,
      endLabel: 'Mes ' + n + ': ' + M(debtVals[n]),
    });
    w.serifText('Deuda pendiente al final de cada mes', lx, top + 6, 10.5, V.green);
    w.y = top + 14;
    w.scene(debt, lx);
    w.y = top + 14 + Math.max(donut.h, debt.h) + 8;
    w.paragraph('La deuda inicia en ' + M(v.principal) + ' (mes 0) y termina en cero; no es el saldo de una cuenta bancaria. ' +
      'Colores: capital y saldo de deuda = verde; intereses = cobre.', { size: 8.5, color: V.muted });
  }

  function flowPage(w) {
    var s = w.snap;
    var r = s.result;
    var v = s.view;
    var n = r.input.months;
    var M = moneyFn(v.currency);
    var measure = w.measure();
    var pays = v.schedule.map(function (row) { return row.payment; });
    var allEqual = format.roundHalfAway(pays[n - 1], 2) === format.roundHalfAway(pays[0], 2);

    w.section('Flujo de efectivo', 'Diagrama de flujo de efectivo · perspectiva del deudor', 230);
    var flow = charts.buildCashFlowScene({
      w: CONTENT_W, h: 200, n: n, principal: v.principal, payments: pays, mode: 'schema', layout: 'fit',
      money: M, measure: measure, fontSize: 8.5, tickSize: 7.5, allEqual: allEqual,
    });
    w.scene(flow);
    w.y += flow.h + 6;
    var lines = [
      'Entrada inicial: ' + M(v.principal, 'always') + ' en el mes 0 (desembolso recibido; flecha hacia arriba).',
      n + (n === 1 ? ' salida' : ' salidas mensuales') + ' de ' + M(-v.payment) + (n === 1 ? ' en el mes 1' : ' (meses 1 a ' + n + ')') +
        (allEqual ? '' : '; la última es de ' + M(-v.lastPayment)) + '. Total de salidas: ' + M(-v.totalPaid) + '.',
      'Esquema temporal; longitudes de flecha no proporcionales. Cada cuota es una salida completa (capital más intereses).',
    ];
    if (flow.layout.grouped) {
      flow.layout.tramos.forEach(function (tr) {
        var count = tr.to - tr.from + 1;
        lines.push('Pagos mensuales del mes ' + tr.from + ' al ' + tr.to + ': ' + count + (count === 1 ? ' pago' : ' pagos') + ' de ' + M(-pays[tr.from - 1]) + '.');
      });
    }
    w.bullets(lines, 9);

    w.section('Efectivo acumulado', 'Efectivo acumulado del préstamo', 200);
    var cash = charts.buildBalanceScene({
      w: CONTENT_W, h: 170, kind: 'cash', values: v.cashFlows.map(function (f) { return f.cumulativeCash; }), n: n, measure: measure,
      unitLabel: 'Efectivo acumulado del préstamo (' + v.currency + ')', tickSize: 7.5, labelSize: 7.5, lineWidth: 1.6, dotR: 2,
      endLabel: 'Mes ' + n + ': ' + M(v.cashFlows[n].cumulativeCash),
    });
    w.scene(cash);
    w.y += cash.h + 8;
    w.paragraph('Acumulación nominal del desembolso y los pagos del préstamo: C₀ = P y Cₜ = P − Σ Aₖ; al final vale −J = ' +
      M(v.cashFlows[n].cumulativeCash) + '. No incluye ingresos, gastos, inversión del capital ni saldo de una cuenta bancaria. ' +
      'Un acumulado negativo no indica insolvencia.', { size: BODY });
  }

  function analysisPage(w) {
    var doc = w.doc;
    var a = w.snap.analysis;
    w.y += 10;
    w.section('Análisis crítico', 'Lectura del escenario', 200);
    a.paragraphs.forEach(function (p) { w.leadParagraph(p.title, p.text); });

    w.ensure(120);
    w.subtitle('Comparación de plazo (n ' + (a.comparison.altMonths > a.comparison.currentMonths ? '+' : '−') + ' 12 meses)', w.y + 12);
    w.y += 19;
    doc.autoTable({
      startY: w.y,
      margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.top, bottom: PAGE.bottom },
      head: [['Concepto', 'Actual', 'Alternativo', 'Diferencia']],
      body: a.comparison.rows.map(function (row) { return [row.label, row.current, row.alt, row.delta].map(w.clean); }),
      theme: 'plain',
      styles: { font: SANS, fontSize: BODY, textColor: V.graphite, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 }, lineColor: V.line, lineWidth: { bottom: 0.6 } },
      headStyles: { fillColor: V.green, textColor: V.ivory, fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: function (d) { if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right'; },
      rowPageBreak: 'avoid',
    });
    w.y = doc.lastAutoTable.finalY + 10;
    w.paragraph('La comparación no cambia el préstamo analizado; solo recalcula el mismo capital y la misma tasa con otro plazo.', { size: 9, color: V.muted });

    w.ensure(60);
    w.subtitle('Fórmulas, variables y sustitución', w.y + 12);
    w.y += 21;
    a.formulas.forEach(function (f) {
      w.ensure(40);
      w.eyebrow(f.title, PAGE.margin, w.y + 8, V.copperText, 7.2);
      w.y += 13;
      f.lines.forEach(function (line) { w.paragraph(line, { size: 9.5, x: PAGE.margin + 8, width: CONTENT_W - 8, after: 1 }); });
      w.y += 4;
    });
  }

  function tablePages(w) {
    var doc = w.doc;
    var s = w.snap;
    var v = s.view;
    var n = s.result.input.months;
    var cur = v.currency;
    var M = function (x) { return w.clean(format.formatMoney(x, cur)); };
    w.y += 10;
    w.section('Amortización', 'Tabla de amortización completa (' + format.monthsLabel(n) + ')', 150);
    w.paragraph('Mes 0: desembolso recibido de ' + format.formatMoney(v.principal, cur, { sign: 'always' }) +
      '; no es una cuota. ' + analysis.ROUNDING_NOTE, { size: BODY });

    var sumA = engine.createSum(), sumK = engine.createSum(), sumI = engine.createSum();
    var body = v.schedule.map(function (row) {
      sumA.add(row.payment); sumK.add(row.principal); sumI.add(row.interest);
      return [String(row.month), M(row.payment), M(row.principal), M(row.interest), M(row.balance)];
    });
    doc.autoTable({
      startY: w.y,
      margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.top, bottom: PAGE.bottom },
      head: [['Mes', 'Cuota', 'Capital', 'Intereses', 'Saldo restante']],
      body: body,
      foot: [['Totales', M(sumA.value()), M(sumK.value()), M(sumI.value()), 'Saldo final ' + M(v.schedule[n - 1].balance)]],
      theme: 'plain',
      styles: { font: SANS, fontSize: BODY, textColor: V.graphite, halign: 'right', cellPadding: { top: 3.6, bottom: 3.6, left: 6, right: 6 }, overflow: 'linebreak' },
      headStyles: { fillColor: V.green, textColor: V.ivory, fontStyle: 'bold', fontSize: 8.5 },
      footStyles: { fillColor: '#FFFFFF', textColor: V.green, fontStyle: 'bold', lineColor: V.green, lineWidth: { top: 1.2 } },
      alternateRowStyles: { fillColor: V.ivory },
      columnStyles: { 0: { halign: 'left', cellWidth: 56 } },
      didParseCell: function (d) {
        if (d.column.index === 0) d.cell.styles.halign = 'left';
        else d.cell.styles.halign = 'right';
      },
      showHead: 'everyPage',
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
    });
    w.y = doc.lastAutoTable.finalY + 14;
  }

  function creditsBlock(w) {
    var doc = w.doc;
    var cfg = w.snap.config;
    w.section('Créditos', 'Equipo y contacto', 90);
    var members = (cfg.teamMembers || []).filter(Boolean);
    w.paragraph(members.length ? 'Equipo: ' + members.map(function (m) {
      var role = cfg.memberRoles && cfg.memberRoles[m];
      return role ? m + ' (' + role + ')' : m;
    }).join(' · ') + '.' : 'Nombres del equipo pendientes.', { size: BODY });
    w.paragraph('Asignatura: ' + cfg.course + '.', { size: BODY });
    var email = cfg.coordinatorEmail;
    if (w.snap.emailValid) {
      var lead = 'Para cualquier consulta, escribir a ';
      w.font(400, BODY);
      w.ensure(BODY * LINE * 2);
      var y = w.y + BODY * 0.8;
      w.text(lead, PAGE.margin, y);
      var x = PAGE.margin + doc.getTextWidth(w.clean(lead));
      w.font(600, BODY, V.green);
      doc.textWithLink(w.clean(email), x, y, { url: 'mailto:' + email });
      var ew = doc.getTextWidth(w.clean(email));
      w.font(400, BODY, V.graphite);
      var tail = ' del coordinador del equipo' + (cfg.coordinatorName ? ', ' + cfg.coordinatorName + '.' : '.');
      if (x + ew + doc.getTextWidth(w.clean(tail)) > PAGE.w - PAGE.margin) {
        w.y += BODY * LINE;
        w.text(tail.trim(), PAGE.margin, w.y + BODY * 0.8);
      } else {
        w.text(tail, x + ew, y);
      }
      w.y += BODY * LINE + 4;
    } else {
      w.paragraph('Correo del coordinador pendiente.', { size: BODY });
    }
    w.y += 4;
    w.paragraph('Alcance del modelo: sistema francés con tasa fija, pagos mensuales vencidos y amortización completa. ' +
      'No incluye comisiones, seguros, impuestos, mora, inflación ni información de ingresos; no constituye asesoría financiera.', { size: BODY });
    w.paragraph('Nota de redondeo: ' + analysis.ROUNDING_NOTE, { size: BODY });
    w.paragraph('Generado localmente con VÉRTICE ' + cfg.version + '. Bibliotecas: jsPDF 4.2.1 y jsPDF-AutoTable 5.0.8 (licencia MIT). ' +
      'Tipografías Noto Sans y Gelasio, sustitutos abiertos de Segoe UI y Georgia, con flechas de Inter (SIL Open Font License 1.1).', { size: 8.5, color: V.muted });
  }

  function decoratePages(w) {
    var doc = w.doc;
    var total = doc.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p);
      if (p > 1) {
        /* Loseta de 30 pt: emblema de 6 mm de alto, el mínimo impreso de la guía. */
        w.signature(PAGE.margin, 22, 30, false);
        w.font(400, 8, V.muted);
        w.text('Informe de préstamo · ' + w.snap.scenarioId, PAGE.w - PAGE.margin, 41.5, { align: 'right' });
        doc.setDrawColor(V.gold);
        doc.setLineWidth(0.8);
        doc.line(PAGE.margin, 58, PAGE.w - PAGE.margin, 58);
      }
      doc.setDrawColor(V.line);
      doc.setLineWidth(0.8);
      doc.line(PAGE.margin, PAGE.h - 38, PAGE.w - PAGE.margin, PAGE.h - 38);
      w.font(400, 8, V.muted);
      w.text('VÉRTICE · El valor correcto. En la fecha correcta. · ' + w.snap.config.course, PAGE.margin, PAGE.h - 24);
      w.text('Página ' + p + ' de ' + total, PAGE.w - PAGE.margin, PAGE.h - 24, { align: 'right' });
    }
  }

  /**
   * snap: { result, alt, view, altView, analysis, scenarioId, generatedAt, config, emailValid }
   * env:  { jsPDF, fonts: { sans, sansSemibold, serif } (TTF en base64),
   *         cmap: { sans: [...], serif: [...] }, emblem: data URL PNG }
   */
  async function generatePdf(snap, env) {
    var jsPDF = env.jsPDF;
    var doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true, putOnlyUsedFonts: true });
    if (typeof doc.autoTable !== 'function') throw new Error('AutoTable no está disponible.');
    doc.addFileToVFS('VerticeSans-Regular.ttf', env.fonts.sans);
    doc.addFont('VerticeSans-Regular.ttf', SANS, 'normal');
    doc.addFileToVFS('VerticeSans-SemiBold.ttf', env.fonts.sansSemibold);
    doc.addFont('VerticeSans-SemiBold.ttf', SANS, 'bold');
    doc.addFileToVFS('VerticeSerif-Regular.ttf', env.fonts.serif);
    doc.addFont('VerticeSerif-Regular.ttf', SERIF, 'normal');
    doc.setFont(SANS, 'normal');
    doc.setProperties({
      title: 'VÉRTICE · Informe de préstamo ' + snap.scenarioId,
      subject: 'Préstamo en sistema francés: ' + format.monthsLabel(snap.result.input.months) + ', ' + snap.view.currency,
      author: 'Equipo VÉRTICE · ' + snap.config.course,
      keywords: 'préstamo, amortización, sistema francés, flujo de efectivo, ingeniería económica',
      creator: 'VÉRTICE ' + snap.config.version + ' (jsPDF 4.2.1)',
    });
    if (doc.setLanguage) doc.setLanguage('es');

    var w = new Writer(doc, snap, env);
    cover(w);
    await tick();
    w.newPage();
    chartsPage(w);
    flowPage(w);
    await tick();
    analysisPage(w);
    await tick();
    tablePages(w);
    await tick();
    creditsBlock(w);
    decoratePages(w);
    return { blob: doc.output('blob'), pages: doc.getNumberOfPages(), filename: csv.pdfFilename(snap) };
  }

  T.pdf = { generatePdf: generatePdf, makeSanitizer: makeSanitizer };
})(typeof globalThis !== 'undefined' ? globalThis : this);
