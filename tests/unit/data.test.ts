import { describe, expect, it } from 'vitest';
import { routePolyline, validateAtlas } from '../../src/data/validate.ts';
import { loadData, loadGrid } from './helpers.ts';

describe('datos del atlas', () => {
  const data = loadData();
  it('pasa la validación completa sin errores', () => {
    const v = validateAtlas(data);
    expect(v.errors).toEqual([]);
  });
  it('detecta errores: campamento fuera de su ruta y tramo inexistente', () => {
    const bad = structuredClone(data);
    const c1 = bad.pois.poi.find((p) => p.id === 'c1-abruzzi')!;
    c1.rutas = ['cesen'];
    bad.routes.rutas.cesen.tramos.push('no-existe');
    const v = validateAtlas(bad);
    expect(v.errors.some((e) => e.includes('c1-abruzzi'))).toBe(true);
    expect(v.errors.some((e) => e.includes('no-existe'))).toBe(true);
  });
  it('el tramo común (Hombro → cumbre) se guarda una sola vez y lo usan ambas vías', () => {
    const { rutas } = data.routes;
    const shared = rutas.abruzzi.tramos.filter((t) => rutas.cesen.tramos.includes(t));
    expect(shared).toContain('comun-hombro-cumbre');
    expect(Object.keys(data.routes.tramos).filter((k) => k === 'comun-hombro-cumbre')).toHaveLength(1);
  });
  it('los campamentos del Česen no reutilizan los del Abruzzi y el C4 es común', () => {
    const camps = data.pois.poi.filter((p) => p.categoria === 'campamento');
    const ces = camps.filter((p) => p.rutas.includes('cesen'));
    expect(ces.map((p) => p.id).sort()).toEqual(['c2-cesen', 'c3-cesen', 'c4', 'campo-base'].sort());
    const c4 = camps.find((p) => p.id === 'c4')!;
    expect(c4.rutas.sort()).toEqual(['abruzzi', 'cesen']);
  });
  it('altitudes del modelo coherentes con las de referencia en los campos colocados por altitud', () => {
    for (const p of data.pois.poi.filter((q) => q.metodoColocacion === 'ruta-altitud')) {
      expect(Math.abs(p.diferenciaModeloRef ?? 0)).toBeLessThan(1);
      if (p.altitudRef?.min !== undefined) {
        expect(p.posicion.altModelo).toBeGreaterThanOrEqual(p.altitudRef.min - 1);
        expect(p.posicion.altModelo).toBeLessThanOrEqual(p.altitudRef.max! + 1);
      }
    }
  });
  it('orden altimétrico Bottleneck < travesía < serac < cumbre y zona de la muerte en 8000 m', () => {
    const alt = (id: string) => data.pois.poi.find((p) => p.id === id)!.posicion.altModelo;
    expect(alt('zona-muerte')).toBeCloseTo(8000, 0);
    expect(alt('bottleneck')).toBeLessThan(alt('travesia'));
    expect(alt('travesia')).toBeLessThan(alt('serac'));
    expect(alt('serac')).toBeLessThan(alt('cumbre'));
  });
  it('las rutas se apoyan en el relieve (diferencia < 1 m con el DEM del núcleo)', () => {
    const g = loadGrid('core');
    for (const r of Object.keys(data.routes.rutas))
      for (const [x, y, a] of routePolyline(data, r)) expect(Math.abs(g.sample(x, y) - a)).toBeLessThan(1);
  });
  it('las rutas ascienden: la altitud final de cada vía es la cumbre', () => {
    for (const r of Object.keys(data.routes.rutas)) {
      const pl = routePolyline(data, r);
      expect(pl.at(-1)![2]).toBeCloseTo(8611, 0);
      expect(pl[0][2]).toBeLessThan(5100);
    }
  });
  it('el serac está por encima de la travesía y a lo largo de una curva de nivel', () => {
    const s = data.serac;
    const alts = s.linea.map((p) => p[2]);
    expect(Math.max(...alts) - Math.min(...alts)).toBeLessThan(5);
    const trav = data.pois.poi.find((p) => p.id === 'travesia')!;
    expect(Math.min(...alts)).toBeGreaterThan(trav.posicion.altModelo);
  });
});
