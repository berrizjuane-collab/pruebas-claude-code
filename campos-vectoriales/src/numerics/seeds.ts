/**
 * Semillas de las líneas de corriente (NUM-04, SPEC §5.6): rejilla en un plano, aleatorias
 * reproducibles (mulberry32) y anillo alrededor del punto inspeccionado. Se descartan y se
 * cuentan las semillas fuera de Ω, en ceros o en puntos no definidos. Máximo 256.
 */
import { mulberry32 } from '../math/aleatorio';
import { EJES_PLANO, type Dominio, type EspecSemillas, type EvaluadorCampo, type Vec3 } from '../math/tipos';
import { F_MAX } from './grid';
import { semillasAncladas } from './ventana';

export const SEMILLAS_MAX = 256;

export interface ResultadoSemillas {
  /** Semillas válidas (3n). */
  puntos: Float64Array;
  n: number;
  descartadas: { fuera: number; cero: number; noDefinido: number };
  /** Semillas que no se usaron por superar el máximo. */
  recortadas: number;
}

const enRango = (n: number, a: number, b: number, i: number) => (n === 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1));

/** Candidatas sin filtrar. */
export function candidatas(esp: EspecSemillas, dominio: Dominio, punto: Vec3 | null, fPunto: Vec3 | null, delta: number): number[] {
  const res: number[] = [];
  if (esp.tipo === 'rejilla') {
    const { u, v, n } = EJES_PLANO[esp.plano];
    const ru = esp.u ?? [dominio.min[u], dominio.max[u]];
    const rv = esp.v ?? [dominio.min[v], dominio.max[v]];
    for (let j = 0; j < esp.nv; j++) {
      for (let i = 0; i < esp.nu; i++) {
        const q = [0, 0, 0];
        q[u] = enRango(esp.nu, ru[0], ru[1], i);
        q[v] = enRango(esp.nv, rv[0], rv[1], j);
        q[n] = esp.c;
        res.push(q[0] as number, q[1] as number, q[2] as number);
      }
    }
  } else if (esp.tipo === 'red') {
    res.push(...semillasAncladas(dominio, esp.ancla, esp.D, esp.semilla));
  } else if (esp.tipo === 'aleatoria') {
    const azar = mulberry32(esp.semilla);
    for (let i = 0; i < esp.n; i++) {
      for (let k = 0; k < 3; k++) res.push((dominio.min[k] as number) + ((dominio.max[k] as number) - (dominio.min[k] as number)) * azar());
    }
  } else if (esp.tipo === 'punto' && punto) {
    res.push(...punto);
    // Anillo de 6 semillas a Δ/4 en el plano normal a F(P) (o al eje z si F(P) ≈ 0).
    let nrm: Vec3 = [0, 0, 1];
    const m = fPunto ? Math.hypot(...fPunto) : 0;
    if (fPunto && m > 0 && Number.isFinite(m)) nrm = [fPunto[0] / m, fPunto[1] / m, fPunto[2] / m];
    const aux: Vec3 = Math.abs(nrm[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u1: Vec3 = [nrm[1] * aux[2] - nrm[2] * aux[1], nrm[2] * aux[0] - nrm[0] * aux[2], nrm[0] * aux[1] - nrm[1] * aux[0]];
    const lu = Math.hypot(...u1);
    const ue: Vec3 = [u1[0] / lu, u1[1] / lu, u1[2] / lu];
    const ve: Vec3 = [nrm[1] * ue[2] - nrm[2] * ue[1], nrm[2] * ue[0] - nrm[0] * ue[2], nrm[0] * ue[1] - nrm[1] * ue[0]];
    const r = delta / 4;
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r;
      res.push(punto[0] + c * ue[0] + s * ve[0], punto[1] + c * ue[1] + s * ve[1], punto[2] + c * ue[2] + s * ve[2]);
    }
  }
  return res;
}

export function generarSemillas(
  esp: EspecSemillas,
  dominio: Dominio,
  F: EvaluadorCampo,
  p: Float64Array,
  fRef: number,
  opciones: { delta: number; punto?: Vec3 | null; epsStop?: number },
): ResultadoSemillas {
  const f = new Float64Array(3);
  let fPunto: Vec3 | null = null;
  if (opciones.punto) {
    F(...opciones.punto, p, f, 0);
    fPunto = [f[0] as number, f[1] as number, f[2] as number];
  }
  const c = candidatas(esp, dominio, opciones.punto ?? null, fPunto, opciones.delta);
  const umbral = (opciones.epsStop ?? 1e-3) * fRef;
  const validas: number[] = [];
  const descartadas = { fuera: 0, cero: 0, noDefinido: 0 };
  let recortadas = 0;
  for (let i = 0; i < c.length; i += 3) {
    const x = c[i] as number;
    const y = c[i + 1] as number;
    const z = c[i + 2] as number;
    const tol = (k: number) => 1e-12 * ((dominio.max[k] as number) - (dominio.min[k] as number));
    if ([x, y, z].some((v, k) => v < (dominio.min[k] as number) - tol(k) || v > (dominio.max[k] as number) + tol(k))) {
      descartadas.fuera++;
      continue;
    }
    F(x, y, z, p, f, 0);
    const m = Math.hypot(f[0] as number, f[1] as number, f[2] as number);
    if (!Number.isFinite(m) || m > F_MAX) {
      descartadas.noDefinido++;
      continue;
    }
    if (m < umbral) {
      descartadas.cero++;
      continue;
    }
    if (validas.length / 3 >= SEMILLAS_MAX) {
      recortadas++;
      continue;
    }
    validas.push(x, y, z);
  }
  return { puntos: Float64Array.from(validas), n: validas.length / 3, descartadas, recortadas };
}
