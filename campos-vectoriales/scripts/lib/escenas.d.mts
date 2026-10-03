import type { Page } from '@playwright/test';
/** Preparación de cada captura de VALIDATION §7.2 (y de las de evidencia de tareas anteriores). */
export declare const PREPARAR: Record<string, ((page: Page) => Promise<void>) | undefined>;
/** Capturas que son otra página (p. ej. C8 → `?muestras`). */
export declare const PAGINA: Record<string, string | undefined>;
/** Tamaños de pantalla V1–V5 (VALIDATION §7.1). */
export declare const TAMANOS: Record<'V1' | 'V2' | 'V3' | 'V4' | 'V5', { width: number; height: number; deviceScaleFactor: number }>;
export declare function esperarCalculo(page: Page): Promise<void>;
