import { memo } from 'react';
import { Box, Scan } from 'lucide-react';
import type { Vista } from '../../render/camara';
import { T } from '../../i18n/es';
import { BotonIcono } from '../controls/Boton';

interface Props {
  alEncuadrar: () => void;
  alVista: (v: Vista) => void;
}

/** Barra de la escena (DESIGN §5.2): encuadre y vistas predefinidas, con atajos. */
function BarraEscenaBase({ alEncuadrar, alVista }: Props) {
  return (
    <div className="barra-escena flotante" data-flotante="barra-escena" role="toolbar" aria-label="Vistas de la cámara">
      <BotonIcono etiqueta={T.vistas.encuadrar} icono={Scan} tamanoIcono={18} atajo="R" onClick={alEncuadrar} />
      <span className="barra-escena-separador" aria-hidden="true" />
      {(['XY', 'XZ', 'YZ'] as const).map((v, i) => (
        <BotonIcono key={v} etiqueta={T.vistas[v]} texto={v} atajo={String(i + 1)} onClick={() => alVista(v)} />
      ))}
      <BotonIcono etiqueta={T.vistas.iso} icono={Box} tamanoIcono={18} atajo="4" onClick={() => alVista('iso')} />
    </div>
  );
}

export const BarraEscena = memo(BarraEscenaBase);
