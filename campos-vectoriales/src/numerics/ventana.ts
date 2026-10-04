/**
 * Espacio sin límites (ALC-02, SPEC §3.11): ventana de muestreo anclada a la red infinita de Ω
 * que acompaña a la cámara, y semillas ancladas a una red gruesa. Funciones puras.
 *
 * La red de Ω es L = {(a_x + iΔ_x, a_y + jΔ_y, a_z + kΔ_z) : i, j, k ∈ ℤ}. La ventana es
 * Ω + (m_xΔ_x, m_yΔ_y, m_zΔ_z) con m_k = round((c_cám,k − c_k)/Δ_k): sus nodos pertenecen a L,
 * de modo que la flecha de un punto no cambia al moverse (solo aparecen y desaparecen flechas
 * en los bordes).
 */
import type { Dominio, Vec3 } from '../math/tipos';

export type Desplazamiento = readonly [number, number, number];

/** m_k = round((c_cám,k − c_k)/Δ_k): múltiplos enteros de Δ por eje. */
export function desplazamientoVentana(base: Dominio, delta: Vec3, camara: Vec3): Desplazamiento {
  return [0, 1, 2].map((k) => {
    const c = ((base.min[k] as number) + (base.max[k] as number)) / 2;
    const m = Math.round(((camara[k] as number) - c) / (delta[k] as number));
    return Object.is(m, -0) ? 0 : m;
  }) as unknown as Desplazamiento;
}

/** Ω desplazado m⊙Δ. Los extremos se calculan como a + m·Δ para que caigan sobre la red. */
export function ventanaDesplazada(base: Dominio, delta: Vec3, m: Desplazamiento): Dominio {
  const mover = (v: Vec3) => [0, 1, 2].map((k) => (v[k] as number) + (m[k] as number) * (delta[k] as number)) as unknown as Vec3;
  return { min: mover(base.min), max: mover(base.max) };
}

/** Hash entero de una celda y una semilla (Murmur3, mezcla final): tres números en [0, 1). */
function hashCelda(i: number, j: number, k: number, semilla: number): [number, number, number] {
  const mezclar = (h: number) => {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  };
  let h = mezclar(semilla ^ 0x9e3779b9);
  h = mezclar(h ^ Math.imul(i | 0, 0x27d4eb2d));
  h = mezclar(h ^ Math.imul(j | 0, 0x165667b1));
  h = mezclar(h ^ Math.imul(k | 0, 0x61c88647));
  const a = mezclar(h ^ 1);
  const b = mezclar(h ^ 2);
  const c = mezclar(h ^ 3);
  return [a / 2 ** 32, b / 2 ** 32, c / 2 ** 32];
}

/** Lado de la red gruesa de semillas: D = (vol Ω / n)^(1/3), una semilla por celda (SPEC §5.11). */
export function ladoCeldaSemillas(base: Dominio, n: number): number {
  const vol = [0, 1, 2].reduce((v, k) => v * ((base.max[k] as number) - (base.min[k] as number)), 1);
  return Math.cbrt(vol / Math.max(1, n));
}

/**
 * Semillas ancladas: en la celda (i, j, k) de lado D alineada con `ancla`, la semilla
 * ancla + D·((i, j, k) + h(i, j, k)), con h un hash de la celda. Solo las que caen dentro de la
 * ventana, en orden de celdas. Dos ventanas comparten exactamente las semillas de su intersección.
 */
export function semillasAncladas(ventana: Dominio, ancla: Vec3, D: number, semilla: number): Float64Array {
  const rango = (k: number) => [Math.floor(((ventana.min[k] as number) - (ancla[k] as number)) / D), Math.floor(((ventana.max[k] as number) - (ancla[k] as number)) / D)] as const;
  const [ri, rj, rk] = [rango(0), rango(1), rango(2)];
  const puntos: number[] = [];
  for (let k = rk[0]; k <= rk[1]; k++) {
    for (let j = rj[0]; j <= rj[1]; j++) {
      for (let i = ri[0]; i <= ri[1]; i++) {
        const h = hashCelda(i, j, k, semilla);
        const q = [(ancla[0] as number) + D * (i + h[0]), (ancla[1] as number) + D * (j + h[1]), (ancla[2] as number) + D * (k + h[2])];
        if (q.every((c, e) => c >= (ventana.min[e] as number) && c <= (ventana.max[e] as number))) puntos.push(...q);
      }
    }
  }
  return Float64Array.from(puntos);
}
