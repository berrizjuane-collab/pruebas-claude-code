/**
 * Descarga de archivos exportados (EXP-01 y EXP-03) y su nombre (SPEC §7.1):
 * `campo-<nombre>-AAAAMMDD-HHMM.<ext>`, con la hora local.
 */

/** «Personalizado (desde Radial +)» → «personalizado-desde-radial»; vacío → «experimento». */
export function nombreSeguro(nombre: string): string {
  const s = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return s || 'experimento';
}

export function nombreArchivo(nombre: string, fecha: Date, extension: 'json' | 'png'): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  const sello = `${fecha.getFullYear()}${dos(fecha.getMonth() + 1)}${dos(fecha.getDate())}-${dos(fecha.getHours())}${dos(fecha.getMinutes())}`;
  return `campo-${nombreSeguro(nombre)}-${sello}.${extension}`;
}

/** Descarga un Blob con el nombre dado (enlace temporal con `download`). */
export function descargar(nombre: string, datos: Blob): void {
  const url = URL.createObjectURL(datos);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  // El navegador ya tiene el contenido; se libera después de que empiece la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
