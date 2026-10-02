/**
 * Geometría de cámara pura (eje z hacia arriba): coordenadas esféricas, vistas
 * predefinidas, distancia de encuadre y marcas «redondas» de los ejes.
 */
import type { Dominio, Vec3 } from '../math/tipos';

export type Vista = 'iso' | 'XY' | 'XZ' | 'YZ';

export interface Esferica {
  radio: number;
  /** Ángulo desde +z, en (0, π). */
  polar: number;
  /** Ángulo desde +x hacia +y. */
  azimut: number;
}

const grados = (g: number) => (g * Math.PI) / 180;
/** Ángulo polar mínimo (OrbitControls evita el polo exacto). */
export const POLAR_MIN = 1e-4;

/**
 * Vistas predefinidas. Para que en pantalla queden «x a la derecha, y arriba» (XY), «x a la
 * derecha, z arriba» (XZ) e «y a la derecha, z arriba» (YZ), con una base dextrógira:
 * XY mira desde +z con azimut −90°; XZ desde −y; YZ desde +x.
 */
export const VISTAS: Record<Vista, { polar: number; azimut: number }> = {
  iso: { polar: grados(68), azimut: grados(40) },
  XY: { polar: POLAR_MIN, azimut: grados(-90) },
  XZ: { polar: grados(90), azimut: grados(-90) },
  YZ: { polar: grados(90), azimut: 0 },
};

export function centroDominio(d: Dominio): Vec3 {
  return [(d.min[0] + d.max[0]) / 2, (d.min[1] + d.max[1]) / 2, (d.min[2] + d.max[2]) / 2];
}

export function radioDominio(d: Dominio): number {
  return Math.hypot(d.max[0] - d.min[0], d.max[1] - d.min[1], d.max[2] - d.min[2]) / 2;
}

export function posicionDesdeEsferica(objetivo: Vec3, e: Esferica): Vec3 {
  const sp = Math.sin(e.polar);
  return [
    objetivo[0] + e.radio * sp * Math.cos(e.azimut),
    objetivo[1] + e.radio * sp * Math.sin(e.azimut),
    objetivo[2] + e.radio * Math.cos(e.polar),
  ];
}

export function esfericaDesdePosicion(objetivo: Vec3, pos: Vec3): Esferica {
  const dx = pos[0] - objetivo[0];
  const dy = pos[1] - objetivo[1];
  const dz = pos[2] - objetivo[2];
  const radio = Math.hypot(dx, dy, dz);
  return {
    radio,
    polar: radio > 0 ? Math.acos(Math.min(1, Math.max(-1, dz / radio))) : POLAR_MIN,
    azimut: Math.atan2(dy, dx),
  };
}

/**
 * Distancia para que la esfera que envuelve Ω quepa en el campo de visión (vertical u
 * horizontal, el más estrecho), con un pequeño ajuste porque la caja ocupa menos que su
 * esfera envolvente.
 */
export function distanciaEncuadre(d: Dominio, fovVerticalGrados: number, aspecto: number): number {
  const r = radioDominio(d);
  const fv = grados(fovVerticalGrados) / 2;
  const fh = Math.atan(Math.tan(fv) * aspecto);
  const f = Math.min(fv, fh);
  return (1.04 * r) / Math.sin(f);
}

/** Interpolación de esféricas por el camino angular más corto. */
export function interpolarEsferica(a: Esferica, b: Esferica, t: number): Esferica {
  let da = b.azimut - a.azimut;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  return {
    radio: a.radio + (b.radio - a.radio) * t,
    polar: a.polar + (b.polar - a.polar) * t,
    azimut: a.azimut + da * t,
  };
}

export const suavizado = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Marcas «redondas» (1, 2, 2.5, 5 × 10ᵏ) dentro de [min, max], unas `objetivo`. */
export function marcasEje(min: number, max: number, objetivo = 4): number[] {
  const rango = max - min;
  if (!(rango > 0)) return [min];
  const bruto = rango / objetivo;
  const decada = 10 ** Math.floor(Math.log10(bruto));
  const paso = ([1, 2, 2.5, 5, 10].map((m) => m * decada).find((p) => p >= bruto) ?? 10 * decada) as number;
  const inicio = Math.ceil(min / paso - 1e-9) * paso;
  const marcas: number[] = [];
  for (let v = inicio; v <= max + paso * 1e-9; v += paso) marcas.push(Math.abs(v) < paso * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return marcas;
}
