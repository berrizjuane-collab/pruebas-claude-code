/**
 * Música original del vídeo promocional (20 s, 120 BPM, re menor), sintetizada muestra a muestra
 * y determinista (ruido con semilla). Estructura alineada con el montaje (compás = 2 s):
 *
 *   0–4 s   intro: pad que se abre, tic-tac de reloj, riser y aspiración hacia el drop
 *   4–14 s  drop: bombo, sub-bajo con sidechain, arpegio FM en semicorcheas, palmas, charles
 *   14–16 s tensión: redoble que acelera, riser, silencio de un cuarto de tiempo
 *   16–20 s impacto, acorde final y motivo de campanas con cola de reverb
 *
 *   node promo/musica.mjs <salida.wav>
 */
import { writeFileSync } from 'node:fs';

const SR = 48000;
const DUR = 20;
const N = SR * DUR;
const BEAT = 0.5;

// ---------------------------------------------------------------- utilidades
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const estereo = () => [new Float32Array(N), new Float32Array(N)];
function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ruido = azar(20261005);
const blanco = () => ruido() * 2 - 1;

/** Filtro de estado variable (Chamberlin, 2× sobremuestreado): lp, bp y hp. */
function svf() {
  let lp = 0;
  let bp = 0;
  return (x, fc, q = 0.7) => {
    const f = 2 * Math.sin((Math.PI * Math.min(fc, SR / 6)) / (2 * SR));
    const d = 1 / q;
    let hp = 0;
    for (let k = 0; k < 2; k++) {
      hp = x - lp - d * bp;
      bp += f * hp;
      lp += f * bp;
    }
    return { lp, bp, hp };
  };
}

/** Diente de sierra con polyBLEP (menos aliasing). */
function sierra() {
  let fase = 0;
  return (f) => {
    const dt = f / SR;
    fase += dt;
    if (fase >= 1) fase -= 1;
    let v = 2 * fase - 1;
    if (fase < dt) {
      const t = fase / dt;
      v -= t + t - t * t - 1;
    } else if (fase > 1 - dt) {
      const t = (fase - 1) / dt;
      v -= t * t + t + t + 1;
    }
    return v;
  };
}

const sumar = (bus, i, l, r) => {
  bus[0][i] += l;
  bus[1][i] += r;
};
const idx = (t) => Math.max(0, Math.min(N - 1, Math.round(t * SR)));

// ---------------------------------------------------------------- forma
const ACORDES = [
  // [inicio, fin, notas del pad, raíz del bajo]
  [0, 6, [50, 53, 57, 64], 38], // Dm(add9)
  [6, 8, [46, 50, 53, 57], 34], // B♭maj7
  [8, 10, [53, 57, 60, 67], 41], // F(add9)
  [10, 12, [48, 52, 55, 62], 36], // C(add9)
  [12, 14, [55, 58, 62, 69], 31], // Gm9
  [14, 15, [46, 50, 53, 58], 34], // B♭
  [15, 16, [45, 49, 52, 55], 33], // A7
  [16, 20, [50, 53, 57, 64], 38], // Dm(add9)
];
const acordeEn = (t) => ACORDES.find(([a, b]) => t >= a && t < b) ?? ACORDES[ACORDES.length - 1];

// Bombo: negras de 4 a 14, y en la subida (14–15.75); impactos en 4 y 16.
const BOMBOS = [];
for (let t = 4; t < 15.76; t += BEAT) BOMBOS.push(t);
const sidechain = new Float32Array(N).fill(1);
for (const tk of BOMBOS) {
  for (let i = idx(tk); i < Math.min(N, idx(tk + 0.45)); i++) {
    const x = (i - idx(tk)) / SR;
    sidechain[i] = Math.min(sidechain[i], 1 - 0.65 * Math.exp(-x / 0.11));
  }
}
for (let i = idx(15.75); i < idx(16); i++) sidechain[i] = Math.min(sidechain[i], 0.25);

// ---------------------------------------------------------------- buses
const seco = estereo();
const envioRev = estereo();
const envioEco = estereo();

// Pad: 3 sierras desafinadas por nota y canal, filtro que se abre en la intro.
{
  const voces = [];
  for (let v = 0; v < 4; v++) for (const c of [0, 1]) for (const det of [-9, 0, 8]) voces.push({ v, c, det: det + (c ? 3 : -3), osc: sierra(), filtro: svf() });
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const [a, b, notas] = acordeEn(t);
    // Envolvente de acorde: ataque 0.25 s, suelta los últimos 0.08 s (legato).
    const env = Math.min(1, (t - a) / 0.25) * Math.min(1, (b - t) / 0.08 + (b >= 20 ? 1 : 0));
    const abre = t < 4 ? 260 * 2 ** (2.9 * (t / 4) ** 1.6) : t < 16 ? 1700 + 500 * Math.sin(t * 0.9) : 2200 * Math.exp(-(t - 16) / 2.2) + 500;
    const fin = t > 17.5 ? Math.max(0, 1 - (t - 17.5) / 2.4) : 1;
    const nivel = (t < 4 ? 0.22 + 0.16 * (t / 4) : t < 16 ? 0.3 : 0.4) * env * fin * (t < 4 || t >= 16 ? 1 : sidechain[i]);
    let l = 0;
    let r = 0;
    for (const o of voces) {
      const f = midi(notas[o.v]) * 2 ** (o.det / 1200);
      const y = o.filtro(o.osc(f), abre, 0.9).lp;
      if (o.c) r += y;
      else l += y;
    }
    sumar(seco, i, l * nivel * 0.12, r * nivel * 0.12);
    sumar(envioRev, i, l * nivel * 0.1, r * nivel * 0.1);
  }
}

// Sub-bajo: corcheas de 4 a 15.75 con envolvente corta y saturación suave.
{
  let fase = 0;
  for (let i = idx(4); i < idx(15.75); i++) {
    const t = i / SR;
    const raiz = acordeEn(t)[3];
    const f = midi(raiz) * (raiz < 36 ? 2 : 1);
    const x = (t - 4) % (BEAT / 2);
    const env = Math.min(1, x / 0.004) * Math.exp(-x / 0.16);
    fase += f / SR;
    const y = Math.tanh(1.6 * (Math.sin(2 * Math.PI * fase) + 0.35 * Math.sin(4 * Math.PI * fase))) * env * 0.17 * sidechain[i];
    sumar(seco, i, y, y);
  }
}

// Bombo y sus impactos.
function bombo(t0, nivel, cola = 0.28, fBase = 48) {
  let fase = 0;
  for (let i = idx(t0); i < Math.min(N, idx(t0 + cola * 5)); i++) {
    const x = (i - idx(t0)) / SR;
    const f = fBase + 140 * Math.exp(-x / 0.028);
    fase += f / SR;
    const clic = x < 0.004 ? blanco() * (1 - x / 0.004) * 0.35 : 0;
    const y = (Math.sin(2 * Math.PI * fase) * Math.exp(-x / cola) + clic) * nivel;
    sumar(seco, i, y, y);
  }
}
for (const tk of BOMBOS) bombo(tk, 0.4, 0.2);

function impacto(t0, nivel, cola) {
  bombo(t0, nivel, cola, 34);
  const f = svf();
  for (let i = idx(t0); i < Math.min(N, idx(t0 + 1.2)); i++) {
    const x = (i - idx(t0)) / SR;
    const y = f(blanco(), 2600 * Math.exp(-x / 0.5) + 200, 0.6).lp * Math.exp(-x / 0.35) * nivel * 0.9;
    sumar(seco, i, y * 0.5, y * 0.5);
    sumar(envioRev, i, y * 0.9, y * 0.9);
  }
}
impacto(4, 0.55, 0.35);
impacto(16, 0.7, 0.5);

// Palmas en 2 y 4 desde el compás 4 (6 s), con reverb corta.
{
  for (let t = 6.5; t < 15.7; t += 1) {
    const f = svf();
    for (let i = idx(t); i < idx(t + 0.25); i++) {
      const x = (i - idx(t)) / SR;
      // Tres golpecitos y la cola.
      const ataques = [0, 0.011, 0.023].reduce((s, d) => s + (x >= d ? Math.exp(-(x - d) / 0.006) : 0), 0) * 0.5 + Math.exp(-x / 0.07);
      const y = f(blanco(), 1500, 1.4).bp * ataques * 0.45;
      sumar(seco, i, y, y);
      sumar(envioRev, i, y * 0.6, y * 0.6);
    }
  }
}

// Charles: corcheas a contratiempo desde el drop; semicorcheas desde 8 s.
{
  const golpes = [];
  for (let t = 4.25; t < 15.75; t += BEAT) golpes.push([t, 0.2]);
  for (let t = 8; t < 15.75; t += BEAT / 2) if (Math.abs(((t - 4.25) / BEAT) % 1) > 1e-6) golpes.push([t, 0.09]);
  for (const [t, nivel] of golpes) {
    const f = svf();
    for (let i = idx(t); i < idx(t + 0.08); i++) {
      const x = (i - idx(t)) / SR;
      const y = f(blanco(), 9000, 0.8).hp * Math.exp(-x / 0.018) * nivel;
      const p = Math.sin(t * 7) * 0.4;
      sumar(seco, i, y * (1 - p), y * (1 + p));
    }
  }
}

// Arpegio FM «de cristal» en semicorcheas, al eco y a la reverb.
{
  const PATRON = [0, 1, 2, 3, 4, 3, 5, 6, 7, 6, 4, 5, 3, 2, 4, 1];
  let k = 0;
  for (let t = 4; t < 15.74; t += BEAT / 2, k++) {
    const notas = acordeEn(t)[2];
    const tonos = [...notas, ...notas.map((n) => n + 12)].map((n) => n + 12);
    const n = tonos[PATRON[k % 16]];
    const f = midi(n) * (t >= 12 ? 2 : 1);
    const acento = k % 4 === 0 ? 1 : 0.7;
    let fc = 0;
    let fm = 0;
    for (let i = idx(t); i < Math.min(N, idx(t + 0.45)); i++) {
      const x = (i - idx(t)) / SR;
      fm += (2 * f) / SR;
      const indice = 2.6 * Math.exp(-x / 0.06);
      fc += f / SR;
      const y = Math.sin(2 * Math.PI * fc + indice * Math.sin(2 * Math.PI * fm)) * Math.min(1, x / 0.002) * Math.exp(-x / 0.11) * 0.16 * acento * (0.4 + 0.6 * sidechain[i]);
      sumar(seco, i, y, y);
      sumar(envioEco, i, y * 0.7, y * 0.7);
      sumar(envioRev, i, y * 0.3, y * 0.3);
    }
  }
}

// Campanas FM del cierre (y una al caer el drop).
function campana(t0, m, nivel, dur = 2.6) {
  const f = midi(m);
  let fc = 0;
  let fm = 0;
  for (let i = idx(t0); i < Math.min(N, idx(t0 + dur)); i++) {
    const x = (i - idx(t0)) / SR;
    fc += f / SR;
    fm += (3.5 * f) / SR;
    const indice = 3.2 * Math.exp(-x / 0.5);
    const y = Math.sin(2 * Math.PI * fc + indice * Math.sin(2 * Math.PI * fm)) * Math.min(1, x / 0.003) * Math.exp(-x / 0.9) * nivel;
    sumar(seco, i, y * 0.8, y * 0.6);
    sumar(envioRev, i, y * 0.7, y * 0.9);
    sumar(envioEco, i, y * 0.25, y * 0.25);
  }
}
campana(4, 74, 0.14, 2);
[
  [16, 74],
  [16.5, 81],
  [17, 77],
  [17.5, 76],
  [18, 74],
  [18.75, 69],
].forEach(([t, m], j) => campana(t, m, j === 4 ? 0.2 : 0.16, j === 4 ? 2 : 1.6));

// Tic-tac de reloj en la intro (guiño a t), cada vez más presente.
for (let k = 1; k < 8; k++) {
  const t = k * BEAT;
  const f = k % 2 ? 3100 : 2300;
  for (let i = idx(t); i < idx(t + 0.03); i++) {
    const x = (i - idx(t)) / SR;
    const y = Math.sin(2 * Math.PI * f * x) * Math.exp(-x / 0.005) * (0.16 + 0.04 * k);
    const p = k % 2 ? 0.35 : -0.35;
    sumar(seco, i, y * (1 - p), y * (1 + p));
    sumar(envioRev, i, y * 0.5, y * 0.5);
  }
}

// Risers (ruido con paso banda que sube) y aspiración inversa hacia 4 y 16.
function riser(a, b, nivel) {
  const fl = svf();
  const fr = svf();
  let fase = 0;
  for (let i = idx(a); i < idx(b); i++) {
    const s = (i / SR - a) / (b - a);
    const fc = 300 * 2 ** (5 * s);
    const env = s ** 2.2 * nivel;
    const l = fl(blanco(), fc, 2.2).bp;
    const r = fr(blanco(), fc * 1.03, 2.2).bp;
    fase += (180 * 2 ** (2.2 * s)) / SR;
    const tono = Math.sin(2 * Math.PI * fase) * 0.25;
    sumar(seco, i, (l + tono) * env, (r + tono) * env);
    sumar(envioRev, i, (l + r) * env * 0.4, (l + r) * env * 0.4);
  }
}
riser(1.6, 4, 0.34);
riser(13, 15.98, 0.38);

// Redoble que acelera (corcheas → semicorcheas → fusas) de 14 a 15.75.
{
  const golpes = [];
  for (let t = 14; t < 14.75; t += 0.25) golpes.push(t);
  for (let t = 14.75; t < 15.25; t += 0.125) golpes.push(t);
  for (let t = 15.25; t < 15.75; t += 0.0625) golpes.push(t);
  golpes.forEach((t, j) => {
    const f = svf();
    const nivel = 0.1 + 0.22 * (j / golpes.length);
    for (let i = idx(t); i < idx(t + 0.12); i++) {
      const x = (i - idx(t)) / SR;
      const y = (f(blanco(), 2200, 0.9).bp * 1.2 + Math.sin(2 * Math.PI * 190 * x) * 0.5) * Math.exp(-x / 0.045) * nivel;
      sumar(seco, i, y, y);
      sumar(envioRev, i, y * 0.4, y * 0.4);
    }
  });
}

// ---------------------------------------------------------------- efectos
/** Eco ping-pong de tres semicorcheas (0.375 s) con realimentación filtrada. */
function eco(entrada, salida) {
  const d = Math.round(0.375 * SR);
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < N; i++) {
    const j = i % d;
    const yl = bl[j];
    const yr = br[j];
    lpL += 0.35 * (yl - lpL);
    lpR += 0.35 * (yr - lpR);
    bl[j] = entrada[1][i] + lpR * 0.42;
    br[j] = entrada[0][i] + lpL * 0.42;
    sumar(salida, i, yl * 0.6, yr * 0.6);
    sumar(envioRev, i, (yl + yr) * 0.12, (yl + yr) * 0.12);
  }
}

/** Reverb tipo Freeverb (8 peines con amortiguación + 4 pasatodo por canal). */
function reverb(entrada, salida, sala = 0.86, amort = 0.25, humedo = 0.5) {
  const escala = SR / 44100;
  const peines = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const pasatodos = [556, 441, 341, 225];
  for (const c of [0, 1]) {
    const extra = c ? 23 : 0;
    const P = peines.map((L) => ({ b: new Float32Array(Math.round((L + extra) * escala)), i: 0, f: 0 }));
    const A = pasatodos.map((L) => ({ b: new Float32Array(Math.round((L + extra) * escala)), i: 0 }));
    const x = entrada[c];
    const y = salida[c];
    for (let n = 0; n < N; n++) {
      const v = x[n] * 0.015;
      let s = 0;
      for (const p of P) {
        const o = p.b[p.i];
        p.f = o * (1 - amort) + p.f * amort;
        p.b[p.i] = v + p.f * sala;
        p.i = (p.i + 1) % p.b.length;
        s += o;
      }
      for (const a of A) {
        const o = a.b[a.i];
        a.b[a.i] = s + o * 0.5;
        a.i = (a.i + 1) % a.b.length;
        s = o - s;
      }
      y[n] += s * humedo;
    }
  }
}

eco(envioEco, seco);
const rev = estereo();
reverb(envioRev, rev);

// ---------------------------------------------------------------- mezcla y máster
const L = new Float32Array(N);
const R = new Float32Array(N);
let pico = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  // Fundido final (los últimos 1.2 s) y entrada suave de 30 ms.
  const fundido = Math.min(1, t / 0.03) * (t > 18.8 ? Math.max(0, (20 - t) / 1.2) ** 1.5 : 1);
  L[i] = Math.tanh(1.15 * (seco[0][i] + rev[0][i] * 2.4)) * fundido;
  R[i] = Math.tanh(1.15 * (seco[1][i] + rev[1][i] * 2.4)) * fundido;
  pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
}
const g = 0.89 / pico; // −1 dBFS de pico

// WAV PCM 16 bits estéreo.
const datos = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  datos.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 4 * i);
  datos.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 4 * i + 2);
}
const cab = Buffer.alloc(44);
cab.write('RIFF', 0);
cab.writeUInt32LE(36 + datos.length, 4);
cab.write('WAVE', 8);
cab.write('fmt ', 12);
cab.writeUInt32LE(16, 16);
cab.writeUInt16LE(1, 20);
cab.writeUInt16LE(2, 22);
cab.writeUInt32LE(SR, 24);
cab.writeUInt32LE(SR * 4, 28);
cab.writeUInt16LE(4, 32);
cab.writeUInt16LE(16, 34);
cab.write('data', 36);
cab.writeUInt32LE(datos.length, 40);
const salidaWav = process.argv[2] ?? 'promo/musica.wav';
writeFileSync(salidaWav, Buffer.concat([cab, datos]));
console.log(`${salidaWav}: ${DUR} s, ${SR} Hz, pico previo ${pico.toFixed(3)} → −1 dBFS`);
