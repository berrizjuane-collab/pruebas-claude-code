/**
 * Visualización (DESIGN §5.3, sección 5; PLAN F5): capas de flechas, líneas de corriente y
 * partículas, y «Glifos: F · rot F», con sus atajos de una letra.
 */
import { memo } from 'react';
import type { Capa } from '../../state/actions';
import type { EstadoExperimento } from '../../state/schema';
import { T } from '../../i18n/es';
import { Interruptor } from '../controls/Interruptor';
import { Segmentado } from '../controls/Segmentado';

interface Props {
  capas: EstadoExperimento['capas'];
  alCapa: (capa: Capa, activa: boolean) => void;
  alGlifos: (g: EstadoExperimento['capas']['glifos']) => void;
}

function VisualizacionBase({ capas, alCapa, alGlifos }: Props) {
  return (
    <section className="seccion" aria-labelledby="titulo-visualizacion" data-prueba="visualizacion">
      <h2 className="seccion-titulo" id="titulo-visualizacion">
        {T.visualizacion.titulo}
      </h2>
      <div className="interruptores">
        <Interruptor etiqueta={T.visualizacion.flechas} atajo="F" activado={capas.flechas} alCambiar={(v) => alCapa('flechas', v)} />
        <Interruptor etiqueta={T.visualizacion.lineas} atajo="L" activado={capas.lineas} alCambiar={(v) => alCapa('lineas', v)} />
        <Interruptor etiqueta={T.visualizacion.particulas} atajo="P" activado={capas.particulas} alCambiar={(v) => alCapa('particulas', v)} />
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.visualizacion.glifos}</span>
        <Segmentado
          etiqueta={T.visualizacion.glifosLargo}
          valor={capas.glifos}
          opciones={[
            { valor: 'campo', texto: 'F', etiqueta: T.visualizacion.glifosCampo },
            { valor: 'rotacional', texto: 'rot F', etiqueta: T.visualizacion.glifosRot },
          ]}
          alCambiar={alGlifos}
        />
      </div>
    </section>
  );
}

export const Visualizacion = memo(VisualizacionBase);
