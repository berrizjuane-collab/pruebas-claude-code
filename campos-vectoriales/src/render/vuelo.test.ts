import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../math/aleatorio';
import type { Vec3 } from '../math/tipos';
import { acotarElevacion, angulosDesdeDireccion, derecha, dilatar, direccion, ELEVACION_MAX, FACTOR_RAPIDO, suavizarVelocidad, velocidadObjetivo, type Angulos } from './vuelo';

/** V-NUM-22 · vuelo y dilatación (SPEC §3.11, §5.11). */
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Proyección central desde el ojo e con la orientación a (coordenadas de pantalla normalizadas). */
function proyectar(p: Vec3, e: Vec3, a: Angulos): [number, number] {
  const f = direccion(a);
  const r = derecha(a);
  const u = cross(r, f);
  const d = sub(p, e);
  const z = dot(d, f);
  return [dot(d, r) / z, dot(d, u) / z];
}

describe('V-NUM-22 · vuelo y dilatación', () => {
  const azar = mulberry32(22);

  it('dirección ↔ ángulos (ida y vuelta) y elevación acotada a ±89°', () => {
    for (let i = 0; i < 200; i++) {
      const a = { azimut: azar() * 2 * Math.PI - Math.PI, elevacion: (azar() * 2 - 1) * ELEVACION_MAX };
      const b = angulosDesdeDireccion(direccion(a));
      expect(b.azimut).toBeCloseTo(a.azimut, 12);
      expect(b.elevacion).toBeCloseTo(a.elevacion, 12);
    }
    expect(angulosDesdeDireccion([0, 0, 1]).elevacion).toBe(ELEVACION_MAX);
    expect(acotarElevacion(-2)).toBe(-ELEVACION_MAX);
  });

  it('la derecha es horizontal, unitaria y perpendicular a la vista', () => {
    for (let i = 0; i < 100; i++) {
      const a = { azimut: azar() * 7, elevacion: (azar() * 2 - 1) * ELEVACION_MAX };
      const r = derecha(a);
      expect(r[2]).toBe(0);
      expect(Math.hypot(...r)).toBeCloseTo(1, 14);
      expect(dot(r, direccion(a))).toBeCloseTo(0, 14);
    }
  });

  it('W avanza según la vista, A/D por la derecha, E/Q por z; diagonales normalizadas; Mayús ×4; v/λ', () => {
    const a = { azimut: 0.7, elevacion: 0.3 };
    const v = velocidadObjetivo({ adelante: 1, lado: 0, vertical: 0, rapido: false }, a, 2, 1);
    direccion(a).forEach((c, k) => expect(v[k]).toBeCloseTo(2 * c, 14));
    const d = velocidadObjetivo({ adelante: 1, lado: 1, vertical: 1, rapido: false }, a, 2, 1);
    expect(Math.hypot(...d)).toBeCloseTo(2, 14);
    const e = velocidadObjetivo({ adelante: 0, lado: 0, vertical: 1, rapido: true }, a, 2, 4);
    expect(e).toEqual([0, 0, (2 * FACTOR_RAPIDO) / 4]);
    expect(velocidadObjetivo({ adelante: 0, lado: 0, vertical: 0, rapido: true }, a, 2, 1)).toEqual([0, 0, 0]);
  });

  it('la velocidad se acerca a la objetivo (constante 0.12 s); con movimiento reducido, de golpe', () => {
    const v = suavizarVelocidad([0, 0, 0], [1, 0, 0], 0.12, false);
    expect(v[0]).toBeCloseTo(1 - Math.exp(-1), 14);
    expect(suavizarVelocidad([0, 0, 0], [1, 2, 3], 0.01, true)).toEqual([1, 2, 3]);
  });

  it('dilatar alrededor del ojo no cambia la imagen (invariancia proyectiva, T-24)', () => {
    const e: Vec3 = [0.3, -4, 1.2];
    const a = { azimut: Math.PI / 2, elevacion: -0.1 };
    let max = 0;
    for (let i = 0; i < 1000; i++) {
      const p: Vec3 = [azar() * 4 - 2, azar() * 4 - 2, azar() * 4 - 2];
      const s = 0.125 + azar() * 63.875;
      const q: Vec3 = [e[0] + s * (p[0] - e[0]), e[1] + s * (p[1] - e[1]), e[2] + s * (p[2] - e[2])];
      const [x0, y0] = proyectar(p, e, a);
      const [x1, y1] = proyectar(q, e, a);
      max = Math.max(max, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
    // En píxeles de una pantalla de 2000 px de semiancho: ≤ 10⁻⁹ px.
    expect(max * 2000).toBeLessThan(1e-9);
  });

  it('dilatar alrededor de c: la posición en la escena (c + λ(r − c)) no cambia y el mundo crece hacia el explorador', () => {
    const c: Vec3 = [0, 0, 0];
    const r: Vec3 = [5, -6, 3];
    const r2 = dilatar(r, c, 1, 2.5);
    for (let k = 0; k < 3; k++) expect(c[k]! + 2.5 * (r2[k]! - c[k]!)).toBeCloseTo(c[k]! + 1 * (r[k]! - c[k]!), 12);
    // En coordenadas del campo, el explorador queda 2.5 veces más cerca de c: el espacio «crece».
    expect(Math.hypot(...r2)).toBeCloseTo(Math.hypot(...r) / 2.5, 12);
    // Ida y vuelta.
    dilatar(r2, c, 2.5, 1).forEach((v, k) => expect(v).toBeCloseTo(r[k]!, 12));
  });
});
