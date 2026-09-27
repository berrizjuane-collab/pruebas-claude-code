/* ==========================================================================
   VÉRTICE · Gráficas
   Cada gráfica se describe como una escena de primitivas independiente del
   medio. La misma escena se dibuja en SVG (pantalla) o con vectores jsPDF
   (informe), así ambas salidas comparten datos, escalas y rótulos.
   ========================================================================== */
(function (root) {
  'use strict';

  var format = (typeof module === 'object' && module.exports) ? require('./format.js') : root.TRAZA.format;

  /* Paleta VÉRTICE: verde y grafito explican; cobre y oro destacan.
     Verde = capital, deuda y entradas; cobre = intereses y salidas. */
  var COLORS = Object.freeze({
    ink: '#2B3430',
    accent: '#10372F',
    green2: '#174B3D',
    canvas: '#F4F1E8',
    capital: '#10372F',
    interest: '#B56C4D',
    gold: '#C5A25D',
    axis: '#648477',
    border: '#DDE2DD',
    surface: '#FCFBF7',
    muted: '#5F6963',
    grid: '#E2E6E1',
    negativeZone: '#F6ECE6',
    band: '#F1E3DA',
  });

  /* Altura de mayúsculas de la tipografía de interfaz, para ubicar líneas base. */
  var CAP = 0.72;

  function r2(v) { return Math.round(v * 100) / 100; }

  function Scene(w, h) {
    this.w = w;
    this.h = h;
    this.prims = [];
  }
  Scene.prototype.add = function (p) { this.prims.push(p); return p; };
  Scene.prototype.line = function (x1, y1, x2, y2, stroke, w, extra) {
    return this.add(assign({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, stroke: stroke, w: w || 1 }, extra));
  };
  Scene.prototype.poly = function (pts, extra) { return this.add(assign({ t: 'poly', pts: pts }, extra)); };
  Scene.prototype.rect = function (x, y, w, h, extra) { return this.add(assign({ t: 'rect', x: x, y: y, w: w, h: h }, extra)); };
  Scene.prototype.circle = function (cx, cy, r, extra) { return this.add(assign({ t: 'circle', cx: cx, cy: cy, r: r }, extra)); };
  Scene.prototype.path = function (d, extra) { return this.add(assign({ t: 'path', d: d }, extra)); };
  /* Texto con línea base calculada: 'alphabetic' | 'middle' | 'top'. */
  Scene.prototype.text = function (x, y, s, size, extra) {
    var o = assign({ t: 'text', x: x, y: y, s: s, size: size, weight: 400, fill: COLORS.ink, anchor: 'start' }, extra);
    if (o.baseline === 'middle') o.y = y + (CAP * size) / 2;
    else if (o.baseline === 'top') o.y = y + CAP * size;
    delete o.baseline;
    return this.add(o);
  };

  function assign(target, src) {
    if (src) for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    return target;
  }

  /* ---------------------------------------------------------------------
     Utilidades geométricas
     --------------------------------------------------------------------- */
  function arcSegments(cx, cy, r, a0, a1) {
    var segs = [];
    var total = a1 - a0;
    var count = Math.max(1, Math.ceil(Math.abs(total) / (Math.PI / 2)));
    var da = total / count;
    for (var k = 0; k < count; k++) {
      var s = a0 + k * da;
      var e = s + da;
      var kappa = (4 / 3) * Math.tan(da / 4);
      var p0x = cx + r * Math.cos(s), p0y = cy + r * Math.sin(s);
      var p3x = cx + r * Math.cos(e), p3y = cy + r * Math.sin(e);
      segs.push(['C',
        p0x - kappa * r * Math.sin(s), p0y + kappa * r * Math.cos(s),
        p3x + kappa * r * Math.sin(e), p3y - kappa * r * Math.cos(e),
        p3x, p3y]);
    }
    return segs;
  }

  function sectorPath(cx, cy, r0, r1, a0, a1) {
    var d = [['M', cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0)]];
    d = d.concat(arcSegments(cx, cy, r1, a0, a1));
    d.push(['L', cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1)]);
    d = d.concat(arcSegments(cx, cy, r0, a1, a0));
    d.push(['Z']);
    return d;
  }

  /* Flecha vertical de (x, yFrom) a (x, yTo), con la punta dentro de la longitud exacta. */
  function arrow(scene, x, yFrom, yTo, color, shaftW, headMax, extra) {
    var len = Math.abs(yTo - yFrom);
    var dir = yTo < yFrom ? -1 : 1;
    var head = Math.min(headMax, len * 0.5);
    var halfW = Math.max(head * 0.62, shaftW);
    if (len - head > 0.01) scene.line(x, yFrom, x, yTo - dir * head * 0.9, color, shaftW, assign({ cap: 'butt' }, extra));
    if (head > 0.2) {
      scene.poly([x - halfW, yTo - dir * head, x + halfW, yTo - dir * head, x, yTo], assign({ fill: color, closed: true }, extra));
    } else {
      scene.line(x, yFrom, x, yTo, color, Math.max(1, shaftW), assign({ cap: 'butt' }, extra));
    }
  }

  /* Llave horizontal que abre hacia arriba y apunta hacia abajo. */
  function bracePath(x1, x2, y, h) {
    var xm = (x1 + x2) / 2;
    var s = Math.min(6, (x2 - x1) / 4);
    var yM = y + h * 0.5;
    return [
      ['M', x1, y],
      ['C', x1, yM, x1, yM, x1 + s, yM],
      ['L', xm - s, yM],
      ['C', xm, yM, xm, yM, xm, y + h],
      ['C', xm, yM, xm, yM, xm + s, yM],
      ['L', x2 - s, yM],
      ['C', x2, yM, x2, yM, x2, y],
    ];
  }

  /* Ticks de meses: incluye 0 y n; paso "redondo" en meses. */
  function monthTicks(n, maxTicks) {
    var steps = [1, 2, 3, 4, 6, 12, 24, 36, 60, 120, 240];
    var step = steps[steps.length - 1];
    for (var k = 0; k < steps.length; k++) if (n / steps[k] <= Math.max(1, maxTicks)) { step = steps[k]; break; }
    var ticks = [];
    for (var t = 0; t <= n; t += step) ticks.push(t);
    if (ticks[ticks.length - 1] !== n) {
      if (n - ticks[ticks.length - 1] < step * 0.5 && ticks.length > 1) ticks[ticks.length - 1] = n;
      else ticks.push(n);
    }
    return ticks;
  }

  /* Tramos para plazos > 24 meses: ≤ 6 tramos de 12, 24, 60 o 120 meses. */
  function makeTramos(n) {
    var sizes = [12, 24, 60, 120];
    var size = sizes[sizes.length - 1];
    for (var k = 0; k < sizes.length; k++) if (Math.ceil(n / sizes[k]) <= 6) { size = sizes[k]; break; }
    var out = [];
    for (var a = 1; a <= n; a += size) out.push({ from: a, to: Math.min(n, a + size - 1) });
    return out;
  }

  function valueTicks(lo, hi, maxTicks) {
    var step = format.niceStep(hi - lo, Math.max(2, maxTicks));
    var start = Math.floor(lo / step + 1e-9) * step;
    var end = Math.ceil(hi / step - 1e-9) * step;
    var ticks = [];
    for (var v = start; v <= end + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { ticks: ticks, step: step, lo: start, hi: end };
  }

  /* ---------------------------------------------------------------------
     1. Anillo: composición del total pagado
     --------------------------------------------------------------------- */
  function buildDonutScene(o) {
    var size = o.size;
    var legendW = o.legend ? o.legendWidth : 0;
    var sc = new Scene(size + legendW, Math.max(size, o.legend ? o.legendHeight || size : size));
    var cx = size / 2;
    var cy = sc.h / 2;
    var rOuter = size / 2 - 2;
    var thick = Math.max(12, size * 0.17);
    var rInner = rOuter - thick;
    var share = o.total > 0 ? o.interest / o.total : 0;
    var sep = o.separator === undefined ? 1.5 : o.separator;

    if (!(share > 0)) {
      sc.circle(cx, cy, (rOuter + rInner) / 2, { stroke: COLORS.capital, sw: thick, data: { part: 'capital' } });
    } else if (share >= 1) {
      sc.circle(cx, cy, (rOuter + rInner) / 2, { stroke: COLORS.interest, sw: thick, data: { part: 'interest' } });
    } else {
      var a0 = -Math.PI / 2;
      var a1 = a0 + share * Math.PI * 2;
      sc.path(sectorPath(cx, cy, rInner, rOuter, a1, a0 + Math.PI * 2), { fill: COLORS.capital, stroke: COLORS.surface, sw: sep, data: { part: 'capital' } });
      sc.path(sectorPath(cx, cy, rInner, rOuter, a0, a1), { fill: COLORS.interest, stroke: COLORS.surface, sw: sep, data: { part: 'interest' } });
    }

    /* Rótulo central ajustado al hueco, sin recortes; si no cabe, forma compacta en millones. */
    var maxW = rInner * 1.6;
    var vMax = o.centerSize || 16;
    var vMin = Math.max(8, vMax * 0.62);
    var value = o.centerValue;
    var unit = null;
    var vSize = vMax;
    while (vSize > vMin && o.measure(value, vSize, 600) > maxW) vSize -= 0.5;
    if (o.measure(value, vSize, 600) > maxW && o.centerCompact) {
      value = o.centerCompact.value;
      unit = o.centerCompact.unit;
      vSize = vMax;
      while (vSize > vMin && o.measure(value, vSize, 600) > maxW) vSize -= 0.5;
    }
    var lSize = Math.min(o.centerLabelSize || 11, vSize);
    var shift = unit ? lSize * 0.7 : 0;
    sc.text(cx, cy - 3 - shift, o.centerLabel, lSize, { anchor: 'middle', weight: 600, fill: COLORS.muted });
    sc.text(cx, cy + 3 - shift, value, vSize, { anchor: 'middle', weight: 600, baseline: 'top' });
    if (unit) sc.text(cx, cy + 6 - shift + vSize * CAP + lSize, unit, lSize, { anchor: 'middle', weight: 600, fill: COLORS.muted });

    if (o.legend) {
      var lx = size + 16;
      var rows = o.legendRows;
      var lh = o.legendLineHeight || 30;
      var y0 = cy - (rows.length * lh) / 2 + 4;
      rows.forEach(function (row, k) {
        var y = y0 + k * lh;
        if (row.color) sc.rect(lx, y, 9, 9, { fill: row.color, r: 2 });
        var tx = row.color ? lx + 15 : lx;
        sc.text(tx, y - 1, row.name, o.legendSize || 9, { weight: 600, baseline: 'top' });
        sc.text(tx, y + (o.legendSize || 9) + 3, row.value, o.legendSize || 9, { baseline: 'top', fill: COLORS.ink });
      });
    }
    return sc;
  }

  /* ---------------------------------------------------------------------
     2. Evolución de saldos: deuda pendiente (línea) o efectivo acumulado (escalón)
     --------------------------------------------------------------------- */
  function buildBalanceScene(o) {
    var w = o.w;
    var h = o.h;
    var n = o.n;
    var vals = o.values;
    var fsTick = o.tickSize || 11;
    var fsLabel = o.labelSize || 11;
    var measure = o.measure;
    var sc = new Scene(w, h);

    var vmin = Infinity, vmax = -Infinity;
    for (var k = 0; k < vals.length; k++) { if (vals[k] < vmin) vmin = vals[k]; if (vals[k] > vmax) vmax = vals[k]; }
    var lo = Math.min(0, vmin);
    var hi = Math.max(0, vmax);
    if (hi - lo <= 0) hi = lo + 1;

    /* Rótulo de unidad (izquierda) y valor final (derecha) en la franja superior,
       fuera del área de datos para no tapar la serie. */
    var endText = o.endLabel || '';
    var unitW = measure(o.unitLabel + ' · M = millones', fsLabel, 600);
    var endW = endText ? measure(endText, fsTick, 600) + 14 : 0;
    var twoLines = endText && unitW + endW + 16 > w;
    var top = fsLabel + 16 + (twoLines ? fsTick + 8 : 0);
    var bottom = fsTick + 26;
    var right = 14;
    var plotHGuess = h - top - bottom;
    var vt = valueTicks(lo, hi, Math.max(4, Math.floor(plotHGuess / 30)));
    var fmt = format.axisMoneyFormatter(Math.max(Math.abs(vt.lo), Math.abs(vt.hi)), vt.step);
    var labelW = 0;
    vt.ticks.forEach(function (v) { labelW = Math.max(labelW, measure(fmt(v), fsTick, 400)); });
    var x0 = Math.ceil(labelW + 12);
    var x1 = w - right;
    var y0 = top;
    var y1 = h - bottom;
    var xOf = function (m) { return x0 + (n > 0 ? (m / n) : 0) * (x1 - x0); };
    var yOf = function (v) { return y1 - ((v - vt.lo) / (vt.hi - vt.lo)) * (y1 - y0); };

    sc.text(0, 0, o.unitLabel + (fmt.millions ? ' · M = millones' : ''), fsLabel, { weight: 600, fill: COLORS.muted, baseline: 'top' });

    if (o.kind === 'cash' && vt.lo < 0) {
      sc.rect(x0, yOf(0), x1 - x0, y1 - yOf(0), { fill: COLORS.negativeZone });
      sc.text(x0 + 6, y1 - 6, 'Por debajo de 0', fsTick - 1, { fill: COLORS.muted });
    }
    vt.ticks.forEach(function (v) {
      var y = yOf(v);
      if (v !== 0) sc.line(x0, y, x1, y, COLORS.grid, 1);
      sc.text(x0 - 8, y, fmt(v), fsTick, { anchor: 'end', baseline: 'middle', fill: COLORS.muted });
    });
    sc.line(x0, yOf(0), x1, yOf(0), COLORS.ink, 1.25);

    var ticks = monthTicks(n, Math.max(2, Math.floor((x1 - x0) / 42)));
    ticks.forEach(function (t) {
      sc.line(xOf(t), y1, xOf(t), y1 + 4, COLORS.ink, 1);
      sc.text(xOf(t), y1 + 7, String(t), fsTick, { anchor: 'middle', baseline: 'top', fill: COLORS.muted });
    });
    sc.text(x1, y1 + fsTick + 13, 'Meses', fsTick, { anchor: 'end', baseline: 'top', weight: 600, fill: COLORS.muted });

    var pts = [];
    if (o.kind === 'debt') {
      for (var t = 0; t <= n; t++) pts.push(xOf(t), yOf(vals[t]));
      sc.poly(pts, { stroke: COLORS.accent, w: o.lineWidth || 2.5, join: 'round', cap: 'round' });
      if (n <= 24) for (var d = 0; d <= n; d++) sc.circle(xOf(d), yOf(vals[d]), o.dotR || 2.8, { fill: COLORS.accent });
    } else {
      pts.push(xOf(0), yOf(vals[0]));
      for (var s = 1; s <= n; s++) pts.push(xOf(s), yOf(vals[s - 1]), xOf(s), yOf(vals[s]));
      sc.poly(pts, { stroke: COLORS.ink, w: o.lineWidth || 2.2, join: 'miter', cap: 'butt' });
      sc.circle(xOf(0), yOf(vals[0]), o.dotR || 2.8, { fill: COLORS.accent });
      sc.circle(xOf(n), yOf(vals[n]), o.dotR || 2.8, { fill: COLORS.interest });
    }

    /* Valor final legible sin tooltip, con un punto del color de la serie. */
    if (endText) {
      var ly = twoLines ? fsLabel + 8 : 0;
      var tw = measure(endText, fsTick, 600);
      sc.circle(w - tw - 9, ly + (CAP * fsTick) / 2, 3.2, { fill: o.kind === 'debt' ? COLORS.accent : COLORS.interest });
      sc.text(w, ly, endText, fsTick, { anchor: 'end', weight: 600, baseline: 'top' });
    }

    sc.layout = { x0: x0, x1: x1, y0: y0, y1: y1, n: n, xOf: xOf, yOf: yOf };
    return sc;
  }

  /* ---------------------------------------------------------------------
     3. Diagrama de flujo de efectivo (perspectiva del deudor)
     --------------------------------------------------------------------- */
  function buildCashFlowScene(o) {
    var n = o.n;
    var full = o.layout === 'full';
    var proportional = o.mode === 'proportional';
    var fs = o.fontSize || 12;
    var fsTick = o.tickSize || 11;
    var measure = o.measure;
    var P = o.principal;
    var pays = o.payments;
    var maxPay = 0;
    for (var k = 0; k < pays.length; k++) if (pays[k] > maxPay) maxPay = pays[k];

    var h = o.h;
    var grouped = !full && n > 24;
    var labelBand = fs + 12;
    var bottomBand = grouped ? fsTick * 2 + 26 : fs + 18;
    var plotTop = labelBand + 4;
    var plotBottom = h - bottomBand;

    var yAxis = null;
    var yAxisW = 0;
    if (proportional) {
      var vt = valueTicks(-maxPay, P, Math.max(4, Math.floor((plotBottom - plotTop) / 30)));
      var fmt = format.axisMoneyFormatter(Math.max(Math.abs(vt.lo), Math.abs(vt.hi)), vt.step);
      vt.ticks.forEach(function (v) { yAxisW = Math.max(yAxisW, measure(fmt(v), fsTick, 400)); });
      yAxisW += 12;
      yAxis = { vt: vt, fmt: fmt };
    }

    var x0 = Math.max(24, yAxisW + 14);
    var right = 26;
    var spacing = full ? (o.spacing || 34) : null;
    var plotW = full ? n * spacing : Math.max(40, o.w - x0 - right);
    var w = full ? x0 + plotW + right : o.w;
    var stepPx = plotW / n;
    var xOf = function (t) { return x0 + t * stepPx; };
    var sc = new Scene(w, h);

    var axisY, yOfV;
    if (proportional) {
      var lo = yAxis.vt.lo, hi = yAxis.vt.hi;
      yOfV = function (v) { return plotBottom - ((v - lo) / (hi - lo)) * (plotBottom - plotTop); };
      axisY = yOfV(0);
      yAxis.vt.ticks.forEach(function (v) {
        var y = yOfV(v);
        if (v !== 0) sc.line(x0, y, x0 + plotW, y, COLORS.grid, 1);
        sc.text(x0 - 8, y, yAxis.fmt(v), fsTick, { anchor: 'end', baseline: 'middle', fill: COLORS.muted });
      });
    } else {
      axisY = plotTop + (plotBottom - plotTop) * 0.56;
    }
    var upTip = proportional ? yOfV(P) : plotTop;
    var downTipOf = function (amount) { return proportional ? yOfV(-amount) : plotBottom; };

    /* Eje temporal con flecha. */
    sc.line(x0 - 10, axisY, x0 + plotW + 16, axisY, COLORS.axis, 1.3);
    sc.poly([x0 + plotW + 18, axisY, x0 + plotW + 11, axisY - 4, x0 + plotW + 11, axisY + 4], { fill: COLORS.axis, closed: true });

    /* Rótulos de meses: el 0 bajo el eje (arriba está la entrada); el resto sobre el eje. */
    var labelMonths;
    if (full) {
      labelMonths = [];
      for (var lm = 0; lm <= n; lm++) labelMonths.push(lm);
    } else if (!grouped && stepPx >= 18) {
      labelMonths = [];
      for (var lm2 = 0; lm2 <= n; lm2++) labelMonths.push(lm2);
    } else {
      labelMonths = monthTicks(n, Math.max(2, Math.floor(plotW / 40)));
    }
    var drawMonthLabels = function () {
      labelMonths.forEach(function (t) {
        sc.line(xOf(t), axisY - 3, xOf(t), axisY + 3, COLORS.axis, 1);
        if (t === 0) sc.text(xOf(0) - 5, axisY + 7, '0', fsTick, { anchor: 'end', baseline: 'top', fill: COLORS.muted });
        else sc.text(xOf(t), axisY - 6, String(t), fsTick, { anchor: 'middle', fill: COLORS.muted });
      });
    };

    /* Entrada inicial (verde, hacia arriba) con su punto de referencia en el eje. */
    arrow(sc, xOf(0), axisY, upTip, COLORS.accent, 2.2, 10, { data: { month: 0 } });
    sc.circle(xOf(0), axisY, 3.2, { fill: COLORS.accent });
    var pLabel = o.money(P, 'always');
    var pAnchor = measure(pLabel, fs, 600) / 2 > xOf(0) ? 'start' : 'middle';
    sc.text(pAnchor === 'start' ? 2 : xOf(0), upTip - 7, pLabel, fs, { anchor: pAnchor, weight: 600 });

    /* Salidas (cobre, hacia abajo). */
    var shaft = full ? 1.8 : Math.max(1, Math.min(1.8, stepPx * 0.3));
    var headMax = full ? 7 : Math.max(0, Math.min(7, stepPx * 0.42));
    var drawEach = full || stepPx >= 3;
    var tramos = grouped ? makeTramos(n) : null;

    if (drawEach) {
      for (var t = 1; t <= n; t++) {
        arrow(sc, xOf(t), axisY, downTipOf(pays[t - 1]), COLORS.interest, shaft, headMax, { data: { month: t } });
      }
    } else {
      tramos.forEach(function (tr) {
        var tipY = downTipOf(maxPay);
        sc.rect(xOf(tr.from) - 1, Math.min(axisY, tipY), Math.max(2, xOf(tr.to) - xOf(tr.from) + 2), Math.abs(tipY - axisY), { fill: COLORS.band });
        var sample = [tr.from, Math.round((tr.from + tr.to) / 2), tr.to].filter(function (v, idx, arr) { return arr.indexOf(v) === idx; });
        sample.forEach(function (m) { arrow(sc, xOf(m), axisY, downTipOf(pays[m - 1]), COLORS.interest, 1.6, 6, { data: { month: m } }); });
      });
    }

    drawMonthLabels();

    /* Rótulos de pagos: una leyenda por tramo, nunca una flecha aislada como único pago. */
    var tipLevel = downTipOf(maxPay);
    if (!grouped) {
      var same = o.allEqual;
      var text = n === 1 ? o.money(-pays[0]) + ' en el mes 1'
        : same ? o.money(-pays[0]) + ' por mes (1 a ' + n + ')'
          : o.money(-pays[0]) + ' por mes; último pago ' + o.money(-pays[n - 1]);
      var cx = (xOf(1) + xOf(n)) / 2;
      var tw = measure(text, fs, 600);
      var tx = Math.min(Math.max(cx, tw / 2 + 2), w - tw / 2 - 2);
      sc.text(tx, Math.max(tipLevel, axisY) + 8, text, fs, { anchor: 'middle', weight: 600, baseline: 'top' });
    } else {
      var braceY = Math.max(tipLevel, axisY) + 5;
      tramos.forEach(function (tr) {
        var xa = xOf(tr.from) - Math.min(stepPx / 2, 4) + 2;
        var xb = xOf(tr.to) + Math.min(stepPx / 2, 4) - 2;
        if (xb - xa < 6) { xa -= 3; xb += 3; }
        sc.path(bracePath(xa, xb, braceY, 8), { stroke: COLORS.axis, sw: 1.1 });
        var mid = (xa + xb) / 2;
        var room = xb - xa + 6;
        var l1 = tr.from === tr.to ? 'Mes ' + tr.from : 'Meses ' + tr.from + '–' + tr.to;
        if (measure(l1, fsTick, 600) > room) l1 = tr.from === tr.to ? String(tr.from) : tr.from + '–' + tr.to;
        sc.text(mid, braceY + 12, l1, fsTick, { anchor: 'middle', weight: 600, baseline: 'top' });
        var count = tr.to - tr.from + 1;
        var l2 = count + ' × ' + o.money(-pays[tr.from - 1]);
        if (measure(l2, fsTick, 400) > room) l2 = count + ' pagos';
        if (measure(l2, fsTick, 400) <= room) sc.text(mid, braceY + 12 + fsTick + 4, l2, fsTick, { anchor: 'middle', baseline: 'top' });
      });
    }

    sc.layout = {
      x0: x0, x1: x0 + plotW, axisY: axisY, n: n, stepPx: stepPx, grouped: grouped, tramos: tramos,
      millions: !!(yAxis && yAxis.fmt.millions),
      top: plotTop, bottom: plotBottom, xOf: xOf,
      monthAt: function (x) { return Math.max(0, Math.min(n, Math.round((x - x0) / stepPx))); },
    };
    return sc;
  }

  /* ---------------------------------------------------------------------
     Backend SVG
     --------------------------------------------------------------------- */
  var SVGNS = 'http://www.w3.org/2000/svg';

  function pathString(d) {
    return d.map(function (seg) {
      return seg[0] + (seg.length > 1 ? ' ' + seg.slice(1).map(r2).join(' ') : '');
    }).join(' ');
  }

  function primToSvg(p) {
    var el;
    switch (p.t) {
      case 'line':
        el = document.createElementNS(SVGNS, 'line');
        el.setAttribute('x1', r2(p.x1)); el.setAttribute('y1', r2(p.y1));
        el.setAttribute('x2', r2(p.x2)); el.setAttribute('y2', r2(p.y2));
        el.setAttribute('stroke', p.stroke); el.setAttribute('stroke-width', p.w);
        if (p.cap) el.setAttribute('stroke-linecap', p.cap);
        if (p.dash) el.setAttribute('stroke-dasharray', p.dash.join(' '));
        break;
      case 'poly':
        el = document.createElementNS(SVGNS, p.closed ? 'polygon' : 'polyline');
        var pts = [];
        for (var i = 0; i < p.pts.length; i += 2) pts.push(r2(p.pts[i]) + ',' + r2(p.pts[i + 1]));
        el.setAttribute('points', pts.join(' '));
        el.setAttribute('fill', p.fill || 'none');
        if (p.stroke) { el.setAttribute('stroke', p.stroke); el.setAttribute('stroke-width', p.w || 1); }
        if (p.join) el.setAttribute('stroke-linejoin', p.join);
        if (p.cap) el.setAttribute('stroke-linecap', p.cap);
        if (p.dash) el.setAttribute('stroke-dasharray', p.dash.join(' '));
        break;
      case 'rect':
        el = document.createElementNS(SVGNS, 'rect');
        el.setAttribute('x', r2(p.x)); el.setAttribute('y', r2(p.y));
        el.setAttribute('width', r2(Math.max(0, p.w))); el.setAttribute('height', r2(Math.max(0, p.h)));
        if (p.r) { el.setAttribute('rx', p.r); el.setAttribute('ry', p.r); }
        el.setAttribute('fill', p.fill || 'none');
        if (p.stroke) { el.setAttribute('stroke', p.stroke); el.setAttribute('stroke-width', p.sw || 1); }
        break;
      case 'circle':
        el = document.createElementNS(SVGNS, 'circle');
        el.setAttribute('cx', r2(p.cx)); el.setAttribute('cy', r2(p.cy)); el.setAttribute('r', r2(p.r));
        el.setAttribute('fill', p.fill || 'none');
        if (p.stroke) { el.setAttribute('stroke', p.stroke); el.setAttribute('stroke-width', p.sw || 1); }
        break;
      case 'path':
        el = document.createElementNS(SVGNS, 'path');
        el.setAttribute('d', pathString(p.d));
        el.setAttribute('fill', p.fill || 'none');
        if (p.stroke) { el.setAttribute('stroke', p.stroke); el.setAttribute('stroke-width', p.sw || 1); el.setAttribute('stroke-linejoin', 'round'); }
        break;
      case 'text':
        el = document.createElementNS(SVGNS, 'text');
        el.setAttribute('x', r2(p.x)); el.setAttribute('y', r2(p.y));
        el.setAttribute('font-size', p.size);
        if (p.weight !== 400) el.setAttribute('font-weight', p.weight);
        el.setAttribute('fill', p.fill);
        if (p.anchor !== 'start') el.setAttribute('text-anchor', p.anchor);
        el.textContent = p.s;
        break;
      default:
        return null;
    }
    if (p.cls) el.setAttribute('class', p.cls);
    if (p.data) for (var key in p.data) el.setAttribute('data-' + key, p.data[key]);
    return el;
  }

  function renderSvg(svg, scene, opts) {
    opts = opts || {};
    svg.setAttribute('viewBox', '0 0 ' + r2(scene.w) + ' ' + r2(scene.h));
    svg.setAttribute('width', r2(scene.w));
    svg.setAttribute('height', r2(scene.h));
    var g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'scene');
    for (var i = 0; i < scene.prims.length; i++) {
      var el = primToSvg(scene.prims[i]);
      if (el) g.appendChild(el);
    }
    var old = svg.querySelector('g.scene');
    if (old) svg.replaceChild(g, old);
    else svg.appendChild(g);
    return g;
  }

  /* ---------------------------------------------------------------------
     Backend jsPDF (unidades de la página: pt)
     --------------------------------------------------------------------- */
  function drawPdf(doc, scene, ox, oy, opts) {
    opts = opts || {};
    var font = opts.fontName || 'VerticeSans';
    var X = function (v) { return ox + v; };
    var Y = function (v) { return oy + v; };
    doc.setLineJoin('round');
    for (var i = 0; i < scene.prims.length; i++) {
      var p = scene.prims[i];
      switch (p.t) {
        case 'line':
          doc.setDrawColor(p.stroke);
          doc.setLineWidth(p.w);
          doc.setLineCap(p.cap === 'round' ? 'round' : 'butt');
          if (p.dash) doc.setLineDashPattern(p.dash, 0);
          doc.line(X(p.x1), Y(p.y1), X(p.x2), Y(p.y2));
          if (p.dash) doc.setLineDashPattern([], 0);
          break;
        case 'poly':
          if (p.pts.length < 4) break;
          doc.moveTo(X(p.pts[0]), Y(p.pts[1]));
          for (var j = 2; j < p.pts.length; j += 2) doc.lineTo(X(p.pts[j]), Y(p.pts[j + 1]));
          if (p.closed) doc.close();
          paint(doc, p.fill, p.stroke, p.w, p.cap, p.join);
          break;
        case 'rect':
          var style = styleOf(doc, p.fill, p.stroke, p.sw);
          if (!style) break;
          if (p.r) doc.roundedRect(X(p.x), Y(p.y), p.w, p.h, p.r, p.r, style);
          else doc.rect(X(p.x), Y(p.y), p.w, p.h, style);
          break;
        case 'circle':
          var cs = styleOf(doc, p.fill, p.stroke, p.sw);
          if (cs) doc.circle(X(p.cx), Y(p.cy), p.r, cs);
          break;
        case 'path':
          for (var s = 0; s < p.d.length; s++) {
            var seg = p.d[s];
            if (seg[0] === 'M') doc.moveTo(X(seg[1]), Y(seg[2]));
            else if (seg[0] === 'L') doc.lineTo(X(seg[1]), Y(seg[2]));
            else if (seg[0] === 'C') doc.curveTo(X(seg[1]), Y(seg[2]), X(seg[3]), Y(seg[4]), X(seg[5]), Y(seg[6]));
            else if (seg[0] === 'Z') doc.close();
          }
          paint(doc, p.fill, p.stroke, p.sw, 'butt', 'round');
          break;
        case 'text':
          doc.setFont(font, p.weight >= 600 ? 'bold' : 'normal');
          doc.setFontSize(p.size);
          doc.setTextColor(p.fill);
          doc.text(opts.sanitize ? opts.sanitize(p.s) : p.s, X(p.x), Y(p.y), {
            align: p.anchor === 'middle' ? 'center' : (p.anchor === 'end' ? 'right' : 'left'),
            baseline: 'alphabetic',
          });
          break;
        default:
          break;
      }
    }
    doc.setLineCap('butt');
  }

  function styleOf(doc, fill, stroke, sw) {
    if (fill) doc.setFillColor(fill);
    if (stroke) { doc.setDrawColor(stroke); doc.setLineWidth(sw || 1); }
    return fill && stroke ? 'FD' : (fill ? 'F' : (stroke ? 'S' : null));
  }

  function paint(doc, fill, stroke, w, cap, join) {
    if (stroke) {
      doc.setDrawColor(stroke);
      doc.setLineWidth(w || 1);
      doc.setLineCap(cap === 'round' ? 'round' : 'butt');
      doc.setLineJoin(join === 'miter' ? 'miter' : 'round');
    }
    if (fill) doc.setFillColor(fill);
    if (fill && stroke) doc.fillStroke();
    else if (fill) doc.fill();
    else if (stroke) doc.stroke();
    else doc.discardPath();
  }

  var api = {
    COLORS: COLORS,
    Scene: Scene,
    monthTicks: monthTicks,
    makeTramos: makeTramos,
    valueTicks: valueTicks,
    sectorPath: sectorPath,
    buildDonutScene: buildDonutScene,
    buildBalanceScene: buildBalanceScene,
    buildCashFlowScene: buildCashFlowScene,
    renderSvg: renderSvg,
    drawPdf: drawPdf,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.TRAZA = root.TRAZA || {};
    root.TRAZA.charts = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
