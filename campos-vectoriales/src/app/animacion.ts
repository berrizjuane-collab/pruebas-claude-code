/**
 * Animación del campo (REN-08, DESIGN §8; SPEC §3.6, §3.10, §5.8 y §5.11): partículas
 * trazadoras, rueda de paletas y, con un campo dependiente del tiempo, el reloj del
 * experimento, en el hilo principal. 1 s real ≙ τ unidades de t, con τ = Δ/F_ref por defecto
 * (una partícula con ‖F‖ = F_ref recorre una celda por segundo).
 *
 * - En marcha, un bucle `requestAnimationFrame` avanza con el tiempo real (como mucho 1/20 s
 *   por fotograma: al volver a la pestaña no hay saltos).
 * - Con un campo temporal (1.1) hay un único reloj (D-69): avanza t dentro de la ventana
 *   [inicio, fin] e integra las partículas con las etapas en su instante. Al llegar al final,
 *   con bucle vuelve al inicio y las partículas renacen; sin bucle, se detiene. Fijar t a mano
 *   también las hace renacer (SPEC §3.10).
 * - En modo captura (`?captura=1`) el reloj no avanza solo: es determinista y lo avanzan las
 *   pruebas con pasos fijos (`avanzarFijo`).
 * - Al crear el sistema se avanzan unos pasos para que la estela indique el sentido aunque la
 *   animación empiece en pausa (movimiento reducido). Con un campo temporal ese relleno
 *   empieza antes de t y termina en t: las partículas quedan en el instante del reloj.
 */
import { vectorEvaluacion, type CampoCompilado } from '../math/field';
import type { Dominio, Vec3 } from '../math/tipos';
import { SistemaParticulas } from '../numerics/particles';

export interface ConfigAnimacion {
  campo: CampoCompilado;
  /** Valores de los parámetros (sin el instante: el reloj lo pone en la última ranura, D-63). */
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
  /** Clave de lo que obliga a recrear las partículas (dominio, n, semilla, nacimiento). */
  clave: string;
  /**
   * Clave del campo (expresiones y parámetros). En marcha, las partículas siguen moviéndose
   * con el campo nuevo (sin saltos al arrastrar un parámetro); en pausa o con el reloj
   * congelado se recrean, para que la estela inmóvil muestre el sentido del campo vigente.
   */
  claveCampo: string;
  /** Instante del experimento: el reloj lo adopta al pasar de un campo estacionario a uno temporal. */
  t: number;
  /** Ventana del reloj si el campo depende del tiempo (null si es estacionario). */
  ventana: { inicio: number; fin: number; bucle: boolean } | null;
  /** Emisión desde semillas (líneas de traza, RF-25): 3·S coordenadas, o null (nacen en todo Ω). */
  semillas: Float64Array | null;
}

export interface FotogramaAnimacion {
  sistema: SistemaParticulas | null;
  anguloRueda: number;
  /** Instante del reloj. */
  t: number;
}

/** Paso de los fotogramas de relleno inicial y del reloj determinista. */
export const PASO_FIJO = 1 / 60;
/** La estela guarda una posición cada 3 fotogramas: 12 posiciones ≈ 0.6 s de recorrido. */
const PASOS_POR_PUNTO = 3;
const DT_MAX = 1 / 20;
/** Vida de las partículas emitidas desde semillas: la longitud de la línea de traza (s reales). */
const VIDA_EMISION = 20;

export class Animacion {
  private config: ConfigAnimacion | null = null;
  private sistema: SistemaParticulas | null = null;
  private raf = 0;
  private ultimo = 0;
  private marcha = false;
  /** Vector de evaluación de las partículas: parámetros y, en la última ranura, el instante. */
  private pEval: Float64Array = new Float64Array(1);
  /** Instante del reloj: t del experimento (con un campo temporal, dentro de la ventana). */
  tiempo = 0;
  anguloRueda = 0;

  private alFotograma: ((f: FotogramaAnimacion) => void) | null = null;
  /** Aviso de que el reloj se detuvo al llegar al final de la ventana sin bucle. */
  private alDetenerse: (() => void) | null = null;

  constructor(private readonly congelada: boolean) {}

  fijarAlDetenerse(fn: (() => void) | null): void {
    this.alDetenerse = fn;
  }

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

  /** ¿El reloj gobierna un campo dependiente del tiempo? */
  get temporal(): boolean {
    return !!this.config?.ventana;
  }

  configurar(c: ConfigAnimacion | null): void {
    const campoNuevo = c?.claveCampo !== this.config?.claveCampo;
    const temporalAntes = !!this.config?.ventana;
    const dominioAntes = this.config?.dominio;
    const recrear =
      !c ||
      c.clave !== this.config?.clave ||
      c.n !== (this.sistema?.n ?? 0) ||
      !!c.ventana !== temporalAntes ||
      (campoNuevo && (!this.marcha || this.congelada));
    this.config = c;
    if (c) {
      if (c.ventana && !temporalAntes) this.tiempo = c.t;
      if (c.ventana) this.tiempo = Math.min(c.ventana.fin, Math.max(c.ventana.inicio, this.tiempo));
      this.pEval = vectorEvaluacion(c.p, this.tiempo);
    }
    if (recrear) this.recrearParticulas();
    else if (c && this.sistema && dominioAntes && JSON.stringify(dominioAntes) !== JSON.stringify(c.dominio)) {
      // Ventana del espacio sin límites (SPEC §3.11): solo renacen las que quedan fuera.
      this.sistema.fijarDominio(c.dominio, this.sistema.emision ? c.semillas : undefined);
    }
    if (!c || c.omegaRueda === null) this.anguloRueda = 0;
    this.emitir();
    this.programar();
  }

  /** Fija el instante del reloj (deslizador, archivo, deshacer); las partículas renacen (D-69). */
  fijarTiempo(t: number): void {
    if (t === this.tiempo) return;
    this.tiempo = t;
    if (this.config?.ventana) this.recrearParticulas();
    this.emitir();
  }

  fijarEnMarcha(marcha: boolean): void {
    if (marcha === this.marcha) return;
    this.marcha = marcha;
    // El reloj cuenta desde que se reanuda: el primer fotograma ya avanza.
    this.ultimo = performance.now();
    this.programar();
  }

  /** Avanza dtReal segundos reales: reloj, partículas (RK4) y rueda (analítica). */
  avanzar(dtReal: number): void {
    const c = this.config;
    if (!c) return;
    const v = c.ventana;
    const dt = c.tau * dtReal;
    if (v && this.tiempo + dt > v.fin) {
      if (v.bucle) {
        // Vuelta al inicio: la historia no es continua a través del salto (SPEC §3.10).
        this.tiempo = v.inicio;
        this.recrearParticulas();
      } else {
        this.tiempo = v.fin;
        this.marcha = false;
        this.programar();
        this.alDetenerse?.();
      }
      this.emitir();
      return;
    }
    if (this.sistema) this.sistema.avanzar(c.campo.F, this.pEval, dtReal, c.tau, c.fRef, c.delta, v ? this.tiempo : undefined);
    if (c.omegaRueda !== null) this.anguloRueda += c.omegaRueda * dt;
    this.tiempo += dt;
    this.emitir();
  }

  /** Reloj determinista: `segundos` en pasos fijos de 1/60 s (pruebas y capturas). */
  avanzarFijo(segundos: number): void {
    const pasos = Math.round(segundos / PASO_FIJO);
    for (let k = 0; k < pasos; k++) this.avanzar(PASO_FIJO);
  }

  private recrearParticulas(): void {
    const c = this.config;
    this.sistema =
      c && c.n > 0
        ? new SistemaParticulas({
            n: c.n,
            semilla: c.semilla,
            dominio: c.dominio,
            pasosPorPunto: PASOS_POR_PUNTO,
            semillas: c.semillas,
            ...(c.semillas ? { vidaMax: VIDA_EMISION } : {}),
          })
        : null;
    if (!this.sistema || !c) return;
    // Estela inicial: el sentido se ve aunque la animación arranque en pausa. Con un campo
    // temporal, el relleno va de t − 36·τ/60 a t: las partículas quedan en el instante t.
    const pasos = this.sistema.largoEstela * PASOS_POR_PUNTO;
    const t0 = this.tiempo - pasos * PASO_FIJO * c.tau;
    for (let k = 0; k < pasos; k++) this.sistema.avanzar(c.campo.F, this.pEval, PASO_FIJO, c.tau, c.fRef, c.delta, c.ventana ? t0 + k * PASO_FIJO * c.tau : undefined);
  }

  private emitir(): void {
    this.alFotograma?.({ sistema: this.sistema, anguloRueda: this.anguloRueda, t: this.tiempo });
  }

  private programar(): void {
    const c = this.config;
    const activa = this.marcha && !this.congelada && !!c && (!!this.sistema || c.omegaRueda !== null || !!c.ventana);
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
