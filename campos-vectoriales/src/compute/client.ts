/**
 * Cliente del cálculo (CMP-01/CMP-02). Usa el worker incrustado (`?worker&inline`) para
 * que el HTML final sea autocontenido (RNF-14); si el navegador no permite crearlo o no
 * responde, ejecuta los mismos trabajos en el hilo principal (D-22).
 *
 * Cada tipo de trabajo (malla, líneas, corte) tiene como mucho una petición vigente: una
 * petición nueva cancela la anterior del mismo tipo, cuya promesa se resuelve con null.
 */
import TrabajadorCalculo from './worker.ts?worker&inline';
import type { Peticion, PeticionCorte, PeticionLineas, PeticionMalla, Respuesta, ResultadoCorte, ResultadoLineas, ResultadoMalla } from './protocol';
import { crearCeder, trabajoCorte, trabajoLineas, trabajoMalla } from './trabajos';

export type ModoCalculo = 'worker' | 'hilo-principal';
type TipoTrabajo = 'malla' | 'lineas' | 'corte';
type SinId<T> = T extends unknown ? Omit<T, 'id'> : never;

interface Pendiente {
  tipo: TipoTrabajo | 'ping';
  resolver: (r: unknown) => void;
  rechazar: (e: Error) => void;
  progreso?: (f: number) => void;
}

export class ClienteCalculo {
  private siguienteId = 1;
  private readonly pendientes = new Map<number, Pendiente>();
  private readonly vigente: Partial<Record<TipoTrabajo, number>> = {};
  private readonly canceladosLocales = new Set<number>();
  /** Cancelaciones enviadas y aún sin confirmar: id → [tipo, instante]. */
  private readonly cancelando = new Map<number, [TipoTrabajo, number]>();
  private readonly ceder = crearCeder();
  /** Latencias medidas entre la cancelación y la parada efectiva de cada trabajo (ms, CMP-02; últimas 50). */
  readonly medidasCancelacion: { tipo: TipoTrabajo; ms: number }[] = [];

  private constructor(
    private readonly trabajador: Worker | null,
    readonly modo: ModoCalculo,
  ) {
    trabajador?.addEventListener('message', (e: MessageEvent) => this.recibir(e.data as Respuesta));
    // Un fallo no capturado del worker no debe dejar promesas colgadas: se rechazan todas.
    trabajador?.addEventListener('error', (e: ErrorEvent) => {
      e.preventDefault();
      this.fallar(`el cálculo en segundo plano ha fallado (${e.message || 'sin detalles'})`);
    });
    trabajador?.addEventListener('messageerror', () => this.fallar('mensaje ilegible del cálculo en segundo plano'));
  }

  /** Crea el cliente: worker si responde en `msMax`, si no, hilo principal. */
  static async crear(msMax = 3000): Promise<ClienteCalculo> {
    let trabajador: Worker | null = null;
    try {
      trabajador = new TrabajadorCalculo();
    } catch {
      trabajador = null;
    }
    if (trabajador) {
      const responde = await new Promise<boolean>((resolver) => {
        const t = setTimeout(() => resolver(false), msMax);
        const alMensaje = (e: MessageEvent) => {
          if ((e.data as Respuesta).tipo === 'pong') {
            clearTimeout(t);
            trabajador?.removeEventListener('message', alMensaje);
            resolver(true);
          }
        };
        trabajador!.addEventListener('message', alMensaje);
        trabajador!.addEventListener('error', () => {
          clearTimeout(t);
          resolver(false);
        });
        trabajador!.postMessage({ tipo: 'ping', id: 0 } satisfies Peticion);
      });
      if (responde) return new ClienteCalculo(trabajador, 'worker');
      trabajador.terminate();
    }
    return new ClienteCalculo(null, 'hilo-principal');
  }

  /** Cliente que siempre calcula en el hilo principal (pruebas de equivalencia). */
  static local(): ClienteCalculo {
    return new ClienteCalculo(null, 'hilo-principal');
  }

  malla(p: SinId<PeticionMalla>): Promise<ResultadoMalla | null> {
    return this.enviar(p) as Promise<ResultadoMalla | null>;
  }

  lineas(p: SinId<PeticionLineas>, progreso?: (f: number) => void): Promise<ResultadoLineas | null> {
    return this.enviar(p, progreso) as Promise<ResultadoLineas | null>;
  }

  corte(p: SinId<PeticionCorte>): Promise<ResultadoCorte | null> {
    return this.enviar(p) as Promise<ResultadoCorte | null>;
  }

  /** Cancela el trabajo vigente de un tipo (su promesa se resuelve con null). */
  cancelar(tipo: TipoTrabajo): void {
    const id = this.vigente[tipo];
    if (id === undefined) return;
    delete this.vigente[tipo];
    const pendiente = this.pendientes.get(id);
    this.pendientes.delete(id);
    pendiente?.resolver(null);
    this.cancelando.set(id, [tipo, performance.now()]);
    if (this.trabajador) this.trabajador.postMessage({ tipo: 'cancelar', id } satisfies Peticion);
    else this.canceladosLocales.add(id);
  }

  terminar(): void {
    this.trabajador?.terminate();
    for (const p of this.pendientes.values()) p.resolver(null);
    this.pendientes.clear();
    this.cancelando.clear();
  }

  private fallar(mensaje: string): void {
    for (const p of this.pendientes.values()) p.rechazar(new Error(mensaje));
    this.pendientes.clear();
    this.cancelando.clear();
    for (const t of Object.keys(this.vigente) as TipoTrabajo[]) delete this.vigente[t];
  }

  private enviar(p: SinId<PeticionMalla | PeticionLineas | PeticionCorte>, progreso?: (f: number) => void): Promise<unknown> {
    this.cancelar(p.tipo);
    const id = this.siguienteId++;
    this.vigente[p.tipo] = id;
    const pet = { ...p, id } as PeticionMalla | PeticionLineas | PeticionCorte;
    return new Promise((resolver, rechazar) => {
      this.pendientes.set(id, { tipo: p.tipo, resolver, rechazar, progreso });
      if (this.trabajador) this.trabajador.postMessage(pet satisfies Peticion);
      else void this.ejecutarLocal(pet);
    });
  }

  private recibir(r: Respuesta): void {
    const cancelacion = r.tipo === 'progreso' ? undefined : this.cancelando.get(r.id);
    if (cancelacion) {
      // El trabajo cancelado ha parado (o ya había terminado): se mide la latencia.
      this.cancelando.delete(r.id);
      this.medidasCancelacion.push({ tipo: cancelacion[0], ms: performance.now() - cancelacion[1] });
      if (this.medidasCancelacion.length > 50) this.medidasCancelacion.shift();
    }
    const pendiente = this.pendientes.get(r.id);
    if (!pendiente) return;
    if (r.tipo === 'progreso') {
      pendiente.progreso?.(r.fraccion);
      return;
    }
    this.pendientes.delete(r.id);
    if (this.vigente[pendiente.tipo as TipoTrabajo] === r.id) delete this.vigente[pendiente.tipo as TipoTrabajo];
    if (r.tipo === 'error') pendiente.rechazar(new Error(r.mensaje));
    else if (r.tipo === 'cancelado') pendiente.resolver(null);
    else if (r.tipo === 'malla' || r.tipo === 'lineas' || r.tipo === 'corte') pendiente.resolver(r.resultado);
  }

  /** Respaldo en el hilo principal: mismos trabajos, misma interfaz. */
  private async ejecutarLocal(pet: PeticionMalla | PeticionLineas | PeticionCorte): Promise<void> {
    await this.ceder(); // asíncrono, como el worker
    if (this.canceladosLocales.delete(pet.id)) {
      this.recibir({ tipo: 'cancelado', id: pet.id });
      return;
    }
    try {
      if (pet.tipo === 'malla') this.recibir({ tipo: 'malla', id: pet.id, resultado: trabajoMalla(pet) });
      else if (pet.tipo === 'corte') this.recibir({ tipo: 'corte', id: pet.id, resultado: trabajoCorte(pet) });
      else {
        const resultado = await trabajoLineas(
          pet,
          async () => {
            await this.ceder();
            return this.canceladosLocales.has(pet.id);
          },
          (fraccion) => this.recibir({ tipo: 'progreso', id: pet.id, fraccion }),
        );
        this.recibir(resultado ? { tipo: 'lineas', id: pet.id, resultado } : { tipo: 'cancelado', id: pet.id });
      }
    } catch (e) {
      this.recibir({ tipo: 'error', id: pet.id, mensaje: e instanceof Error ? e.message : String(e) });
    } finally {
      this.canceladosLocales.delete(pet.id);
    }
  }
}
