/**
 * Avanzado (DESIGN §5.3, sección 10). Flechas: longitud proporcional o normalizada, escala
 * automática (P95) o fija, luminancia lineal o logarítmica (REN-04, DESIGN §9.3 y §9.10).
 */
import { memo } from 'react';
import type { EstadoExperimento } from '../../state/schema';
import { T } from '../../i18n/es';
import { CampoNumerico } from '../controls/CampoNumerico';
import { Seccion } from '../controls/Seccion';
import { Segmentado } from '../controls/Segmentado';

type Flechas = EstadoExperimento['flechas'];

interface Props {
  flechas: Flechas;
  /** F_ref y Δ de la malla vigente: al pasar a «fija» se congela este valor. */
  fRefActual: number | null;
  deltaActual: number | null;
  alFlechas: (cambios: Partial<Flechas>) => void;
}

function AvanzadoBase({ flechas, fRefActual, deltaActual, alFlechas }: Props) {
  const fija = flechas.escala.tipo === 'fija';
  return (
    <Seccion titulo={T.avanzado.titulo} datosPrueba="seccion-avanzado">
      <p className="subtitulo">{T.avanzado.flechas}</p>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.avanzado.longitud}</span>
        <Segmentado
          etiqueta={T.avanzado.longitudLargo}
          valor={flechas.modo}
          opciones={[
            { valor: 'proporcional', texto: T.avanzado.proporcional },
            { valor: 'normalizado', texto: T.avanzado.normalizada },
          ]}
          alCambiar={(modo) => alFlechas({ modo })}
        />
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.avanzado.escala}</span>
        <Segmentado
          etiqueta={T.avanzado.escalaLargo}
          valor={flechas.escala.tipo}
          opciones={[
            { valor: 'auto', texto: T.avanzado.auto },
            { valor: 'fija', texto: T.avanzado.fija },
          ]}
          deshabilitado={!fija && fRefActual === null}
          motivo={T.avanzado.sinMalla}
          alCambiar={(tipo) =>
            alFlechas({
              escala: tipo === 'auto' ? { tipo: 'auto' } : { tipo: 'fija', valor: fRefActual ?? 1, ...(deltaActual ? { delta: deltaActual } : {}) },
            })
          }
        />
        {flechas.escala.tipo === 'fija' ? (
          <CampoNumerico
            etiqueta={T.avanzado.valorFija}
            valor={flechas.escala.valor}
            paso={0.5}
            validar={(v) => (v > 0 ? null : T.avanzado.positivo)}
            alCambiar={(valor) => alFlechas({ escala: { ...flechas.escala, tipo: 'fija', valor } })}
            datosPrueba="escala-fija"
          />
        ) : null}
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.avanzado.luminancia}</span>
        <Segmentado
          etiqueta={T.avanzado.luminanciaLargo}
          valor={flechas.luminancia}
          opciones={[
            { valor: 'lineal', texto: T.avanzado.lineal },
            { valor: 'log', texto: T.avanzado.log },
          ]}
          alCambiar={(luminancia) => alFlechas({ luminancia })}
        />
      </div>
    </Seccion>
  );
}

export const Avanzado = memo(AvanzadoBase);
