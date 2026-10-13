import { describe, expect, it } from 'vitest';
import { ExperimentRunner } from './runner';
import { DEFAULT_LAUNCH, S_R, SAMPLE_SIZE, type LaunchConfig, type PhysEvent } from './types';
import { blackHoleScales } from '../physics/sgra';

const sc = blackHoleScales(4e6, 8.2);
function run(cfg: Partial<LaunchConfig>, a = 0, tMax = 4000) {
  const r = new ExperimentRunner('x', a, { ...DEFAULT_LAUNCH, ...cfg }, 0, { rg: sc.rg, tg: sc.tg });
  const events: PhysEvent[] = [];
  let last = null as ReturnType<ExperimentRunner['advance']> | null;
  let samples = 0;
  while (!r.done) {
    last = r.advance(tMax, 1e9);
    events.push(...last.events);
    samples += last.n;
    if (last.tComputed >= tMax) break;
  }
  return { r, events, last: last!, samples };
}

describe('Experimentos', () => {
  it('cometa en caída radial: se rompe por marea FUERA del horizonte (~30 r_g) y termina en el fin del dominio', () => {
    const { events } = run({ object: 'cometa', scenario: 'radial', r0: 45, theta0Deg: 90 });
    const fr = events.find((e) => e.kind === 'fractura');
    expect(fr).toBeTruthy();
    expect(fr!.r).toBeGreaterThan(20);
    expect(fr!.r).toBeLessThan(40);
    expect(events.find((e) => e.kind === 'horizonte')).toBeTruthy();
    expect(events.find((e) => e.kind === 'fin')).toBeTruthy();
  });

  it('esfera de acero: cruza el horizonte intacta (sin explosión en r₊)', () => {
    const { events } = run({ object: 'esfera', scenario: 'radial', r0: 12, theta0Deg: 90 });
    const hor = events.find((e) => e.kind === 'horizonte')!;
    const fr = events.find((e) => e.kind === 'fractura');
    expect(hor).toBeTruthy();
    if (fr) expect(fr.r).toBeLessThan(0.01);
  });

  it('asteroide monolítico: rotura cerca del horizonte; agregado: mucho más lejos', () => {
    const mono = run({ object: 'asteroide', scenario: 'radial', r0: 30, theta0Deg: 90, rubblePile: false }).events.find((e) => e.kind === 'fractura')!;
    const rub = run({ object: 'asteroide', scenario: 'radial', r0: 30, theta0Deg: 90, rubblePile: true }).events.find((e) => e.kind === 'fractura')!;
    expect(mono.r).toBeGreaterThan(2);
    expect(mono.r).toBeLessThan(3.2);
    expect(rub.r).toBeGreaterThan(15);
  });

  it('órbita circular estable: muestras a r constante y estado «ligado»', () => {
    const { r, last } = run({ object: 'sonda', scenario: 'orbita', orbitType: 'circular', r0: 10, prograde: true }, 0.5, 300);
    expect(r.status).toBe('ligado');
    const rs = last.body!;
    const rr = rs[S_R + (last.n - 1) * SAMPLE_SIZE];
    expect(Math.abs(rr - 10)).toBeLessThan(1e-6);
  });

  it('órbita circular imposible bajo la órbita fotónica: error explícito', () => {
    expect(() => new ExperimentRunner('x', 0, { ...DEFAULT_LAUNCH, scenario: 'orbita', orbitType: 'circular', r0: 2.9 }, 0, { rg: sc.rg, tg: sc.tg })).toThrow(/No existen órbitas circulares/);
  });

  it('sobrevuelo escapa y captura cae, con la misma velocidad local', () => {
    const fly = run({ object: 'esfera', scenario: 'sobrevuelo', r0: 40, vRadial: -0.3, vTangential: 0.1 }, 0.5, 6000);
    const cap = run({ object: 'esfera', scenario: 'captura', r0: 40, vRadial: -0.3, vTangential: 0.1 }, 0.5, 6000);
    expect(fly.events.some((e) => e.kind === 'periastro')).toBe(true);
    expect(fly.events.some((e) => e.kind === 'horizonte')).toBe(false);
    expect(cap.events.some((e) => e.kind === 'horizonte')).toBe(true);
  });

  it('haz de fotones en torno al parámetro crítico: unos capturados y otros escapan', () => {
    const { last } = run({ object: 'fotones', scenario: 'critica', r0: 40, beamCount: 9, beamSpread: 1.5 }, 0, 3000);
    const s = last.photonSummary!;
    const cap = s.filter((p) => p.status === 'capturado').length;
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThan(s.length);
    // Los capturados tienen |b| < √27 y los que escapan |b| > √27
    for (const p of s) {
      if (p.status === 'capturado') expect(Math.abs(p.b)).toBeLessThan(Math.sqrt(27) + 1e-3);
      if (p.status === 'escapado') expect(Math.abs(p.b)).toBeGreaterThan(Math.sqrt(27) - 1e-3);
    }
  });

  it('nube de partículas: reproducible con la misma semilla', () => {
    const a = run({ object: 'nube', scenario: 'radial', r0: 20, cloudCount: 8, seed: 42 }, 0.3, 50).last.particles!;
    const b = run({ object: 'nube', scenario: 'radial', r0: 20, cloudCount: 8, seed: 42 }, 0.3, 50).last.particles!;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
