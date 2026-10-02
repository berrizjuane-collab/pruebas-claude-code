/**
 * Geometría del mapa escalar del corte (REN-06, DESIGN §9.6–9.8), sin Three.js: la curva de
 * nivel cero por cuadrados en marcha, encadenada en polilíneas (así la discontinuidad de
 * 6-4 px es regular a lo largo de la curva), y los glifos dispersos con el signo del escalar.
 */
import { EJES_PLANO, type Dominio, type Plano } from '../math/tipos';

/** Por debajo del 2 % de V_ref el corte queda en el fondo: sin patrón ni glifo (DESIGN §9.6). */
export const UMBRAL_CERO = 0.02;

/** Glifos dispersos por eje del plano (4 × 4 = 16 en total). */
export const GLIFOS_POR_EJE = 4;

export interface RejillaEscalar {
  plano: Plano;
  /** Coordenada del plano (ya dentro de Ω). */
  c: number;
  dominio: Dominio;
  /** Muestras por eje; la fila j es la coordenada v del plano. */
  lado: number;
  valores: ArrayLike<number>;
  /** 0 definido, 1 no definido, 2 no diferenciable. */
  estado: ArrayLike<number>;
}

export interface ContornoCero {
  /** Pares de puntos 3D (6 por segmento), consecutivos dentro de cada polilínea. */
  segmentos: Float32Array;
  polilineas: number;
}

/** Punto 3D de coordenadas de rejilla fraccionarias (i, j). */
export function puntoRejilla(r: RejillaEscalar, i: number, j: number): [number, number, number] {
  const { u, v, n } = EJES_PLANO[r.plano];
  const d = r.dominio;
  const q: [number, number, number] = [0, 0, 0];
  q[u] = (d.min[u] as number) + (((d.max[u] as number) - (d.min[u] as number)) * i) / (r.lado - 1);
  q[v] = (d.min[v] as number) + (((d.max[v] as number) - (d.min[v] as number)) * j) / (r.lado - 1);
  q[n] = r.c;
  return q;
}

const definido = (r: RejillaEscalar, k: number) => r.estado[k] === 0 && Number.isFinite(r.valores[k] as number);

/**
 * Curva s = 0 por cuadrados en marcha. Las celdas con alguna esquina sin valor no aportan
 * nada; los puntos de silla se deciden con el valor medio de la celda. Un valor con
 * |s| ≤ 10⁻⁹·máx|s| cuenta como cero (lado no negativo): el ruido de redondeo de un escalar
 * idénticamente nulo no dibuja curvas.
 */
export function contornoCero(r: RejillaEscalar): ContornoCero {
  const L = r.lado;
  let maximo = 0;
  for (let k = 0; k < L * L; k++) if (definido(r, k)) maximo = Math.max(maximo, Math.abs(r.valores[k] as number));
  if (!(maximo > 1e-12)) return { segmentos: new Float32Array(0), polilineas: 0 };
  const eps = 1e-9 * maximo;
  const negativo = (k: number) => (r.valores[k] as number) < -eps;
  // Aristas: horizontal (i, j)–(i+1, j) → 2(jL+i); vertical (i, j)–(i, j+1) → 2(jL+i)+1.
  const puntos = new Map<number, [number, number]>();
  const arista = (i: number, j: number, vertical: boolean): number => {
    const id = 2 * (j * L + i) + (vertical ? 1 : 0);
    if (!puntos.has(id)) {
      const p = r.valores[j * L + i] as number;
      const q = r.valores[(vertical ? j + 1 : j) * L + (vertical ? i : i + 1)] as number;
      const t = Math.min(1, Math.max(0, p / (p - q)));
      puntos.set(id, vertical ? [i, j + t] : [i + t, j]);
    }
    return id;
  };
  const segs: [number, number][] = [];
  for (let j = 0; j < L - 1; j++) {
    for (let i = 0; i < L - 1; i++) {
      const ka = j * L + i;
      const kb = ka + 1;
      const kc = ka + L + 1;
      const kd = ka + L;
      if (!definido(r, ka) || !definido(r, kb) || !definido(r, kc) || !definido(r, kd)) continue;
      const caso = (negativo(ka) ? 1 : 0) | (negativo(kb) ? 2 : 0) | (negativo(kc) ? 4 : 0) | (negativo(kd) ? 8 : 0);
      if (caso === 0 || caso === 15) continue;
      const e0 = () => arista(i, j, false);
      const e1 = () => arista(i + 1, j, true);
      const e2 = () => arista(i, j + 1, false);
      const e3 = () => arista(i, j, true);
      const centroNegativo = () =>
        ((r.valores[ka] as number) + (r.valores[kb] as number) + (r.valores[kc] as number) + (r.valores[kd] as number)) / 4 < -eps;
      switch (caso) {
        case 1:
        case 14:
          segs.push([e3(), e0()]);
          break;
        case 2:
        case 13:
          segs.push([e0(), e1()]);
          break;
        case 3:
        case 12:
          segs.push([e3(), e1()]);
          break;
        case 4:
        case 11:
          segs.push([e1(), e2()]);
          break;
        case 6:
        case 9:
          segs.push([e0(), e2()]);
          break;
        case 7:
        case 8:
          segs.push([e3(), e2()]);
          break;
        case 5: // a y c negativas
          if (centroNegativo()) segs.push([e0(), e1()], [e2(), e3()]);
          else segs.push([e3(), e0()], [e1(), e2()]);
          break;
        case 10: // b y d negativas
          if (centroNegativo()) segs.push([e3(), e0()], [e1(), e2()]);
          else segs.push([e0(), e1()], [e2(), e3()]);
          break;
      }
    }
  }
  // Encadenado: cada punto de arista pertenece como mucho a dos segmentos.
  const ady = new Map<number, number[]>();
  segs.forEach(([a, b], s) => {
    for (const e of [a, b]) {
      const l = ady.get(e);
      if (l) l.push(s);
      else ady.set(e, [s]);
    }
  });
  const usado = new Uint8Array(segs.length);
  const cadenas: number[][] = [];
  const recorrer = (desde: number, s0: number) => {
    const c = [desde];
    let e = desde;
    let s = s0;
    while (s >= 0 && !usado[s]) {
      usado[s] = 1;
      const [a, b] = segs[s] as [number, number];
      e = a === e ? b : a;
      c.push(e);
      s = (ady.get(e) ?? []).find((t) => !usado[t]) ?? -1;
    }
    cadenas.push(c);
  };
  // Primero las abiertas (desde un extremo); después los ciclos.
  for (const [e, l] of ady) if (l.length === 1 && !usado[l[0] as number]) recorrer(e, l[0] as number);
  segs.forEach(([a], s) => {
    if (!usado[s]) recorrer(a, s);
  });
  const out = new Float32Array(6 * segs.length);
  let o = 0;
  for (const c of cadenas) {
    for (let k = 0; k + 1 < c.length; k++) {
      for (const e of [c[k] as number, c[k + 1] as number]) {
        const [i, j] = puntos.get(e) as [number, number];
        out.set(puntoRejilla(r, i, j), o);
        o += 3;
      }
    }
  }
  return { segmentos: out, polilineas: cadenas.length };
}

/**
 * Posiciones de los glifos en un eje del plano: centros de GLIFOS_POR_EJE tramos iguales,
 * apartados medio paso de los nodos de las flechas (hacia el centro) cuando caen encima.
 */
export function posicionesEje(min: number, max: number, nodos: number, g = GLIFOS_POR_EJE): number[] {
  const lado = max - min;
  const delta = nodos > 1 ? lado / (nodos - 1) : lado;
  const centro = (min + max) / 2;
  return Array.from({ length: g }, (_, k) => {
    const p = min + (lado * (2 * k + 1)) / (2 * g);
    const r = (p - min) / delta;
    return Math.abs(r - Math.round(r)) < 0.25 ? p + ((p <= centro ? 1 : -1) * delta) / 2 : p;
  });
}

export interface MuestrasGlifos {
  /** Posiciones 3D (3k). */
  pos: Float32Array;
  /** Valor interpolado (NaN si alguna esquina de su celda no tiene valor). */
  valor: Float64Array;
}

/** Valor del escalar (interpolación bilineal) en los puntos de los glifos dispersos. */
export function muestrasGlifos(r: RejillaEscalar, nodos: [number, number]): MuestrasGlifos {
  const { u, v } = EJES_PLANO[r.plano];
  const d = r.dominio;
  const pu = posicionesEje(d.min[u] as number, d.max[u] as number, nodos[0]);
  const pv = posicionesEje(d.min[v] as number, d.max[v] as number, nodos[1]);
  const L = r.lado;
  const pos = new Float32Array(3 * pu.length * pv.length);
  const valor = new Float64Array(pu.length * pv.length);
  let k = 0;
  for (const b of pv) {
    for (const a of pu) {
      const gi = ((a - (d.min[u] as number)) / ((d.max[u] as number) - (d.min[u] as number))) * (L - 1);
      const gj = ((b - (d.min[v] as number)) / ((d.max[v] as number) - (d.min[v] as number))) * (L - 1);
      const i0 = Math.min(L - 2, Math.max(0, Math.floor(gi)));
      const j0 = Math.min(L - 2, Math.max(0, Math.floor(gj)));
      const fi = gi - i0;
      const fj = gj - j0;
      const esquinas = [j0 * L + i0, j0 * L + i0 + 1, (j0 + 1) * L + i0, (j0 + 1) * L + i0 + 1];
      const val = (q: number) => r.valores[esquinas[q] as number] as number;
      valor[k] = esquinas.every((q) => definido(r, q))
        ? (val(0) * (1 - fi) + val(1) * fi) * (1 - fj) + (val(2) * (1 - fi) + val(3) * fi) * fj
        : NaN;
      pos.set(puntoRejilla(r, gi, gj), 3 * k);
      k++;
    }
  }
  return { pos, valor };
}

/** Signo que muestra cada glifo: +1, −1, 0 (sin glifo: |s| < 2 % V_ref) o NaN (no definido, «×»). */
export function signoGlifo(valor: number, vRef: number): number {
  if (!Number.isFinite(valor)) return NaN;
  if (Math.abs(valor) < UMBRAL_CERO * vRef) return 0;
  return Math.sign(valor);
}
