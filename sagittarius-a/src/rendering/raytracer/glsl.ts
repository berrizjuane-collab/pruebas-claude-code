/**
 * Código GLSL ES 3.00 del trazador relativista. Reproduce en precisión simple las mismas
 * ecuaciones que el núcleo físico en TypeScript (physics/metrics/kerrSchild.ts,
 * physics/emission/*.ts), que actúa como referencia para validarlo (scripts/validar-gpu.mjs).
 */

export const GLSL_HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

/** Geometría de Kerr–Schild y ecuaciones de Hamilton (ver physics/metrics/kerrSchild.ts). */
export const GLSL_KERR = /* glsl */ `
uniform float uSpin;
uniform float uRPlus;

float ksRadius(vec3 p) {
  float a2 = uSpin * uSpin;
  float b = dot(p, p) - a2;
  float disc = sqrt(b * b + 4.0 * a2 * p.z * p.z);
  float r2 = b >= 0.0 ? 0.5 * (b + disc) : 2.0 * a2 * p.z * p.z / max(disc - b, 1e-30);
  return sqrt(max(r2, 1e-12));
}

// dx = (dt, dx, dy, dz)/dλ ; dp = d(p_x, p_y, p_z)/dλ  (p = (p_t, p_x, p_y, p_z), p_t constante)
void ksRHS(vec3 x, vec4 p, out vec4 dx, out vec3 dp) {
  float a = uSpin;
  float a2 = a * a;
  float r = ksRadius(x);
  float r2 = r * r;
  float z = x.z;
  float D = r2 * r2 + a2 * z * z;
  float S = r2 + a2;
  float f = 2.0 * r2 * r / D;
  vec3 l = vec3((r * x.x + a * x.y) / S, (r * x.y - a * x.x) / S, z / r);
  float L = -p.x + dot(l, p.yzw);
  float fL = f * L;
  dx = vec4(-p.x + fL, p.yzw - fL * l);
  float r3D = r2 * r / D;
  vec3 dr = vec3(r3D * x.x, r3D * x.y, r * S * z / D);
  float c1 = 3.0 * a2 * z * z - r2 * r2;
  vec3 df = (2.0 * r2 / (D * D)) * (dr * c1 - vec3(0.0, 0.0, 2.0 * a2 * r * z));
  float nx = r * x.x + a * x.y;
  float ny = r * x.y - a * x.x;
  float S2 = S * S;
  vec3 tx = ((dr * x.x + vec3(r, a, 0.0)) * S - nx * 2.0 * r * dr) / S2;
  vec3 ty = ((dr * x.y + vec3(-a, r, 0.0)) * S - ny * 2.0 * r * dr) / S2;
  vec3 tz = (vec3(0.0, 0.0, r) - z * dr) / r2;
  vec3 dlp = tx * p.y + ty * p.z + tz * p.w;
  dp = L * (0.5 * df * L + f * dlp);
}

// Baja un índice: v_μ = g_μν v^ν con g = η + f l l
vec4 ksLower(vec3 x, vec4 v) {
  float a = uSpin;
  float r = ksRadius(x);
  float r2 = r * r;
  float S = r2 + a * a;
  float f = 2.0 * r2 * r / (r2 * r2 + a * a * x.z * x.z);
  vec3 l = vec3((r * x.x + a * x.y) / S, (r * x.y - a * x.x) / S, x.z / r);
  float lv = v.x + dot(l, v.yzw);
  return vec4(-v.x + f * lv, v.yzw + f * lv * l);
}

// Sube un índice: v^μ = g^μν v_ν con g^-1 = η − f l^μ l^ν, l^t = −1
vec4 ksRaise(vec3 x, vec4 w) {
  float a = uSpin;
  float r = ksRadius(x);
  float r2 = r * r;
  float S = r2 + a * a;
  float f = 2.0 * r2 * r / (r2 * r2 + a * a * x.z * x.z);
  vec3 l = vec3((r * x.x + a * x.y) / S, (r * x.y - a * x.x) / S, x.z / r);
  float lw = -w.x + dot(l, w.yzw);
  return vec4(-w.x + f * lw, w.yzw - f * lw * l);
}

float ksDot(vec3 x, vec4 u, vec4 v) {
  return dot(ksLower(x, u), v);
}
`;

/** Emisión: perfiles RIAF, cinemática y sincrotrón térmico (ver physics/emission). */
export const GLSL_EMISSION = /* glsl */ `
uniform float uNe0;
uniform float uTe0;
uniform float uBeta;
uniform float uH;
uniform float uKappa;
uniform float uROut;
uniform float uRIsco;
uniform float uDeltaIsco;
uniform float uEIsco;
uniform float uLIsco;
uniform float uTurb;
uniform int uSeed;
uniform vec4 uHotspot;   // amplitud, radio, tamaño, fase inicial
uniform float uOmegaHs;
uniform float uRgCm;

const float PI = 3.14159265358979;
const float C_CGS = 2.99792458e10;
const float E_CGS = 4.80320471e-10;
const float ME_CGS = 9.1093837e-28;
const float MP_CGS = 1.67262192e-24;
const float H_CGS = 6.62607015e-27;
const float KB_CGS = 1.380649e-16;
const float TURB_PERIOD = 150.0;

uint hash3u(ivec3 i, int seed) {
  uint h = (uint(i.x) * 0x8da6b343u) ^ (uint(i.y) * 0xd8163841u) ^ (uint(i.z) * 0xcb1ab31fu) ^ (uint(seed) * 0x165667b1u);
  h = (h ^ (h >> 15u)) * 0x2c1b3c6du;
  h = (h ^ (h >> 12u)) * 0x297a2d39u;
  h = h ^ (h >> 15u);
  return h;
}
float hash3(ivec3 i, int seed) { return float(hash3u(i, seed)) * (1.0 / 4294967296.0); }

float valueNoise3(vec3 p, int seed) {
  vec3 fl = floor(p);
  ivec3 i = ivec3(fl);
  vec3 f = p - fl;
  vec3 s = f * f * (3.0 - 2.0 * f);
  float v000 = hash3(i, seed);
  float v100 = hash3(i + ivec3(1, 0, 0), seed);
  float v010 = hash3(i + ivec3(0, 1, 0), seed);
  float v110 = hash3(i + ivec3(1, 1, 0), seed);
  float v001 = hash3(i + ivec3(0, 0, 1), seed);
  float v101 = hash3(i + ivec3(1, 0, 1), seed);
  float v011 = hash3(i + ivec3(0, 1, 1), seed);
  float v111 = hash3(i + ivec3(1, 1, 1), seed);
  float x00 = mix(v000, v100, s.x);
  float x10 = mix(v010, v110, s.x);
  float x01 = mix(v001, v101, s.x);
  float x11 = mix(v011, v111, s.x);
  return mix(mix(x00, x10, s.y), mix(x01, x11, s.y), s.z);
}

float keplerOmega(float r) {
  return 1.0 / (r * sqrt(r) + uSpin);
}

float turbulenceFactor(float r, float st, float ct, float phi, float t) {
  if (uTurb <= 0.0) return 1.0;
  float om = uKappa * keplerOmega(max(r, uRIsco));
  float S = 2.5 * log(max(r, 0.5)) + 2.0;
  float acc = 0.0;
  for (int k = 0; k < 2; k++) {
    float tk = t + float(k) * TURB_PERIOD * 0.5;
    float cyc = floor(tk / TURB_PERIOD);
    float ph = tk - cyc * TURB_PERIOD;
    float w = 1.0 - abs(2.0 * ph / TURB_PERIOD - 1.0);
    float pc = phi - om * ph;
    vec3 P = vec3(S * st * cos(pc) + 31.7 * cyc + 57.0 * float(k), S * st * sin(pc), S * ct);
    float n = valueNoise3(P, uSeed) + 0.5 * valueNoise3(vec3(2.0 * P.x + 19.1, 2.0 * P.y, 2.0 * P.z), uSeed + 1);
    acc += w * (n / 1.5 - 0.5) * 3.46;
  }
  return exp(uTurb * acc - 0.5 * uTurb * uTurb);
}

// Raíz regular en el horizonte de u_r (KS) para (u_t, u_θ = 0, u_φ) dados (physics/metrics/coordinates.ts)
float regularUr(float r, float st, float ct, float ut, float uph, out bool ok) {
  float a = uSpin;
  float S = r * r + a * a * ct * ct;
  float D = r * r - 2.0 * r + a * a;
  float B = 2.0 * r * ut + a * uph;
  float C = S - (S + 2.0 * r) * ut * ut + uph * uph / max(st * st, 1e-12);
  float disc = B * B - D * C;
  ok = disc >= 0.0;
  return C / (sqrt(max(disc, 0.0)) - B);
}

// 4-velocidad del fluido (contravariante, KS cartesianas)
vec4 fluidVelocity(vec3 x, float r, float st, float ct) {
  float a = uSpin;
  float s = smoothstep(uRIsco + uDeltaIsco, uRIsco - uDeltaIsco, r);
  vec4 uOut = vec4(0.0);
  bool hasOut = false;
  if (s < 1.0) {
    float om = uKappa * keplerOmega(max(r, uRIsco - uDeltaIsco));
    vec4 v = vec4(1.0, -om * x.y, om * x.x, 0.0);
    float n2 = ksDot(x, v, v);
    if (n2 < -1e-6) {
      uOut = v / sqrt(-n2);
      hasOut = true;
    }
  }
  vec4 uIn = vec4(0.0);
  if (s > 0.0 || !hasOut) {
    float ut = -uEIsco;
    float L = uKappa * uLIsco * st * st;
    bool ok;
    float ur = regularUr(r, st, ct, ut, L, ok);
    if (!ok) {
      ut = -1.0;
      L = 0.0;
      ur = regularUr(r, st, ct, -1.0, 0.0, ok);
    }
    // gradientes de r y φ̃ (coordinates.ts: spheroidalGradients)
    float r2 = r * r;
    float Dd = r2 * r2 + a * a * x.z * x.z;
    float Sr = r2 + a * a;
    vec3 dr = vec3(r2 * r * x.x / Dd, r2 * r * x.y / Dd, r * Sr * x.z / Dd);
    float rc2 = max(x.x * x.x + x.y * x.y, 1e-12);
    vec3 dph = vec3(-x.y / rc2, x.x / rc2, 0.0) + (a / Sr) * dr;
    vec4 w = vec4(ut, ur * dr + L * dph);
    uIn = ksRaise(x, w);
    if (!hasOut) return uIn;
  }
  if (s <= 0.0) return uOut;
  vec4 v = mix(uOut, uIn, s);
  float n2 = ksDot(x, v, v);
  return v / sqrt(max(-n2, 1e-12));
}

float besselK0(float x) {
  if (x <= 2.0) {
    float t = (x / 3.75) * (x / 3.75);
    float i0 = 1.0 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813)))));
    float y = x * x / 4.0;
    return -log(x / 2.0) * i0 + (-0.57721566 + y * (0.4227842 + y * (0.23069756 + y * (0.0348859 + y * (0.00262698 + y * (0.0001075 + y * 0.0000074))))));
  }
  float y = 2.0 / x;
  return exp(-x) / sqrt(x) * (1.25331414 + y * (-0.07832358 + y * (0.02189568 + y * (-0.01062446 + y * (0.00587872 + y * (-0.0025154 + y * 0.00053208))))));
}

float besselK1(float x) {
  if (x <= 2.0) {
    float t = (x / 3.75) * (x / 3.75);
    float i1 = x * (0.5 + t * (0.87890594 + t * (0.51498869 + t * (0.15084934 + t * (0.02658733 + t * (0.00301532 + t * 0.00032411))))));
    float y = x * x / 4.0;
    return log(x / 2.0) * i1 + (1.0 / x) * (1.0 + y * (0.15443144 + y * (-0.67278579 + y * (-0.18156897 + y * (-0.01919402 + y * (-0.00110404 + y * -0.00004686))))));
  }
  float y = 2.0 / x;
  return exp(-x) / sqrt(x) * (1.25331414 + y * (0.23498619 + y * (-0.0365562 + y * (0.01504268 + y * (-0.00780353 + y * (0.00325614 + y * -0.00068245))))));
}

float besselK2(float x) { return besselK0(x) + 2.0 / x * besselK1(x); }

float planckNu(float nu, float T) {
  float x = H_CGS * nu / (KB_CGS * T);
  float em1 = x < 1e-3 ? x * (1.0 + x * (0.5 + x / 6.0)) : exp(x) - 1.0;
  return 2.0 * H_CGS * nu * nu * nu / (C_CGS * C_CGS) / em1;
}

// j_ν sincrotrón térmico (Leung, Gammie & Noble 2011) [erg s⁻¹ cm⁻³ Hz⁻¹ sr⁻¹]
float synchJ(float nu, float ne, float th, float B, float sinB, float K2) {
  float nuc = E_CGS * B / (2.0 * PI * ME_CGS * C_CGS);
  float nus = (2.0 / 9.0) * nuc * th * th * max(abs(sinB), 1e-3);
  float X = nu / nus;
  float f = sqrt(X) + 1.887748625 * pow(X, 1.0 / 6.0);
  return ne * 1.414213562 * PI * E_CGS * E_CGS * nus / (3.0 * K2 * C_CGS) * f * f * exp(-pow(X, 1.0 / 3.0));
}

struct Plasma {
  float ne;
  float te;
  float B;
  vec4 u;
  float uPhi;
  float gPhiPhi;
};

bool plasmaState(vec3 x, float t, out Plasma P) {
  float a = uSpin;
  float r = ksRadius(x);
  if (r > uROut * 1.25 || r < 0.05) return false;
  float ct = clamp(x.z / r, -1.0, 1.0);
  float st = sqrt(max(1.0 - ct * ct, 1e-12));
  float cot2 = ct * ct / (st * st);
  float vert = exp(-cot2 / (2.0 * uH * uH));
  if (vert < 1e-8) return false;
  float taper = 1.0 - smoothstep(uROut, uROut * 1.25, r);
  float ne = uNe0 * pow(r, -1.1) * vert * taper;
  if (uHotspot.x > 0.0) {
    float ph = uHotspot.w + uOmegaHs * t;
    vec3 hs = vec3(uHotspot.y * cos(ph) - a * sin(ph), uHotspot.y * sin(ph) + a * cos(ph), 0.0);
    vec3 d = x - hs;
    ne += uHotspot.x * uNe0 * pow(uHotspot.y, -1.1) * exp(-dot(d, d) / (2.0 * uHotspot.z * uHotspot.z));
  }
  float phi = atan(x.y, x.x) - atan(a, r);
  ne *= turbulenceFactor(r, st, ct, phi, t);
  if (ne <= 0.0) return false;
  P.ne = ne;
  P.te = uTe0 * pow(r, -0.84);
  P.B = sqrt(8.0 * PI * ne * MP_CGS * C_CGS * C_CGS / (6.0 * r * uBeta));
  P.u = fluidVelocity(x, r, st, ct);
  vec4 ul = ksLower(x, P.u);
  P.uPhi = x.x * ul.z - x.y * ul.y;
  vec4 xi = vec4(0.0, -x.y, x.x, 0.0);
  P.gPhiPhi = ksDot(x, xi, xi);
  return true;
}
`;

/**
 * Cielo de fondo: estrellas puntuales procedimentales con lente correcta (flujo × magnificación,
 * desplazamiento g⁴ y color de cuerpo negro a T·g), banda galáctica difusa y retícula celeste.
 */
export const GLSL_SKY = /* glsl */ `
uniform float uStarGain;
uniform int uStarSeed;
uniform float uBandGain;
uniform float uGridOn;
uniform vec3 uGalNormal;
uniform sampler2D uBBTex;     // LUT cuerpo negro: rgb normalizado a luminancia 1, a = fracción visible
uniform float uPixelFootprint; // ángulo sólido de un píxel en el marco de la cámara [sr]

const float BB_TMIN = 800.0;
const float BB_TMAX = 60000.0;

vec4 blackbody(float T) {
  float u = log(clamp(T, BB_TMIN, BB_TMAX) / BB_TMIN) / log(BB_TMAX / BB_TMIN);
  vec4 c = texture(uBBTex, vec2(u, 0.5));
  // Más frío que la tabla: la fracción visible cae exponencialmente (cola de Wien)
  if (T < BB_TMIN) c.a *= exp(-(BB_TMIN / max(T, 1.0) - 1.0) * 6.0);
  return c;
}

// Mapa cúbico con corrección de área (tan): dirección → (cara, w ∈ [−1,1]²)
void cubeCoords(vec3 d, out int face, out vec2 w) {
  vec3 ad = abs(d);
  vec2 uv;
  if (ad.x >= ad.y && ad.x >= ad.z) { face = d.x > 0.0 ? 0 : 1; uv = d.yz / ad.x; }
  else if (ad.y >= ad.z) { face = d.y > 0.0 ? 2 : 3; uv = d.xz / ad.y; }
  else { face = d.z > 0.0 ? 4 : 5; uv = d.xy / ad.z; }
  w = atan(uv) * (4.0 / PI);
}

vec3 cubeDir(int face, vec2 w) {
  vec2 uv = tan(w * (PI / 4.0));
  vec3 d;
  if (face == 0) d = vec3(1.0, uv.x, uv.y);
  else if (face == 1) d = vec3(-1.0, uv.x, uv.y);
  else if (face == 2) d = vec3(uv.x, 1.0, uv.y);
  else if (face == 3) d = vec3(uv.x, -1.0, uv.y);
  else if (face == 4) d = vec3(uv.x, uv.y, 1.0);
  else d = vec3(uv.x, uv.y, -1.0);
  return normalize(d);
}

float starDensity(vec3 d) {
  float b = dot(d, uGalNormal);
  return 0.35 + 1.6 * exp(-b * b / 0.035) + 0.5 * exp(-b * b / 0.25);
}

// Temperatura estelar: mezcla de gigantes frías, intermedias y calientes (ilustrativa)
float starTemperature(float u, float v) {
  if (u < 0.68) return 3200.0 + 2200.0 * v;
  if (u < 0.94) return 5200.0 + 4000.0 * v;
  return 10000.0 + 20000.0 * v * v;
}

// Suma de estrellas puntuales de una capa con PSF gaussiana en el plano imagen.
// J1, J2: variación de la dirección de origen por píxel; footprint = |J1 × J2| (sr por píxel en el cielo de origen)
vec3 starLayer(vec3 d, vec3 J1, vec3 J2, float footprint, int N, float prob, float fmin, int layer, float g) {
  int face; vec2 w;
  cubeCoords(d, face, w);
  vec2 cellf = (w * 0.5 + 0.5) * float(N);
  ivec2 c0 = ivec2(floor(cellf));
  float cellAng = (PI / 2.0) / float(N);
  // Gram de J para resolver Δ ≈ J (u, v)
  float a11 = dot(J1, J1), a12 = dot(J1, J2), a22 = dot(J2, J2);
  float det = a11 * a22 - a12 * a12;
  vec3 acc = vec3(0.0);
  if (det <= 0.0) return acc;
  float dens = starDensity(d);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      ivec2 c = c0 + ivec2(i, j);
      if (c.x < 0 || c.y < 0 || c.x >= N || c.y >= N) continue;
      ivec3 key = ivec3(c.x + 4096 * layer, c.y, face);
      float h0 = hash3(key, uStarSeed);
      if (h0 > prob * dens) continue;
      float h1 = hash3(key, uStarSeed + 101);
      float h2 = hash3(key, uStarSeed + 202);
      float h3 = hash3(key, uStarSeed + 303);
      float h4 = hash3(key, uStarSeed + 404);
      float h5 = hash3(key, uStarSeed + 505);
      vec2 ws = ((vec2(c) + vec2(h1, h2)) / float(N)) * 2.0 - 1.0;
      vec3 s = cubeDir(face, ws);
      vec3 delta = s - d;
      float b1 = dot(J1, delta), b2 = dot(J2, delta);
      float u = (a22 * b1 - a12 * b2) / det;
      float v = (a11 * b2 - a12 * b1) / det;
      float r2 = u * u + v * v;
      if (r2 > 9.0) continue;
      float wpsf = exp(-r2 / (2.0 * 0.36)) / (2.0 * PI * 0.36);
      float flux = fmin * pow(max(h3, 1e-4), -0.666);
      float T = starTemperature(h4, h5);
      vec4 bbE = blackbody(T);
      vec4 bbO = blackbody(T * g);
      float lum = flux * g * g * g * g * bbO.a / max(bbE.a, 1e-6);
      acc += bbO.rgb * lum * wpsf / max(footprint, 1e-3 * uPixelFootprint);
    }
  }
  return acc;
}

// Radiancia media de una capa no resuelta (muchas estrellas por huella de píxel)
vec3 starLayerMean(vec3 d, int N, float prob, float fmin, float g) {
  float cellSr = (4.0 * PI) / (6.0 * float(N) * float(N));
  // E[flux] para la ley F = fmin u^(−2/3), u ∈ [1e−4, 1]: fmin·3·(1 − 1e−4^(1/3)) ≈ 2,86 fmin
  float meanFlux = 2.86 * fmin;
  float lumMean = prob * starDensity(d) * meanFlux / cellSr;
  vec4 bb = blackbody(4600.0 * g);
  vec4 bb0 = blackbody(4600.0);
  return bb.rgb * lumMean * g * g * g * g * bb.a / max(bb0.a, 1e-6);
}

vec3 starsAll(vec3 d, vec3 J1, vec3 J2, float footprint, float g) {
  vec3 col = vec3(0.0);
  // Capas: N celdas por lado de cara, probabilidad, flujo mínimo
  const int NL = 3;
  int Ns[3] = int[3](40, 150, 520);
  float probs[3] = float[3](0.5, 0.22, 0.1);
  float fmins[3] = float[3](1.2e-3, 1.2e-4, 1.2e-5);
  for (int k = 0; k < NL; k++) {
    float cellAng = (PI / 2.0) / float(Ns[k]);
    float res = sqrt(footprint) / cellAng;
    float wPoint = 1.0 - smoothstep(0.5, 1.2, res);
    if (wPoint > 0.0) col += wPoint * starLayer(d, J1, J2, footprint, Ns[k], probs[k], fmins[k], k, g);
    if (wPoint < 1.0) col += (1.0 - wPoint) * starLayerMean(d, Ns[k], probs[k], fmins[k], g);
  }
  // Población no resuelta (estrellas más débiles que la última capa): brillo superficial difuso.
  // Se conserva bajo la lente, así que también rellena la curva crítica (anillo de Einstein).
  col += 0.6 * starLayerMean(d, 1800, 0.35, 1.0e-6, g);
  return col * uStarGain;
}

vec3 galacticBand(vec3 d, float g) {
  float b = dot(d, uGalNormal);
  float band = exp(-b * b / 0.012) * 0.9 + exp(-b * b / 0.08) * 0.35;
  // Nubes de polvo y grumos (ilustrativo)
  float n = valueNoise3(d * 7.0, uStarSeed + 7) * 0.65 + valueNoise3(d * 19.0, uStarSeed + 9) * 0.35;
  float dust = smoothstep(0.35, 0.75, valueNoise3(d * 11.0 + 3.0, uStarSeed + 11));
  float bright = band * (0.55 + 0.9 * n) * (1.0 - 0.7 * dust * exp(-b * b / 0.01));
  vec4 bb = blackbody(4300.0 * g);
  vec4 bb0 = blackbody(4300.0);
  return bb.rgb * bright * g * g * g * g * bb.a / max(bb0.a, 1e-6) * uBandGain;
}

// Retícula celeste (θ, φ respecto del eje de espín) antialiasada con derivadas de pantalla
float celestialGrid(vec3 d) {
  float th = acos(clamp(d.z, -1.0, 1.0));
  float ph = atan(d.y, d.x);
  float fth = th / (PI / 12.0);
  float fph = ph / (PI / 12.0);
  float wth = fwidth(fth);
  float wph = fwidth(fph);
  float lth = 1.0 - smoothstep(0.0, 1.5 * wth, abs(fract(fth + 0.5) - 0.5));
  float lph = 1.0 - smoothstep(0.0, 1.5 * wph, abs(fract(fph + 0.5) - 0.5));
  // Evita el ruido donde la huella es mayor que la separación de líneas
  float fade = 1.0 - smoothstep(0.25, 0.6, max(wth, wph));
  return max(lth, lph) * fade;
}
`;
