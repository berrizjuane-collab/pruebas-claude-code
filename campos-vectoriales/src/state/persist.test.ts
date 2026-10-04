/**
 * EXP-01 (V-FUN-10, parte del validador) y EXP-02 (autoguardado tolerante a fallos).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../math/catalog';
import { aplicarEcuaciones, fijarCifras, fijarCorte, fijarDominio, fijarLineas, fijarOpcionesFlechas, fijarParticulas, fijarPunto } from './actions';
import {
  CLAVE_AUTOGUARDADO,
  TAMANO_MAX,
  aConfiguracion,
  autoguardar,
  borrarAutoguardado,
  importarConfiguracion,
  migrar,
  recuperarAutoguardado,
  serializar,
  type ErrorImportacion,
} from './persist';
import { EXPERIMENTO_INICIAL, experimentoDesdeCatalogo, type EstadoExperimento } from './schema';

const fixture = (nombre: string) => readFileSync(resolve(__dirname, '../../tests/fixtures/configuracion', nombre), 'utf8');
const errores = (texto: string): ErrorImportacion[] => {
  const r = importarConfiguracion(texto);
  if (r.ok) throw new Error('se esperaba un error');
  return r.errores;
};

/** Un experimento con casi todo distinto de los valores por defecto. */
function experimentoCompleto(): EstadoExperimento {
  let s = experimentoDesdeCatalogo('rotacional');
  s = aplicarEcuaciones(s, { P: '-omega*y + 0.1*x', Q: 'omega*x', R: 'sin(z)' });
  s = fijarDominio(s, { min: [-3, -1, 0.5], max: [3, 1, 2.5] });
  s = { ...s, muestreo: { n: [11, 7, 5], posicion: 'centros', corteResolucion: 41 } };
  s = { ...s, capas: { flechas: true, lineas: false, particulas: true, glifos: 'rotacional' } };
  s = fijarOpcionesFlechas(s, { modo: 'normalizado', escala: { tipo: 'fija', valor: 2.5, delta: 0.6 }, escalaRot: { tipo: 'fija', valor: 4 }, luminancia: 'log' });
  s = fijarLineas(s, { semillas: { tipo: 'rejilla', plano: 'YZ', c: 0.25, u: [-0.5, 0.5], v: [1, 2], nu: 5, nv: 3 }, paso: 0.01, longitudMax: 12 });
  s = fijarParticulas(s, { n: 1200, tau: 0.3, semilla: 7 });
  s = fijarCorte(s, { activo: true, plano: 'XZ', c: 0.75, flechas: 'corte', vector: 'tangencial', escalar: 'divergencia', escala: { tipo: 'fija', valor: 3 } });
  s = fijarPunto(s, [1.25, -0.5, 1]);
  s = fijarCifras(s, 6);
  return { ...s, nombre: 'Mi experimento «ñ»', parametros: s.parametros.map((p) => ({ ...p, valor: -1.5 })), camara: { tipo: 'perspectiva', posicion: [5.123456789012345, -6.8, 4.1], objetivo: [0.1, 0, -0.2] } };
}

describe('EXP-01 · ida y vuelta (igualdad profunda)', () => {
  it.each(CATALOGO.map((c) => c.id))('%s tal cual', (id) => {
    const s = experimentoDesdeCatalogo(id);
    const r = importarConfiguracion(serializar(s));
    expect(r).toEqual({ ok: true, estado: s, avisos: [] });
  });

  it('un experimento con todas las opciones cambiadas, semillas aleatorias y semilla única', () => {
    const s = experimentoCompleto();
    expect(importarConfiguracion(serializar(s))).toEqual({ ok: true, estado: s, avisos: [] });
    for (const semillas of [{ tipo: 'aleatoria', n: 64, semilla: 3 }, { tipo: 'punto' }] as const) {
      const t = { ...s, lineas: { ...s.lineas, semillas } };
      expect(importarConfiguracion(serializar(t))).toEqual({ ok: true, estado: t, avisos: [] });
    }
  });

  it('el documento lleva formato y versión y sigue el orden de SPEC §7.2', () => {
    const c = aConfiguracion(EXPERIMENTO_INICIAL);
    expect(Object.keys(c).slice(0, 4)).toEqual(['formato', 'version', 'nombre', 'campo']);
    expect(c).toMatchObject({ formato: 'campos-vectoriales', version: 2, campo: { P: '-y', Q: 'x', R: 'a', base: 'helicoidal' } });
  });

  it('el ejemplo literal de SPEC §7.2 se importa; lo que falta toma el valor por defecto con aviso', () => {
    const r = importarConfiguracion(fixture('spec-ejemplo.json'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Es un documento v1: se migra a v2 (D-71) sin avisos de «falta» por las claves nuevas.
    expect(r.avisos).toEqual(['Falta «cifras»: se usa el valor por defecto', 'Convertido de la versión 1 a la 2']);
    expect(r.estado).toMatchObject({
      nombre: 'Helicoidal',
      base: 'helicoidal',
      modificado: false,
      campo: { P: '-y', Q: 'x', R: 'a' },
      lineas: { semillas: { tipo: 'rejilla', plano: 'XZ', c: 0, u: [0.5, 2], v: [0, 0], nu: 4, nv: 1 }, paso: 0.0625, longitudMax: 27.7 },
      camara: { tipo: 'perspectiva', posicion: [5.2, -6.8, 4.1], objetivo: [0, 0, 0] },
      cifras: 4,
    });
  });

  it('«modificado» se deduce si falta: ecuaciones distintas de las del ejemplo base', () => {
    const doc = JSON.parse(fixture('spec-ejemplo.json'));
    doc.campo.R = '2*a';
    const r = importarConfiguracion(JSON.stringify(doc));
    expect(r.ok && r.estado.modificado).toBe(true);
  });

  it('claves desconocidas: se ignoran con aviso', () => {
    const r = importarConfiguracion(fixture('claves-desconocidas.json'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avisos).toEqual(expect.arrayContaining(['Se ignora la clave desconocida «comentario»', 'Se ignora la clave desconocida «capas.mapa»']));
  });
});

describe('EXP-01 · casos inválidos (V-FUN-10): errores por campo', () => {
  it('JSON malformado', () => {
    const e = errores(fixture('malformado.json'));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ ruta: 'archivo' });
    expect(e[0]!.mensaje).toMatch(/^no es JSON válido/);
  });

  it('formato ajeno y documento que no es un objeto', () => {
    expect(errores(fixture('formato-ajeno.json'))).toEqual([{ ruta: 'formato', mensaje: 'debe ser «campos-vectoriales»; este archivo no es una configuración de esta aplicación' }]);
    expect(errores('[1, 2]')).toEqual([{ ruta: 'archivo', mensaje: 'debe contener un objeto JSON' }]);
  });

  it('versión futura y versión no entera', () => {
    expect(errores(fixture('version-futura.json'))[0]).toMatchObject({ ruta: 'version', mensaje: expect.stringContaining('versión 3, posterior a la que entiende esta aplicación (2)') });
    expect(errores(fixture('version-futura.json').replace('"version": 3', '"version": 1.5'))[0]).toMatchObject({ ruta: 'version' });
  });

  it('rangos fuera de límites: todos los errores a la vez, cada uno con su ruta', () => {
    expect(errores(fixture('fuera-de-rango.json'))).toEqual([
      { ruta: 'dominio.min[2]', mensaje: 'debe ser menor que dominio.max[2]' },
      { ruta: 'muestreo.n[2]', mensaje: 'debe ser ≤ 21 (es 50)' },
      { ruta: 'particulas.n', mensaje: 'debe ser ≤ 2000 (es 5000)' },
    ]);
  });

  it('expresión de 501 caracteres', () => {
    expect(errores(fixture('expresion-501.json'))).toEqual([{ ruta: 'campo.P', mensaje: 'tiene 501 caracteres; el máximo es 500' }]);
  });

  it('archivo de 300 KB', () => {
    const base = fixture('spec-ejemplo.json');
    const texto = base.replace('"Helicoidal"', `"${' '.repeat(300 * 1024 - base.length + 'Helicoidal'.length)}"`);
    expect(texto.length).toBe(300 * 1024);
    expect(texto.length).toBeGreaterThan(TAMANO_MAX);
    expect(errores(texto)).toEqual([{ ruta: 'archivo', mensaje: 'ocupa 300 KB; el máximo es 256 KB' }]);
  });

  it('expresiones: mismo analizador que el editor (sintaxis e identificadores sin declarar)', () => {
    const doc = JSON.parse(fixture('spec-ejemplo.json'));
    doc.campo.P = 'x*(';
    doc.campo.Q = 'k*x';
    const e = errores(JSON.stringify(doc));
    expect(e.map((x) => x.ruta)).toEqual(['campo.P', 'campo.Q']);
    expect(e[1]!.mensaje).toContain('k');
  });

  it('tipos, opciones, parámetros, corte, punto y cámara', () => {
    const doc = JSON.parse(fixture('spec-ejemplo.json'));
    doc.capas.flechas = 'sí';
    doc.flechas.modo = 'gigante';
    doc.parametros.push({ nombre: 'x', valor: 0, min: -1, max: 1, paso: 0.1 });
    doc.parametros[0].valor = 7;
    doc.corte.c = 9;
    doc.punto = [0, 0, 5];
    doc.camara.objetivo = doc.camara.posicion;
    doc.lineas.semillas.nu = 300;
    expect(errores(JSON.stringify(doc))).toEqual([
      { ruta: 'parametros[0].valor', mensaje: 'debe estar entre min (-1) y max (1)' },
      { ruta: 'parametros[1].nombre', mensaje: '«x» es una variable' },
      { ruta: 'capas.flechas', mensaje: 'debe ser true o false (es un texto)' },
      { ruta: 'flechas.modo', mensaje: 'debe ser «proporcional», «normalizado»' },
      { ruta: 'lineas.semillas', mensaje: 'Como máximo 256 semillas (300 × 1 = 300)' },
      { ruta: 'corte.c', mensaje: 'debe estar dentro del dominio en z: [-2, 2] (es 9)' },
      { ruta: 'camara.posicion', mensaje: 'no puede coincidir con camara.objetivo' },
      { ruta: 'punto', mensaje: 'debe estar dentro del dominio' },
    ]);
  });

  it('obligatorios: sin «campo» no hay experimento', () => {
    const doc = JSON.parse(fixture('spec-ejemplo.json'));
    delete doc.campo;
    expect(errores(JSON.stringify(doc))).toContainEqual({ ruta: 'campo', mensaje: 'falta este dato' });
  });
});

describe('EXP-01 · migraciones', () => {
  it('aplica una conversión por versión, en orden, y avisa', () => {
    const migraciones = {
      1: (o: Record<string, unknown>) => ({ ...o, a: 1 }),
      2: (o: Record<string, unknown>) => ({ ...o, b: (o.a as number) + 1 }),
    };
    expect(migrar({ version: 1 }, 1, 3, migraciones)).toEqual({ ok: true, doc: { version: 3, a: 1, b: 2 }, avisos: ['Convertido de la versión 1 a la 2', 'Convertido de la versión 2 a la 3'] });
    expect(migrar({ version: 1 }, 1, 3, { 1: migraciones[1] })).toEqual({ ok: false, error: 'no se sabe convertir la versión 2 a la 3' });
    expect(migrar({ version: 1 }, 1, 1, {})).toEqual({ ok: true, doc: { version: 1 }, avisos: [] });
  });
});

describe('EXP-02 · autoguardado', () => {
  const memoria = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  const bloqueado = {
    getItem: () => {
      throw new DOMException('bloqueado', 'SecurityError');
    },
    setItem: () => {
      throw new DOMException('lleno', 'QuotaExceededError');
    },
    removeItem: () => {
      throw new DOMException('bloqueado', 'SecurityError');
    },
  };

  it('guarda y recupera el mismo estado', () => {
    const a = memoria();
    const s = experimentoCompleto();
    expect(autoguardar(s, a)).toBe(true);
    expect(a.m.has(CLAVE_AUTOGUARDADO)).toBe(true);
    expect(recuperarAutoguardado(a)).toEqual(s);
    borrarAutoguardado(a);
    expect(recuperarAutoguardado(a)).toBeNull();
  });

  it('con el almacenamiento bloqueado o lleno no lanza: no guarda y no recupera nada', () => {
    expect(autoguardar(EXPERIMENTO_INICIAL, bloqueado)).toBe(false);
    expect(recuperarAutoguardado(bloqueado)).toBeNull();
    expect(() => borrarAutoguardado(bloqueado)).not.toThrow();
    expect(autoguardar(EXPERIMENTO_INICIAL, null)).toBe(false);
  });

  it('un guardado dañado o de otra versión se ignora', () => {
    const a = memoria();
    a.setItem(CLAVE_AUTOGUARDADO, '{"formato": "campos-vectoriales", "version": 1, "campo": ');
    expect(recuperarAutoguardado(a)).toBeNull();
    a.setItem(CLAVE_AUTOGUARDADO, fixture('version-futura.json'));
    expect(recuperarAutoguardado(a)).toBeNull();
  });
});

describe('V-FUN-23 · JSON v2 (1.1): tiempo, exploración y nacimiento', () => {
  const v2 = (s: EstadoExperimento) => JSON.parse(serializar(s)) as Record<string, unknown>;
  const conTiempo: EstadoExperimento = {
    ...EXPERIMENTO_INICIAL,
    tiempo: { t: 1.25, inicio: -1, fin: 3.5, bucle: false },
    exploracion: { escala: 2.5, velocidad: 0.5, ilimitado: true },
    particulas: { ...EXPERIMENTO_INICIAL.particulas, nacimiento: 'semillas' },
  };

  it('ida y vuelta exacta con las claves nuevas, sin avisos', () => {
    expect(importarConfiguracion(serializar(conTiempo))).toEqual({ ok: true, estado: conTiempo, avisos: [] });
    expect(v2(conTiempo)).toMatchObject({ version: 2, tiempo: conTiempo.tiempo, exploracion: conTiempo.exploracion });
  });

  it('un documento v1 se migra: valores por defecto de la 1.1 y solo el aviso de conversión', () => {
    const doc = v2(EXPERIMENTO_INICIAL);
    doc.version = 1;
    delete doc.tiempo;
    delete doc.exploracion;
    delete (doc.particulas as Record<string, unknown>).nacimiento;
    const r = importarConfiguracion(JSON.stringify(doc));
    expect(r).toEqual({ ok: true, estado: EXPERIMENTO_INICIAL, avisos: ['Convertido de la versión 1 a la 2'] });
  });

  it('tiempo y exploración fuera de rango: errores por ruta y estado intacto', () => {
    const casos: [Record<string, unknown>, string][] = [
      [{ tiempo: { t: 0, inicio: 2, fin: 2, bucle: true } }, 'tiempo.inicio'],
      [{ tiempo: { t: 5, inicio: 0, fin: 4, bucle: true } }, 'tiempo.t'],
      [{ tiempo: { t: 0, inicio: 0, fin: 1e7, bucle: true } }, 'tiempo.fin'],
      [{ exploracion: { escala: 100, velocidad: 1, ilimitado: false } }, 'exploracion.escala'],
      [{ exploracion: { escala: 1, velocidad: 0.01, ilimitado: false } }, 'exploracion.velocidad'],
      [{ particulas: { n: 400, tau: null, semilla: 1, nacimiento: 'nube' } }, 'particulas.nacimiento'],
    ];
    for (const [cambio, ruta] of casos) {
      const r = importarConfiguracion(JSON.stringify({ ...v2(EXPERIMENTO_INICIAL), ...cambio }));
      expect(r.ok, ruta).toBe(false);
      if (!r.ok) expect(r.errores.map((e) => e.ruta)).toContain(ruta);
    }
  });
});
