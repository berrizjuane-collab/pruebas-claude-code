/**
 * Errores al abrir una configuración (F9, SPEC §7.2): lista por dato (`dominio.min[2]`) con
 * su mensaje, y la garantía de que el experimento actual no ha cambiado.
 */
import { OctagonAlert } from 'lucide-react';
import type { ErrorImportacion } from '../../state/persist';
import { T } from '../../i18n/es';
import { Boton } from '../controls/Boton';
import { Dialogo } from '../controls/Dialogo';

interface Props {
  archivo: string;
  errores: ErrorImportacion[];
  alCerrar: () => void;
  alElegirOtro: () => void;
}

export function DialogoErrores({ archivo, errores, alCerrar, alElegirOtro }: Props) {
  return (
    <Dialogo
      titulo={T.archivo.errorTitulo}
      cerrar={T.archivo.cerrar}
      alCerrar={alCerrar}
      datosPrueba="dialogo-errores"
      acciones={
        <>
          <Boton onClick={alElegirOtro}>{T.archivo.elegirOtro}</Boton>
          <Boton variante="primario" onClick={alCerrar} data-autofoco="">
            {T.archivo.cerrar}
          </Boton>
        </>
      }
    >
      <p className="dialogo-texto">
        <OctagonAlert size={16} strokeWidth={1.5} aria-hidden="true" />
        <span>
          <strong>Error: </strong>
          {T.archivo.errorTexto(archivo, errores.length)}
        </span>
      </p>
      <ul className="dialogo-errores" data-prueba="lista-errores">
        {errores.map((e, k) => (
          <li key={k}>
            <code className="num">{e.ruta === 'archivo' ? T.archivo.archivoEntero : e.ruta}</code>
            <span>{e.mensaje}</span>
          </li>
        ))}
      </ul>
    </Dialogo>
  );
}
