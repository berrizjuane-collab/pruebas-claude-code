/**
 * Partículas trazadoras (NUM-05, SPEC §3.6, §5.8): resuelven dr/dt = F(r) con el campo SIN
 * normalizar (la velocidad es exactamente F). RK4 en t con subpasos tales que
 * ‖F‖·δt ≤ Δ/4 (máximo 8). Renacen en una posición aleatoria reproducible al salir de Ω,
 * al llegar a un cero visual, en un punto no definido o al superar su vida máxima.
 */
import { mulberry32 } from '../math/aleatorio';
import type { Dominio, EvaluadorCampo } from '../math/tipos';
import { CERO_VISUAL, F_MAX } from './grid';

/** Un paso de RK4 en el tiempo, en el sitio. Devuelve false si alguna etapa no está definida. */
export function pasoRK4Tiempo(F: EvaluadorCampo, p: Float64Array, r: Float64Array, h: number, k: Float64Array = new Float64Array(12)): boolean {
  const x = r[0] as number;
  const y = r[1] as number;
  const z = r[2] as number;
  F(x, y, z, p, k, 0);
  F(x + 0.5 * h * (k[0] as number), y + 0.5 * h * (k[1] as number), z + 0.5 * h * (k[2] as number), p, k, 3);
  F(x + 0.5 * h * (k[3] as number), y + 0.5 * h * (k[4] as number), z + 0.5 * h * (k[5] as number), p, k, 6);
  F(x + h * (k[6] as number), y + h * (k[7] as number), z + h * (k[8] as number), p, k, 9);
  for (let i = 0; i < 12; i++) if (!Number.isFinite(k[i])) return false;
  const s = h / 6;
  r[0] = x + s * ((k[0] as number) + 2 * (k[3] as number) + 2 * (k[6] as number) + (k[9] as number));
  r[1] = y + s * ((k[1] as number) + 2 * (k[4] as number) + 2 * (k[7] as number) + (k[10] as number));
  r[2] = z + s * ((k[2] as number) + 2 * (k[5] as number) + 2 * (k[8] as number) + (k[11] as number));
  return true;
}

export interface OpcionesParticulas {
  n: number;
  semilla: number;
  dominio: Dominio;
  /** Vida máxima en segundos reales. */
  vidaMax?: number;
  /** Posiciones de la estela. */
  estela?: number;
}

export const SUBPASOS_MAX = 8;

export class SistemaParticulas {
  readonly n: number;
  readonly largoEstela: number;
  readonly pos: Float64Array;
  readonly edad: Float64Array;
  /** Estela: para la partícula i, largoEstela posiciones (anillo); la más reciente en `cabeza`. */
  readonly estela: Float32Array;
  readonly llenado: Uint8Array;
  cabeza = 0;
  renacimientos = 0;
  private readonly azar: () => number;
  private readonly vidaMax: number;
  private readonly k = new Float64Array(12);
  private readonly r = new Float64Array(3);
  private readonly f = new Float64Array(3);

  constructor(private readonly o: OpcionesParticulas) {
    this.n = o.n;
    this.largoEstela = o.estela ?? 12;
    this.vidaMax = o.vidaMax ?? 8;
    this.azar = mulberry32(o.semilla);
    this.pos = new Float64Array(3 * this.n);
    this.edad = new Float64Array(this.n);
    this.estela = new Float32Array(3 * this.n * this.largoEstela);
    this.llenado = new Uint8Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.renacer(i);
      // Edades escalonadas para que no renazcan todas a la vez.
      this.edad[i] = this.azar() * this.vidaMax;
    }
  }

  renacer(i: number): void {
    const d = this.o.dominio;
    for (let k = 0; k < 3; k++) this.pos[3 * i + k] = (d.min[k] as number) + ((d.max[k] as number) - (d.min[k] as number)) * this.azar();
    this.edad[i] = 0;
    this.llenado[i] = 0;
    this.renacimientos++;
  }

  /** Avanza dtReal segundos reales con escala temporal τ (unidades de t por segundo). */
  avanzar(F: EvaluadorCampo, p: Float64Array, dtReal: number, tau: number, fRef: number, delta: number): void {
    const dt = tau * dtReal;
    const d = this.o.dominio;
    const umbral = CERO_VISUAL * fRef;
    this.cabeza = (this.cabeza + 1) % this.largoEstela;
    for (let i = 0; i < this.n; i++) {
      const r = this.r;
      r[0] = this.pos[3 * i] as number;
      r[1] = this.pos[3 * i + 1] as number;
      r[2] = this.pos[3 * i + 2] as number;
      F(r[0], r[1], r[2], p, this.f, 0);
      const m = Math.hypot(this.f[0] as number, this.f[1] as number, this.f[2] as number);
      let viva = Number.isFinite(m) && m <= F_MAX && m >= umbral && (this.edad[i] as number) <= this.vidaMax;
      if (viva && dt > 0) {
        const subpasos = Math.min(SUBPASOS_MAX, Math.max(1, Math.ceil((m * dt) / (delta / 4))));
        const h = dt / subpasos;
        for (let s = 0; s < subpasos && viva; s++) viva = pasoRK4Tiempo(F, p, r, h, this.k);
        for (let k = 0; k < 3 && viva; k++) if ((r[k] as number) < (d.min[k] as number) || (r[k] as number) > (d.max[k] as number)) viva = false;
      }
      if (!viva) {
        this.renacer(i);
      } else {
        this.pos[3 * i] = r[0] as number;
        this.pos[3 * i + 1] = r[1] as number;
        this.pos[3 * i + 2] = r[2] as number;
        this.edad[i] = (this.edad[i] as number) + dtReal;
      }
      const j = 3 * (i * this.largoEstela + this.cabeza);
      this.estela[j] = this.pos[3 * i] as number;
      this.estela[j + 1] = this.pos[3 * i + 1] as number;
      this.estela[j + 2] = this.pos[3 * i + 2] as number;
      this.llenado[i] = Math.min(this.largoEstela, (this.llenado[i] as number) + 1);
    }
  }

  /** Velocidad de la partícula i: exactamente F en su posición (SPEC §3.6). */
  velocidad(F: EvaluadorCampo, p: Float64Array, i: number, out: Float64Array = new Float64Array(3)): Float64Array {
    F(this.pos[3 * i] as number, this.pos[3 * i + 1] as number, this.pos[3 * i + 2] as number, p, out, 0);
    return out;
  }
}
