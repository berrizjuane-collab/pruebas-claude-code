/** Tipos de los datos generados por el pipeline (public/data/*.json). */

export type RingName = 'core' | 'context' | 'far';
export type Certainty = 'documentado' | 'aproximado' | 'reconstruido';
export type PoiCategory = 'campamento' | 'hito' | 'sector' | 'umbral' | 'cumbre' | 'geografia';

export interface GridSpec {
  archivo: string;
  espaciado: number;
  semilado: number;
  muestras: number;
  filaCero: 'norte';
  remuestreo: string;
  rango: [number, number];
}

export interface ImageryLevel {
  albedo: string;
  mascaras: string;
  resolucion: number;
  resolucionMascaras: number;
  semilado: number;
  pixeles: number;
  nubesPct: number;
  baja_fiabilidadPct: number;
  nievePct: number;
}

export interface SourceRecord {
  url: string;
  archivo: string;
  bytes?: number;
  sha256: string;
  resolucion_m?: number;
}

export interface Manifest {
  version: number;
  sistema: {
    crs: string;
    descripcion: string;
    origen: { lat: number; lon: number };
    elipsoide: string;
    referenciaVertical: string;
    h0: number;
    nota: string;
  };
  alturas: { codificacion: string; offset: number; escala: number };
  rejillas: Record<RingName, GridSpec>;
  aux: { archivo: string; rejilla: 'core'; canales: Record<string, string>; clasesFLM: Record<string, string> };
  cumbre: {
    altitudReferencia: number;
    coordenadaPublicada: { lat: number; lon: number };
    modelo: { x: number; y: number; lat: number; lon: number; alturaDEMRemuestreada: number };
    pixelMaximoDEM: { lat: number; lon: number; altura: number };
    distanciaACoordenadaPublicada: number;
    correccion: { tipo: string; incrementoMaximo: number; radio: number; perfil: string; motivo: string };
  };
  procedencia: { nucleo: Record<string, number>; nucleoSobre7000m: Record<string, number> };
  celdasRellenadas: Record<string, number>;
  fuentesTerreno: SourceRecord[];
  imagen: {
    escena: string;
    fecha: string;
    solAzimut: number;
    solElevacion: number;
    nubosidadTesela: number;
    atribucion: string;
    metodo: string;
    niveles: Record<RingName, ImageryLevel>;
    fuentes: SourceRecord[];
  };
  rutas: { archivo: string; validacion: Record<string, SegmentValidation> };
  poi: { archivo: string; total: number };
  serac: { archivo: string };
}

export interface SegmentValidation {
  longitud_m: number;
  altMin: number;
  altMax: number;
  inclinacionMax: number;
  dentroDelNucleo: boolean;
}

export interface RouteSegment {
  nombre: string;
  metodo: 'cresta' | 'glaciar' | 'directo';
  certeza: Certainty;
  nota: string;
  control: [number, number][];
  /** [x este, y norte, altitud del modelo] */
  puntos: [number, number, number][];
  validacion: SegmentValidation;
}

export interface RouteDef {
  nombre: string;
  nombreCorto: string;
  nombreIngles: string;
  color: string;
  patron: 'continuo' | 'discontinuo';
  habitual: boolean;
  descripcion: string;
  tramos: string[];
}

export interface RoutesFile {
  nota: string;
  tramos: Record<string, RouteSegment>;
  rutas: Record<string, RouteDef>;
}

export interface Reference {
  id: string;
  titulo: string;
  editor: string;
  url: string;
  uso: string;
}

export interface Poi {
  id: string;
  nombre: string;
  nombreCorto?: string;
  nombreIngles?: string;
  categoria: PoiCategory;
  rutas: string[];
  altitudRef?: { valor: number; min?: number; max?: number; exacta?: boolean };
  certeza: Certainty;
  prioridad: number;
  descripcion: string;
  refs: string[];
  posicion: { x: number; y: number; altModelo: number };
  geo: { lat: number; lon: number };
  metodoColocacion: string;
  diferenciaModeloRef?: number;
}

export interface PoisFile {
  referencias: Reference[];
  poi: Poi[];
}

export interface SeracFile {
  /** [x, y, altitud del DEM] de la línea base del frente */
  linea: [number, number, number][];
  /** vector horizontal unitario pendiente arriba en cada punto */
  pendienteArriba: [number, number][];
  alturaFrente: { min: number; max: number };
  fondo: number;
  vuelo: number;
  semilla: number;
  nota: string;
}

export interface AtlasData {
  manifest: Manifest;
  routes: RoutesFile;
  pois: PoisFile;
  serac: SeracFile;
}
