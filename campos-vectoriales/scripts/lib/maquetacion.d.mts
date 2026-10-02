export interface Incidencia {
  tipo: 'desplazamiento-horizontal' | 'solapamiento' | 'fuera-de-escena' | 'texto-recortado';
  detalle: string;
}
export interface InformeMaquetacion {
  incidencias: Incidencia[];
  flotantes: { nombre: string; x: number; y: number; ancho: number; alto: number; der: number; inf: number }[];
}
export declare function auditarMaquetacion(): InformeMaquetacion;
export declare function auditarTipografia(): { tamanos: number[]; pesos: number[]; familias: string[] };
export declare function auditarAlineacion(): { incidencias: { tipo: 'alineacion' | 'ritmo'; detalle: string }[]; anclajes: number };
export declare function auditarDensidad(): { scrollHeight: number; clientHeight: number; seccionesEnteras: string[]; interactivos: number } | null;
