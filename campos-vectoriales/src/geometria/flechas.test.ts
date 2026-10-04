import { describe, expect, it } from 'vitest';
import { calcularFlechas, fraccionMagnitud, grisRampaMagnitud, PROPORCION, puntasHaciaCamara, RADIOS, type AnillosRotacional } from './flechas';
import { crearMalla, escalaAutomatica, muestrearMalla, clasificarCeros } from '../numerics/grid';
import { campoPorId, valoresParametros } from '../math/catalog';
import { lstarDeGris } from '../design/color';

/** REN-02 (1) y parte de V-FUN-05: la geometría de cada flecha corresponde a F y a la rampa. */
const OMEGA = { min: [-2, -2, -2] as const, max: [2, 2, 2] as const };

function preparar(id: Parameters<typeof campoPorId>[0], modo: 'proporcional' | 'normalizado' = 'proporcional') {
  const c = campoPorId(id);
  const p = valoresParametros(c.parametros);
  const malla = crearMalla(OMEGA, [9, 9, 9]);
  const m = muestrearMalla(c.F, p, malla);
  const esc = escalaAutomatica(m.mag, m.clase);
  clasificarCeros(m, esc.ref);
  const lMax = 0.9 * malla.deltaRef;
  return { m, esc, lMax, inst: calcularFlechas(m, { fRef: esc.ref, lMax, modo, luminancia: 'lineal', grosor: 'gruesas' }) };
}

describe('geometría de flechas', () => {
  it('helicoidal: dirección, longitud y gris coinciden con F en todos los nodos', () => {
    const { m, esc, lMax, inst } = preparar('helicoidal');
    expect(inst.n).toBe(729);
    for (let k = 0; k < inst.n; k++) {
      const i = inst.nodo[k] as number;
      const f = [m.F[3 * i], m.F[3 * i + 1], m.F[3 * i + 2]] as number[];
      const mag = m.mag[i] as number;
      // dirección (T-17: < 10⁻⁶ rad)
      const d = [inst.dir[3 * k], inst.dir[3 * k + 1], inst.dir[3 * k + 2]] as number[];
      // ángulo estable: atan2(|d × f|, d · f) (acos es inestable cerca de 1)
      const cx = d[1]! * f[2]! - d[2]! * f[1]!;
      const cy = d[2]! * f[0]! - d[0]! * f[2]!;
      const cz = d[0]! * f[1]! - d[1]! * f[0]!;
      const angulo = Math.atan2(Math.hypot(cx, cy, cz), d[0]! * f[0]! + d[1]! * f[1]! + d[2]! * f[2]!);
      expect(angulo).toBeLessThan(1e-6);
      // longitud proporcional y saturación
      const l = lMax * Math.min(mag / esc.ref, 1);
      expect(Math.abs((inst.largo[k] as number) - l) / l).toBeLessThan(1e-6);
      expect(inst.saturada[k]).toBe(mag >= esc.ref ? 1 : 0);
      // centrada en el nodo
      for (let a = 0; a < 3; a++) {
        const centro = (inst.cola[3 * k + a] as number) + ((inst.dir[3 * k + a] as number) * (inst.largo[k] as number)) / 2;
        expect(Math.abs(centro - (m.pos[3 * i + a] as number))).toBeLessThan(1e-6);
      }
      // gris: L* = 45.2 + 51.3·u (±1/255 en sRGB)
      const u = Math.min(mag / esc.ref, 1);
      const lEsperado = 45.2 + 51.3 * u;
      expect(Math.abs(lstarDeGris((inst.gris[k] as number) * 255) - lEsperado)).toBeLessThan(0.01);
    }
  });

  it('radial saliente: el origen es una marca ≈ 0 y no una flecha', () => {
    const { inst } = preparar('radial-saliente');
    expect(inst.n).toBe(728);
    expect(Array.from(inst.ceros)).toEqual([0, 0, 0]);
  });

  it('rotacional: 9 marcas ≈ 0 sobre el eje z', () => {
    const { inst } = preparar('rotacional');
    expect(inst.ceros.length / 3).toBe(9);
  });

  it('modo normalizado: todas las longitudes iguales; sin saturación', () => {
    const { lMax, inst } = preparar('radial-saliente', 'normalizado');
    for (let k = 0; k < inst.n; k++) {
      expect(inst.largo[k]).toBeCloseTo(PROPORCION.normalizada * lMax, 6);
      expect(inst.saturada[k]).toBe(0);
    }
  });

  it('flechas cortas conservan la forma (el cono escala con la flecha)', () => {
    const inst = calcularFlechas(
      { total: 1, pos: [0, 0, 0], F: [0.1, 0, 0], mag: [0.1], clase: [0] },
      { fRef: 1, lMax: 1, modo: 'proporcional', luminancia: 'lineal', grosor: 'gruesas' },
    );
    expect(inst.largo[0]).toBeCloseTo(0.1, 6);
    expect((inst.cono[0] as number) / (inst.largo[0] as number)).toBeCloseTo(1 / 1.5, 6);
  });

  it('grosor (D-80): «finas» solo adelgaza cilindro y cono; largo, cono, dirección y gris no cambian', () => {
    const e = { total: 2, pos: [0, 0, 0, 1, 1, 1], F: [2, 0, 0, 0, 0.3, 0], mag: [2, 0.3], clase: [0, 0] };
    const o = { fRef: 1, lMax: 1, modo: 'proporcional', luminancia: 'lineal' } as const;
    const finas = calcularFlechas(e, { ...o, grosor: 'finas' });
    const gruesas = calcularFlechas(e, { ...o, grosor: 'gruesas' });
    for (const k of ['cola', 'dir', 'largo', 'cono', 'gris', 'saturada'] as const) expect(Array.from(finas[k])).toEqual(Array.from(gruesas[k]));
    // Flecha saturada (s = 1): radios exactos; la corta (s < 1) los escala igual que el cono.
    expect(finas.radio[0]).toBeCloseTo(RADIOS.finas.radio, 7);
    expect(finas.radioCono[0]).toBeCloseTo(RADIOS.finas.radioCono, 7);
    expect(gruesas.radio[0]).toBeCloseTo(PROPORCION.radio, 7);
    expect((finas.radio[1] as number) / (gruesas.radio[1] as number)).toBeCloseTo(RADIOS.finas.radio / RADIOS.gruesas.radio, 6);
    // Varilla y punta de aguja: el cono es al menos 3.5 veces más largo que ancho.
    expect(PROPORCION.cono / (2 * RADIOS.finas.radioCono)).toBeGreaterThanOrEqual(3.5);
  });

  it('nodos no definidos → aspa', () => {
    const inst = calcularFlechas(
      { total: 2, pos: [0, 0, 0, 1, 1, 1], F: [NaN, 0, 0, 1, 0, 0], mag: [NaN, 1], clase: [2, 0] },
      { fRef: 1, lMax: 1, modo: 'proporcional', luminancia: 'lineal', grosor: 'gruesas' },
    );
    expect(inst.n).toBe(1);
    expect(Array.from(inst.indefinidos)).toEqual([0, 0, 0]);
  });
});

describe('rampa de magnitud', () => {
  it('extremos #6B6B6B y #F5F5F5; punto medio L* 70.85', () => {
    expect(Math.round(grisRampaMagnitud(0) * 255)).toBe(0x6b);
    expect(Math.round(grisRampaMagnitud(1) * 255)).toBe(0xf5);
    expect(lstarDeGris(grisRampaMagnitud(0.5) * 255)).toBeCloseTo(70.85, 6);
  });
  it('luminancia logarítmica: u = log10(1 + 9 r), saturada en 1', () => {
    expect(fraccionMagnitud(1, 1, 'log')).toBeCloseTo(1, 12);
    expect(fraccionMagnitud(0.5, 1, 'log')).toBeCloseTo(Math.log10(5.5), 12);
    expect(fraccionMagnitud(3, 1, 'log')).toBe(1);
  });
});

describe('REN-07 · puntas de los anillos hacia la cámara', () => {
  // Un anillo de radio 0.2 en el origen con eje +z.
  const a: AnillosRotacional = {
    n: 1,
    centro: Float32Array.from([0, 0, 0]),
    radio: Float32Array.from([0.2]),
    punta: Float32Array.from([0, 0.2, 0, 0, -0.2, 0]),
    tangente: Float32Array.from([-1, 0, 0, 1, 0, 0]),
    largoPunta: Float32Array.from([0.05]),
    radioPunta: Float32Array.from([0.02]),
  };
  const dir = Float32Array.from([0, 0, 1]);

  it('la punta delantera, en el punto del anillo más cercano a la cámara, con el giro de la mano derecha', () => {
    const punta = new Float32Array(6);
    const tangente = new Float32Array(6);
    puntasHaciaCamara(a, dir, [5, -5, 3], punta, tangente);
    const s = Math.SQRT1_2;
    expect(Array.from(punta.slice(0, 3)).map((x) => Number(x.toFixed(6)))).toEqual([Number((0.2 * s).toFixed(6)), Number((-0.2 * s).toFixed(6)), 0]);
    // t = d × e1 = ẑ × (s, −s, 0) = (s, s, 0): antihorario visto desde +z.
    expect(tangente[0]).toBeCloseTo(s, 6);
    expect(tangente[1]).toBeCloseTo(s, 6);
    // La trasera, opuesta y con la tangente opuesta.
    expect(punta[3]).toBeCloseTo(-0.2 * s, 6);
    expect(tangente[3]).toBeCloseTo(-s, 6);
  });

  it('con la cámara sobre el eje (anillo de frente) se conservan las puntas geométricas', () => {
    const punta = new Float32Array(6);
    const tangente = new Float32Array(6);
    puntasHaciaCamara(a, dir, [0.001, 0, 10], punta, tangente);
    expect(Array.from(punta)).toEqual(Array.from(a.punta));
    expect(Array.from(tangente)).toEqual(Array.from(a.tangente));
  });
});
