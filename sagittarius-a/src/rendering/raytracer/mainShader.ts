/**
 * Programa principal del trazador: genera el rayo de cada píxel en la tétrada de la cámara,
 * integra la geodésica nula hacia el pasado (RK4 con paso heurístico ∝ escala espacial),
 * acumula la transferencia radiativa del plasma y, si escapa, ilumina con el cielo de fondo.
 */
import { GLSL_EMISSION, GLSL_HEADER, GLSL_KERR, GLSL_SKY } from './glsl';
import { GLSL_MARKERS } from './markersGlsl';

export const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec3 position;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const GLSL_MAIN = /* glsl */ `
uniform vec2 uResolution;
uniform vec2 uJitter;
uniform vec3 uCamPos;
uniform vec4 uE0;
uniform vec4 uE1;
uniform vec4 uE2;
uniform vec4 uE3;
uniform float uTanHalfFov;
uniform float uAspect;
uniform int uMaxSteps;
uniform float uEta;
uniform float uHEmit;
uniform float uREscape;
uniform float uPastT;
uniform int uProfile;      // 0 cinematográfico, 1 EHT, 2 espacio-tiempo
uniform int uOutputMode;   // 0 normal, 1 validación geométrica, 2 validación radiativa
uniform float uMaxOut;     // tope de radiancia de salida (mapas de entorno en media precisión)
uniform float uPlasmaOn;
uniform vec3 uNu;
uniform int uNBands;
uniform float uStarsOn;
uniform float uIntensityScale;
uniform vec3 uPaletteLo;
uniform vec3 uPaletteMid;
uniform vec3 uPaletteHi;

layout(location = 0) out vec4 outColor;

vec3 gradR(vec3 x, float r) {
  float a2 = uSpin * uSpin;
  float r2 = r * r;
  float D = r2 * r2 + a2 * x.z * x.z;
  return vec3(r2 * r * x.x / D, r2 * r * x.y / D, r * (r2 + a2) * x.z / D);
}

vec3 cinematicPalette(float s) {
  // s: índice espectral ~[−1.5, 0.5] → rojo profundo, oro, blanco azulado (mapa artístico)
  float u = clamp((s + 1.6) / 2.0, 0.0, 1.0);
  vec3 c = u < 0.5 ? mix(uPaletteLo, uPaletteMid, u * 2.0) : mix(uPaletteMid, uPaletteHi, (u - 0.5) * 2.0);
  return c;
}

void main() {
  vec2 pix = gl_FragCoord.xy + uJitter;
  vec2 ndc = pix / uResolution * 2.0 - 1.0;
  vec3 n = normalize(vec3(ndc.x * uTanHalfFov * uAspect, ndc.y * uTanHalfFov, 1.0));
  vec4 qv = -uE0 + n.x * uE1 + n.y * uE2 + n.z * uE3;
  vec4 p = ksLower(uCamPos, qv);
  vec3 x = uCamPos;
  float t = uCamT;
  float r = ksRadius(x);
  bool inside0 = r < uRPlus;
  int status = 5;
  vec3 I = vec3(0.0);
  vec3 tau = vec3(0.0);
  vec4 dx = vec4(0.0);
  vec3 dp = vec3(0.0);
  int steps = 0;
  float rMin = r;
  vec4 mark = vec4(0.0);
  float markT = 1e30;
  int nearH = 0;
  for (int i = 0; i < 8192; i++) {
    if (i >= uMaxSteps) break;
    steps = i + 1;
    vec4 k1x; vec3 k1p;
    ksRHS(x, p, k1x, k1p);
    float v = length(k1x.yzw) + 1e-12;
    float hc = uEta * min(r, 4.0 * max(abs(r - uRPlus), 0.02));
    bool inEmit = uPlasmaOn > 0.5 && r < uROut * 1.3;
    if (inEmit) hc = min(hc, uHEmit);
    hc = min(hc, markerStepLimit(x, t));
    float h = hc / v;
    vec4 k2x; vec3 k2p;
    ksRHS(x + 0.5 * h * k1x.yzw, p + vec4(0.0, 0.5 * h * k1p), k2x, k2p);
    vec4 k3x; vec3 k3p;
    ksRHS(x + 0.5 * h * k2x.yzw, p + vec4(0.0, 0.5 * h * k2p), k3x, k3p);
    vec4 k4x; vec3 k4p;
    ksRHS(x + h * k3x.yzw, p + vec4(0.0, h * k3p), k4x, k4p);
    vec3 x0 = x;
    float t0 = t;
    t += h / 6.0 * (k1x.x + 2.0 * k2x.x + 2.0 * k3x.x + k4x.x);
    x += h / 6.0 * (k1x.yzw + 2.0 * k2x.yzw + 2.0 * k3x.yzw + k4x.yzw);
    p.yzw += h / 6.0 * (k1p + 2.0 * k2p + 2.0 * k3p + k4p);
    r = ksRadius(x);
    rMin = min(rMin, r);
    dx = k4x;
    // Objetos arrojados (balizas con tiempo retardado)
    vec4 mk;
    float mkT;
    if (markerHit(x0, t0, x, t, p, mk, mkT)) {
      mark = mk;
      markT = mkT;
      status = 6;
      break;
    }
    if (inEmit) {
      Plasma P;
      if (plasmaState(x, t, P)) {
        float qu = dot(p, P.u);
        if (qu > 0.0) {
          float g = 1.0 / qu;
          float kphi = -(x.x * p.z - x.y * p.y);
          float bn = sqrt(max(P.gPhiPhi + P.uPhi * P.uPhi, 1e-30));
          float cosB = (kphi - P.uPhi * qu) / (bn * qu);
          float sinB = sqrt(max(0.0, 1.0 - cosB * cosB));
          float th = KB_CGS * P.te / (ME_CGS * C_CGS * C_CGS);
          float K2 = th > 50.0 ? 2.0 * th * th : besselK2(1.0 / th);
          for (int k = 0; k < 3; k++) {
            if (k >= uNBands) break;
            float nuF = uNu[k] / g;
            float j = synchJ(nuF, P.ne, th, P.B, sinB, K2);
            float al = j / planckNu(nuF, P.te);
            float dtau = al / g * uRgCm * h;
            float fac = dtau > 1e-4 ? (1.0 - exp(-dtau)) / dtau : 1.0 - 0.5 * dtau;
            I[k] += g * g * j * uRgCm * h * exp(-tau[k]) * fac;
            tau[k] += dtau;
          }
        }
      }
    }
    float drdl = dot(gradR(x, r), dx.yzw);
    if (r > uREscape && drdl > 0.0) { status = 1; break; }
    // Captura: el rayo (hacia el pasado) se pega al horizonte futuro desde fuera. En KS gira
    // indefinidamente en φ̃ (arrastre) mientras r → r₊; se corta en r < 1,02 r₊ o tras 60 pasos
    // en la capa r < 1,3 r₊ sin dejar de caer (la luz de ahí llega con g ≲ 0,1: ver VALIDACION).
    if (r > uRPlus && drdl < 0.0) {
      if (r < uRPlus * 1.02) { status = 2; break; }
      if (r < uRPlus * 1.3) { nearH++; if (nearH > 60) { status = 2; break; } }
    }
    if (r < uRPlus && (inside0 || r < uRPlus * 0.999) && uCamT - t > uPastT) { status = 3; break; }
    if (r < 0.02) { status = 3; break; }
    if (uNBands > 0 && min(min(tau.x, uNBands > 1 ? tau.y : 1e9), uNBands > 2 ? tau.z : 1e9) > 12.0) { status = 4; break; }
  }

  // --- Fuera del bucle: flujo de control uniforme para las derivadas de pantalla ---
  vec3 dir = status == 1 ? normalize(dx.yzw) : vec3(0.0, 0.0, 1.0);
  float escF = status == 1 ? 1.0 : 0.0;
  vec3 J1 = dFdx(dir);
  vec3 J2 = dFdy(dir);
  float mixed = fwidth(escF);
  float footprint = mixed > 0.0 ? 1e3 : max(length(cross(J1, J2)), 1e-14);
  // Derivadas de la retícula (θ, φ) por la regla de la cadena
  float sth = sqrt(max(1.0 - dir.z * dir.z, 1e-8));
  float rho2 = max(dir.x * dir.x + dir.y * dir.y, 1e-8);
  float dth = max(abs(J1.z), abs(J2.z)) / sth;
  float dph = max(abs(dir.x * J1.y - dir.y * J1.x), abs(dir.x * J2.y - dir.y * J2.x)) / rho2;
  float gridW = max(dth, dph) / (PI / 12.0);

  if (uOutputMode == 1) {
    outColor = vec4(dir, float(status) + float(steps) / 100000.0);
    return;
  }
  float qt = p.x;
  if (uOutputMode == 2) {
    outColor = vec4(I.x, tau.x, float(status), qt);
    return;
  }

  // Fondo: estrellas (si el rayo escapa) o baliza de un objeto (si la alcanza). La luz óptica de
  // fondo no se atenúa con la profundidad óptica radio del plasma (transparente en el óptico).
  vec3 bg = vec3(0.0);
  float gSky = 1.0 / max(qt, 1e-6);
  if (status == 1 && uStarsOn > 0.5) {
    bg += starsAll(dir, J1, J2, footprint, gSky);
    bg += galacticBand(dir, gSky);
    if (uGridOn > 0.5) {
      float th = acos(clamp(dir.z, -1.0, 1.0));
      float ph = atan(dir.y, dir.x);
      float fth = th / (PI / 12.0);
      float fph = ph / (PI / 12.0);
      float lth = 1.0 - smoothstep(0.0, 1.5 * dth / (PI / 12.0) + 1e-4, abs(fract(fth + 0.5) - 0.5));
      float lph = 1.0 - smoothstep(0.0, 1.5 * dph / (PI / 12.0) + 1e-4, abs(fract(fph + 0.5) - 0.5));
      float fade = 1.0 - smoothstep(0.25, 0.6, gridW);
      float eq = 1.0 - smoothstep(0.0, 1.5 * dth + 1e-4, abs(th - PI / 2.0));
      bg += vec3(0.30, 0.42, 0.55) * max(lth, lph) * fade * 0.6 + vec3(0.55, 0.45, 0.25) * eq * fade * 0.5;
    }
  }
  if (status == 6) bg = markerColor(mark, markT);

  vec3 col;
  if (uProfile == 1) {
    // EHT: intensidad lineal a la primera frecuencia (R) y profundidad óptica (G); balizas en B
    col = vec3(I.x * uIntensityScale, tau.x, status == 6 ? 1.0 : 0.0);
  } else if (uProfile == 0 && uNBands >= 3) {
    float lum = I.y * uIntensityScale;
    float s = log(max(I.z, 1e-30) / max(I.x, 1e-30)) / log(uNu.z / uNu.x);
    col = cinematicPalette(s) * lum + bg;
  } else if (uNBands >= 1) {
    col = vec3(I.x * uIntensityScale) + bg;
  } else {
    col = bg;
  }
  // Cerca del horizonte interior el desplazamiento al azul del cielo diverge: se evita propagar
  // NaN y se acota la radiancia (solo importa en el mapa de entorno, que es de media precisión).
  if (any(isnan(col)) || any(notEqual(col, col))) col = vec3(0.0);
  col = min(col, vec3(uMaxOut));
  outColor = vec4(col, 1.0);
}
`;

export function buildFragmentShader(): string {
  return GLSL_HEADER + GLSL_KERR + GLSL_EMISSION + GLSL_SKY + GLSL_MARKERS + GLSL_MAIN;
}
