/* ==========================================================================
   TRAZA · Entrada numérica localizada y validación (§5)
   Convención: punto de miles y coma decimal (12.000,50). Nunca parseFloat
   sobre texto localizado; nunca vacío → 0; nunca redondeo silencioso.
   ========================================================================== */
(function (root) {
  'use strict';

  var format = (typeof module === 'object' && module.exports) ? require('./format.js') : root.TRAZA.format;
  var engine = (typeof module === 'object' && module.exports) ? require('./engine.js') : root.TRAZA.engine;
  var LIMITS = engine.LIMITS;

  var GROUPED = /^[1-9]\d{0,2}(\.\d{3})+$/;

  /**
   * Devuelve { ok:true, value, decimals } o { ok:false, code }.
   * Códigos: empty, chars, multiple, mixed, grouping, incomplete, not-integer, precision.
   * opts: maxDecimals (2), integerOnly (false), allowPercent (false).
   */
  function parseLocalizedNumber(raw, opts) {
    opts = opts || {};
    var maxDecimals = opts.maxDecimals === undefined ? 2 : opts.maxDecimals;
    var s = raw == null ? '' : String(raw).trim();
    if (s === '') return { ok: false, code: 'empty' };
    if (opts.allowPercent && s.charAt(s.length - 1) === '%') s = s.slice(0, -1).trim();
    var negative = false;
    var first = s.charAt(0);
    if (first === '-' || first === '−') { negative = true; s = s.slice(1); }
    else if (first === '+') { s = s.slice(1); }
    if (s === '') return { ok: false, code: 'incomplete' };
    if (!/^[0-9.,]+$/.test(s)) return { ok: false, code: 'chars' };
    if (!/[0-9]/.test(s)) return { ok: false, code: 'incomplete' };

    var commas = s.split(',').length - 1;
    var dots = s.split('.').length - 1;
    var intPart;
    var fracPart = '';
    var hasDecimalSeparator = false;

    if (commas > 1) return { ok: false, code: 'multiple' };
    if (commas === 1) {
      if (dots > 0 && s.lastIndexOf('.') > s.indexOf(',')) return { ok: false, code: 'mixed' };
      var halves = s.split(',');
      intPart = halves[0];
      fracPart = halves[1];
      hasDecimalSeparator = true;
      if (dots > 0) {
        if (!GROUPED.test(intPart)) return { ok: false, code: 'grouping' };
        intPart = intPart.replace(/\./g, '');
      }
      if (intPart === '') intPart = '0';
    } else if (dots === 0) {
      intPart = s;
    } else if (dots === 1) {
      var pieces = s.split('.');
      if (/^[1-9]\d{0,2}$/.test(pieces[0]) && /^\d{3}$/.test(pieces[1])) {
        intPart = pieces[0] + pieces[1]; /* punto de miles válido: 12.000 */
      } else {
        intPart = pieces[0] === '' ? '0' : pieces[0]; /* punto decimal inequívoco: 12000.50 */
        fracPart = pieces[1];
        hasDecimalSeparator = true;
      }
    } else {
      if (!GROUPED.test(s)) return { ok: false, code: 'grouping' };
      intPart = s.replace(/\./g, '');
    }

    if (!/^\d+$/.test(intPart) || !/^\d*$/.test(fracPart)) return { ok: false, code: 'grouping' };
    if (opts.integerOnly && hasDecimalSeparator) return { ok: false, code: 'not-integer' };
    if (fracPart.length > maxDecimals) return { ok: false, code: 'precision', decimals: fracPart.length };

    var canonical = intPart.replace(/^0+(?=\d)/, '') + (fracPart ? '.' + fracPart : '');
    var value = Number(canonical);
    if (!isFinite(value)) return { ok: false, code: 'chars' };
    if (negative) value = -value;
    if (value === 0) value = 0; /* sin −0 */
    return { ok: true, value: value, decimals: fracPart.length };
  }

  var MESSAGES = {
    amountRange: 'Ingresa un monto entre 100 y 1.000.000.000.',
    amountChars: 'Usa solo cifras, punto de miles y coma decimal (ej. 12.000,50).',
    amountSeparators: 'Revisa los separadores: punto para miles y coma para decimales (ej. 12.000,50).',
    amountPrecision: 'Usa hasta 2 decimales.',
    rateRange: 'La tasa debe estar entre 0 % y 100 %.',
    rateChars: 'Usa solo cifras y coma decimal (ej. 12,5).',
    rateSeparators: 'Revisa los separadores: la coma marca los decimales (ej. 12,3456).',
    ratePrecision: 'Usa hasta 4 decimales.',
    months: 'El plazo debe ser un número entero entre 1 y 600 meses.',
    fxRange: 'Ingresa un tipo de cambio positivo entre 0,00000001 y 100.000.000.',
    fxChars: 'Usa solo cifras, punto de miles y coma decimal (ej. 36,5).',
    fxPrecision: 'Usa hasta 8 decimales.',
    fxDate: 'Indica la fecha de referencia del tipo de cambio.',
  };

  function validateAmount(text) {
    var p = parseLocalizedNumber(text, { maxDecimals: 2 });
    if (!p.ok) {
      if (p.code === 'precision') return { ok: false, code: p.code, message: MESSAGES.amountPrecision };
      if (p.code === 'chars') return { ok: false, code: p.code, message: MESSAGES.amountChars };
      if (p.code === 'grouping' || p.code === 'mixed' || p.code === 'multiple') return { ok: false, code: p.code, message: MESSAGES.amountSeparators };
      return { ok: false, code: p.code, message: MESSAGES.amountRange };
    }
    if (p.value < LIMITS.principalMin || p.value > LIMITS.principalMax) return { ok: false, code: 'range', message: MESSAGES.amountRange };
    return { ok: true, value: p.value };
  }

  function validateRate(text) {
    var p = parseLocalizedNumber(text, { maxDecimals: 4, allowPercent: true });
    if (!p.ok) {
      if (p.code === 'precision') return { ok: false, code: p.code, message: MESSAGES.ratePrecision };
      if (p.code === 'chars') return { ok: false, code: p.code, message: MESSAGES.rateChars };
      if (p.code === 'grouping' || p.code === 'mixed' || p.code === 'multiple') return { ok: false, code: p.code, message: MESSAGES.rateSeparators };
      return { ok: false, code: p.code, message: MESSAGES.rateRange };
    }
    if (p.value < LIMITS.rateMin || p.value > LIMITS.rateMax) {
      var hint = String(text).indexOf('.') >= 0 && p.value > LIMITS.rateMax ? ' El punto se lee como separador de miles; para decimales usa coma (ej. 12,345).' : '';
      return { ok: false, code: 'range', message: MESSAGES.rateRange + hint };
    }
    return { ok: true, value: p.value, decimals: p.decimals };
  }

  function validateMonths(text) {
    var p = parseLocalizedNumber(text, { maxDecimals: 0, integerOnly: true });
    if (!p.ok || p.value < LIMITS.monthsMin || p.value > LIMITS.monthsMax || Math.floor(p.value) !== p.value) {
      return { ok: false, code: p.ok ? 'range' : p.code, message: MESSAGES.months };
    }
    return { ok: true, value: p.value };
  }

  function validateFxRate(text) {
    var p = parseLocalizedNumber(text, { maxDecimals: 8 });
    if (!p.ok) {
      if (p.code === 'precision') return { ok: false, code: p.code, message: MESSAGES.fxPrecision };
      if (p.code === 'chars' || p.code === 'grouping' || p.code === 'mixed' || p.code === 'multiple') return { ok: false, code: p.code, message: MESSAGES.fxChars };
      return { ok: false, code: p.code, message: MESSAGES.fxRange };
    }
    if (!(p.value >= 1e-8 && p.value <= 1e8)) return { ok: false, code: 'range', message: MESSAGES.fxRange };
    return { ok: true, value: p.value };
  }

  function validateFxDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
    if (!m) return { ok: false, code: 'empty', message: MESSAGES.fxDate };
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    var probe = new Date(Date.UTC(y, mo - 1, d));
    if (y < 1900 || probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
      return { ok: false, code: 'invalid', message: MESSAGES.fxDate };
    }
    return { ok: true, value: m[0] };
  }

  /* Texto normalizado al perder el foco. */
  function normalizedAmount(v) { return format.formatNumber(v, 2); }
  function normalizedRate(v) { return format.formatNumberTrim(v, 4, 2); }
  function normalizedMonths(v) { return String(v); }
  function normalizedFx(v) { return format.formatNumberTrim(v, 8, 2); }

  /* Slider del monto: 1000 posiciones sobre una escala que se amplía (§5.1). */
  var AMOUNT_SCALES = [1e5, 1e6, 1e7, 1e8, 1e9];
  function amountScaleFor(value) {
    for (var k = 0; k < AMOUNT_SCALES.length; k++) if (value <= AMOUNT_SCALES[k]) return AMOUNT_SCALES[k];
    return AMOUNT_SCALES[AMOUNT_SCALES.length - 1];
  }
  function amountSliderMin(scale) { return scale === AMOUNT_SCALES[0] ? 1 : 0; }
  function amountFromPosition(pos, scale) {
    var step = scale / 1000;
    return pos <= 0 ? LIMITS.principalMin : Math.max(LIMITS.principalMin, pos * step);
  }
  function positionFromAmount(value, scale) {
    var step = scale / 1000;
    var pos = Math.round(value / step);
    return Math.min(1000, Math.max(amountSliderMin(scale), pos));
  }

  var api = {
    parseLocalizedNumber: parseLocalizedNumber,
    MESSAGES: MESSAGES,
    validateAmount: validateAmount,
    validateRate: validateRate,
    validateMonths: validateMonths,
    validateFxRate: validateFxRate,
    validateFxDate: validateFxDate,
    normalizedAmount: normalizedAmount,
    normalizedRate: normalizedRate,
    normalizedMonths: normalizedMonths,
    normalizedFx: normalizedFx,
    AMOUNT_SCALES: AMOUNT_SCALES,
    amountScaleFor: amountScaleFor,
    amountSliderMin: amountSliderMin,
    amountFromPosition: amountFromPosition,
    positionFromAmount: positionFromAmount,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.TRAZA = root.TRAZA || {};
    root.TRAZA.inputs = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
