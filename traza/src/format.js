/* ==========================================================================
   VÉRTICE · Formato de presentación
   Recibe números y produce cadenas (nunca al revés). Convención visible:
   punto de miles, coma decimal, signo menos tipográfico (U+2212).
   ========================================================================== */
(function (root) {
  'use strict';

  var MINUS = '−';
  var NBSP = ' ';

  var CURRENCIES = Object.freeze({
    USD: Object.freeze({ code: 'USD', symbol: '$', name: 'Dólar estadounidense', plural: 'dólares estadounidenses' }),
    EUR: Object.freeze({ code: 'EUR', symbol: '€', name: 'Euro', plural: 'euros' }),
    GBP: Object.freeze({ code: 'GBP', symbol: '£', name: 'Libra esterlina', plural: 'libras esterlinas' }),
    VES: Object.freeze({ code: 'VES', symbol: 'Bs.', name: 'Bolívar', plural: 'bolívares' }),
  });
  var CURRENCY_ORDER = ['USD', 'EUR', 'GBP', 'VES'];

  /* x · 10^d desplazando el exponente decimal en texto (sin error binario). */
  function shiftDecimal(x, d) {
    var parts = String(x).split('e');
    return Number(parts[0] + 'e' + (Number(parts[1] || 0) + d));
  }

  /* Redondeo de presentación, mitad alejándose de cero. */
  function roundHalfAway(x, decimals) {
    if (!isFinite(x)) return x;
    var sign = x < 0 ? -1 : 1;
    var r = Math.round(shiftDecimal(Math.abs(x), decimals));
    var out = sign * shiftDecimal(r, -decimals);
    return out === 0 ? 0 : out;
  }

  function groupThousands(intDigits) {
    return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /**
   * 12000.5 → "12.000,50". Opciones: group (true), plus (false: añade "+"),
   * ascii (false: usa "-" en vez de U+2212).
   */
  function formatNumber(x, decimals, opts) {
    if (decimals === undefined) decimals = 2;
    opts = opts || {};
    if (typeof x !== 'number' || !isFinite(x)) return '—';
    var r = roundHalfAway(x, decimals);
    var abs = Math.abs(r);
    var fixed = abs.toFixed(decimals);
    var dot = fixed.indexOf('.');
    var ip = dot >= 0 ? fixed.slice(0, dot) : fixed;
    var fp = dot >= 0 ? fixed.slice(dot + 1) : '';
    if (opts.group !== false) ip = groupThousands(ip);
    var out = fp ? ip + ',' + fp : ip;
    if (abs !== 0 && r < 0) out = (opts.ascii ? '-' : MINUS) + out;
    else if (opts.plus && abs !== 0) out = '+' + out;
    return out;
  }

  /* Hasta maxDecimals, sin ceros finales, con al menos minDecimals. */
  function formatNumberTrim(x, maxDecimals, minDecimals) {
    var s = formatNumber(x, maxDecimals);
    if (s.indexOf(',') < 0) return s;
    var parts = s.split(',');
    var fp = parts[1].replace(/0+$/, '');
    while (fp.length < (minDecimals || 0)) fp += '0';
    return fp ? parts[0] + ',' + fp : parts[0];
  }

  function currencyOf(code) {
    return CURRENCIES[code] || CURRENCIES.USD;
  }

  /**
   * "$ 564,88", "−$ 564,88", "+$ 12.000,00", "Bs. 564,88".
   * sign: 'auto' | 'always' | 'never'.
   */
  function formatMoney(x, code, opts) {
    opts = opts || {};
    var decimals = opts.decimals === undefined ? 2 : opts.decimals;
    if (typeof x !== 'number' || !isFinite(x)) return '—';
    var cur = currencyOf(code);
    var r = roundHalfAway(x, decimals);
    var body = formatNumber(Math.abs(r), decimals);
    var sign = '';
    if (r < 0 && opts.sign !== 'never') sign = MINUS;
    else if (r > 0 && opts.sign === 'always') sign = '+';
    return sign + cur.symbol + NBSP + body;
  }

  /* Lectura para lectores de pantalla: "564,88 dólares estadounidenses". */
  function spokenMoney(x, code) {
    var cur = currencyOf(code);
    var r = roundHalfAway(x, 2);
    return (r < 0 ? 'menos ' : '') + formatNumber(Math.abs(r), 2) + ' ' + cur.plural;
  }

  function formatPercent(x, decimals) {
    return formatNumber(x, decimals === undefined ? 2 : decimals) + NBSP + '%';
  }

  function formatPercentTrim(x, maxDecimals, minDecimals) {
    return formatNumberTrim(x, maxDecimals, minDecimals) + NBSP + '%';
  }

  /* Porcentajes de composición a una decimal que suman 100,0 (§8.2). */
  function compositionPercents(capital, interest) {
    var total = capital + interest;
    if (!(total > 0)) return { capital: 100, interest: 0 };
    var interestTenths = Math.round(1000 * interest / total);
    return { capital: (1000 - interestTenths) / 10, interest: interestTenths / 10 };
  }

  /* Notación científica legible: −1,82 × 10⁻¹² */
  var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function formatScientific(x, digits) {
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    var parts = x.toExponential(digits === undefined ? 2 : digits).split('e');
    var mant = Number(parts[0]);
    var exp = String(Number(parts[1]));
    var sup = exp.split('').map(function (ch) { return SUP[ch] || ch; }).join('');
    return formatNumber(mant, digits === undefined ? 2 : digits) + ' × 10' + sup;
  }

  /**
   * Número en texto plano para CSV: punto decimal, sin agrupar y sin
   * notación exponencial, con la precisión completa de ida y vuelta de JS.
   */
  function plainNumber(x) {
    if (typeof x !== 'number' || !isFinite(x)) throw new Error('Número no finito en exportación.');
    if (x === 0) return '0';
    var s = String(x);
    if (!/e/i.test(s)) return s;
    var neg = s.charAt(0) === '-';
    var body = neg ? s.slice(1) : s;
    var parts = body.split(/e/i);
    var exp = Number(parts[1]);
    var mant = parts[0].split('.');
    var ip = mant[0];
    var fp = mant[1] || '';
    var digits = ip + fp;
    var point = ip.length + exp;
    var out;
    if (point <= 0) out = '0.' + new Array(-point + 1).join('0') + digits;
    else if (point >= digits.length) out = digits + new Array(point - digits.length + 1).join('0');
    else out = digits.slice(0, point) + '.' + digits.slice(point);
    out = out.replace(/^0+(?=\d)/, '');
    return (neg ? '-' : '') + out;
  }

  function pad2(v) { return (v < 10 ? '0' : '') + v; }

  function formatDateLocal(d) {
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function formatTimeLocal(d) {
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function isoDateLocal(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  /* "2026-09-26" → "26/09/2026" (sin pasar por Date para evitar husos). */
  function formatIsoDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  function monthsLabel(n) {
    return n === 1 ? '1 mes' : formatNumber(n, 0) + ' meses';
  }

  /* Pasos "bonitos" para ejes. */
  function niceStep(range, maxTicks) {
    if (!(range > 0)) return 1;
    var raw = range / Math.max(1, maxTicks);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step;
    if (norm <= 1) step = 1;
    else if (norm <= 2) step = 2;
    else if (norm <= 2.5) step = 2.5;
    else if (norm <= 4) step = 4;
    else if (norm <= 5) step = 5;
    else step = 10;
    return step * mag;
  }

  /* Formateador de ticks monetarios; millones abreviados como "12,5 M". */
  function axisMoneyFormatter(maxAbs, step) {
    var fn;
    if (maxAbs >= 1e7) {
      var decM = step >= 1e6 ? 0 : (step >= 1e5 ? 1 : 2);
      fn = function (v) { return formatNumber(v / 1e6, decM) + NBSP + 'M'; };
      fn.millions = true;
      return fn;
    }
    var dec = step >= 1 ? 0 : (step >= 0.1 ? 1 : 2);
    fn = function (v) { return formatNumber(v, dec); };
    fn.millions = false;
    return fn;
  }

  /* Importe compacto en millones para espacios reducidos: { value: "Bs. 35.678", unit: "millones" }. */
  function compactMoney(x, code) {
    var cur = currencyOf(code);
    var m = Math.abs(x) / 1e6;
    var dec = m >= 1000 ? 0 : (m >= 10 ? 1 : 2);
    return { value: (x < 0 ? MINUS : '') + cur.symbol + NBSP + formatNumber(m, dec), unit: 'millones' };
  }

  var api = {
    MINUS: MINUS,
    NBSP: NBSP,
    CURRENCIES: CURRENCIES,
    CURRENCY_ORDER: CURRENCY_ORDER,
    currencyOf: currencyOf,
    roundHalfAway: roundHalfAway,
    formatNumber: formatNumber,
    formatNumberTrim: formatNumberTrim,
    formatMoney: formatMoney,
    spokenMoney: spokenMoney,
    formatPercent: formatPercent,
    formatPercentTrim: formatPercentTrim,
    compositionPercents: compositionPercents,
    formatScientific: formatScientific,
    plainNumber: plainNumber,
    formatDateLocal: formatDateLocal,
    formatTimeLocal: formatTimeLocal,
    isoDateLocal: isoDateLocal,
    formatIsoDate: formatIsoDate,
    monthsLabel: monthsLabel,
    niceStep: niceStep,
    axisMoneyFormatter: axisMoneyFormatter,
    compactMoney: compactMoney,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.TRAZA = root.TRAZA || {};
    root.TRAZA.format = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
