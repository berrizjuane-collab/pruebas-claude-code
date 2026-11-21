/* Annapurna — el guion.
   Un solo bucle lee la posición de la página y de ahí sale todo lo demás:
   qué pintura toca, dónde mira la cámara y por dónde va cada pieza fijada
   (la etimología, el perfil de cumbres, el mapa de la ruta). No se secuestra
   el scroll: la página se desplaza como cualquier otra y lo que se suaviza
   son los valores que dependen de ella. */
(function (A) {
  'use strict';

  var doc = document, html = doc.documentElement;
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function acotar(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function tramo(x, a, b) { return acotar((x - a) / (b - a), 0, 1); }
  function suave(t) { t = acotar(t, 0, 1); return t * t * (3 - 2 * t); }
  function mezclar(a, b, t) { return a + (b - a) * t; }
  function arriba(el) { return el.getBoundingClientRect().top + window.scrollY; }
  function arribaSinMover(el) {                  // como `arriba`, pero sin contar las transformaciones
    var y = 0;
    while (el) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }
  function poner(el, nombre, valor) {           // escribe una variable CSS solo si cambia
    var k = '_' + nombre;
    if (el[k] === valor) return;
    el[k] = valor;
    el.style.setProperty(nombre, valor);
  }
  function espera(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function despues(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  function azar(semilla) {                       // generador con semilla: el mismo dibujo siempre
    return function () {
      semilla |= 0; semilla = semilla + 0x6D2B79F5 | 0;
      var t = Math.imul(semilla ^ semilla >>> 15, 1 | semilla);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tactil = window.matchMedia('(hover: none)').matches;

  var raizEsc = $('.escenario');
  var escenario = new A.Escenario(raizEsc, { reducido: reducido });
  var aire = reducido ? null : new A.Aire($('.escenario__aire'));

  var E = {
    y: window.scrollY, ys: window.scrollY, vw: 1, vh: 1, orient: 'ancha',
    bloques: [], aperturas: [], fijos: {}, total: 1, sucio: true, fuentes: {}
  };

  /* ───────────── medidas ───────────── */
  function elegirFuente(escena) {
    var lista = A.PINTURAS[escena][E.orient];
    var aspImg = E.orient === 'alta' ? 0.46 : 16 / 9;
    var hace = Math.max(escenario.ancho, escenario.alto * aspImg) * escenario.dpr * (escena === 'mapa' ? 1.9 : 1.3);
    var elegida = lista[0];
    for (var i = 0; i < lista.length; i++) {
      var w = +/(\d+)\.webp$/.exec(lista[i])[1];
      if (w > escenario.maxTex) break;
      elegida = lista[i];
      if (w >= hace * 0.9) break;
    }
    return elegida;
  }

  function medir() {
    E.vw = window.innerWidth; E.vh = window.innerHeight;
    escenario.medir();
    if (aire) aire.medir();
    E.orient = (escenario.ancho / escenario.alto) < 0.8 ? 'alta' : 'ancha';
    html.classList.toggle('alta', E.orient === 'alta');
    E.fuentes = {};
    Object.keys(A.PINTURAS).forEach(function (k) { E.fuentes[k] = elegirFuente(k); });
    E.bloques = $$('.bloque[data-escena]').map(function (el) {
      return { el: el, id: el.id, escena: el.dataset.escena, top: arriba(el), alto: el.offsetHeight,
        capitulo: el.closest('.capitulo').id };
    });
    E.aperturas = $$('.apertura').map(function (el) {
      return { el: el, top: arriba(el), alto: el.offsetHeight };
    });
    E.fijos = {};
    $$('.fijo').forEach(function (el) {
      var marco = $('.fijo__marco', el);
      E.fijos[el.id] = { el: el, top: arriba(el), alto: el.offsetHeight, marco: marco.offsetHeight };
    });
    E.total = Math.max(1, html.scrollHeight - E.vh);
    piezas.forEach(function (p) { if (p.medir) p.medir(); });
    E.sucio = true;
  }

  /* Avance de una pieza fijada: 0 al quedar clavada, 1 al soltarse. */
  function avance(id, ys) {
    var f = E.fijos[id];
    return f ? acotar((ys - f.top) / Math.max(1, f.alto - f.marco), 0, 1) : 0;
  }
  /* Opacidad de lo que vive en el cielo de una pieza fijada: solo mientras está clavada. */
  function clavada(id, ys) {
    var f = E.fijos[id];
    if (!f) return 0;
    var fin = f.top + f.alto - f.marco;
    return suave(tramo(ys, f.top - E.vh * 0.02, f.top + E.vh * 0.16)) * (1 - suave(tramo(ys, fin - E.vh * 0.14, fin + E.vh * 0.02)));
  }

  /* ───────────── cámara ───────────── */
  var puntero = { x: 0, y: 0, sx: 0, sy: 0 };

  function camara(bloque, c) {
    if (bloque.id === 'b-mapa') return Ruta.camara();
    var guion = A.CAMARAS[bloque.id] || {};
    var claves = guion[E.orient] || [[0, 0.5, 0.5, 1]];
    var t = acotar((c - bloque.top) / bloque.alto, 0, 1);
    if (guion.titulo) {                           // mientras el título está en el cielo, la cámara no se mueve
      var t0 = Math.min(0.5, E.vh * 1.05 / bloque.alto);
      t = Math.max(0, (t - t0) / (1 - t0));
    }
    var i = 0;
    while (i < claves.length - 2 && t > claves[i + 1][0]) i++;
    var a = claves[i], b = claves[Math.min(i + 1, claves.length - 1)];
    var k = b[0] > a[0] ? suave((t - a[0]) / (b[0] - a[0])) : 0;
    var z = mezclar(a[3], b[3], k);
    return {
      x: mezclar(a[1], b[1], k) + puntero.sx * 0.006 / z,
      y: mezclar(a[2], b[2], k) + puntero.sy * 0.004 / z,
      z: z
    };
  }

  /* ───────────── qué pintura toca ───────────── */
  var ultimoBloque = -1;

  function componer(ahora) {
    var B = E.bloques, n = B.length;
    if (!n) return false;
    var c = E.ys + E.vh / 2, i = 0;
    while (i < n - 1 && c >= B[i].top + B[i].alto) i++;
    var T = E.vh * 0.9, bl = B[i], a = i, b = -1, m = 0;
    var fin = bl.top + bl.alto;
    if (i < n - 1 && c > fin - T / 2) { b = i + 1; m = (c - (fin - T / 2)) / T; }
    else if (i > 0 && c < bl.top + T / 2) { a = i - 1; b = i; m = 0.5 + (c - bl.top) / T; }
    var ua = E.fuentes[B[a].escena], ub = b >= 0 ? E.fuentes[B[b].escena] : null;
    if (b >= 0 && ua === ub) { a = i; b = -1; m = 0; ua = E.fuentes[B[a].escena]; }   // misma pintura: solo se mueve la cámara
    m = suave(m);

    if (E.salto) {                               // tras un salto (índice, tecla Fin…), la pintura de destino entra a pinceladas
      E.salto = false;
      escenario.cargar(ua);
      escenario.reentrar(ua);
    }

    if (i !== ultimoBloque) {                    // al cambiar de bloque: precarga vecinas y suelta las lejanas
      ultimoBloque = i;
      var cerca = [];
      for (var k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 2); k++) {
        var u = E.fuentes[B[k].escena];
        if (cerca.indexOf(u) < 0) cerca.push(u);
      }
      escenario.cargar(E.fuentes[B[i].escena]);  // primero la que se ve
      cerca.forEach(function (u) { escenario.cargar(u); });
      escenario.soltar(cerca);
    }

    var A_ = { url: ua, cam: camara(B[a], c) };
    var B_ = b >= 0 ? { url: ub, cam: camara(B[b], c) } : null;
    var vivo = escenario.pintar(A_, B_, m, b >= 0 ? b : 0, ahora);

    var dom = (b >= 0 && m > 0.5) ? b : a;
    E.dominante = B[dom];
    if (aire) aire.poner(A.PINTURAS[B[dom].escena].aire);

    // el mapa lleva encima la ruta y los rótulos: siguen a la cámara
    var pesoMapa = 0, rect = null;
    if (B[a].escena === 'mapa') { pesoMapa = b >= 0 ? 1 - m : 1; rect = escenario.rectA; }
    else if (b >= 0 && B[b].escena === 'mapa') { pesoMapa = m; rect = escenario.rectB; }
    Ruta.colocar(rect, pesoMapa);
    return vivo;
  }

  /* ───────────── piezas ───────────── */

  /* Portada: el logotipo se va hacia arriba y se apaga al empezar a bajar. */
  var Portada = {
    el: $('.portada'),
    actualizar: function (ys) {
      poner(this.el, '--sube', acotar(ys / (E.vh * 0.7), 0, 1).toFixed(3));
    }
  };

  /* Aperturas: el título de cada capítulo aparece cuando ya está en el cielo. */
  var Aperturas = {
    actualizar: function (ys) {
      var velo = ys < E.vh * 0.55 ? 1 : 0;
      for (var i = 0; i < E.aperturas.length; i++) {
        var a = E.aperturas[i];
        var ver = ys >= a.top - E.vh * 0.1 && ys <= a.top + a.alto - E.vh * 0.42;
        if (ver !== a.ver) { a.ver = ver; a.el.classList.toggle('es-visible', ver); }
        if (ver) velo = 1;
      }
      if (clavada('etimo', ys) > 0.2) velo = 1;
      poner(raizEsc, '--velo', velo);
    }
  };

  /* Etimología: la palabra se abre en sus dos mitades y vuelve a cerrarse. */
  var Etimo = {
    el: $('.etimo'),
    actualizar: function (ys) {
      var p = avance('etimo', ys);
      var abre = suave(tramo(p, 0.10, 0.34)) * (1 - suave(tramo(p, 0.62, 0.82)));
      var glosa = suave(tramo(p, 0.24, 0.36)) * (1 - suave(tramo(p, 0.56, 0.66)));
      var suma = suave(tramo(p, 0.72, 0.86));
      poner(this.el, '--ver', clavada('etimo', ys).toFixed(3));
      poner(this.el, '--abre', abre.toFixed(3));
      poner(this.el, '--glosa', glosa.toFixed(3));
      poner(this.el, '--suma', suma.toFixed(3));
    }
  };

  /* Perfil del macizo: diez cumbres dibujadas a escala; el scroll las recorre. */
  var Perfil = (function () {
    var cumbres = [], cont = $('#perfil-grafico'), xs = [], ys = [], recorte, guia, puntos = [], activo = -1, W = 0, H = 0, base = 0;
    var ui = { n: $('#perfil-n'), nombre: $('#perfil-nombre'), m: $('#perfil-m'), ne: $('#perfil-ne'), ano: $('#perfil-ano'), nota: $('#perfil-nota'), ficha: $('.perfil__ficha') };

    function leer() {
      cumbres = $$('#cumbres li').map(function (li) {
        return { nombre: $('h3', li).textContent, m: +li.dataset.m, ano: li.dataset.ano, nota: li.lastElementChild.textContent };
      });
    }

    function construir() {
      if (!cont) return;
      W = cont.clientWidth;
      if (!W) return;
      var estrecho = W < 520;
      H = estrecho ? 112 : Math.round(acotar(W * 0.3, 150, 240));
      var mi = 44, md = 6, ms = 12, mb = 2, m0 = 5450, m1 = 8300, n = cumbres.length;
      base = H - mb;
      function Y(m) { return ms + (1 - (m - m0) / (m1 - m0)) * (H - ms - mb); }
      function X(i) { return mi + 14 + (W - mi - md - 28) * (i / (n - 1)); }
      var r = azar(1950), pts = [[mi, Y(5700)]];
      xs = []; ys = [];
      function roto(p, q, k) {                    // ladera: recta con el pulso de una mano
        for (var j = 1; j <= k; j++) {
          var t = j / (k + 1);
          pts.push([mezclar(p[0], q[0], t), mezclar(p[1], q[1], t) + (r() - 0.5) * Math.abs(q[1] - p[1]) * 0.22]);
        }
      }
      for (var i = 0; i < n; i++) {
        var cima = [X(i), Y(cumbres[i].m)];
        if (i > 0) {
          var bajo = Math.max(5650, Math.min(cumbres[i - 1].m, cumbres[i].m) - 480 - r() * 560);
          var collado = [mezclar(xs[i - 1], cima[0], 0.38 + r() * 0.24), Y(bajo)];
          roto([xs[i - 1], ys[i - 1]], collado, 2);
          pts.push(collado);
          roto(collado, cima, 2);
        } else {
          roto(pts[0], cima, 1);
        }
        pts.push(cima);
        xs.push(cima[0]); ys.push(cima[1]);
      }
      roto(pts[pts.length - 1], [W - md, Y(5750)], 1);
      pts.push([W - md, Y(5750)]);
      var linea = pts.map(function (p, j) { return (j ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');
      var area = linea + 'L' + (W - md) + ' ' + base + 'L' + mi + ' ' + base + 'Z';
      var s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
        '<defs><clipPath id="perfil-recorte"><rect x="0" y="-20" width="0" height="' + (H + 40) + '"/></clipPath></defs>';
      [6000, 7000, 8000].forEach(function (m) {
        s += '<line class="perfil__cota" x1="' + mi + '" x2="' + (W - md) + '" y1="' + Y(m).toFixed(1) + '" y2="' + Y(m).toFixed(1) + '"/>' +
          '<text class="perfil__cota-n" x="0" y="' + (Y(m) + 5).toFixed(1) + '">' + m + '</text>';
      });
      s += '<path class="perfil__resto" d="' + area + '"/><path class="perfil__resto-l" d="' + linea + '"/>' +
        '<g clip-path="url(#perfil-recorte)"><path class="perfil__area" d="' + area + '"/><path class="perfil__linea" d="' + linea + '"/></g>' +
        '<line class="perfil__guia" x1="0" x2="0" y1="0" y2="' + base + '"/>';
      for (i = 0; i < n; i++) s += '<circle class="perfil__punto" cx="' + xs[i].toFixed(1) + '" cy="' + ys[i].toFixed(1) + '" r="2.6"/>';
      s += '</svg>';
      cont.innerHTML = s;
      recorte = $('#perfil-recorte rect', cont);
      guia = $('.perfil__guia', cont);
      puntos = $$('.perfil__punto', cont);
      activo = -1;
    }

    function mostrar(i) {
      activo = i;
      var c = cumbres[i];
      ui.n.textContent = i + 1;
      ui.nombre.textContent = c.nombre;
      ui.m.textContent = c.m;
      ui.ne.textContent = A.enNepali(c.m);
      ui.ano.textContent = c.ano ? 'Primera ascensión · ' + c.ano : 'Sin ascensión';
      ui.nota.textContent = c.nota;
      puntos.forEach(function (p, j) {
        p.classList.toggle('es-activa', j === i);
        p.classList.toggle('es-pasada', j < i);
        p.setAttribute('r', j === i ? 5 : 2.6);
      });
      guia.setAttribute('x1', xs[i]); guia.setAttribute('x2', xs[i]); guia.setAttribute('y1', ys[i] + 6);
      if (!reducido) { ui.ficha.classList.remove('cambia'); void ui.ficha.offsetWidth; ui.ficha.classList.add('cambia'); }
    }

    return {
      medir: function () { if (!cumbres.length) leer(); construir(); },
      actualizar: function (ys_) {
        if (!recorte) return;
        var n = cumbres.length, f = acotar(avance('perfil', ys_) * 1.1 - 0.05, 0, 1) * (n - 1);
        var i = Math.min(n - 1, Math.floor(f)), k = f - i;
        var x = i < n - 1 ? mezclar(xs[i], xs[i + 1], suave(k)) : xs[n - 1];
        recorte.setAttribute('width', (x + 1).toFixed(1));
        var cual = Math.round(f);
        if (cual !== activo) mostrar(cual);
      }
    };
  })();

  /* La ruta: el sendero se dibuja sobre el mapa pintado y la cámara lo sigue. */
  var Ruta = (function () {
    var capa = doc.createElement('div');
    capa.className = 'mapa';
    raizEsc.insertBefore(capa, $('.escenario__velo'));
    var etapas = [], svg, camino, largo = 0, fr = [], H = 562.5, orient = null, cabeza, marcas = [];
    var cam = { x: 0.5, y: 0.5, z: 1 }, s = 0, activo = -1, p = 0;
    var ui = { dia: $('#tramo-dia'), m: $('#tramo-m'), ne: $('#tramo-ne'), nombre: $('#tramo-nombre'), nota: $('#tramo-nota'), perfil: $('#tramo-perfil'), caja: $('.tramo') };
    var grafico = { recorte: null, punto: null, xs: [], ys: [] };

    function leer() {
      etapas = $$('#etapas li').map(function (li) {
        return { nombre: $('h3', li).textContent, m: +li.dataset.m, dia: li.dataset.dia, km: +li.dataset.km,
          lon: +li.dataset.lon, lat: +li.dataset.lat, nota: li.lastElementChild.textContent };
      });
    }

    function curva(P) {                           // Catmull-Rom → Bézier: pasa por todos los puntos
      var d = 'M' + P[0][0].toFixed(1) + ' ' + P[0][1].toFixed(1);
      for (var i = 0; i < P.length - 1; i++) {
        var p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
        d += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ' ' +
          (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ' ' +
          p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
      }
      return d;
    }

    function construir() {
      orient = E.orient;
      var marco = A.MAPA.marco[orient];
      H = 1000 / (orient === 'alta' ? 1620 / 3520 : 16 / 9);
      function P(lon, lat) {
        return [(lon - marco.lon[0]) / (marco.lon[1] - marco.lon[0]) * 1000,
          (marco.lat[1] - lat) / (marco.lat[1] - marco.lat[0]) * H];
      }
      var d = curva(A.MAPA.traza.map(function (q) { return P(q[0], q[1]); }));
      var h = '<svg viewBox="0 0 1000 ' + H.toFixed(1) + '" preserveAspectRatio="none">';
      A.MAPA.lugares.forEach(function (l) {
        if (l[3] !== 'todo' && l[3] !== orient) return;
        var q = P(l[1], l[2]);
        h += '<g transform="translate(' + q[0].toFixed(1) + ' ' + q[1].toFixed(1) + ')"><g class="u">' +
          '<text class="mapa__lugar" text-anchor="middle">' + l[0] + '</text></g></g>';
      });
      A.MAPA.rotulos.forEach(function (r) {
        if (r[4] !== 'todo' && r[4] !== orient) return;
        var q = P(r[2], r[3]), lado = r[5];
        var ax = lado === 'izq' ? 'end' : lado === 'der' ? 'start' : 'middle';
        var tx = lado === 'izq' ? -12 : lado === 'der' ? 12 : 0;
        var ty = lado === 'abajo' ? 26 : lado === 'arriba' ? -30 : -4;
        h += '<g transform="translate(' + q[0].toFixed(1) + ' ' + q[1].toFixed(1) + ')"><g class="u">' +
          '<path class="mapa__pico" d="M0 -7L6.5 4.5L-6.5 4.5Z"/>' +
          '<text class="mapa__nombre" text-anchor="' + ax + '" x="' + tx + '" y="' + ty + '">' + r[0] + '</text>' +
          '<text class="mapa__cota" text-anchor="' + ax + '" x="' + tx + '" y="' + (ty + 17) + '">' + r[1] + ' m</text></g></g>';
      });
      h += '<path class="mapa__senda" d="' + d + '"/>' +
        '<path class="mapa__borde" pathLength="1" d="' + d + '"/>' +
        '<path class="mapa__hecho" pathLength="1" d="' + d + '"/>';
      etapas.forEach(function (e, i) {
        var q = P(e.lon, e.lat);
        h += '<g transform="translate(' + q[0].toFixed(1) + ' ' + q[1].toFixed(1) + ')"><g class="u mapa__parada" data-i="' + i + '">' +
          '<circle r="4.2"/></g></g>';
      });
      h += '<g class="mapa__cabeza"><g class="u"><circle class="mapa__pulso" r="13"/><circle class="mapa__yo" r="6"/></g></g></svg>';
      capa.innerHTML = h;
      svg = $('svg', capa);
      camino = $('.mapa__hecho', capa);
      cabeza = $('.mapa__cabeza', capa);
      marcas = $$('.mapa__parada', capa);
      largo = camino.getTotalLength();
      // a qué altura del sendero cae cada parada (en orden, para el ida y vuelta a Poon Hill)
      var N = 500, muestras = [], j0 = 0;
      for (var j = 0; j <= N; j++) muestras.push(camino.getPointAtLength(largo * j / N));
      fr = etapas.map(function (e) {
        var q = P(e.lon, e.lat), mejor = j0, dm = 1e9;
        for (var k = j0; k <= N; k++) {
          var dd = Math.pow(muestras[k].x - q[0], 2) + Math.pow(muestras[k].y - q[1], 2);
          if (dd < dm) { dm = dd; mejor = k; }
          else if (dd > dm + 900 && k > mejor + 25) break;
        }
        j0 = mejor;
        return mejor / N;
      });
      fr[0] = 0; fr[fr.length - 1] = 1;
      activo = -1;
      perfilar();
    }

    /* El desnivel de toda la ruta en una línea, dentro de la tarjeta. */
    function perfilar() {
      var W = ui.perfil.clientWidth, Hp = 46;
      if (!W) return;
      var km1 = etapas[etapas.length - 1].km;
      grafico.xs = etapas.map(function (e) { return 3 + (W - 6) * e.km / km1; });
      grafico.ys = etapas.map(function (e) { return 5 + (1 - (e.m - 900) / (4250 - 900)) * (Hp - 9); });
      var l = grafico.xs.map(function (x, i) { return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + grafico.ys[i].toFixed(1); }).join('');
      ui.perfil.innerHTML = '<svg width="' + W + '" height="' + Hp + '" viewBox="0 0 ' + W + ' ' + Hp + '">' +
        '<defs><clipPath id="tramo-recorte"><rect x="0" y="0" width="0" height="' + Hp + '"/></clipPath></defs>' +
        '<path class="tramo__l-resto" d="' + l + '"/><path class="tramo__l" clip-path="url(#tramo-recorte)" d="' + l + '"/>' +
        '<circle class="tramo__p" r="4" cx="' + grafico.xs[0] + '" cy="' + grafico.ys[0] + '"/></svg>';
      grafico.recorte = $('#tramo-recorte rect', ui.perfil);
      grafico.punto = $('.tramo__p', ui.perfil);
    }

    function mostrar(i) {
      activo = i;
      var e = etapas[i];
      ui.dia.textContent = 'Día ' + e.dia + ' · etapa ' + (i + 1) + ' de ' + etapas.length;
      ui.nombre.textContent = e.nombre;
      ui.m.textContent = e.m;
      ui.ne.textContent = A.enNepali(e.m);
      ui.nota.textContent = e.nota;
      marcas.forEach(function (m, j) {
        m.classList.toggle('es-pasada', j < i);
        m.classList.toggle('es-activa', j === i);
      });
      if (!reducido) { ui.caja.classList.remove('cambia'); void ui.caja.offsetWidth; ui.caja.classList.add('cambia'); }
    }

    function recorrer(ys) {
      if (!camino) return;
      p = avance('mapa', ys);
      var n = etapas.length, q = tramo(p, 0.06, 0.9) * (n - 1);
      var i = Math.min(n - 2, Math.floor(q)), loc = q - i;
      var e = suave(tramo(loc, 0.1, 0.86));         // se detiene un momento en cada parada
      s = fr[i] + (fr[i + 1] - fr[i]) * e;
      var cual = loc > 0.8 ? i + 1 : i;
      if (cual !== activo) mostrar(cual);
      var pt = camino.getPointAtLength(largo * s);
      cabeza.setAttribute('transform', 'translate(' + pt.x.toFixed(2) + ' ' + pt.y.toFixed(2) + ')');
      poner(svg, '--s', s.toFixed(4));
      if (grafico.recorte) {
        var gx = mezclar(grafico.xs[i], grafico.xs[i + 1], e), gy = mezclar(grafico.ys[i], grafico.ys[i + 1], e);
        grafico.recorte.setAttribute('width', gx.toFixed(1));
        grafico.punto.setAttribute('cx', gx.toFixed(1)); grafico.punto.setAttribute('cy', gy.toFixed(1));
      }
      // cámara: de la vista general al sendero, y al final se abre sobre el Santuario
      var dentro = suave(tramo(p, 0, 0.07)), fuera = suave(tramo(p, 0.91, 1));
      var alta = orient === 'alta';
      var z = mezclar(1, alta ? 1.95 : 1.85, dentro);
      z = mezclar(z, alta ? 1.45 : 1.5, fuera);
      var asp = escenario.ancho / escenario.alto, aspImg = 1000 / H;
      var du = (asp > aspImg ? 1 : asp / aspImg) / z, dv = (asp > aspImg ? aspImg / asp : 1) / z;
      var ax = alta ? 0.5 : mezclar(0.36, 0.42, fuera), ay = alta ? mezclar(0.33, 0.36, fuera) : 0.52;
      cam.x = pt.x / 1000 + (0.5 - ax) * du;
      cam.y = pt.y / H + (0.5 - ay) * dv;
      cam.z = z;
    }

    return {
      medir: function () { if (!etapas.length) leer(); construir(); },
      actualizar: recorrer,
      camara: function () { return cam; },
      colocar: function (rect, peso) {
        var o = suave(tramo(peso, 0.55, 1)).toFixed(3);
        if (o !== capa._o) { capa._o = o; capa.style.opacity = o; }
        if (!rect || +o <= 0) return;
        var W = escenario.ancho / rect.du, Hh = escenario.alto / rect.dv;
        capa.style.width = W.toFixed(1) + 'px';
        capa.style.height = Hh.toFixed(1) + 'px';
        capa.style.transform = 'translate3d(' + (-rect.u * W).toFixed(1) + 'px,' + (-rect.v * Hh).toFixed(1) + 'px,0)';
        var u = 1000 / W;
        capa.style.setProperty('--k', u.toFixed(4));
        capa.style.setProperty('--u', u.toFixed(4) + 'px');
      }
    };
  })();
  /* Cabecera: se esconde al bajar, vuelve al subir y marca el capítulo. */
  var Cabecera = (function () {
    var el = $('#cabecera'), enlaces = $$('.cabecera__nav a'), yAntes = window.scrollY, actual = null, oculta = false, solida = false;
    return {
      actualizar: function () {
        var y = E.y, dy = y - yAntes;
        yAntes = y;
        var s = y > E.vh * 0.8;
        if (s !== solida) { solida = s; el.classList.toggle('cabecera--solida', s); }
        var o = oculta;
        if (y < E.vh * 0.8) o = false; else if (dy > 3) o = true; else if (dy < -3) o = false;
        if (o !== oculta) { oculta = o; el.classList.toggle('cabecera--oculta', o); }
        poner(el, '--avance', acotar(y / E.total, 0, 1).toFixed(4));
        var cap = E.dominante ? E.dominante.capitulo : null;
        if (cap !== actual) {
          actual = cap;
          enlaces.forEach(function (a) {
            if (a.getAttribute('href') === '#' + cap) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
          });
        }
      }
    };
  })();

  /* Hojas: la cabecera va sin caja, así que ninguna carta puede pasarle por debajo.
     Cada pergamino se deshace de arriba abajo conforme llega a ella. */
  var Hojas = (function () {
    var lista = [], Z = 62;
    return {
      medir: function () {
        Z = $('#cabecera').offsetHeight;
        lista = $$('.relato .nota').map(function (el) {
          return { el: el, top: arribaSinMover(el), alto: el.offsetHeight, on: el.classList.contains('se-va') };
        });
      },
      actualizar: function () {
        var y0 = window.scrollY;                    // la página real, no la suavizada: la carta va con ella
        for (var i = 0; i < lista.length; i++) {
          var h = lista[i], y = h.top - y0, on = y < Z + 16 && y + h.alto > -16;
          if (on) poner(h.el, '--corte', Math.round(Z - y) + 'px');
          if (on !== h.on) { h.on = on; h.el.classList.toggle('se-va', on); }
        }
      }
    };
  })();

  var piezas = [Portada, Aperturas, Etimo, Perfil, Ruta, Hojas];

  /* ───────────── el bucle ───────────── */
  var antes = performance.now(), ysAntes = -1, vivo = true, TAU = tactil ? 0.05 : 0.11;

  function cuadro(ahora) {
    requestAnimationFrame(cuadro);
    var dt = Math.min(0.1, (ahora - antes) / 1000);
    antes = ahora;
    E.y = window.scrollY;
    var d = E.y - E.ys;
    if (reducido || Math.abs(d) < 0.4) E.ys = E.y;
    else if (Math.abs(d) > E.vh * 3) { E.ys = E.y; E.salto = true; }       // los saltos largos no se arrastran
    else E.ys += d * (1 - Math.exp(-dt / TAU));

    var mp = false;
    if (!tactil && !reducido) {
      var px = puntero.x - puntero.sx, py = puntero.y - puntero.sy;
      if (Math.abs(px) + Math.abs(py) > 0.002) {
        var k = 1 - Math.exp(-dt / 0.35);
        puntero.sx += px * k; puntero.sy += py * k; mp = true;
      }
    }

    if (E.ys !== ysAntes || E.sucio || escenario.sucio || vivo || mp) {
      ysAntes = E.ys;
      E.sucio = false;
      for (var i = 0; i < piezas.length; i++) piezas[i].actualizar(E.ys);
      vivo = componer(ahora);
    }
    Cabecera.actualizar();
    if (aire && !doc.hidden) aire.paso(ahora);
  }

  /* ───────────── detalles ───────────── */

  /* Títulos: palabra a palabra, para que suban de una en una. */
  function partirTitulos() {
    $$('.titulo').forEach(function (t) {
      if (t.children.length) return;
      var palabras = t.textContent.trim().split(/\s+/);
      t.setAttribute('aria-label', t.textContent.trim());
      t.innerHTML = palabras.map(function (w, i) {
        return '<span class="pal" aria-hidden="true"><span style="--i:' + i + '">' + w + '</span></span>';
      }).join(' ');
    });
  }

  /* Cifras que cuentan hasta su valor la primera vez que se ven. */
  function contar(el) {
    var fin = +el.dataset.cuenta, ne = el.dataset.cifras === 'ne', t0 = performance.now(), dur = fin > 100 ? 1700 : 900;
    function escribir(v) { el.textContent = ne ? A.enNepali(String(v).padStart(String(fin).length, '0')) : v; }
    if (reducido) { escribir(fin); return; }
    (function paso(t) {
      var k = acotar((t - t0) / dur, 0, 1);
      escribir(Math.round(fin * (1 - Math.pow(1 - k, 4))));
      if (k < 1) requestAnimationFrame(paso);
    })(t0);
  }

  function observar() {
    if (!('IntersectionObserver' in window)) {
      $$('.nota').forEach(function (n) { n.classList.add('es-visible'); });
      return;
    }
    var notas = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('es-visible'); notas.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('.nota').forEach(function (n) { notas.observe(n); });

    var cifras = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { contar(e.target); cifras.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    $$('[data-cuenta]').forEach(function (c) { if (!c.closest('.portada')) cifras.observe(c); });
  }

  /* Banderas de oración: diez, colgadas de la cuerda, cada una a su aire. */
  function banderas() {
    var g = $('.banderas__tira');
    if (!g) return;
    var s = '', n = 10;
    for (var i = 0; i < n; i++) {
      var t = (i + 0.5) / n, u = 1 - t;
      var x = 2 * u * t * 300 + t * t * 600, y = u * u * 22 + 2 * u * t * 74 + t * t * 22;
      var ang = Math.atan2(2 * u * 52 - 2 * t * 52, 600) * 180 / Math.PI;
      s += '<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')">' +
        '<path class="bandera" style="--n:' + i + '" fill="' + A.BANDERAS[i % 5] + '" d="M-23 0H23L21 58Q0 64 -21 58Z"/></g>';
    }
    g.innerHTML = s;
  }

  /* Índice a pantalla completa (móvil). */
  function indice() {
    var boton = $('#abrir-indice'), panel = $('#indice');
    if (!boton || !panel) return;
    function cerrar() {
      panel.classList.remove('abierto');
      boton.setAttribute('aria-expanded', 'false');
      boton.textContent = 'Índice';
      html.classList.remove('con-indice');
      setTimeout(function () { if (!panel.classList.contains('abierto')) panel.hidden = true; }, 420);
    }
    function abrir() {
      panel.hidden = false;
      void panel.offsetWidth;
      panel.classList.add('abierto');
      boton.setAttribute('aria-expanded', 'true');
      boton.textContent = 'Cerrar';
      html.classList.add('con-indice');
    }
    boton.addEventListener('click', function () { if (panel.classList.contains('abierto')) cerrar(); else abrir(); });
    panel.addEventListener('click', function (e) { if (e.target.closest('a')) cerrar(); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('abierto')) { cerrar(); boton.focus(); } });
  }

  /* Enlaces internos: los cercanos se deslizan; los lejanos saltan y la pintura de destino se pinta de nuevo. */
  function enlaces() {
    doc.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var destino = doc.getElementById(a.getAttribute('href').slice(1));
      if (!destino) return;
      e.preventDefault();
      var y = Math.round(arriba(destino)), cerca = Math.abs(y - window.scrollY) < E.vh * 1.6;
      window.scrollTo({ top: y, behavior: cerca && !reducido ? 'smooth' : 'auto' });
      try { history.replaceState(null, '', a.getAttribute('href')); } catch (err) { /* sin historial: da igual */ }
    });
  }

  /* ───────────── arranque ───────────── */
  enlaces();
  partirTitulos();
  banderas();
  indice();
  medir();
  observar();

  var remedir = despues(medir, 140);
  window.addEventListener('resize', remedir);
  window.addEventListener('orientationchange', remedir);
  window.addEventListener('load', medir);
  if ('ResizeObserver' in window) new ResizeObserver(remedir).observe($('#contenido'));
  if (!tactil) {
    window.addEventListener('pointermove', function (e) {
      puntero.x = (e.clientX / E.vw) * 2 - 1;
      puntero.y = (e.clientY / E.vh) * 2 - 1;
    }, { passive: true });
  }

  // El telón se levanta cuando están las letras y la primera pintura (o a los seis segundos, pase lo que pase).
  var telon = $('#telon'), aro = $('.telon__aro');
  var primeraUrl = E.fuentes[(E.bloques[0] || {}).escena || 'hero'];
  var pinturaLista = new Promise(function (ok) {
    escenario.alListar = function (url) { if (url === primeraUrl) ok(); E.sucio = true; };
    var p = escenario.cargar(primeraUrl);
    if (p.lista) ok();
  });
  var letras = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
  if (aro) requestAnimationFrame(function () { aro.style.strokeDashoffset = 0.25; });
  Promise.race([Promise.all([pinturaLista, letras]), espera(6000)]).then(function () {
    if (aro) aro.style.strokeDashoffset = 0;
    medir();
    return espera(reducido ? 0 : 380);
  }).then(function () {
    html.classList.add('listo');
    if (!reducido) escenario.reentrar(primeraUrl, true);   // la portada se pinta a la vista, no detrás del telón
    if (telon) {
      telon.classList.add('fuera');
      setTimeout(function () { if (telon.parentNode) telon.parentNode.removeChild(telon); }, 1400);
    }
    var cifra = $('.portada [data-cuenta]');
    if (cifra) setTimeout(function () { contar(cifra); }, reducido ? 0 : 1500);
  });

  requestAnimationFrame(cuadro);

  A.estado = E;                                  // a mano para depurar desde la consola
})(window.Annapurna);
