import { describe, expect, it } from 'vitest';
import { VIEWS } from '../../src/config/views.ts';
import { buildLimits, resolveView } from '../../src/camera/limits.ts';
import { constrainCamera, type TerrainQueries } from '../../src/camera/constraints.ts';
import { focusPose } from '../../src/camera/focus.ts';
import { dilateGrid, rayBlocked, TerrainSampler } from '../../src/geo/heightfield.ts';
import { loadData, loadGrid, realSampler } from './helpers.ts';

const data = loadData();
const h0 = data.manifest.sistema.h0;
const sampler = realSampler();
const dil = new TerrainSampler([dilateGrid(loadGrid('core'), 75), dilateGrid(loadGrid('context'), 75)]);
const terrain: TerrainQueries = { heightY: (x, z) => sampler.heightAt(x, -z) - h0, clearanceY: (x, z) => dil.heightAt(x, -z) - h0 };
const limits = buildLimits(data.pois.poi, h0);

describe('vistas predefinidas contra el DEM real', () => {
  it.each(VIEWS.map((v) => [v.id, v]))('%s: válida, con holgura y visual libre al objetivo', (_id, v) => {
    const pose = resolveView(v, data.pois.poi, h0, (x, y) => sampler.heightAt(x, y));
    const c = constrainCamera(pose.position, pose.target, limits, terrain);
    // la pose de diseño ya cumple los límites (no hace falta corregirla)
    expect(Math.hypot(c.x - pose.position.x, c.y - pose.position.y, c.z - pose.position.z)).toBeLessThan(1);
    expect(c.y - terrain.heightY(c.x, c.z)).toBeGreaterThan(40);
    const t = pose.target;
    expect(rayBlocked(sampler, c.x, -c.z, c.y + h0, t.x, -t.z, t.y + h0 + 8, 45)).toBe(false);
  });
  it('encuadres automáticos de cada punto: válidos y con visual libre', () => {
    for (const p of data.pois.poi) {
      const pose = focusPose(p, { h0 }, limits, terrain, sampler);
      const c = pose.position;
      expect(c.y - terrain.heightY(c.x, c.z)).toBeGreaterThan(35);
      const blocked = rayBlocked(sampler, c.x, -c.z, c.y + h0, p.posicion.x, p.posicion.y, p.posicion.altModelo + 8, 45);
      expect(blocked, p.id).toBe(false);
    }
  });
});
