/**
 * Música original del vídeo promocional de NIGHTFALL: 30 s exactos (16 compases a 128 BPM),
 * la menor (la–fa–do–mi), fusión de percusión latina y club electrónico, como el mezclador de la
 * web. Síntesis muestra a muestra y determinista (ruido con semilla); nada de samples.
 *
 *   c. 1–2   «cambia de frecuencia»: radio buscando emisora, latido de bombo, la emisora entra
 *            filtrada y tartamudea
 *   c. 3     ROSA · VERDE · VIOLETA · NEÓN: cuatro golpes de acorde (la–fa–do–mi)
 *   c. 4     build: redoble que acelera, riser, platillo invertido y un octavo de silencio
 *   c. 5–8   drop: four-on-the-floor, palmas, charles, clave 3-2, campana, tumbao de congas,
 *            bajo sincopado con sidechain y montuno de piano
 *   c. 9–14  una función por compás: zumbido de neón, blips de logos, scratch y crossfader,
 *            obturadores, tiza, toques y caja registradora; riser y silencio al final
 *   c. 15–16 impacto del cierre, cadencia y frenado de cinta; cola de reverb y crepitar de vinilo
 *
 *   node nightfall/promo/musica.mjs <salida.wav>
 */
import { writeFileSync } from 'node:fs';

const SR = 48000;
const DUR = 30;
const N = SR * DUR;
const BPM = 128;
const BEAT = 60 / BPM;
const S16 = BEAT / 4;
/** Tiempo de (compás, tiempo, semicorchea), todo desde 1 salvo la semicorchea. */
const T = (compas, tiempo = 1, sem = 0) => ((compas - 1) * 4 + (tiempo - 1)) * BEAT + sem * S16;

// ------------------------------------------------------------------ utilidades
function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = azar(20261009);
const blanco = () => rnd() * 2 - 1;
const TAU = Math.PI * 2;
const nota = (m) => 440 * 2 ** ((m - 69) / 12);
const muestras = (seg) => Math.max(1, Math.round(seg * SR));

class Biquad {
  constructor(tipo, f, q = 0.707) { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.tipo = tipo; this.fijar(f, q); }
  fijar(f, q = this.q) {
    this.q = q;
    const w = (TAU * Math.min(Math.max(f, 10), SR * 0.45)) / SR;
    const cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * q);
    let b0, b1, b2;
    if (this.tipo === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else if (this.tipo === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    else { b0 = a; b1 = 0; b2 = -a; }
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cs) / a0; this.a2 = (1 - a) / a0;
    return this;
  }
  paso(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Diente de sierra con polyBLEP (sin aliasing audible). */
function sierra() {
  let fase = rnd();
  return (f) => {
    const dt = f / SR;
    fase += dt; if (fase >= 1) fase -= 1;
    let v = 2 * fase - 1;
    if (fase < dt) { const t = fase / dt; v -= t + t - t * t - 1; }
    else if (fase > 1 - dt) { const t = (fase - 1) / dt; v -= t * t + t + t + 1; }
    return v;
  };
}

// ------------------------------------------------------------------ buses (estéreo)
const bus = () => [new Float32Array(N), new Float32Array(N)];
const BAT = bus();   // batería y percusión
const MUS = bus();   // bajo, piano, acordes: pasa por el sidechain
const FX = bus();    // risers, impactos, efectos de cada escena
const RAD = bus();   // la «emisora» del principio (filtro de radio y tartamudeo)
const COLA = bus();  // lo que suena después del frenado de cinta
const REV = bus();   // envío a reverb
const DEL = bus();   // envío a delay
const golpesBombo = [];

/** Suma una señal mono o estéreo en un bus, con paneo de potencia constante y envíos. */
function mezclar(destino, t0, senal, { g = 1, pan = 0, rev = 0, del = 0 } = {}) {
  const [l, r] = Array.isArray(senal) ? senal : [senal, senal];
  const i0 = Math.round(t0 * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2 * g;
  const gr = Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2 * g;
  for (let i = 0; i < l.length; i++) {
    const k = i0 + i;
    if (k < 0) continue;
    if (k >= N) break;
    const a = l[i] * gl, b = r[i] * gr;
    destino[0][k] += a; destino[1][k] += b;
    if (rev) { REV[0][k] += a * rev; REV[1][k] += b * rev; }
    if (del) { DEL[0][k] += a * del; DEL[1][k] += b * del; }
  }
}

// ------------------------------------------------------------------ instrumentos
function bombo(vel = 1, { lp = 0, largo = 0.44, tono = 1 } = {}) {
  const n = muestras(largo), o = new Float32Array(n);
  let fase = 0, y = 0;
  const a = lp ? 1 - Math.exp((-TAU * lp) / SR) : 1;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    fase += (TAU * (45 + 125 * Math.exp(-t / 0.03)) * tono) / SR;
    let s = Math.sin(fase) * Math.min(1, t / 0.0012) * Math.exp(-t / 0.19);
    if (t < 0.006) s += blanco() * 0.35 * Math.exp(-t / 0.0014);
    s = Math.tanh(s * 1.8) * vel;
    if (lp) { y += a * (s - y); s = y * 1.6; }
    o[i] = s * Math.min(1, (n - i) / 400);
  }
  return o;
}

function palmas(vel = 1) {
  const n = muestras(0.36), L = new Float32Array(n), R = new Float32Array(n);
  const fl = [new Biquad('bp', 1250, 1.1), new Biquad('bp', 1350, 1.1)], hp = [new Biquad('hp', 650), new Biquad('hp', 650)];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let e = 0;
    for (const d of [0, 0.0095, 0.019]) if (t >= d && t < d + 0.02) e = Math.max(e, Math.exp(-(t - d) / 0.0035));
    if (t >= 0.028) e = Math.max(e, 0.85 * Math.exp(-(t - 0.028) / 0.1));
    L[i] = hp[0].paso(fl[0].paso(blanco())) * e * vel * 2.2;
    R[i] = hp[1].paso(fl[1].paso(blanco())) * e * vel * 2.2;
  }
  return [L, R];
}

function caja(vel = 1, tono = 1) {
  const n = muestras(0.22), o = new Float32Array(n), bp = new Biquad('bp', 2100, 0.9);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    fase += (TAU * 190 * tono * (1 + 0.5 * Math.exp(-t / 0.01))) / SR;
    o[i] = (Math.sin(fase) * 0.55 * Math.exp(-t / 0.05) + bp.paso(blanco()) * 1.4 * Math.exp(-t / 0.07)) * vel;
  }
  return o;
}

const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
function charles(vel = 1, abierto = false) {
  const n = muestras(abierto ? 0.34 : 0.07), o = new Float32Array(n);
  const bp = new Biquad('bp', 10000, 0.7), hp = new Biquad('hp', 7200), hp2 = new Biquad('hp', 8000);
  const fases = METAL.map(() => rnd());
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let m = 0;
    for (let k = 0; k < 6; k++) { fases[k] = (fases[k] + METAL[k] / SR) % 1; m += fases[k] < 0.5 ? 1 : -1; }
    const s = hp.paso(bp.paso(m / 6)) * 0.9 + hp2.paso(blanco()) * 0.6;
    o[i] = s * Math.exp(-t / (abierto ? 0.085 : 0.016)) * Math.min(1, t / 0.0006) * vel;
  }
  return o;
}

function maraca(vel = 1) {
  const n = muestras(0.09), o = new Float32Array(n), bp = new Biquad('bp', 6600, 1.4);
  for (let i = 0; i < n; i++) { const t = i / SR; o[i] = bp.paso(blanco()) * Math.min(1, t / 0.009) * Math.exp(-t / 0.03) * vel * 2; }
  return o;
}

function clave(vel = 1) {
  const n = muestras(0.09), o = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; o[i] = (Math.sin(TAU * 2450 * t) + 0.35 * Math.sin(TAU * 1680 * t)) * Math.exp(-t / 0.028) * Math.min(1, t / 0.0004) * vel; }
  return o;
}

function campana(vel = 1, aguda = false) {
  const n = muestras(0.4), o = new Float32Array(n), bp = new Biquad('bp', aguda ? 2750 : 2300, 1.4);
  const f1 = aguda ? 605 : 540, f2 = aguda ? 900 : 800;
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    a = (a + f1 / SR) % 1; b = (b + f2 / SR) % 1;
    const sq = (a < 0.5 ? 1 : -1) + (b < 0.5 ? 1 : -1);
    o[i] = bp.paso(sq) * (0.65 * Math.exp(-t / 0.012) + 0.35 * Math.exp(-t / 0.16)) * vel * 1.6;
  }
  return o;
}

function conga(vel = 1, f = 330, abierta = false) {
  const n = muestras(abierta ? 0.42 : 0.14), o = new Float32Array(n), bp = new Biquad('bp', 1900, 1.2);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    fase += (TAU * f * (1 + 0.32 * Math.exp(-t / 0.018))) / SR;
    o[i] = (Math.sin(fase) * Math.exp(-t / (abierta ? 0.2 : 0.055)) + bp.paso(blanco()) * 0.45 * Math.exp(-t / 0.012)) * vel;
  }
  return o;
}

function bajo(f, dur, vel = 1, brillo = 1) {
  const n = muestras(dur + 0.03), o = new Float32Array(n), saw = sierra();
  const lp1 = new Biquad('lp', 400, 2.2), lp2 = new Biquad('lp', 400, 0.8);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 16 === 0) { const fc = 140 + 1700 * brillo * Math.exp(-t / 0.075) + 420 * brillo; lp1.fijar(fc); lp2.fijar(fc); }
    fase += (TAU * f) / SR;
    const s = lp2.paso(lp1.paso(saw(f * 2) * 0.95)) + Math.sin(fase) * 0.55;
    const env = Math.min(1, t / 0.004) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.03));
    o[i] = Math.tanh(s * 1.4) * env * vel;
  }
  return o;
}

function piano(notas, dur, vel = 1) {
  const n = muestras(dur + 0.3), L = new Float32Array(n), R = new Float32Array(n), lp = [new Biquad('lp', 5200), new Biquad('lp', 5200)];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const rel = t < dur ? 1 : Math.exp(-(t - dur) / 0.06);
    let l = 0, r = 0;
    notas.forEach((f, k) => {
      const v = (Math.sin(TAU * f * t) + 0.45 * Math.sin(TAU * 2 * f * t) * Math.exp(-t / 0.32) + 0.14 * Math.sin(TAU * 3 * f * t) * Math.exp(-t / 0.13) + 0.07 * Math.sin(TAU * 5.03 * f * t) * Math.exp(-t / 0.035)) * Math.exp(-t / 0.55);
      const p = notas.length > 1 ? k / (notas.length - 1) - 0.5 : 0;
      l += v * (0.6 - p * 0.3); r += v * (0.6 + p * 0.3);
    });
    const env = Math.min(1, t / 0.003) * rel * vel / notas.length;
    L[i] = lp[0].paso(l * env); R[i] = lp[1].paso(r * env);
  }
  return [L, R];
}

/** Acorde de supersierras (tres por nota y canal), con filtro que se abre y cierra. */
function acorde(notas, largo = 0.5, vel = 1, corte = 5200) {
  const n = muestras(largo + 0.35), L = new Float32Array(n), R = new Float32Array(n);
  const DET = [[-13, 0, 9], [-6, 4, 14]];
  const osc = [0, 1].map((c) => notas.map((f) => DET[c].map((ct) => ({ s: sierra(), f: f * 2 ** (ct / 1200) }))));
  const lp = [new Biquad('lp', 800, 1.1), new Biquad('lp', 800, 1.1)];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 16 === 0) { const fc = 600 + corte * Math.exp(-t / 0.13) + 900 * Math.exp(-t / 0.6); lp[0].fijar(fc); lp[1].fijar(fc); }
    const env = Math.min(1, t / 0.002) * (0.55 * Math.exp(-t / 0.09) + 0.45 * Math.exp(-t / 0.42)) * (t < largo ? 1 : Math.exp(-(t - largo) / 0.08));
    for (let c = 0; c < 2; c++) {
      let s = 0;
      for (const voz of osc[c]) for (const o of voz) s += o.s(o.f);
      (c ? R : L)[i] = lp[c].paso(s / (notas.length * 3)) * env * vel * 1.5;
    }
  }
  return [L, R];
}

function pulsado(f, vel = 1) {
  const n = muestras(0.32), o = new Float32Array(n), lp = new Biquad('lp', 3000, 1.6);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 16 === 0) lp.fijar(500 + 4200 * Math.exp(-t / 0.05));
    fase = (fase + f / SR) % 1;
    o[i] = lp.paso((fase < 0.5 ? 1 : -1) * 0.6 + Math.sin(TAU * f * t) * 0.4) * Math.exp(-t / 0.12) * Math.min(1, t / 0.002) * vel;
  }
  return o;
}

function subGrave(f0, f1, largo, vel = 1) {
  const n = muestras(largo), o = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = t / largo;
    fase += (TAU * (f1 + (f0 - f1) * Math.exp(-t / 0.18))) / SR;
    o[i] = Math.sin(fase) * Math.min(1, t / 0.003) * (1 - u) ** 2 * vel * 0.8;
  }
  return o;
}

/** Golpe de impacto: sub que cae y ráfaga de ruido que se oscurece. */
function impacto(vel = 1, largo = 1.6) {
  const n = muestras(largo), L = new Float32Array(n), R = new Float32Array(n);
  const sub = subGrave(78, 30, largo, 1.1);
  const lp = [new Biquad('lp', 9000, 0.8), new Biquad('lp', 9000, 0.8)];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 32 === 0) { const fc = 160 + 9000 * Math.exp(-t / 0.18); lp[0].fijar(fc); lp[1].fijar(fc); }
    const e = Math.exp(-t / 0.33) * Math.min(1, t / 0.001);
    L[i] = (lp[0].paso(blanco()) * e * 0.9 + sub[i]) * vel;
    R[i] = (lp[1].paso(blanco()) * e * 0.9 + sub[i]) * vel;
  }
  return [L, R];
}

/** Riser: ruido que sube por un pasabanda, tono de sierra que asciende y trémolo que acelera. */
function riser(largo, vel = 1, { fIni = 350, fFin = 9000, tono = true } = {}) {
  const n = muestras(largo), L = new Float32Array(n), R = new Float32Array(n);
  const bp = [new Biquad('bp', fIni, 3), new Biquad('bp', fIni, 3)], saw = sierra(), lpS = new Biquad('lp', 600, 1.5);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (i % 32 === 0) {
      const fc = fIni * (fFin / fIni) ** u;
      bp[0].fijar(fc, 3 - 1.6 * u); bp[1].fijar(fc * 1.04, 3 - 1.6 * u); lpS.fijar(300 + 5000 * u * u);
    }
    const tasa = 4 + 28 * u * u;
    const trem = 0.75 + 0.25 * Math.sin(TAU * tasa * (i / SR) * (BPM / 60) / 4);
    const g = u ** 2.2 * vel * trem;
    const ton = tono ? lpS.paso(saw(110 * 2 ** (u * 2.6))) * 0.35 : 0;
    L[i] = (bp[0].paso(blanco()) * 1.6 + ton) * g;
    R[i] = (bp[1].paso(blanco()) * 1.6 + ton) * g;
  }
  return [L, R];
}

function platilloInvertido(largo, vel = 1) {
  const n = muestras(largo), L = new Float32Array(n), R = new Float32Array(n), hp = [new Biquad('hp', 4200), new Biquad('hp', 4600)];
  for (let i = 0; i < n; i++) {
    const g = (i / n) ** 3.2 * vel;
    L[i] = hp[0].paso(blanco()) * g; R[i] = hp[1].paso(blanco()) * g;
  }
  return [L, R];
}

function platillo(vel = 1, largo = 1.8) {
  const n = muestras(largo), L = new Float32Array(n), R = new Float32Array(n), hp = [new Biquad('hp', 5200), new Biquad('hp', 5600)];
  const fases = METAL.map(() => rnd());
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let m = 0;
    for (let k = 0; k < 6; k++) { fases[k] = (fases[k] + (METAL[k] * 1.47) / SR) % 1; m += fases[k] < 0.5 ? 1 : -1; }
    const e = Math.exp(-t / 0.55) * Math.min(1, t / 0.001) * vel;
    L[i] = hp[0].paso(blanco() * 0.8 + m * 0.05) * e; R[i] = hp[1].paso(blanco() * 0.8 + m * 0.05) * e;
  }
  return [L, R];
}

function barrido(largo, vel = 1, deIzq = true) {
  const n = muestras(largo), L = new Float32Array(n), R = new Float32Array(n), bp = new Biquad('bp', 300, 1.6);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (i % 32 === 0) bp.fijar(300 + 3800 * Math.sin(Math.PI * u) ** 1.5, 1.6);
    const s = bp.paso(blanco()) * Math.sin(Math.PI * u) ** 2 * vel * 2.2;
    const p = deIzq ? u : 1 - u;
    L[i] = s * Math.cos((p * Math.PI) / 2); R[i] = s * Math.sin((p * Math.PI) / 2);
  }
  return [L, R];
}

function obturador(vel = 1) {
  const n = muestras(0.16), o = new Float32Array(n), hp = new Biquad('hp', 2600);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let e = t < 0.004 ? Math.exp(-t / 0.0012) : 0;
    if (t > 0.05 && t < 0.058) e += Math.exp(-(t - 0.05) / 0.0016) * 0.8;
    o[i] = (hp.paso(blanco()) * e + Math.sin(TAU * 120 * t) * Math.exp(-t / 0.02) * 0.3) * vel;
  }
  return o;
}

/** Silbido de carga del flash. */
function flash(largo = 0.25, vel = 1) {
  const n = muestras(largo), o = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) { const u = i / n; fase += (TAU * (2600 + 6000 * u)) / SR; o[i] = Math.sin(fase) * u * (1 - u) * 4 * vel; }
  return o;
}

/** Zumbido eléctrico de neón con parpadeo (pares [inicio, fin] en segundos, relativos). */
function zumbido(largo, tramos, vel = 1) {
  const n = muestras(largo), o = new Float32Array(n), bp = new Biquad('bp', 1800, 0.8), saw = sierra();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let on = 0;
    for (const [a, b] of tramos) if (t >= a && t < b) on = 1;
    const chasquido = tramos.some(([a]) => Math.abs(t - a) < 0.003) ? blanco() * 0.9 : 0;
    o[i] = (bp.paso(saw(120) + saw(240) * 0.5) * 0.9 * on + chasquido) * vel;
  }
  return o;
}

/** Scratch: un «aaa» de sierras con formantes leído a la velocidad de una mano. */
function scratch(largo, vel = 1) {
  const n = muestras(largo), o = new Float32Array(n);
  const f1 = new Biquad('bp', 750, 4), f2 = new Biquad('bp', 1250, 5), saw = sierra();
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = t / largo;
    const v = Math.sin(TAU * 4 * u) * (0.6 + 0.4 * Math.sin(TAU * 1.5 * u));
    const fader = Math.sin(TAU * 16 * u) > -0.3 ? 1 : 0;
    const s = saw(90 + 260 * Math.abs(v)) + blanco() * 0.25;
    o[i] = (f1.paso(s) + f2.paso(s) * 0.8) * Math.abs(v) * fader * vel * 2.4;
  }
  return o;
}

function campanita(vel = 1) {
  const n = muestras(1.1), o = new Float32Array(n);
  const P = [[2093, 1], [3136, 0.6], [4186, 0.45], [5274, 0.25]];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (const [f, a] of P) s += Math.sin(TAU * f * t) * a * Math.exp(-t / (0.5 - f / 20000));
    o[i] = (s * 0.5 + (t < 0.02 ? blanco() * Math.exp(-t / 0.004) * 0.6 : 0)) * Math.min(1, t / 0.001) * vel;
  }
  return o;
}

function toque(vel = 1) {
  const n = muestras(0.06), o = new Float32Array(n), bp = new Biquad('bp', 1500, 3);
  for (let i = 0; i < n; i++) { const t = i / SR; o[i] = (bp.paso(blanco()) * 2 + Math.sin(TAU * 900 * t)) * Math.exp(-t / 0.01) * vel; }
  return o;
}

function tiza(largo, vel = 1) {
  const n = muestras(largo), o = new Float32Array(n), bp = new Biquad('bp', 3200, 2.5);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const rasgo = 0.5 + 0.5 * Math.sin(TAU * 7 * u * (1 + u));
    o[i] = bp.paso(blanco()) * Math.sin(Math.PI * u) * rasgo * (0.6 + 0.4 * rnd()) * vel * 2.5;
  }
  return o;
}

/** Radio buscando emisora: estática que vaga por un pasabanda y silbidos heterodinos. */
function radio(largo, vel = 1) {
  const n = muestras(largo), L = new Float32Array(n), R = new Float32Array(n);
  const bp = new Biquad('bp', 1200, 5), bp2 = new Biquad('bp', 900, 2);
  let centro = 1200, deriva = 0, fase = 0, silbido = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 64 === 0) {
      deriva = deriva * 0.995 + (rnd() - 0.5) * 30;
      centro = Math.min(3600, Math.max(380, centro + deriva));
      bp.fijar(centro, 4 + 3 * Math.sin(t * 3.1));
    }
    const rafaga = 0.55 + 0.45 * Math.sin(TAU * 0.9 * t + Math.sin(TAU * 0.37 * t) * 2);
    silbido = 2200 + 1900 * Math.sin(TAU * 0.31 * t + 1.2) + 500 * Math.sin(TAU * 1.7 * t);
    fase += (TAU * silbido) / SR;
    const cruje = rnd() < 0.0015 ? blanco() * 3 : 0;
    const s = (bp.paso(blanco()) * 1.8 + bp2.paso(blanco()) * 0.5) * rafaga + Math.sin(fase) * 0.06 * (0.5 + 0.5 * Math.sin(TAU * 0.6 * t)) + cruje;
    const fadeIn = Math.min(1, t / 0.35);
    L[i] = s * vel * fadeIn; R[i] = s * vel * fadeIn * 0.92;
  }
  return [L, R];
}

function crepitar(largo, densidad = 14, vel = 1) {
  const n = muestras(largo), L = new Float32Array(n), R = new Float32Array(n), hp = new Biquad('hp', 1800), lp = new Biquad('lp', 5000);
  for (let i = 0; i < n; i++) {
    const c = rnd() < densidad / SR ? blanco() * (0.4 + rnd()) : 0;
    const s = hp.paso(c) + lp.paso(blanco()) * 0.012;
    L[i] = s * vel; R[i] = s * vel * (0.8 + 0.2 * rnd());
  }
  return [L, R];
}

function drone(f, largo, vel = 1) {
  const n = muestras(largo), o = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR, u = t / largo; o[i] = (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t)) * Math.sin(Math.PI * u) ** 1.5 * vel; }
  return o;
}

// ------------------------------------------------------------------ armonía
const A1 = 55, F1 = 43.65, C2 = 65.41, E1 = 41.2;
const ACORDES = {
  Am: { bajo: A1, piano: [[220, 261.63, 329.63], [261.63, 329.63, 440]], golpe: [220, 261.63, 329.63, 440, 523.25] },
  F: { bajo: F1, piano: [[174.61, 220, 261.63], [220, 261.63, 349.23]], golpe: [174.61, 220, 261.63, 349.23, 440] },
  C: { bajo: C2, piano: [[196, 261.63, 329.63], [261.63, 329.63, 392]], golpe: [196, 261.63, 329.63, 392, 523.25] },
  E: { bajo: E1, piano: [[207.65, 246.94, 329.63], [246.94, 329.63, 415.3]], golpe: [164.81, 207.65, 246.94, 329.63, 415.3] },
};
const PROGRESION = { 2: 'Am', 5: 'Am', 6: 'F', 7: 'C', 8: 'E', 9: 'Am', 10: 'F', 11: 'C', 12: 'E', 13: 'Am', 14: 'F', 15: 'Am', 16: 'Am' };

// ------------------------------------------------------------------ patrones (16 semicorcheas)
const CLAVE_32 = [[0, 6, 12], [4, 8]];
const TUMBAO = { 0: [0.2, 330, 0], 2: [0.15, 330, 0], 4: [0.38, 392, 0], 6: [0.15, 330, 0], 8: [0.2, 330, 0], 10: [0.15, 330, 0], 12: [0.48, 196, 1], 14: [0.44, 174.6, 1] };
const BAJO = [[0, 0.9, 1, 1], [3, 0.7, 1, 1], [6, 0.8, 2, 2], [8, 0.9, 1, 1], [10, 0.7, 1.5, 1], [12, 0.85, 1, 1], [14, 0.8, 2, 2]];
const MONTUNO = [0, 3, 6, 8, 11, 14];

/** Una semicorchea de groove completo, con los niveles latino/electrónico de la sección. */
function groove(compas, sem, { lat = 1, ele = 1, sinClap = false, sinBajo = false, sinPiano = false, destino = null } = {}) {
  const t = T(compas, 1, sem);
  const B = destino || BAT, M = destino || MUS;
  if (sem % 4 === 0) { mezclar(B, t, bombo(1), { g: 0.82 }); if (!destino) golpesBombo.push(t); }
  if (!sinClap && (sem === 4 || sem === 12)) mezclar(B, t, palmas(1), { g: 0.7, rev: 0.22 });
  if (sem % 4 === 2) mezclar(B, t, charles(1, true), { g: 0.34 * ele, pan: 0.25 });
  else mezclar(B, t, charles(sem % 2 ? 0.55 : 0.8), { g: 0.3 * ele, pan: -0.2 });
  mezclar(B, t + (sem % 2 ? S16 * 0.08 : 0), maraca(sem % 4 === 0 ? 0.9 : sem % 2 ? 0.55 : 0.7), { g: 0.2 * lat, pan: 0.45 });
  if (sem % 4 === 0) mezclar(B, t, campana(sem % 8 === 0 ? 1 : 0.7, sem % 8 === 0), { g: 0.26 * lat, pan: -0.35, rev: 0.06 });
  if (CLAVE_32[(compas - 1) % 2].includes(sem)) mezclar(B, t, clave(1), { g: 0.32 * lat, pan: 0.3, rev: 0.1 });
  const cg = TUMBAO[sem];
  if (cg) mezclar(B, t, conga(cg[0] * 2.2, cg[1], cg[2]), { g: 0.42 * lat, pan: 0.38 });
  const acc = ACORDES[PROGRESION[compas]];
  if (acc && !sinBajo) for (const [s, v, mult, dur] of BAJO) if (s === sem) mezclar(M, t, bajo(acc.bajo * mult, S16 * dur * 0.9, v, 0.6 + 0.5 * ele), { g: 0.44 });
  if (acc && !sinPiano && MONTUNO.includes(sem)) {
    const voz = acc.piano[MONTUNO.indexOf(sem) % 2];
    mezclar(M, t, piano(voz, S16 * 1.4, 1), { g: 0.55 * (0.7 + 0.3 * lat), rev: 0.16, del: 0.1 });
  }
}

// ------------------------------------------------------------------ ARREGLO
// c. 1–2 · cambia de frecuencia
mezclar(FX, 0, radio(T(2, 3) + 0.02, 1), { g: 0.13 });
mezclar(FX, 0, crepitar(T(5), 16, 1), { g: 0.5 });
mezclar(MUS, 0.2, drone(A1, T(3, 2), 1), { g: 0.16 });
for (const [c, b] of [[1, 1], [1, 3], [2, 1]]) {
  mezclar(BAT, T(c, b), bombo(0.9, { lp: 190 }), { g: 0.34 });
  mezclar(BAT, T(c, b) + 0.19, bombo(0.6, { lp: 190 }), { g: 0.24 });
}
mezclar(FX, T(1, 2), zumbido(0.34, [[0, 0.05], [0.09, 0.12], [0.15, 0.3]], 1), { g: 0.16, pan: -0.2 });
mezclar(FX, T(1, 3) - 0.05, barrido(0.42, 0.5, true), { g: 0.25 });
mezclar(BAT, T(1, 4), clave(1), { g: 0.3, rev: 0.25 });
mezclar(BAT, T(2, 1), clave(1), { g: 0.3, rev: 0.25, pan: -0.3 });
mezclar(BAT, T(2, 2), clave(1), { g: 0.3, rev: 0.25, pan: 0.3 });
// la emisora entra (filtro de radio) en «FRECUENCIA» y tartamudea en el tiempo 4
for (let s = 0; s < 8; s++) groove(2, 8 + s, { destino: RAD, lat: 1, ele: 0.6 });
mezclar(RAD, T(2, 3), acorde(ACORDES.Am.golpe, 0.3, 0.8, 3000), { g: 0.5 });
mezclar(FX, T(2, 4), platilloInvertido(BEAT, 0.9), { g: 0.35 });

// c. 3 · ROSA · VERDE · VIOLETA · NEÓN
['Am', 'F', 'C', 'E'].forEach((ac, k) => {
  const t = T(3, k + 1);
  mezclar(BAT, t, bombo(1), { g: 1 });
  mezclar(MUS, t, acorde(ACORDES[ac].golpe, 0.32, 1, 6000), { g: 0.5, rev: 0.3, del: 0.12 });
  mezclar(MUS, t, bajo(ACORDES[ac].bajo, 0.32, 1, 1.2), { g: 0.42 });
  mezclar(FX, t, subGrave(70, 38, 0.5, 0.6), { g: 0.4 });
  for (const s of [2, 3]) mezclar(BAT, t + s * S16, conga(0.7, k % 2 ? 392 : 330, s === 3), { g: 0.28, pan: 0.4 });
});
mezclar(FX, T(3, 1), platillo(0.8, 1.6), { g: 0.3, rev: 0.2 });
mezclar(FX, T(3, 4), zumbido(0.42, [[0, 0.04], [0.07, 0.1], [0.14, 0.42]], 1), { g: 0.14 });

// c. 4 · build: redoble que acelera, riser, platillo invertido, silencio de un octavo
{
  const inicio = T(4), fin = T(5) - BEAT / 2;
  for (let b = 0; b < 4; b++) {
    const sub = [2, 2, 4, 8][b];
    for (let k = 0; k < sub; k++) {
      const t = inicio + b * BEAT + (k * BEAT) / sub;
      if (t >= fin - 0.005) continue;
      const u = (t - inicio) / (fin - inicio);
      mezclar(BAT, t, caja(0.2 + 0.8 * u * u, 1 + u * 0.6), { g: 0.42, rev: 0.12, pan: (k % 2 ? 0.15 : -0.15) });
    }
    if (b < 3) mezclar(BAT, inicio + b * BEAT, bombo(0.85, { lp: 220 + 700 * b }), { g: 0.45 + 0.12 * b });
  }
  for (let k = 0; k < 7; k++) mezclar(MUS, inicio + k * (BEAT / 2), bajo(A1, BEAT / 2 * 0.8, 0.5 + k * 0.07, 0.3 + k * 0.12), { g: 0.4 });
  mezclar(FX, inicio, riser(fin - inicio, 1), { g: 0.36 });
  mezclar(FX, T(4, 3), platilloInvertido(fin - T(4, 3) + BEAT / 2, 1), { g: 0.3 });
  for (let k = 0; k < 6; k++) mezclar(FX, inicio + k * (BEAT / 2), obturador(0.6), { g: 0.12, pan: k % 2 ? 0.5 : -0.5 });
}

// c. 5–8 · drop
mezclar(FX, T(5), impacto(1, 2.2), { g: 0.55, rev: 0.25 });
mezclar(FX, T(5), platillo(1, 2), { g: 0.32, rev: 0.2 });
mezclar(MUS, T(5), acorde(ACORDES.Am.golpe, 0.45, 1, 6500), { g: 0.42, rev: 0.3, del: 0.15 });
for (let c = 5; c <= 8; c++) for (let s = 0; s < 16; s++) groove(c, s, { lat: c <= 6 ? 1 : 0.8, ele: c <= 6 ? 0.85 : 1 });
mezclar(FX, T(7) - 0.3, barrido(0.62, 0.9, false), { g: 0.3 });
mezclar(FX, T(7), impacto(0.55, 1.2), { g: 0.35, rev: 0.2 });
for (let k = 0; k < 4; k++) mezclar(BAT, T(8, 4) + k * S16, conga(0.9, [392, 392, 330, 196][k], k === 3), { g: 0.4, pan: 0.4 });
mezclar(FX, T(8, 4), platilloInvertido(BEAT, 0.7), { g: 0.25 });

// c. 9–14 · una función por compás
mezclar(FX, T(9), platillo(0.9, 1.5), { g: 0.28, rev: 0.2 });
for (let c = 9; c <= 14; c++) {
  const lat = { 9: 1.25, 10: 1, 11: 1.1, 12: 0.4, 13: 1, 14: 1 }[c];
  const ele = { 9: 0.55, 10: 1, 11: 0.75, 12: 1.2, 13: 1, 14: 1 }[c];
  for (let s = 0; s < 16; s++) {
    const u = s / 16;
    const l = c === 11 ? 1.2 - 0.9 * u : lat, e = c === 11 ? 0.5 + 0.7 * u : ele;
    if (c === 14 && s >= 14) continue;
    groove(c, s, { lat: l, ele: e });
  }
}
// mapa: el neón se enciende y los pines saltan
mezclar(FX, T(9), zumbido(0.95, [[0, 0.05], [0.1, 0.14], [0.2, 0.26], [0.34, 0.95]], 1), { g: 0.12, pan: 0.2 });
[0, 1, 2, 3, 4, 5, 6, 7].forEach((k) => mezclar(FX, T(9, 3) + k * S16, pulsado(nota(69 + [0, 3, 5, 7, 10, 12, 15, 17][k]), 0.8), { g: 0.12, pan: k % 2 ? 0.4 : -0.4, del: 0.2 }));
// locales: «¡párate ahí!» y un blip por logo
mezclar(MUS, T(10), acorde(ACORDES.F.golpe, 0.3, 1, 6000), { g: 0.38, rev: 0.25 });
mezclar(FX, T(10), impacto(0.5, 0.9), { g: 0.3 });
for (let k = 0; k < 8; k++) mezclar(FX, T(10) + k * (BEAT / 2), pulsado(nota(81 + [0, 3, 7, 10, 12, 15, 19, 24][k]), 0.9), { g: 0.11, pan: k % 2 ? 0.5 : -0.5, del: 0.25 });
// mezclador: scratch y barrido del crossfader
mezclar(FX, T(11) + 0.02, scratch(BEAT * 1.9, 1), { g: 0.22, pan: -0.1, rev: 0.05 });
mezclar(FX, T(11, 3), barrido(BEAT * 2, 0.6, true), { g: 0.18 });
// flash nocturno: obturador y silbido de flash en cada tiempo
for (let k = 0; k < 4; k++) {
  mezclar(FX, T(12, k + 1), obturador(1), { g: 0.3, pan: [-0.3, 0.3, -0.15, 0.15][k] });
  mezclar(FX, T(12, k + 1) - 0.22, flash(0.22, 0.5), { g: 0.04 });
}
// agenda: la tiza dibuja los círculos
for (const b of [1, 2, 3]) mezclar(FX, T(13, b) + 0.05, tiza(0.32, 1), { g: 0.14, pan: (b - 2) * 0.4 });
// carta: toques en los precios y caja registradora
for (const k of [1, 2, 3, 4, 5]) mezclar(FX, T(14, 1, 2 * k - 1), toque(1), { g: 0.25, pan: (k % 2 ? 0.3 : -0.3) });
mezclar(FX, T(14, 4) - 0.05, campanita(1), { g: 0.14, rev: 0.2 });
mezclar(FX, T(14, 2), riser(T(15) - T(14, 2) - BEAT / 2, 1, { fIni: 500 }), { g: 0.3 });
mezclar(FX, T(14, 3), platilloInvertido(BEAT * 1.5, 1), { g: 0.3 });

// c. 15–16 · cierre
mezclar(FX, T(15), impacto(1.1, 2.4), { g: 0.6, rev: 0.3 });
mezclar(FX, T(15), platillo(1, 2.2), { g: 0.34, rev: 0.25 });
mezclar(MUS, T(15), acorde(ACORDES.Am.golpe, 0.6, 1, 7000), { g: 0.45, rev: 0.35, del: 0.15 });
for (let s = 0; s < 16; s++) {
  if (s === 8) { PROGRESION[15] = 'E'; }
  groove(15, s, { lat: 1, ele: 1 });
}
PROGRESION[15] = 'Am';
[[0, 76], [3, 74], [6, 72], [10, 71], [12, 68]].forEach(([s, m]) => mezclar(MUS, T(15, 1, s), pulsado(nota(m), 0.9), { g: 0.16, rev: 0.25, del: 0.25 }));
// c. 16: golpe final (resuelve en la menor), el groove sigue y la cinta frena
mezclar(MUS, T(16), acorde([110, 220, 261.63, 329.63, 440, 659.25], 1.1, 1.1, 7000), { g: 0.5, rev: 0.45, del: 0.2 });
mezclar(FX, T(16), impacto(1, 2), { g: 0.5, rev: 0.35 });
mezclar(MUS, T(16), pulsado(nota(69), 1), { g: 0.2, rev: 0.4, del: 0.3 });
for (let s = 0; s < 10; s++) groove(16, s, { lat: 1, ele: 1, sinPiano: true });
const FRENO = T(16, 2);          // la cinta empieza a frenar
const FRENO_LARGO = 0.78;
mezclar(COLA, FRENO + FRENO_LARGO - 0.12, crepitar(DUR - FRENO - FRENO_LARGO + 0.12, 22, 1.2), { g: 0.6 });
mezclar(COLA, T(16, 4), piano([220, 329.63, 440], 0.9, 0.9), { g: 0.3, rev: 0.7, del: 0.25 });

// ------------------------------------------------------------------ proceso
// sidechain: el bus musical se agacha con cada bombo
const sc = new Float32Array(N).fill(1);
for (const t of golpesBombo) {
  const i0 = Math.round(t * SR);
  for (let i = 0; i < SR * 0.3 && i0 + i < N; i++) {
    const u = i / SR;
    const g = 1 - 0.62 * (u < 0.004 ? u / 0.004 : Math.exp(-(u - 0.004) / 0.075));
    sc[i0 + i] = Math.min(sc[i0 + i], g);
  }
}
for (let i = 0; i < N; i++) { MUS[0][i] *= sc[i]; MUS[1][i] *= sc[i]; }

// la emisora: pasabanda de radio AM, algo de saturación y tartamudeo en el tiempo 4 del c. 2
{
  const hp = [new Biquad('hp', 320, 0.8), new Biquad('hp', 320, 0.8)], lp = [new Biquad('lp', 2400, 1.2), new Biquad('lp', 2400, 1.2)];
  for (let i = 0; i < N; i++) for (let c = 0; c < 2; c++) RAD[c][i] = Math.tanh(lp[c].paso(hp[c].paso(RAD[c][i])) * 2.2) * 0.6;
  const a = Math.round(T(2, 4) * SR), b = Math.round(T(3) * SR);
  let i = a, trozo = Math.round(S16 * SR), base = a - trozo;
  while (i < b) {
    const k = i - a, u = k / (b - a);
    trozo = Math.round(S16 * SR / (u < 0.5 ? 1 : u < 0.8 ? 2 : 4));
    for (let j = 0; j < trozo && i < b; j++, i++) {
      const env = Math.min(1, j / 60, (trozo - j) / 60);
      for (let c = 0; c < 2; c++) RAD[c][i] = RAD[c][base + j] * env * (1 - u * 0.3);
    }
  }
  for (let c = 0; c < 2; c++) for (let k = b; k < Math.min(N, b + SR); k++) RAD[c][k] = 0;
  for (let c = 0; c < 2; c++) for (let k = 0; k < N; k++) FX[c][k] += RAD[c][k] * 0.42;
}

// sin envíos a efectos durante el frenado (la cola viene de lo anterior)
for (let c = 0; c < 2; c++) for (let k = Math.round(FRENO * SR); k < Math.round((FRENO + FRENO_LARGO) * SR); k++) { REV[c][k] = 0; DEL[c][k] = 0; }

// delay ping-pong a corchea con puntillo
function delay(entrada) {
  const d = Math.round(BEAT * 0.75 * SR), L = new Float32Array(N), R = new Float32Array(N);
  const lp = new Biquad('lp', 3500);
  for (let i = d; i < N; i++) {
    L[i] = (entrada[0][i - d] + entrada[1][i - d]) * 0.5 + lp.paso(R[i - d]) * 0.45;
    R[i] = L[i - d];
  }
  return [L, R];
}

// reverb tipo Freeverb (8 peines + 4 pasatodo por canal)
function reverb(entrada, sala = 0.84, amort = 0.32) {
  const COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AP = [556, 441, 341, 225];
  const esc = SR / 44100;
  const salida = [new Float32Array(N), new Float32Array(N)];
  for (let c = 0; c < 2; c++) {
    const sp = c ? 23 : 0;
    const combs = COMB.map((l) => ({ b: new Float32Array(Math.round((l + sp) * esc)), i: 0, f: 0 }));
    const aps = AP.map((l) => ({ b: new Float32Array(Math.round((l + sp) * esc)), i: 0 }));
    const x = entrada[c], y = salida[c];
    for (let n = 0; n < N; n++) {
      const inp = x[n] * 0.015;
      let s = 0;
      for (const cb of combs) {
        const o = cb.b[cb.i];
        cb.f = o * (1 - amort) + cb.f * amort;
        cb.b[cb.i] = inp + cb.f * sala;
        cb.i = (cb.i + 1) % cb.b.length;
        s += o;
      }
      for (const ap of aps) {
        const o = ap.b[ap.i];
        ap.b[ap.i] = s + o * 0.5;
        ap.i = (ap.i + 1) % ap.b.length;
        s = o - s;
      }
      y[n] = s * 3;
    }
  }
  return salida;
}

const eco = delay(DEL);
const sala = reverb(REV);
const mezcla = [new Float32Array(N), new Float32Array(N)];
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) mezcla[c][i] = BAT[c][i] + MUS[c][i] + FX[c][i] + eco[c][i] * 0.5;

// frenado de cinta: la lectura se desacelera hasta pararse (solo la mezcla seca; la reverb sigue)
{
  const a = Math.round(FRENO * SR), largo = Math.round(FRENO_LARGO * SR);
  const fuente = [mezcla[0].slice(a, a + largo), mezcla[1].slice(a, a + largo)];
  let pos = 0;
  for (let k = 0; k < N - a; k++) {
    const u = k / largo;
    for (let c = 0; c < 2; c++) {
      if (u >= 1) { mezcla[c][a + k] = 0; continue; }
      const i = Math.floor(pos), f = pos - i;
      const v = (fuente[c][i] || 0) * (1 - f) + (fuente[c][i + 1] || 0) * f;
      mezcla[c][a + k] = v * (1 - u ** 3);
    }
    pos += Math.max(0, (1 - u) ** 1.6);
  }
}
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) mezcla[c][i] += sala[c][i] * 0.35 + COLA[c][i];

// master: pasaaltos, compresión suave, limitador con anticipación y fundido final
{
  const hp = [new Biquad('hp', 28, 0.7), new Biquad('hp', 28, 0.7)];
  for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) mezcla[c][i] = hp[c].paso(mezcla[c][i]);
  let env = 0;
  const atk = Math.exp(-1 / (0.01 * SR)), rel = Math.exp(-1 / (0.15 * SR));
  for (let i = 0; i < N; i++) {
    const x = Math.max(Math.abs(mezcla[0][i]), Math.abs(mezcla[1][i]));
    env = x > env ? atk * env + (1 - atk) * x : rel * env + (1 - rel) * x;
    const umbral = 0.5;
    const g = env > umbral ? (umbral + (env - umbral) / 2.5) / env : 1;
    mezcla[0][i] *= g; mezcla[1][i] *= g;
  }
  let pico = 0;
  for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) pico = Math.max(pico, Math.abs(mezcla[c][i]));
  const pre = 1.6 / pico;
  const ant = Math.round(0.003 * SR), relL = Math.exp(-1 / (0.08 * SR)), techo = 0.89;
  const gan = new Float32Array(N).fill(1);
  for (let i = 0; i < N; i++) {
    const x = Math.max(Math.abs(mezcla[0][i]), Math.abs(mezcla[1][i])) * pre;
    const g = x > techo ? techo / x : 1;
    for (let k = Math.max(0, i - ant); k <= i; k++) gan[k] = Math.min(gan[k], g);
  }
  let g = 1;
  for (let i = 0; i < N; i++) {
    g = gan[i] < g ? gan[i] : relL * g + (1 - relL) * gan[i];
    const fin = Math.min(1, (N - i) / (0.35 * SR));
    for (let c = 0; c < 2; c++) mezcla[c][i] = Math.max(-0.99, Math.min(0.99, mezcla[c][i] * pre * g * fin));
  }
}

// WAV 24 bits
function wav(canales) {
  const n = canales[0].length, bloque = 6, datos = Buffer.alloc(44 + n * bloque);
  datos.write('RIFF', 0); datos.writeUInt32LE(36 + n * bloque, 4); datos.write('WAVE', 8);
  datos.write('fmt ', 12); datos.writeUInt32LE(16, 16); datos.writeUInt16LE(1, 20); datos.writeUInt16LE(2, 22);
  datos.writeUInt32LE(SR, 24); datos.writeUInt32LE(SR * bloque, 28); datos.writeUInt16LE(bloque, 32); datos.writeUInt16LE(24, 34);
  datos.write('data', 36); datos.writeUInt32LE(n * bloque, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
    const v = Math.round(Math.max(-1, Math.min(1, canales[c][i] + (rnd() - rnd()) / 8388608)) * 8388607);
    datos.writeIntLE(v, o, 3); o += 3;
  }
  return datos;
}
const salida = process.argv[2] ?? 'musica.wav';
writeFileSync(salida, wav(mezcla));
console.log(`música: ${salida} (${DUR} s, ${BPM} BPM, ${golpesBombo.length} bombos con sidechain)`);
