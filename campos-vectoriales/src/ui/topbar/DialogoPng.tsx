/**
 * «Exportar ▾ → Imagen PNG…» (F9, SPEC §7.1): contenido y tamaño, vista previa de la
 * composición y botón primario «Exportar». El progreso se anuncia si tarda más de 300 ms.
 */
import { LoaderCircle } from 'lucide-react';
import { T } from '../../i18n/es';
import { Boton } from '../controls/Boton';
import { Dialogo } from '../controls/Dialogo';
import { Segmentado } from '../controls/Segmentado';

export type ContenidoPng = 'escena' | 'leyenda' | 'ecuaciones';
export type TamanoPng = 'pantalla' | 'fhd' | 'uhd';
export interface OpcionesPng {
  contenido: ContenidoPng;
  tamano: TamanoPng;
}

interface Props {
  opciones: OpcionesPng;
  /** Tamaño real de la imagen «como en pantalla». */
  pantalla: { ancho: number; alto: number };
  vistaPrevia: string | null;
  progreso: boolean;
  exportando: boolean;
  alCambiar: (o: OpcionesPng) => void;
  alExportar: () => void;
  alCerrar: () => void;
}

export function DialogoPng({ opciones, pantalla, vistaPrevia, progreso, exportando, alCambiar, alExportar, alCerrar }: Props) {
  const dims = opciones.tamano === 'pantalla' ? pantalla : opciones.tamano === 'fhd' ? { ancho: 1920, alto: 1080 } : { ancho: 3840, alto: 2160 };
  return (
    <Dialogo
      titulo={T.imagen.titulo}
      cerrar={T.imagen.cancelar}
      alCerrar={alCerrar}
      datosPrueba="dialogo-png"
      acciones={
        <>
          <Boton onClick={alCerrar}>{T.imagen.cancelar}</Boton>
          <Boton variante="primario" onClick={alExportar} deshabilitado={exportando} motivo={T.imagen.exportando} data-autofoco="">
            {T.imagen.exportar}
          </Boton>
        </>
      }
    >
      <div className="dialogo-campos">
        <div className="dialogo-campo">
          <span className="dialogo-etiqueta">{T.imagen.contenido}</span>
          <Segmentado
            etiqueta={T.imagen.contenido}
            valor={opciones.contenido}
            opciones={[
              { valor: 'escena', texto: T.imagen.escena },
              { valor: 'leyenda', texto: T.imagen.escenaLeyenda },
              { valor: 'ecuaciones', texto: T.imagen.escenaLeyendaEcuaciones },
            ]}
            alCambiar={(contenido) => alCambiar({ ...opciones, contenido })}
          />
        </div>
        <div className="dialogo-campo">
          <span className="dialogo-etiqueta">{T.imagen.tamano}</span>
          <Segmentado
            etiqueta={T.imagen.tamano}
            valor={opciones.tamano}
            opciones={[
              { valor: 'pantalla', texto: T.imagen.pantallaCorto, etiqueta: T.imagen.pantalla(pantalla.ancho, pantalla.alto) },
              { valor: 'fhd', texto: '1920 × 1080' },
              { valor: 'uhd', texto: '3840 × 2160' },
            ]}
            alCambiar={(tamano) => alCambiar({ ...opciones, tamano })}
          />
        </div>
      </div>
      <figure className="dialogo-vista-previa">
        {vistaPrevia ? <img src={vistaPrevia} alt={T.imagen.vistaPrevia} data-prueba="vista-previa-png" /> : <span>{T.imagen.preparando}</span>}
        <figcaption className="num">
          {dims.ancho} × {dims.alto} px
        </figcaption>
      </figure>
      <p className="dialogo-progreso" role="status" data-prueba="progreso-png">
        {progreso ? (
          <>
            <LoaderCircle size={14} strokeWidth={1.5} aria-hidden="true" className="girando" />
            {T.imagen.exportando}
          </>
        ) : null}
      </p>
    </Dialogo>
  );
}
