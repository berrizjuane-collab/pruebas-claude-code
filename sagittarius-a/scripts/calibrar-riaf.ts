/**
 * Calibración del modelo RIAF: flujo total a 230 GHz y diámetro del anillo para un observador
 * lejano, con el trazador de referencia (CPU). Uso: npx tsx scripts/calibrar-riaf.ts [ne0] [i] [a] [N]
 */
import { KerrSchild } from '../src/physics/metrics/kerrSchild';
import { CpuTracer } from '../src/physics/optics/cpuTracer';
import { DEFAULT_RIAF, RiafModel } from '../src/physics/emission/riaf';
import { blackHoleScales } from '../src/physics/sgra';
import { inclinedCamera } from './lib-camara';

const ne0 = Number(process.argv[2] ?? DEFAULT_RIAF.ne0);
const inc = Number(process.argv[3] ?? 30);
const a = Number(process.argv[4] ?? 0.5);
const N = Number(process.argv[5] ?? 48);
const te0 = Number(process.argv[6] ?? DEFAULT_RIAF.te0);
const scales = blackHoleScales(4.0e6, 8.2);
const ks = new KerrSchild(a);
const riaf = new RiafModel(ks, { ...DEFAULT_RIAF, ne0, te0, turbulence: 0 });
const D = 1e4;
const tr = new CpuTracer(ks, riaf, { rEscape: 2 * D, nus: [230e9], rtol: 1e-7, atol: 1e-9, rgCm: scales.rg * 100 });
const cam = inclinedCamera(ks, D, inc);
const half = 14; // semiancho del campo en M (parámetro de impacto)
const img = new Float64Array(N * N);
const t0 = performance.now();
let steps = 0;
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const ax = ((2 * (i + 0.5)) / N - 1) * half;
    const by = (1 - (2 * (j + 0.5)) / N) * half;
    const r = tr.trace(cam, [ax / D, by / D, 1]);
    img[j * N + i] = r.I[0];
    steps += r.steps;
  }
}
const dt = performance.now() - t0;
const pix = (2 * half) / N;
let sum = 0;
for (const v of img) sum += v;
const thetaG = scales.thetaGMuas / 206264.80624709636e6; // rad
const fluxJy = 1e23 * sum * pix * pix * thetaG * thetaG;
// Diámetro del anillo: pico del perfil promediado en acimut
const nb = 60;
const prof = new Float64Array(nb);
const cnt = new Float64Array(nb);
for (let j = 0; j < N; j++)
  for (let i = 0; i < N; i++) {
    const ax = ((2 * (i + 0.5)) / N - 1) * half;
    const by = (1 - (2 * (j + 0.5)) / N) * half;
    const rr = Math.hypot(ax, by);
    const k = Math.floor((rr / half) * nb);
    if (k < nb) {
      prof[k] += img[j * N + i];
      cnt[k]++;
    }
  }
let kmax = 0;
for (let k = 0; k < nb; k++) {
  prof[k] /= Math.max(cnt[k], 1);
  if (prof[k] > prof[kmax]) kmax = k;
}
const rPeak = ((kmax + 0.5) / nb) * half;
console.log(JSON.stringify({ ne0, te0, inc, a, N, fluxJy: +fluxJy.toFixed(3), ringDiameterM: +(2 * rPeak).toFixed(2), ringDiameterMuas: +(2 * rPeak * scales.thetaGMuas).toFixed(1), ms: Math.round(dt), stepsPerRay: Math.round(steps / (N * N)) }));
