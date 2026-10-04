/**
 * Vista libre (1.1, DESIGN §5.3 sección 9b; PLAN F11; SPEC RF-20 … RF-23): entrar en la vista
 * inmersiva, dilatación λ, multiplicador de la velocidad y espacio sin límites al entrar, con
 * el resumen de las teclas. Los cambios hechos dentro de la vista libre (+ −, rueda, U) se
 * guardan aquí también.
 */
import { memo } from 'react';
import { Expand } from 'lucide-react';
import type { EstadoExperimento } from '../../state/schema';
import { LIMITES } from '../../state/schema';
import { T } from '../../i18n/es';
import { Boton } from '../controls/Boton';
import { CampoNumerico } from '../controls/CampoNumerico';
import { Interruptor } from '../controls/Interruptor';
import { Seccion } from '../controls/Seccion';

interface Props {
  exploracion: EstadoExperimento['exploracion'];
  alExploracion: (cambios: Partial<EstadoExperimento['exploracion']>) => void;
  alEntrar: () => void;
}

const enRango = (v: number, a: number, b: number) => (v >= a && v <= b ? null : `Entre ${a} y ${b}`);

function ExploracionBase({ exploracion, alExploracion, alEntrar }: Props) {
  return (
    <Seccion titulo={T.vistaLibre.titulo} ayuda="vista-libre" datosPrueba="seccion-vista-libre">
      <Boton variante="secundario" icono={Expand} atajo="V" onClick={alEntrar} data-prueba="entrar-vista-libre">
        {T.vistaLibre.entrar}
      </Boton>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.vistaLibre.escala}</span>
        <CampoNumerico
          etiqueta={T.vistaLibre.escalaLargo}
          valor={exploracion.escala}
          paso={0.25}
          validar={(v) => enRango(v, LIMITES.escalaMin, LIMITES.escalaMax)}
          alCambiar={(escala) => alExploracion({ escala })}
          datosPrueba="exploracion-escala"
        />
        <span className="etiqueta-intermedia">{T.vistaLibre.velocidad}</span>
        <CampoNumerico
          etiqueta={T.vistaLibre.velocidadLargo}
          valor={exploracion.velocidad}
          paso={0.25}
          validar={(v) => enRango(v, LIMITES.velocidadMin, LIMITES.velocidadMax)}
          alCambiar={(velocidad) => alExploracion({ velocidad })}
          datosPrueba="exploracion-velocidad"
        />
      </div>
      <Interruptor etiqueta={T.vistaLibre.ilimitado} activado={exploracion.ilimitado} alCambiar={(ilimitado) => alExploracion({ ilimitado })} />
      <p className="nota-seccion">{T.vistaLibre.explicacion}</p>
      <p className="nota-seccion">{T.vistaLibre.explicacionEscala}</p>
    </Seccion>
  );
}

export const Exploracion = memo(ExploracionBase);
