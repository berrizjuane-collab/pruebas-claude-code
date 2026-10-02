/**
 * Orquestador del cálculo (CMP-02, PLAN §1.6). Escucha el estado del experimento y decide
 * qué recalcular:
 *
 *   malla  ← campo, parámetros, dominio, muestreo, opciones de flechas (agrupado por fotograma)
 *   corte  ← campo, parámetros, dominio, corte, resolución              (agrupado por fotograma)
 *   líneas ← campo, parámetros, dominio, semillas, F_ref de la malla    (aplazado 120 ms)
 *
 * Una petición nueva cancela la anterior del mismo tipo (ClienteCalculo). El progreso de
 * las líneas se publica solo si el cálculo dura más de 300 ms. Las líneas esperan a que
 * llegue la malla del estado vigente y no se repiten si su clave (incluidas F_ref y Δ) no
 * cambia, por ejemplo al alternar la luminancia de las flechas.
 */
import type { ClienteCalculo } from '../compute/client';
import { corteDeFlechas, definicionCampo, peticionCorte, peticionLineas, peticionMalla, valores } from '../compute/peticiones';
import type { ResultadoCorte, ResultadoLineas, ResultadoMalla } from '../compute/protocol';
import type { EstadoExperimento } from '../state/schema';
import { crearAlmacen, type Almacen } from '../state/store';

export interface EstadoCalculo {
  malla: ResultadoMalla | null;
  lineas: ResultadoLineas | null;
  corte: ResultadoCorte | null;
  /** Progreso de las líneas (0–1) mientras se calculan, si tardan más de 300 ms. */
  progresoLineas: number | null;
  calculandoMalla: boolean;
  error: string | null;
  /** Parámetros con los que se calcularon las líneas aplicadas (coherencia y pruebas). */
  lineasConParametros: number[] | null;
  /** El usuario canceló el último cálculo de líneas (las mostradas no son las vigentes). */
  lineasCanceladas: boolean;
}

export const ESTADO_CALCULO_INICIAL: EstadoCalculo = {
  malla: null,
  lineas: null,
  corte: null,
  progresoLineas: null,
  calculandoMalla: false,
  error: null,
  lineasConParametros: null,
  lineasCanceladas: false,
};

const RETRASO_LINEAS = 120;
const UMBRAL_PROGRESO = 300;

const claveMalla = (e: EstadoExperimento) =>
  JSON.stringify([definicionCampo(e), valores(e), e.dominio, e.muestreo.n, e.muestreo.posicion, e.flechas, corteDeFlechas(e)]);
// «Flechas» y «Vector» del corte no cambian su muestreo (las flechas del plano van con la malla).
const claveCorte = (e: EstadoExperimento) =>
  JSON.stringify([definicionCampo(e), valores(e), e.dominio, e.corte.activo, e.corte.plano, e.corte.c, e.corte.escalar, e.muestreo.corteResolucion]);
const claveLineas = (e: EstadoExperimento) =>
  JSON.stringify([definicionCampo(e), valores(e), e.dominio, e.capas.lineas, e.lineas, e.lineas.semillas.tipo === 'punto' ? e.punto : null]);

export class Orquestador {
  readonly resultados: Almacen<EstadoCalculo>;
  private claves = { malla: '', corte: '', lineas: '' };
  /** Claves completas (con F_ref y Δ) de las líneas en curso y de las aplicadas. */
  private clavesLineas = { enCurso: '', aplicada: '' };
  /** Hay una malla pedida que aún no ha llegado: las líneas la esperan. */
  private mallaPendiente = false;
  private rafMalla = 0;
  private rafCorte = 0;
  private cortePedido = 0;
  private cortePendiente = false;
  private temporizadorLineas: ReturnType<typeof setTimeout> | null = null;
  private bajas: (() => void)[] = [];
  private activo = true;

  constructor(
    private readonly experimento: Almacen<EstadoExperimento>,
    private readonly cliente: ClienteCalculo,
    resultados?: Almacen<EstadoCalculo>,
  ) {
    this.resultados = resultados ?? crearAlmacen(ESTADO_CALCULO_INICIAL);
  }

  iniciar(): void {
    this.bajas.push(this.experimento.suscribir(() => this.alCambiar()));
    this.alCambiar();
  }

  detener(): void {
    this.activo = false;
    this.bajas.forEach((b) => b());
    cancelAnimationFrame(this.rafMalla);
    cancelAnimationFrame(this.rafCorte);
    if (this.temporizadorLineas) clearTimeout(this.temporizadorLineas);
  }

  /** Trabajos pedidos cuyo resultado aún no se ha aplicado (pruebas y estados de espera). */
  get pendiente(): { malla: boolean; lineas: boolean; corte: boolean } {
    return { malla: this.mallaPendiente, lineas: this.temporizadorLineas !== null || this.clavesLineas.enCurso !== '', corte: this.cortePendiente };
  }

  /** Cancela las líneas en curso (botón «Cancelar»). */
  cancelarLineas(): void {
    if (!this.clavesLineas.enCurso) return;
    this.cliente.cancelar('lineas');
    this.clavesLineas.enCurso = '';
    this.fijar({ progresoLineas: null, lineasCanceladas: true });
  }

  private fijar(cambio: Partial<EstadoCalculo>): void {
    if (this.activo) this.resultados.fijar((s) => ({ ...s, ...cambio }));
  }

  private alCambiar(): void {
    const e = this.experimento.obtener();
    const km = claveMalla(e);
    const mallaCambia = km !== this.claves.malla;
    if (mallaCambia) {
      this.claves.malla = km;
      this.mallaPendiente = true;
      cancelAnimationFrame(this.rafMalla);
      this.rafMalla = requestAnimationFrame(() => void this.lanzarMalla());
    }
    const kc = claveCorte(e);
    if (kc !== this.claves.corte) {
      this.claves.corte = kc;
      this.cortePendiente = true;
      cancelAnimationFrame(this.rafCorte);
      this.rafCorte = requestAnimationFrame(() => void this.lanzarCorte());
    }
    const kl = claveLineas(e);
    if (kl !== this.claves.lineas) {
      this.claves.lineas = kl;
      // Las líneas necesitan la F_ref de la malla: si la malla también cambia, se programan al llegar.
      if (!mallaCambia && this.resultados.obtener().malla) this.programarLineas();
    }
  }

  private async lanzarMalla(): Promise<void> {
    const e = this.experimento.obtener();
    this.fijar({ calculandoMalla: true });
    try {
      const r = await this.cliente.malla(peticionMalla(e));
      if (!r) return; // sustituida por otra petición
      this.mallaPendiente = false;
      this.fijar({ malla: r, calculandoMalla: false, error: null });
      this.programarLineas();
    } catch (error) {
      this.mallaPendiente = false;
      this.fijar({ calculandoMalla: false, error: mensajeDe(error) });
    }
  }

  private async lanzarCorte(): Promise<void> {
    const e = this.experimento.obtener();
    const n = ++this.cortePedido;
    if (!e.corte.activo) {
      this.cliente.cancelar('corte');
      this.cortePendiente = false;
      this.fijar({ corte: null });
      return;
    }
    try {
      const r = await this.cliente.corte(peticionCorte(e));
      // Una respuesta nula de una petición sustituida no cierra la espera: llegará la nueva.
      if (n === this.cortePedido) this.cortePendiente = false;
      if (r) this.fijar({ corte: r });
    } catch (error) {
      if (n === this.cortePedido) this.cortePendiente = false;
      this.fijar({ error: mensajeDe(error) });
    }
  }

  private programarLineas(): void {
    if (this.temporizadorLineas) clearTimeout(this.temporizadorLineas);
    this.temporizadorLineas = setTimeout(() => {
      this.temporizadorLineas = null;
      void this.lanzarLineas();
    }, RETRASO_LINEAS);
  }

  private async lanzarLineas(): Promise<void> {
    // La malla del estado vigente aún no ha llegado: su llegada volverá a programar las líneas.
    if (this.mallaPendiente) return;
    const e = this.experimento.obtener();
    const malla = this.resultados.obtener().malla;
    if (!e.capas.lineas || !malla) {
      this.cliente.cancelar('lineas');
      this.clavesLineas = { enCurso: '', aplicada: '' };
      this.fijar({ lineas: null, progresoLineas: null, lineasConParametros: null, lineasCanceladas: false });
      return;
    }
    const clave = JSON.stringify([claveLineas(e), malla.escala.ref, malla.deltaRef]);
    if (clave === this.clavesLineas.enCurso || (clave === this.clavesLineas.aplicada && this.resultados.obtener().lineas)) return;
    this.clavesLineas.enCurso = clave;
    const peticion = peticionLineas(e, malla);
    const t0 = performance.now();
    try {
      const r = await this.cliente.lineas(peticion, (f) => {
        if (performance.now() - t0 > UMBRAL_PROGRESO && this.clavesLineas.enCurso === clave) this.fijar({ progresoLineas: f });
      });
      if (!r) return; // cancelada o sustituida
      this.clavesLineas.aplicada = clave;
      this.fijar({ lineas: r, progresoLineas: null, lineasConParametros: peticion.p, lineasCanceladas: false });
    } catch (error) {
      this.fijar({ progresoLineas: null, error: mensajeDe(error) });
    } finally {
      if (this.clavesLineas.enCurso === clave) this.clavesLineas.enCurso = '';
    }
  }
}

const mensajeDe = (error: unknown) => (error instanceof Error ? error.message : String(error));
