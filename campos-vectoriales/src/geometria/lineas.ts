/**
 * Geometría de las líneas de corriente para dibujar (REN-03, DESIGN §9.4): segmentos para
 * `LineSegments2`, cheurones de sentido cada 1.5 Δ de longitud de arco, semillas y marcas
 * finales según el motivo de parada (◇ ≈ 0, × no definido). Pura: la calcula el worker.
 */
import { MOTIVOS } from '../numerics/streamlines';

/** Forma de la marca final según el motivo (las de los glifos de la escena). */
export const FINAL = { NINGUNO: 0, ROMBO: 1, ASPA: 2 } as const;

export interface GeometriaLineas {
  /** Pares de puntos (6 valores por segmento). */
  segmentos: Float32Array;
  /** Posición (3) y tangente unitaria (3) de cada cheurón. */
  cheurones: Float32Array;
  tangentes: Float32Array;
  /** Posición de cada semilla (3 por línea). */
  semillas: Float32Array;
  /** Marcas finales: posición (3) y forma (FINAL) de cada una. */
  finales: Float32Array;
  formasFinales: Uint8Array;
}

const motivoFinal = (m: number): number => {
  const nombre = MOTIVOS[m];
  if (nombre === 'CERO') return FINAL.ROMBO;
  if (nombre === 'NO_DEFINIDO') return FINAL.ASPA;
  return FINAL.NINGUNO;
};

/**
 * @param posiciones puntos concatenados de todas las líneas (3 por punto), en el sentido de +F
 * @param inicio inicio[i] … inicio[i+1]−1: puntos de la línea i
 * @param motivos [atrás, adelante] por línea (índice en MOTIVOS; 255 = ninguno)
 * @param separacion distancia entre cheurones en longitud de arco (1.5 Δ)
 */
export function geometriaLineas(
  posiciones: Float32Array,
  inicio: Uint32Array,
  semilla: Uint32Array,
  motivos: Uint8Array,
  nLineas: number,
  separacion: number,
): GeometriaLineas {
  const puntos = posiciones.length / 3;
  const segmentos = new Float32Array(6 * Math.max(0, puntos - nLineas));
  const cheurones: number[] = [];
  const tangentes: number[] = [];
  const semillas = new Float32Array(3 * nLineas);
  const finales: number[] = [];
  const formas: number[] = [];
  let s = 0;
  for (let l = 0; l < nLineas; l++) {
    const a = inicio[l] as number;
    const b = (inicio[l + 1] as number) - 1;
    // El primer cheurón va a media separación del inicio, para que ninguno caiga en un extremo.
    let siguiente = separacion / 2;
    let sigma = 0;
    for (let k = a; k < b; k++) {
      const x0 = posiciones[3 * k] as number;
      const y0 = posiciones[3 * k + 1] as number;
      const z0 = posiciones[3 * k + 2] as number;
      const x1 = posiciones[3 * k + 3] as number;
      const y1 = posiciones[3 * k + 4] as number;
      const z1 = posiciones[3 * k + 5] as number;
      segmentos.set([x0, y0, z0, x1, y1, z1], 6 * s++);
      const largo = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      if (largo === 0) continue;
      while (siguiente <= sigma + largo) {
        const t = (siguiente - sigma) / largo;
        cheurones.push(x0 + t * (x1 - x0), y0 + t * (y1 - y0), z0 + t * (z1 - z0));
        tangentes.push((x1 - x0) / largo, (y1 - y0) / largo, (z1 - z0) / largo);
        siguiente += separacion;
      }
      sigma += largo;
    }
    const ks = a + (semilla[l] as number);
    semillas.set([posiciones[3 * ks] as number, posiciones[3 * ks + 1] as number, posiciones[3 * ks + 2] as number], 3 * l);
    const fa = motivoFinal(motivos[2 * l] as number);
    if (fa !== FINAL.NINGUNO) {
      finales.push(posiciones[3 * a] as number, posiciones[3 * a + 1] as number, posiciones[3 * a + 2] as number);
      formas.push(fa);
    }
    const fb = motivoFinal(motivos[2 * l + 1] as number);
    if (fb !== FINAL.NINGUNO) {
      finales.push(posiciones[3 * b] as number, posiciones[3 * b + 1] as number, posiciones[3 * b + 2] as number);
      formas.push(fb);
    }
  }
  return {
    segmentos,
    cheurones: Float32Array.from(cheurones),
    tangentes: Float32Array.from(tangentes),
    semillas,
    finales: Float32Array.from(finales),
    formasFinales: Uint8Array.from(formas),
  };
}
