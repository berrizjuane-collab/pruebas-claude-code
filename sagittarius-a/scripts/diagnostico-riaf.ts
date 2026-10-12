/**
 * Diagnóstico del RIAF: perfil de intensidad a 230 GHz a lo largo de un corte horizontal de la
 * imagen y profundidad óptica en el centro, para un observador lejano.
 * Uso: npx tsx scripts/diagnostico-riaf.ts ne0 te0 [i] [a]
 */
import { KerrSchild } from '../src/physics/metrics/kerrSchild';
import { CpuTracer } from '../src/physics/optics/cpuTracer';
import { DEFAULT_RIAF, RiafModel } from '../src/physics/emission/riaf';
import { blackHoleScales } from '../src/physics/sgra';
import { inclinedCamera } from './lib-camara';

const ne0 = Number(process.argv[2]);
const te0 = Number(process.argv[3]);
const inc = Number(process.argv[4] ?? 30);
const a = Number(process.argv[5] ?? 0.5);
const sc = blackHoleScales(4e6, 8.2);
const ks = new KerrSchild(a);
const riaf = new RiafModel(ks, { ...DEFAULT_RIAF, ne0, te0, turbulence: 0 });
const D = 1e4;
const tr = new CpuTracer(ks, riaf, { rEscape: 2 * D, nus: [230e9], rtol: 1e-7, atol: 1e-9, rgCm: sc.rg * 100 });
const cam = inclinedCamera(ks, D, inc);
const row: string[] = [];
let Imax = 0;
const vals: Array<[number, number, number]> = [];
for (let k = -12; k <= 12; k++) {
  const x = k * 0.75;
  const r = tr.trace(cam, [x / D, 0, 1]);
  vals.push([x, r.I[0], r.tau[0]]);
  Imax = Math.max(Imax, r.I[0]);
}
for (const [x, I, tau] of vals) row.push(`${x.toFixed(1).padStart(6)} ${'#'.repeat(Math.round((40 * I) / Imax)).padEnd(40)} I=${I.toExponential(2)} τ=${tau.toFixed(2)}`);
console.log(`ne0=${ne0} te0=${te0} i=${inc} a=${a}`);
console.log(row.join('\n'));
