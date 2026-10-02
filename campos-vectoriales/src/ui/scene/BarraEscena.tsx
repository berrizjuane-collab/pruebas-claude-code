import { Box, Scan } from 'lucide-react';
import type { Vista } from '../../render/camara';
import { T } from '../../i18n/es';

interface Props {
  alEncuadrar: () => void;
  alVista: (v: Vista) => void;
}

/** Barra de la escena (DESIGN §5.2): encuadre y vistas predefinidas, con atajos. */
export function BarraEscena({ alEncuadrar, alVista }: Props) {
  return (
    <div className="barra-escena flotante" data-flotante="barra-escena" role="toolbar" aria-label="Vistas de la cámara">
      <button type="button" className="boton-icono" onClick={alEncuadrar} aria-label={T.vistas.encuadrar} data-ayuda={T.vistas.encuadrar}>
        <Scan size={18} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <span className="barra-escena-separador" aria-hidden="true" />
      {(['XY', 'XZ', 'YZ'] as const).map((v) => (
        <button key={v} type="button" className="boton-icono boton-texto-corto" onClick={() => alVista(v)} aria-label={T.vistas[v]} data-ayuda={T.vistas[v]}>
          {v}
        </button>
      ))}
      <button type="button" className="boton-icono" onClick={() => alVista('iso')} aria-label={T.vistas.iso} data-ayuda={T.vistas.iso}>
        <Box size={18} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
