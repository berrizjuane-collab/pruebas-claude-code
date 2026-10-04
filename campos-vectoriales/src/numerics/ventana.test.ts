import { describe, expect, it } from 'vitest';
import type { Dominio, Vec3 } from '../math/tipos';
import { crearMalla } from './grid';
import { desplazamientoVentana, ladoCeldaSemillas, semillasAncladas, ventanaDesplazada } from './ventana';

/** V-NUM-21 · ventana del espacio sin límites y semillas ancladas (SPEC §3.11, §5.11). */
const OMEGA: Dominio = { min: [-2, -2, -2], max: [2, 2, 2] };

describe('V-NUM-21 · ventana anclada a la red', () => {
  const malla = crearMalla(OMEGA, [9, 9, 9]);
  const delta = malla.delta as unknown as Vec3;

  it('m = redondeo de (c_cám − c)/Δ por eje; sin −0', () => {
    expect(desplazamientoVentana(OMEGA, delta, [0.2, -0.2, 0])).toEqual([0, 0, 0]);
    expect(desplazamientoVentana(OMEGA, delta, [1.26, -0.76, 7.4])).toEqual([3, -2, 15]);
  });

  it('los nodos de cualquier ventana están sobre la red de Ω (T-25)', () => {
    for (const m of [[3, -2, 15], [-40, 7, 1], [1000, -1000, 3]] as const) {
      const v = ventanaDesplazada(OMEGA, delta, m);
      const nodos = crearMalla(v, [9, 9, 9]);
      for (let k = 0; k < 3; k++) {
        for (const x of nodos.ejes[k]!) {
          const i = Math.round((x - OMEGA.min[k]!) / delta[k]!);
          expect(Math.abs(x - (OMEGA.min[k]! + i * delta[k]!))).toBeLessThanOrEqual(1e-12 * 4 * Math.max(1, Math.abs(x)));
        }
      }
    }
  });

  it('dos ventanas desplazadas comparten exactamente las semillas de su intersección', () => {
    const D = ladoCeldaSemillas(OMEGA, 32);
    expect(D).toBeCloseTo(Math.cbrt(64 / 32), 14);
    const a = semillasAncladas(OMEGA, OMEGA.min, D, 1);
    const v = ventanaDesplazada(OMEGA, delta, [3, -1, 2]);
    const b = semillasAncladas(v, OMEGA.min, D, 1);
    const dentro = (d: Dominio, q: number[]) => q.every((c, k) => c >= d.min[k]! && c <= d.max[k]!);
    const lista = (s: Float64Array) => Array.from({ length: s.length / 3 }, (_, i) => [s[3 * i]!, s[3 * i + 1]!, s[3 * i + 2]!]);
    const interseccion: Dominio = { min: [0, 0, 0].map((_, k) => Math.max(OMEGA.min[k]!, v.min[k]!)) as unknown as Vec3, max: [0, 0, 0].map((_, k) => Math.min(OMEGA.max[k]!, v.max[k]!)) as unknown as Vec3 };
    const ea = lista(a).filter((q) => dentro(interseccion, q)).map((q) => q.join(',')).sort();
    const eb = lista(b).filter((q) => dentro(interseccion, q)).map((q) => q.join(',')).sort();
    expect(ea.length).toBeGreaterThan(3);
    expect(ea).toEqual(eb);
    // Unas 32 por ventana y todas dentro de ella.
    expect(a.length / 3).toBeGreaterThan(12);
    expect(a.length / 3).toBeLessThan(64);
    expect(lista(b).every((q) => dentro(v, q))).toBe(true);
  });

  it('otra semilla visible da otras posiciones; la misma, las mismas (bit a bit)', () => {
    const D = ladoCeldaSemillas(OMEGA, 32);
    expect(Array.from(semillasAncladas(OMEGA, OMEGA.min, D, 1))).toEqual(Array.from(semillasAncladas(OMEGA, OMEGA.min, D, 1)));
    expect(Array.from(semillasAncladas(OMEGA, OMEGA.min, D, 2))).not.toEqual(Array.from(semillasAncladas(OMEGA, OMEGA.min, D, 1)));
  });
});
