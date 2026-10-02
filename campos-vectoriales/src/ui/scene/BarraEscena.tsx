import { memo } from 'react';
import { Box, Pause, Play, Scan } from 'lucide-react';
import type { Vista } from '../../render/camara';
import { T } from '../../i18n/es';
import { BotonIcono } from '../controls/Boton';

interface Props {
  alEncuadrar: () => void;
  alVista: (v: Vista) => void;
  /** Animación del campo (partículas y rueda): en marcha, si hay algo que animar y conmutador. */
  animando: boolean;
  hayAnimacion: boolean;
  alAnimar: () => void;
}

/** Barra de la escena (DESIGN §5.2): encuadre, vistas predefinidas y pausa, con atajos. */
function BarraEscenaBase({ alEncuadrar, alVista, animando, hayAnimacion, alAnimar }: Props) {
  return (
    <div className="barra-escena flotante" data-flotante="barra-escena" role="toolbar" aria-label="Vistas y animación">
      <BotonIcono etiqueta={T.vistas.encuadrar} icono={Scan} tamanoIcono={18} atajo="R" onClick={alEncuadrar} />
      <span className="barra-escena-separador" aria-hidden="true" />
      {(['XY', 'XZ', 'YZ'] as const).map((v, i) => (
        <BotonIcono key={v} etiqueta={T.vistas[v]} texto={v} atajo={String(i + 1)} onClick={() => alVista(v)} />
      ))}
      <BotonIcono etiqueta={T.vistas.iso} icono={Box} tamanoIcono={18} atajo="4" onClick={() => alVista('iso')} />
      <span className="barra-escena-separador" aria-hidden="true" />
      {/* Pausa / reanudar: siempre visible (DESIGN §8), con la tecla Espacio. */}
      <BotonIcono
        etiqueta={animando ? T.vistas.pausar : T.vistas.reanudar}
        icono={animando ? Pause : Play}
        tamanoIcono={18}
        atajo="Espacio"
        deshabilitado={!hayAnimacion}
        motivo={T.vistas.sinAnimacion}
        onClick={alAnimar}
        data-prueba="boton-animacion"
      />
    </div>
  );
}

export const BarraEscena = memo(BarraEscenaBase);
