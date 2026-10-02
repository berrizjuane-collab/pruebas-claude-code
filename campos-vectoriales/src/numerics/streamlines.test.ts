import { describe, expect, it } from 'vitest';
import { derivadaNormalizada, integrarLinea, integrarRama, PasoRK4, type LineaCorriente, type OpcionesIntegracion } from './streamlines';
import { campoPorId } from '../math/catalog';
import { compilarCampo } from '../math/field';
import type { Dominio, EvaluadorCampo, Vec3 } from '../math/tipos';

const OMEGA: Dominio = { min: [-2, -2, -2], max: [2, 2, 2] };
/** Registra un error medido junto al de la calibración (VALIDATION §2). */
const medida = (t: string, que: string, valor: string, calibracion: string) => console.log(`MEDIDA ${t} · ${que}: ${valor} (calibración: ${calibracion})`);
const H = 0.0625; // Δ/8 con N = 9 en [−2, 2]³
const opciones = (o: Partial<OpcionesIntegracion> = {}): OpcionesIntegracion => ({
  dominio: OMEGA,
  paso: H,
  longitudMax: 4 * Math.hypot(4, 4, 4),
  pasosMax: 4000,
  fRef: 3,
  ...o,
});
const campo = (P: string, Q: string, R: string, params: string[] = []): EvaluadorCampo => {
  const r = compilarCampo({ P, Q, R }, params);
  if (!r.ok) throw new Error(`${P}, ${Q}, ${R}`);
  return r.campo.F;
};
const linea = (F: EvaluadorCampo, p: Float64Array, s: Vec3, o = opciones()): LineaCorriente => {
  const l = integrarLinea(F, p, s, o);
  if ('descartada' in l) throw new Error(`semilla descartada: ${l.descartada}`);
  return l;
};
const punto = (l: { puntos: Float64Array }, i: number): [number, number, number] => [
  l.puntos[3 * i] as number,
  l.puntos[3 * i + 1] as number,
  l.puntos[3 * i + 2] as number,
];

describe('V-NUM-03 · campo uniforme: rectas', () => {
  for (const v of [
    [1, 0, 0],
    [0.3, -0.7, 0.2],
    [0, 0, -2],
  ] as const) {
    it(`F = (${v.join(', ')}): rectas paralelas a F que terminan en el borde (T-06, T-16)`, () => {
      const F = campoPorId('uniforme').F;
      const p = Float64Array.from(v);
      const s: Vec3 = [0.1, -0.2, 0.3];
      const l = linea(F, p, s);
      const u = v.map((c) => c / Math.hypot(...v));
      let maxPerp = 0;
      for (let i = 0; i < l.n; i++) {
        const q = punto(l, i);
        const d = [q[0] - s[0], q[1] - s[1], q[2] - s[2]];
        const t = d[0]! * u[0]! + d[1]! * u[1]! + d[2]! * u[2]!;
        const perp = Math.hypot(d[0]! - t * u[0]!, d[1]! - t * u[1]!, d[2]! - t * u[2]!);
        maxPerp = Math.max(maxPerp, perp);
        expect(perp).toBeLessThanOrEqual(1e-12 * 7);
      }
      expect(l.motivoAdelante).toBe('SALE_DOMINIO');
      expect(l.motivoAtras).toBe('SALE_DOMINIO');
      let maxCara = 0;
      for (const extremo of [punto(l, 0), punto(l, l.n - 1)]) {
        const dCara = Math.min(...extremo.map((c) => Math.abs(Math.abs(c) - 2)));
        maxCara = Math.max(maxCara, dCara);
        expect(dCara).toBeLessThanOrEqual(1e-9 * 4);
      }
      medida('T-06', `rectitud, F = (${v.join(', ')}), desviación máxima`, maxPerp.toExponential(2), '0');
      medida('T-16', `recorte al borde, F = (${v.join(', ')}), distancia máxima a la cara`, maxCara.toExponential(2), 'h/2³⁰ ≈ 6e-11');
    });
  }
});

describe('V-NUM-04 · campos radiales', () => {
  it('saliente: semirrectas alineadas con la semilla (T-15)', () => {
    const F = campoPorId('radial-saliente').F;
    const s: Vec3 = [0.4, -0.3, 0.5];
    const l = linea(F, Float64Array.of(1), s);
    let maxAl = 0;
    for (let i = 0; i < l.n; i++) {
      const q = punto(l, i);
      const c = Math.hypot(q[1] * s[2] - q[2] * s[1], q[2] * s[0] - q[0] * s[2], q[0] * s[1] - q[1] * s[0]);
      const al = c / (Math.hypot(...q) * Math.hypot(...s));
      maxAl = Math.max(maxAl, al);
      expect(al).toBeLessThanOrEqual(1e-12);
    }
    medida('T-15', 'alineación radial, máximo', maxAl.toExponential(2), '—');
    expect(l.motivoAdelante).toBe('SALE_DOMINIO');
    expect(l.motivoAtras).toBe('CERO');
  });

  it('entrante: se detiene en «CERO» cerca del origen (‖r‖ ≤ ε·F_ref/k + h)', () => {
    const F = campoPorId('radial-entrante').F;
    const r = integrarRama(F, Float64Array.of(1), [1, 1, 1], 1, opciones(), null);
    expect(r.motivo).toBe('CERO');
    expect(Math.hypot(...punto(r, r.n - 1))).toBeLessThanOrEqual(1e-3 * 3 + H);
  });
});

describe('V-NUM-05 · campo rotacional: circunferencias', () => {
  for (const w of [1, -1]) {
    for (const rho of [0.25, 1, 1.9]) {
      it(`ω = ${w}, ρ₀ = ${rho}: radio conservado, z constante, sentido y cierre exacto en la semilla (T-07, T-08)`, () => {
        const F = campoPorId('rotacional').F;
        const s: Vec3 = [rho, 0, 0.7];
        const l = linea(F, Float64Array.of(w), s);
        expect(l.motivoAdelante).toBe('ORBITA_CERRADA');
        const theta = H / rho;
        const prediccion = ((2 * Math.PI) / 144) * theta ** 5; // amplificación de RK4 por vuelta
        let maxDr = 0;
        for (let i = 0; i < l.n; i++) {
          const q = punto(l, i);
          maxDr = Math.max(maxDr, Math.abs(Math.hypot(q[0], q[1]) - rho) / rho);
          expect(Math.abs(q[2] - 0.7)).toBeLessThanOrEqual(1e-12);
        }
        expect(maxDr).toBeLessThanOrEqual(10 * prediccion + 1e-13);
        // Cierre sin sobrepasar la semilla: longitud = 2πρ₀ (relativo ≤ 10⁻³) y el último tramo avanza.
        expect(Math.abs(l.longitud - 2 * Math.PI * rho) / (2 * Math.PI * rho)).toBeLessThanOrEqual(1e-3);
        const [a, b, c] = [punto(l, l.n - 3), punto(l, l.n - 2), punto(l, l.n - 1)];
        expect((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])).toBeGreaterThan(0);
        expect(punto(l, l.n - 1)).toEqual(s);
        // Error de posición frente a la circunferencia exacta recorrida a la misma σ (T-08).
        let maxPos = 0;
        for (let i = l.indiceSemilla; i < l.n - 1; i++) {
          const q = punto(l, i);
          const ang = (w * (i - l.indiceSemilla) * H) / rho;
          maxPos = Math.max(maxPos, Math.hypot(q[0] - rho * Math.cos(ang), q[1] - rho * Math.sin(ang)));
        }
        if (w === 1) {
          medida('T-07', `radio, ρ₀ = ${rho}, |ρ − ρ₀|/ρ₀ máximo`, `${maxDr.toExponential(2)} (tolerancia ${(10 * prediccion).toExponential(2)})`, rho === 1 ? '2.5e-8' : '—');
          medida('T-08', `cierre, ρ₀ = ${rho}, error de posición máximo`, `${maxPos.toExponential(2)}; |longitud − 2πρ₀|/2πρ₀ = ${(Math.abs(l.longitud - 2 * Math.PI * rho) / (2 * Math.PI * rho)).toExponential(2)}`, rho === 1 ? '2.2e-7' : '—');
        }
        // Sentido: antihorario visto desde +z si ω > 0.
        const q1 = punto(l, l.indiceSemilla + 1);
        expect(Math.sign(s[0] * q1[1] - s[1] * q1[0])).toBe(Math.sign(w));
      });
    }
  }

  it('las semillas sobre el eje z se descartan como ≈ 0', () => {
    const r = integrarLinea(campoPorId('rotacional').F, Float64Array.of(1), [0, 0, 0.5], opciones());
    expect(r).toEqual({ descartada: 'cero' });
  });
});

/** Recorre la línea desde la semilla hasta completar una vuelta (ángulo 2π) e interpola z y σ. */
function unaVuelta(l: LineaCorriente, h: number) {
  let angulo = 0;
  let previo = Math.atan2(punto(l, l.indiceSemilla)[1], punto(l, l.indiceSemilla)[0]);
  for (let i = l.indiceSemilla + 1; i < l.n; i++) {
    const q = punto(l, i);
    const actual = Math.atan2(q[1], q[0]);
    let d = actual - previo;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    const nuevo = angulo + d;
    if (Math.abs(nuevo) >= 2 * Math.PI) {
      const f = (2 * Math.PI - Math.abs(angulo)) / Math.abs(d);
      const a = punto(l, i - 1);
      const sigma = (i - 1 - l.indiceSemilla + f) * h;
      return { dz: a[2] + f * (q[2] - a[2]) - punto(l, l.indiceSemilla)[2], sigma, signo: Math.sign(nuevo) };
    }
    angulo = nuevo;
    previo = actual;
  }
  throw new Error('la línea no completó una vuelta');
}

describe('V-NUM-06 · campo helicoidal: hélices', () => {
  for (const a of [0.25, -0.25]) {
    for (const rho of [0.5, 1, 2]) {
      it(`a = ${a}, ρ₀ = ${rho}: paso 2πa, radio, quiralidad y longitud por vuelta (T-09, T-10)`, () => {
        const F = campoPorId('helicoidal').F;
        const dominio: Dominio = { min: [-3, -3, -20], max: [3, 3, 20] };
        const l = linea(F, Float64Array.of(a), [rho, 0, 0], opciones({ dominio }));
        const v = unaVuelta(l, H);
        expect(Math.abs(v.dz - 2 * Math.PI * a) / Math.abs(2 * Math.PI * a)).toBeLessThanOrEqual(1e-5);
        expect(Math.abs(v.sigma - 2 * Math.PI * Math.hypot(rho, a)) / (2 * Math.PI * Math.hypot(rho, a))).toBeLessThanOrEqual(1e-5);
        // Quiralidad: dθ/ds y dz/ds del mismo signo si a > 0 (dextrógira).
        expect(v.signo * Math.sign(v.dz)).toBe(Math.sign(a));
        let maxDr = 0;
        for (let i = 0; i < l.n; i++) maxDr = Math.max(maxDr, Math.abs(Math.hypot(punto(l, i)[0], punto(l, i)[1]) - rho) / rho);
        const theta = H / Math.hypot(rho, a);
        expect(maxDr).toBeLessThanOrEqual(Math.max(1e-6, 10 * ((2 * Math.PI) / 144) * theta ** 5 * Math.ceil(l.longitud / (2 * Math.PI * Math.hypot(rho, a)))));
        if (a > 0) {
          medida('T-09', `paso de hélice, ρ₀ = ${rho}, relativo`, (Math.abs(v.dz - 2 * Math.PI * a) / Math.abs(2 * Math.PI * a)).toExponential(2), rho === 1 ? '8.0e-8' : '—');
          medida('T-10', `radio de hélice, ρ₀ = ${rho}, relativo máximo`, maxDr.toExponential(2), rho === 1 ? '2.3e-8' : '—');
        }
      });
    }
  }
});

describe('V-NUM-07 · campo silla: invariante xy', () => {
  it('xy constante a lo largo de cada línea (T-11) y separatrices', () => {
    const F = campoPorId('silla').F;
    let maxInv = 0;
    for (const s of [
      [0.2, 1.5, 0],
      [-0.5, 0.8, 1],
      [1.2, -0.3, -1],
    ] as Vec3[]) {
      const l = linea(F, Float64Array.of(1), s);
      const c0 = s[0] * s[1];
      for (let i = 0; i < l.n; i++) {
        const q = punto(l, i);
        const e = Math.abs(q[0] * q[1] - c0) / Math.abs(c0);
        maxInv = Math.max(maxInv, e);
        expect(e).toBeLessThanOrEqual(1e-5);
      }
    }
    medida('T-11', 'invariante xy, relativo máximo (3 líneas)', maxInv.toExponential(2), '2.2e-7');
    // Sobre y = 0 la línea sigue el eje x (separatriz inestable).
    const sep = linea(F, Float64Array.of(1), [0.5, 0, 0]);
    for (let i = 0; i < sep.n; i++) expect(punto(sep, i)[1]).toBe(0);
  });
});

describe('V-NUM-08 · orden de convergencia de RK4 normalizado', () => {
  it('arco σ = 1.5 de la circunferencia unidad, h = 0.3 → 0.0375: p ∈ [3.7, 4.3] (T-12)', () => {
    const F = campoPorId('rotacional').F;
    const G = derivadaNormalizada(F, Float64Array.of(1), 1, 1e-12);
    const rk = new PasoRK4();
    const errores = [0.3, 0.15, 0.075, 0.0375].map((h) => {
      const r = Float64Array.of(1, 0, 0);
      const s = new Float64Array(3);
      const pasos = Math.round(1.5 / h);
      for (let i = 0; i < pasos; i++) {
        rk.paso(G, r, 1.5 / pasos, s);
        r.set(s);
      }
      return Math.hypot((r[0] as number) - Math.cos(1.5), (r[1] as number) - Math.sin(1.5));
    });
    const ordenes = errores.slice(1).map((e, i) => Math.log2((errores[i] as number) / e));
    medida('T-12', 'orden de RK4 normalizado (arco 1.5)', ordenes.map((o) => o.toFixed(3)).join(' / '), '3.92 – 3.95');
    for (const orden of ordenes) {
      expect(orden).toBeGreaterThanOrEqual(3.7);
      expect(orden).toBeLessThanOrEqual(4.3);
    }
  });
});

describe('V-NUM-09 · criterios de parada', () => {
  const p = new Float64Array(0);
  it('SALE_DOMINIO (uniforme) y CERO (radial entrante)', () => {
    expect(integrarRama(campoPorId('uniforme').F, Float64Array.of(1, 0, 0), [0, 0, 0], 1, opciones(), null).motivo).toBe('SALE_DOMINIO');
    expect(integrarRama(campoPorId('radial-entrante').F, Float64Array.of(1), [1, 0, 0], 1, opciones(), null).motivo).toBe('CERO');
  });

  it('NO_DEFINIDO: la línea se detiene antes de entrar en x < 0 y ningún punto queda sin definir', () => {
    const F = campo('-1 + 0*sqrt(x)', '0', '0');
    const r = integrarRama(F, p, [1, 0.3, 0], 1, opciones(), null);
    expect(r.motivo).toBe('NO_DEFINIDO');
    for (let i = 0; i < r.n; i++) expect(punto(r, i)[0]).toBeGreaterThanOrEqual(0);
    expect(punto(r, r.n - 1)[0]).toBeLessThan(H);
  });

  it('ORBITA_CERRADA (rotacional), LONGITUD_MAX y PASOS_MAX (helicoidal en un dominio alto)', () => {
    expect(linea(campoPorId('rotacional').F, Float64Array.of(1), [1, 0, 0]).motivoAdelante).toBe('ORBITA_CERRADA');
    const alto: Dominio = { min: [-3, -3, -50], max: [3, 3, 50] };
    const largo = integrarRama(campoPorId('helicoidal').F, Float64Array.of(0.25), [1, 0, 0], 1, opciones({ dominio: alto, longitudMax: 10 }), null);
    expect(largo.motivo).toBe('LONGITUD_MAX');
    expect(largo.longitud).toBeGreaterThanOrEqual(10);
    expect(largo.longitud).toBeLessThan(10 + H + 1e-12);
    const pasos = integrarRama(campoPorId('helicoidal').F, Float64Array.of(0.25), [1, 0, 0], 1, opciones({ dominio: alto, pasosMax: 100 }), null);
    expect(pasos.motivo).toBe('PASOS_MAX');
    expect(pasos.n).toBe(101);
  });

  it('ESTANCADA: discontinuidad de dirección con ‖F‖ = 1 a ambos lados (−x/|x|)', () => {
    const F = campo('-x/abs(x)', '0', '0');
    // Semilla no conmensurable con h: desde x = 0.5 una etapa cae justo en x = 0 (0/0, NO_DEFINIDO).
    const r = integrarRama(F, p, [0.4713, 0, 0], 1, opciones(), null);
    expect(r.motivo).toBe('ESTANCADA');
    expect(Math.abs(punto(r, r.n - 1)[0])).toBeLessThan(H);
  });

  it('un zigzag donde el campo es casi nulo (0.03 % de F_ref) se clasifica como CERO', () => {
    const F = campo('-tanh(1000*x)', '0.001', '0');
    expect(integrarRama(F, p, [0.5, 0, 0], 1, opciones(), null).motivo).toBe('CERO');
  });
});
