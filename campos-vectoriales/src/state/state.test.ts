import { describe, expect, it } from 'vitest';
import { crearAlmacen } from './store';
import { EXPERIMENTO_INICIAL } from './schema';
import {
  alcance,
  anadirParametro,
  aplicarEcuaciones,
  eliminarParametro,
  escalarDominio,
  fijarCifras,
  fijarDominio,
  fijarLineas,
  fijarMuestreo,
  fijarParticulas,
  fijarParametro,
  fijarRangoParametro,
  motivoIntervalo,
  motivoNombreParametro,
  motivoRango,
  motivoSemillas,
  nombrePersonalizado,
  restablecerExperimento,
  restablecerParametro,
  restablecerParametros,
  seleccionarCampo,
} from './actions';

describe('estado del experimento', () => {
  it('el experimento inicial es el helicoidal con a = 0.25 (D-14)', () => {
    expect(EXPERIMENTO_INICIAL.base).toBe('helicoidal');
    expect(EXPERIMENTO_INICIAL.parametros).toEqual([{ nombre: 'a', valor: 0.25, min: -1, max: 1, paso: 0.05, porDefecto: 0.25 }]);
    expect(EXPERIMENTO_INICIAL.capas).toEqual({ flechas: true, lineas: true, particulas: false, glifos: 'campo' });
  });

  it('elegir un campo conserva dominio, capas y cámara, y no comparte parámetros con el catálogo', () => {
    const conDominio = { ...EXPERIMENTO_INICIAL, dominio: { min: [-1, -1, -1] as const, max: [1, 1, 1] as const }, camara: { tipo: 'perspectiva' as const, posicion: [1, 2, 3] as const, objetivo: [0, 0, 0] as const } };
    const r = seleccionarCampo(conDominio, 'rotacional');
    expect(r.campo).toEqual({ P: '-omega*y', Q: 'omega*x', R: '0' });
    expect(r.dominio).toBe(conDominio.dominio);
    expect(r.camara).toBe(conDominio.camara);
    const m = fijarParametro(r, 'omega', 2);
    expect(m.parametros[0]?.valor).toBe(2);
    expect(seleccionarCampo(m, 'rotacional').parametros[0]?.valor).toBe(1);
  });

  it('el almacén notifica solo cambios reales', () => {
    const a = crearAlmacen(1);
    let avisos = 0;
    const baja = a.suscribir(() => avisos++);
    a.fijar(1);
    a.fijar((v) => v + 1);
    expect(a.obtener()).toBe(2);
    expect(avisos).toBe(1);
    baja();
    a.fijar(3);
    expect(avisos).toBe(1);
  });
});

describe('acciones de edición (UI-02 … UI-05)', () => {
  const hel = EXPERIMENTO_INICIAL;

  it('aplicar ecuaciones marca «modificado» y renombra «Personalizado (desde …)»; sin cambios devuelve el mismo estado', () => {
    const r = aplicarEcuaciones(hel, { P: '-y', Q: 'x', R: '2*a' });
    expect(r.modificado).toBe(true);
    expect(r.nombre).toBe('Personalizado (desde Helicoidal)');
    expect(aplicarEcuaciones(r, { P: '-y', Q: 'x', R: '2*a' })).toBe(r);
    expect(nombrePersonalizado(null)).toBe('Personalizado');
  });

  it('nombres de parámetro: válidos, duplicados, reservados y límite de 8', () => {
    expect(motivoNombreParametro('k', hel.parametros)).toBeNull();
    expect(motivoNombreParametro('a', hel.parametros)).toMatch(/Ya existe/);
    expect(motivoNombreParametro('x', hel.parametros)).toMatch(/variable/);
    expect(motivoNombreParametro('pi', hel.parametros)).toMatch(/constante/);
    expect(motivoNombreParametro('sin', hel.parametros)).toMatch(/función/);
    expect(motivoNombreParametro('t', hel.parametros)).toMatch(/tiempo/);
    expect(motivoNombreParametro('2k', hel.parametros)).toMatch(/letra/);
    let s = hel;
    for (const n of ['b', 'c', 'd', 'f', 'g', 'h', 'k']) s = anadirParametro(s, n);
    expect(s.parametros).toHaveLength(8);
    expect(motivoNombreParametro('m', s.parametros)).toMatch(/máximo/);
    expect(anadirParametro(s, 'm')).toBe(s);
  });

  it('añadir, cambiar rango (recorta el valor), restablecer y eliminar un parámetro', () => {
    let s = anadirParametro(hel, 'k');
    expect(s.parametros[1]).toEqual({ nombre: 'k', valor: 1, min: -5, max: 5, paso: 0.1, porDefecto: 1 });
    s = fijarParametro(s, 'k', 4);
    s = fijarRangoParametro(s, 'k', { min: 0, max: 2, paso: 0.5 });
    expect(s.parametros[1]).toMatchObject({ min: 0, max: 2, paso: 0.5, valor: 2, porDefecto: 1 });
    expect(fijarRangoParametro(s, 'k', { min: 2, max: 1, paso: 0.1 })).toBe(s);
    expect(motivoRango(0, 1, 2)).toMatch(/amplitud/);
    s = restablecerParametro(s, 'k');
    expect(s.parametros[1]?.valor).toBe(1);
    s = eliminarParametro(s, 'k');
    expect(s.parametros.map((p) => p.nombre)).toEqual(['a']);
  });

  it('restablecer parámetros y experimento', () => {
    const editado = fijarParametro(aplicarEcuaciones(hel, { P: 'x', Q: 'y', R: 'a' }), 'a', 0.9);
    const p = restablecerParametros(editado);
    expect(p.parametros[0]?.valor).toBe(0.25);
    expect(p.campo).toEqual(editado.campo);
    const e = restablecerExperimento({ ...editado, dominio: { min: [-1, -1, -1], max: [1, 1, 1] } });
    expect(e).toEqual(EXPERIMENTO_INICIAL);
  });

  it('dominio: validación, corte recolocado y punto descartado si queda fuera', () => {
    expect(motivoIntervalo(1, 1)).toMatch(/menor/);
    expect(motivoIntervalo(0, 0.05)).toMatch(/al menos/);
    expect(motivoIntervalo(-600, 600)).toMatch(/superar/);
    const s = { ...hel, corte: { ...hel.corte, c: 1.5 }, punto: [1.8, 0, 0] as const };
    const d = fijarDominio(s, { min: [-1, -1, 0], max: [1, 1, 1] });
    expect(d.dominio).toEqual({ min: [-1, -1, 0], max: [1, 1, 1] });
    // F6.1: como al activarlo, z = 0 si queda dentro de Ω y, si no, el centro.
    expect(d.corte.c).toBe(0);
    expect(fijarDominio(s, { min: [-1, -1, 0.2], max: [1, 1, 1] }).corte.c).toBe(0.6);
    expect(d.punto).toBeNull();
    expect(fijarDominio(s, { min: [-1, -1, 1], max: [1, 1, 1] })).toBe(s);
  });

  it('muestreo: N y resolución del corte acotados a SPEC §5.9', () => {
    const s = fijarMuestreo(hel, { n: [30, 2, 21] });
    expect(s.muestreo.n).toEqual([21, 3, 21]);
    expect(fijarMuestreo(hel, { corteResolucion: 100 }).muestreo.corteResolucion).toBe(61);
    expect(fijarMuestreo(hel, { posicion: 'nodos' })).toBe(hel);
  });
});

describe('UI-08 · líneas, partículas y cifras', () => {
  const hel = EXPERIMENTO_INICIAL;
  it('semillas: rejilla hasta 256 puntos, aleatorias 1–256 con semilla entera; paso y longitud positivos o automáticos', () => {
    const rejilla = { tipo: 'rejilla' as const, plano: 'XY' as const, c: 0, nu: 16, nv: 16 };
    expect(fijarLineas(hel, { semillas: rejilla }).lineas.semillas).toEqual(rejilla);
    expect(fijarLineas(hel, { semillas: { ...rejilla, nv: 17 } })).toBe(hel);
    expect(motivoSemillas({ ...rejilla, nv: 17 })).toMatch(/256/);
    expect(fijarLineas(hel, { semillas: { tipo: 'aleatoria', n: 32, semilla: 1 } }).lineas.semillas).toMatchObject({ n: 32 });
    expect(fijarLineas(hel, { semillas: { tipo: 'aleatoria', n: 0, semilla: 1 } })).toBe(hel);
    expect(fijarLineas(hel, { semillas: { tipo: 'aleatoria', n: 10, semilla: 1.5 } })).toBe(hel);
    expect(fijarLineas(hel, { paso: 0.01 }).lineas.paso).toBe(0.01);
    expect(fijarLineas(hel, { paso: -1 })).toBe(hel);
    expect(fijarLineas(hel, { longitudMax: null })).toBe(hel);
    expect(fijarLineas(hel, { longitudMax: 10 }).lineas.longitudMax).toBe(10);
  });

  it('partículas: 1–2000, τ positiva o automática, semilla entera; cifras 2–8', () => {
    expect(fijarParticulas(hel, { n: 2000 }).particulas.n).toBe(2000);
    expect(fijarParticulas(hel, { n: 2001 })).toBe(hel);
    expect(fijarParticulas(hel, { tau: 0.5 }).particulas.tau).toBe(0.5);
    expect(fijarParticulas(hel, { tau: 0 })).toBe(hel);
    expect(fijarParticulas(hel, { semilla: 7 }).particulas.semilla).toBe(7);
    expect(fijarCifras(hel, 6).cifras).toBe(6);
    expect(fijarCifras(hel, 9)).toBe(hel);
  });
});

describe('V-FUN-21 · ampliar y estrechar Ω (RF-21)', () => {
  it('[−2, 2]³, N = 9 → ×2 → [−4, 4]³, N = 17, Δ = 0.5 → ×2 → [−8, 8]³, N = 21, Δ = 0.8 (límite de N)', () => {
    const s0 = EXPERIMENTO_INICIAL;
    const a = alcance(s0.dominio, s0.muestreo, 2);
    expect(a).toEqual({ ok: true, dominio: { min: [-4, -4, -4], max: [4, 4, 4] }, n: [17, 17, 17], delta: 0.5, conservaDelta: true });
    const s1 = escalarDominio(s0, 2);
    expect(s1.dominio).toEqual({ min: [-4, -4, -4], max: [4, 4, 4] });
    expect(s1.muestreo.n).toEqual([17, 17, 17]);
    const b = alcance(s1.dominio, s1.muestreo, 2);
    expect(b).toMatchObject({ ok: true, n: [21, 21, 21], conservaDelta: false });
    if (b.ok) expect(b.delta).toBeCloseTo(0.8, 14);
    // Estrechar deshace (mientras N no se ha acotado).
    const s2 = escalarDominio(s1, 0.5);
    expect(s2.dominio).toEqual(s0.dominio);
    expect(s2.muestreo.n).toEqual([9, 9, 9]);
  });

  it('cajas no cúbicas y «centros»; límites de lado con motivo', () => {
    const a = alcance({ min: [0, -1, -0.5], max: [2, 1, 0.5] }, { n: [5, 9, 3], posicion: 'centros', corteResolucion: 21 }, 2);
    expect(a).toMatchObject({ ok: true, dominio: { min: [-1, -2, -1], max: [3, 2, 1] }, n: [10, 18, 6] });
    expect(alcance({ min: [-0.06, -2, -2], max: [0.06, 2, 2] }, EXPERIMENTO_INICIAL.muestreo, 0.5)).toMatchObject({ ok: false, motivo: expect.stringMatching(/al menos 0.1/) });
    expect(alcance({ min: [-400, -2, -2], max: [400, 2, 2] }, EXPERIMENTO_INICIAL.muestreo, 2)).toMatchObject({ ok: false, motivo: expect.stringMatching(/1000/) });
  });
});
