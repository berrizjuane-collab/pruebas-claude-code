/**
 * Protocolo tipado entre el hilo principal y el worker de cálculo (CMP-01). Las
 * peticiones llevan la definición del campo como texto (el worker la compila y la guarda
 * en caché); las respuestas devuelven arrays tipados transferibles.
 */
import type { Dominio, EspecSemillas, Plano, Vec3 } from '../math/tipos';
import type { InstanciasFlechas, ModoLongitud, ModoLuminancia } from '../geometria/flechas';
import type { GeometriaLineas } from '../geometria/lineas';
import type { Escala } from '../numerics/grid';
import type { MotivoParada } from '../numerics/streamlines';
import type { MuestraCorte, TipoEscalar } from '../numerics/slice';

export interface DefinicionCampo {
  P: string;
  Q: string;
  R: string;
  parametros: string[];
}

export interface PeticionMalla {
  tipo: 'malla';
  id: number;
  campo: DefinicionCampo;
  p: number[];
  dominio: Dominio;
  n: [number, number, number];
  posicion: 'nodos' | 'centros';
  escala: { tipo: 'auto' } | { tipo: 'fija'; valor: number; /** Δ de la malla al fijarla (DESIGN §9.10). */ delta?: number };
  /** «Glifos: F · rot F» (DESIGN §9.1): qué vector dibujan las flechas. */
  glifos: 'campo' | 'rotacional';
  /** C_ref de los glifos de rot F. */
  escalaRot: { tipo: 'auto' } | { tipo: 'fija'; valor: number; delta?: number };
  flechas: { modo: ModoLongitud; luminancia: ModoLuminancia };
  /** Flechas «solo en el corte» (DESIGN §9.5): rejilla N×N del plano con la F_ref del volumen. */
  corte: { plano: Plano; c: number; vector: 'completo' | 'tangencial' } | null;
}

export interface FlechasCorte {
  instancias: InstanciasFlechas;
  lMax: number;
  deltaRef: number;
  total: number;
}

export interface PeticionLineas {
  tipo: 'lineas';
  id: number;
  campo: DefinicionCampo;
  p: number[];
  dominio: Dominio;
  semillas: EspecSemillas;
  paso: number | null;
  longitudMax: number | null;
  fRef: number;
  deltaRef: number;
  punto: Vec3 | null;
}

export interface PeticionCorte {
  tipo: 'corte';
  id: number;
  campo: DefinicionCampo;
  p: number[];
  dominio: Dominio;
  plano: Plano;
  c: number;
  M: number;
  escalar: TipoEscalar | null;
  L: number;
}

export type Peticion =
  | { tipo: 'ping'; id: number }
  | PeticionMalla
  | PeticionLineas
  | PeticionCorte
  | { tipo: 'cancelar'; id: number };

export interface ResultadoMalla {
  total: number;
  n: [number, number, number];
  deltaRef: number;
  pos: Float64Array;
  F: Float64Array;
  mag: Float64Array;
  clase: Uint8Array;
  recuento: { validos: number; ceros: number; noDefinidos: number; singulares: number };
  /** F_ref (siempre la de F: la usan las líneas y las partículas). */
  escala: Escala;
  /** Vector de los glifos dibujados y su escala (F_ref o C_ref). */
  glifos: 'campo' | 'rotacional';
  escalaGlifos: Escala;
  /** ∇×F en los nodos con «Glifos: rot F» (null con «Glifos: F»). */
  rot: { C: Float64Array; mag: Float64Array; clase: Uint8Array; recuento: ResultadoMalla['recuento'] } | null;
  lMax: number;
  instancias: InstanciasFlechas;
  corte: FlechasCorte | null;
  ms: number;
}

export interface ResultadoLineas {
  /** Puntos de todas las líneas, concatenados (3 por punto). */
  posiciones: Float32Array;
  /** inicio[i] … inicio[i+1] − 1: puntos de la línea i (n + 1 valores). */
  inicio: Uint32Array;
  /** Índice (dentro de la línea) del punto semilla. */
  semilla: Uint32Array;
  /** Motivos de parada: [atrás, adelante] por línea (índice en MOTIVOS; 255 = ninguno). */
  motivos: Uint8Array;
  longitudes: Float32Array;
  nLineas: number;
  semillas: { n: number; descartadas: { fuera: number; cero: number; noDefinido: number }; recortadas: number };
  recuentoMotivos: Partial<Record<MotivoParada, number>>;
  /** Se alcanzó el límite de vértices (SPEC §5.9). */
  limiteVertices: boolean;
  paso: number;
  /** Geometría para dibujar (segmentos, cheurones, semillas y marcas finales). */
  geometria: GeometriaLineas;
  ms: number;
}

/** Muestra del corte con la curva de nivel cero de su escalar (REN-06), si tiene signo. */
export type ResultadoCorte = MuestraCorte & { contorno: Float32Array | null; dominio: Dominio };

export type Respuesta =
  | { tipo: 'pong'; id: number }
  | { tipo: 'malla'; id: number; resultado: ResultadoMalla }
  | { tipo: 'lineas'; id: number; resultado: ResultadoLineas }
  | { tipo: 'corte'; id: number; resultado: ResultadoCorte }
  | { tipo: 'progreso'; id: number; fraccion: number }
  | { tipo: 'cancelado'; id: number }
  | { tipo: 'error'; id: number; mensaje: string };

/** Buffers transferibles de un resultado (se envían sin copiar). */
export function transferibles(r: Respuesta): Transferable[] {
  const t: Transferable[] = [];
  const add = (...a: (ArrayBufferView | undefined)[]) => {
    for (const v of a) if (v && !t.includes(v.buffer as ArrayBuffer)) t.push(v.buffer as ArrayBuffer);
  };
  if (r.tipo === 'malla') {
    const m = r.resultado;
    for (const i of [m.instancias, m.corte?.instancias]) {
      if (i) add(i.cola, i.dir, i.largo, i.cono, i.radioCono, i.radio, i.gris, i.saturada, i.nodo, i.ceros, i.indefinidos);
      const a = i?.anillos;
      if (a) add(a.centro, a.radio, a.punta, a.tangente, a.largoPunta, a.radioPunta);
    }
    add(m.pos, m.F, m.mag, m.clase, m.rot?.C, m.rot?.mag, m.rot?.clase);
  } else if (r.tipo === 'lineas') {
    const l = r.resultado;
    const g = l.geometria;
    add(l.posiciones, l.inicio, l.semilla, l.motivos, l.longitudes, g.segmentos, g.cheurones, g.tangentes, g.semillas, g.finales, g.formasFinales);
  } else if (r.tipo === 'corte') {
    const c = r.resultado;
    add(c.pos, c.F, c.Fpar, c.Fn, c.mag, c.clase, c.escalar?.valores, c.escalar?.estado, c.contorno ?? undefined);
  }
  return t;
}
