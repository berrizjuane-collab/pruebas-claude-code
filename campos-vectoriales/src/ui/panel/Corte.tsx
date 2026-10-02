/**
 * Corte (DESIGN §5.3, sección 7; PLAN F6): plano, posición, flechas todas o solo en el
 * corte, vector completo o tangencial (con su nota fija) y escalar del mapa.
 */
import { memo } from 'react';
import type { Dominio } from '../../math/tipos';
import { EJES_PLANO, NOMBRE_EJE } from '../../math/tipos';
import type { EstadoExperimento } from '../../state/schema';
import { T } from '../../i18n/es';
import { Aviso } from '../controls/Aviso';
import { CampoNumerico, textoNumero } from '../controls/CampoNumerico';
import { Deslizador } from '../controls/Deslizador';
import { Interruptor } from '../controls/Interruptor';
import { ListaDesplegable } from '../controls/ListaDesplegable';
import { Seccion } from '../controls/Seccion';
import { Segmentado } from '../controls/Segmentado';

type Corte = EstadoExperimento['corte'];

interface Props {
  corte: Corte;
  dominio: Dominio;
  alCorte: (cambios: Partial<Corte>) => void;
}

function CorteBase({ corte, dominio, alCorte }: Props) {
  const k = EJES_PLANO[corte.plano].n;
  const lo = dominio.min[k] as number;
  const hi = dominio.max[k] as number;
  const eje = NOMBRE_EJE[k];
  const paso = Number(((hi - lo) / 100).toPrecision(2));
  const soloCorte = corte.flechas === 'corte';
  const apagado = !corte.activo;
  return (
    <Seccion
      titulo={T.corte.titulo}
      ayuda="cortes"
      datosPrueba="seccion-corte"
      control={<Interruptor etiqueta={T.corte.activar} sinTexto atajo="C" activado={corte.activo} alCambiar={(activo) => alCorte({ activo })} />}
    >
      <div className="fila-control">
        <span className="fila-etiqueta">{T.corte.plano}</span>
        <Segmentado
          etiqueta={T.corte.planoLargo}
          valor={corte.plano}
          opciones={[
            { valor: 'XY', texto: 'XY', etiqueta: T.corte.planoDe('XY') },
            { valor: 'XZ', texto: 'XZ', etiqueta: T.corte.planoDe('XZ') },
            { valor: 'YZ', texto: 'YZ', etiqueta: T.corte.planoDe('YZ') },
          ]}
          deshabilitado={apagado}
          motivo={T.corte.inactivo}
          alCambiar={(plano) => alCorte({ plano })}
        />
      </div>
      <div className="fila-control fila-posicion">
        <span className="fila-etiqueta num">{eje} =</span>
        <Deslizador
          etiqueta={T.corte.posicion(eje)}
          valor={corte.c}
          min={lo}
          max={hi}
          paso={paso}
          valorTexto={`${eje} = ${textoNumero(corte.c)}`}
          deshabilitado={apagado}
          motivo={T.corte.inactivo}
          alCambiar={(c) => alCorte({ c })}
        />
        <CampoNumerico
          etiqueta={T.corte.posicion(eje)}
          valor={corte.c}
          paso={paso}
          min={lo}
          max={hi}
          deshabilitado={apagado}
          motivo={T.corte.inactivo}
          alCambiar={(c) => alCorte({ c })}
          datosPrueba="corte-c"
        />
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.corte.flechas}</span>
        <Segmentado
          etiqueta={T.corte.flechasLargo}
          valor={corte.flechas}
          opciones={[
            { valor: 'todas', texto: T.corte.todas },
            { valor: 'corte', texto: T.corte.soloCorte },
          ]}
          deshabilitado={apagado}
          motivo={T.corte.inactivo}
          alCambiar={(flechas) => alCorte({ flechas })}
        />
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.corte.vector}</span>
        <Segmentado
          etiqueta={T.corte.vectorLargo}
          valor={corte.vector}
          opciones={[
            { valor: 'completo', texto: T.corte.completo },
            { valor: 'tangencial', texto: T.corte.tangencial },
          ]}
          deshabilitado={apagado || !soloCorte}
          motivo={apagado ? T.corte.inactivo : T.corte.vectorMotivo}
          alCambiar={(vector) => alCorte({ vector })}
        />
      </div>
      {corte.activo && soloCorte && corte.vector === 'tangencial' ? (
        <Aviso tipo="info" vivo={false} datosPrueba="nota-tangencial">
          {T.corte.notaTangencial}
        </Aviso>
      ) : null}
      <div className="fila-control">
        <span className="fila-etiqueta">{T.corte.escalar}</span>
        <ListaDesplegable
          etiqueta={T.corte.escalarLargo}
          valor={corte.escalar}
          opciones={[
            { valor: 'ninguno', texto: T.corte.ninguno },
            { valor: 'magnitud', texto: '|F|' },
            { valor: 'divergencia', texto: 'div F' },
            { valor: 'rotacional', texto: 'rot F · n' },
            { valor: 'normal', texto: 'F · n' },
          ]}
          deshabilitado={apagado}
          motivo={T.corte.inactivo}
          alCambiar={(escalar) => alCorte({ escalar })}
          datosPrueba="corte-escalar"
        />
      </div>
    </Seccion>
  );
}

export const Corte = memo(CorteBase);
