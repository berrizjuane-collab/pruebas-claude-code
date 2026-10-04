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
 *
 * Con un campo dependiente del tiempo (1.1, D-70), el instante t entra en las tres claves.
 * Si **solo** cambia t (el reloj avanza), no se cancela nada: hay como mucho una petición en
 * curso por tipo y, al terminar, se pide la del instante más reciente; las líneas no esperan
 * los 120 ms ni a la malla (su F_ref, la de la ventana, no depende de t).
 */
import type { ClienteCalculo } from '../compute/client';
import { campoDependeDelTiempo, corteDeFlechas, definicionCampo, peticionCorte, peticionLineas, peticionMalla, valores } from '../compute/peticiones';
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

/** Ventana temporal: solo cuenta con un campo temporal (fija su escala, SPEC §3.10). */
const ventana = (e: EstadoExperimento) => (campoDependeDelTiempo(e) ? [e.tiempo.inicio, e.tiempo.fin] : null);
const claveMalla = (e: EstadoExperimento) =>
  JSON.stringify([definicionCampo(e), valores(e), e.dominio, e.muestreo.n, e.muestreo.posicion, e.flechas, e.capas.glifos, corteDeFlechas(e), ventana(e)]);
// «Flechas» y «Vector» del corte no cambian su muestreo (las flechas del plano van con la malla).
const claveCorte = (e: EstadoExperimento) =>
  JSON.stringify([definicionCampo(e), valores(e), e.dominio, e.corte.activo, e.corte.plano, e.corte.c, e.corte.escalar, e.muestreo.corteResolucion]);
const claveLineas = (e: EstadoExperimento) =>
  JSON.stringify([definicionCampo(e), valores(e), e.dominio, e.capas.lineas, e.lineas, e.lineas.semillas.tipo === 'punto' ? e.punto : null]);
/** Instante que entra en las claves: t con un campo temporal; nada con uno estacionario. */
const instanteClave = (e: EstadoExperimento) => (campoDependeDelTiempo(e) ? e.tiempo.t : null);

type Tipo = 'malla' | 'corte' | 'lineas';

export class Orquestador {
  readonly resultados: Almacen<EstadoCalculo>;
  private claves = { malla: '', corte: '', lineas: '' };
  /** Claves sin el instante: si no cambian y sí cambia t, el cambio es «solo t» (D-70). */
  private clavesSinT = { malla: '', corte: '', lineas: '' };
  /** Peticiones en curso por tipo (número de la última lanzada y si sigue en vuelo). */
  private vuelo: Record<Tipo, { n: number; activo: boolean; repetir: boolean }> = {
    malla: { n: 0, activo: false, repetir: false },
    corte: { n: 0, activo: false, repetir: false },
    lineas: { n: 0, activo: false, repetir: false },
  };
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

  /**
   * ¿Cambia la clave solo por el instante? Actualiza las claves guardadas y devuelve
   * 'no' (sin cambio), 't' (solo t) u 'otro'.
   */
  private comparar(tipo: Tipo, sinT: string, t: number | null): 'no' | 't' | 'otro' {
    const k = JSON.stringify([sinT, t]);
    if (k === this.claves[tipo]) return 'no';
    const soloT = sinT === this.clavesSinT[tipo];
    this.claves[tipo] = k;
    this.clavesSinT[tipo] = sinT;
    return soloT ? 't' : 'otro';
  }

  private alCambiar(): void {
    const e = this.experimento.obtener();
    const t = instanteClave(e);
    const cm = this.comparar('malla', claveMalla(e), t);
    if (cm !== 'no') {
      this.mallaPendiente = true;
      if (cm === 't' && this.vuelo.malla.activo) this.vuelo.malla.repetir = true;
      else {
        cancelAnimationFrame(this.rafMalla);
        this.rafMalla = requestAnimationFrame(() => void this.lanzarMalla());
      }
    }
    const cc = this.comparar('corte', claveCorte(e), t);
    if (cc !== 'no') {
      this.cortePendiente = true;
      if (cc === 't' && this.vuelo.corte.activo) this.vuelo.corte.repetir = true;
      else {
        cancelAnimationFrame(this.rafCorte);
        this.rafCorte = requestAnimationFrame(() => void this.lanzarCorte());
      }
    }
    const cl = this.comparar('lineas', claveLineas(e), t);
    if (cl === 't' && this.resultados.obtener().malla) {
      // Solo t: sin retardo ni espera de la malla; como mucho una en curso (D-70).
      if (this.vuelo.lineas.activo) this.vuelo.lineas.repetir = true;
      else void this.lanzarLineas(true);
    } else if (cl === 'otro') {
      // Las líneas necesitan la F_ref de la malla: si la malla también cambia, se programan al llegar.
      if (cm === 'no' && this.resultados.obtener().malla) this.programarLineas();
    }
  }

  /** Marca el inicio de una petición; devuelve su número. */
  private despegar(tipo: Tipo): number {
    const v = this.vuelo[tipo];
    v.activo = true;
    v.repetir = false;
    return ++v.n;
  }

  /** Fin de la petición n: si era la última y se pidió repetir (t avanzó), devuelve true. */
  private aterrizar(tipo: Tipo, n: number): boolean {
    const v = this.vuelo[tipo];
    if (n !== v.n) return false;
    v.activo = false;
    const repetir = v.repetir;
    v.repetir = false;
    return repetir && this.activo;
  }

  private async lanzarMalla(): Promise<void> {
    const e = this.experimento.obtener();
    const clave = this.claves.malla;
    const n = this.despegar('malla');
    this.fijar({ calculandoMalla: true });
    try {
      const r = await this.cliente.malla(peticionMalla(e));
      if (!r) return; // sustituida por otra petición
      // Si t avanzó mientras tanto, la espera sigue: llegará la del instante más reciente.
      if (clave === this.claves.malla) this.mallaPendiente = false;
      this.fijar({ malla: r, calculandoMalla: false, error: null });
      this.programarLineas();
    } catch (error) {
      this.mallaPendiente = false;
      this.fijar({ calculandoMalla: false, error: mensajeDe(error) });
    } finally {
      if (this.aterrizar('malla', n)) this.rafMalla = requestAnimationFrame(() => void this.lanzarMalla());
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
    const clave = this.claves.corte;
    const v = this.despegar('corte');
    try {
      const r = await this.cliente.corte(peticionCorte(e));
      // Una respuesta nula de una petición sustituida no cierra la espera: llegará la nueva.
      if (n === this.cortePedido && clave === this.claves.corte) this.cortePendiente = false;
      if (r) this.fijar({ corte: r });
    } catch (error) {
      if (n === this.cortePedido) this.cortePendiente = false;
      this.fijar({ error: mensajeDe(error) });
    } finally {
      if (this.aterrizar('corte', v)) this.rafCorte = requestAnimationFrame(() => void this.lanzarCorte());
    }
  }

  private programarLineas(): void {
    if (this.temporizadorLineas) clearTimeout(this.temporizadorLineas);
    this.temporizadorLineas = setTimeout(() => {
      this.temporizadorLineas = null;
      void this.lanzarLineas();
    }, RETRASO_LINEAS);
  }

  /**
   * Lanza las líneas del estado vigente. Con `soloT` (solo cambió el instante, D-70) no espera
   * a la malla, cuya F_ref y Δ no dependen de t, y no publica el progreso.
   */
  private async lanzarLineas(soloT = false): Promise<void> {
    // La malla del estado vigente aún no ha llegado: su llegada volverá a programar las líneas.
    if (this.mallaPendiente && !soloT) return;
    const e = this.experimento.obtener();
    const malla = this.resultados.obtener().malla;
    if (!e.capas.lineas || !malla) {
      this.cliente.cancelar('lineas');
      this.clavesLineas = { enCurso: '', aplicada: '' };
      this.fijar({ lineas: null, progresoLineas: null, lineasConParametros: null, lineasCanceladas: false });
      return;
    }
    const clave = JSON.stringify([claveLineas(e), instanteClave(e), malla.escala.ref, malla.deltaRef]);
    if (clave === this.clavesLineas.enCurso || (clave === this.clavesLineas.aplicada && this.resultados.obtener().lineas)) return;
    this.clavesLineas.enCurso = clave;
    const peticion = peticionLineas(e, malla);
    const t0 = performance.now();
    const v = this.despegar('lineas');
    try {
      const r = await this.cliente.lineas(peticion, (f) => {
        if (!soloT && performance.now() - t0 > UMBRAL_PROGRESO && this.clavesLineas.enCurso === clave) this.fijar({ progresoLineas: f });
      });
      if (!r) return; // cancelada o sustituida
      this.clavesLineas.aplicada = clave;
      this.fijar({ lineas: r, progresoLineas: null, lineasConParametros: peticion.p, lineasCanceladas: false });
    } catch (error) {
      this.fijar({ progresoLineas: null, error: mensajeDe(error) });
    } finally {
      if (this.clavesLineas.enCurso === clave) this.clavesLineas.enCurso = '';
      if (this.aterrizar('lineas', v)) void this.lanzarLineas(true);
    }
  }
}

const mensajeDe = (error: unknown) => (error instanceof Error ? error.message : String(error));
