/**
 * Posprocesado: acumulación progresiva (antialiasing por muestreo con fluctuación subpíxel),
 * exposición, mapeo tonal, mapas de color y efectos de presentación.
 *
 * Clasificación (docs/LIMITACIONES.md): la acumulación y el haz gaussiano del perfil EHT son
 * procesamiento de imagen con significado físico (promedio de píxel, resolución instrumental);
 * el mapeo tonal, el bloom y la paleta cinematográfica son decisiones estéticas declaradas.
 */
import * as THREE from 'three';

const VS = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const ACCUM_FS = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform sampler2D uCur;
uniform float uWeight;
out vec4 outColor;
void main() {
  vec4 a = texture(uPrev, vUv);
  vec4 b = texture(uCur, vUv);
  outColor = mix(a, b, uWeight);
}
`;

const BLUR_FS = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uDir;      // paso de un texel en la dirección del desenfoque
uniform float uSigma;   // en texels
out vec4 outColor;
void main() {
  if (uSigma < 0.3) { outColor = texture(uSrc, vUv); return; }
  int R = int(min(ceil(3.0 * uSigma), 48.0));
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -48; i <= 48; i++) {
    if (i < -R || i > R) continue;
    float w = exp(-0.5 * float(i * i) / (uSigma * uSigma));
    acc += w * texture(uSrc, vUv + uDir * float(i));
    wsum += w;
  }
  outColor = acc / wsum;
}
`;

const BRIGHT_FS = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform float uExposure;
uniform float uThreshold;
out vec4 outColor;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * uExposure;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(l - uThreshold, 0.0) / max(l, 1e-6);
  outColor = vec4(c * k, 1.0);
}
`;

const FINAL_FS = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uBloom;
uniform int uProfile;      // 0 cinematográfico, 1 EHT, 2 espacio-tiempo
uniform float uExposure;
uniform float uBloomGain;
uniform float uEhtMax;     // normalización lineal del perfil EHT
uniform float uWhite;      // luminancia de referencia del blanco (perfil cinematográfico)
uniform float uContrast;   // compresión logarítmica (perfil cinematográfico)
uniform float uFrame;
uniform vec2 uViewport;
out vec4 outColor;

vec3 acesFitted(vec3 x) {
  // ACES (aproximación de Narkowicz 2015)
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 afmhot(float t) {
  t = clamp(t, 0.0, 1.0);
  return clamp(vec3(2.0 * t, 2.0 * t - 0.5, 2.0 * t - 1.0), 0.0, 1.0);
}

vec3 srgbEncode(vec3 c) {
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float dither(vec2 p) {
  return fract(52.9829189 * fract(dot(p + uFrame * 7.13, vec2(0.06711056, 0.00583715)))) - 0.5;
}

void main() {
  vec4 s = texture(uSrc, vUv);
  vec3 col;
  if (uProfile == 1) {
    // Intensidad lineal normalizada al máximo de la imagen (convención de las imágenes del EHT)
    col = afmhot(s.r / max(uEhtMax, 1e-30));
    col = srgbEncode(col);
  } else if (uProfile == 0) {
    // Mapeo tonal logarítmico sobre la luminancia (conserva el tono): muestra a la vez el anillo
    // brillante y el flujo exterior tenue. Decisión estética declarada (no cambia la física).
    vec3 hdr = s.rgb * uExposure + texture(uBloom, vUv).rgb * uBloomGain;
    float L = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
    float Lw = max(uWhite * uExposure, 1e-12);
    float k = uContrast / Lw;
    float Lo = log(1.0 + k * L) / log(1.0 + uContrast);
    vec3 c = hdr * (Lo / max(L, 1e-12));
    // Hombro suave: los colores muy brillantes tienden al blanco cálido sin recorte duro
    float over = max(max(c.r, c.g), c.b);
    c = mix(c, vec3(over), smoothstep(0.85, 1.6, over) * 0.35);
    col = srgbEncode(acesFitted(c * 1.15));
  } else {
    vec3 hdr = s.rgb * uExposure + texture(uBloom, vUv).rgb * uBloomGain;
    col = srgbEncode(acesFitted(hdr));
  }
  col += dither(gl_FragCoord.xy) / 255.0;
  outColor = vec4(col, 1.0);
}
`;

function makeMat(fs: string, uniforms: Record<string, THREE.IUniform>): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VS,
    fragmentShader: fs,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

export interface PostSettings {
  profile: 0 | 1 | 2;
  exposure: number;
  bloom: number;
  ehtMax: number;
  /** Sigma del haz gaussiano en píxeles de la imagen de trazado (0 = sin haz). */
  beamSigmaPx: number;
  /** Luminancia que se asigna al blanco (sin exposición) y compresión logarítmica. */
  white?: number;
  contrast?: number;
}

export class Post {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.Camera();
  private readonly quad: THREE.Mesh;
  private readonly accumMat: THREE.RawShaderMaterial;
  private readonly blurMat: THREE.RawShaderMaterial;
  private readonly brightMat: THREE.RawShaderMaterial;
  private readonly finalMat: THREE.RawShaderMaterial;
  accum: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  trace: THREE.WebGLRenderTarget;
  private blurA: THREE.WebGLRenderTarget;
  private blurB: THREE.WebGLRenderTarget;
  private bloomA: THREE.WebGLRenderTarget;
  private bloomB: THREE.WebGLRenderTarget;
  private stats: THREE.WebGLRenderTarget;
  private readonly statsW = 64;
  private readonly statsH = 36;
  private ping = 0;
  samples = 0;
  width = 1;
  height = 1;
  readonly floatType: THREE.TextureDataType;

  constructor(renderer: THREE.WebGLRenderer) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    this.floatType = gl.getExtension('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.accumMat = makeMat(ACCUM_FS, { uPrev: { value: null }, uCur: { value: null }, uWeight: { value: 1 } });
    this.blurMat = makeMat(BLUR_FS, { uSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uSigma: { value: 0 } });
    this.brightMat = makeMat(BRIGHT_FS, { uSrc: { value: null }, uExposure: { value: 1 }, uThreshold: { value: 0.8 } });
    this.finalMat = makeMat(FINAL_FS, {
      uSrc: { value: null },
      uBloom: { value: null },
      uProfile: { value: 0 },
      uExposure: { value: 1 },
      uBloomGain: { value: 0 },
      uEhtMax: { value: 1 },
      uWhite: { value: 1 },
      uContrast: { value: 40 },
      uFrame: { value: 0 },
      uViewport: { value: new THREE.Vector2() },
    });
    this.quad = new THREE.Mesh(geo, this.accumMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const mk = (w: number, h: number, filter: THREE.MagnificationTextureFilter = THREE.LinearFilter) =>
      new THREE.WebGLRenderTarget(w, h, { type: this.floatType, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, depthBuffer: false, stencilBuffer: false });
    this.accum = [mk(1, 1), mk(1, 1)];
    this.trace = mk(1, 1, THREE.NearestFilter);
    this.blurA = mk(1, 1);
    this.blurB = mk(1, 1);
    this.bloomA = mk(1, 1);
    this.bloomB = mk(1, 1);
    this.stats = mk(this.statsW, this.statsH);
  }

  setSize(w: number, h: number): void {
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    for (const t of [...this.accum, this.trace, this.blurA, this.blurB]) t.setSize(w, h);
    const bw = Math.max(1, Math.round(w / 4));
    const bh = Math.max(1, Math.round(h / 4));
    this.bloomA.setSize(bw, bh);
    this.bloomB.setSize(bw, bh);
    this.samples = 0;
  }

  resetAccumulation(): void {
    this.samples = 0;
  }

  get current(): THREE.WebGLRenderTarget {
    return this.accum[this.ping];
  }

  private pass(renderer: THREE.WebGLRenderer, mat: THREE.RawShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  /**
   * Incorpora la muestra recién trazada (this.trace). maxSamples: tope de la acumulación
   * progresiva; ema > 0 fuerza una media móvil exponencial (escena que cambia con el tiempo).
   */
  accumulate(renderer: THREE.WebGLRenderer, maxSamples: number, ema: number): void {
    const prev = this.accum[this.ping];
    const next = this.accum[1 - this.ping];
    let w: number;
    if (this.samples === 0) w = 1;
    else if (ema > 0) w = ema;
    else w = 1 / Math.min(this.samples + 1, maxSamples);
    this.accumMat.uniforms.uPrev.value = prev.texture;
    this.accumMat.uniforms.uCur.value = this.trace.texture;
    this.accumMat.uniforms.uWeight.value = w;
    this.pass(renderer, this.accumMat, next);
    this.ping = 1 - this.ping;
    this.samples++;
  }

  private blur(renderer: THREE.WebGLRenderer, src: THREE.WebGLRenderTarget, a: THREE.WebGLRenderTarget, b: THREE.WebGLRenderTarget, sigma: number): THREE.WebGLRenderTarget {
    const u = this.blurMat.uniforms;
    u.uSigma.value = sigma;
    u.uSrc.value = src.texture;
    u.uDir.value.set(1 / src.width, 0);
    this.pass(renderer, this.blurMat, a);
    u.uSrc.value = a.texture;
    u.uDir.value.set(0, 1 / a.height);
    this.pass(renderer, this.blurMat, b);
    return b;
  }

  /** Imagen fuente para el compuesto final (con el haz del EHT si procede). */
  source(renderer: THREE.WebGLRenderer, s: PostSettings): THREE.WebGLRenderTarget {
    if (s.profile === 1 && s.beamSigmaPx > 0.3) return this.blur(renderer, this.current, this.blurA, this.blurB, s.beamSigmaPx);
    return this.current;
  }

  /** Lectura reducida para la exposición automática y la normalización EHT. */
  readStats(renderer: THREE.WebGLRenderer, src: THREE.WebGLRenderTarget): Float32Array {
    this.accumMat.uniforms.uPrev.value = src.texture;
    this.accumMat.uniforms.uCur.value = src.texture;
    this.accumMat.uniforms.uWeight.value = 0;
    this.pass(renderer, this.accumMat, this.stats);
    const out = new Float32Array(this.statsW * this.statsH * 4);
    renderer.readRenderTargetPixels(this.stats, 0, 0, this.statsW, this.statsH, out);
    return out;
  }

  composite(renderer: THREE.WebGLRenderer, src: THREE.WebGLRenderTarget, s: PostSettings, frame: number, target: THREE.WebGLRenderTarget | null = null): void {
    let bloomTex: THREE.Texture | null = null;
    if (s.profile !== 1 && s.bloom > 0) {
      this.brightMat.uniforms.uSrc.value = src.texture;
      this.brightMat.uniforms.uExposure.value = s.exposure;
      this.pass(renderer, this.brightMat, this.bloomA);
      const b = this.blur(renderer, this.bloomA, this.bloomB, this.bloomA, 6);
      bloomTex = b.texture;
    }
    const u = this.finalMat.uniforms;
    u.uSrc.value = src.texture;
    u.uBloom.value = bloomTex ?? src.texture;
    u.uBloomGain.value = bloomTex ? s.bloom : 0;
    u.uProfile.value = s.profile;
    u.uExposure.value = s.exposure;
    u.uEhtMax.value = s.ehtMax;
    u.uWhite.value = s.white ?? 1;
    u.uContrast.value = s.contrast ?? 40;
    u.uFrame.value = frame % 64;
    this.pass(renderer, this.finalMat, target);
  }

  dispose(): void {
    for (const t of [...this.accum, this.trace, this.blurA, this.blurB, this.bloomA, this.bloomB, this.stats]) t.dispose();
    for (const m of [this.accumMat, this.blurMat, this.brightMat, this.finalMat]) m.dispose();
  }
}
