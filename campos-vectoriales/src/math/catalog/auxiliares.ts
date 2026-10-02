/**
 * Campos auxiliares T1–T6 (SPEC §4.7): no aparecen en el catálogo visible; sirven para
 * probar derivadas no triviales, singularidades, dominios parciales y puntos no
 * diferenciables. Cada uno trae su jacobiana analítica.
 */
import type { EvaluadorCampo, EvaluadorJacobiana } from '../tipos';

export interface CampoAuxiliar {
  id: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
  expresiones: { P: string; Q: string; R: string };
  F: EvaluadorCampo;
  J: EvaluadorJacobiana;
}

const escribirJ = (out: Float64Array, o: number, j: number[]) => {
  for (let i = 0; i < 9; i++) out[o + i] = j[i] as number;
};

export const AUXILIARES: readonly CampoAuxiliar[] = [
  {
    id: 'T1',
    expresiones: { P: 'sin(y*z)', Q: 'x^2*exp(z)', R: 'y^3*cos(x)' },
    F: (x, y, z, _p, out, o) => {
      out[o] = Math.sin(y * z);
      out[o + 1] = x * x * Math.exp(z);
      out[o + 2] = y * y * y * Math.cos(x);
    },
    J: (x, y, z, _p, out, o) => {
      const cyz = Math.cos(y * z);
      escribirJ(out, o, [
        0, z * cyz, y * cyz,
        2 * x * Math.exp(z), 0, x * x * Math.exp(z),
        -y * y * y * Math.sin(x), 3 * y * y * Math.cos(x), 0,
      ]);
    },
  },
  {
    id: 'T2',
    expresiones: { P: 'x/r^3', Q: 'y/r^3', R: 'z/r^3' },
    F: (x, y, z, _p, out, o) => {
      const r = Math.hypot(x, y, z);
      const r3 = r * r * r;
      out[o] = x / r3;
      out[o + 1] = y / r3;
      out[o + 2] = z / r3;
    },
    J: (x, y, z, _p, out, o) => {
      // (I r² − 3 r rᵀ) / r⁵
      const r2 = x * x + y * y + z * z;
      const r5 = r2 * r2 * Math.sqrt(r2);
      const v = [x, y, z];
      const j: number[] = [];
      for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 3; k++) j.push(((i === k ? r2 : 0) - 3 * (v[i] as number) * (v[k] as number)) / r5);
      }
      escribirJ(out, o, j);
    },
  },
  {
    id: 'T3',
    expresiones: { P: 'sqrt(x)', Q: '0', R: '0' },
    F: (x, _y, _z, _p, out, o) => {
      out[o] = Math.sqrt(x);
      out[o + 1] = 0;
      out[o + 2] = 0;
    },
    J: (x, _y, _z, _p, out, o) => escribirJ(out, o, [1 / (2 * Math.sqrt(x)), 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'T4',
    expresiones: { P: '-y/(x^2+y^2)', Q: 'x/(x^2+y^2)', R: '0' },
    F: (x, y, _z, _p, out, o) => {
      const d = x * x + y * y;
      out[o] = -y / d;
      out[o + 1] = x / d;
      out[o + 2] = 0;
    },
    J: (x, y, _z, _p, out, o) => {
      const d = x * x + y * y;
      const d2 = d * d;
      escribirJ(out, o, [2 * x * y / d2, (y * y - x * x) / d2, 0, (y * y - x * x) / d2, -2 * x * y / d2, 0, 0, 0, 0]);
    },
  },
  {
    id: 'T5',
    expresiones: { P: 'abs(x)', Q: '0', R: '0' },
    F: (x, _y, _z, _p, out, o) => {
      out[o] = Math.abs(x);
      out[o + 1] = 0;
      out[o + 2] = 0;
    },
    J: (x, _y, _z, _p, out, o) => escribirJ(out, o, [Math.sign(x), 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'T6',
    expresiones: { P: 'x^2', Q: 'y', R: '0' },
    F: (x, y, _z, _p, out, o) => {
      out[o] = x * x;
      out[o + 1] = y;
      out[o + 2] = 0;
    },
    J: (x, _y, _z, _p, out, o) => escribirJ(out, o, [2 * x, 0, 0, 0, 1, 0, 0, 0, 0]),
  },
];
