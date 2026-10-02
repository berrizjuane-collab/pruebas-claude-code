import { afterEach, describe, expect, it, vi } from 'vitest';
import { compilarCampo } from '../math/field';
import type { Dominio } from '../math/tipos';
import { experimentoDesdeCatalogo } from '../state/schema';
import { generarSemillas } from '../numerics/seeds';
import { integrarLinea, integrarRama, MOTIVOS, opcionesPorDefecto, PASOS_POR_TROZO, ramaTroceada } from '../numerics/streamlines';
import { peticionLineas, peticionMalla } from './peticiones';
import { obtenerCampo, trabajoLineas, trabajoMalla } from './trabajos';
import type { DefinicionCampo } from './protocol';

const nunca = async () => false;
const sinProgreso = () => {};

afterEach(() => vi.restoreAllMocks());

describe('CMP-01 · trabajos', () => {
  it('un campo que no compila produce un error legible con la componente', () => {
    const def: DefinicionCampo = { P: 'x+', Q: 'y', R: 'z', parametros: [] };
    expect(() => obtenerCampo(def)).toThrow(/^La componente P no es válida: /);
  });

  it('la caché devuelve el mismo campo compilado para la misma definición', () => {
    const def: DefinicionCampo = { P: '-y', Q: 'x', R: 'a', parametros: ['a'] };
    expect(obtenerCampo(def)).toBe(obtenerCampo({ ...def }));
  });

  it('trabajoLineas reproduce exactamente la integración secuencial (helicoidal)', async () => {
    const e = experimentoDesdeCatalogo('helicoidal');
    const malla = trabajoMalla({ ...peticionMalla(e), id: 1 });
    const pet = { ...peticionLineas(e, malla), id: 2 };
    const r = await trabajoLineas(pet, nunca, sinProgreso);
    expect(r).not.toBeNull();

    const campo = compilarCampo(e.campo, e.parametros.map((p) => p.nombre));
    if (!campo.ok) throw new Error('no compila');
    const p = Float64Array.from(e.parametros.map((q) => q.valor));
    const o = opcionesPorDefecto(e.dominio, malla.deltaRef, malla.escala.ref);
    const sem = generarSemillas(e.lineas.semillas, e.dominio, campo.campo.F, p, malla.escala.ref, { delta: malla.deltaRef, punto: null });
    let k = 0;
    for (let i = 0; i < sem.n; i++) {
      const l = integrarLinea(campo.campo.F, p, [sem.puntos[3 * i]!, sem.puntos[3 * i + 1]!, sem.puntos[3 * i + 2]!], o);
      if ('descartada' in l) continue;
      const desde = r!.inicio[k]!;
      expect(r!.inicio[k + 1]! - desde).toBe(l.n);
      expect(Array.from(r!.posiciones.subarray(3 * desde, 3 * (desde + l.n)))).toEqual(Array.from(Float32Array.from(l.puntos)));
      expect(r!.motivos[2 * k + 1]).toBe(MOTIVOS.indexOf(l.motivoAdelante));
      k++;
    }
    expect(k).toBe(r!.nLineas);
  });

  it('una cancelación detiene trabajoLineas en la primera cesión', async () => {
    const e = experimentoDesdeCatalogo('helicoidal');
    const malla = trabajoMalla({ ...peticionMalla(e), id: 1 });
    // Reloj que avanza 10 ms por lectura: cada comprobación agota el lote de 8 ms.
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (t += 10));
    let cesiones = 0;
    const progreso: number[] = [];
    const r = await trabajoLineas(
      { ...peticionLineas(e, malla), id: 2 },
      async () => ++cesiones >= 1,
      (f) => progreso.push(f),
    );
    expect(r).toBeNull();
    expect(cesiones).toBe(1);
    expect(progreso).toHaveLength(1);
  });
});

describe('CMP-02 · troceado dentro de una línea', () => {
  // Hélice muy cerrada: la rama llega a PASOS_MAX (4000) sin salir de Ω ni cerrarse.
  const def: DefinicionCampo = { P: '-y', Q: 'x', R: '0.004', parametros: [] };
  const dominio: Dominio = { min: [-2, -2, -2], max: [2, 2, 2] };
  const o = opcionesPorDefecto(dominio, 0.5, 2, null, 1e9);

  it(`la rama cede cada ${PASOS_POR_TROZO} pasos y da el mismo resultado que la versión síncrona`, () => {
    const F = obtenerCampo(def).F;
    const p = new Float64Array(0);
    const g = ramaTroceada(F, p, [1, 0, 0], 1, o, null);
    let cesiones = 0;
    let paso = g.next();
    while (!paso.done) {
      cesiones++;
      paso = g.next();
    }
    const sincrona = integrarRama(F, p, [1, 0, 0], 1, o, null);
    expect(paso.value.motivo).toBe('PASOS_MAX');
    expect(cesiones).toBe(Math.floor((o.pasosMax - 1) / PASOS_POR_TROZO));
    expect(paso.value.n).toBe(sincrona.n);
    expect(Array.from(paso.value.puntos)).toEqual(Array.from(sincrona.puntos));
  });
});
