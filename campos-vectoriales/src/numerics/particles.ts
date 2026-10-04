/**
 * Partículas trazadoras (NUM-05, SPEC §3.6, §5.8): resuelven dr/dt = F(r, t) con el campo SIN
 * normalizar (la velocidad es exactamente F). RK4 en t con subpasos tales que
 * ‖F‖·δt ≤ Δ/4 (máximo 8); con un campo dependiente del tiempo, cada etapa se evalúa en su
 * instante (SPEC §5.11). Renacen al salir de Ω, al llegar a un cero visual, en un punto no
 * definido o al superar su vida máxima: en una posición aleatoria reproducible de Ω o, con
 * emisión desde semillas (líneas de traza, RF-25), en su semilla.
 */
import { mulberry32 } from '../math/aleatorio';
import type { Dominio, EvaluadorCampo } from '../math/tipos';
import { CERO_VISUAL, F_MAX } from './grid';

/**
 * Un paso de RK4 en el tiempo, en el sitio. Devuelve false si alguna etapa no está definida.
 *
 * Con `t` (campo dependiente del tiempo), `p` es un vector de evaluación cuya última ranura es
 * el instante (D-63): las etapas se evalúan en t, t + h/2, t + h/2 y t + h (SPEC §5.11), y al
 * terminar la ranura recupera su valor.
 */
export function pasoRK4Tiempo(F: EvaluadorCampo, p: Float64Array, r: Float64Array, h: number, k: Float64Array = new Float64Array(12), t?: number): boolean {
  const x = r[0] as number;
  const y = r[1] as number;
  const z = r[2] as number;
  const it = p.length - 1;
  const previo = p[it] as number;
  const conT = t !== undefined;
  if (conT) p[it] = t;
  F(x, y, z, p, k, 0);
  if (conT) p[it] = t + 0.5 * h;
  F(x + 0.5 * h * (k[0] as number), y + 0.5 * h * (k[1] as number), z + 0.5 * h * (k[2] as number), p, k, 3);
  F(x + 0.5 * h * (k[3] as number), y + 0.5 * h * (k[4] as number), z + 0.5 * h * (k[5] as number), p, k, 6);
  if (conT) p[it] = t + h;
  F(x + h * (k[6] as number), y + h * (k[7] as number), z + h * (k[8] as number), p, k, 9);
  if (conT) p[it] = previo;
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
  /** Pasos entre dos posiciones guardadas de la estela (1 = todas; la más reciente es siempre la actual). */
  pasosPorPunto?: number;
  /**
   * Emisión desde semillas (líneas de traza, RF-25): 3·S coordenadas. Las n partículas se
   * reparten por turnos entre las S semillas y salen escalonadas (SPEC §5.11).
   */
  semillas?: Float64Array | null;
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
  /** Segundos reales que faltan para que la partícula salga de su semilla (0 = en vuelo). */
  readonly espera: Float64Array;
  cabeza = 0;
  renacimientos = 0;
  private pasos = 0;
  private readonly pasosPorPunto: number;
  private readonly azar: () => number;
  private readonly vidaMax: number;
  private readonly k = new Float64Array(12);
  private readonly r = new Float64Array(3);
  private readonly f = new Float64Array(3);
  private dominio: Dominio;
  private semillas: Float64Array | null;

  constructor(o: OpcionesParticulas) {
    this.n = o.n;
    this.largoEstela = o.estela ?? 12;
    this.pasosPorPunto = Math.max(1, Math.round(o.pasosPorPunto ?? 1));
    this.vidaMax = o.vidaMax ?? 8;
    this.azar = mulberry32(o.semilla);
    this.dominio = o.dominio;
    this.semillas = o.semillas && o.semillas.length >= 3 ? o.semillas : null;
    this.pos = new Float64Array(3 * this.n);
    this.edad = new Float64Array(this.n);
    this.espera = new Float64Array(this.n);
    this.estela = new Float32Array(3 * this.n * this.largoEstela);
    this.llenado = new Uint8Array(this.n);
    const S = this.semillas ? this.semillas.length / 3 : 0;
    const porSemilla = S ? Math.ceil(this.n / S) : 0;
    for (let i = 0; i < this.n; i++) {
      this.renacer(i);
      if (S) {
        // La partícula j de su semilla sale tras j·T/⌈n/S⌉ segundos: una línea de traza regular.
        this.espera[i] = (Math.floor(i / S) * this.vidaMax) / porSemilla;
      } else {
        // Edades escalonadas para que no renazcan todas a la vez.
        this.edad[i] = this.azar() * this.vidaMax;
      }
    }
  }

  /** ¿Se emite desde semillas (líneas de traza)? */
  get emision(): boolean {
    return this.semillas !== null;
  }

  /** ¿Está la partícula en vuelo (no esperando su salida)? */
  enVuelo(i: number): boolean {
    return (this.espera[i] as number) <= 0;
  }

  renacer(i: number): void {
    if (this.semillas) {
      const s = i % (this.semillas.length / 3);
      for (let k = 0; k < 3; k++) this.pos[3 * i + k] = this.semillas[3 * s + k] as number;
    } else {
      const d = this.dominio;
      for (let k = 0; k < 3; k++) this.pos[3 * i + k] = (d.min[k] as number) + ((d.max[k] as number) - (d.min[k] as number)) * this.azar();
    }
    this.edad[i] = 0;
    this.llenado[i] = 0;
    this.renacimientos++;
  }

  /**
   * Avanza dtReal segundos reales con escala temporal τ (unidades de t por segundo). Con `t`
   * (campo dependiente del tiempo) integra de t a t + τ·dtReal con las etapas en su instante.
   */
  avanzar(F: EvaluadorCampo, p: Float64Array, dtReal: number, tau: number, fRef: number, delta: number, t?: number): void {
    const dt = tau * dtReal;
    const d = this.dominio;
    const it = p.length - 1;
    const previo = p[it] as number;
    if (t !== undefined) p[it] = t;
    const umbral = CERO_VISUAL * fRef;
    // Cada `pasosPorPunto` pasos la estela gana una posición; entre medias, la más reciente se
    // sustituye por la actual (la estela siempre llega hasta la partícula).
    const nuevoPunto = this.pasos % this.pasosPorPunto === 0;
    this.pasos++;
    if (nuevoPunto) this.cabeza = (this.cabeza + 1) % this.largoEstela;
    for (let i = 0; i < this.n; i++) {
      const r = this.r;
      r[0] = this.pos[3 * i] as number;
      r[1] = this.pos[3 * i + 1] as number;
      r[2] = this.pos[3 * i + 2] as number;
      if ((this.espera[i] as number) > 0) {
        // Aún en su semilla: sale en el fotograma en que se agota la espera (SPEC §5.11).
        this.espera[i] = Math.max(0, (this.espera[i] as number) - dtReal);
        if ((this.espera[i] as number) > 0) {
          this.llenado[i] = 0;
          const j = 3 * (i * this.largoEstela + this.cabeza);
          this.estela[j] = r[0];
          this.estela[j + 1] = r[1];
          this.estela[j + 2] = r[2];
          continue;
        }
      }
      F(r[0], r[1], r[2], p, this.f, 0);
      const m = Math.hypot(this.f[0] as number, this.f[1] as number, this.f[2] as number);
      let viva = Number.isFinite(m) && m <= F_MAX && m >= umbral && (this.edad[i] as number) <= this.vidaMax;
      if (viva && dt > 0) {
        const subpasos = Math.min(SUBPASOS_MAX, Math.max(1, Math.ceil((m * dt) / (delta / 4))));
        const h = dt / subpasos;
        for (let s = 0; s < subpasos && viva; s++) viva = pasoRK4Tiempo(F, p, r, h, this.k, t === undefined ? undefined : t + s * h);
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
      if (nuevoPunto || this.llenado[i] === 0) this.llenado[i] = Math.min(this.largoEstela, (this.llenado[i] as number) + 1);
    }
    p[it] = previo;
  }

  /**
   * Cambia el dominio sin recrear el sistema (espacio sin límites, SPEC §3.11): las partículas
   * que quedan fuera renacen en la parte nueva (muestreo por rechazo), de modo que la densidad
   * sigue siendo uniforme. Con emisión desde semillas, las semillas nuevas sustituyen a las
   * anteriores y renacen en ellas las partículas que quedan fuera.
   */
  fijarDominio(nuevo: Dominio, semillas?: Float64Array | null): void {
    const viejo = this.dominio;
    this.dominio = nuevo;
    if (semillas !== undefined) this.semillas = semillas && semillas.length >= 3 ? semillas : null;
    const dentro = (d: Dominio, q: ArrayLike<number>, o: number) =>
      [0, 1, 2].every((k) => (q[o + k] as number) >= (d.min[k] as number) && (q[o + k] as number) <= (d.max[k] as number));
    const q = new Float64Array(3);
    for (let i = 0; i < this.n; i++) {
      if (dentro(nuevo, this.pos, 3 * i)) continue;
      this.renacer(i);
      if (this.semillas) continue;
      // Rechazo: una posición de la parte nueva (fuera del dominio anterior), si existe.
      for (let intento = 0; intento < 32; intento++) {
        for (let k = 0; k < 3; k++) q[k] = (nuevo.min[k] as number) + ((nuevo.max[k] as number) - (nuevo.min[k] as number)) * this.azar();
        if (!dentro(viejo, q, 0)) {
          this.pos.set(q, 3 * i);
          break;
        }
      }
    }
  }

  /** Velocidad de la partícula i: exactamente F en su posición (SPEC §3.6). */
  velocidad(F: EvaluadorCampo, p: Float64Array, i: number, out: Float64Array = new Float64Array(3)): Float64Array {
    F(this.pos[3 * i] as number, this.pos[3 * i + 1] as number, this.pos[3 * i + 2] as number, p, out, 0);
    return out;
  }
}
