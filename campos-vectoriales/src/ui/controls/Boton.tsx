/**
 * Botones (DESIGN §6.1): secundario, primario y fantasma, con icono opcional; botón solo
 * icono con `aria-label` obligatorio y descripción emergente con el atajo.
 *
 * Deshabilitado = `aria-disabled` (no `disabled`): sigue siendo enfocable para que la
 * descripción emergente pueda explicar el **motivo** (DESIGN §7) también con el teclado.
 */
import { forwardRef, type ButtonHTMLAttributes, type ComponentType, type ReactNode } from 'react';
import { useDescripcion, type Lado } from './Descripcion';

export type Icono = ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' }>;
/** Estados forzados en la galería (`?muestras`). */
export type Forzado = 'hover' | 'foco' | 'pulsado';

interface Comunes extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  deshabilitado?: boolean;
  /** Por qué está deshabilitado (obligatorio en la práctica: DESIGN §7). */
  motivo?: string;
  forzar?: Forzado;
  ladoDescripcion?: Lado;
}

interface PropsBoton extends Comunes {
  variante?: 'secundario' | 'primario' | 'fantasma';
  icono?: Icono;
  descripcion?: string;
  atajo?: string;
  children: ReactNode;
}

export const Boton = forwardRef<HTMLButtonElement, PropsBoton>(function Boton(
  { variante = 'secundario', icono: I, descripcion, atajo, deshabilitado, motivo, forzar, ladoDescripcion, className, onClick, children, ...resto },
  ref,
) {
  const texto = deshabilitado && motivo ? motivo : descripcion;
  const d = useDescripcion({ texto: texto ?? '', atajo, lado: ladoDescripcion });
  const conDescripcion = !!texto;
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`boton boton-${variante}${className ? ` ${className}` : ''}`}
        aria-disabled={deshabilitado || undefined}
        data-forzar={forzar}
        {...(conDescripcion ? d.props : {})}
        {...resto}
        onClick={(e) => {
          if (deshabilitado) {
            e.preventDefault();
            return;
          }
          onClick?.(e);
        }}
      >
        {I ? <I size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
        {children}
      </button>
      {conDescripcion ? d.elemento : null}
    </>
  );
});

interface PropsBotonIcono extends Comunes {
  /** Nombre accesible (y texto de la descripción emergente). */
  etiqueta: string;
  icono?: Icono;
  /** Texto corto en lugar de icono (p. ej. «XY»). */
  texto?: string;
  atajo?: string;
  tamanoIcono?: 16 | 18;
  presionado?: boolean;
}

export const BotonIcono = forwardRef<HTMLButtonElement, PropsBotonIcono>(function BotonIcono(
  { etiqueta, icono: I, texto, atajo, tamanoIcono = 16, presionado, deshabilitado, motivo, forzar, ladoDescripcion, className, onClick, ...resto },
  ref,
) {
  const d = useDescripcion({ texto: deshabilitado && motivo ? `${etiqueta}: ${motivo}` : etiqueta, atajo, lado: ladoDescripcion });
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`boton-icono${texto ? ' boton-texto-corto' : ''}${className ? ` ${className}` : ''}`}
        aria-label={etiqueta}
        aria-pressed={presionado}
        aria-disabled={deshabilitado || undefined}
        data-forzar={forzar}
        {...d.props}
        {...resto}
        onClick={(e) => {
          if (deshabilitado) {
            e.preventDefault();
            return;
          }
          onClick?.(e);
        }}
      >
        {I ? <I size={tamanoIcono} strokeWidth={1.5} aria-hidden="true" /> : texto}
      </button>
      {d.elemento}
    </>
  );
});
