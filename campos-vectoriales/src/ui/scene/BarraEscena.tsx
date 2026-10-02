import { memo } from 'react';
import { Box, Cone, Crosshair, Pause, Play, Scan, Square } from 'lucide-react';
import type { Vista } from '../../render/camara';
import { T } from '../../i18n/es';
import { BotonIcono } from '../controls/Boton';

interface Props {
  alEncuadrar: () => void;
  alVista: (v: Vista) => void;
  /** Proyección ortográfica activa (botón conmutador, tecla 5). */
  ortografica: boolean;
  alProyeccion: () => void;
  /** Animación del campo (partículas y rueda): en marcha, si hay algo que animar y conmutador. */
  animando: boolean;
  hayAnimacion: boolean;
  alAnimar: () => void;
  /** Inspeccionar un punto por coordenadas (tecla I, F7.1). */
  alInspeccionar: () => void;
}

/** Barra de la escena (DESIGN §5.2): encuadre, vistas predefinidas y pausa, con atajos. */
function BarraEscenaBase({ alEncuadrar, alVista, ortografica, alProyeccion, animando, hayAnimacion, alAnimar, alInspeccionar }: Props) {
  return (
    <div className="barra-escena flotante" data-flotante="barra-escena" role="toolbar" aria-label="Vistas y animación">
      <BotonIcono etiqueta={T.vistas.encuadrar} icono={Scan} tamanoIcono={18} atajo="R" onClick={alEncuadrar} />
      <span className="barra-escena-separador" aria-hidden="true" />
      {(['XY', 'XZ', 'YZ'] as const).map((v, i) => (
        <BotonIcono key={v} etiqueta={T.vistas[v]} texto={v} atajo={String(i + 1)} onClick={() => alVista(v)} />
      ))}
      <BotonIcono etiqueta={T.vistas.iso} icono={Box} tamanoIcono={18} atajo="4" onClick={() => alVista('iso')} />
      {/* Conmutador: la forma del icono cambia (cono = perspectiva, cuadrado = ortográfica) y aria-pressed lo anuncia. */}
      <BotonIcono
        etiqueta={T.vistas.ortografica}
        icono={ortografica ? Square : Cone}
        tamanoIcono={18}
        atajo="5"
        presionado={ortografica}
        onClick={alProyeccion}
        data-prueba="boton-proyeccion"
      />
      <span className="barra-escena-separador" aria-hidden="true" />
      <BotonIcono etiqueta={T.inspector.inspeccionar} icono={Crosshair} tamanoIcono={18} atajo="I" onClick={alInspeccionar} />
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
