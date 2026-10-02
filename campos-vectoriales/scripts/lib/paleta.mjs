/**
 * Auditoría de paleta monocroma (RNF-01, VV-01): cuenta los píxeles cuyo color no es un
 * gris neutro dentro de una tolerancia (máxima diferencia entre canales).
 */
import { PNG } from 'pngjs';

export const TOLERANCIA_PALETA = 3;

/** @param {Buffer} buffer PNG  @param {number} tolerancia  */
export function auditarPaleta(buffer, tolerancia = TOLERANCIA_PALETA) {
  const png = PNG.sync.read(buffer);
  const { data, width, height } = png;
  let fuera = 0;
  let maxDiff = 0;
  const ejemplos = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const d = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (d > maxDiff) maxDiff = d;
    if (d > tolerancia) {
      fuera++;
      if (ejemplos.length < 8) {
        const p = i / 4;
        ejemplos.push({ x: p % width, y: Math.floor(p / width), rgb: [r, g, b] });
      }
    }
  }
  return { ancho: width, alto: height, pixeles: width * height, fuera, maxDiff, tolerancia, ejemplos, superada: fuera === 0 };
}

/** Luminancia media y desviación típica de un PNG (para comprobar que no está vacío). */
export function estadisticasLuminancia(buffer) {
  const { data } = PNG.sync.read(buffer);
  let suma = 0;
  let suma2 = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i];
    suma += v;
    suma2 += v * v;
  }
  const media = suma / n;
  return { media, desviacion: Math.sqrt(Math.max(0, suma2 / n - media * media)) };
}
