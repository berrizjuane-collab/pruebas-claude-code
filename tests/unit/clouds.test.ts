import { describe, expect, it } from 'vitest';
import { BANNER, CLOUD_DECK, layoutClouds } from '../../src/scene/cloudLayout.ts';
import { realSampler } from './helpers.ts';

describe('nubes sobre el relieve real', () => {
  const terrain = realSampler();
  const heightAt = (x: number, y: number) => terrain.heightAt(x, y);
  const summit = { x: -75, y: -200 };
  const puffs = layoutClouds(heightAt, { summit, half: 20000 });
  it('hay mar de nubes y nube de bandera', () => {
    const mar = puffs.filter((p) => p.kind === 'mar');
    const bandera = puffs.filter((p) => p.kind === 'bandera');
    console.log(`nubes: ${mar.length} copos de mar, ${bandera.length} de bandera`);
    expect(mar.length).toBeGreaterThanOrEqual(20);
    expect(bandera.length).toBeGreaterThanOrEqual(3);
  });
  it('cada copo está en su franja de altitud', () => {
    for (const p of puffs) {
      const band = p.kind === 'mar' ? CLOUD_DECK : BANNER;
      expect(p.alt + p.h / 2).toBeLessThanOrEqual(band.max + 1);
      expect(p.alt).toBeGreaterThanOrEqual(band.min - p.h);
    }
  });
  it('el centro de cada copo queda sobre el relieve (las laderas se funden en el shader)', () => {
    for (const p of puffs) expect(heightAt(p.x, p.y)).toBeLessThan(p.alt - p.h * 0.15);
  });
  it('hay nubes pegadas al macizo (collar a menos de 4,5 km de la cumbre)', () => {
    const near = puffs.filter((p) => p.kind === 'mar' && Math.hypot(p.x - summit.x, p.y - summit.y) < 4500);
    expect(near.length).toBeGreaterThanOrEqual(10);
  });
  it('la bandera está a sotavento (al este) de la cumbre', () => {
    for (const p of puffs.filter((q) => q.kind === 'bandera')) expect(p.x).toBeGreaterThan(summit.x + 300);
  });
  it('es determinista', () => {
    expect(layoutClouds(heightAt, { summit, half: 20000 })).toEqual(puffs);
  });
});
