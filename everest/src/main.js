/* Motor del ascenso: el scroll mueve una cámara sobre las láminas, cambia de lámina con la transición
   pintada, sube el altímetro, coloca los rótulos sobre las cumbres reales y dibuja la ruta. */
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('datos').textContent);
  var E = window.Escena;
  var reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tactil = window.matchMedia('(hover: none)').matches;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function suave(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function ease(t) { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function fmt(n, dec) {
    var s = n.toFixed(dec || 0).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return s.join(',');
  }
  function o2(h) { var k = h / 1000; return Math.exp(6.63268 - 0.1112 * k - 0.00149 * k * k) / 760 * 100; } // modelo de West

  var HITO = {
    campo_base: ['Campo Base', 5364, 'var(--b-azul)', 'CB'],
    cascada: ['Cascada del Khumbu', 5750, '', ''],
    campo1: ['Campo 1', 6065, 'var(--b-blanco)', 'C1'],
    campo2: ['Campo 2', 6400, 'var(--b-rojo)', 'C2'],
    campo3: ['Campo 3', 7160, 'var(--b-verde)', 'C3'],
    collado_sur: ['Collado Sur', 7906, 'var(--b-amarillo)', 'C4'],
    balcon: ['El Balcón', 8400, 'var(--khata)', ''],
    cima_sur: ['Cima Sur', 8749, 'var(--khata)', ''],
    escalon_hillary: ['Escalón Hillary', 8790, 'var(--khata)', ''],
    cumbre: ['Cumbre', 8848.86, 'var(--lampara)', 'Cima']
  };
  var HITOS_MAPA = ['campo_base', 'campo1', 'campo2', 'campo3', 'collado_sur', 'balcon', 'cima_sur', 'cumbre'];
  var HITOS_PERFIL = ['campo_base', 'campo1', 'campo2', 'campo3', 'collado_sur', 'cumbre'];
  var VIENTO = {
    norte: { n: .55, a: 192, v: 1.0, c: [242, 237, 226] }, campo_base: { n: .16, a: 196, v: .45, c: [242, 237, 226] },
    ruta: { n: .22, a: 186, v: .8, c: [242, 237, 226] }, campo1: { n: .1, a: 176, v: .35, c: [255, 250, 240] },
    campo2: { n: .28, a: 190, v: .7, c: [242, 237, 226] }, campo3: { n: .6, a: 200, v: 1.15, c: [242, 240, 236] },
    campo4: { n: 1, a: 188, v: 1.55, c: [205, 214, 242] }, cumbre: { n: .38, a: 178, v: .85, c: [255, 228, 196] }
  };
  var NIEBLA = {
    'campo_base>ruta': [.75, [.86, .86, .93]], 'ruta>campo1': [.5, [.9, .9, .95]], 'campo3>campo4': [.85, [.55, .58, .74]],
    'campo4>cumbre': [1, [.88, .74, .8]], 'campo2>campo3': [.35, [.88, .88, .94]]
  };

  var ruta = D.ruta.puntos, perfil = D.ruta.perfil, hitos = D.ruta.hitos, NR = ruta.length;

  // ------------------------------------------------------------------ preparación del DOM
  // palabras que suben desde su máscara
  $$('.palabras').forEach(function (h) {
    var i = 0;
    h.innerHTML = h.textContent.trim().split(/\s+/).map(function (w) { return '<span class="w"><span style="--i:' + (i++) + '">' + w + '</span></span>'; }).join(' ');
  });
  // letras del título
  var titulo = $('#titulo');
  titulo.innerHTML = titulo.textContent.split('').map(function (l) { return '<span class="l" aria-hidden="true">' + l + '</span>'; }).join('');
  var letras = $$('.l', titulo);
  if (!reducido) { letras.forEach(function (l) { l.style.opacity = '0'; }); }

  // ------------------------------------------------------------------ pasos y grupos de lámina
  var pasos = $$('.paso').map(function (el) {
    var cap = el.closest('.cap');
    var c = (el.dataset.cam || '0.5,0.5,1').split(',');
    var p = (el.dataset.pos || '0.5,0.5').split(',').map(Number);
    var k = { el: el, cap: cap, escena: cap.dataset.escena, alt: +(el.dataset.alt || cap.dataset.alt), lugar: cap.dataset.lugar || '',
      px: p[0], py: p[1], rot: el.dataset.rot ? el.dataset.rot.split(',') : [], lado: el.dataset.lado || 'izq',
      lamp: el.hasAttribute('data-lamp') ? 1 : 0, ama: +(el.dataset.amanecer || 0), ruta: null };
    if (c[0].indexOf('hito:') === 0) { k.hito = c[0].slice(5); k.z = +c[1]; } else { k.u = +c[0]; k.v = +c[1]; k.z = +c[2]; }
    if (el.dataset.mcam) { var mc = el.dataset.mcam.split(',').map(Number); k.mu = mc[0]; k.mv = mc[1]; k.mz = mc[2]; }
    if (el.dataset.ruta !== undefined) { k.ruta = el.dataset.ruta === '0' ? 0 : hitos[el.dataset.ruta] / (NR - 1); }
    return k;
  });
  // encuadres sobre la ruta: el centro del tramo recién recorrido
  var prevR = 0;
  pasos.forEach(function (k) {
    if (k.hito) {
      var i0 = Math.round(prevR * (NR - 1)), i1 = hitos[k.hito];
      var a = ruta[i0], b = ruta[i1];
      k.u = (a[0] + b[0]) / 2; k.v = (a[1] + b[1]) / 2;
    }
    if (k.ruta !== null) { prevR = k.ruta; }
    if (k.mu === undefined) { k.mu = k.u; k.mv = k.v; k.mz = k.z; }
  });
  var grupos = [];
  pasos.forEach(function (k) {
    var g = grupos[grupos.length - 1];
    if (!g || g.escena !== k.escena) { g = { escena: k.escena, kfs: [] }; grupos.push(g); }
    g.kfs.push(k); k.g = g;
  });
  // la ruta conserva su progreso entre pasos sin data-ruta
  grupos.forEach(function (g) { var r = 0; g.kfs.forEach(function (k) { if (k.ruta === null) { k.ruta = r; } r = k.ruta; }); });

  var capitulos = $$('.cap');
  var enlaces = $$('.menu a');

  function medir() {
    var y = window.scrollY;
    pasos.forEach(function (k) { var r = k.el.getBoundingClientRect(); k.top = r.top + y; k.centro = r.top + y + r.height / 2; });
    grupos.forEach(function (g) { g.top = g.kfs[0].top; });
    capitulos.forEach(function (c) { var r = c.getBoundingClientRect(); c._top = r.top + y; c._bot = r.bottom + y; });
  }

  function camEn(g, c) {
    var k = g.kfs, n = k.length, a = k[0], b = k[0], t = 0;
    if (c >= k[n - 1].centro) { a = b = k[n - 1]; }
    else if (c > k[0].centro) {
      for (var i = 0; i < n - 1; i++) { if (c >= k[i].centro && c < k[i + 1].centro) { a = k[i]; b = k[i + 1]; t = (c - a.centro) / (b.centro - a.centro); break; } }
    }
    var e = ease(t), m = !ancho;
    return {
      u: lerp(m ? a.mu : a.u, m ? b.mu : b.u, e), v: lerp(m ? a.mv : a.v, m ? b.mv : b.v, e), z: Math.exp(lerp(Math.log(m ? a.mz : a.z), Math.log(m ? b.mz : b.z), e)),
      px: lerp(a.px, b.px, e), py: lerp(a.py, b.py, e), alt: lerp(a.alt, b.alt, e), ruta: lerp(a.ruta || 0, b.ruta || 0, e),
      lamp: lerp(a.lamp, b.lamp, e), ama: lerp(a.ama, b.ama, e), activo: t < .5 ? a : b, t: t
    };
  }

  var VW = window.innerWidth, VH = window.innerHeight, ancho = VW >= 1000;
  function rectDe(cam, zoomExtra) {
    var ai = 16 / 9, av = VW / VH, m = .013;
    var bw = Math.min(1, av / ai), bh = Math.min(1, ai / av);
    var z = cam.z;
    if (!ancho) { z = 1 + (z - 1) * .55; }
    z *= zoomExtra || 1;
    z = Math.max(z, bw / (1 - 2 * m), bh / (1 - 2 * m));
    var fw = bw / z, fh = bh / z;
    var px = ancho ? cam.px : .5, py = ancho ? cam.py : .34;
    var u0 = clamp(cam.u - px * fw, m, 1 - m - fw), v0 = clamp(cam.v - py * fh, m, 1 - m - fh);
    return [u0, v0, fw, fh];
  }

  // ------------------------------------------------------------------ rótulos
  var capaRot = $('#rotulos');
  var rotulos = {};
  function crearRotulo(id, escena, uv, t, d, pr, hito, color) {
    var el = document.createElement('div');
    el.className = 'rotulo' + (hito ? ' hito' : '');
    if (color) { el.style.setProperty('--c', color); }
    el.innerHTML = '<span class="hilo"></span><span class="punto"></span><span class="caja"><b></b><i></i></span>';
    el.querySelector('b').textContent = t; el.querySelector('i').textContent = d;
    capaRot.appendChild(el);
    rotulos[id] = { id: id, el: el, escena: escena, u: uv[0], v: uv[1], pr: pr || 1, on: false, w: 0, caja: el.querySelector('.caja') };
  }
  Object.keys(D.etiquetas).forEach(function (esc) {
    D.etiquetas[esc].forEach(function (r) { crearRotulo(r.id, esc, r.uv, r.t, r.d, r.pr); });
  });
  HITOS_MAPA.forEach(function (h) {
    var p = ruta[hitos[h]];
    crearRotulo('h_' + h, 'ruta', [p[0], p[1]], HITO[h][0], fmt(HITO[h][1], HITO[h][1] % 1 ? 2 : 0) + ' m', h === 'balcon' || h === 'cima_sur' ? 2 : 1, true, HITO[h][2]);
  });

  // ------------------------------------------------------------------ trazado de la ruta
  var svgRuta = $('#trazado'), pLinea = $('#ruta-linea'), pSombra = $('#ruta-sombra'), pFant = $('#ruta-fantasma');
  var dRuta = 'M' + ruta.map(function (q) { return q[0].toFixed(5) + ' ' + (q[1] * .5625).toFixed(5); }).join('L');
  [pLinea, pSombra, pFant].forEach(function (p) { p.setAttribute('d', dRuta); });
  [pLinea, pSombra].forEach(function (p) { p.removeAttribute('vector-effect'); p.style.strokeDasharray = '1 1'; });
  pFant.removeAttribute('vector-effect');
  svgRuta.style.width = '1000px'; svgRuta.style.height = '562.5px';
  var escalador = $('#escalador');
  // longitud acumulada del trazado: el trazo dorado avanza por longitud, el escalador por punto
  var largo = [0];
  for (var li = 1; li < NR; li++) { largo.push(largo[li - 1] + Math.hypot(ruta[li][0] - ruta[li - 1][0], (ruta[li][1] - ruta[li - 1][1]) * .5625)); }
  largo = largo.map(function (l) { return l / largo[NR - 1]; });
  function fraccionLargo(p) { var f = clamp(p, 0, 1) * (NR - 1), i = Math.min(NR - 2, Math.floor(f)); return lerp(largo[i], largo[i + 1], f - i); }
  function cotaEn(f, z) {
    var r = z;
    Object.keys(hitos).forEach(function (k) { if (Math.abs(f - hitos[k]) < .6) { r = HITO[k][1]; } });
    return r;
  }
  function puntoRuta(p) {
    var f = clamp(p, 0, 1) * (NR - 1), i = Math.floor(f), t = f - i, a = ruta[i], b = ruta[Math.min(NR - 1, i + 1)];
    var pa = perfil[i], pb = perfil[Math.min(NR - 1, i + 1)];
    return { u: lerp(a[0], b[0], t), v: lerp(a[1], b[1], t), km: lerp(pa[0], pb[0], t), z: lerp(pa[1], pb[1], t), i: f };
  }

  // ------------------------------------------------------------------ perfil de la ruta
  var perfilEl = $('#perfil'), psvg = $('#perfil-svg'), total = perfil[NR - 1][0];
  var X0 = 36, X1 = 390, Y0 = 128, Y1 = 14, ZMIN = 5000, ZMAX = 9000;
  function sx(km) { return X0 + (X1 - X0) * km / total; }
  function sy(z) { return Y0 - (Y0 - Y1) * (z - ZMIN) / (ZMAX - ZMIN); }
  (function () {
    var h = '<defs><clipPath id="clip-perfil"><rect id="clip-r" x="0" y="0" width="0" height="150"/></clipPath></defs>';
    [6000, 7000, 8000, 9000].forEach(function (z) {
      var ref = z === 8000;
      h += '<line class="' + (ref ? 'ref' : 'eje') + '" x1="' + X0 + '" x2="' + X1 + '" y1="' + sy(z) + '" y2="' + sy(z) + '"' + (ref ? '' : ' stroke-opacity=".5"') + '/>';
      h += '<text class="eje-t" x="' + (X0 - 5) + '" y="' + (sy(z) + 3.5) + '" text-anchor="end">' + fmt(z) + '</text>';
    });
    h += '<text class="ref-t" x="' + (X0 + 4) + '" y="' + (sy(8000) - 4) + '">8 000 m · zona de la muerte</text>';
    h += '<line class="eje" x1="' + X0 + '" x2="' + X1 + '" y1="' + Y0 + '" y2="' + Y0 + '"/>';
    [0, 5, 10].forEach(function (km) { h += '<text class="eje-t" x="' + sx(km) + '" y="' + (Y0 + 13) + '" text-anchor="middle">' + km + (km ? ' km' : '') + '</text>'; });
    var pts = perfil.map(function (q) { return sx(q[0]).toFixed(1) + ',' + sy(q[1]).toFixed(1); });
    var dl = 'M' + pts.join('L');
    h += '<path class="linea-base" d="' + dl + '"/>';
    h += '<g clip-path="url(#clip-perfil)"><path class="area" d="' + dl + 'L' + X1 + ',' + Y0 + 'L' + X0 + ',' + Y0 + 'Z"/><path class="linea" d="' + dl + '"/></g>';
    HITOS_PERFIL.forEach(function (k) {
      var q = perfil[hitos[k]];
      h += '<g class="hito"><circle cx="' + sx(q[0]) + '" cy="' + sy(q[1]) + '" r="4" style="fill:' + HITO[k][2] + '"/><text x="' + sx(q[0]) + '" y="' + (sy(q[1]) - 8) + '" text-anchor="middle">' + HITO[k][3] + '</text></g>';
    });
    h += '<g class="cursor-p" id="cursor-p" style="display:none"><line y1="' + Y1 + '" y2="' + Y0 + '"/><circle r="3.5"/></g>';
    h += '<circle class="punta" id="punta" r="4.5" cx="' + X0 + '" cy="' + Y0 + '"/>';
    h += '<rect id="perfil-toque" x="' + X0 + '" y="0" width="' + (X1 - X0) + '" height="150" fill="transparent"/>';
    psvg.innerHTML = h;
  })();
  var clipR = $('#clip-r'), punta = $('#punta'), cursorP = $('#cursor-p'), infoP = $('#perfil-info');
  var pLugar = $('#perfil-lugar'), pAlt = $('#perfil-alt'), pKm = $('#perfil-km'), pO2 = $('#perfil-o2');
  function hitoAntes(i) {
    var n = 'campo_base';
    Object.keys(hitos).forEach(function (k) { if (hitos[k] <= i + .5 && hitos[k] >= hitos[n] && HITO[k][3] !== undefined) { n = k; } });
    return HITO[n][0];
  }
  function mostrarCursor(ev) {
    var r = psvg.getBoundingClientRect();
    var x = (ev.clientX - r.left) / r.width * 400;
    var km = clamp((x - X0) / (X1 - X0) * total, 0, total);
    var i = 0; while (i < NR - 1 && perfil[i][0] < km) { i++; }
    var q = perfil[i];
    cursorP.style.display = '';
    cursorP.querySelector('line').setAttribute('x1', sx(q[0])); cursorP.querySelector('line').setAttribute('x2', sx(q[0]));
    cursorP.querySelector('circle').setAttribute('cx', sx(q[0])); cursorP.querySelector('circle').setAttribute('cy', sy(q[1]));
    infoP.textContent = hitoAntes(i) + ' · km ' + fmt(q[0], 1) + ' · ' + fmt(q[1]) + ' m';
    infoP.style.left = (sx(q[0]) / 400 * r.width) + 'px'; infoP.style.top = (sy(q[1]) / 150 * r.height) + 'px';
    infoP.classList.add('on');
  }
  $('#perfil-toque').addEventListener('pointermove', mostrarCursor);
  $('#perfil-toque').addEventListener('pointerdown', mostrarCursor);
  $('#perfil-toque').addEventListener('pointerleave', function () { cursorP.style.display = 'none'; infoP.classList.remove('on'); });

  // ------------------------------------------------------------------ altímetro
  var altNum = $('#alt-num'), altO2 = $('#alt-o2'), altLugar = $('#alt-lugar'), escalaAlt = $('#alt-escala');
  (function () {
    var h = '';
    [5000, 6000, 7000, 8000, 9000].forEach(function (z) { h += '<div class="tick" style="bottom:' + ((z - 5000) / 40) + '%"><span>' + fmt(z) + '</span></div>'; });
    [['CB', 5364, 'var(--b-azul)'], ['C1', 6065, 'var(--b-blanco)'], ['C2', 6400, 'var(--b-rojo)'], ['C3', 7160, 'var(--b-verde)'], ['C4', 7906, 'var(--b-amarillo)']].forEach(function (c) {
      h += '<div class="campo" style="--c:' + c[2] + ';bottom:calc(' + ((c[1] - 5000) / 40) + '% - 3px)"><span>' + c[0] + '</span></div>';
    });
    escalaAlt.insertAdjacentHTML('beforeend', h);
  })();
  var ultimaAlt = -1;
  function altimetro(alt, lugar) {
    var a = Math.round(alt * 100) / 100;
    if (Math.abs(a - ultimaAlt) < .5 && a < 8848) { return; }
    ultimaAlt = a;
    var txt = a >= 8848.5 ? '8 848,86' : fmt(Math.round(a));
    altNum.innerHTML = txt + '<small>m</small>';
    altO2.textContent = Math.round(o2(a));
    if (lugar && altLugar.textContent !== lugar) { altLugar.textContent = lugar; }
    escalaAlt.style.setProperty('--h', ((a - 5000) / 40) + '%');
  }

  // ------------------------------------------------------------------ viento (nieve que arrastra la corriente)
  var Viento = (function () {
    var cv = $('#viento'), cx = cv.getContext('2d'), P = [], W = 0, H = 0;
    function tam() { W = VW; H = VH; var d = Math.min(1.5, window.devicePixelRatio || 1); cv.width = W * d; cv.height = H * d; cx.setTransform(d, 0, 0, d, 0, 0); }
    function nace(p, borde, vx, vy) {
      p.k = .35 + Math.random() * .65; p.w = .6 + p.k * 1.5; p.a = .12 + p.k * .38; p.l = .5 + Math.random(); p.s = Math.random(); p.vida = 0;
      if (borde) {
        if (Math.abs(vx) > Math.abs(vy)) { p.x = vx < 0 ? W + 30 : -30; p.y = Math.random() * H; } else { p.y = vy < 0 ? H + 30 : -30; p.x = Math.random() * W; }
      } else { p.x = Math.random() * W; p.y = Math.random() * H; }
      return p;
    }
    return {
      tam: tam,
      paso: function (dt, c, t) {
        cx.clearRect(0, 0, W, H);
        if (reducido) { return; }
        var obj = Math.round(Math.min(340, 250 * c.n * (W * H) / (1440 * 900)));
        var ang = c.a * Math.PI / 180, vx = Math.cos(ang), vy = Math.sin(ang);
        while (P.length < obj) { P.push(nace({}, P.length > 0 && Math.random() < .5, vx, vy)); }
        if (P.length > obj) { P.length = obj; }
        cx.lineCap = 'round';
        cx.strokeStyle = 'rgb(' + c.c[0] + ',' + c.c[1] + ',' + c.c[2] + ')';
        for (var i = 0; i < P.length; i++) {
          var p = P[i];
          var g = 1 + Math.sin(t * .7 + p.s * 10) * .3 + Math.sin(t * 2.3 + p.s * 30) * .15;
          var sp = c.v * p.k * g * 240;
          var dx = vx * sp + Math.sin(t * 1.7 + p.y * .01) * 14, dy = vy * sp + p.k * 22 + Math.cos(t * 1.3 + p.x * .01) * 10;
          p.x += dx * dt; p.y += dy * dt; p.vida += dt;
          if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) { nace(p, true, vx, vy); continue; }
          cx.globalAlpha = p.a * Math.min(1, p.vida * 1.5);
          cx.lineWidth = p.w;
          cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - dx * .03 * p.l, p.y - dy * .03 * p.l); cx.stroke();
        }
        cx.globalAlpha = 1;
      }
    };
  })();

  // ------------------------------------------------------------------ lienzo y respaldo
  var canvas = $('#gl'), escenario = $('#escenario');
  var glOk = !!(E && E.init(canvas));
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  function tamLienzo() {
    VW = window.innerWidth; VH = window.innerHeight; ancho = VW >= 1000;
    canvas.width = Math.round(VW * dpr); canvas.height = Math.round(VH * dpr);
    Viento.tam();
    $$('.rotulo').forEach(function (r) { r._w = 0; });
    Object.keys(rotulos).forEach(function (k) { rotulos[k].w = 0; });
  }
  var respA = $('#resp-a'), respB = $('#resp-b');
  function respaldo(img, vista, r, op) {
    var src = 'img/laminas/' + vista + '-1280.webp';
    if (img.getAttribute('src') !== src) { img.setAttribute('src', src); }
    var s = (VW / r[2]) / 1280;
    img.style.width = '1280px'; img.style.height = '720px';
    img.style.transform = 'translate3d(' + (-r[0] * VW / r[2]).toFixed(1) + 'px,' + (-r[1] * VH / r[3]).toFixed(1) + 'px,0) scale(' + s.toFixed(4) + ')';
    img.style.opacity = op;
  }

  // ------------------------------------------------------------------ estado continuo
  var raton = { x: .5, y: .45, hay: false }, par = [0, 0], lampXY = [.5, .45], scrollS = window.scrollY, ultimo = performance.now(), t0 = performance.now();
  window.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { raton.x = e.clientX / VW; raton.y = e.clientY / VH; raton.hay = true; } }, { passive: true });
  var cargadas = {};
  function pedir(v) { if (v && !cargadas[v]) { cargadas[v] = 1; E && E.cargar(v).catch(function () { cargadas[v] = 0; }); } }

  var lenis = null;
  if (!reducido && window.Lenis && !tactil) {
    try { lenis = new window.Lenis({ lerp: .085, smoothWheel: true, wheelMultiplier: .95 }); } catch (e) { lenis = null; }
  }

  var sombraLado = $('#sombra-lado'), perfilOn = false, gActual = -1, capActual = null, frames = 0, lento = 0, yCab = 0;
  var cab = $('#cabecera');
  var cuerdaFija = $('#cuerda-fija');

  function cuadro(ahora) {
    requestAnimationFrame(cuadro);
    if (lenis) { lenis.raf(ahora); }
    var dtReal = Math.min(.25, (ahora - ultimo) / 1000), dt = Math.min(.05, dtReal); ultimo = ahora;
    var t = (ahora - t0) / 1000;
    var y = window.scrollY;
    scrollS = lenis ? y : lerp(scrollS, y, 1 - Math.exp(-dtReal * 14));
    if (Math.abs(scrollS - y) < .5) { scrollS = y; }
    var c = scrollS + VH * .5;

    // grupo de lámina actual y transición al siguiente
    var gi = 0;
    for (var i = 0; i < grupos.length; i++) { if (grupos[i].top - scrollS <= VH * .12) { gi = i; } }
    var gA = grupos[gi], gB = grupos[gi + 1], mix = 0;
    if (gB) { mix = suave((.92 - (gB.top - scrollS) / VH) / .8); }
    if (gi !== gActual) { gActual = gi; pedir(gA.escena); if (gB) { pedir(gB.escena); } if (grupos[gi + 2]) { pedir(grupos[gi + 2].escena); } }
    var A = camEn(gA, c), B = gB ? camEn(gB, c) : A;
    var rA = rectDe(A, 1 + .07 * mix), rB = gB ? rectDe(B, 1 + .07 * (1 - mix)) : rA;
    var dom = mix < .5 ? A : B, gDom = mix < .5 ? gA : gB;
    var nombreB = gB ? gB.escena : gA.escena;
    if (glOk && E.ok && !E.listo(nombreB)) { mix = 0; }

    // parallax: ratón en escritorio, deriva lenta en pantallas táctiles
    var tx = raton.hay ? (raton.x - .5) * .014 : Math.sin(t * .17) * .004, ty = raton.hay ? (raton.y - .5) * .01 : Math.cos(t * .13) * .003;
    if (reducido) { tx = ty = 0; }
    par[0] = lerp(par[0], tx, 1 - Math.exp(-dt * 4)); par[1] = lerp(par[1], ty, 1 - Math.exp(-dt * 4));

    // frontal (Collado Sur, de noche)
    var lampS = lerp(A.lamp * (gA.escena === 'campo4' ? 1 : 0), B.lamp * (nombreB === 'campo4' ? 1 : 0), mix);
    var lx = raton.hay ? raton.x : .5 + Math.sin(t * .35) * .22, ly = raton.hay ? raton.y : .5 + Math.sin(t * .53) * .14;
    lampXY[0] = lerp(lampXY[0], lx, 1 - Math.exp(-dt * 7)); lampXY[1] = lerp(lampXY[1], ly, 1 - Math.exp(-dt * 7));

    var nb = gB ? NIEBLA[gA.escena + '>' + gB.escena] : null;
    var est = {
      a: gA.escena, b: nombreB, mix: mix, rA: rA, rB: rB, par: par, t: reducido ? 0 : t, quieto: reducido,
      lamp: [lampXY[0], lampXY[1], lampS * .85], amaA: gA.escena === 'cumbre' ? A.ama : 0, amaB: nombreB === 'cumbre' ? B.ama : 0,
      niebla: nb ? nb[0] : 0, nieblaCol: nb ? nb[1] : null
    };
    if (glOk && E.ok && E.listo(gA.escena)) {
      E.dibujar(est, canvas.width, canvas.height);
      if (!escenario.classList.contains('gl-listo')) { escenario.classList.add('gl-listo'); }
      frames++;
      if (dt > .028) { lento++; } else if (lento > 0) { lento -= .25; }
      if (lento > 40 && dpr > 1) { dpr = 1; lento = 0; tamLienzo(); }
    } else {
      respaldo(respA, gA.escena, rA, 1);
      respaldo(respB, nombreB, rB, mix);
    }

    // sombra lateral para leer
    if (ancho) {
      var lado = dom.activo.lado;
      sombraLado.classList.toggle('der', lado === 'der');
      sombraLado.style.setProperty('--lado-o', lado === 'no' ? '.55' : '1');
    } else { sombraLado.style.setProperty('--lado-o', '0'); }

    // altímetro
    altimetro(lerp(A.alt, B.alt, mix), dom.activo.lugar);

    // viento
    var va = VIENTO[gA.escena], vb = VIENTO[nombreB] || va;
    Viento.paso(dt, { n: lerp(va.n, vb.n, mix), a: lerp(va.a, vb.a, mix), v: lerp(va.v, vb.v, mix), c: [lerp(va.c[0], vb.c[0], mix), lerp(va.c[1], vb.c[1], mix), lerp(va.c[2], vb.c[2], mix)] }, t);

    // ruta: trazado, escalador, hitos y perfil
    var pesoRuta = gA.escena === 'ruta' ? 1 - mix : nombreB === 'ruta' ? mix : 0;
    var rRuta = gA.escena === 'ruta' ? rA : rB, camRuta = gA.escena === 'ruta' ? A : B;
    var pr = pesoRuta > 0 ? camRuta.ruta : 0;
    if (pesoRuta > .001) {
      var esc = VW / rRuta[2];
      svgRuta.style.transform = 'translate3d(' + (-rRuta[0] * esc).toFixed(1) + 'px,' + (-rRuta[1] * .5625 * esc).toFixed(1) + 'px,0) scale(' + (esc / 1000).toFixed(5) + ')';
      var k = 1 / esc;
      pSombra.style.strokeWidth = (7 * k).toFixed(6); pLinea.style.strokeWidth = (2.6 * k).toFixed(6); pFant.style.strokeWidth = (1.4 * k).toFixed(6);
      pFant.style.strokeDasharray = (3 * k).toFixed(6) + ' ' + (6 * k).toFixed(6);
      var fl = fraccionLargo(pr);
      pLinea.style.strokeDashoffset = 1 - fl; pSombra.style.strokeDashoffset = 1 - fl;
      svgRuta.style.opacity = pesoRuta * pesoRuta;
      var q = puntoRuta(pr);
      escalador.style.transform = 'translate3d(' + ((q.u - rRuta[0]) / rRuta[2] * VW).toFixed(1) + 'px,' + ((q.v - rRuta[1]) / rRuta[3] * VH).toFixed(1) + 'px,0)';
      escalador.classList.toggle('on', pesoRuta > .6 && pr > .002);
      // perfil
      clipR.setAttribute('width', sx(q.km).toFixed(1));
      punta.setAttribute('cx', sx(q.km).toFixed(1)); punta.setAttribute('cy', sy(q.z).toFixed(1));
      var cota = cotaEn(q.i, q.z);
      pLugar.textContent = pr > .998 ? 'Cumbre' : hitoAntes(q.i);
      pAlt.textContent = fmt(cota, Math.abs(cota - 8848.86) < .01 ? 2 : 0) + ' m';
      pKm.textContent = 'km ' + fmt(q.km, 1) + ' de ' + fmt(total, 1);
      pO2.textContent = Math.round(o2(cota));
    } else {
      svgRuta.style.opacity = 0; escalador.classList.remove('on');
    }
    var verPerfil = pesoRuta > .7;
    if (verPerfil !== perfilOn) { perfilOn = verPerfil; perfilEl.classList.toggle('on', verPerfil); }

    // rótulos
    var lista = (mix > .2 && mix < .8) ? [] : dom.activo.rot.slice();
    var escRot = gDom.escena, rRot = mix < .5 ? rA : rB;
    if (escRot === 'ruta' && pr > .002 && (mix < .2 || mix > .8)) {
      HITOS_MAPA.forEach(function (h) { if (pr * (NR - 1) >= hitos[h] - .5) { lista.push('h_' + h); } });
    }
    colocarRotulos(lista, escRot, rRot);

    // cuerda fija de la historia
    if (cuerdaFija) {
      var rc = cuerdaFija.getBoundingClientRect();
      if (rc.top < VH && rc.bottom > 0) { cuerdaFija.style.setProperty('--p', clamp((VH * .62 - rc.top) / rc.height, 0, 1).toFixed(4)); }
    }

    // cabecera: se aparta al bajar y vuelve al subir
    if (!cab.classList.contains('abierta')) {
      if (y > yCab + 6 && y > VH * .6) { cab.classList.add('escondida'); yCab = y; }
      else if (y < yCab - 6 || y < VH * .6) { cab.classList.remove('escondida'); yCab = y; }
      else if (Math.abs(y - yCab) > 400) { yCab = y; }
    }

    // capítulo activo en el menú
    var cap = null;
    for (var j = 0; j < capitulos.length; j++) { if (c >= capitulos[j]._top && c < capitulos[j]._bot) { cap = capitulos[j].id; } }
    if (cap !== capActual) { capActual = cap; enlaces.forEach(function (a) { a.setAttribute('aria-current', a.dataset.cap === cap ? 'true' : 'false'); }); }
  }

  var colocados = [];
  function colocarRotulos(lista, escena, r) {
    var ver = {};
    lista.forEach(function (id) { var o = rotulos[id]; if (o && o.escena === escena && (o.pr === 1 || ancho)) { ver[id] = 1; } });
    var k = E ? E.ajuste(escena)[0] : 0;
    colocados.length = 0;
    var orden = Object.keys(rotulos).filter(function (id) { return ver[id]; }).sort(function (a, b) { return rotulos[a].pr - rotulos[b].pr; });
    Object.keys(rotulos).forEach(function (id) {
      var o = rotulos[id];
      if (!ver[id]) { if (o.on) { o.on = false; o.el.classList.remove('on'); } }
    });
    orden.forEach(function (id) {
      var o = rotulos[id];
      var d = E ? E.prof(escena, o.u, o.v) : .3;
      var x = (o.u + par[0] * k * (d - .3) - r[0]) / r[2] * VW, y = (o.v + par[1] * k * (d - .3) - r[1]) / r[3] * VH;
      if (x < 6 || x > VW - 6 || y < 70 || y > VH - 30) { if (o.on) { o.on = false; o.el.classList.remove('on'); } return; }
      if (!o.w) { o.w = o.caja.offsetWidth || 120; o.h = o.caja.offsetHeight || 40; }
      var hilo = 30, bx = x, abajo = y < 170;
      var dx = clamp(bx - o.w / 2, 8, VW - 8 - o.w) - (bx - o.w / 2);
      for (var n = 0; n < 4; n++) {
        var top = abajo ? y + hilo + 10 : y - hilo - 10 - o.h, choca = false;
        for (var m = 0; m < colocados.length; m++) {
          var q = colocados[m];
          if (bx + dx - o.w / 2 < q.x1 && bx + dx + o.w / 2 > q.x0 && top < q.y1 && top + o.h > q.y0) { choca = true; break; }
        }
        if (!choca) { break; }
        hilo += o.h + 8;
      }
      var top2 = abajo ? y + hilo + 10 : y - hilo - 10 - o.h;
      colocados.push({ x0: bx + dx - o.w / 2 - 4, x1: bx + dx + o.w / 2 + 4, y0: top2 - 4, y1: top2 + o.h + 4 });
      o.el.classList.toggle('abajo', abajo);
      o.el.style.setProperty('--hilo', hilo + 'px');
      o.el.style.setProperty('--dx', dx.toFixed(1) + 'px');
      o.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      if (!o.on) { o.on = true; o.el.classList.add('on'); }
    });
  }

  // ------------------------------------------------------------------ revelados al entrar en pantalla
  function contar(el) {
    var fin = parseFloat(el.dataset.cuenta), dec = +(el.dataset.dec || 0), extra = el.querySelector('small');
    var sufijo = extra ? extra.outerHTML : '';
    if (reducido) { return; }
    var ini = performance.now(), dur = fin > 1000 ? 2600 : 1600;
    (function f(ahora) {
      var p = clamp((ahora - ini) / dur, 0, 1), e = 1 - Math.pow(2, -10 * p);
      el.innerHTML = fmt(fin * (p >= 1 ? 1 : e), dec) + sufijo;
      if (p < 1) { requestAnimationFrame(f); }
    })(ini);
  }
  var io = new IntersectionObserver(function (ents) {
    ents.forEach(function (en) {
      if (!en.isIntersecting) { return; }
      var el = en.target;
      el.classList.add('visto');
      $$('[data-cuenta]', el).concat(el.hasAttribute('data-cuenta') ? [el] : []).forEach(function (n) { if (!n._contado) { n._contado = 1; contar(n); } });
      io.unobserve(el);
    });
  }, { threshold: .18, rootMargin: '0px 0px -6% 0px' });
  $$('.revela, .plantilla, [data-revela], .palabras, .tinta, .cordel').forEach(function (el) {
    if (reducido) { el.classList.add('visto'); return; }
    if (el.closest('.heroe')) { return; }
    io.observe(el);
  });

  // linterna en las historias de tienda
  $$('.historia').forEach(function (h) {
    h.addEventListener('pointermove', function (e) {
      var r = h.getBoundingClientRect();
      h.style.setProperty('--mx', (e.clientX - r.left) + 'px'); h.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
    h.addEventListener('pointerleave', function () { h.style.setProperty('--my', '-40%'); });
  });

  // menú
  var cab = $('#cabecera'), bm = $('#boton-menu');
  bm.addEventListener('click', function () { var ab = !cab.classList.contains('abierta'); cab.classList.toggle('abierta', ab); bm.setAttribute('aria-expanded', ab ? 'true' : 'false'); });
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1), dest = document.getElementById(id);
      if (!dest) { return; }
      e.preventDefault();
      cab.classList.remove('abierta'); bm.setAttribute('aria-expanded', 'false');
      if (lenis) { lenis.scrollTo(dest, { duration: 2.4 }); } else { dest.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth' }); }
      try { history.replaceState(null, '', '#' + id); } catch (er) { /* sin historial en el visor */ }
    });
  });

  // ------------------------------------------------------------------ velo de carga y entrada
  var velo = $('#velo'), veloP = $('#velo-p'), barra = $('.barra i', velo), abierto = false, objetivo = 0, mostrado = 0;
  function avance(p) { objetivo = Math.max(objetivo, p); }
  (function anim() {
    mostrado = lerp(mostrado, objetivo, .12);
    veloP.textContent = Math.round(mostrado);
    barra.style.setProperty('--p', (mostrado / 100).toFixed(3));
    if (!abierto) { requestAnimationFrame(anim); }
  })();
  function abrir() {
    if (abierto) { return; }
    abierto = true;
    velo.classList.add('fuera');
    $$('.heroe .revela, .heroe .tinta').forEach(function (el) { el.classList.add('visto'); });
    $$('.heroe [data-cuenta]').forEach(function (n) { if (!n._contado) { n._contado = 1; contar(n); } });
    if (!reducido && letras[0].animate) {
      letras.forEach(function (l, i) {
        l.animate([{ opacity: 0, transform: 'translateY(.45em) rotate(4deg)', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
          { duration: 1400, delay: 260 + i * 70, easing: 'cubic-bezier(.2,.7,.1,1)', fill: 'forwards' }).onfinish = function () { l.style.opacity = '1'; };
      });
    } else { letras.forEach(function (l) { l.style.opacity = '1'; }); }
  }
  var fuentes = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  fuentes.then(function () { avance(25); medir(); });
  var primera = glOk ? E.cargar('norte') : new Promise(function (ok) { if (respA.complete) { ok(); } else { respA.onload = respA.onerror = ok; } });
  cargadas.norte = 1;
  var tCarga = performance.now();
  primera.then(function () { avance(80); return fuentes; }).then(function () {
    avance(100);
    setTimeout(abrir, Math.max(250, 1100 - (performance.now() - tCarga)));
    pedir('campo_base');
  }, function () { avance(100); abrir(); });
  setTimeout(abrir, 6500);
  if (reducido) { setTimeout(abrir, 300); }

  // ------------------------------------------------------------------ arranque
  tamLienzo();
  medir();
  window.addEventListener('resize', function () { tamLienzo(); medir(); });
  if (window.ResizeObserver) { new ResizeObserver(function () { medir(); }).observe($('#contenido')); }
  window.addEventListener('load', medir);
  if (location.hash && document.getElementById(location.hash.slice(1))) {
    setTimeout(function () { document.getElementById(location.hash.slice(1)).scrollIntoView(); medir(); }, 60);
  }
  requestAnimationFrame(cuadro);
})();
