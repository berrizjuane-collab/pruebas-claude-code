/**
 * Utilidades compartidas por los scripts de calibración y validación (Node, CPU).
 */
import { KerrSchild } from '../src/physics/metrics/kerrSchild';
import { gramSchmidtTetrad, staticObserver } from '../src/physics/observers/observers';
import type { CameraState } from '../src/physics/optics/cpuTracer';

/**
 * Cámara estática lejana a distancia D e inclinación i (ángulo desde el eje de espín +z), en el
 * plano x–z, mirando al origen con «arriba» = proyección del eje de espín. Devuelve la tétrada en
 * el orden (u, derecha, arriba, adelante).
 */
export function inclinedCamera(ks: KerrSchild, D: number, incDeg: number, t = 0): CameraState {
  const i = (incDeg * Math.PI) / 180;
  const pos: [number, number, number] = [D * Math.sin(i), 0, D * Math.cos(i)];
  const u = staticObserver(ks, pos[0], pos[1], pos[2]);
  if (!u) throw new Error('cámara dentro de la ergosfera');
  const fwd = [0, -Math.sin(i), 0, -Math.cos(i)];
  const up = [0, -Math.cos(i), 0, Math.sin(i)];
  // derecha = adelante × arriba
  const right = [0, fwd[2] * up[3] - fwd[3] * up[2], fwd[3] * up[1] - fwd[1] * up[3], fwd[1] * up[2] - fwd[2] * up[1]];
  const tet = gramSchmidtTetrad(ks, pos[0], pos[1], pos[2], u, [fwd, up, right]);
  return { t, pos, tetrad: { e: [tet.e[0], tet.e[3], tet.e[2], tet.e[1]] } };
}
