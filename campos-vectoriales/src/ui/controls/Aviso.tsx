/**
 * Mensajes de estado (DESIGN §2.3): sin color, con **icono + palabra + forma**.
 *
 *   error       octagon-alert · «Error:»  · borde continuo de 2 px
 *   aviso       triangle-alert · «Aviso:» · borde discontinuo de 1 px
 *   exito       circle-check (relleno) · «Listo:» · sin borde
 *   info        info · — · sin borde
 *   incompleta  info · «Incompleta:» · sin borde (estado informativo del editor, F2)
 */
import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

export type TipoAviso = 'error' | 'aviso' | 'exito' | 'info' | 'incompleta';

const ICONO = { error: OctagonAlert, aviso: TriangleAlert, exito: CircleCheck, info: Info, incompleta: Info } as const;
export const PALABRA: Record<TipoAviso, string> = { error: 'Error:', aviso: 'Aviso:', exito: 'Listo:', info: '', incompleta: 'Incompleta:' };

interface Props {
  tipo: TipoAviso;
  children: ReactNode;
  id?: string;
  /** Región viva: `alert` para errores, `status` para el resto; `false` si ya la anuncia otro elemento. */
  vivo?: boolean;
  /** Acción en línea (p. ej. «Añadir “k” como parámetro»). */
  accion?: ReactNode;
  /** En bloque con contenedor (forma de §2.3) o compacto bajo un campo. */
  forma?: 'bloque' | 'linea';
  datosPrueba?: string;
}

export function Aviso({ tipo, children, id, vivo = true, accion, forma = 'linea', datosPrueba }: Props) {
  const I = ICONO[tipo];
  const rol = vivo ? (tipo === 'error' ? 'alert' : 'status') : undefined;
  return (
    <div id={id} className={`aviso aviso-${tipo} aviso-${forma}`} role={rol} data-prueba={datosPrueba}>
      <I className="aviso-icono" size={16} strokeWidth={1.5} aria-hidden="true" />
      <p className="aviso-texto">
        {PALABRA[tipo] ? <strong className="aviso-palabra">{PALABRA[tipo]} </strong> : null}
        {children}
      </p>
      {accion ? <div className="aviso-accion">{accion}</div> : null}
    </div>
  );
}
