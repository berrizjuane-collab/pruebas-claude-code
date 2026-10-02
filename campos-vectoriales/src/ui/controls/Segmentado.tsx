/**
 * Control segmentado (DESIGN §6.1): botones con `aria-pressed`; la opción elegida va
 * **invertida** (fondo claro, texto oscuro), una señal de forma además del tono.
 */
import type { Forzado } from './Boton';
import { useDescripcion } from './Descripcion';

export interface Opcion<V extends string> {
  valor: V;
  texto: string;
  /** Nombre accesible si `texto` es una abreviatura. */
  etiqueta?: string;
}

interface Props<V extends string> {
  etiqueta: string;
  opciones: readonly Opcion<V>[];
  valor: V;
  alCambiar: (v: V) => void;
  deshabilitado?: boolean;
  /** Por qué está deshabilitado (DESIGN §7). */
  motivo?: string;
  forzar?: { valor: V; estado: Forzado };
}

export function Segmentado<V extends string>({ etiqueta, opciones, valor, alCambiar, deshabilitado, motivo, forzar }: Props<V>) {
  const d = useDescripcion({ texto: motivo ?? '' });
  const conMotivo = deshabilitado && !!motivo;
  return (
    <div className="segmentado" role="group" aria-label={etiqueta} aria-disabled={deshabilitado || undefined}>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          className="segmentado-opcion"
          aria-pressed={o.valor === valor}
          aria-label={o.etiqueta}
          aria-disabled={deshabilitado || undefined}
          data-forzar={forzar?.valor === o.valor ? forzar.estado : undefined}
          {...(conMotivo ? d.props : {})}
          onClick={() => {
            if (!deshabilitado && o.valor !== valor) alCambiar(o.valor);
          }}
        >
          {o.texto}
        </button>
      ))}
      {conMotivo ? d.elemento : null}
    </div>
  );
}
