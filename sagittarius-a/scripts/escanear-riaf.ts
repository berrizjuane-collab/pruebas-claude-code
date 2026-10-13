/**
 * Escaneo de calibración del RIAF: para cada T₀ busca n₀ que da F₂₃₀ = objetivo (i, a dados) y
 * mide la profundidad óptica máxima en el corte ecuatorial y el contraste centro/anillo.
 * Uso: npx tsx scripts/escanear-riaf.ts [objetivoJy] [i] [a] T0 [T0 …]
 */
import { KerrSchild } from '../src/physics/metrics/kerrSchild';
import { CpuTracer } from '../src/physics/optics/cpuTracer';
import { DEFAULT_RIAF, RiafModel } from '../src/physics/emission/riaf';
import { blackHoleScales } from '../src/physics/sgra';
import { inclinedCamera } from './lib-camara';

const target = Number(process.argv[2] ?? 2.35);
const inc = Number(process.argv[3] ?? 30);
const a = Number(process.argv[4] ?? 0.5);
const temps = process.argv.slice(5).map(Number);
const sc = blackHoleScales(4e6, 8.2);
const ks = new KerrSchild(a);
const D = 1e4;
const N = 22;
const half = 12;
const thetaG = sc.thetaGMuas / 206264.806247096e6;

function measure(ne0: number, te0: number) {
  const riaf = new RiafModel(ks, { ...DEFAULT_RIAF, ne0, te0, turbulence: 0 });
  const tr = new CpuTracer(ks, riaf, { rEscape: 2 * D, nus: [230e9], rtol: 1e-6, atol: 1e-9, rgCm: sc.rg * 100 });
  const cam = inclinedCamera(ks, D, inc);
  let sum = 0;
  let tauMax = 0;
  let Imax = 0;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const ax = ((2 * (i + 0.5)) / N - 1) * half;
      const by = (1 - (2 * (j + 0.5)) / N) * half;
      const r = tr.trace(cam, [ax / D, by / D, 1]);
      sum += r.I[0];
      tauMax = Math.max(tauMax, r.tau[0]);
      Imax = Math.max(Imax, r.I[0]);
    }
  const Icenter = tr.trace(cam, [0, 0, 1]).I[0];
  const pix = (2 * half) / N;
  return { flux: 1e23 * sum * pix * pix * thetaG * thetaG, tauMax, contrast: Icenter / Imax };
}

for (const te0 of temps) {
  let lo = 1e5;
  let hi = 1e9;
  let m = measure(Math.sqrt(lo * hi), te0);
  for (let it = 0; it < 14; it++) {
    const mid = Math.sqrt(lo * hi);
    m = measure(mid, te0);
    if (m.flux > target) hi = mid;
    else lo = mid;
  }
  const ne0 = Math.sqrt(lo * hi);
  console.log(JSON.stringify({ te0, ne0: +ne0.toPrecision(3), flux: +m.flux.toFixed(3), tauMax: +m.tauMax.toFixed(2), centroSobreMax: +m.contrast.toFixed(3) }));
}
