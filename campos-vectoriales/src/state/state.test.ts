import { describe, expect, it } from 'vitest';
import { crearAlmacen } from './store';
import { EXPERIMENTO_INICIAL } from './schema';
import { fijarParametro, seleccionarCampo } from './actions';

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
