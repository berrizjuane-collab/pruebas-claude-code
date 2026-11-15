/* Annapurna — el escenario.
   Dibuja las pinturas detrás de la página: una cámara que se desplaza sobre
   cada una y, entre dos, una transición «a pincel seco» (la nueva entra por
   pasadas de brocha, de abajo arriba). Con WebGL si lo hay; si no, con <img>
   y un fundido. Las pinturas no se filtran ni se desenfocan: solo se encuadran. */
(function (A) {
  'use strict';

  function acotar(x, a, b) { return Math.min(b, Math.max(a, x)); }

  /* Rectángulo visible de la pintura (en fracciones de su ancho y alto)
     para una cámara {x, y, z} y una pantalla de proporción `aspVista`. */
  function vista(cam, aspImg, aspVista) {
    var du, dv;
    if (aspVista > aspImg) { du = 1; dv = aspImg / aspVista; } else { du = aspVista / aspImg; dv = 1; }
    var z = Math.max(1, cam.z);
    du /= z; dv /= z;
    return { u: acotar(cam.x - du / 2, 0, 1 - du), v: acotar(cam.y - dv / 2, 0, 1 - dv), du: du, dv: dv };
  }

  var VERT = 'attribute vec2 p; varying vec2 vUv;' +
    'void main(){ vUv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }';

  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uA, uB, uBrocha, uPapel;',
    'uniform vec4 uRectA, uRectB;',
    'uniform float uMezcla, uEntraA, uEntraB, uAspecto, uSemilla, uFilas, uSimple, uPxPapel;',
    'const vec3 TINTA = vec3(0.1333, 0.1412, 0.1843);',
    /* Cuánta pintura nueva hay en este punto cuando la transición va por `m`.
       La pantalla se reparte en pasadas horizontales que alternan sentido;
       cada una arranca a su tiempo y avanza con el borde roto del pincel seco. */
    'float pasada(float m, float semilla){',
    '  if (m <= 0.0) return 0.0;',
    '  if (m >= 1.0) return 1.0;',
    '  if (uSimple > 0.5) return m;',
    '  vec2 q = vUv * vec2(uAspecto, 1.0);',
    '  vec3 g = texture2D(uBrocha, q.yx * 0.62 + semilla * 0.37).rgb;',   // .yx: las cerdas van a lo ancho, como la pasada
    '  vec3 f = texture2D(uBrocha, q.yx * 2.4 + semilla * 0.11).rgb;',
    '  float fy = vUv.y * uFilas + (g.r - 0.5) * 0.8;',
    '  float fila = floor(fy);',
    '  float azar = fract(sin((fila + semilla * 7.0) * 12.9898) * 43758.5453);',
    '  float x = mod(fila, 2.0) < 1.0 ? vUv.x : 1.0 - vUv.x;',
    '  float orden = clamp((uFilas - 1.0 - fila) / (uFilas - 1.0), 0.0, 1.0);',
    '  float t0 = 0.5 * (orden * 0.7 + azar * 0.3);',
    '  float local = (m - t0) / 0.5;',
    '  float frente = local * 2.2 - 0.3 - (x + (g.g - 0.5) * 0.34 + (f.r - 0.5) * 0.12);',
    '  float cubierto = smoothstep(0.0, 0.03, frente);',
    '  float seco = smoothstep(0.0, 0.42, frente);',
    '  return cubierto * step(f.b, 0.28 + 0.72 * seco);',
    '}',
    'void main(){',
    '  vec4 gr = texture2D(uPapel, gl_FragCoord.xy / uPxPapel);',
    '  vec3 papel = mix(TINTA, gr.rgb, gr.a * 0.3);',
    '  vec3 c = papel;',
    '  if (uEntraA > 0.0) {',
    '    vec3 a = texture2D(uA, uRectA.xy + vUv * uRectA.zw).rgb;',
    '    c = mix(papel, a, pasada(uEntraA, 1.0));',
    '  }',
    '  if (uMezcla > 0.0 && uEntraB > 0.0) {',
    '    vec3 b = texture2D(uB, uRectB.xy + vUv * uRectB.zw).rgb;',
    '    b = mix(papel, b, pasada(uEntraB, 2.0));',
    '    c = mix(c, b, pasada(uMezcla, uSemilla));',
    '  }',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  function Escenario(raiz, opciones) {
    opciones = opciones || {};
    this.raiz = raiz;
    this.lienzo = raiz.querySelector('.escenario__lienzo');
    this.capas = raiz.querySelector('.escenario__capas');
    this.reducido = !!opciones.reducido;
    this.pinturas = {};          // url → { img, lista, tex, w, h, entra, faltaba }
    this.primera = true;         // la primera pintura entra más despacio: es la portada
    this.ancho = 1; this.alto = 1; this.dpr = 1;
    this.gl = null;
    this.maxTex = 4096;
    this.alListar = null;        // aviso cuando una pintura termina de cargar
    try { this._iniciarGL(); } catch (e) { this._sinGL(); }
    this.medir();
  }

  Escenario.vista = vista;

  Escenario.prototype._iniciarGL = function () {
    // Si el navegador solo puede dar WebGL por software (sin tarjeta gráfica), mejor las <img>:
    // el sombreador a pantalla completa iría a tirones. `?gl=forzar` lo salta, para depurar.
    var forzar = /[?&]gl=forzar\b/.test(window.location.search);
    var op = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: !forzar };
    var gl = this.lienzo.getContext('webgl2', op);
    this.gl2 = !!gl;
    if (!gl) gl = this.lienzo.getContext('webgl', op) || this.lienzo.getContext('experimental-webgl', op);
    if (!gl) throw new Error('sin WebGL');
    this.gl = gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    var prog = gl.createProgram();
    [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]].forEach(function (par) {
      var s = gl.createShader(par[0]);
      gl.shaderSource(s, par[1]);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(prog, s);
    });
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var u = this.u = {};
    ['uA', 'uB', 'uBrocha', 'uPapel', 'uRectA', 'uRectB', 'uMezcla', 'uEntraA', 'uEntraB',
      'uAspecto', 'uSemilla', 'uFilas', 'uSimple', 'uPxPapel'].forEach(function (n) {
      u[n] = gl.getUniformLocation(prog, n);
    });
    gl.uniform1i(u.uA, 0); gl.uniform1i(u.uB, 1); gl.uniform1i(u.uBrocha, 2); gl.uniform1i(u.uPapel, 3);
    gl.uniform1f(u.uSimple, this.reducido ? 1 : 0);

    // Hasta que carguen, la brocha y el papel son un píxel gris.
    this.texBrocha = this._texPixel([128, 128, 128, 255]);
    this.texPapel = this._texPixel([34, 36, 47, 0]);
    this.texVacia = this._texPixel([34, 36, 47, 255]);
    this._auxiliar('img/brocha.webp', 'texBrocha');
    this._auxiliar('grano.png', 'texPapel');

    var yo = this;
    this.lienzo.addEventListener('webglcontextlost', function (e) { e.preventDefault(); yo._sinGL(); }, false);
  };

  Escenario.prototype._texPixel = function (rgba) {
    var gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return t;
  };

  /* Texturas de apoyo (512 px, se repiten). */
  Escenario.prototype._auxiliar = function (url, donde) {
    var yo = this, img = new Image();
    img.onload = function () {
      var gl = yo.gl;
      if (!gl) return;
      try {
        var t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        yo[donde] = t;
        yo.sucio = true;
      } catch (e) { yo._sinGL(); }
    };
    img.src = url;
  };

  /* Sin WebGL (o si el navegador no deja subir las imágenes, como al abrir el
     archivo con doble clic): las mismas pinturas como <img> superpuestas. */
  Escenario.prototype._sinGL = function () {
    if (this.gl === null && this.modoImg) return;
    this.gl = null;
    this.modoImg = true;
    this.lienzo.style.display = 'none';
    this.sucio = true;
  };

  Escenario.prototype.medir = function () {
    var w = this.raiz.clientWidth || 1, h = this.raiz.clientHeight || 1;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.ancho = w; this.alto = h; this.dpr = dpr;
    if (this.gl) {
      var W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (this.lienzo.width !== W || this.lienzo.height !== H) {
        this.lienzo.width = W; this.lienzo.height = H;
        this.gl.viewport(0, 0, W, H);
      }
    }
    this.sucio = true;
  };

  /* Empieza a cargar una pintura (si no lo estaba ya). */
  Escenario.prototype.cargar = function (url) {
    var p = this.pinturas[url];
    if (p) return p;
    var yo = this, img = new Image();
    p = this.pinturas[url] = { url: url, img: img, lista: false, tex: null, w: 16, h: 9, entra: -1e9, faltaba: false, uso: 0 };
    img.decoding = 'async';
    img.alt = '';
    img.onload = function () {
      p.w = img.naturalWidth; p.h = img.naturalHeight;
      var listo = function () {
        if (yo.gl) yo._subir(p);
        p.lista = true;
        // Si la página ya la estaba esperando, entra a pinceladas; si llegó antes de tiempo, ya está.
        if (p.faltaba) { p.entra = performance.now(); p.lenta = yo.primera; }
        yo.primera = false;
        yo.sucio = true;
        if (yo.alListar) yo.alListar(url);
      };
      if (img.decode) img.decode().then(listo, listo); else listo();
    };
    img.onerror = function () { p.error = true; if (yo.alListar) yo.alListar(url); };
    img.src = url;
    return p;
  };

  /* Vuelve a pintar una pintura desde el papel: al levantarse el telón (despacio)
     o al llegar a ella de un salto. Si aún no ha cargado, entrará así cuando llegue. */
  Escenario.prototype.reentrar = function (url, despacio) {
    var p = this.pinturas[url];
    if (!p) return;
    if (p.lista) { p.entra = performance.now(); p.lenta = !!despacio; this.sucio = true; }
    else p.faltaba = true;
  };

  Escenario.prototype._subir = function (p) {
    var gl = this.gl;
    try {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, p.img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (this.gl2) {
        // Con mipmaps el grano de la pintura no centellea al mover la cámara.
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      p.tex = t;
    } catch (e) {
      this._sinGL();
    }
  };

  /* Suelta las pinturas que no estén en `conservar` (lista de url). */
  Escenario.prototype.soltar = function (conservar) {
    var yo = this;
    Object.keys(this.pinturas).forEach(function (url) {
      if (conservar.indexOf(url) >= 0) return;
      var p = yo.pinturas[url];
      if (!p.lista && !p.error) return;           // aún descargando: déjala terminar
      if (p.tex && yo.gl) yo.gl.deleteTexture(p.tex);
      if (p.img.parentNode) p.img.parentNode.removeChild(p.img);
      p.img.onload = p.img.onerror = null;
      delete yo.pinturas[url];
    });
  };

  Escenario.prototype._entrada = function (p, ahora) {
    if (!p || !p.lista) { if (p) p.faltaba = true; return 0; }
    var dur = this.reducido ? 300 : (p.lenta ? 2600 : 1500);
    var t = acotar((ahora - p.entra) / dur, 0, 1);
    return t * t * (3 - 2 * t);
  };

  /* Dibuja. `a` y `b` son { url, cam }; `mezcla` va de 0 (todo a) a 1 (todo b).
     Devuelve true si hay algo animándose y hay que volver a llamar. */
  Escenario.prototype.pintar = function (a, b, mezcla, semilla, ahora) {
    var asp = this.ancho / this.alto;
    var pa = a ? this.pinturas[a.url] : null;
    var pb = b ? this.pinturas[b.url] : null;
    var ea = this._entrada(pa, ahora);
    var eb = b ? this._entrada(pb, ahora) : 0;
    var ra = pa ? vista(a.cam, pa.w / pa.h, asp) : null;
    var rb = pb ? vista(b.cam, pb.w / pb.h, asp) : null;
    this.rectA = ra; this.rectB = rb;
    var vivo = (pa && pa.lista && ea < 1) || (pb && pb.lista && eb < 1 && mezcla > 0);

    if (this.gl) {
      var gl = this.gl, u = this.u;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, (pa && pa.tex) || this.texVacia);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (pb && pb.tex) || this.texVacia);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.texBrocha);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.texPapel);
      if (ra) gl.uniform4f(u.uRectA, ra.u, ra.v, ra.du, ra.dv);
      if (rb) gl.uniform4f(u.uRectB, rb.u, rb.v, rb.du, rb.dv);
      gl.uniform1f(u.uEntraA, pa && pa.tex ? ea : 0);
      gl.uniform1f(u.uEntraB, pb && pb.tex ? eb : 0);
      gl.uniform1f(u.uMezcla, pb && pb.tex ? mezcla : 0);
      gl.uniform1f(u.uAspecto, asp);
      gl.uniform1f(u.uSemilla, semilla || 0);
      gl.uniform1f(u.uFilas, asp < 0.8 ? 8 : 5);
      gl.uniform1f(u.uPxPapel, 512 * this.dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      this._pintarImg(pa, ra, ea, pb, rb, eb * mezcla);
    }
    this.sucio = false;
    return !!vivo;
  };

  Escenario.prototype._pintarImg = function (pa, ra, oa, pb, rb, ob) {
    var yo = this, usadas = [];
    [[pa, ra, oa, 1], [pb, rb, ob, 2]].forEach(function (x) {
      var p = x[0], r = x[1];
      if (!p || !p.lista || !r) return;
      var img = p.img;
      if (img.parentNode !== yo.capas) yo.capas.appendChild(img);
      var W = yo.ancho / r.du, H = yo.alto / r.dv;
      img.style.width = W + 'px';
      img.style.height = H + 'px';
      img.style.transform = 'translate3d(' + (-r.u * W) + 'px,' + (-r.v * H) + 'px,0)';
      img.style.opacity = x[2];
      img.style.zIndex = x[3];
      usadas.push(img);
    });
    Array.prototype.slice.call(this.capas.children).forEach(function (el) {
      if (usadas.indexOf(el) < 0) el.style.opacity = 0;
    });
  };

  A.Escenario = Escenario;
})(window.Annapurna);
