export declare const TOLERANCIA_PALETA: number;
export interface InformePaleta {
  ancho: number;
  alto: number;
  pixeles: number;
  fuera: number;
  maxDiff: number;
  tolerancia: number;
  ejemplos: { x: number; y: number; rgb: [number, number, number] }[];
  superada: boolean;
}
export declare function auditarPaleta(buffer: Buffer, tolerancia?: number): InformePaleta;
export declare function estadisticasLuminancia(buffer: Buffer): { media: number; desviacion: number };
