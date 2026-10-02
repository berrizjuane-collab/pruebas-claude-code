/**
 * Campo definido por expresiones (MAT-03/MAT-04): analiza, resuelve y compila P, Q y R;
 * deriva la jacobiana simbólica y prepara el chequeo de puntos angulosos y la tipografía.
 */
import { contarNodos, type Nodo } from './expr/ast';
import { compilar } from './expr/compile';
import { construirChequeoAngulos, jacobianaSimbolica, resta, suma } from './expr/diff';
import type { AvisoExpresion, ErrorExpresion } from './expr/errores';
import { analizarSintaxis } from './expr/parser';
import { resolver } from './expr/resolver';
import { tex, unicode } from './expr/tex';
import type { EvaluadorCampo, EvaluadorJacobiana } from './tipos';

export type Componente = 'P' | 'Q' | 'R';
export const COMPONENTES: readonly Componente[] = ['P', 'Q', 'R'];

export type ResultadoExpresion =
  | { ok: true; arbol: Nodo; avisos: AvisoExpresion[]; usados: Set<string> }
  | { ok: false; error: ErrorExpresion };

/** Analiza y resuelve una expresión con los parámetros declarados. */
export function analizarExpresion(texto: string, parametros: readonly string[]): ResultadoExpresion {
  const sintaxis = analizarSintaxis(texto);
  if (!sintaxis.ok) return sintaxis;
  const r = resolver(sintaxis.arbol, parametros);
  if (!r.ok) return r;
  return { ok: true, arbol: r.arbol, avisos: sintaxis.avisos, usados: r.usados };
}

export interface CampoCompilado {
  componentes: readonly [Nodo, Nodo, Nodo];
  F: EvaluadorCampo;
  /** Jacobiana simbólica (orden de filas); null si algún árbol excede el límite (→ diferencias finitas). */
  J: EvaluadorJacobiana | null;
  arbolesJ: readonly Nodo[] | null;
  /** ¿Está el punto en un punto anguloso (abs, min, max, atan2, hypot)? */
  enAngulo: (x: number, y: number, z: number, p: Float64Array) => boolean;
  usados: Set<string>;
  avisos: { componente: Componente; aviso: AvisoExpresion }[];
  tex: Record<Componente, string>;
  unicode: Record<Componente, string>;
}

export type ResultadoCampo = { ok: true; campo: CampoCompilado } | { ok: false; errores: Partial<Record<Componente, ErrorExpresion>> };

export function compilarCampo(expr: Record<Componente, string>, parametros: readonly string[]): ResultadoCampo {
  const errores: Partial<Record<Componente, ErrorExpresion>> = {};
  const arboles: Nodo[] = [];
  const usados = new Set<string>();
  const avisos: CampoCompilado['avisos'] = [];
  for (const c of COMPONENTES) {
    const r = analizarExpresion(expr[c], parametros);
    if (!r.ok) {
      errores[c] = r.error;
      continue;
    }
    arboles.push(r.arbol);
    r.usados.forEach((u) => usados.add(u));
    r.avisos.forEach((aviso) => avisos.push({ componente: c, aviso }));
  }
  if (Object.keys(errores).length) return { ok: false, errores };
  const componentes = arboles as unknown as [Nodo, Nodo, Nodo];
  const [fP, fQ, fR] = componentes.map(compilar) as [ReturnType<typeof compilar>, ReturnType<typeof compilar>, ReturnType<typeof compilar>];
  const F: EvaluadorCampo = (x, y, z, p, out, o) => {
    out[o] = fP(x, y, z, p);
    out[o + 1] = fQ(x, y, z, p);
    out[o + 2] = fR(x, y, z, p);
  };
  const arbolesJ = jacobianaSimbolica(componentes);
  let J: EvaluadorJacobiana | null = null;
  if (arbolesJ) {
    const fj = arbolesJ.map(compilar);
    J = (x, y, z, p, out, o) => {
      for (let i = 0; i < 9; i++) out[o + i] = (fj[i] as ReturnType<typeof compilar>)(x, y, z, p);
    };
  }
  return {
    ok: true,
    campo: {
      componentes,
      F,
      J,
      arbolesJ,
      enAngulo: construirChequeoAngulos(componentes),
      usados,
      avisos,
      tex: { P: tex(componentes[0]), Q: tex(componentes[1]), R: tex(componentes[2]) },
      unicode: { P: unicode(componentes[0]), Q: unicode(componentes[1]), R: unicode(componentes[2]) },
    },
  };
}

/** Árboles simbólicos de la divergencia y del rotacional (para mostrarlos en el panel). */
export function divRotSimbolicos(arbolesJ: readonly Nodo[]): { div: Nodo; rot: [Nodo, Nodo, Nodo] } {
  const j = (i: number) => arbolesJ[i] as Nodo;
  return {
    div: suma(suma(j(0), j(4)), j(8)),
    rot: [resta(j(7), j(5)), resta(j(2), j(6)), resta(j(3), j(1))],
  };
}

/** TeX de la definición completa: F = (P, Q, R). */
export function texCampo(c: CampoCompilado): string {
  return `\\mathbf F = \\left(${c.tex.P},\\; ${c.tex.Q},\\; ${c.tex.R}\\right)`;
}

export { contarNodos };
