/**
 * Líneas de corriente (DESIGN §5.3, sección 6; PLAN F5; SPEC §5.6–5.7): estrategia de semillas
 * (rejilla en un plano, aleatorias o desde P), paso h y longitud máxima (automáticos o fijos)
 * y «Detalles del cálculo» con el recuento por motivo de parada de cada rama.
 */
import { memo, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { EJES_PLANO, NOMBRE_EJE, type Dominio, type EspecSemillas, type Plano } from '../../math/tipos';
import { formatear } from '../../numerics/format';
import { MOTIVOS, type MotivoParada } from '../../numerics/streamlines';
import { motivoSemillas } from '../../state/actions';
import { LIMITES, type EstadoExperimento } from '../../state/schema';
import { T } from '../../i18n/es';
import { CampoNumerico } from '../controls/CampoNumerico';
import { Seccion } from '../controls/Seccion';
import { Segmentado } from '../controls/Segmentado';

type Lineas = EstadoExperimento['lineas'];

/** Resumen del último cálculo de líneas (para «Detalles del cálculo»). */
export interface DetallesLineas {
  nLineas: number;
  semillas: { n: number; descartadas: { fuera: number; cero: number; noDefinido: number }; recortadas: number };
  recuentoMotivos: Partial<Record<MotivoParada, number>>;
  vertices: number;
  limiteVertices: boolean;
  paso: number;
  ms: number;
}

interface Props {
  lineas: Lineas;
  dominio: Dominio;
  hayPunto: boolean;
  detalles: DetallesLineas | null;
  alLineas: (cambios: Partial<Lineas>) => void;
}

/** Coordenada del plano dentro de Ω: 0 si cabe y, si no, el centro. */
function cDentro(d: Dominio, plano: Plano, c: number): number {
  const k = EJES_PLANO[plano].n;
  const lo = d.min[k] as number;
  const hi = d.max[k] as number;
  return c >= lo && c <= hi ? c : lo <= 0 && 0 <= hi ? 0 : (lo + hi) / 2;
}

function LineasBase({ lineas, dominio, hayPunto, detalles, alLineas }: Props) {
  const s = lineas.semillas;
  const conSemillas = (semillas: EspecSemillas) => alLineas({ semillas });
  const cambiarEstrategia = (tipo: EspecSemillas['tipo']) => {
    if (tipo === s.tipo) return;
    if (tipo === 'rejilla') conSemillas({ tipo: 'rejilla', plano: 'XY', c: cDentro(dominio, 'XY', 0), nu: 4, nv: 4 });
    else if (tipo === 'aleatoria') conSemillas({ tipo: 'aleatoria', n: 32, semilla: 1 });
    else conSemillas({ tipo: 'punto' });
  };
  return (
    <Seccion titulo={T.lineas.titulo} ayuda="lineas" datosPrueba="seccion-lineas">
      <div className="fila-control">
        <span className="fila-etiqueta">{T.lineas.estrategia}</span>
        <Segmentado
          etiqueta={T.lineas.estrategiaLargo}
          valor={s.tipo}
          opciones={[
            { valor: 'rejilla', texto: T.lineas.rejilla },
            { valor: 'aleatoria', texto: T.lineas.aleatoria },
            { valor: 'punto', texto: T.lineas.desdeP, deshabilitada: !hayPunto, motivo: T.lineas.sinPunto },
          ]}
          alCambiar={cambiarEstrategia}
        />
      </div>
      {s.tipo === 'rejilla' ? <OpcionesRejilla s={s} dominio={dominio} alSemillas={conSemillas} /> : null}
      {s.tipo === 'aleatoria' ? (
        <>
          <div className="fila-control">
            <span className="fila-etiqueta">{T.lineas.numero}</span>
            <CampoNumerico
              etiqueta={T.lineas.numeroLargo}
              valor={s.n}
              min={1}
              max={LIMITES.semillasMax}
              validar={(v) => (Number.isInteger(v) ? null : T.avanzado.entero(1, LIMITES.semillasMax))}
              alCambiar={(n) => conSemillas({ ...s, n })}
              datosPrueba="semillas-n"
            />
          </div>
          <div className="fila-control">
            <span className="fila-etiqueta">{T.lineas.semilla}</span>
            <CampoNumerico
              etiqueta={T.lineas.semillaLargo}
              valor={s.semilla}
              min={0}
              validar={(v) => (Number.isInteger(v) ? null : T.avanzado.entero(0, 2 ** 31))}
              alCambiar={(semilla) => conSemillas({ ...s, semilla })}
              datosPrueba="semillas-semilla"
            />
          </div>
        </>
      ) : null}
      <div className="fila-control">
        <span className="fila-etiqueta">{T.lineas.paso}</span>
        <Segmentado
          etiqueta={T.lineas.pasoLargo}
          valor={lineas.paso === null ? 'auto' : 'fijo'}
          opciones={[
            { valor: 'auto', texto: T.lineas.pasoAuto },
            { valor: 'fijo', texto: T.lineas.fijo },
          ]}
          alCambiar={(v) => alLineas({ paso: v === 'auto' ? null : (detalles?.paso ?? 0.0625) })}
        />
        {lineas.paso !== null ? (
          <CampoNumerico
            etiqueta={T.lineas.valorPaso}
            valor={lineas.paso}
            paso={0.005}
            validar={(v) => (v > 0 ? null : T.lineas.positivo)}
            alCambiar={(paso) => alLineas({ paso })}
            datosPrueba="lineas-paso"
          />
        ) : null}
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.lineas.longitud}</span>
        <Segmentado
          etiqueta={T.lineas.longitudLargo}
          valor={lineas.longitudMax === null ? 'auto' : 'fija'}
          opciones={[
            { valor: 'auto', texto: T.lineas.longitudAuto },
            { valor: 'fija', texto: T.lineas.fija },
          ]}
          alCambiar={(v) => alLineas({ longitudMax: v === 'auto' ? null : 10 })}
        />
        {lineas.longitudMax !== null ? (
          <CampoNumerico
            etiqueta={T.lineas.valorLongitud}
            valor={lineas.longitudMax}
            paso={1}
            validar={(v) => (v > 0 ? null : T.lineas.positivo)}
            alCambiar={(longitudMax) => alLineas({ longitudMax })}
            datosPrueba="lineas-longitud"
          />
        ) : null}
      </div>
      <Detalles detalles={detalles} />
    </Seccion>
  );
}

function OpcionesRejilla({ s, dominio, alSemillas }: { s: Extract<EspecSemillas, { tipo: 'rejilla' }>; dominio: Dominio; alSemillas: (e: EspecSemillas) => void }) {
  const k = EJES_PLANO[s.plano].n;
  const eje = NOMBRE_EJE[k];
  const cambiarN = (cambio: Partial<typeof s>) => {
    const nuevo = { ...s, ...cambio };
    if (!motivoSemillas(nuevo)) alSemillas(nuevo);
  };
  const validarN = (otro: number) => (v: number) =>
    !Number.isInteger(v) || v < 1 ? T.avanzado.entero(1, LIMITES.semillasMax) : v * otro > LIMITES.semillasMax ? motivoSemillas({ ...s, nu: v, nv: otro }) : null;
  return (
    <>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.lineas.plano}</span>
        <Segmentado
          etiqueta={T.lineas.planoLargo}
          valor={s.plano}
          opciones={(['XY', 'XZ', 'YZ'] as const).map((p) => ({ valor: p, texto: p, etiqueta: T.lineas.planoDe(p) }))}
          // Otro plano: rejilla en toda la sección de Ω, a una altura dentro de Ω.
          alCambiar={(plano) => alSemillas({ tipo: 'rejilla', plano, c: cDentro(dominio, plano, s.c), nu: s.nu, nv: s.nv })}
        />
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta num">{eje} =</span>
        <CampoNumerico
          etiqueta={T.lineas.posicion(eje)}
          valor={s.c}
          paso={0.25}
          min={dominio.min[k] as number}
          max={dominio.max[k] as number}
          alCambiar={(c) => alSemillas({ ...s, c })}
          datosPrueba="semillas-c"
        />
      </div>
      <div className="fila-control fila-rejilla">
        <span className="fila-etiqueta">{T.lineas.puntos}</span>
        <CampoNumerico etiqueta={T.lineas.nu} valor={s.nu} min={1} max={LIMITES.semillasMax} validar={validarN(s.nv)} alCambiar={(nu) => cambiarN({ nu })} datosPrueba="semillas-nu" />
        <span className="fila-por" aria-hidden="true">
          ×
        </span>
        <CampoNumerico etiqueta={T.lineas.nv} valor={s.nv} min={1} max={LIMITES.semillasMax} validar={validarN(s.nu)} alCambiar={(nv) => cambiarN({ nv })} datosPrueba="semillas-nv" />
      </div>
    </>
  );
}

/** «Detalles del cálculo»: desplegable dentro de la sección (patrón *disclosure*). */
function Detalles({ detalles: d }: { detalles: DetallesLineas | null }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <div className="desplegable">
      <button type="button" className="desplegable-cabecera" aria-expanded={abierto} aria-controls={id} onClick={() => setAbierto((a) => !a)}>
        <ChevronRight className="chevron" size={14} strokeWidth={1.5} aria-hidden="true" />
        {T.lineas.detalles}
      </button>
      <div id={id} className="desplegable-cuerpo ficha detalles-cuerpo num" hidden={!abierto} data-prueba="detalles-lineas">
        {!d ? (
          <p>{T.lineas.sinCalculo}</p>
        ) : (
          <>
            <p>{T.lineas.nLineas(d.nLineas, d.semillas.n)}</p>
            <p>{T.lineas.descartadas(d.semillas.descartadas.fuera, d.semillas.descartadas.cero, d.semillas.descartadas.noDefinido)}</p>
            {d.semillas.recortadas > 0 ? <p>{T.lineas.recortadas(d.semillas.recortadas)}</p> : null}
            <p>
              {T.lineas.vertices(d.vertices.toLocaleString('es-ES'))} · {T.lineas.pasoUsado(formatear(d.paso, { cifras: 4 }))}
            </p>
            {d.limiteVertices ? <p>{T.lineas.limite}</p> : null}
            <p className="detalles-subtitulo">{T.lineas.motivos}</p>
            <dl className="detalles-motivos" data-prueba="motivos-parada">
              {MOTIVOS.filter((m) => (d.recuentoMotivos[m] ?? 0) > 0).map((m) => (
                <div key={m} data-motivo={m}>
                  <dt>{T.lineas.motivo[m]}</dt>
                  <dd>{d.recuentoMotivos[m]}</dd>
                </div>
              ))}
            </dl>
            <p>{T.lineas.tiempo(formatear(d.ms, { cifras: 3 }))}</p>
          </>
        )}
      </div>
    </div>
  );
}

export const Lineas = memo(LineasBase);
