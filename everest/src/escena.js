/* Escenario WebGL: dos láminas, sus mapas de profundidad y una transición «pintada».
   La transición revela la lámina nueva de lejos a cerca (profundidad real del terreno) a lo largo
   de trazos diagonales de ruido, como el pastel que se va frotando sobre el papel. */
(function () {
  'use strict';

  var VERT = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=vec2((p.x+1.)*.5,(1.-p.y)*.5);gl_Position=vec4(p,0.,1.);}';

  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uA,uB,uDA,uDB;',
    'uniform vec4 uRA,uRB;',
    'uniform vec3 uSA,uSB;',          // parallax, centelleo, cielo vivo
    'uniform float uMix,uTime,uNiebla,uAmaA,uAmaB;',
    'uniform vec2 uPar,uTexel,uAspect;',
    'uniform vec3 uLamp,uNieblaCol;',
    'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}',
    'float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*noise(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return s;}',
    'float fbm3(vec2 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*noise(p);p=p*2.07+vec2(5.3,1.7);a*=.5;}return s/.875;}',
    'float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}',
    'vec3 escena(sampler2D T,sampler2D D,vec4 R,vec3 S,float ama,vec2 s,out float dep){',
    ' vec2 uv=R.xy+s*R.zw;',
    ' float d=texture2D(D,uv).r;',
    ' float cielo=1.-smoothstep(.015,.09,d);',
    ' vec2 fl=vec2(fbm3(uv*vec2(4.,9.)+vec2(uTime*.035,0.)),fbm3(uv*vec2(5.,8.)-vec2(0.,uTime*.03)))-.5;',
    ' uv+=fl*.005*cielo*S.z;',
    ' uv-=uPar*S.x*(d-.3);',
    ' uv=clamp(uv,vec2(.002),vec2(.998));',
    ' vec3 c=texture2D(T,uv).rgb;',
    ' if(S.y>0.){',
    '  vec2 tx=uTexel*2.5;',
    '  float m=(lum(texture2D(T,uv+vec2(tx.x,0.)).rgb)+lum(texture2D(T,uv-vec2(tx.x,0.)).rgb)+lum(texture2D(T,uv+vec2(0.,tx.y)).rgb)+lum(texture2D(T,uv-vec2(0.,tx.y)).rgb))*.25;',
    '  float spot=smoothstep(.07,.28,lum(c)-m);',
    '  float h=hash(floor(uv/uTexel/3.));',
    '  float tw=.5+.5*sin(uTime*(1.3+h*3.2)+h*40.);',
    '  c+=c*spot*S.y*(tw-.35)*1.5;',
    ' }',
    ' if(ama>0.){',
    '  float lado=1.-s.x;',
    '  c=mix(c,c*vec3(1.13,1.,.84)+vec3(.05,.025,0.),ama*.6);',
    '  c+=vec3(.95,.55,.25)*ama*.24*pow(lado,2.2)*(1.-s.y*.55);',
    ' }',
    ' dep=d;return c;',
    '}',
    'void main(){',
    ' vec2 s=vUv;float dA,dB;',
    ' vec3 col=escena(uA,uDA,uRA,uSA,uAmaA,s,dA);',
    ' if(uMix>.001){',
    '  vec3 b=escena(uB,uDB,uRB,uSB,uAmaB,s,dB);',
    '  vec2 q=vec2(s.x*uAspect.x,s.y);',
    '  vec2 r=mat2(.94,.34,-.34,.94)*q;',
    '  float n=fbm(vec2(r.x*2.2,r.y*11.));',
    '  float g=noise(q*190.);',
    '  float front=(1.-dB)*.5+n*.42+g*.08;',
    '  float w=.12;float t=uMix*(1.+w+.06)-.03;',
    '  float m=clamp((t-front)/w,0.,1.);m=m*m*(3.-2.*m);',
    '  col=mix(col,b,m);',
    '  col+=vec3(.95,.85,.65)*m*(1.-m)*4.*.1;',
    '  if(uNiebla>0.){',
    '   float k=sin(3.14159*uMix);',
    '   float cl=fbm(vec2(q.x*1.6+uTime*.04+uMix*2.,q.y*3.2));',
    '   float ca=smoothstep(.35,.75,cl+k*.35-.1)*k*uNiebla;',
    '   col=mix(col,uNieblaCol*(.85+.3*cl),clamp(ca,0.,1.));',
    '  }',
    ' }',
    ' if(uLamp.z>0.){',
    '  vec2 dd=(s-uLamp.xy)*vec2(uAspect.x,1.);',
    '  float l=exp(-dot(dd,dd)*16.);',
    '  col+=col*vec3(1.,.86,.6)*l*uLamp.z*1.15+vec3(.1,.07,.03)*l*uLamp.z;',
    ' }',
    ' vec2 vv=(s-.5)*vec2(1.,1.2);',
    ' col*=1.-.26*smoothstep(.35,.85,length(vv));',
    ' gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  // parallax · centelleo (estrellas, frontales, carpas encendidas) · cielo vivo
  var AJUSTE = {
    norte: [1.0, 0.0, 1.0], campo_base: [1.0, 0.35, 0.8], ruta: [0.0, 0.0, 0.7], campo1: [1.0, 0.0, 0.8],
    campo2: [1.0, 0.0, 0.8], campo3: [1.0, 0.0, 1.0], campo4: [1.0, 1.0, 0.6], cumbre: [0.9, 0.0, 1.0]
  };

  var gl = null, prog = null, U = {}, tam = 1280, texturas = {}, promesas = {}, prof = {};

  function compilar(tipo, src) {
    var s = gl.createShader(tipo);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { throw new Error(gl.getShaderInfoLog(s)); }
    return s;
  }

  function cargarImagen(src) {
    return new Promise(function (ok, mal) {
      var im = new Image();
      im.decoding = 'async';
      im.onload = function () { (im.decode ? im.decode() : Promise.resolve()).then(function () { ok(im); }, function () { ok(im); }); };
      im.onerror = mal;
      im.src = src;
    });
  }

  function textura(im) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function leerProfundidad(vista, im) {
    // copia pequeña en CPU para que los rótulos sigan el parallax
    var c = document.createElement('canvas'); c.width = 240; c.height = 135;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(im, 0, 0, 240, 135);
    try { prof[vista] = x.getImageData(0, 0, 240, 135).data; } catch (e) { prof[vista] = null; }
  }

  var Escena = {
    ok: false,
    tam: 1280,
    elegirTam: function () {
      var w = Math.max(window.innerWidth, window.innerHeight) * Math.min(window.devicePixelRatio || 1, 2);
      tam = w > 1500 ? 2560 : 1280;
      if (gl && gl.getParameter(gl.MAX_TEXTURE_SIZE) < 2560) { tam = 1280; }
      Escena.tam = tam;
      return tam;
    },
    init: function (canvas) {
      try {
        gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
        if (!gl) { return false; }
        prog = gl.createProgram();
        gl.attachShader(prog, compilar(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compilar(gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { throw new Error(gl.getProgramInfoLog(prog)); }
        gl.useProgram(prog);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        ['uA', 'uB', 'uDA', 'uDB', 'uRA', 'uRB', 'uSA', 'uSB', 'uMix', 'uTime', 'uNiebla', 'uAmaA', 'uAmaB', 'uPar', 'uTexel', 'uAspect', 'uLamp', 'uNieblaCol'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
        gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1); gl.uniform1i(U.uDA, 2); gl.uniform1i(U.uDB, 3);
        canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); Escena.ok = false; });
        Escena.elegirTam();
        Escena.ok = true;
        return true;
      } catch (e) {
        if (window.console) { console.warn('WebGL no disponible:', e.message); }
        gl = null; Escena.ok = false;
        return false;
      }
    },
    src: function (vista, w) { return 'img/laminas/' + vista + '-' + (w || tam) + '.webp'; },
    cargar: function (vista) {
      if (promesas[vista]) { return promesas[vista]; }
      var pr = Promise.all([cargarImagen(Escena.src(vista)), cargarImagen('img/prof/' + vista + '.webp')]).then(function (r) {
        leerProfundidad(vista, r[1]);
        if (gl) { texturas[vista] = { c: textura(r[0]), d: textura(r[1]), w: r[0].naturalWidth, h: r[0].naturalHeight }; }
        return vista;
      });
      promesas[vista] = pr;
      return pr;
    },
    listo: function (vista) { return !!texturas[vista]; },
    prof: function (vista, u, v) {
      var d = prof[vista];
      if (!d) { return 0.3; }
      var x = Math.max(0, Math.min(239, Math.round(u * 239))), y = Math.max(0, Math.min(134, Math.round(v * 134)));
      return d[(y * 240 + x) * 4] / 255;
    },
    ajuste: function (vista) { return AJUSTE[vista] || [1, 0, 1]; },
    dibujar: function (e, W, H) {
      if (!gl || !Escena.ok) { return; }
      var A = texturas[e.a], B = texturas[e.b] || A;
      if (!A) { return; }
      gl.viewport(0, 0, W, H);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.c);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, B.c);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, A.d);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, B.d);
      gl.uniform4fv(U.uRA, e.rA); gl.uniform4fv(U.uRB, e.rB);
      var sa = AJUSTE[e.a], sb = AJUSTE[e.b] || sa;
      var vivo = e.quieto ? 0 : 1;
      gl.uniform3f(U.uSA, sa[0], sa[1] * vivo, sa[2] * vivo);
      gl.uniform3f(U.uSB, sb[0], sb[1] * vivo, sb[2] * vivo);
      gl.uniform1f(U.uMix, texturas[e.b] ? e.mix : 0);
      gl.uniform1f(U.uTime, e.t);
      gl.uniform1f(U.uNiebla, e.niebla || 0);
      gl.uniform3fv(U.uNieblaCol, e.nieblaCol || [0.85, 0.82, 0.9]);
      gl.uniform1f(U.uAmaA, e.amaA || 0); gl.uniform1f(U.uAmaB, e.amaB || 0);
      gl.uniform2fv(U.uPar, e.par);
      gl.uniform2f(U.uTexel, 1 / A.w, 1 / A.h);
      gl.uniform2f(U.uAspect, W / H, 1);
      gl.uniform3fv(U.uLamp, e.lamp);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
  window.Escena = Escena;
})();
