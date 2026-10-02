/**
 * Gancho de pruebas (FND-02). Solo se expone con `?captura=1` o `?prueba=1`: permite a
 * Playwright esperar a que la aplicación esté lista, leer datos internos para comprobar la
 * coherencia (V-FUN-05/06) y preparar escenas reproducibles (VALIDATION §7.2).
 */
export interface GanchoPruebas {
  listo: boolean;
  modoCalculo?: string;
  [clave: string]: unknown;
}

declare global {
  interface Window {
    __campos?: GanchoPruebas;
  }
}

export function parametrosUrl(): URLSearchParams {
  return new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
}

export function modoPrueba(): boolean {
  const q = parametrosUrl();
  return q.has('captura') || q.has('prueba');
}

/** En modo captura las animaciones se congelan y el reloj es determinista. */
export function modoCaptura(): boolean {
  return parametrosUrl().has('captura');
}

export function publicarGancho(datos: Partial<GanchoPruebas>): void {
  if (!modoPrueba() || typeof window === 'undefined') return;
  window.__campos = { ...(window.__campos ?? { listo: false }), ...datos };
}
