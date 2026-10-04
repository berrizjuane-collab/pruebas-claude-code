/**
 * Avanzado (DESIGN §5.3, sección 10). Flechas: longitud proporcional o normalizada, escala
 * automática (P95) o fija, luminancia lineal o logarítmica (REN-04, DESIGN §9.3 y §9.10).
 * Partículas: número, escala temporal τ y semilla (REN-08). Cifras significativas. Teclado:
 * desactivar los atajos de una sola tecla (WCAG 2.1.4).
 */
import { memo } from 'react';
import { LIMITES, type EstadoExperimento } from '../../state/schema';
import { T } from '../../i18n/es';
import { CampoNumerico } from '../controls/CampoNumerico';
import { Interruptor } from '../controls/Interruptor';
import { Seccion } from '../controls/Seccion';
import { Segmentado } from '../controls/Segmentado';

type Flechas = EstadoExperimento['flechas'];
type Particulas = EstadoExperimento['particulas'];

interface Props {
  flechas: Flechas;
  particulas: Particulas;
  cifras: number;
  /** τ automática vigente (Δ/F_ref), para partir de ella al fijarla. */
  tauActual: number | null;
  alParticulas: (cambios: Partial<Particulas>) => void;
  alCifras: (cifras: number) => void;
  /** F_ref y Δ de la malla vigente: al pasar a «fija» se congela este valor. */
  fRefActual: number | null;
  deltaActual: number | null;
  alFlechas: (cambios: Partial<Flechas>) => void;
  /** Atajos de una tecla activos (WCAG 2.1.4: se pueden desactivar). */
  atajos: boolean;
  alAtajos: (activos: boolean) => void;
}

function AvanzadoBase({ flechas, particulas, cifras, tauActual, fRefActual, deltaActual, alFlechas, alParticulas, alCifras, atajos, alAtajos }: Props) {
  const fija = flechas.escala.tipo === 'fija';
  return (
    <Seccion titulo={T.avanzado.titulo} ayuda="supuestos-derivadas" datosPrueba="seccion-avanzado">
      <p className="subtitulo">{T.avanzado.flechas}</p>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.avanzado.grosor}</span>
        <Segmentado
          etiqueta={T.avanzado.grosorLargo}
          valor={flechas.grosor}
          opciones={[
            { valor: 'finas', texto: T.avanzado.finas },
            { valor: 'gruesas', texto: T.avanzado.gruesas },
          ]}
          alCambiar={(grosor) => alFlechas({ grosor })}
        />
      </div>
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
      <p className="subtitulo">{T.avanzado.particulas}</p>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.avanzado.numero}</span>
        <CampoNumerico
          etiqueta={T.avanzado.numeroLargo}
          valor={particulas.n}
          paso={50}
          min={1}
          max={LIMITES.particulasMax}
          validar={(v) => (Number.isInteger(v) ? null : T.avanzado.entero(1, LIMITES.particulasMax))}
          alCambiar={(n) => alParticulas({ n })}
          datosPrueba="particulas-n"
        />
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.avanzado.tau}</span>
        <Segmentado
          etiqueta={T.avanzado.tauLargo}
          valor={particulas.tau === null ? 'auto' : 'fija'}
          opciones={[
            { valor: 'auto', texto: T.avanzado.tauAuto },
            { valor: 'fija', texto: T.avanzado.fija },
          ]}
          alCambiar={(v) => alParticulas({ tau: v === 'auto' ? null : Number((tauActual ?? 0.2).toPrecision(3)) })}
        />
        {particulas.tau !== null ? (
          <CampoNumerico
            etiqueta={T.avanzado.tauValor}
            valor={particulas.tau}
            paso={0.05}
            validar={(v) => (v > 0 ? null : T.avanzado.positivo)}
            alCambiar={(tau) => alParticulas({ tau })}
            datosPrueba="particulas-tau"
          />
        ) : null}
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.avanzado.nacimiento}</span>
        <Segmentado
          etiqueta={T.avanzado.nacimientoLargo}
          valor={particulas.nacimiento}
          opciones={[
            { valor: 'dominio', texto: T.avanzado.nacenDominio, etiqueta: T.avanzado.nacenDominioLargo },
            { valor: 'semillas', texto: T.avanzado.nacenSemillas, etiqueta: T.avanzado.nacenSemillasLargo },
          ]}
          alCambiar={(nacimiento) => alParticulas({ nacimiento })}
        />
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.avanzado.semilla}</span>
        <CampoNumerico
          etiqueta={T.avanzado.semillaLargo}
          valor={particulas.semilla}
          min={0}
          validar={(v) => (Number.isInteger(v) ? null : T.avanzado.entero(0, 2 ** 31))}
          alCambiar={(semilla) => alParticulas({ semilla })}
          datosPrueba="particulas-semilla"
        />
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.avanzado.cifras}</span>
        <CampoNumerico
          etiqueta={T.avanzado.cifrasLargo}
          valor={cifras}
          min={2}
          max={8}
          validar={(v) => (Number.isInteger(v) ? null : T.avanzado.entero(2, 8))}
          alCambiar={alCifras}
          datosPrueba="cifras"
        />
      </div>
      <p className="subtitulo">{T.avanzado.teclado}</p>
      <Interruptor etiqueta={T.avanzado.atajosLetra} activado={atajos} alCambiar={alAtajos} />
    </Seccion>
  );
}

export const Avanzado = memo(AvanzadoBase);
