/**
 * Balizas de los objetos arrojados, vistas a través de la geometría curva y con TIEMPO RETARDADO.
 *
 * Cada baliza es una esfera emisora de radio visual R (ampliada respecto del objeto real e
 * indicada en la interfaz) centrada en la posición del objeto en el instante coordenado t del
 * propio paso del rayo: así la imagen corresponde a la luz emitida en el pasado, con el
 * desplazamiento g = ν_obs/ν_emit = 1/(q·u_emit) evaluado con la 4-velocidad del objeto.
 * El cuerpo negro de la baliza (T_emit) se observa a T·g con brillo ∝ g⁴ (bolométrico).
 * Un impacto solo cuenta si el centro del objeto está fuera del horizonte en ese instante (o si
 * la cámara está dentro): la esfera ampliada no puede «asomar» luz que no existe.
 *
 * Textura uMarkerTex (RGBA32F), columna = índice global de muestra mod W:
 *   fila 2m   → (x, y, z, τ)   fila 2m+1 → (uᵗ, uˣ, uʸ, uᶻ)
 * Textura uMarkerMeta (RGBA32F, 2 × MAX_MARKERS):
 *   texel (0, m) = A: (t de la muestra global 0 − t_cámara, Δt, índice global mínimo, máximo)
 *   texel (1, m) = B: (radio visual, T_emisión [K], periodo de parpadeo en τ (0 = fijo), brillo)
 * Uniforme uMkBound[m]: esfera envolvente de la baliza en la ventana temporal visible.
 */
export const MAX_MARKERS = 64;
export const MARKER_TEX_WIDTH = 1024;

export const GLSL_MARKERS = /* glsl */ `
#define MAX_MARKERS ${MAX_MARKERS}
#define MARKER_W ${MARKER_TEX_WIDTH}
uniform float uCamT;
uniform int uMarkerCount;
uniform sampler2D uMarkerTex;
uniform sampler2D uMarkerMeta;
uniform vec4 uMkBound[MAX_MARKERS];
uniform float uCamInside;

vec4 mkFetch(int row, float gIdx) {
  int col = int(mod(gIdx, float(MARKER_W)));
  return texelFetch(uMarkerTex, ivec2(col, row), 0);
}

// Estado interpolado del marcador m en el tiempo relativo tRel (= t − t_cámara). false si fuera de rango.
vec4 mkA(int m) { return texelFetch(uMarkerMeta, ivec2(0, m), 0); }
vec4 mkB(int m) { return texelFetch(uMarkerMeta, ivec2(1, m), 0); }

bool markerState(int m, float tRel, out vec4 pos, out vec4 vel) {
  vec4 A = mkA(m);
  float s = (tRel - A.x) / A.y;
  float g0 = floor(s);
  if (g0 < A.z || g0 + 1.0 > A.w) return false;
  float f = s - g0;
  pos = mix(mkFetch(2 * m, g0), mkFetch(2 * m, g0 + 1.0), f);
  vel = mix(mkFetch(2 * m + 1, g0), mkFetch(2 * m + 1, g0 + 1.0), f);
  return true;
}

// Limita el paso cerca de una baliza (en su posición en el tiempo del rayo) para no saltarla.
float markerStepLimit(vec3 x, float t) {
  float lim = 1e9;
  float tRel = t - uCamT;
  for (int m = 0; m < MAX_MARKERS; m++) {
    if (m >= uMarkerCount) break;
    vec4 b = uMkBound[m];
    if (length(x - b.xyz) > b.w + 1.0) continue;
    vec4 pos, vel;
    if (!markerState(m, tRel, pos, vel)) continue;
    float R = mkB(m).x;
    float d = length(x - pos.xyz) - R;
    lim = min(lim, max(0.3 * R, 0.5 * d));
  }
  return lim;
}

// Prueba del segmento [x0, x1] (tiempos t0, t1 absolutos) contra las balizas.
bool markerHit(vec3 x0, float t0, vec3 x1, float t1, vec4 q, out vec4 info, out float tauEmit) {
  info = vec4(0.0);
  tauEmit = 0.0;
  if (uMarkerCount == 0) return false;
  vec3 d = x1 - x0;
  float dd = max(dot(d, d), 1e-20);
  float tm = 0.5 * (t0 + t1) - uCamT;
  float best = 2.0;
  for (int m = 0; m < MAX_MARKERS; m++) {
    if (m >= uMarkerCount) break;
    vec4 b = uMkBound[m];
    // Descarte rápido: distancia del segmento a la esfera envolvente
    vec3 cb = b.xyz - x0;
    float sb = clamp(dot(cb, d) / dd, 0.0, 1.0);
    if (length(x0 + sb * d - b.xyz) > b.w) continue;
    vec4 pos, vel;
    if (!markerState(m, tm, pos, vel)) continue;
    float R = mkB(m).x;
    vec3 c = pos.xyz - x0;
    // |x0 + s d − p|² = R²  →  s² dd − 2 s (c·d) + |c|² − R² = 0
    float bq = dot(c, d);
    float cq = dot(c, c) - R * R;
    float disc = bq * bq - dd * cq;
    if (disc < 0.0) continue;
    float s = (bq - sqrt(disc)) / dd;
    if (cq < 0.0) s = 0.0; // el segmento empieza dentro
    if (s < 0.0 || s > 1.0 || s >= best) continue;
    // Visibilidad: el objeto real debe estar fuera del horizonte (o la cámara dentro)
    float rc = ksRadius(pos.xyz);
    if (rc < uRPlus && uCamInside < 0.5) continue;
    best = s;
    vec4 u = vel;
    float qu = dot(q, u);
    float g = qu > 0.0 ? 1.0 / qu : 0.0;
    vec3 hit = x0 + s * d;
    vec3 nrm = normalize(hit - pos.xyz);
    float facing = max(dot(nrm, -normalize(d)), 0.0);
    info = vec4(float(m), g, facing, 1.0);
    tauEmit = pos.w;
  }
  return best <= 1.0;
}

vec3 markerColor(vec4 info, float tauEmit) {
  int m = int(info.x + 0.5);
  float g = info.y;
  vec4 B = mkB(m);
  float T = B.y;
  vec4 bbE = blackbody(T);
  vec4 bbO = blackbody(T * g);
  float lum = B.w * g * g * g * g * bbO.a / max(bbE.a, 1e-6);
  float blink = 1.0;
  if (B.z > 0.0) {
    float ph = fract(tauEmit / B.z);
    blink = 0.18 + 0.82 * (1.0 - smoothstep(0.08, 0.16, ph));
  }
  float limb = 0.45 + 0.55 * info.z;
  return bbO.rgb * lum * blink * limb;
}
`;
