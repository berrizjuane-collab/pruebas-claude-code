/* ==========================================================================
   VÉRTICE · Aplicación: estado, eventos, render y exportaciones
   Una única fuente de datos (state.current) alimenta resultado, tabla,
   gráficas, análisis, PDF y CSV. El DOM nunca se usa como fuente numérica.
   ========================================================================== */
(function () {
  'use strict';

  var T = window.TRAZA;
  var engine = T.engine;
  var format = T.format;
  var inputs = T.inputs;
  var charts = T.charts;
  var analysis = T.analysis;
  var csv = T.csv;
  var CFG = T.config;
  var RT = engine.RATE_TYPES;
  var DEFAULT_SOURCE = 'Tipo de cambio ingresado manualmente';
  var STALE_TEXT = 'Resultado anterior: corrige los datos para actualizar';

  var $ = function (id) { return document.getElementById(id); };
  var qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(motion && motion.matches); }

  var el = {
    form: $('loan-form'),
    errorSummary: $('error-summary'),
    errorList: $('error-summary-list'),
    amount: $('amount-input'), amountSlider: $('amount-slider'), amountPrefix: $('amount-prefix'), amountMax: $('amount-max-label'),
    amountEq: $('amount-equivalence'), amountErr: $('amount-error'), amountField: $('amount-field'),
    rate: $('rate-input'), rateSlider: $('rate-slider'), rateErr: $('rate-error'), rateField: $('rate-field'), rateTypeHelp: $('rate-type-help'),
    months: $('months-input'), monthsSlider: $('months-slider'), monthsErr: $('months-error'), monthsField: $('months-field'),
    convToggle: $('convert-toggle'), convPanel: $('convert-panel'), convTarget: $('convert-target'), convSame: $('convert-same'),
    fxFields: $('fx-fields'), fxRate: $('fx-rate'), fxRateLabel: $('fx-rate-label'), fxRateSuffix: $('fx-rate-suffix'),
    fxRateErr: $('fx-rate-error'), fxDate: $('fx-date'), fxDateErr: $('fx-date-error'), fxSource: $('fx-source'), convStatus: $('convert-status'),
    results: $('resultados'), heroEmpty: $('hero-empty'), heroResult: $('hero-result'), heroOrient: $('hero-orient'),
    heroAmount: $('hero-amount'), heroAmountSr: $('hero-amount-sr'), heroMeta: $('hero-meta'), heroRate: $('hero-rate'),
    heroCurrency: $('hero-currency'), heroLast: $('hero-last'),
    kpiPrincipal: $('kpi-principal'), kpiInterest: $('kpi-interest'), kpiTotal: $('kpi-total'), kpiShare: $('kpi-share'),
    precisionList: $('precision-list'), liveResults: $('live-results'), liveCharts: $('live-charts'),
    donutPlot: $('donut-plot'), donutSvg: $('donut-svg'), donutDesc: $('donut-svg-desc'), donutTooltip: $('donut-tooltip'), donutLegend: $('donut-legend'),
    balancePlot: $('balance-plot'), balanceSvg: $('balance-svg'), balanceSvgTitle: $('balance-svg-title'), balanceDesc: $('balance-svg-desc'),
    balanceTooltip: $('balance-tooltip'), balanceViewName: $('balance-view-name'), balanceExplain: $('balance-explain'),
    balanceData: $('balance-data'), balanceDataDetails: $('balance-data-details'), balancePrint: $('balance-print'),
    flowPlot: $('flow-plot'), flowSvg: $('flow-svg'), flowDesc: $('flow-svg-desc'), flowTooltip: $('flow-tooltip'),
    flowScaleNote: $('flow-scale-note'), flowTramos: $('flow-tramos'), flowSummary: $('flow-summary'),
    flowAllBtn: $('flow-all-btn'), flowAllPanel: $('flow-all-panel'), flowAllHint: $('flow-all-hint'), flowAllScroll: $('flow-all-scroll'),
    flowAllPlot: $('flow-all-plot'), flowAllSvg: $('flow-all-svg'), flowAllTooltip: $('flow-all-tooltip'),
    disb: $('disbursement-row'), tableRange: $('table-range'), tblFirst: $('tbl-first'), tblPrev: $('tbl-prev'), tblNext: $('tbl-next'),
    tblLast: $('tbl-last'), tblAll: $('tbl-all'), tableHint: $('table-scroll-hint'), tableWrap: $('table-wrap'), tableCaption: $('table-caption'),
    amortBody: $('amort-body'), ftPay: $('ft-pay'), ftPrincipal: $('ft-principal'), ftInterest: $('ft-interest'), ftBalance: $('ft-balance'),
    analysisText: $('analysis-text'), cmpHCur: $('cmp-h-cur'), cmpHAlt: $('cmp-h-alt'), compareBody: $('compare-body'), useAlt: $('use-alt-btn'),
    formulas: $('formulas'), formulasDetails: $('formulas-details'), assumptionsList: $('assumptions-list'), assumptionsDetails: $('assumptions-details'),
    printBtn: $('print-btn'), scenarioId: $('scenario-id'), csvStatus: $('csv-status'), copyDax: $('copy-dax'), copyStatus: $('copy-status'),
    daxCode: $('dax-code'), pbiReport: $('pbi-report'), pbiStatus: $('pbi-status'),
    credits: $('credits'), creditsFront: $('credits-front'), creditsBack: $('credits-back'), creditsOpen: $('credits-open'),
    creditsClose: $('credits-close'), creditsBackTitle: $('credits-back-title'), creditsContact: $('credits-contact'),
    teamList: $('team-list'), creditsCourse: $('credits-course'), howto: $('como-usar'), navHowto: $('nav-howto'),
  };

  var state = {
    draft: { amount: el.amount.value, rate: el.rate.value, months: el.months.value, rateType: RT.NOMINAL, currency: 'USD' },
    conv: { enabled: false, target: 'EUR', pairs: {} },
    touched: { amount: false, rate: false, months: false, fxRate: false, fxDate: false },
    hasCalculated: false,
    isStale: false,
    engineError: null,
    current: null,
    balanceView: 'debt',
    flowMode: 'schema',
    flowAll: false,
    table: { page: 0, showAll: false, printing: false },
    isExporting: false,
    amountScale: 1e5,
    hero: { value: null, currency: null, raf: 0 },
    selected: { donut: 'capital', balance: null, flow: null, flowAll: null },
  };

  /* ------------------------------------------------------------------
     Utilidades
     ------------------------------------------------------------------ */
  var FONT_UI = '"Segoe UI", VerticeSans, system-ui, -apple-system, sans-serif';
  var measureCtx = document.createElement('canvas').getContext('2d');
  var measureCache = new Map();
  function measure(text, size, weight) {
    var key = weight + '|' + size + '|' + text;
    var w = measureCache.get(key);
    if (w === undefined) {
      measureCtx.font = weight + ' ' + size + 'px ' + FONT_UI;
      w = measureCtx.measureText(text).width * (/\d/.test(text) ? 1.04 : 1.0);
      if (measureCache.size > 4000) measureCache.clear();
      measureCache.set(key, w);
    }
    return w;
  }

  function money(x, sign, cur) {
    return format.formatMoney(x, cur || (state.current ? state.current.view.currency : state.draft.currency), { sign: sign || 'auto' });
  }
  function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function announce(region, text) {
    region.textContent = '';
    window.setTimeout(function () { region.textContent = text; }, 30);
  }
  function nextFrame() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }
  function pairKey() { return state.draft.currency + '>' + state.conv.target; }
  function getPair() {
    var key = pairKey();
    if (!state.conv.pairs[key]) state.conv.pairs[key] = { rate: '', date: '', source: DEFAULT_SOURCE };
    return state.conv.pairs[key];
  }
  function isValidEmail(v) { return typeof v === 'string' && /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[A-Za-z]{2,}$/.test(v.trim()); }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  /* ------------------------------------------------------------------
     Validación del borrador
     ------------------------------------------------------------------ */
  function resolvePresentation() {
    var base = state.draft.currency;
    var denom = { mode: 'denomination', displayCurrency: base, fxRate: 1, fxDate: '', fxSource: '' };
    if (!state.conv.enabled) return { presentation: denom, errors: {}, pending: false, same: false };
    if (state.conv.target === base) return { presentation: denom, errors: {}, pending: false, same: true };
    var pair = getPair();
    var errors = {};
    var fr = inputs.validateFxRate(pair.rate);
    if (!fr.ok) errors.fxRate = fr;
    var fd = inputs.validateFxDate(pair.date);
    if (!fd.ok) errors.fxDate = fd;
    if (errors.fxRate || errors.fxDate) return { presentation: denom, errors: errors, pending: true, same: false };
    var src = String(pair.source || '').trim() || DEFAULT_SOURCE;
    return {
      presentation: { mode: 'conversion', displayCurrency: state.conv.target, fxRate: fr.value, fxDate: fd.value, fxSource: src },
      errors: {}, pending: false, same: false,
    };
  }

  function validateDraft() {
    var d = state.draft;
    var errors = {};
    var a = inputs.validateAmount(d.amount);
    var r = inputs.validateRate(d.rate);
    var m = inputs.validateMonths(d.months);
    if (!a.ok) errors.amount = a;
    if (!r.ok) errors.rate = r;
    if (!m.ok) errors.months = m;
    var pres = resolvePresentation();
    return {
      ok: a.ok && r.ok && m.ok,
      errors: errors,
      values: { amount: a.value, rate: r.value, months: m.value },
      presentation: pres.presentation,
      fx: pres,
    };
  }

  var FIELDS = {
    amount: { input: function () { return el.amount; }, err: function () { return el.amountErr; }, wrap: function () { return el.amountField; }, label: 'Monto del préstamo' },
    rate: { input: function () { return el.rate; }, err: function () { return el.rateErr; }, wrap: function () { return el.rateField; }, label: 'Tasa de interés anual' },
    months: { input: function () { return el.months; }, err: function () { return el.monthsErr; }, wrap: function () { return el.monthsField; }, label: 'Plazo' },
  };

  function showFieldError(key, error, visible) {
    var f = FIELDS[key];
    var input = f.input();
    var box = f.err();
    if (error && visible) {
      box.textContent = error.message;
      box.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      f.wrap().classList.add('is-invalid');
    } else if (!error) {
      box.hidden = true;
      box.textContent = '';
      input.removeAttribute('aria-invalid');
      f.wrap().classList.remove('is-invalid');
    }
  }

  function renderFieldErrors(v, reason) {
    ['amount', 'rate', 'months'].forEach(function (key) {
      var e = v.errors[key];
      var soft = e && (e.code === 'empty' || e.code === 'incomplete');
      var visible = reason === 'calc' || state.touched[key] || (e && !soft);
      showFieldError(key, e || null, visible);
    });
    if (!v.errors.amount && !v.errors.rate && !v.errors.months) el.errorSummary.hidden = true;
    else if (!el.errorSummary.hidden) fillErrorSummary(v);
  }

  function fillErrorSummary(v) {
    clear(el.errorList);
    ['amount', 'rate', 'months'].forEach(function (key) {
      var e = v.errors[key];
      if (!e) return;
      var li = make('li');
      var a = make('a', null, FIELDS[key].label + ': ' + e.message);
      a.href = '#' + FIELDS[key].input().id;
      a.addEventListener('click', function (ev) { ev.preventDefault(); FIELDS[key].input().focus(); });
      li.appendChild(a);
      el.errorList.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------
     Commit: una sola revisión por cambio efectivo
     ------------------------------------------------------------------ */
  var debounceTimer = 0;
  var frameId = 0;

  function scheduleDebounced() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(function () {
      debounceTimer = 0;
      commit({ reason: 'typing', announce: true, animate: true });
    }, 250);
  }
  function scheduleFrame() {
    if (frameId) return;
    frameId = requestAnimationFrame(function () {
      frameId = 0;
      commit({ reason: 'drag', announce: false, animate: false });
    });
  }
  function cancelPending() {
    window.clearTimeout(debounceTimer);
    debounceTimer = 0;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
  }
  function flushPending() {
    var had = !!(debounceTimer || frameId);
    cancelPending();
    if (had) commit({ reason: 'flush', announce: false, animate: false });
  }

  function sameInput(a, b) {
    return a.principalBase === b.principalBase && a.baseCurrency === b.baseCurrency && a.annualRatePercent === b.annualRatePercent &&
      a.rateType === b.rateType && a.months === b.months;
  }
  function samePresentation(a, b) {
    return a.mode === b.mode && a.displayCurrency === b.displayCurrency && a.fxRate === b.fxRate && a.fxDate === b.fxDate && a.fxSource === b.fxSource;
  }

  /* Devuelve true si se produjo un resultado nuevo. */
  function commit(opts) {
    opts = opts || {};
    var v = validateDraft();
    renderFieldErrors(v, opts.reason);
    renderConversionUi(v);
    renderEquivalence(v);
    if (!state.hasCalculated) return false;
    if (!v.ok) { setStale(true); return false; }

    var input = {
      principalBase: v.values.amount,
      baseCurrency: state.draft.currency,
      annualRatePercent: v.values.rate,
      rateType: state.draft.rateType,
      months: v.values.months,
    };
    var cur = state.current;
    var keepLoan = cur && sameInput(cur.input, input);
    if (keepLoan && samePresentation(cur.presentation, v.presentation) && !state.engineError) {
      setStale(false);
      return false;
    }
    var next;
    try {
      var result = keepLoan ? cur.result : engine.calculateLoan(input);
      var alt = keepLoan ? cur.alt : engine.calculateAlternative(input);
      var view = engine.convertResult(result, v.presentation);
      var altView = engine.convertResult(alt, v.presentation);
      next = {
        input: result.input, result: result, alt: alt, view: view, altView: altView,
        presentation: v.presentation, scenarioId: csv.scenarioId(result.input, v.presentation),
        analysis: analysis.buildAnalysis({ result: result, alt: alt, view: view, altView: altView }),
      };
    } catch (err) {
      console.error(err);
      state.engineError = err;
      setStale(true);
      return false;
    }
    state.engineError = null;
    state.current = next;
    setStale(false);
    renderAll(opts);
    if (opts.announce) announceResult();
    return true;
  }

  function setStale(flag) {
    state.isStale = !!flag && state.hasCalculated;
    var text = state.engineError
      ? 'No fue posible obtener un resultado confiable con estos datos; ajústalos para actualizar'
      : STALE_TEXT;
    qsa('[data-stale-chip]').forEach(function (chip) {
      chip.hidden = !(state.isStale && state.current);
      setText(chip, text);
    });
    if (state.hasCalculated && !state.current && state.engineError) {
      el.heroEmpty.hidden = false;
      el.heroResult.hidden = true;
      setText(el.heroOrient, 'No fue posible obtener un resultado confiable con estos datos. Revisa los valores e inténtalo de nuevo.');
    }
    document.body.classList.toggle('is-stale', state.isStale);
    updateExportState();
  }

  function exportable() {
    return !!(state.current && state.hasCalculated && !state.isStale && !state.isExporting);
  }

  function updateExportState() {
    var ok = exportable();
    qsa('[data-export-pdf]').forEach(function (b) {
      if (b.getAttribute('aria-busy') === 'true') return;
      b.disabled = !ok;
    });
    qsa('[data-csv]').forEach(function (b) { b.disabled = !ok; });
    el.printBtn.disabled = !(state.current && !state.isStale);
    el.flowAllBtn.disabled = !state.current;
    setText(el.scenarioId, state.current ? state.current.scenarioId + (state.isStale ? ' (desactualizado)' : '') : 'sin calcular');
  }

  function announceResult() {
    var c = state.current;
    if (!c) return;
    var v = c.view;
    announce(el.liveResults, 'Cuota mensual estimada: ' + format.spokenMoney(v.payment, v.currency) + '. Interés total: ' +
      format.spokenMoney(v.totalInterest, v.currency) + '. Total pagado: ' + format.spokenMoney(v.totalPaid, v.currency) +
      '. Plazo: ' + format.monthsLabel(c.result.input.months) + '.');
  }

  /* ------------------------------------------------------------------
     Controles: campos, deslizadores, tipo de tasa, moneda y conversión
     ------------------------------------------------------------------ */
  function setFill(slider) {
    var min = Number(slider.min), max = Number(slider.max), val = Number(slider.value);
    var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    slider.style.setProperty('--fill', pct.toFixed(2) + '%');
  }

  function syncAmountSlider(value, allowRescale) {
    if (allowRescale) {
      var scale = inputs.amountScaleFor(value);
      if (scale !== state.amountScale) {
        state.amountScale = scale;
        el.amountSlider.min = String(inputs.amountSliderMin(scale));
        setText(el.amountMax, format.formatNumber(scale, 0));
      }
    }
    el.amountSlider.value = String(inputs.positionFromAmount(value, state.amountScale));
    setFill(el.amountSlider);
    el.amountSlider.setAttribute('aria-valuetext', format.spokenMoney(value, state.draft.currency));
  }
  function syncRateSlider(value) {
    el.rateSlider.value = String(value);
    setFill(el.rateSlider);
    el.rateSlider.setAttribute('aria-valuetext', format.formatNumberTrim(value, 4, 1) + ' por ciento anual');
  }
  function syncMonthsSlider(value) {
    el.monthsSlider.value = String(value);
    setFill(el.monthsSlider);
    el.monthsSlider.setAttribute('aria-valuetext', format.monthsLabel(value));
  }

  function onFieldInput(key) {
    var input = FIELDS[key].input();
    state.draft[key] = input.value;
    var check = key === 'amount' ? inputs.validateAmount(input.value) : key === 'rate' ? inputs.validateRate(input.value) : inputs.validateMonths(input.value);
    if (check.ok) {
      if (key === 'amount') syncAmountSlider(check.value, true);
      else if (key === 'rate') syncRateSlider(check.value);
      else syncMonthsSlider(check.value);
      showFieldError(key, null);
    }
    if (state.hasCalculated) scheduleDebounced();
  }

  function normalizeField(key) {
    var input = FIELDS[key].input();
    var check = key === 'amount' ? inputs.validateAmount(input.value) : key === 'rate' ? inputs.validateRate(input.value) : inputs.validateMonths(input.value);
    if (!check.ok) return false;
    var text = key === 'amount' ? inputs.normalizedAmount(check.value) : key === 'rate' ? inputs.normalizedRate(check.value) : inputs.normalizedMonths(check.value);
    if (input.value !== text) input.value = text;
    state.draft[key] = text;
    return true;
  }

  function onFieldCommit(key) {
    state.touched[key] = true;
    normalizeField(key);
    window.clearTimeout(debounceTimer);
    debounceTimer = 0;
    var changed = commit({ reason: 'field', announce: false, animate: true });
    if (changed) announceResult();
  }

  function bindField(key) {
    var input = FIELDS[key].input();
    input.addEventListener('input', function () { onFieldInput(key); });
    input.addEventListener('blur', function () { onFieldCommit(key); });
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!state.hasCalculated) calculate();
      else onFieldCommit(key);
    });
  }

  function bindSlider(key) {
    var slider = key === 'amount' ? el.amountSlider : key === 'rate' ? el.rateSlider : el.monthsSlider;
    slider.addEventListener('input', function () {
      var value;
      if (key === 'amount') {
        value = inputs.amountFromPosition(Number(slider.value), state.amountScale);
        state.draft.amount = el.amount.value = inputs.normalizedAmount(value);
        slider.setAttribute('aria-valuetext', format.spokenMoney(value, state.draft.currency));
      } else if (key === 'rate') {
        value = Math.round(Number(slider.value) * 10) / 10;
        state.draft.rate = el.rate.value = inputs.normalizedRate(value);
        slider.setAttribute('aria-valuetext', format.formatNumberTrim(value, 4, 1) + ' por ciento anual');
      } else {
        value = Math.round(Number(slider.value));
        state.draft.months = el.months.value = String(value);
        slider.setAttribute('aria-valuetext', format.monthsLabel(value));
      }
      setFill(slider);
      state.touched[key] = true;
      showFieldError(key, null);
      if (state.hasCalculated) scheduleFrame();
      else renderEquivalence(validateDraft());
    });
    slider.addEventListener('change', function () {
      if (!state.hasCalculated) return;
      cancelPending();
      commit({ reason: 'drag-end', announce: true, animate: false });
    });
  }

  function updateRateHelp() {
    setText(el.rateTypeHelp, state.draft.rateType === RT.EFFECTIVE
      ? 'Efectiva anual: la tasa mensual es i = (1 + e)^(1/12) − 1; no se divide entre 12.'
      : 'Nominal anual capitalizable mensualmente: la tasa mensual es i = j / 12.');
  }

  function updateCurrencyUi() {
    var cur = format.currencyOf(state.draft.currency);
    setText(el.amountPrefix, cur.symbol);
    setText(el.fxRateLabel, '1 ' + cur.code + ' equivale a');
    setText(el.fxRateSuffix, state.conv.target);
    var check = inputs.validateAmount(state.draft.amount);
    if (check.ok) el.amountSlider.setAttribute('aria-valuetext', format.spokenMoney(check.value, cur.code));
  }

  function loadPairFields() {
    var pair = getPair();
    el.fxRate.value = pair.rate;
    el.fxDate.value = pair.date;
    el.fxSource.value = pair.source;
    state.touched.fxRate = false;
    state.touched.fxDate = false;
  }

  function renderConversionUi(v) {
    var pres = v.fx;
    var target = state.conv.target;
    var base = state.draft.currency;
    el.convPanel.hidden = !state.conv.enabled;
    el.convSame.hidden = !pres.same;
    el.fxFields.hidden = pres.same;
    setText(el.fxRateSuffix, target);
    var showRateErr = pres.errors.fxRate && (state.touched.fxRate || state.hasCalculated && state.touched.fxDate);
    var showDateErr = pres.errors.fxDate && (state.touched.fxDate || state.hasCalculated && state.touched.fxRate);
    el.fxRateErr.hidden = !showRateErr;
    el.fxDateErr.hidden = !showDateErr;
    if (showRateErr) {
      el.fxRateErr.textContent = pres.errors.fxRate.code === 'empty' ? 'Ingresa cuántos ' + target + ' equivalen a 1 ' + base + '.' : pres.errors.fxRate.message;
      el.fxRate.setAttribute('aria-invalid', 'true');
    } else el.fxRate.removeAttribute('aria-invalid');
    if (showDateErr) {
      el.fxDateErr.textContent = pres.errors.fxDate.message;
      el.fxDate.setAttribute('aria-invalid', 'true');
    } else el.fxDate.removeAttribute('aria-invalid');

    var status = '';
    var cls = 'status-line';
    if (state.conv.enabled) {
      if (pres.same) status = 'Resultados en ' + base + ' (misma moneda del préstamo).';
      else if (pres.pending) { status = 'Completa el tipo de cambio y su fecha para ver el resultado en ' + target + '. Mientras tanto se muestra en ' + base + '.'; cls += ' warn'; }
      else {
        status = 'Mostrando resultados en ' + target + ' con 1 ' + base + ' = ' + format.formatNumberTrim(v.presentation.fxRate, 8, 2) + ' ' + target +
          ' (referencia del ' + format.formatIsoDate(v.presentation.fxDate) + '). El préstamo sigue en ' + base + '.';
        cls += ' ok';
      }
    }
    el.convStatus.className = cls;
    setText(el.convStatus, status);
  }

  function renderEquivalence(v) {
    if (v.presentation.mode === 'conversion' && v.values.amount !== undefined && !v.errors.amount) {
      el.amountEq.hidden = false;
      setText(el.amountEq, 'Equivale a ' + format.formatMoney(v.values.amount * v.presentation.fxRate, v.presentation.displayCurrency) +
        ' con el tipo de cambio indicado. El límite del monto se aplica en ' + state.draft.currency + '.');
    } else {
      el.amountEq.hidden = true;
    }
  }

  function bindControls() {
    ['amount', 'rate', 'months'].forEach(function (k) { bindField(k); bindSlider(k); });

    qsa('input[name="rateType"]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.draft.rateType = r.value;
        updateRateHelp();
        commit({ reason: 'toggle', announce: true, animate: true });
      });
    });

    qsa('input[name="currency"]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.draft.currency = r.value;
        updateCurrencyUi();
        if (state.conv.enabled) loadPairFields();
        commit({ reason: 'toggle', announce: true, animate: false });
      });
    });

    el.convToggle.addEventListener('change', function () {
      state.conv.enabled = el.convToggle.checked;
      if (state.conv.enabled) loadPairFields();
      commit({ reason: 'toggle', announce: true, animate: false });
    });
    el.convTarget.addEventListener('change', function () {
      state.conv.target = el.convTarget.value;
      loadPairFields();
      commit({ reason: 'toggle', announce: true, animate: false });
    });
    el.fxRate.addEventListener('input', function () { getPair().rate = el.fxRate.value; if (state.hasCalculated) scheduleDebounced(); else renderConversionUi(validateDraft()); });
    el.fxRate.addEventListener('blur', function () {
      state.touched.fxRate = true;
      var chk = inputs.validateFxRate(el.fxRate.value);
      if (chk.ok) { el.fxRate.value = inputs.normalizedFx(chk.value); getPair().rate = el.fxRate.value; }
      cancelPending();
      if (commit({ reason: 'field', animate: false })) announceResult();
    });
    el.fxDate.addEventListener('change', function () {
      getPair().date = el.fxDate.value;
      state.touched.fxDate = true;
      cancelPending();
      if (commit({ reason: 'field', animate: false })) announceResult();
    });
    el.fxDate.addEventListener('blur', function () { state.touched.fxDate = true; renderConversionUi(validateDraft()); });
    el.fxSource.addEventListener('input', function () { getPair().source = el.fxSource.value; if (state.hasCalculated) scheduleDebounced(); });
    [el.fxRate, el.fxSource].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        inp.blur();
        inp.focus();
      });
    });

    el.form.addEventListener('submit', function (e) { e.preventDefault(); calculate(); });
  }

  /* «Calcular» valida todo, confirma el estado más reciente y lleva al resultado. */
  function calculate() {
    cancelPending();
    state.touched.amount = state.touched.rate = state.touched.months = true;
    if (state.conv.enabled) { state.touched.fxRate = true; state.touched.fxDate = true; }
    var v = validateDraft();
    if (!v.ok) {
      renderFieldErrors(v, 'calc');
      fillErrorSummary(v);
      el.errorSummary.hidden = false;
      if (state.hasCalculated) setStale(true);
      var firstKey = ['amount', 'rate', 'months'].filter(function (k) { return v.errors[k]; })[0];
      FIELDS[firstKey].input().focus();
      return;
    }
    el.errorSummary.hidden = true;
    ['amount', 'rate', 'months'].forEach(normalizeField);
    var first = !state.hasCalculated;
    state.hasCalculated = true;
    commit({ reason: 'calc', announce: false, animate: true });
    if (!state.current) return;
    if (first) reveal();
    announceResult();
    var hero = $('hero');
    var rect = hero.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      hero.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    }
    el.results.focus({ preventScroll: true });
  }

  function reveal() {
    qsa('[data-empty]').forEach(function (n) { n.hidden = true; });
    qsa('[data-filled]').forEach(function (n) {
      n.hidden = false;
      if (!reduced()) {
        n.classList.add('is-entering');
        n.addEventListener('animationend', function done() { n.classList.remove('is-entering'); n.removeEventListener('animationend', done); });
      }
    });
    if (!reduced()) {
      el.heroResult.classList.add('is-entering');
      el.heroResult.addEventListener('animationend', function done() { el.heroResult.classList.remove('is-entering'); el.heroResult.removeEventListener('animationend', done); });
    }
    renderCharts();
    updateTableHint();
  }

  /* ------------------------------------------------------------------
     Render
     ------------------------------------------------------------------ */
  function renderAll(opts) {
    renderHero(opts);
    renderKpis();
    renderPrecision();
    renderCharts();
    renderTable(false);
    renderAnalysis();
    renderCsvMeta();
    updateExportState();
  }

  function fitText(node, texts, maxSize, minSize, weight) {
    var avail = node.clientWidth;
    if (!avail) return;
    var widest = 0;
    texts.forEach(function (t) { widest = Math.max(widest, measure(t, maxSize, weight)); });
    var size = widest > avail ? Math.max(minSize, Math.floor((maxSize * avail / widest) * 2) / 2) : maxSize;
    node.style.fontSize = size + 'px';
  }

  function heroMaxSize() { return Math.min(52, Math.max(34, window.innerWidth * 0.042)); }

  function animateHero(target, cur, animate) {
    var h = state.hero;
    if (h.raf) cancelAnimationFrame(h.raf);
    h.raf = 0;
    var from = h.value;
    var fmt = function (x) { return format.formatMoney(x, cur); };
    fitText(el.heroAmount.parentElement, [fmt(target), from !== null && h.currency === cur ? fmt(from) : fmt(target)], heroMaxSize(), 20, 600);
    if (!animate || reduced() || from === null || h.currency !== cur || from === target) {
      el.heroAmount.textContent = fmt(target);
    } else {
      var t0 = performance.now();
      var dur = 380;
      var step = function (now) {
        var p = Math.min(1, (now - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        el.heroAmount.textContent = fmt(from + (target - from) * e);
        if (p < 1) h.raf = requestAnimationFrame(step);
        else { h.raf = 0; el.heroAmount.textContent = fmt(target); }
      };
      h.raf = requestAnimationFrame(step);
    }
    h.value = target;
    h.currency = cur;
  }

  function renderHero(opts) {
    var c = state.current;
    var v = c.view;
    var r = c.result;
    el.heroEmpty.hidden = true;
    el.heroResult.hidden = false;
    setText(el.heroAmountSr, format.formatMoney(v.payment, v.currency));
    animateHero(v.payment, v.currency, !!(opts && opts.animate));
    var nominal = r.input.rateType === RT.NOMINAL;
    setText(el.heroMeta, format.monthsLabel(r.input.months) + ' · Tasa ' + (nominal ? 'nominal' : 'efectiva') + ' anual ' +
      format.formatPercentTrim(r.input.annualRatePercent, 4, 2));
    setText(el.heroRate, 'Tasa mensual equivalente: ' + format.formatPercentTrim(r.monthlyRate * 100, 6, 2) +
      (nominal ? ' · TEA equivalente ' + format.formatPercentTrim(r.effectiveAnnualRate * 100, 4, 2) : ''));
    if (v.mode === 'conversion') {
      setText(el.heroCurrency, 'Mostrado en ' + v.currency + ' · 1 ' + v.baseCurrency + ' = ' + format.formatNumberTrim(v.fxRate, 8, 2) + ' ' +
        v.currency + ' (ref. ' + format.formatIsoDate(v.fxDate) + ') · préstamo en ' + v.baseCurrency);
    } else {
      setText(el.heroCurrency, 'Importes en ' + format.currencyOf(v.currency).plural + ' (' + v.currency + ')');
    }
    var differs = format.roundHalfAway(v.lastPayment, 2) !== format.roundHalfAway(v.payment, 2);
    el.heroLast.hidden = !differs;
    if (differs) setText(el.heroLast, 'Último pago: ' + format.formatMoney(v.lastPayment, v.currency) + ' (cierra el saldo).');
  }

  function renderKpis() {
    var c = state.current;
    var v = c.view;
    var pairs = [
      [el.kpiPrincipal, format.formatMoney(v.principal, v.currency)],
      [el.kpiInterest, format.formatMoney(v.totalInterest, v.currency)],
      [el.kpiTotal, format.formatMoney(v.totalPaid, v.currency)],
      [el.kpiShare, format.formatPercent(100 * c.result.interestShare, 1)],
    ];
    pairs.forEach(function (p) { setText(p[0], p[1]); });
    fitKpis();
  }

  /* Importes extensos: primero una columna más ancha; nunca recortar. */
  function fitKpis() {
    var nodes = [el.kpiPrincipal, el.kpiInterest, el.kpiTotal, el.kpiShare];
    var grid = $('kpis');
    grid.classList.remove('kpis-wide');
    var fits = function () {
      nodes.forEach(function (k) { fitText(k, [k.textContent], 22, 15, 600); });
      return nodes.every(function (k) { return k.scrollWidth <= k.clientWidth + 1; }) &&
        nodes.every(function (k) { return parseFloat(k.style.fontSize || '22') >= 15; });
    };
    if (!fits()) {
      grid.classList.add('kpis-wide');
      nodes.forEach(function (k) { fitText(k, [k.textContent], 22, 12, 600); });
    }
  }

  function renderPrecision() {
    var c = state.current;
    var r = c.result;
    var v = c.view;
    var cur = ' ' + v.currency;
    var rows = [
      ['Cuota teórica A', format.formatNumber(v.payment, 6) + cur],
      ['Último pago Aₙ', format.formatNumber(v.lastPayment, 6) + cur],
      ['Tasa mensual i', format.formatPercentTrim(r.monthlyRate * 100, 10, 6) + ' (' + (r.monthlyRate > 0 && r.monthlyRate < 1e-4
        ? format.formatScientific(r.monthlyRate, 6) : format.formatNumberTrim(r.monthlyRate, 12, 6)) + ')'],
      ['Tasa efectiva anual equivalente', format.formatPercentTrim(r.effectiveAnnualRate * 100, 6, 6)],
      ['Factor (A/P, i, n)', format.formatNumber(r.capitalRecoveryFactor, 10)],
      ['Interés total J', format.formatNumber(v.totalInterest, 6) + cur],
      ['Total pagado T', format.formatNumber(v.totalPaid, 6) + cur],
      ['Residuo de equivalencia P − Σ Aₜ/(1+i)^t', format.formatScientific(r.diagnostics.presentValueResidual, 2) + ' ' + r.input.baseCurrency],
      ['Cierre del último mes (Aₙ − A)', format.formatScientific(r.diagnostics.balanceResidual, 2) + ' ' + r.input.baseCurrency],
      ['Tolerancia del motor ε', format.formatScientific(r.diagnostics.epsilon, 1) + ' ' + r.input.baseCurrency],
    ];
    clear(el.precisionList);
    rows.forEach(function (row) {
      el.precisionList.appendChild(make('dt', null, row[0]));
      el.precisionList.appendChild(make('dd', 'num', row[1]));
    });
  }

  /* ------------------------------ Gráficas ------------------------------ */
  var scenes = { donut: null, balance: null, flow: null, flowAll: null };

  function renderCharts() {
    if (!state.current || el.donutPlot.offsetParent === null && el.balancePlot.offsetParent === null) return;
    renderDonut();
    renderBalance();
    renderFlow();
    if (state.flowAll) renderFlowAll();
  }

  function renderDonut() {
    var c = state.current;
    var v = c.view;
    var size = Math.max(150, Math.min(220, el.donutPlot.clientWidth || 200));
    var pct = format.compositionPercents(v.principal, v.totalInterest);
    var scene = charts.buildDonutScene({
      size: size, measure: measure, total: v.totalPaid, interest: v.totalInterest,
      centerLabel: 'Total pagado', centerValue: format.formatMoney(v.totalPaid, v.currency), centerSize: 17, centerLabelSize: 12,
      centerCompact: format.compactMoney(v.totalPaid, v.currency),
    });
    scenes.donut = scene;
    charts.renderSvg(el.donutSvg, scene);
    setText(el.donutDesc, 'Capital ' + format.formatMoney(v.principal, v.currency) + ' (' + format.formatPercent(pct.capital, 1) +
      '); intereses ' + format.formatMoney(v.totalInterest, v.currency) + ' (' + format.formatPercent(pct.interest, 1) + '); total pagado ' +
      format.formatMoney(v.totalPaid, v.currency) + '.');
    clear(el.donutLegend);
    var rows = [
      ['capital', 'Capital', v.principal, pct.capital],
      ['interest', 'Intereses', v.totalInterest, pct.interest],
      ['total', 'Total pagado', v.totalPaid, 100],
    ];
    rows.forEach(function (row) {
      var li = make('li', row[0] === 'total' ? 'total' : null);
      li.appendChild(row[0] === 'total' ? make('span') : make('span', 'swatch ' + row[0]));
      li.appendChild(make('span', 'l-name', row[1]));
      li.appendChild(make('span', 'l-pct', format.formatPercent(row[3], 1)));
      li.appendChild(make('span', 'l-val', format.formatMoney(row[2], v.currency)));
      el.donutLegend.appendChild(li);
    });
    highlightDonut(null);
  }

  function balanceSeries() {
    var v = state.current.view;
    return state.balanceView === 'debt'
      ? v.cashFlows.map(function (f) { return f.debtBalance; })
      : v.cashFlows.map(function (f) { return f.cumulativeCash; });
  }

  function buildBalance(kind, width) {
    var c = state.current;
    var v = c.view;
    var n = c.result.input.months;
    var values = kind === 'debt' ? v.cashFlows.map(function (f) { return f.debtBalance; }) : v.cashFlows.map(function (f) { return f.cumulativeCash; });
    var w = Math.max(260, width);
    return charts.buildBalanceScene({
      w: w, h: Math.round(Math.min(300, Math.max(240, w * 0.66))), kind: kind, values: values, n: n, measure: measure,
      unitLabel: (kind === 'debt' ? 'Deuda pendiente' : 'Efectivo acumulado del préstamo') + ' (' + v.currency + ')',
      tickSize: 11, labelSize: 12, endLabel: 'Mes ' + n + ': ' + format.formatMoney(values[n], v.currency),
    });
  }

  var BALANCE_TEXT = {
    debt: 'Deuda que queda después de cada pago: inicia en el capital y termina en cero. No es el saldo de una cuenta bancaria.',
    cash: 'Acumulación nominal del desembolso y los pagos del préstamo. No incluye ingresos, gastos, inversión del capital ni saldo de una cuenta bancaria.',
  };

  function renderBalance() {
    var c = state.current;
    var v = c.view;
    var kind = state.balanceView;
    var scene = buildBalance(kind, el.balancePlot.clientWidth || 320);
    scenes.balance = scene;
    charts.renderSvg(el.balanceSvg, scene);
    var n = c.result.input.months;
    var values = balanceSeries();
    setText(el.balanceViewName, kind === 'debt' ? 'deuda pendiente' : 'efectivo acumulado del préstamo');
    setText(el.balanceSvgTitle, kind === 'debt' ? 'Deuda pendiente por mes' : 'Efectivo acumulado del préstamo por mes');
    setText(el.balanceExplain, BALANCE_TEXT[kind]);
    setText(el.balanceDesc, kind === 'debt'
      ? 'La deuda empieza en ' + format.formatMoney(values[0], v.currency) + ' en el mes 0 y llega a ' + format.formatMoney(values[n], v.currency) + ' en el mes ' + n + '.'
      : 'El acumulado empieza en ' + format.formatMoney(values[0], v.currency) + ' con el desembolso y termina en ' + format.formatMoney(values[n], v.currency) + ' en el mes ' + n + ', igual a menos el interés total.');
    if (state.selected.balance !== null && state.selected.balance > n) state.selected.balance = n;
    highlightMonth('balance', state.selected.balance, false);
    if (el.balanceDataDetails.open) renderBalanceData();
  }

  function renderBalanceData() {
    var v = state.current.view;
    var table = make('table');
    var thead = make('thead');
    var hr = make('tr');
    ['Mes', 'Flujo del mes', 'Efectivo acumulado', 'Deuda pendiente'].forEach(function (h) { var th = make('th', null, h); th.scope = 'col'; hr.appendChild(th); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = make('tbody');
    var frag = document.createDocumentFragment();
    v.cashFlows.forEach(function (f) {
      var tr = make('tr');
      tr.appendChild(make('td', null, String(f.month)));
      tr.appendChild(make('td', null, format.formatMoney(f.flow, v.currency, { sign: 'always' })));
      tr.appendChild(make('td', null, format.formatMoney(f.cumulativeCash, v.currency)));
      tr.appendChild(make('td', null, format.formatMoney(f.debtBalance, v.currency)));
      frag.appendChild(tr);
    });
    tb.appendChild(frag);
    table.appendChild(tb);
    clear(el.balanceData);
    el.balanceData.appendChild(table);
  }

  function flowOptions(layout, width) {
    var c = state.current;
    var v = c.view;
    var n = c.result.input.months;
    var pays = v.schedule.map(function (r) { return r.payment; });
    var w = Math.max(280, width);
    return {
      w: w, h: Math.round(Math.min(330, Math.max(250, w * 0.42))), n: n, principal: v.principal, payments: pays,
      mode: state.flowMode, layout: layout, measure: measure, fontSize: 12, tickSize: 11, spacing: 34,
      allEqual: format.roundHalfAway(pays[n - 1], 2) === format.roundHalfAway(pays[0], 2),
      money: function (x, sign) { return format.formatMoney(x, v.currency, { sign: sign || 'auto' }); },
    };
  }

  function renderFlow() {
    var c = state.current;
    var v = c.view;
    var n = c.result.input.months;
    var opts = flowOptions('fit', el.flowPlot.clientWidth || 320);
    var scene = charts.buildCashFlowScene(opts);
    scenes.flow = scene;
    charts.renderSvg(el.flowSvg, scene);
    setText(el.flowScaleNote, state.flowMode === 'schema'
      ? 'Esquema temporal; longitudes de flecha no proporcionales.'
      : 'Escala proporcional: la entrada y las salidas comparten el mismo eje monetario (' + v.currency +
        (scene.layout.millions ? '; M = millones' : '') + '), sin ampliar las cuotas.');
    var M = function (x, s) { return format.formatMoney(x, v.currency, { sign: s || 'auto' }); };
    clear(el.flowTramos);
    el.flowTramos.hidden = !scene.layout.grouped;
    if (scene.layout.grouped) {
      scene.layout.tramos.forEach(function (tr) {
        var count = tr.to - tr.from + 1;
        el.flowTramos.appendChild(make('li', null, 'Pagos mensuales del mes ' + tr.from + ' al ' + tr.to + ': ' + count +
          (count === 1 ? ' pago de ' : ' pagos de ') + M(-opts.payments[tr.from - 1]) + '.'));
      });
    }
    var summary = 'Entrada inicial: ' + M(v.principal, 'always') + ' en el mes 0. ' + n + (n === 1 ? ' salida mensual de ' : ' salidas mensuales de ') +
      M(-v.payment) + (n === 1 ? ' en el mes 1' : ' (meses 1 a ' + n + ')') + '. Total de salidas: ' + M(-v.totalPaid) + '.';
    if (!opts.allEqual) summary += ' La última cuota es de ' + M(-v.lastPayment) + '.';
    setText(el.flowSummary, summary);
    setText(el.flowDesc, summary + ' ' + el.flowScaleNote.textContent);
    if (state.selected.flow !== null && state.selected.flow > n) state.selected.flow = n;
    highlightMonth('flow', state.selected.flow, false);
  }

  function renderFlowAll() {
    var c = state.current;
    var n = c.result.input.months;
    var scene = charts.buildCashFlowScene(flowOptions('full', 0));
    scenes.flowAll = scene;
    charts.renderSvg(el.flowAllSvg, scene);
    el.flowAllSvg.style.width = scene.w + 'px';
    setText(el.flowAllHint, 'Desliza horizontalmente para recorrer los ' + n + (n === 1 ? ' mes' : ' meses') + '. Cada flecha es un mes; la tabla contiene todos los importes.');
    if (state.selected.flowAll !== null && state.selected.flowAll > n) state.selected.flowAll = n;
    highlightMonth('flowAll', state.selected.flowAll, false);
  }

  /* ---------------------- Interacción de gráficas ----------------------- */
  var CHARTS = {
    balance: { plot: function () { return el.balancePlot; }, svg: function () { return el.balanceSvg; }, tip: function () { return el.balanceTooltip; }, scene: function () { return scenes.balance; } },
    flow: { plot: function () { return el.flowPlot; }, svg: function () { return el.flowSvg; }, tip: function () { return el.flowTooltip; }, scene: function () { return scenes.flow; } },
    flowAll: { plot: function () { return el.flowAllPlot; }, svg: function () { return el.flowAllSvg; }, tip: function () { return el.flowAllTooltip; }, scene: function () { return scenes.flowAll; } },
  };

  function describeMonth(kind, m) {
    var v = state.current.view;
    var f = v.cashFlows[m];
    var row = m > 0 ? v.schedule[m - 1] : null;
    var M = function (x, s) { return format.formatMoney(x, v.currency, { sign: s || 'auto' }); };
    if (kind === 'balance' && state.balanceView === 'debt') {
      return { title: 'Mes ' + m, lines: m === 0 ? ['Deuda inicial: ' + M(f.debtBalance), 'Desembolso recibido'] : ['Deuda pendiente: ' + M(f.debtBalance), 'Capital amortizado: ' + M(row.principal), 'Interés del mes: ' + M(row.interest)] };
    }
    if (kind === 'balance') {
      return { title: 'Mes ' + m, lines: ['Flujo del mes: ' + M(f.flow, 'always'), 'Efectivo acumulado: ' + M(f.cumulativeCash)] };
    }
    if (m === 0) return { title: 'Mes 0 · Desembolso recibido', lines: ['Entrada: ' + M(f.flow, 'always')] };
    return { title: 'Mes ' + m + ' · Salida (cuota)', lines: ['Pago: ' + M(-row.payment), 'Capital: ' + M(row.principal) + ' · Interés: ' + M(row.interest)] };
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function highlightMonth(kind, m, withTip) {
    var cfg = CHARTS[kind];
    var svg = cfg.svg();
    var scene = cfg.scene();
    var old = svg.querySelector('g.hl');
    if (old) old.remove();
    var tip = cfg.tip();
    if (m === null || m === undefined || !scene || !state.current) { tip.hidden = true; return; }
    var L = scene.layout;
    var g = svgEl('g', { 'class': 'hl', 'pointer-events': 'none' });
    var x = L.xOf(m);
    var anchorY;
    if (kind === 'balance') {
      var vals = balanceSeries();
      var y = L.yOf(vals[m]);
      g.appendChild(svgEl('line', { x1: x, y1: L.y0, x2: x, y2: L.y1, stroke: '#2B3430', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
      g.appendChild(svgEl('circle', { cx: x, cy: y, r: 5.5, fill: '#FCFBF7', stroke: state.balanceView === 'debt' ? '#10372F' : '#2B3430', 'stroke-width': 2.5 }));
      anchorY = y;
    } else {
      var half = Math.max(5, L.stepPx / 2);
      g.appendChild(svgEl('rect', { x: x - half, y: L.top - 6, width: half * 2, height: L.bottom - L.top + 12, rx: 4, fill: '#C5A25D', 'fill-opacity': 0.22, stroke: '#10372F', 'stroke-width': 1 }));
      anchorY = m === 0 ? L.top : L.axisY;
    }
    svg.appendChild(g);
    if (withTip === false) { tip.hidden = true; return; }
    var d = describeMonth(kind === 'balance' ? 'balance' : 'flow', m);
    clear(tip);
    tip.appendChild(make('span', 'tt-title', d.title));
    d.lines.forEach(function (line) { tip.appendChild(make('span', null, line)); tip.appendChild(document.createElement('br')); });
    if (tip.lastChild && tip.lastChild.nodeName === 'BR') tip.removeChild(tip.lastChild);
    tip.hidden = false;
    placeTooltip(cfg.plot(), svg, tip, scene, x, anchorY);
    return d;
  }

  function placeTooltip(plot, svg, tip, scene, sx, sy) {
    var svgRect = svg.getBoundingClientRect();
    var plotRect = plot.getBoundingClientRect();
    var k = svgRect.width / scene.w;
    var px = svgRect.left - plotRect.left + sx * k;
    var py = svgRect.top - plotRect.top + sy * k;
    var tw = tip.offsetWidth;
    var th = tip.offsetHeight;
    var maxLeft = Math.max(0, plot.clientWidth - tw);
    var left = Math.min(maxLeft, Math.max(0, px - tw / 2));
    if (plot.parentElement === el.flowAllScroll) left = Math.max(0, px - tw / 2);
    var top = py - th - 12;
    if (top < 0) top = py + 14;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function monthFromEvent(kind, e) {
    var cfg = CHARTS[kind];
    var scene = cfg.scene();
    if (!scene) return null;
    var rect = cfg.svg().getBoundingClientRect();
    var x = (e.clientX - rect.left) * (scene.w / rect.width);
    var L = scene.layout;
    if (L.monthAt) return L.monthAt(x);
    var t = Math.round(((x - L.x0) / (L.x1 - L.x0)) * L.n);
    return Math.max(0, Math.min(L.n, t));
  }

  function bindChart(kind) {
    var cfg = CHARTS[kind];
    var plot = kind === 'flowAll' ? el.flowAllScroll : cfg.plot();
    var surface = cfg.plot();
    surface.addEventListener('pointermove', function (e) {
      if (!state.current || e.pointerType === 'touch' && kind === 'flowAll') return;
      var m = monthFromEvent(kind, e);
      if (m === null) return;
      state.selected[kind] = m;
      highlightMonth(kind, m, true);
    });
    surface.addEventListener('pointerdown', function (e) {
      if (!state.current || e.pointerType !== 'touch') return;
      var m = monthFromEvent(kind, e);
      if (m === null) return;
      state.selected[kind] = m;
      highlightMonth(kind, m, true);
    });
    surface.addEventListener('pointerleave', function () {
      if (document.activeElement !== plot) highlightMonth(kind, null);
    });
    plot.addEventListener('focus', function () {
      if (!state.current) return;
      var m = state.selected[kind];
      if (m === null) m = 0;
      state.selected[kind] = m;
      highlightMonth(kind, m, true);
    });
    plot.addEventListener('blur', function () { highlightMonth(kind, null); });
    plot.addEventListener('keydown', function (e) {
      if (!state.current) return;
      var n = state.current.result.input.months;
      var m = state.selected[kind] === null ? 0 : state.selected[kind];
      var big = Math.max(1, Math.round(n / 10));
      var map = { ArrowRight: m + 1, ArrowLeft: m - 1, PageUp: m + big, PageDown: m - big, Home: 0, End: n };
      if (e.key === 'Escape') { highlightMonth(kind, null); return; }
      if (!(e.key in map)) return;
      e.preventDefault();
      m = Math.max(0, Math.min(n, map[e.key]));
      state.selected[kind] = m;
      var d = highlightMonth(kind, m, true);
      if (kind === 'flowAll') {
        var L = scenes.flowAll.layout;
        var x = L.xOf(m);
        var sc = el.flowAllScroll;
        if (x < sc.scrollLeft + 40 || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - sc.clientWidth / 2;
        d = highlightMonth(kind, m, true);
      }
      if (d) announce(el.liveCharts, d.title + '. ' + d.lines.join('. ') + '.');
    });
  }

  function highlightDonut(part) {
    qsa('path, circle', el.donutSvg).forEach(function (p) {
      if (p.getAttribute('data-part') === part) { p.setAttribute('data-active', 'true'); p.style.filter = 'brightness(.92)'; }
      else { p.removeAttribute('data-active'); p.style.filter = ''; }
    });
    var tip = el.donutTooltip;
    if (!part || !state.current) { tip.hidden = true; return null; }
    var v = state.current.view;
    var pct = format.compositionPercents(v.principal, v.totalInterest);
    var d = part === 'capital'
      ? { title: 'Capital', lines: [format.formatMoney(v.principal, v.currency), format.formatPercent(pct.capital, 1) + ' del total pagado'] }
      : { title: 'Intereses', lines: [format.formatMoney(v.totalInterest, v.currency), format.formatPercent(pct.interest, 1) + ' del total pagado'] };
    clear(tip);
    tip.appendChild(make('span', 'tt-title', d.title));
    tip.appendChild(make('span', null, d.lines.join(' · ')));
    tip.hidden = false;
    var s = scenes.donut;
    placeTooltip(el.donutPlot, el.donutSvg, tip, s, s.w / 2, 18);
    return d;
  }

  function bindDonut() {
    el.donutSvg.addEventListener('pointermove', function (e) {
      var t = e.target.closest ? e.target.closest('[data-part]') : null;
      highlightDonut(t ? t.getAttribute('data-part') : null);
    });
    el.donutPlot.addEventListener('pointerleave', function () { if (document.activeElement !== el.donutPlot) highlightDonut(null); });
    el.donutPlot.addEventListener('focus', function () { if (state.current) highlightDonut(state.selected.donut); });
    el.donutPlot.addEventListener('blur', function () { highlightDonut(null); });
    el.donutPlot.addEventListener('keydown', function (e) {
      if (!state.current) return;
      if (['ArrowLeft', 'ArrowRight'].indexOf(e.key) < 0) return;
      e.preventDefault();
      state.selected.donut = state.selected.donut === 'capital' ? 'interest' : 'capital';
      var d = highlightDonut(state.selected.donut);
      if (d) announce(el.liveCharts, d.title + ': ' + d.lines.join(', ') + '.');
    });
  }

  /* ------------------------------- Tabla -------------------------------- */
  var PAGE_SIZE = 24;

  function tablePaging() {
    var n = state.current.result.input.months;
    var paginate = n > 60 && !state.table.showAll && !state.table.printing;
    var pages = paginate ? Math.ceil(n / PAGE_SIZE) : 1;
    return { n: n, paginate: paginate, pages: pages };
  }

  function renderTable(fromUser) {
    var c = state.current;
    var v = c.view;
    var p = tablePaging();
    if (state.table.page > p.pages - 1) {
      var before = state.table.page;
      state.table.page = Math.max(0, p.pages - 1);
      if (!fromUser && p.paginate && before !== state.table.page) announce(el.liveCharts, 'La tabla pasó a la página ' + (state.table.page + 1) + ' de ' + p.pages + ' porque cambió el plazo.');
    }
    var start = p.paginate ? state.table.page * PAGE_SIZE : 0;
    var end = p.paginate ? Math.min(p.n, start + PAGE_SIZE) : p.n;
    var frag = document.createDocumentFragment();
    for (var k = start; k < end; k++) {
      var row = v.schedule[k];
      var tr = document.createElement('tr');
      tr.tabIndex = -1;
      tr.dataset.month = String(row.month);
      var th = make('td', null, (row.month < 10 ? '0' : '') + row.month);
      tr.appendChild(th);
      tr.appendChild(make('td', null, format.formatMoney(row.payment, v.currency)));
      tr.appendChild(make('td', null, format.formatMoney(row.principal, v.currency)));
      tr.appendChild(make('td', null, format.formatMoney(row.interest, v.currency)));
      tr.appendChild(make('td', null, format.formatMoney(row.balance, v.currency)));
      frag.appendChild(tr);
    }
    clear(el.amortBody);
    el.amortBody.appendChild(frag);

    var sA = engine.createSum(), sK = engine.createSum(), sI = engine.createSum();
    v.schedule.forEach(function (r) { sA.add(r.payment); sK.add(r.principal); sI.add(r.interest); });
    setText(el.ftPay, format.formatMoney(sA.value(), v.currency));
    setText(el.ftPrincipal, format.formatMoney(sK.value(), v.currency));
    setText(el.ftInterest, format.formatMoney(sI.value(), v.currency));
    setText(el.ftBalance, 'Saldo final ' + format.formatMoney(v.schedule[p.n - 1].balance, v.currency));

    setText(el.disb, 'Mes 0 · Desembolso recibido: ' + format.formatMoney(v.principal, v.currency, { sign: 'always' }) +
      '. No es una cuota; por eso la tabla empieza en el mes 1.');
    setText(el.tableCaption, 'Tabla de amortización de ' + format.monthsLabel(p.n) + ', ' + format.currencyOf(v.currency).plural + ' (' + v.currency + ')');
    setText(el.tableRange, p.paginate
      ? 'Meses ' + (start + 1) + '–' + end + ' de ' + p.n + ' · página ' + (state.table.page + 1) + ' de ' + p.pages
      : (p.n === 1 ? 'Mes 1 de 1' : 'Meses 1–' + p.n + ' · todos los pagos'));
    el.tblPrev.hidden = el.tblNext.hidden = !p.paginate;
    el.tblFirst.disabled = false;
    el.tblPrev.disabled = !p.paginate || state.table.page === 0;
    el.tblNext.disabled = !p.paginate || state.table.page >= p.pages - 1;
    el.tblAll.hidden = p.n <= 60;
    el.tblAll.setAttribute('aria-pressed', String(state.table.showAll));
    setText(el.tblAll, state.table.showAll ? 'Mostrar por páginas' : 'Mostrar todos (' + p.n + ')');
    updateTableHint();
  }

  function updateTableHint() {
    el.tableHint.hidden = !(el.tableWrap.scrollWidth > el.tableWrap.clientWidth + 1);
  }

  function focusRow(month) {
    var tr = el.amortBody.querySelector('tr[data-month="' + month + '"]');
    if (!tr) return;
    el.tableWrap.scrollTop = tr.offsetTop - (month === 1 ? tr.offsetTop : el.tableWrap.clientHeight / 2);
    tr.focus({ preventScroll: true });
  }

  function bindTable() {
    el.tblFirst.addEventListener('click', function () { state.table.page = 0; renderTable(true); el.tableWrap.scrollTop = 0; focusRow(1); });
    el.tblPrev.addEventListener('click', function () { state.table.page = Math.max(0, state.table.page - 1); renderTable(true); el.tableWrap.scrollTop = 0; });
    el.tblNext.addEventListener('click', function () { state.table.page += 1; renderTable(true); el.tableWrap.scrollTop = 0; });
    el.tblLast.addEventListener('click', function () {
      var p = tablePaging();
      state.table.page = p.pages - 1;
      renderTable(true);
      el.tableWrap.scrollTop = el.tableWrap.scrollHeight;
      focusRow(p.n);
    });
    el.tblAll.addEventListener('click', function () {
      state.table.showAll = !state.table.showAll;
      renderTable(true);
      announce(el.liveCharts, state.table.showAll ? 'La tabla muestra todos los meses.' : 'La tabla vuelve a mostrarse por páginas de 24 meses.');
    });
  }

  /* ------------------------------ Análisis ------------------------------ */
  function renderAnalysis() {
    var c = state.current;
    var a = c.analysis;
    clear(el.analysisText);
    a.paragraphs.forEach(function (p) {
      var para = make('p');
      para.appendChild(make('strong', null, p.title));
      para.appendChild(document.createTextNode(' ' + p.text));
      el.analysisText.appendChild(para);
    });
    setText(el.cmpHCur, 'Actual (' + format.monthsLabel(a.comparison.currentMonths) + ')');
    setText(el.cmpHAlt, 'Alternativo (' + format.monthsLabel(a.comparison.altMonths) + ')');
    clear(el.compareBody);
    a.comparison.rows.forEach(function (row) {
      var tr = make('tr');
      var th = make('th', null, row.label);
      th.scope = 'row';
      tr.appendChild(th);
      tr.appendChild(make('td', null, row.current));
      tr.appendChild(make('td', null, row.alt));
      tr.appendChild(make('td', row.dir === 'up' ? 'dir-up' : row.dir === 'down' ? 'dir-down' : null, row.delta));
      el.compareBody.appendChild(tr);
    });
    setText(el.useAlt, 'Usar este plazo (' + format.monthsLabel(a.comparison.altMonths) + ')');
    clear(el.formulas);
    a.formulas.forEach(function (f) {
      var g = make('div', 'formula-group');
      g.appendChild(make('h4', null, f.title));
      f.lines.forEach(function (line) { g.appendChild(make('p', null, line)); });
      el.formulas.appendChild(g);
    });
  }

  function renderAssumptions() {
    clear(el.assumptionsList);
    analysis.ASSUMPTIONS.forEach(function (s) { el.assumptionsList.appendChild(make('li', null, s)); });
  }

  /* ---------------------------- Exportaciones --------------------------- */
  function snapshot() {
    var c = state.current;
    return Object.freeze({
      result: c.result, alt: c.alt, view: c.view, altView: c.altView, analysis: c.analysis,
      scenarioId: c.scenarioId, presentation: c.presentation, generatedAt: new Date(),
      config: CFG, emailValid: isValidEmail(CFG.coordinatorEmail),
    });
  }

  function renderCsvMeta() {
    var n = state.current.result.input.months;
    qsa('[data-csv-meta]').forEach(function (m) {
      var k = m.getAttribute('data-csv-meta');
      setText(m, k === 'escenario' ? '1 fila' : k === 'amortizacion' ? n + (n === 1 ? ' fila' : ' filas') : (n + 1) + ' filas');
    });
  }

  function setPdfStatus(text, kind) {
    qsa('[data-pdf-status]').forEach(function (s) { s.className = 'export-status' + (kind ? ' ' + kind : ''); setText(s, text); });
  }

  function ensurePdfLib() {
    var ns = window.jspdf;
    if (!(ns && ns.jsPDF)) {
      ['vendor-jspdf', 'vendor-autotable'].forEach(function (id) {
        var src = $(id);
        if (!src) throw new Error('Falta la biblioteca incorporada ' + id + '.');
        var s = document.createElement('script');
        s.textContent = src.textContent;
        document.head.appendChild(s);
      });
      ns = window.jspdf;
    }
    if (!(ns && ns.jsPDF)) throw new Error('jsPDF no se pudo inicializar.');
    if (typeof ns.jsPDF.API.autoTable !== 'function' && typeof window.applyPlugin === 'function') window.applyPlugin(ns.jsPDF);
    if (typeof ns.jsPDF.API.autoTable !== 'function') throw new Error('AutoTable no se pudo inicializar.');
    return ns.jsPDF;
  }

  function readFonts() {
    return {
      sans: $('font-vsans-regular').textContent.trim(),
      sansSemibold: $('font-vsans-semibold').textContent.trim(),
      serif: $('font-vserif-regular').textContent.trim(),
    };
  }

  /* El emblema oficial vive una sola vez en la hoja de estilos (--emblem). */
  function readEmblem() {
    var raw = getComputedStyle(document.documentElement).getPropertyValue('--emblem');
    var m = /url\((['"]?)(data:image\/png;base64,[^'")\s]+)\1\)/.exec(raw || '');
    return m ? m[2] : null;
  }

  async function exportPdf() {
    if (state.isExporting) return;
    flushPending();
    if (!exportable()) return;
    var snap = snapshot();
    var buttons = qsa('[data-export-pdf]');
    state.isExporting = true;
    buttons.forEach(function (b) { b.disabled = true; b.setAttribute('aria-busy', 'true'); b.querySelector('span').textContent = 'Preparando informe…'; });
    setPdfStatus('Preparando informe…');
    try {
      await nextFrame();
      var jsPDF = ensurePdfLib();
      var out = await T.pdf.generatePdf(snap, { jsPDF: jsPDF, fonts: readFonts(), cmap: T.pdfCmap, emblem: readEmblem() });
      downloadBlob(out.blob, out.filename);
      setPdfStatus('Informe descargado: ' + out.filename + ' (' + out.pages + ' páginas, escenario ' + snap.scenarioId + ').', 'ok');
    } catch (err) {
      console.error(err);
      setPdfStatus('No se pudo generar el PDF. Tu escenario sigue intacto: vuelve a intentarlo o usa «Imprimir / guardar como PDF».', 'error');
    } finally {
      state.isExporting = false;
      buttons.forEach(function (b) { b.removeAttribute('aria-busy'); b.querySelector('span').textContent = 'Exportar informe PDF'; });
      updateExportState();
    }
  }

  function exportCsv(kind) {
    flushPending();
    if (!exportable()) return;
    var snap = snapshot();
    try {
      var files = csv.buildCsvFiles(snap);
      var f = files[kind];
      downloadBlob(new Blob([f.text], { type: 'text/csv;charset=utf-8' }), f.filename);
      el.csvStatus.className = 'export-status ok';
      setText(el.csvStatus, 'Descargado ' + f.filename + ' (' + f.rows + (f.rows === 1 ? ' fila' : ' filas') + ') · escenario ' + snap.scenarioId + ' · importes en ' + snap.view.currency + '.');
    } catch (err) {
      console.error(err);
      el.csvStatus.className = 'export-status error';
      setText(el.csvStatus, 'No se pudo generar el archivo. Tu escenario sigue intacto; inténtalo de nuevo.');
    }
  }

  function bindExports() {
    qsa('[data-export-pdf]').forEach(function (b) { b.addEventListener('click', exportPdf); });
    qsa('[data-csv]').forEach(function (b) { b.addEventListener('click', function () { exportCsv(b.getAttribute('data-csv')); }); });
    el.printBtn.addEventListener('click', function () { flushPending(); window.print(); });
    el.copyDax.addEventListener('click', function () {
      var text = el.daxCode.textContent;
      var done = function (ok) {
        el.copyStatus.className = 'export-status ' + (ok ? 'ok' : 'error');
        setText(el.copyStatus, ok ? 'Medidas copiadas al portapapeles.' : 'No se pudo copiar automáticamente: selecciona el texto y cópialo.');
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      else {
        var range = document.createRange();
        range.selectNodeContents(el.daxCode);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        done(ok);
      }
    });
  }

  /* ------------------------------ Impresión ----------------------------- */
  var printSaved = null;
  function preparePrint() {
    if (!state.current || printSaved) return;
    printSaved = { formulas: el.formulasDetails.open, assumptions: el.assumptionsDetails.open };
    el.formulasDetails.open = true;
    el.assumptionsDetails.open = true;
    state.table.printing = true;
    renderTable(true);
    clear(el.balancePrint);
    var other = state.balanceView === 'debt' ? 'cash' : 'debt';
    el.balancePrint.appendChild(make('h3', 'card-title', 'Evolución de saldos: ' + (other === 'debt' ? 'deuda pendiente' : 'efectivo acumulado del préstamo')));
    el.balancePrint.appendChild(make('p', 'card-sub', BALANCE_TEXT[other]));
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'chart-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', other === 'debt' ? 'Deuda pendiente por mes' : 'Efectivo acumulado del préstamo por mes');
    charts.renderSvg(svg, buildBalance(other, el.balancePlot.clientWidth || 520));
    el.balancePrint.appendChild(svg);
  }
  function restorePrint() {
    if (!printSaved) return;
    el.formulasDetails.open = printSaved.formulas;
    el.assumptionsDetails.open = printSaved.assumptions;
    printSaved = null;
    state.table.printing = false;
    clear(el.balancePrint);
    if (state.current) renderTable(true);
  }

  /* ------------------------------ Créditos ------------------------------ */
  var FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';
  function setFaceActive(face, active) {
    if ('inert' in face) face.inert = !active;
    if (active) face.removeAttribute('aria-hidden');
    else face.setAttribute('aria-hidden', 'true');
    if (!('inert' in face)) {
      qsa(FOCUSABLE, face).forEach(function (n) {
        if (active) { if (n.hasAttribute('data-tabindex')) { n.setAttribute('tabindex', n.getAttribute('data-tabindex')); n.removeAttribute('data-tabindex'); } else if (n.getAttribute('tabindex') === '-1' && n.dataset.hidden === '1') n.removeAttribute('tabindex'); }
        else { if (n.hasAttribute('tabindex')) n.setAttribute('data-tabindex', n.getAttribute('tabindex')); else n.dataset.hidden = '1'; n.setAttribute('tabindex', '-1'); }
      });
    }
  }

  function flip(toBack) {
    el.credits.setAttribute('data-face', toBack ? 'back' : 'front');
    setFaceActive(el.creditsFront, !toBack);
    setFaceActive(el.creditsBack, toBack);
    if (toBack) el.creditsBackTitle.focus({ preventScroll: true });
    else el.creditsOpen.focus({ preventScroll: true });
  }

  function setupCredits() {
    setText(el.creditsCourse, 'Créditos · ' + CFG.course);
    clear(el.teamList);
    var members = (CFG.teamMembers || []).filter(function (m) { return typeof m === 'string' && m.trim(); });
    if (!members.length) el.teamList.appendChild(make('li', null, 'Nombres del equipo pendientes'));
    members.forEach(function (name) {
      var li = make('li', null, name);
      var role = CFG.memberRoles && CFG.memberRoles[name];
      if (role) li.appendChild(make('span', 'role', role));
      el.teamList.appendChild(li);
    });
    clear(el.creditsContact);
    var email = String(CFG.coordinatorEmail || '').trim();
    if (isValidEmail(email)) {
      var p = make('p');
      p.appendChild(document.createTextNode('Para cualquier consulta, escribir a '));
      var a = make('a', null, email);
      a.href = 'mailto:' + email;
      a.addEventListener('click', function (e) { e.stopPropagation(); });
      p.appendChild(a);
      p.appendChild(document.createTextNode(' del coordinador del equipo.'));
      el.creditsContact.appendChild(p);
    } else {
      el.creditsContact.appendChild(make('p', null, 'Correo del coordinador pendiente.'));
    }
    var coord = make('p', 'coord');
    if (CFG.coordinatorName && String(CFG.coordinatorName).trim()) {
      coord.appendChild(document.createTextNode('Coordinador: '));
      coord.appendChild(make('strong', null, String(CFG.coordinatorName).trim()));
    } else coord.textContent = 'Nombre del coordinador pendiente.';
    el.creditsContact.appendChild(coord);

    setFaceActive(el.creditsBack, false);
    el.creditsOpen.addEventListener('click', function (e) { e.stopPropagation(); flip(true); });
    el.creditsClose.addEventListener('click', function () { flip(false); });
    el.creditsFront.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a, button')) return;
      if (window.getSelection && String(window.getSelection())) return;
      flip(true);
    });
    el.credits.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.credits.getAttribute('data-face') === 'back') { e.preventDefault(); flip(false); }
    });
  }

  /* ------------------------------ Power BI ------------------------------ */
  function setupPowerBI() {
    var pbi = CFG.powerBI || {};
    if (!pbi.enabled) return;
    var url;
    try { url = new URL(pbi.embedUrl); } catch (e) { url = null; }
    if (!url || url.protocol !== 'https:' || url.hostname !== 'app.powerbi.com') {
      setText(el.pbiStatus, 'La configuración del reporte externo no es válida (se requiere una URL https de app.powerbi.com). No se muestra ningún reporte.');
      return;
    }
    clear(el.pbiReport);
    el.pbiReport.appendChild(make('p', 'status-line warn', 'Reporte externo; verifica su escenario y fecha de actualización. ' +
      (pbi.datasetNote || 'Puede reflejar la última importación, no el escenario visible.') + ' Puede requerir iniciar sesión en Power BI.'));
    var frame = document.createElement('iframe');
    frame.src = url.href;
    frame.title = pbi.title || 'Reporte de Power BI';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer';
    frame.allowFullscreen = true;
    el.pbiReport.appendChild(frame);
    var link = make('a', null, 'Abrir el reporte en Power BI');
    link.href = pbi.reportUrl || url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    el.pbiReport.appendChild(link);
  }

  /* ------------------------------ Varios -------------------------------- */
  function bindMisc() {
    qsa('input[name="balanceView"]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.balanceView = r.value;
        if (state.current) renderBalance();
        else {
          setText(el.balanceViewName, r.value === 'debt' ? 'deuda pendiente' : 'efectivo acumulado del préstamo');
          setText(el.balanceExplain, BALANCE_TEXT[r.value]);
        }
      });
    });
    qsa('input[name="flowMode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.flowMode = r.value;
        if (state.current) { renderFlow(); if (state.flowAll) renderFlowAll(); }
      });
    });
    el.flowAllBtn.addEventListener('click', function () {
      state.flowAll = !state.flowAll;
      el.flowAllBtn.setAttribute('aria-expanded', String(state.flowAll));
      setText(el.flowAllBtn, state.flowAll ? 'Ocultar todos los meses' : 'Ver todos los meses');
      el.flowAllPanel.hidden = !state.flowAll;
      if (state.flowAll && state.current) renderFlowAll();
    });
    el.balanceDataDetails.addEventListener('toggle', function () { if (el.balanceDataDetails.open && state.current) renderBalanceData(); });
    el.useAlt.addEventListener('click', function () {
      if (!state.current) return;
      var altN = state.current.alt.input.months;
      state.draft.months = el.months.value = String(altN);
      syncMonthsSlider(altN);
      cancelPending();
      commit({ reason: 'alt', announce: false, animate: true });
      announce(el.liveResults, 'Plazo cambiado a ' + format.monthsLabel(altN) + '. Nueva cuota: ' +
        format.spokenMoney(state.current.view.payment, state.current.view.currency) + '.');
    });
    el.navHowto.addEventListener('click', function (e) {
      e.preventDefault();
      el.howto.open = true;
      el.howto.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      el.howto.querySelector('summary').focus({ preventScroll: true });
    });

    window.addEventListener('beforeprint', preparePrint);
    window.addEventListener('afterprint', restorePrint);
    if (window.matchMedia) {
      var pm = window.matchMedia('print');
      var onChange = function (m) { if (m.matches) preparePrint(); else restorePrint(); };
      if (pm.addEventListener) pm.addEventListener('change', onChange);
      else if (pm.addListener) pm.addListener(onChange);
    }
    window.addEventListener('focus', function () { if (printSaved && !window.matchMedia('print').matches) restorePrint(); });

    var resizeRaf = 0;
    var onResize = function () {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(function () {
        resizeRaf = 0;
        if (!state.current) return;
        renderCharts();
        updateTableHint();
        fitText(el.heroAmount.parentElement, [el.heroAmount.textContent], heroMaxSize(), 20, 600);
        fitKpis();
      });
    };
    if ('ResizeObserver' in window) {
      var lastW = {};
      var ro = new ResizeObserver(function (entries) {
        var changed = entries.some(function (en) {
          var id = en.target.id;
          var w = Math.round(en.contentRect.width);
          var diff = lastW[id] !== w;
          lastW[id] = w;
          return diff;
        });
        if (changed) onResize();
      });
      [el.donutPlot, el.balancePlot, el.flowPlot, el.tableWrap, el.results].forEach(function (n) { ro.observe(n); });
    } else window.addEventListener('resize', onResize);

    if (motion) {
      var mq = function () { if (state.current) renderCharts(); };
      if (motion.addEventListener) motion.addEventListener('change', mq);
    }
  }

  function init() {
    updateRateHelp();
    updateCurrencyUi();
    setFill(el.amountSlider);
    setFill(el.rateSlider);
    setFill(el.monthsSlider);
    syncAmountSlider(inputs.validateAmount(el.amount.value).value, true);
    syncRateSlider(inputs.validateRate(el.rate.value).value);
    syncMonthsSlider(inputs.validateMonths(el.months.value).value);
    setText(el.balanceExplain, BALANCE_TEXT.debt);
    bindControls();
    bindTable();
    bindExports();
    bindMisc();
    bindDonut();
    ['balance', 'flow', 'flowAll'].forEach(bindChart);
    renderAssumptions();
    setupCredits();
    setupPowerBI();
    updateExportState();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { measureCache.clear(); if (state.current) renderCharts(); });
    }
    /* Ganchos de verificación: solo lectura, sin efectos en la interfaz. */
    T.debug = {
      state: function () { return state; },
      current: function () { return state.current; },
    };
  }

  init();
})();
