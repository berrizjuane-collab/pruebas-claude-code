/**
 * Interruptor (DESIGN §6.1, patrón ARIA *switch*). Apagado: contorno y mando hueco;
 * encendido: relleno claro y mando oscuro. El estado no depende del gris: la posición del
 * mando cambia y el lector de pantalla anuncia «activado».
 */
import type { Forzado } from './Boton';
import { useDescripcion } from './Descripcion';

interface Props {
  etiqueta: string;
  activado: boolean;
  alCambiar: (v: boolean) => void;
  deshabilitado?: boolean;
  motivo?: string;
  atajo?: string;
  forzar?: Forzado;
  /** Solo el mando, sin texto visible (el texto queda como nombre accesible). */
  sinTexto?: boolean;
}

export function Interruptor({ etiqueta, activado, alCambiar, deshabilitado, motivo, atajo, forzar, sinTexto }: Props) {
  const d = useDescripcion({ texto: deshabilitado && motivo ? motivo : etiqueta, atajo });
  const conDescripcion = (deshabilitado && !!motivo) || !!atajo;
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={activado}
        aria-disabled={deshabilitado || undefined}
        aria-label={sinTexto ? etiqueta : undefined}
        className="interruptor"
        data-forzar={forzar}
        {...(conDescripcion ? d.props : {})}
        onClick={() => {
          if (!deshabilitado) alCambiar(!activado);
        }}
      >
        <span className="interruptor-pista" aria-hidden="true">
          <span className="interruptor-mando" />
        </span>
        {sinTexto ? null : <span className="interruptor-texto">{etiqueta}</span>}
      </button>
      {conDescripcion ? d.elemento : null}
    </>
  );
}
