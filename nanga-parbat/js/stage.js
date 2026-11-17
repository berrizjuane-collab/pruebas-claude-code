// Escenario: las láminas a pantalla completa detrás del texto.
// WebGL con transición de pincel seco entre láminas: el frente avanza en la
// dirección del barrido con trazos alargados (como las «rayas» del acabado de
// las láminas), deja asomar el fondo noche entre las cerdas y arrastra tiza
// clara en el borde húmedo.  Sin WebGL, dos capas DOM con un barrido suave.

import { lamSrc } from './data.js';

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec2 uRes;
uniform vec2 uSizeA;
uniform vec2 uSizeB;
uniform vec3 uFrameA;
uniform vec3 uFrameB;
uniform vec2 uShift;
uniform float uP;
uniform vec2 uDir;
uniform float uDim;
uniform float uSeed;

const vec3 NOCHE = vec3(0.1333, 0.1412, 0.1882);
const vec3 LANA = vec3(0.9373, 0.9020, 0.8235);

vec2 cover(vec2 uv, vec2 img, vec3 fr) {
  float rs = uRes.x / uRes.y;
  float ri = img.x / img.y;
  vec2 s = rs > ri ? vec2(1.0, ri / rs) : vec2(rs / ri, 1.0);
  s /= fr.z;
  vec2 o = clamp(fr.xy - s * 0.5 + uShift * s, vec2(0.0), vec2(1.0) - s);
  return o + uv * s;
}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec3 a = texture2D(uTexA, cover(uv, uSizeA, uFrameA)).rgb;
  vec3 col = a;
  if (uP > 0.0001) {
    vec2 P = vec2(uv.x * aspect, uv.y);
    vec2 d = normalize(uDir);
    vec2 n = vec2(-d.y, d.x);
    float along = dot(P, d);
    float across = dot(P, n) + along * 0.16;            // ~9°, como las rayas del acabado
    float streak = fbm(vec2(along * 1.6 + uSeed, across * 26.0));
    float fine = vnoise(vec2(along * 5.0, across * 90.0 + uSeed));
    float big = fbm(P * 1.8 + uSeed * 0.37);
    vec2 c = vec2(aspect * 0.5, 0.5);
    float ext = abs(d.x) * aspect * 0.5 + abs(d.y) * 0.5;
    float sweep = dot(P - c, d) / (2.0 * ext) + 0.5;
    float m = sweep * 0.70 + (streak - 0.5) * 0.30 + (fine - 0.5) * 0.06 + (big - 0.5) * 0.12 + 0.15;
    float t = mix(-0.08, 1.10, uP);
    float w = 0.022;
    float reveal = 1.0 - smoothstep(t - w, t + w, m);
    float band = smoothstep(t - 0.10, t - 0.005, m) * reveal;   // borde húmedo
    vec2 disp = d * vec2(1.0 / aspect, 1.0) * (streak - 0.5) * 0.022 * band;
    vec3 b = texture2D(uTexB, cover(uv - disp, uSizeB, uFrameB)).rgb;
    col = mix(a, b, reveal);
    float tooth = vnoise(gl_FragCoord.xy * 0.55);
    float gaps = smoothstep(0.50, 0.80, fine * 0.6 + tooth * 0.5) * band;
    col = mix(col, NOCHE, gaps * 0.85);
    float chalk = smoothstep(0.62, 0.86, streak + (fine - 0.5) * 0.3) * band;
    col = mix(col, mix(col, LANA, 0.75), chalk * 0.6);
  }
  vec2 q = uv - 0.5;
  float vig = smoothstep(0.35, 0.95, length(q * vec2(aspect * 0.62, 1.0)) * 1.15);
  col = mix(col, NOCHE, clamp(uDim + vig * 0.26 * (1.0 - uDim), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

const SIZES = { mapa: [2000, 2121] };
const DEFAULT_SIZE = [3600, 2400];

export class Stage {
  constructor(canvas, fallback) {
    this.canvas = canvas;
    this.fallback = fallback;
    this.big = Math.min(window.innerWidth, 2600) * Math.min(window.devicePixelRatio || 1, 2) > 1500;
    this.images = new Map();     // id -> Promise<HTMLImageElement>
    this.img = new Map();        // id -> HTMLImageElement decodificada
    this.ready = new Set();      // ids decodificadas
    this.tex = new Map();        // id -> WebGLTexture (LRU)
    this.state = null;
    this.dirty = true;
    this.seed = Math.random() * 10;
    this.gl = null;
    try { this._initGL(); } catch (e) { this.gl = null; }
    if (!this.gl) {
      document.documentElement.classList.add('no-webgl');
      this.fa = fallback.querySelector('.stage-fallback__a');
      this.fb = fallback.querySelector('.stage-fallback__b');
    }
    this.resize();
    window.addEventListener('resize', () => { this.resize(); this.dirty = true; }, { passive: true });
  }

  get webgl() { return !!this.gl; }

  _initGL() {
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    let gl = this.canvas.getContext('webgl2', opts);
    this.isGL2 = !!gl;
    if (!gl) gl = this.canvas.getContext('webgl', opts) || this.canvas.getContext('experimental-webgl', opts);
    if (!gl) return;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uTexA', 'uTexB', 'uRes', 'uSizeA', 'uSizeB', 'uFrameA', 'uFrameB', 'uShift', 'uP', 'uDir', 'uDim', 'uSeed']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    gl.uniform1i(this.u.uTexA, 0);
    gl.uniform1i(this.u.uTexB, 1);
    // textura de espera: un píxel de noche
    this.blank = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([34, 36, 48, 255]));
    this.gl = gl;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; }, false);
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.tex.clear(); try { this._initGL(); } catch (_) {} this.dirty = true; }, false);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(Math.max(window.innerHeight, document.documentElement.clientHeight) * dpr);
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    if (this.gl && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  size(id) { return SIZES[id] || DEFAULT_SIZE; }

  load(id) {
    if (this.images.has(id)) return this.images.get(id);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = lamSrc(id, this.big ? 2400 : 1280);
      const done = () => { this.img.set(id, img); this.ready.add(id); this.dirty = true; resolve(img); };
      (img.decode ? img.decode() : Promise.reject()).then(done).catch(() => {
        if (img.complete && img.naturalWidth) done();
        else { img.onload = done; img.onerror = () => resolve(null); }
      });
    });
    this.images.set(id, p);
    return p;
  }

  _texture(id) {
    const gl = this.gl;
    if (this.tex.has(id)) {
      const t = this.tex.get(id);
      this.tex.delete(id); this.tex.set(id, t);          // LRU
      return t;
    }
    const img = this.img.get(id);
    if (!img) { this.load(id); return null; }
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    if (this.isGL2) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tex.set(id, t);
    while (this.tex.size > 5) {                            // memoria de GPU acotada
      const [old, ot] = this.tex.entries().next().value;
      if (old === this.state?.a?.id || old === this.state?.b?.id) break;
      gl.deleteTexture(ot);
      this.tex.delete(old);
    }
    return t;
  }

  isReady(id) { return this.ready.has(id); }

  /** estado: { a:{id,fx,fy,zoom}, b:{...}|null, p, dir:[x,y], dim, shift:[x,y] } */
  set(state) {
    this.state = state;
    this.dirty = true;
  }

  /** parámetros de encuadre «cover» en fracciones de la imagen */
  cover(id, fr) {
    const [iw, ih] = this.size(id);
    const rs = this.cssW / this.cssH, ri = iw / ih;
    let sx = 1, sy = 1;
    if (rs > ri) sy = ri / rs; else sx = rs / ri;
    sx /= fr.zoom; sy /= fr.zoom;
    const sh = this.state?.shift || [0, 0];
    const ox = Math.min(Math.max(fr.fx - sx / 2 + sh[0] * sx, 0), 1 - sx);
    const oy = Math.min(Math.max(fr.fy - sy / 2 + sh[1] * sy, 0), 1 - sy);
    return { ox, oy, sx, sy };
  }

  /** de coordenadas de la imagen (0-1) a píxeles CSS de la pantalla */
  toScreen(id, fr, u, v) {
    const c = this.cover(id, fr);
    return [(u - c.ox) / c.sx * this.cssW, (v - c.oy) / c.sy * this.cssH];
  }

  render() {
    if (!this.dirty || !this.state) return;
    this.dirty = false;
    const s = this.state;
    if (!this.gl) return this._renderDOM(s);
    if (this.lost) return;
    const gl = this.gl;
    const ta = this._texture(s.a.id);
    const tb = s.b ? this._texture(s.b.id) : null;
    // si la de destino no está lista, se queda la de origen; si ninguna, noche
    const A = ta ? s.a : (tb ? s.b : s.a);
    const texA = ta || tb || this.blank;
    const useB = !!(ta && tb && s.p > 0.0001);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, useB ? tb : texA);
    const [aw, ah] = this.size(A.id);
    const [bw, bh] = useB ? this.size(s.b.id) : [aw, ah];
    const B = useB ? s.b : A;
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u.uSizeA, aw, ah);
    gl.uniform2f(this.u.uSizeB, bw, bh);
    gl.uniform3f(this.u.uFrameA, A.fx, A.fy, A.zoom);
    gl.uniform3f(this.u.uFrameB, B.fx, B.fy, B.zoom);
    gl.uniform2f(this.u.uShift, s.shift[0], s.shift[1]);
    gl.uniform1f(this.u.uP, useB ? s.p : 0);
    gl.uniform2f(this.u.uDir, s.dir[0], s.dir[1]);
    gl.uniform1f(this.u.uDim, ta || tb ? s.dim : 0);
    gl.uniform1f(this.u.uSeed, this.seed + (s.seed || 0));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!ta || (s.b && !tb)) this.dirty = true;            // volver a intentar cuando cargue
  }

  _renderDOM(s) {
    const set = (el, fr, op, mask) => {
      if (!fr) { el.style.opacity = 0; return; }
      const url = `url("${lamSrc(fr.id, this.big ? 2400 : 1280)}")`;
      if (el._url !== url) { el.style.backgroundImage = url; el._url = url; }
      el.style.backgroundPosition = `${fr.fx * 100}% ${fr.fy * 100}%`;
      el.style.transformOrigin = `${fr.fx * 100}% ${fr.fy * 100}%`;
      el.style.transform = `scale(${fr.zoom})`;
      el.style.opacity = op;
      el.style.webkitMaskImage = el.style.maskImage = mask || 'none';
    };
    this.fallback.style.setProperty('--dim', s.dim);
    set(this.fa, s.a, 1);
    if (s.b && s.p > 0) {
      const ang = Math.atan2(s.dir[1], s.dir[0]) * 180 / Math.PI + 90;
      const t = s.p * 130 - 15;
      set(this.fb, s.b, 1, `linear-gradient(${ang}deg, #000 ${t - 15}%, transparent ${t + 15}%)`);
    } else {
      set(this.fb, null, 0);
    }
  }
}
