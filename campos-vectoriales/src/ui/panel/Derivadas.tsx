/**
 * Divergencia y rotacional (DESIGN §5.3, sección 8; SPEC §3.4): expresiones simbólicas de
 * div F y rot F (con los términos semejantes agrupados) y accesos directos para verlos en la
 * escena: div F o (rot F)·n en el corte y «Glifos: rot F».
 */
import { memo, useMemo } from 'react';
import { divRotSimbolicos, type CampoCompilado } from '../../math/field';
import { agruparTerminos } from '../../math/expr/simplificar';
import { tex } from '../../math/expr/tex';
import type { ModoGlifos } from '../../state/schema';
import { T } from '../../i18n/es';
import { Boton } from '../controls/Boton';
import { Seccion } from '../controls/Seccion';
import { TeX } from '../TeX';

interface Props {
  campo: CampoCompilado | null;
  glifos: ModoGlifos;
  alVerEnCorte: (escalar: 'divergencia' | 'rotacional') => void;
  alGlifos: (g: ModoGlifos) => void;
}

const COMPONENTE = ['x', 'y', 'z'] as const;

function DerivadasBase({ campo, glifos, alVerEnCorte, alGlifos }: Props) {
  const simbolicas = useMemo(() => {
    if (!campo?.arbolesJ) return null;
    const d = divRotSimbolicos(campo.arbolesJ);
    const div = agruparTerminos(d.div);
    const rot = d.rot.map(agruparTerminos);
    const cero = (n: { tipo: string; valor?: number }) => n.tipo === 'num' && n.valor === 0;
    return { div: tex(div), rot: rot.map(tex), solenoidal: cero(div), irrotacional: rot.every(cero) };
  }, [campo]);
  return (
    <Seccion titulo={T.derivadas.titulo} datosPrueba="seccion-derivadas">
      {!campo ? (
        <p className="nota-seccion">{T.derivadas.sinCampo}</p>
      ) : !simbolicas ? (
        <p className="nota-seccion">{T.derivadas.sinSimbolica}</p>
      ) : (
        <div className="derivadas" data-prueba="derivadas">
          <div className="derivada" data-prueba="div-simbolica">
            <TeX tex={`\\nabla\\cdot\\mathbf F = ${simbolicas.div}`} />
          </div>
          {simbolicas.rot.map((r, i) => (
            <div className="derivada" key={i} data-prueba={`rot-simbolico-${COMPONENTE[i]}`}>
              <TeX tex={`(\\nabla\\times\\mathbf F)_${COMPONENTE[i]} = ${r}`} />
            </div>
          ))}
          {simbolicas.solenoidal ? <p className="nota-seccion">{T.derivadas.solenoidal}</p> : null}
          {simbolicas.irrotacional ? <p className="nota-seccion">{T.derivadas.irrotacional}</p> : null}
        </div>
      )}
      <div className="acciones-derivadas">
        <Boton variante="secundario" onClick={() => alVerEnCorte('divergencia')}>
          {T.derivadas.verDiv}
        </Boton>
        <Boton variante="secundario" onClick={() => alVerEnCorte('rotacional')}>
          {T.derivadas.verRot}
        </Boton>
        <Boton
          variante="secundario"
          aria-pressed={glifos === 'rotacional'}
          onClick={() => alGlifos(glifos === 'rotacional' ? 'campo' : 'rotacional')}
        >
          {T.derivadas.glifosRot}
        </Boton>
      </div>
    </Seccion>
  );
}

export const Derivadas = memo(DerivadasBase);
