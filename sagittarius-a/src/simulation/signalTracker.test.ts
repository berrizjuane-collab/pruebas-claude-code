import { describe, expect, it } from 'vitest';
import { computeSignalTrack } from './signalTracker';
import { KerrSchild } from '../physics/metrics/kerrSchild';
import { GeodesicIntegrator, integrateSampled } from '../physics/geodesics/geodesic';
import { gramSchmidtTetrad, staticObserver } from '../physics/observers/observers';

describe('Señal recibida (problema emisor–observador)', () => {
  it('caída radial vista desde el mismo radio: g y tiempos coinciden con la solución radial exacta', () => {
    const ks = new KerrSchild(0);
    const r0 = 10;
    const u0 = staticObserver(ks, r0, 0, 0)!;
    const gi = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-12, atol: 1e-14 });
    gi.reset(0, [r0, 0, 0], ks.lower(r0, 0, 0, u0));
    const rows: number[] = [];
    integrateSampled(gi, 200, 0.25, (t, y) => {
      const u = ks.raise(y[0], y[1], y[2], [y[3], y[4], y[5], y[6]]);
      rows.push(t, y[0], y[1], y[2], u[0], u[1], u[2], u[3], y[7]);
    });
    // Cámara estática en r = 30 sobre el mismo eje (+x), mirando hacia el agujero
    const rc = 30;
    const uc = staticObserver(ks, rc, 0, 0)!;
    const tet = gramSchmidtTetrad(ks, rc, 0, 0, uc, [
      [0, -1, 0, 0],
      [0, 0, 0, 1],
      [0, 0, 1, 0],
    ]);
    const e = [tet.e[0], tet.e[3], tet.e[2], tet.e[1]].map((v) => Array.from(v));
    const E = Math.sqrt(1 - 2 / r0);
    const res = computeSignalTrack({ a: 0, emitter: Float64Array.from(rows), stride: 9, camera: { pos: [rc, 0, 0], e }, tFrom: 25, tTo: 70, n: 10 });
    let checked = 0;
    for (let k = 0; k < res.tRec.length; k++) {
      if (!res.found[k]) continue;
      const re = res.rEmit[k];
      // g analítico para fotón radial saliente: (1 − 2/r_e) / (√(1 − 2/r_c) (E + √(E² − 1 + 2/r_e)))
      const gA = (1 - 2 / re) / (Math.sqrt(1 - 2 / rc) * (E + Math.sqrt(E * E - 1 + 2 / re)));
      expect(Math.abs(res.g[k] - gA) / gA).toBeLessThan(1e-5);
      // t_r − t_e = Δt_KS saliente: (r_c − r_e) + 4 ln((r_c − 2)/(r_e − 2))
      const dt = rc - re + 4 * Math.log((rc - 2) / (re - 2));
      expect(Math.abs(res.tRec[k] - res.tEmit[k] - dt)).toBeLessThan(1e-4);
      checked++;
    }
    expect(checked).toBeGreaterThan(6);
    // La señal se enrojece monótonamente
    const gs = res.g.filter((_v, k) => res.found[k]);
    for (let k = 1; k < gs.length; k++) expect(gs[k]).toBeLessThan(gs[k - 1]);
  });
});
