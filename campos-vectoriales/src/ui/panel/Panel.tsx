import { memo, useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight, ChevronUp } from 'lucide-react';
import { CATALOGO, campoPorId, type IdCampo } from '../../math/catalog';
import { texCampo, type CampoCompilado } from '../../math/field';
import { texNombreParametro } from '../../math/expr/tex';
import { formatearCorto } from '../../numerics/format';
import type { EstadoExperimento } from '../../state/schema';
import { T } from '../../i18n/es';
import type { Dominio as TipoDominio } from '../../math/tipos';
import type { Almacen } from '../../state/store';
import type { Capa } from '../../state/actions';
import { TeX, TextoMat } from '../TeX';
import { Dominio } from './Dominio';
import { Ecuaciones } from './Ecuaciones';
import { Miniatura } from './Miniatura';
import { Parametros } from './Parametros';
import { Visualizacion } from './Visualizacion';
import { Avanzado } from './Avanzado';
import { Corte } from './Corte';
import { Derivadas } from './Derivadas';
import { Lineas, type DetallesLineas } from './Lineas';

/** Acciones del panel (las ejecuta App sobre el almacén). */
export interface AccionesPanel {
  alElegirCampo: (id: IdCampo) => void;
  alAplicarEcuaciones: (c: { P: string; Q: string; R: string }) => void;
  alAnadirParametroDesdeEcuacion: (nombre: string, borrador: { P: string; Q: string; R: string }) => void;
  alCambiarParametro: (nombre: string, valor: number) => void;
  alRangoParametro: (nombre: string, r: { min: number; max: number; paso: number }) => void;
  alRestablecerParametro: (nombre: string) => void;
  alEliminarParametro: (nombre: string) => void;
  alAnadirParametro: (nombre: string) => void;
  alDominio: (d: TipoDominio) => void;
  alMuestreo: (m: Partial<EstadoExperimento['muestreo']>) => void;
  alCapa: (capa: Capa, activa: boolean) => void;
  alGlifos: (g: EstadoExperimento['capas']['glifos']) => void;
  alFlechas: (cambios: Partial<EstadoExperimento['flechas']>) => void;
  alCorte: (cambios: Partial<EstadoExperimento['corte']>) => void;
  alLineas: (cambios: Partial<EstadoExperimento['lineas']>) => void;
  alParticulas: (cambios: Partial<EstadoExperimento['particulas']>) => void;
  alCifras: (cifras: number) => void;
}

interface Props {
  estado: EstadoExperimento;
  campo: CampoCompilado | null;
  acciones: AccionesPanel;
  edicionInvalida: Almacen<boolean>;
  /** F_ref y Δ de la malla vigente (para fijar la escala y la τ automática). */
  escalaActual: { fRef: number; delta: number } | null;
  /** Resumen del último cálculo de líneas («Detalles del cálculo»). */
  detallesLineas: DetallesLineas | null;
  /** Preferencia de teclado (no es parte del experimento). */
  atajos: boolean;
  alAtajos: (activos: boolean) => void;
  /**
   * Composición (DESIGN §5.4): columna lateral; cajón superpuesto (1024–1279 y 768–1023) u
   * hoja inferior (< 768) con una cabecera de 64 px con la fórmula que se despliega al 60 %.
   */
  modo: 'lateral' | 'cajon' | 'hoja';
  abierto: boolean;
  alConmutar: () => void;
}

function PanelBase({ estado, campo, acciones: a, edicionInvalida, escalaActual, detallesLineas, atajos, alAtajos, modo, abierto, alConmutar }: Props) {
  const verEnCorte = useCallback((escalar: 'divergencia' | 'rotacional') => a.alCorte({ activo: true, escalar }), [a]);
  // Los nombres solo cambian al añadir o quitar parámetros (no con sus valores).
  const claveNombres = estado.parametros.map((p) => p.nombre).join('\u0000');
  const nombres = useMemo(() => (claveNombres ? claveNombres.split('\u0000') : []), [claveNombres]);
  // Con ecuaciones inválidas no se sabe qué parámetros se usan: se consideran todos en uso.
  const usados = useMemo(() => campo?.usados ?? new Set(nombres), [campo, nombres]);
  const oculto = modo !== 'lateral' && !abierto;
  return (
    <aside
      id="panel"
      className={`panel panel-${modo}`}
      data-region="panel"
      data-abierto={modo === 'lateral' || abierto}
      aria-label={T.panel.etiqueta}
      hidden={modo === 'cajon' && !abierto}
    >
      {modo === 'hoja' ? (
        <div className="hoja-cabecera">
          <button type="button" className="hoja-asa" aria-expanded={abierto} aria-controls="panel-cuerpo" onClick={alConmutar} data-prueba="boton-panel">
            <ChevronUp className="chevron" size={16} strokeWidth={1.5} aria-hidden="true" />
            <span>{abierto ? T.panel.ocultar : T.panel.mostrar}</span>
          </button>
          <div className="hoja-formula" aria-hidden="true" title={campo ? `F = (${campo.unicode.P}, ${campo.unicode.Q}, ${campo.unicode.R})` : undefined}>
            {campo ? <TeX tex={texCampo(campo)} /> : null}
          </div>
        </div>
      ) : null}
      <div id="panel-cuerpo" className="panel-cuerpo" hidden={oculto}>
        <SeccionCampo estado={estado} campo={campo} />
        <EjemplosMemo activo={estado.base} modificado={estado.modificado} alElegir={a.alElegirCampo} />
        <Ecuaciones
          campo={estado.campo}
          parametros={nombres}
          alAplicar={a.alAplicarEcuaciones}
          alAnadirParametro={a.alAnadirParametroDesdeEcuacion}
          edicionInvalida={edicionInvalida}
        />
        <Parametros
          parametros={estado.parametros}
          usados={usados}
          alCambiar={a.alCambiarParametro}
          alRango={a.alRangoParametro}
          alRestablecer={a.alRestablecerParametro}
          alEliminar={a.alEliminarParametro}
          alAnadir={a.alAnadirParametro}
        />
        <Visualizacion capas={estado.capas} alCapa={a.alCapa} alGlifos={a.alGlifos} />
        <Lineas lineas={estado.lineas} dominio={estado.dominio} hayPunto={estado.punto !== null} detalles={detallesLineas} alLineas={a.alLineas} />
        <Corte corte={estado.corte} dominio={estado.dominio} alCorte={a.alCorte} />
        <Derivadas campo={campo} glifos={estado.capas.glifos} alVerEnCorte={verEnCorte} alGlifos={a.alGlifos} />
        <Dominio dominio={estado.dominio} muestreo={estado.muestreo} alDominio={a.alDominio} alMuestreo={a.alMuestreo} />
        <Avanzado
          flechas={estado.flechas}
          particulas={estado.particulas}
          cifras={estado.cifras}
          tauActual={escalaActual ? escalaActual.delta / escalaActual.fRef : null}
          fRefActual={escalaActual?.fRef ?? null}
          deltaActual={escalaActual?.delta ?? null}
          alFlechas={a.alFlechas}
          alParticulas={a.alParticulas}
          alCifras={a.alCifras}
          atajos={atajos}
          alAtajos={alAtajos}
        />
      </div>
    </aside>
  );
}

/** El panel solo se vuelve a pintar si cambian sus datos (no en cada pintado de App). */
export const Panel = memo(PanelBase);

function SeccionCampo({ estado, campo }: { estado: EstadoExperimento; campo: CampoCompilado | null }) {
  const ficha = estado.base ? campoPorId(estado.base) : null;
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const idFicha = useId();
  return (
    <section className="seccion" aria-labelledby="titulo-campo">
      <div className="seccion-cabecera">
        <h2 className="seccion-titulo" id="titulo-campo">
          {T.panel.campo}
        </h2>
        {ficha ? (
          <button
            type="button"
            className="desplegable-cabecera ficha-boton"
            aria-expanded={fichaAbierta}
            aria-controls={idFicha}
            onClick={() => setFichaAbierta((a) => !a)}
          >
            {T.panel.sobreCampo}
            <ChevronRight className="chevron" size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="formula-campo" data-prueba="formula-campo">
        {campo ? <TeX tex={texCampo(campo)} bloque /> : null}
      </div>
      {estado.parametros.length ? (
        <p className="valores-parametros num">
          {estado.parametros.map((p, i) => (
            <span key={p.nombre}>
              {i > 0 ? ' · ' : ''}
              <TeX tex={`${texNombreParametro(p.nombre)} = ${formatearCorto(p.valor).replace('−', '-')}`} />
            </span>
          ))}
        </p>
      ) : null}
      {ficha ? <FichaCampo id={ficha.id} idCuerpo={idFicha} abierta={fichaAbierta} /> : null}
    </section>
  );
}

function FichaCampo({ id, idCuerpo, abierta }: { id: IdCampo; idCuerpo: string; abierta: boolean }) {
  const f = campoPorId(id).ficha;
  const filas: [string, string][] = [
    [T.panel.ficha.divergencia, f.divergencia],
    [T.panel.ficha.rotacional, f.rotacional],
    [T.panel.ficha.equilibrios, f.equilibrios],
    [T.panel.ficha.lineas, f.lineas],
    [T.panel.ficha.potencial, f.potencial],
    [T.panel.ficha.interpretacion, f.interpretacion],
    [T.panel.ficha.supuestos, f.supuestos],
  ];
  return (
    <div className="desplegable">
      <div id={idCuerpo} className="desplegable-cuerpo ficha" hidden={!abierta}>
        <p className="ficha-resumen">
          <TextoMat texto={f.resumen} />
        </p>
        <dl>
          {filas.map(([titulo, texto]) => (
            <div key={titulo} className="ficha-fila">
              <dt>{titulo}</dt>
              <dd>
                <TextoMat texto={texto} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function Ejemplos({ activo, modificado, alElegir }: { activo: IdCampo | null; modificado: boolean; alElegir: (id: IdCampo) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const indiceActivo = Math.max(0, CATALOGO.findIndex((c) => c.id === activo));
  const mover = (e: KeyboardEvent<HTMLDivElement>) => {
    const columnas = 3;
    const actual = refs.current.findIndex((b) => b === document.activeElement);
    if (actual < 0) return;
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columnas, ArrowUp: -columnas }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const n = CATALOGO.length;
    const siguiente = (actual + delta + n) % n;
    refs.current[siguiente]?.focus();
    const c = CATALOGO[siguiente];
    if (c) alElegir(c.id);
  };
  return (
    <section className="seccion" aria-labelledby="titulo-ejemplos">
      <h2 className="seccion-titulo" id="titulo-ejemplos">
        {T.panel.ejemplos}
      </h2>
      <div className="ejemplos" role="radiogroup" aria-labelledby="titulo-ejemplos" onKeyDown={mover}>
        {CATALOGO.map((c, i) => {
          const sel = c.id === activo;
          return (
            <button
              key={c.id}
              ref={(b) => {
                refs.current[i] = b;
              }}
              type="button"
              role="radio"
              aria-checked={sel}
              tabIndex={i === indiceActivo ? 0 : -1}
              className="tarjeta-ejemplo"
              data-campo={c.id}
              onClick={() => alElegir(c.id)}
            >
              <Miniatura id={c.id} />
              {/* Etiqueta visible corta; el nombre accesible la contiene y añade el completo (WCAG 2.5.3). */}
              <span className="tarjeta-nombre" aria-hidden="true">
                {c.nombreCorto}
              </span>
              <span className="solo-lector">{c.nombreCorto === c.nombre ? c.nombre : `${c.nombreCorto} (${c.nombre})`}</span>
              {sel ? (
                <span className="tarjeta-marca" aria-hidden="true">
                  {modificado ? '•' : '✓'}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const EjemplosMemo = memo(Ejemplos);
