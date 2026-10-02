/**
 * Animación del campo (REN-08, DESIGN §8; SPEC §3.6 y §5.8): partículas trazadoras y rueda de
 * paletas con un reloj común, en el hilo principal. 1 s real ≙ τ unidades de t, con
 * τ = Δ/F_ref por defecto (una partícula con ‖F‖ = F_ref recorre una celda por segundo).
 *
 * - En marcha, un bucle `requestAnimationFrame` avanza con el tiempo real (como mucho 1/20 s
 *   por fotograma: al volver a la pestaña no hay saltos).
 * - En modo captura (`?captura=1`) el reloj no avanza solo: es determinista y lo avanzan las
 *   pruebas con pasos fijos (`avanzarFijo`).
 * - Al crear el sistema se avanzan unos pasos para que la estela indique el sentido aunque la
 *   animación empiece en pausa (movimiento reducido).
 */
import type { CampoCompilado } from '../math/field';
import type { Dominio, Vec3 } from '../math/tipos';
import { SistemaParticulas } from '../numerics/particles';

export interface ConfigAnimacion {
  campo: CampoCompilado;
  p: Float64Array;
  dominio: Dominio;
  /** Partículas (0 = capa apagada). */
  n: number;
  semilla: number;
  /** Unidades de t por segundo real. */
  tau: number;
  fRef: number;
  delta: number;
  /** Velocidad angular de la rueda (rad por unidad de t) o null sin rueda. */
  omegaRueda: number | null;
  /** Clave de lo que obliga a recrear las partículas (dominio, n, semilla). */
  clave: string;
  /**
   * Clave del campo (expresiones y parámetros). En marcha, las partículas siguen moviéndose
   * con el campo nuevo (sin saltos al arrastrar un parámetro); en pausa o con el reloj
   * congelado se recrean, para que la estela inmóvil muestre el sentido del campo vigente.
   */
  claveCampo: string;
}

export interface FotogramaAnimacion {
  sistema: SistemaParticulas | null;
  anguloRueda: number;
}

/** Paso de los fotogramas de relleno inicial y del reloj determinista. */
export const PASO_FIJO = 1 / 60;
/** La estela guarda una posición cada 3 fotogramas: 12 posiciones ≈ 0.6 s de recorrido. */
const PASOS_POR_PUNTO = 3;
const DT_MAX = 1 / 20;

export class Animacion {
  private config: ConfigAnimacion | null = null;
  private sistema: SistemaParticulas | null = null;
  private raf = 0;
  private ultimo = 0;
  private marcha = false;
  /** t del experimento transcurrido con la animación en marcha (o con el reloj fijo). */
  tiempo = 0;
  anguloRueda = 0;

  private alFotograma: ((f: FotogramaAnimacion) => void) | null = null;

  constructor(private readonly congelada: boolean) {}

  /** Destino de cada fotograma (la escena); al fijarlo recibe el estado actual. */
  fijarSalida(fn: ((f: FotogramaAnimacion) => void) | null): void {
    this.alFotograma = fn;
    this.emitir();
  }

  get enMarcha(): boolean {
    return this.marcha;
  }

  get particulas(): SistemaParticulas | null {
    return this.sistema;
  }

  get tau(): number | null {
    return this.config?.tau ?? null;
  }

  configurar(c: ConfigAnimacion | null): void {
    const campoNuevo = c?.claveCampo !== this.config?.claveCampo;
    const recrear = !c || c.clave !== this.config?.clave || c.n !== (this.sistema?.n ?? 0) || (campoNuevo && (!this.marcha || this.congelada));
    this.config = c;
    if (recrear) {
      this.sistema = c && c.n > 0 ? new SistemaParticulas({ n: c.n, semilla: c.semilla, dominio: c.dominio, pasosPorPunto: PASOS_POR_PUNTO }) : null;
      // Estela inicial: el sentido se ve aunque la animación arranque en pausa.
      if (this.sistema && c) for (let k = 0; k < this.sistema.largoEstela * PASOS_POR_PUNTO; k++) this.sistema.avanzar(c.campo.F, c.p, PASO_FIJO, c.tau, c.fRef, c.delta);
    }
    if (!c || c.omegaRueda === null) this.anguloRueda = 0;
    this.emitir();
    this.programar();
  }

  fijarEnMarcha(marcha: boolean): void {
    if (marcha === this.marcha) return;
    this.marcha = marcha;
    // El reloj cuenta desde que se reanuda: el primer fotograma ya avanza.
    this.ultimo = performance.now();
    this.programar();
  }

  /** Avanza dtReal segundos reales: partículas (RK4) y rueda (analítica). */
  avanzar(dtReal: number): void {
    const c = this.config;
    if (!c) return;
    if (this.sistema) this.sistema.avanzar(c.campo.F, c.p, dtReal, c.tau, c.fRef, c.delta);
    if (c.omegaRueda !== null) this.anguloRueda += c.omegaRueda * c.tau * dtReal;
    this.tiempo += c.tau * dtReal;
    this.emitir();
  }

  /** Reloj determinista: `segundos` en pasos fijos de 1/60 s (pruebas y capturas). */
  avanzarFijo(segundos: number): void {
    const pasos = Math.round(segundos / PASO_FIJO);
    for (let k = 0; k < pasos; k++) this.avanzar(PASO_FIJO);
  }

  private emitir(): void {
    this.alFotograma?.({ sistema: this.sistema, anguloRueda: this.anguloRueda });
  }

  private programar(): void {
    const activa = this.marcha && !this.congelada && !!this.config && (!!this.sistema || this.config.omegaRueda !== null);
    if (!activa) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      return;
    }
    if (this.raf) return;
    this.raf = requestAnimationFrame((t) => this.fotograma(t));
  }

  private fotograma(t: number): void {
    this.raf = 0;
    if (this.ultimo > 0) this.avanzar(Math.min(DT_MAX, (t - this.ultimo) / 1000));
    this.ultimo = t;
    this.programar();
  }

  destruir(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.config = null;
    this.sistema = null;
  }
}

/** Datos de la rueda en P: eje = sentido de ∇×F(P), ω = ½‖∇×F(P)‖ (SPEC §3.4). */
export function datosRueda(rot: Vec3 | null): { eje: Vec3; omega: number } | null {
  if (!rot) return null;
  const m = Math.hypot(rot[0], rot[1], rot[2]);
  if (!(m > 0) || !Number.isFinite(m)) return null;
  return { eje: [rot[0] / m, rot[1] / m, rot[2] / m], omega: m / 2 };
}
